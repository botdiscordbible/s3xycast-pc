package main

import (
	"net/netip"
	"testing"
	"time"
)

// The same vector is held by mw-rendezvous (relaycred_test.go): the two
// programs must agree on it, or no browser's credentials would ever pass.
const (
	vectorSecret   = "0123456789abcdef0123456789abcdef"
	vectorUsername = "1900000000:198.51.100.7"
	vectorPassword = "iU2tbBjtnBRD2LHtSLUQr7SYqK5bxu7VAC-v_0MFWTs"
)

func TestPasswordVector(t *testing.T) {
	if got := mintPassword([]byte(vectorSecret), vectorUsername); got != vectorPassword {
		t.Fatalf("password = %q, want %q", got, vectorPassword)
	}
	// Another secret, another username: another password.
	if mintPassword([]byte(vectorSecret+"x"), vectorUsername) == vectorPassword {
		t.Fatal("the password does not depend on the secret")
	}
	if mintPassword([]byte(vectorSecret), vectorUsername+"0") == vectorPassword {
		t.Fatal("the password does not depend on the username")
	}
}

func TestUsernameRoundTrip(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	peer := netip.MustParseAddr("109.215.10.20")
	username := mintUsername(peer, now.Add(24*time.Hour))
	if username != "1800086400:109.215.10.20" {
		t.Fatalf("username = %q", username)
	}
	got, err := parseUsername(username, now, false)
	if err != nil || got != peer {
		t.Fatalf("parse = %v, %v", got, err)
	}
}

func TestUsernameRefusals(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	cases := []struct {
		name, username string
		private        bool
		want           error
	}{
		{"empty", "", false, errCredShape},
		{"no colon", "1800086400", false, errCredShape},
		{"no peer", "1800086400:", false, errCredShape},
		{"no expiry", ":109.215.10.20", false, errCredShape},
		{"expiry not a number", "soon:109.215.10.20", false, errCredShape},
		{"negative expiry", "-5:109.215.10.20", false, errCredShape},
		{"expired a second ago", "1799999999:109.215.10.20", false, errCredExpired},
		{"expires now", "1800000000:109.215.10.20", false, errCredExpired},
		{"three days ahead", "1800259200:109.215.10.20", false, errCredFuture},
		{"a name, not an address", "1800086400:example.com", false, errCredPeer},
		{"IPv6", "1800086400:2001:db8::1", false, errCredPeer},
		{"with a port", "1800086400:109.215.10.20:3478", false, errCredPeer},
		{"leading zero", "1800086400:109.215.010.20", false, errCredPeer},
		{"private", "1800086400:192.168.1.32", false, errCredPeer},
		{"loopback", "1800086400:127.0.0.1", false, errCredPeer},
		{"shared address space", "1800086400:100.64.3.4", false, errCredPeer},
		{"link-local", "1800086400:169.254.1.1", false, errCredPeer},
		{"multicast", "1800086400:224.0.0.251", false, errCredPeer},
		{"unspecified", "1800086400:0.0.0.0", false, errCredPeer},
		{"broadcast", "1800086400:255.255.255.255", false, errCredPeer},
		{"documentation range", "1800086400:203.0.113.9", false, errCredPeer},
		// A bench may name a private peer; it still has to be a plain IPv4.
		{"IPv6 on a bench", "1800086400:::1", true, errCredPeer},
	}
	for _, c := range cases {
		if _, err := parseUsername(c.username, now, c.private); err != c.want {
			t.Errorf("%s: %q → %v, want %v", c.name, c.username, err, c.want)
		}
	}
	// What a bench accepts and a server does not.
	if _, err := parseUsername("1800086400:127.0.0.1", now, true); err != nil {
		t.Errorf("a bench refuses loopback: %v", err)
	}
	if _, err := parseUsername("1800086400:192.168.1.32", now, true); err != nil {
		t.Errorf("a bench refuses a private address: %v", err)
	}
}

func TestPublicIPv4(t *testing.T) {
	for _, s := range []string{"109.215.10.20", "8.8.8.8", "65.108.129.57", "1.1.1.1", "198.17.255.255", "100.63.255.255"} {
		if !publicIPv4(netip.MustParseAddr(s)) {
			t.Errorf("%s should be public", s)
		}
	}
	for _, s := range []string{
		"10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.0.1", "127.0.0.1", "169.254.0.1",
		"100.64.0.1", "100.127.255.255", "0.1.2.3", "192.0.0.1", "192.0.2.1", "198.18.0.1",
		"198.19.255.255", "198.51.100.1", "203.0.113.1", "224.0.0.1", "239.255.255.250",
		"240.0.0.1", "255.255.255.255", "::1", "2001:db8::1",
	} {
		if publicIPv4(netip.MustParseAddr(s)) {
			t.Errorf("%s should not be public", s)
		}
	}
}
