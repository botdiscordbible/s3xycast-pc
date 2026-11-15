package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

// The same vector is held by the relay (deploy/s3xycast-relais/cred_test.go):
// the two programs must agree on it, or no browser's credentials would pass.
const (
	relayVectorSecret   = "0123456789abcdef0123456789abcdef"
	relayVectorUsername = "1900000000:198.51.100.7"
	relayVectorPassword = "iU2tbBjtnBRD2LHtSLUQr7SYqK5bxu7VAC-v_0MFWTs"
)

func TestRelayPasswordVector(t *testing.T) {
	if got := relayMintPassword([]byte(relayVectorSecret), relayVectorUsername); got != relayVectorPassword {
		t.Fatalf("password = %q, want %q", got, relayVectorPassword)
	}
}

func testRelayConfig() *relayConfig {
	return &relayConfig{
		urls:   []string{"turn:relay.test:3478?transport=udp", "turn:relay.test:3478?transport=tcp"},
		secret: []byte(relayVectorSecret),
		ttl:    24 * time.Hour,
	}
}

func TestRelayGrant(t *testing.T) {
	rc := testRelayConfig()
	now := time.Unix(1_800_000_000, 0)

	g := rc.grant("109.215.10.20", now)
	if g == nil {
		t.Fatal("no grant for a public address")
	}
	if g.Username != "1800086400:109.215.10.20" {
		t.Fatalf("username = %q", g.Username)
	}
	if g.Credential != relayMintPassword(rc.secret, g.Username) {
		t.Fatal("the credential is not the one the relay computes")
	}
	if g.TTL != 86400 || len(g.URLs) != 2 || g.URLs[1] != "turn:relay.test:3478?transport=tcp" {
		t.Fatalf("grant = %+v", g)
	}
	// The address a proxy reports for an IPv4 client reached over a dual stack.
	if m := rc.grant("::ffff:109.215.10.20", now); m == nil || m.Username != g.Username {
		t.Fatalf("an IPv4-mapped address was not read as IPv4: %+v", m)
	}

	// No relay: nothing, from a nil receiver.
	var none *relayConfig
	if none.grant("109.215.10.20", now) != nil {
		t.Fatal("a grant without a relay")
	}
	// Nothing the relay could reach: no grant.
	for _, addr := range []string{
		"", "not an address", "192.168.1.32", "10.0.0.5", "127.0.0.1", "100.64.1.1", "169.254.3.4",
		"198.18.0.1", "203.0.113.5", "224.0.0.1", "0.0.0.0", "255.255.255.255",
		"2a01:cb19::1", "::1", "109.215.10.20:443",
	} {
		if got := rc.grant(addr, now); got != nil {
			t.Errorf("a grant for %q: %+v", addr, got)
		}
	}
	// A bench may be on a private network.
	bench := testRelayConfig()
	bench.allowPrivate = true
	if got := bench.grant("127.0.0.1", now); got == nil || got.Username != "1800086400:127.0.0.1" {
		t.Fatalf("a bench got %+v", got)
	}
	if bench.grant("::1", now) != nil {
		t.Fatal("a bench got a grant for an IPv6 address")
	}
	if rc.refreshEvery() != 8*time.Hour {
		t.Fatalf("refresh every %v, want 8h", rc.refreshEvery())
	}
}

func TestParseRelayURLs(t *testing.T) {
	got, err := parseRelayURLs(" turn:pc.example:3478?transport=udp , turns:pc.example:5349?transport=tcp ,, ")
	if err != nil || len(got) != 2 || got[0] != "turn:pc.example:3478?transport=udp" || got[1] != "turns:pc.example:5349?transport=tcp" {
		t.Fatalf("urls = %v, %v", got, err)
	}
	if got, err := parseRelayURLs(""); err != nil || len(got) != 0 {
		t.Fatalf("empty = %v, %v", got, err)
	}
	for _, bad := range []string{
		"stun:pc.example:3478",
		"https://pc.example/",
		"turn:pc.example:3478 ?transport=udp",
		"turn:pc.example\"><script>",
		"turn:" + strings.Repeat("a", 220),
		strings.Repeat("turn:pc.example:3478,", 7),
	} {
		if _, err := parseRelayURLs(bad); err == nil {
			t.Errorf("%q was accepted", bad)
		}
	}
}

func relayTestServer(t *testing.T) (*server, *httptest.Server) {
	t.Helper()
	cfg := config{
		storePath:   filepath.Join(t.TempDir(), "rendezvous.json"),
		secret:      []byte("test-secret"),
		maxNewPerHr: 20,
		maxPeerPerM: 30,
		maxSessions: 2,
		maxMessage:  64 * 1024,
		pingEvery:   60 * time.Second,
		minProto:    1,
		relay:       testRelayConfig(),
	}
	store, err := newClaimStore(cfg.storePath, cfg.secret)
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	s := newServer(cfg, store)
	ts := httptest.NewServer(s.routes())
	t.Cleanup(ts.Close)
	return s, ts
}

// With a relay configured, the host is told of it when its line comes up, and
// each browser in its ready frame — both with credentials for the address the
// host's line comes from.
func TestRelayIsAnnouncedToHostAndBrowser(t *testing.T) {
	s, ts := relayTestServer(t)
	if status, body := postClaim(t, ts, http.MethodPost, tokenA, idA); status != http.StatusOK {
		t.Fatalf("claim: status %d (%v)", status, body)
	}
	host, status := dialWS(t, ts.URL, "/v1/host?id="+idA,
		map[string]string{"X-MW-Owner": tokenA, "X-Forwarded-For": "109.215.10.20"})
	if status != http.StatusSwitchingProtocols {
		t.Fatalf("host line: status %d", status)
	}
	defer host.Close()
	waitFor(t, func() bool { return s.hub.line(idA) != nil })

	// The first thing on the line: the relay, with no session.
	var first hostFrame
	host.ReadJSON(t, &first)
	if first.T != msgIce || first.S != "" {
		t.Fatalf("host got %+v, want an ice frame without a session", first)
	}
	var forHost iceGrant
	if err := json.Unmarshal(first.D, &forHost); err != nil {
		t.Fatalf("ice frame payload: %v", err)
	}
	checkGrant(t, "host", forHost, "109.215.10.20")

	peer, status := dialWS(t, ts.URL, "/v1/peer?id="+idA, map[string]string{"X-Forwarded-For": "198.51.100.44"})
	if status != http.StatusSwitchingProtocols {
		t.Fatalf("peer: status %d", status)
	}
	defer peer.Close()

	var open hostFrame
	host.ReadJSON(t, &open)
	if open.T != msgOpen {
		t.Fatalf("host got %+v, want open", open)
	}
	var ready peerFrame
	peer.ReadJSON(t, &ready)
	if ready.T != msgReady || ready.Ice == nil {
		t.Fatalf("peer got %+v, want ready with the relay", ready)
	}
	// For the HOST's address, not the browser's: it is the machine the relay
	// has to reach.
	checkGrant(t, "browser", *ready.Ice, "109.215.10.20")
}

func checkGrant(t *testing.T, who string, g iceGrant, peer string) {
	t.Helper()
	expiryText, addr, ok := strings.Cut(g.Username, ":")
	if !ok || addr != peer {
		t.Fatalf("%s: username %q does not name %s", who, g.Username, peer)
	}
	expiry, err := strconv.ParseInt(expiryText, 10, 64)
	if err != nil {
		t.Fatalf("%s: expiry %q", who, expiryText)
	}
	left := time.Until(time.Unix(expiry, 0))
	if left < 23*time.Hour || left > 25*time.Hour {
		t.Fatalf("%s: credentials good for %v, want about a day", who, left)
	}
	if g.Credential != relayMintPassword([]byte(relayVectorSecret), g.Username) {
		t.Fatalf("%s: the credential is not the relay's", who)
	}
	if len(g.URLs) != 2 || !strings.HasPrefix(g.URLs[0], "turn:") {
		t.Fatalf("%s: urls %v", who, g.URLs)
	}
}

// A host the relay could not reach — a private address, here the test's own
// loopback — is told nothing, and neither are its browsers.
func TestNoRelayForAHostTheRelayCannotReach(t *testing.T) {
	s, ts := relayTestServer(t)
	host := claimAndConnect(t, s, ts, tokenA, idA) // no X-Forwarded-For: 127.0.0.1
	peer, status := dialWS(t, ts.URL, "/v1/peer?id="+idA, nil)
	if status != http.StatusSwitchingProtocols {
		t.Fatalf("peer: status %d", status)
	}
	defer peer.Close()

	var open hostFrame
	host.ReadJSON(t, &open)
	if open.T != msgOpen {
		t.Fatalf("host got %+v first, want open: no ice frame for a private address", open)
	}
	var ready peerFrame
	peer.ReadJSON(t, &ready)
	if ready.T != msgReady || ready.Ice != nil {
		t.Fatalf("peer got %+v, want ready without a relay", ready)
	}
}

// Without a relay the frames are upstream's, byte for byte: no "ice" key.
func TestNoRelayConfiguredAddsNothing(t *testing.T) {
	s, ts := testServer(t)
	host := claimAndConnect(t, s, ts, tokenA, idA)
	peer, status := dialWS(t, ts.URL, "/v1/peer?id="+idA, map[string]string{"X-Forwarded-For": "109.215.10.20"})
	if status != http.StatusSwitchingProtocols {
		t.Fatalf("peer: status %d", status)
	}
	defer peer.Close()

	var open hostFrame
	host.ReadJSON(t, &open)
	if open.T != msgOpen {
		t.Fatalf("host got %+v, want open", open)
	}
	_, raw := peer.ReadMessage(t)
	if strings.Contains(string(raw), "ice") {
		t.Fatalf("ready frame mentions a relay that is not configured: %s", raw)
	}
}
