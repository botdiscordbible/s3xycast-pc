package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

var (
	// A release's version, as a tag carries it after its prefix: RELEASE in
	// bootstrap/v1/official.js. Anything else ("0.1.5-rc1", "0.1.5.g85e")
	// names no list, there or here.
	releaseShape = regexp.MustCompile(`^\d{1,4}\.\d{1,4}\.\d{1,4}$`)
	digestShape  = regexp.MustCompile(`^[0-9a-f]{64}$`)
	// A file this program was writing when it was stopped.
	tempShape = regexp.MustCompile(`^\.\d{1,4}\.\d{1,4}\.\d{1,4}\.json\.[0-9a-f]{16}\.tmp$`)
)

const (
	maxListBytes = 2 << 20 // a list is some 25 KB: two megabytes is not one
	maxTagsBytes = 4 << 20
	maxTagPages  = 10
	maxFiles     = 20000
	maxPathLen   = 512
	// A tag whose list is not in the repository is asked again at every look
	// for this many looks (an hour, at the default pace), then once in as many.
	absentEvery = 6
	// How long a file left half-written is kept before it is cleared.
	staleTemp = 2 * time.Minute
)

var errNoList = errors.New("the repository has no list at that tag")

// What one look found and did.
type report struct {
	tags    int      // release tags the repository has
	present int      // of those, the lists already here
	fetched int      // lists this look brought in
	added   []string // their versions
	refused []string // "version: why", for a list that was not kept
	absent  []string // release tags whose list is not in the repository
}

func (r report) String() string {
	var b strings.Builder
	fmt.Fprintf(&b, "%d release tag(s), %d list(s) already here, %d fetched", r.tags, r.present, r.fetched)
	if len(r.added) > 0 {
		fmt.Fprintf(&b, " (%s)", strings.Join(r.added, ", "))
	}
	if len(r.absent) > 0 {
		fmt.Fprintf(&b, "; no list in the repository for %s", strings.Join(r.absent, ", "))
	}
	if len(r.refused) > 0 {
		fmt.Fprintf(&b, "; refused: %s", strings.Join(r.refused, "; "))
	}
	return b.String()
}

type fetcher struct {
	cfg    config
	client *http.Client
	// What the page of tags answered last, to ask "anything new?" instead of
	// reading it again: an unchanged page costs nothing of GitHub's allowance.
	etag   string
	cached []string
	// Tags whose list was not in the repository, and how many looks saw that.
	absent map[string]int
}

func newFetcher(cfg config) *fetcher {
	return &fetcher{
		cfg:    cfg,
		absent: map[string]int{},
		client: &http.Client{
			Timeout: 30 * time.Second,
			// The same host, over the same scheme, a few times at most: a
			// repository that was renamed answers with a redirect, and nothing
			// else is a reason to be sent elsewhere.
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 3 {
					return errors.New("too many redirects")
				}
				if req.URL.Host != via[0].URL.Host || req.URL.Scheme != via[0].URL.Scheme {
					return fmt.Errorf("redirected to another address (%s)", req.URL.Host)
				}
				return nil
			},
		},
	}
}

// pass looks once: which release tags exist, which lists are missing here, and
// brings those in. The error is what kept the look from finishing; the lists
// already brought in stay.
func (f *fetcher) pass(ctx context.Context) (report, error) {
	var r report
	f.clearStaleTemps()

	versions, err := f.releaseVersions(ctx)
	if err != nil {
		return r, err
	}
	r.tags = len(versions)

	var failures []string
	for _, version := range versions {
		final := filepath.Join(f.cfg.dir, version+".json")
		if _, err := os.Lstat(final); err == nil {
			// Here already: it stays as it is, whatever the repository says now.
			r.present++
			delete(f.absent, version)
			continue
		}
		if seen := f.absent[version]; seen >= absentEvery && seen%absentEvery != 0 {
			f.absent[version]++
			r.absent = append(r.absent, version)
			continue
		}
		body, err := f.fetchList(ctx, version)
		if errors.Is(err, errNoList) {
			f.absent[version]++
			r.absent = append(r.absent, version)
			continue
		}
		if err != nil {
			failures = append(failures, fmt.Sprintf("%s: %v", version, err))
			continue
		}
		if err := checkList(version, body); err != nil {
			r.refused = append(r.refused, fmt.Sprintf("%s: %v", version, err))
			continue
		}
		if err := writeNew(final, body); err != nil {
			failures = append(failures, fmt.Sprintf("%s: %v", version, err))
			continue
		}
		delete(f.absent, version)
		r.fetched++
		r.added = append(r.added, version)
	}
	if len(failures) > 0 {
		return r, errors.New(strings.Join(failures, "; "))
	}
	return r, nil
}

// releaseVersions reads the repository's tags that start with the edition's
// prefix and returns the versions of those that name a release, in order.
func (f *fetcher) releaseVersions(ctx context.Context) ([]string, error) {
	first := fmt.Sprintf("%s/repos/%s/git/matching-refs/tags/%s?per_page=100", f.cfg.api, f.cfg.repo, url.PathEscape(f.cfg.prefix))
	base, err := url.Parse(first)
	if err != nil {
		return nil, err
	}

	seen := map[string]bool{}
	next := first
	pages := 0
	for next != "" {
		if pages++; pages > maxTagPages {
			return nil, errors.New("the repository's tags do not end")
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, next, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Accept", "application/vnd.github+json")
		req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
		req.Header.Set("User-Agent", "s3x-listes")
		if pages == 1 && f.etag != "" {
			req.Header.Set("If-None-Match", f.etag)
		}
		resp, err := f.client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("the repository's tags could not be read: %w", err)
		}
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxTagsBytes+1))
		resp.Body.Close()

		if pages == 1 && resp.StatusCode == http.StatusNotModified && f.cached != nil {
			return f.cached, nil
		}
		if resp.StatusCode == http.StatusNotFound {
			return nil, fmt.Errorf("the repository %s is not there, or not public", f.cfg.repo)
		}
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("the repository's tags answered %d", resp.StatusCode)
		}
		if readErr != nil {
			return nil, fmt.Errorf("the repository's tags could not be read: %w", readErr)
		}
		if len(body) > maxTagsBytes {
			return nil, errors.New("the repository's tags are too long a page")
		}
		var refs []struct {
			Ref string `json:"ref"`
		}
		if err := json.Unmarshal(body, &refs); err != nil {
			return nil, fmt.Errorf("the repository's tags are not what was asked for: %w", err)
		}
		for _, ref := range refs {
			version, ok := strings.CutPrefix(ref.Ref, "refs/tags/"+f.cfg.prefix)
			if ok && releaseShape.MatchString(version) {
				seen[version] = true
			}
		}
		if pages == 1 {
			f.etag = resp.Header.Get("ETag")
		}
		next = nextPage(resp.Header.Get("Link"), base)
		if next != "" {
			// More than one page: "nothing new on the first" says nothing of
			// the others, so the whole of it is read again next time.
			f.etag = ""
		}
	}

	versions := make([]string, 0, len(seen))
	for v := range seen {
		versions = append(versions, v)
	}
	sort.Slice(versions, func(i, j int) bool { return versionLess(versions[i], versions[j]) })
	f.cached = versions
	return versions, nil
}

// nextPage reads the address of the next page out of a Link header, and keeps
// it only when it is on the server that was asked.
func nextPage(link string, base *url.URL) string {
	for _, part := range strings.Split(link, ",") {
		fields := strings.Split(part, ";")
		if len(fields) < 2 {
			continue
		}
		isNext := false
		for _, field := range fields[1:] {
			if strings.TrimSpace(field) == `rel="next"` {
				isNext = true
			}
		}
		target := strings.TrimSpace(fields[0])
		if !isNext || !strings.HasPrefix(target, "<") || !strings.HasSuffix(target, ">") {
			continue
		}
		u, err := url.Parse(target[1 : len(target)-1])
		if err != nil || u.Host != base.Host || u.Scheme != base.Scheme {
			return ""
		}
		return u.String()
	}
	return ""
}

// versionLess orders 0.1.9 before 0.1.10.
func versionLess(a, b string) bool {
	pa, pb := strings.Split(a, "."), strings.Split(b, ".")
	for i := 0; i < len(pa) && i < len(pb); i++ {
		if len(pa[i]) != len(pb[i]) {
			return len(pa[i]) < len(pb[i])
		}
		if pa[i] != pb[i] {
			return pa[i] < pb[i]
		}
	}
	return len(pa) < len(pb)
}

// fetchList reads a release's list from the repository, at the release's tag.
func (f *fetcher) fetchList(ctx context.Context, version string) ([]byte, error) {
	address := fmt.Sprintf("%s/%s/%s/bootstrap/v1/interfaces/%s.json",
		f.cfg.raw, f.cfg.repo, url.PathEscape(f.cfg.prefix+version), url.PathEscape(version))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, address, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "s3x-listes")
	resp, err := f.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("its list could not be read: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil, errNoList
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("its list answered %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxListBytes+1))
	if err != nil {
		return nil, fmt.Errorf("its list could not be read: %w", err)
	}
	if len(body) > maxListBytes {
		return nil, errors.New("its list is too large to be one")
	}
	return body, nil
}

// checkList says whether @p body is the list of @p version, as the entry page
// reads one (fetchList in bootstrap/v1/official.js), and nothing less: where
// the page skips a digest it cannot read, this refuses the whole file.
func checkList(version string, body []byte) error {
	var list struct {
		Version string            `json:"version"`
		Files   map[string]string `json:"files"`
	}
	dec := json.NewDecoder(bytes.NewReader(body))
	if err := dec.Decode(&list); err != nil {
		return fmt.Errorf("it is not a list (%v)", err)
	}
	if _, err := dec.Token(); err != io.EOF {
		return errors.New("something follows the list")
	}
	if list.Version != version {
		return fmt.Errorf("it is the list of %q", list.Version)
	}
	if len(list.Files) == 0 {
		return errors.New("it names no file")
	}
	if len(list.Files) > maxFiles {
		return errors.New("it names too many files")
	}
	for path, digest := range list.Files {
		if !strings.HasPrefix(path, "/") || len(path) > maxPathLen || strings.ContainsAny(path, "\x00\r\n") {
			return fmt.Errorf("it names a file that is not a path (%.60q)", path)
		}
		if !digestShape.MatchString(digest) {
			return fmt.Errorf("it holds no digest for %.60s", path)
		}
	}
	if _, ok := list.Files["/index.html"]; !ok {
		return errors.New("the main page is not in it")
	}
	return nil
}

// writeNew puts @p body at @p final, whole or not at all: written beside it
// under another name first, then given its name. A file that is already there
// is left as it is.
func writeNew(final string, body []byte) error {
	var salt [8]byte
	if _, err := rand.Read(salt[:]); err != nil {
		return err
	}
	dir, name := filepath.Split(final)
	temp := filepath.Join(dir, "."+name+"."+hex.EncodeToString(salt[:])+".tmp")
	file, err := os.OpenFile(temp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return err
	}
	_, err = file.Write(body)
	if err == nil {
		err = file.Sync()
	}
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	if err == nil {
		if _, statErr := os.Lstat(final); statErr == nil {
			// Put there in the meantime (a server package being installed).
			err = os.Remove(temp)
			return err
		}
		err = os.Rename(temp, final)
	}
	if err != nil {
		os.Remove(temp)
	}
	return err
}

// clearStaleTemps removes what a look that was cut short left behind.
func (f *fetcher) clearStaleTemps() {
	entries, err := os.ReadDir(f.cfg.dir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if entry.IsDir() || !tempShape.MatchString(entry.Name()) {
			continue
		}
		info, err := entry.Info()
		if err == nil && time.Since(info.ModTime()) > staleTemp {
			os.Remove(filepath.Join(f.cfg.dir, entry.Name()))
		}
	}
}
