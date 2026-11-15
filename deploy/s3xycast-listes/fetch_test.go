package main

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

const digest = "32970d95c47d8f5566bea95d61cd2fd01f9104d20091f88d58dc8240617c8893"

func listOf(version string) string {
	return fmt.Sprintf("{\n  \"version\": %q,\n  \"files\": {\n    \"/index.html\": %q,\n    \"/js/app.js\": %q\n  }\n}\n", version, digest, digest)
}

// A repository as GitHub serves one: its tags on the API, its files at a tag.
type fakeRepo struct {
	mu        sync.Mutex
	tags      []string          // "s3x-v0.1.5"
	lists     map[string]string // version → body
	pageSize  int               // tags per page; 0 = all at once
	etag      string
	asked     []string // what was asked, in order
	condition []string // the If-None-Match of each look at the tags
	gone      bool     // the repository answers 404
	status    int      // when set, what the tags answer
}

func (r *fakeRepo) handler(t *testing.T) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		r.mu.Lock()
		defer r.mu.Unlock()
		r.asked = append(r.asked, req.URL.Path)
		const tagsPath = "/repos/owner/name/git/matching-refs/tags/s3x-v"
		switch {
		case req.URL.Path == tagsPath:
			r.condition = append(r.condition, req.Header.Get("If-None-Match"))
			if r.gone {
				http.NotFound(w, req)
				return
			}
			if r.status != 0 {
				w.WriteHeader(r.status)
				return
			}
			page := 1
			fmt.Sscanf(req.URL.Query().Get("page"), "%d", &page)
			if page == 1 && r.etag != "" && req.Header.Get("If-None-Match") == r.etag {
				w.WriteHeader(http.StatusNotModified)
				return
			}
			from, to := 0, len(r.tags)
			if r.pageSize > 0 {
				from = (page - 1) * r.pageSize
				to = min(from+r.pageSize, len(r.tags))
				if to < len(r.tags) {
					w.Header().Set("Link", fmt.Sprintf(`<http://%s%s?per_page=100&page=%d>; rel="next", <http://%s%s?page=9>; rel="last"`, req.Host, tagsPath, page+1, req.Host, tagsPath))
				}
			}
			if r.etag != "" {
				w.Header().Set("ETag", r.etag)
			}
			var refs []string
			for _, tag := range r.tags[from:to] {
				refs = append(refs, fmt.Sprintf(`{"ref":"refs/tags/%s","object":{"type":"commit"}}`, tag))
			}
			fmt.Fprintf(w, "[%s]", strings.Join(refs, ","))
		case strings.HasPrefix(req.URL.Path, "/raw/owner/name/"):
			// /raw/owner/name/<tag>/bootstrap/v1/interfaces/<version>.json
			rest := strings.TrimPrefix(req.URL.Path, "/raw/owner/name/")
			tag, file, _ := strings.Cut(rest, "/bootstrap/v1/interfaces/")
			version := strings.TrimSuffix(file, ".json")
			body, ok := r.lists[version]
			if !ok || tag != "s3x-v"+version {
				http.NotFound(w, req)
				return
			}
			fmt.Fprint(w, body)
		default:
			http.NotFound(w, req)
		}
	})
}

func setup(t *testing.T, repo *fakeRepo) (*fetcher, string) {
	t.Helper()
	srv := httptest.NewServer(repo.handler(t))
	t.Cleanup(srv.Close)
	dir := t.TempDir()
	return newFetcher(config{dir: dir, repo: "owner/name", prefix: "s3x-v", every: time.Minute, api: srv.URL, raw: srv.URL + "/raw"}), dir
}

func read(t *testing.T, dir, name string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(dir, name))
	if err != nil {
		t.Fatalf("%s: %v", name, err)
	}
	return string(b)
}

func mustParse(t *testing.T, address string) *url.URL {
	t.Helper()
	u, err := url.Parse(address)
	if err != nil {
		t.Fatal(err)
	}
	return u
}

func names(t *testing.T, dir string) []string {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	var out []string
	for _, e := range entries {
		out = append(out, e.Name())
	}
	return out
}

func TestBringsInTheListOfANewTagAndLeavesTheOthersAlone(t *testing.T) {
	repo := &fakeRepo{
		tags:  []string{"s3x-v0.1.4", "s3x-v0.1.5"},
		lists: map[string]string{"0.1.4": listOf("0.1.4"), "0.1.5": listOf("0.1.5")},
	}
	f, dir := setup(t, repo)
	// Put there by a server package, and not what the repository holds now.
	mine := "{\"version\":\"0.1.4\",\"files\":{\"/index.html\":\"" + strings.Repeat("a", 64) + "\"}}"
	if err := os.WriteFile(filepath.Join(dir, "0.1.4.json"), []byte(mine), 0o644); err != nil {
		t.Fatal(err)
	}

	r, err := f.pass(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if r.tags != 2 || r.present != 1 || r.fetched != 1 || len(r.added) != 1 || r.added[0] != "0.1.5" {
		t.Fatalf("report: %+v", r)
	}
	if got := read(t, dir, "0.1.5.json"); got != listOf("0.1.5") {
		t.Fatalf("0.1.5.json is not the repository's file, byte for byte:\n%s", got)
	}
	if got := read(t, dir, "0.1.4.json"); got != mine {
		t.Fatal("a list that was already here was rewritten")
	}
	if got := names(t, dir); len(got) != 2 {
		t.Fatalf("left behind: %v", got)
	}

	// A second look brings nothing in and asks for no list.
	repo.asked = nil
	r, err = f.pass(context.Background())
	if err != nil || r.fetched != 0 || r.present != 2 {
		t.Fatalf("second look: %+v, %v", r, err)
	}
	for _, path := range repo.asked {
		if strings.HasPrefix(path, "/raw/") {
			t.Fatalf("asked again for a list it has: %s", path)
		}
	}
}

func TestOnlyReleaseTagsNameAList(t *testing.T) {
	repo := &fakeRepo{
		tags:  []string{"s3x-v0.1.5-rc1", "s3x-v1", "s3x-v0.1.5.g85e", "s3x-v00001.0.0", "s3x-v0.1.5", "v0.4.3", "s3x-v../../x"},
		lists: map[string]string{"0.1.5": listOf("0.1.5")},
	}
	f, dir := setup(t, repo)
	r, err := f.pass(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if r.tags != 1 || r.fetched != 1 {
		t.Fatalf("report: %+v", r)
	}
	if got := names(t, dir); len(got) != 1 || got[0] != "0.1.5.json" {
		t.Fatalf("written: %v", got)
	}
}

func TestRefusesWhatIsNotExactlyTheListOfItsTag(t *testing.T) {
	bad := map[string]string{
		"another version":           listOf("0.1.6"),
		"not JSON":                  "<html>not found</html>",
		"an array":                  "[]",
		"no files":                  `{"version":"0.1.5","files":{}}`,
		"files not a map":           `{"version":"0.1.5","files":["/index.html"]}`,
		"a digest too short":        `{"version":"0.1.5","files":{"/index.html":"abc"}}`,
		"a digest in capitals":      `{"version":"0.1.5","files":{"/index.html":"` + strings.ToUpper(digest) + `"}}`,
		"a digest that is a number": `{"version":"0.1.5","files":{"/index.html":12}}`,
		"no main page":              `{"version":"0.1.5","files":{"/js/app.js":"` + digest + `"}}`,
		"a path with no slash":      `{"version":"0.1.5","files":{"/index.html":"` + digest + `","js/app.js":"` + digest + `"}}`,
		"something after":           listOf("0.1.5") + "{}",
		"too large":                 `{"version":"0.1.5","files":{"/index.html":"` + digest + `"},"pad":"` + strings.Repeat("x", maxListBytes) + `"}`,
	}
	for name, body := range bad {
		t.Run(name, func(t *testing.T) {
			repo := &fakeRepo{tags: []string{"s3x-v0.1.5"}, lists: map[string]string{"0.1.5": body}}
			f, dir := setup(t, repo)
			r, err := f.pass(context.Background())
			if r.fetched != 0 {
				t.Fatalf("kept: %+v", r)
			}
			if name == "too large" {
				if err == nil {
					t.Fatal("a list too large to be one was not reported")
				}
			} else if len(r.refused) != 1 || !strings.HasPrefix(r.refused[0], "0.1.5: ") {
				t.Fatalf("not refused: %+v, %v", r, err)
			}
			if got := names(t, dir); len(got) != 0 {
				t.Fatalf("written: %v", got)
			}
		})
	}
}

func TestAListKeepsItsExtraFieldsAndItsBytes(t *testing.T) {
	body := "{\"version\":\"0.1.5\",\"built\":\"2026-11-15\",\"files\":{\"/index.html\":\"" + digest + "\"}}"
	repo := &fakeRepo{tags: []string{"s3x-v0.1.5"}, lists: map[string]string{"0.1.5": body}}
	f, dir := setup(t, repo)
	if r, err := f.pass(context.Background()); err != nil || r.fetched != 1 {
		t.Fatalf("%+v, %v", r, err)
	}
	if read(t, dir, "0.1.5.json") != body {
		t.Fatal("not the bytes that were served")
	}
}

func TestATagWithNoListIsAskedAgainThenLessOften(t *testing.T) {
	repo := &fakeRepo{tags: []string{"s3x-v0.1.5"}, lists: map[string]string{}}
	f, dir := setup(t, repo)
	asks := func() int {
		n := 0
		for _, path := range repo.asked {
			if strings.HasPrefix(path, "/raw/") {
				n++
			}
		}
		return n
	}
	for i := 0; i < absentEvery; i++ {
		r, err := f.pass(context.Background())
		if err != nil || len(r.absent) != 1 || r.absent[0] != "0.1.5" {
			t.Fatalf("look %d: %+v, %v", i, r, err)
		}
	}
	if asks() != absentEvery {
		t.Fatalf("asked %d times in the first %d looks", asks(), absentEvery)
	}
	// Then once in absentEvery looks.
	for i := 0; i < 2*absentEvery; i++ {
		f.pass(context.Background())
	}
	if got := asks(); got != absentEvery+2 {
		t.Fatalf("asked %d times after %d looks", got, 3*absentEvery)
	}
	// The list arrives: it is brought in at the next look that asks.
	repo.mu.Lock()
	repo.lists["0.1.5"] = listOf("0.1.5")
	repo.mu.Unlock()
	fetched := false
	for i := 0; i < absentEvery && !fetched; i++ {
		r, _ := f.pass(context.Background())
		fetched = r.fetched == 1
	}
	if !fetched || read(t, dir, "0.1.5.json") != listOf("0.1.5") {
		t.Fatal("the list that arrived later was not brought in")
	}
}

func TestAsksWhetherTheTagsChangedAndStillRepairsAMissingList(t *testing.T) {
	repo := &fakeRepo{tags: []string{"s3x-v0.1.5"}, lists: map[string]string{"0.1.5": listOf("0.1.5")}, etag: `"abc"`}
	f, dir := setup(t, repo)
	if _, err := f.pass(context.Background()); err != nil {
		t.Fatal(err)
	}
	// Removed by hand: the tags have not changed, the list is still owed.
	if err := os.Remove(filepath.Join(dir, "0.1.5.json")); err != nil {
		t.Fatal(err)
	}
	r, err := f.pass(context.Background())
	if err != nil || r.fetched != 1 {
		t.Fatalf("%+v, %v", r, err)
	}
	if len(repo.condition) != 2 || repo.condition[0] != "" || repo.condition[1] != `"abc"` {
		t.Fatalf("conditions sent: %q", repo.condition)
	}
}

func TestReadsEveryPageOfTags(t *testing.T) {
	repo := &fakeRepo{
		tags:     []string{"s3x-v0.1.1", "s3x-v0.1.2", "s3x-v0.1.10", "s3x-v0.1.9", "s3x-v0.2.0"},
		lists:    map[string]string{},
		pageSize: 2,
		etag:     `"abc"`,
	}
	for _, v := range []string{"0.1.1", "0.1.2", "0.1.9", "0.1.10", "0.2.0"} {
		repo.lists[v] = listOf(v)
	}
	f, dir := setup(t, repo)
	r, err := f.pass(context.Background())
	if err != nil || r.tags != 5 || r.fetched != 5 {
		t.Fatalf("%+v, %v", r, err)
	}
	if got := strings.Join(r.added, " "); got != "0.1.1 0.1.2 0.1.9 0.1.10 0.2.0" {
		t.Fatalf("order: %s", got)
	}
	if len(names(t, dir)) != 5 {
		t.Fatalf("written: %v", names(t, dir))
	}
	// Several pages: "nothing new on the first" would say nothing of the rest.
	if f.etag != "" {
		t.Fatal("kept a condition for a listing of several pages")
	}
}

func TestARepositoryThatIsNotThereWritesNothing(t *testing.T) {
	repo := &fakeRepo{gone: true}
	f, dir := setup(t, repo)
	r, err := f.pass(context.Background())
	if err == nil || !strings.Contains(err.Error(), "not there") {
		t.Fatalf("%+v, %v", r, err)
	}
	if len(names(t, dir)) != 0 {
		t.Fatal("wrote something")
	}
}

func TestARefusalFromGitHubIsAnErrorNotAnEmptyRepository(t *testing.T) {
	for _, status := range []int{http.StatusForbidden, http.StatusTooManyRequests, http.StatusInternalServerError} {
		repo := &fakeRepo{status: status}
		f, _ := setup(t, repo)
		if _, err := f.pass(context.Background()); err == nil || !strings.Contains(err.Error(), fmt.Sprint(status)) {
			t.Fatalf("%d: %v", status, err)
		}
	}
}

func TestIsNotSentToAnotherAddress(t *testing.T) {
	elsewhere := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		fmt.Fprint(w, `[{"ref":"refs/tags/s3x-v9.9.9"}]`)
	}))
	defer elsewhere.Close()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		http.Redirect(w, req, elsewhere.URL+req.URL.Path, http.StatusFound)
	}))
	defer srv.Close()
	dir := t.TempDir()
	f := newFetcher(config{dir: dir, repo: "owner/name", prefix: "s3x-v", api: srv.URL, raw: srv.URL})
	if _, err := f.pass(context.Background()); err == nil || !strings.Contains(err.Error(), "another address") {
		t.Fatalf("followed a redirect to another server: %v", err)
	}
}

func TestANextPageElsewhereIsNotFollowed(t *testing.T) {
	base := mustParse(t, "https://api.github.com/repos/o/n/git/matching-refs/tags/s3x-v?per_page=100")
	cases := map[string]string{
		`<https://api.github.com/repositories/1/git/matching-refs/tags/s3x-v?per_page=100&page=2>; rel="next"`: "https://api.github.com/repositories/1/git/matching-refs/tags/s3x-v?per_page=100&page=2",
		`<https://evil.example/x>; rel="next"`:                                           "",
		`<http://api.github.com/x>; rel="next"`:                                          "",
		`<https://api.github.com/x?page=1>; rel="prev"`:                                  "",
		`<https://api.github.com/a>; rel="prev", <https://api.github.com/b>; rel="next"`: "https://api.github.com/b",
		``: "",
	}
	for link, want := range cases {
		if got := nextPage(link, base); got != want {
			t.Errorf("nextPage(%q) = %q, want %q", link, got, want)
		}
	}
}

func TestClearsWhatAnInterruptedLookLeft(t *testing.T) {
	repo := &fakeRepo{}
	f, dir := setup(t, repo)
	old := filepath.Join(dir, ".0.1.5.json.0123456789abcdef.tmp")
	fresh := filepath.Join(dir, ".0.1.6.json.0123456789abcdef.tmp")
	other := filepath.Join(dir, "notes.tmp")
	for _, p := range []string{old, fresh, other} {
		if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	past := time.Now().Add(-time.Hour)
	if err := os.Chtimes(old, past, past); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(other, past, past); err != nil {
		t.Fatal(err)
	}
	f.pass(context.Background())
	got := strings.Join(names(t, dir), " ")
	if strings.Contains(got, ".0.1.5.json.") || !strings.Contains(got, ".0.1.6.json.") || !strings.Contains(got, "notes.tmp") {
		t.Fatalf("left: %s", got)
	}
}

func TestWriteNewNeverReplaces(t *testing.T) {
	dir := t.TempDir()
	final := filepath.Join(dir, "0.1.5.json")
	if err := os.WriteFile(final, []byte("first"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := writeNew(final, []byte("second")); err != nil {
		t.Fatal(err)
	}
	if got := read(t, dir, "0.1.5.json"); got != "first" {
		t.Fatalf("replaced: %q", got)
	}
	if got := names(t, dir); len(got) != 1 {
		t.Fatalf("left behind: %v", got)
	}
}

func TestBaseURL(t *testing.T) {
	good := map[string]string{
		"https://api.github.com":     "https://api.github.com",
		"https://api.github.com/":    "https://api.github.com",
		"http://127.0.0.1:8080/raw/": "http://127.0.0.1:8080/raw",
		"http://localhost:8080":      "http://localhost:8080",
		"http://[::1]:8080":          "http://[::1]:8080",
	}
	for in, want := range good {
		if got, err := baseURL("X", in); err != nil || got != want {
			t.Errorf("baseURL(%q) = %q, %v", in, got, err)
		}
	}
	for _, in := range []string{
		"http://api.github.com", "http://192.168.1.2:8080", "ftp://api.github.com", "api.github.com",
		"https://user:pass@api.github.com", "https://api.github.com?x=1", "https://api.github.com#x", "",
	} {
		if got, err := baseURL("X", in); err == nil {
			t.Errorf("baseURL(%q) accepted as %q", in, got)
		}
	}
}

func TestLoadConfig(t *testing.T) {
	dir := t.TempDir()
	set := func(pairs ...string) {
		for _, name := range []string{"S3X_LISTES_DIR", "S3X_LISTES_REPO", "S3X_LISTES_TAG_PREFIX", "S3X_LISTES_EVERY", "S3X_LISTES_API", "S3X_LISTES_RAW"} {
			t.Setenv(name, "")
		}
		for i := 0; i+1 < len(pairs); i += 2 {
			t.Setenv(pairs[i], pairs[i+1])
		}
	}
	set("S3X_LISTES_DIR", dir)
	c, err := loadConfig()
	if err != nil {
		t.Fatal(err)
	}
	if c.repo != defaultRepo || c.prefix != defaultPrefix || c.every != 10*time.Minute || c.api != defaultAPI || c.raw != defaultRaw {
		t.Fatalf("defaults: %+v", c)
	}
	for name, pairs := range map[string][]string{
		"no folder":                {},
		"a relative folder":        {"S3X_LISTES_DIR", "lists"},
		"a folder that is not":     {"S3X_LISTES_DIR", filepath.Join(dir, "absent")},
		"a repository with a path": {"S3X_LISTES_DIR", dir, "S3X_LISTES_REPO", "owner/name/extra"},
		"a prefix with a slash":    {"S3X_LISTES_DIR", dir, "S3X_LISTES_TAG_PREFIX", "a/b"},
		"too often":                {"S3X_LISTES_DIR", dir, "S3X_LISTES_EVERY", "5s"},
		"plain HTTP elsewhere":     {"S3X_LISTES_DIR", dir, "S3X_LISTES_RAW", "http://example.com"},
	} {
		set(pairs...)
		if _, err := loadConfig(); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
}

func TestVersionLess(t *testing.T) {
	for _, c := range []struct {
		a, b string
		want bool
	}{{"0.1.9", "0.1.10", true}, {"0.1.10", "0.1.9", false}, {"0.2.0", "0.10.0", true}, {"1.0.0", "0.9.9", false}, {"0.1.5", "0.1.5", false}} {
		if got := versionLess(c.a, c.b); got != c.want {
			t.Errorf("versionLess(%s, %s) = %v", c.a, c.b, got)
		}
	}
}
