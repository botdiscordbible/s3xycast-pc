// S3XYCast PC — s3x-relais: the credentials the relay accepts.
//
// The introduction server (mw-rendezvous) hands a browser a short-lived
// username and password when it arrives for a machine; this file is the other
// half, the check the relay makes. The two programs share one secret and this
// format, and nothing else: no call between them, no state.
//
//	username = "<expiry>:<peer>"     expiry: Unix seconds; peer: the machine's public IPv4
//	password = base64url( HMAC-SHA256( secret, "s3x-relais-v1\n" + username ) )
//
// The peer address is part of what is signed, and it is the only address the
// relay will carry traffic to and from for that username: whoever holds the
// credentials can reach the one machine they were issued for, which the entry
// link already let them try, and nothing else on the internet.
//
// mw-rendezvous keeps a copy of mint() (relaycred.go there), because that
// program imports nothing outside the standard library. The two test suites
// hold the same vector, so they cannot drift apart unnoticed.
package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"net/netip"
	"strconv"
	"strings"
	"time"
)

const (
	credLabel = "s3x-relais-v1\n"
	// What an expiry may lie ahead of now. The introduction server issues a
	// day; twice that leaves room for clocks that disagree and no more.
	credMaxAhead = 48 * time.Hour
)

var (
	errCredShape   = errors.New("username is not <expiry>:<peer>")
	errCredExpired = errors.New("credentials expired")
	errCredFuture  = errors.New("expiry too far ahead")
	errCredPeer    = errors.New("peer is not a public IPv4 address")
)

// mintPassword is the password that goes with a username, under this secret.
func mintPassword(secret []byte, username string) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(credLabel))
	mac.Write([]byte(username))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// mintUsername is the username for a machine reached at peer, valid until expiry.
func mintUsername(peer netip.Addr, expiry time.Time) string {
	return strconv.FormatInt(expiry.Unix(), 10) + ":" + peer.String()
}

// parseUsername reads a username and says whether it may be used now. It does
// not prove the username was issued by anyone: that is the password's job, and
// the relay library checks it against the key derived from mintPassword.
func parseUsername(username string, now time.Time, allowPrivate bool) (netip.Addr, error) {
	expiryText, peerText, ok := strings.Cut(username, ":")
	if !ok || expiryText == "" || peerText == "" {
		return netip.Addr{}, errCredShape
	}
	expiry, err := strconv.ParseInt(expiryText, 10, 64)
	if err != nil || expiry <= 0 {
		return netip.Addr{}, errCredShape
	}
	peer, err := netip.ParseAddr(peerText)
	if err != nil || !peer.Is4() {
		return netip.Addr{}, errCredPeer
	}
	// The canonical text only: "010.0.0.1" or a zone would be a second name
	// for one address, and the username is what the MAC covers.
	if peer.String() != peerText {
		return netip.Addr{}, errCredPeer
	}
	if !allowPrivate && !publicIPv4(peer) {
		return netip.Addr{}, errCredPeer
	}
	at := time.Unix(expiry, 0)
	if !now.Before(at) {
		return netip.Addr{}, errCredExpired
	}
	if at.Sub(now) > credMaxAhead {
		return netip.Addr{}, errCredFuture
	}
	return peer, nil
}

var cgnat = netip.MustParsePrefix("100.64.0.0/10")

// publicIPv4 reports whether addr is an address a home's router can hold on
// the internet. The relay never carries traffic to anything else: not to this
// server's own network, not to a private range, not to a multicast group.
func publicIPv4(addr netip.Addr) bool {
	if !addr.Is4() || !addr.IsValid() {
		return false
	}
	if addr.IsUnspecified() || addr.IsLoopback() || addr.IsPrivate() || addr.IsLinkLocalUnicast() ||
		addr.IsMulticast() || addr.IsLinkLocalMulticast() || addr.IsInterfaceLocalMulticast() {
		return false
	}
	if cgnat.Contains(addr) {
		return false
	}
	b := addr.As4()
	// 0.0.0.0/8, 192.0.0.0/24, the documentation ranges, 198.18.0.0/15,
	// 240.0.0.0/4 and the broadcast address.
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
