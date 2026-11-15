// S3XYCast edition — the relay's credentials, handed out with the introduction.
//
// MoonlightWeb runs no relay: where no direct path can be opened, the page says
// so and stops. This edition has one (deploy/s3xycast-relais), for the homes
// whose router opens nothing and the browsers that send no UDP. It is a
// separate program, on purpose: this one imports nothing outside the standard
// library, and stays so.
//
// What this file adds to the introduction is a note in two frames:
//
//	to a browser, in the "ready" frame: where the relay is, and credentials
//	for it that are good for the machine it asked for and for a day;
//	to a host, in an "ice" frame when its line comes up and again before the
//	credentials expire: the same, to pass on to the browsers it streams to.
//
// The credentials are the relay's own format (cred.go there):
//
//	username = "<expiry>:<peer>"     expiry: Unix seconds; peer: the machine's public IPv4
//	password = base64url( HMAC-SHA256( secret, "s3x-relais-v1\n" + username ) )
//
// The peer is the address this server sees the host's line come from. The
// relay carries a client's traffic to that address and no other, so what a
// stranger gets by asking is a way to try the one machine whose link they
// already hold — which is what the introduction gives them anyway.
//
// A host whose address is not a public IPv4 gets no credentials, and neither
// do its browsers: there is nothing the relay could send to.
package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"log"
	"net/netip"
	"os"
	"strconv"
	"strings"
	"time"
)

const relayCredLabel = "s3x-relais-v1\n"

// relayConfig is nil when no relay is configured: nothing is added to any
// frame, and the server behaves exactly as upstream's.
type relayConfig struct {
	urls         []string      // MW_RDV_RELAY_URLS (comma-separated turn:/turns: URLs)
	secret       []byte        // MW_RDV_RELAY_SECRET or MW_RDV_RELAY_SECRET_FILE (the relay's own)
	ttl          time.Duration // MW_RDV_RELAY_TTL_HOURS (default 24, at most 47)
	allowPrivate bool          // MW_RDV_RELAY_ALLOW_PRIVATE (benches only)
}

// iceGrant is what a browser hands to RTCPeerConnection as one ICE server.
type iceGrant struct {
	URLs       []string `json:"urls"`
	Username   string   `json:"username"`
	Credential string   `json:"credential"`
	TTL        int      `json:"ttl"` // seconds the credentials stay good
}

func relayMintPassword(secret []byte, username string) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(relayCredLabel))
	mac.Write([]byte(username))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

var relayCGNAT = netip.MustParsePrefix("100.64.0.0/10")

// relayPublicIPv4 mirrors the relay's own rule (publicIPv4 in cred.go): the two
// must agree, or this server would issue credentials the relay refuses.
func relayPublicIPv4(addr netip.Addr) bool {
	if !addr.IsValid() || !addr.Is4() {
		return false
	}
	if addr.IsUnspecified() || addr.IsLoopback() || addr.IsPrivate() || addr.IsLinkLocalUnicast() ||
		addr.IsMulticast() || addr.IsLinkLocalMulticast() || addr.IsInterfaceLocalMulticast() {
		return false
	}
	if relayCGNAT.Contains(addr) {
		return false
	}
	b := addr.As4()
	switch {
	case b[0] == 0, b[0] >= 240:
		return false
	case b[0] == 192 && b[1] == 0 && (b[2] == 0 || b[2] == 2):
		return false
	case b[0] == 198 && (b[1] == 18 || b[1] == 19):
		return false
	case b[0] == 198 && b[1] == 51 && b[2] == 100:
		return false
	case b[0] == 203 && b[1] == 0 && b[2] == 113:
		return false
	}
	return true
}

// grant returns credentials for the machine whose line comes from hostAddr, or
// nil when there is no relay or no address the relay could reach.
func (rc *relayConfig) grant(hostAddr string, now time.Time) *iceGrant {
	if rc == nil {
		return nil
	}
	addr, err := netip.ParseAddr(strings.TrimSpace(hostAddr))
	if err != nil {
		return nil
	}
	addr = addr.Unmap()
	if !addr.Is4() || (!rc.allowPrivate && !relayPublicIPv4(addr)) {
		return nil
	}
	username := strconv.FormatInt(now.Add(rc.ttl).Unix(), 10) + ":" + addr.String()
	return &iceGrant{
		URLs:       rc.urls,
		Username:   username,
		Credential: relayMintPassword(rc.secret, username),
		TTL:        int(rc.ttl / time.Second),
	}
}

// refreshEvery is how often a host is sent fresh credentials: well inside
// their lifetime, so the ones it holds are never about to lapse when a stream
// starts.
func (rc *relayConfig) refreshEvery() time.Duration {
	return rc.ttl / 3
}

func relaySecret() ([]byte, error) {
	if v := os.Getenv("MW_RDV_RELAY_SECRET"); v != "" {
		if len(v) < minSecretFileBytes {
			return nil, fmt.Errorf("MW_RDV_RELAY_SECRET is shorter than %d bytes", minSecretFileBytes)
		}
		return []byte(v), nil
	}
	path := strings.TrimSpace(os.Getenv("MW_RDV_RELAY_SECRET_FILE"))
	if path == "" {
		return nil, fmt.Errorf("MW_RDV_RELAY_URLS is set: MW_RDV_RELAY_SECRET or MW_RDV_RELAY_SECRET_FILE is required")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("MW_RDV_RELAY_SECRET_FILE: %w", err)
	}
	secret := bytes.TrimSpace(bytes.TrimPrefix(raw, []byte{0xEF, 0xBB, 0xBF}))
	if len(secret) < minSecretFileBytes {
		return nil, fmt.Errorf("MW_RDV_RELAY_SECRET_FILE holds fewer than %d bytes", minSecretFileBytes)
	}
	return secret, nil
}

// parseRelayURLs keeps what a browser accepts as a relay's address and nothing
// else: a typo here would otherwise reach every page as a server to contact.
func parseRelayURLs(text string) ([]string, error) {
	var urls []string
	for _, part := range strings.Split(text, ",") {
		u := strings.TrimSpace(part)
		if u == "" {
			continue
		}
		if !strings.HasPrefix(u, "turn:") && !strings.HasPrefix(u, "turns:") {
			return nil, fmt.Errorf("MW_RDV_RELAY_URLS: %q is not a turn: or turns: URL", u)
		}
		if strings.ContainsAny(u, " \t\r\n\"'<>") || len(u) > 200 {
			return nil, fmt.Errorf("MW_RDV_RELAY_URLS: %q is not a plain URL", u)
		}
		urls = append(urls, u)
	}
	if len(urls) > 6 {
		return nil, fmt.Errorf("MW_RDV_RELAY_URLS: %d URLs, at most 6", len(urls))
	}
	return urls, nil
}

// loadRelayConfig reads the relay's settings. No URL means no relay, and the
// rest is not looked at. A relay that is named but cannot be vouched for is a
// mistake worth stopping on: the pages would be told of a server that refuses
// them all.
func loadRelayConfig() *relayConfig {
	urls, err := parseRelayURLs(os.Getenv("MW_RDV_RELAY_URLS"))
	if err != nil {
		log.Fatalf("[mw-rendezvous] %v", err)
	}
	if len(urls) == 0 {
		return nil
	}
	secret, err := relaySecret()
	if err != nil {
		log.Fatalf("[mw-rendezvous] %v", err)
	}
	// The relay refuses an expiry more than 48 hours ahead (credMaxAhead there).
	hours := envInt("MW_RDV_RELAY_TTL_HOURS", 24, 1, 47)
	allowPrivate := false
	switch strings.ToLower(strings.TrimSpace(os.Getenv("MW_RDV_RELAY_ALLOW_PRIVATE"))) {
	case "1", "true", "yes", "on":
		allowPrivate = true
		log.Printf("[mw-rendezvous] WARNING: MW_RDV_RELAY_ALLOW_PRIVATE is on — for benches only")
	}
	return &relayConfig{urls: urls, secret: secret, ttl: time.Duration(hours) * time.Hour, allowPrivate: allowPrivate}
}
