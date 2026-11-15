// S3XYCast PC — s3x-listes: the lists of official interfaces, fetched as
// releases are tagged.
//
// What it is for
// --------------
// Every PC reached through the entry server shares one origin, so the entry
// page holds the interface a PC serves against the list of its release
// (bootstrap/v1/official.js), and refuses a version that has none. A release's
// list is made from its tag and lives in the repository at that tag
// (bootstrap/v1/interfaces/<version>.json). Until this program it reached the
// server by hand, in a server package, before each release.
//
// This program asks the edition's public repository which release tags exist
// and, for each one whose list is not on this server yet, fetches the list at
// that tag, checks it, and puts it beside the others. A release is then: push
// the tag, wait for its list to be served here, publish.
//
// What it will not do
// -------------------
// Replace or remove a list: a release's list never changes, and a file that is
// here stays exactly as it is. Write anywhere but the one folder it is given.
// Keep a list that is not exactly one: the version of its tag, a digest for
// every file, the main page among them. Follow a redirect to another host, or
// speak plain HTTP to anything but this machine (the tests do).
//
// What it trusts
// --------------
// The repository's tags, as GitHub serves them. Whoever can push a tag there
// can publish a release, which every PC then installs by itself: a list adds
// nothing to that.
//
// It listens on nothing, and runs under an account that can write to that one
// folder. This program is not part of MoonlightWeb. Standard library only.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"strings"
	"syscall"
	"time"
)

// ── Configuration (env-driven, like mw-rendezvous and s3x-relais) ───────────

type config struct {
	dir    string        // S3X_LISTES_DIR         (required: the folder the entry page's lists are served from)
	repo   string        // S3X_LISTES_REPO        (default "botdiscordbible/s3xycast-pc")
	prefix string        // S3X_LISTES_TAG_PREFIX  (default "s3x-v": mw::edition::kReleaseTagPrefix)
	every  time.Duration // S3X_LISTES_EVERY       (default 10m; one minute at least)
	api    string        // S3X_LISTES_API         (default "https://api.github.com")
	raw    string        // S3X_LISTES_RAW         (default "https://raw.githubusercontent.com")
}

const (
	defaultRepo   = "botdiscordbible/s3xycast-pc"
	defaultPrefix = "s3x-v"
	defaultAPI    = "https://api.github.com"
	defaultRaw    = "https://raw.githubusercontent.com"
)

var (
	repoShape   = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$`)
	prefixShape = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,32}$`)
)

func envOr(name, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(name)); v != "" {
		return v
	}
	return fallback
}

// baseURL holds an address this program may ask: HTTPS, or plain HTTP to this
// machine and nothing else. Without credentials, a query or a fragment, and
// without the slash a path would be joined after.
func baseURL(name, value string) (string, error) {
	u, err := url.Parse(value)
	if err != nil || u.Host == "" {
		return "", fmt.Errorf("%s is not an address: %q", name, value)
	}
	if u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return "", fmt.Errorf("%s carries more than an address: %q", name, value)
	}
	switch u.Scheme {
	case "https":
	case "http":
		if !isLoopbackHost(u.Hostname()) {
			return "", fmt.Errorf("%s is plain HTTP to another machine: %q", name, value)
		}
	default:
		return "", fmt.Errorf("%s is neither https nor http: %q", name, value)
	}
	return strings.TrimRight(u.String(), "/"), nil
}

func isLoopbackHost(host string) bool {
	return host == "127.0.0.1" || host == "localhost" || host == "::1"
}

func loadConfig() (config, error) {
	c := config{
		dir:    strings.TrimSpace(os.Getenv("S3X_LISTES_DIR")),
		repo:   envOr("S3X_LISTES_REPO", defaultRepo),
		prefix: envOr("S3X_LISTES_TAG_PREFIX", defaultPrefix),
		every:  10 * time.Minute,
	}
	if c.dir == "" {
		return c, errors.New("S3X_LISTES_DIR is not set: the folder the lists are served from")
	}
	if !filepath.IsAbs(c.dir) {
		return c, fmt.Errorf("S3X_LISTES_DIR is not a full path: %q", c.dir)
	}
	if info, err := os.Stat(c.dir); err != nil || !info.IsDir() {
		return c, fmt.Errorf("S3X_LISTES_DIR is not a folder: %q", c.dir)
	}
	if !repoShape.MatchString(c.repo) {
		return c, fmt.Errorf("S3X_LISTES_REPO is not owner/name: %q", c.repo)
	}
	if !prefixShape.MatchString(c.prefix) {
		return c, fmt.Errorf("S3X_LISTES_TAG_PREFIX is not a tag prefix: %q", c.prefix)
	}
	if v := strings.TrimSpace(os.Getenv("S3X_LISTES_EVERY")); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil || d < time.Minute {
			return c, fmt.Errorf("S3X_LISTES_EVERY is not a duration of a minute or more: %q", v)
		}
		c.every = d
	}
	var err error
	if c.api, err = baseURL("S3X_LISTES_API", envOr("S3X_LISTES_API", defaultAPI)); err != nil {
		return c, err
	}
	if c.raw, err = baseURL("S3X_LISTES_RAW", envOr("S3X_LISTES_RAW", defaultRaw)); err != nil {
		return c, err
	}
	return c, nil
}

func main() {
	once := flag.Bool("once", false, "look once, then exit: 0 when the repository answered, 1 otherwise")
	flag.Parse()
	log.SetFlags(log.LstdFlags)
	log.SetPrefix("[s3x-listes] ")

	cfg, err := loadConfig()
	if err != nil {
		log.Fatalf("configuration: %v", err)
	}
	f := newFetcher(cfg)

	if *once {
		report, err := f.pass(context.Background())
		log.Print(report)
		if err != nil {
			log.Printf("the look did not finish: %v", err)
			os.Exit(1)
		}
		return
	}

	log.Printf("watching %s for tags %s*, every %s, lists kept in %s", cfg.repo, cfg.prefix, cfg.every, cfg.dir)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	last := ""
	for {
		report, err := f.pass(ctx)
		// One line when something changed, not one every ten minutes for ever.
		// The server's installer reads the first one ("release tag(s)", and
		// "the look did not finish" when the repository did not answer).
		line := report.String()
		if err != nil {
			line += "; the look did not finish: " + err.Error()
		}
		if line != last || report.fetched > 0 {
			log.Print(line)
			last = line
		}
		select {
		case <-ctx.Done():
			log.Print("stopping")
			return
		case <-time.After(cfg.every):
		}
	}
}
