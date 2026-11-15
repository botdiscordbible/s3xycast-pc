package main

import (
	"net"
	"net/netip"
	"testing"
	"time"
)

func udpAddr(s string) net.Addr {
	a, err := net.ResolveUDPAddr("udp4", s)
	if err != nil {
		panic(err)
	}
	return a
}

func TestPermitOnlyTheCredentialsPeer(t *testing.T) {
	p := newPolicy(8, 100)
	client := udpAddr("198.51.100.20:40000")
	machine := netip.MustParseAddr("109.215.10.20")

	// Not seen yet: nobody.
	if p.permit(client, net.ParseIP("109.215.10.20")) {
		t.Fatal("a client that never authenticated was let through")
	}
	p.remember(client, machine)
	if !p.permit(client, net.ParseIP("109.215.10.20")) {
		t.Fatal("the peer of the credentials was refused")
	}
	// The 16-byte form of the same address is the same address.
	if !p.permit(client, net.ParseIP("109.215.10.20").To16()) {
		t.Fatal("the IPv4-mapped form of the peer was refused")
	}
	for _, other := range []string{"109.215.10.21", "192.168.1.32", "127.0.0.1", "65.108.129.57", "8.8.8.8"} {
		if p.permit(client, net.ParseIP(other)) {
			t.Errorf("%s was let through for a client whose credentials name another machine", other)
		}
	}
	// Another port of the same client address is another client.
	if p.permit(udpAddr("198.51.100.20:40001"), net.ParseIP("109.215.10.20")) {
		t.Fatal("permission leaked to another client port")
	}
	if p.permit(nil, net.ParseIP("109.215.10.20")) || p.permit(client, nil) {
		t.Fatal("a missing address was let through")
	}
	if got := p.status().RefusedPeer; got != 9 {
		t.Fatalf("refused_peer = %d, want 9", got)
	}
}

func TestQuota(t *testing.T) {
	p := newPolicy(2, 3)
	if !p.room("a") {
		t.Fatal("no room on an empty server")
	}
	p.allocated("a")
	p.allocated("a")
	if p.room("a") {
		t.Fatal("a third allocation for one machine was accepted")
	}
	if !p.room("b") {
		t.Fatal("another machine was refused while the server has room")
	}
	p.allocated("b")
	if p.room("c") {
		t.Fatal("the server's own ceiling was passed")
	}
	p.released("a")
	if !p.room("a") || !p.room("c") {
		t.Fatal("a released allocation did not make room")
	}
	p.released("a")
	p.released("b")
	p.released("b") // once too many: must not go negative
	st := p.status()
	if st.Allocations != 0 || st.Machines != 0 || st.Created != 3 || st.RefusedQuota != 2 {
		t.Fatalf("status = %+v", st)
	}
	// No ceiling at all when both are zero.
	free := newPolicy(0, 0)
	for i := 0; i < 500; i++ {
		free.allocated("a")
	}
	if !free.room("a") {
		t.Fatal("a ceiling was applied where none is set")
	}
}

func TestSweepForgetsIdleClients(t *testing.T) {
	p := newPolicy(8, 100)
	now := time.Unix(1_800_000_000, 0)
	p.now = func() time.Time { return now }
	old, fresh := udpAddr("198.51.100.20:40000"), udpAddr("198.51.100.21:40000")
	machine := netip.MustParseAddr("109.215.10.20")
	p.remember(old, machine)
	now = now.Add(clientIdle - time.Minute)
	p.remember(fresh, machine)
	now = now.Add(2 * time.Minute) // old: past the idle time; fresh: two minutes old
	p.sweep()
	if p.permit(old, net.ParseIP("109.215.10.20")) {
		t.Fatal("an idle client was kept")
	}
	if !p.permit(fresh, net.ParseIP("109.215.10.20")) {
		t.Fatal("a recent client was forgotten")
	}
	if got := p.status().Clients; got != 1 {
		t.Fatalf("clients = %d, want 1", got)
	}
}
