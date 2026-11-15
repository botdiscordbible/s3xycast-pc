package main

import (
	"bytes"
	"net"
	"net/netip"
	"strings"
	"testing"
	"time"

	"github.com/pion/logging"
	"github.com/pion/turn/v5"
)

// The relay itself, on loopback, spoken to by the library's own client the way
// a browser speaks to it: over UDP and over TCP. The "machine" is a plain UDP
// socket, which is all a PC is from where the relay stands.

const testSecret = "0123456789abcdef0123456789abcdef"

func startRelay(t *testing.T, mutate func(*config)) *relay {
	t.Helper()
	cfg := config{
		listen:       "127.0.0.1:0",
		publicIP:     netip.MustParseAddr("127.0.0.1"),
		minPort:      51000,
		maxPort:      51199,
		realm:        "relais.test",
		secret:       []byte(testSecret),
		maxPerPeer:   8,
		maxAll:       100,
		allowPrivate: true,
	}
	if mutate != nil {
		mutate(&cfg)
	}
	r, err := newRelay(cfg)
	if err != nil {
		t.Fatalf("relay: %v", err)
	}
	t.Cleanup(r.close)
	return r
}

func quietLoggers() logging.LoggerFactory {
	f := logging.NewDefaultLoggerFactory()
	f.DefaultLogLevel = logging.LogLevelDisabled
	return f
}

// credentials for a machine at peer, as the introduction server would issue them.
func credentials(peer string, validFor time.Duration) (string, string) {
	username := mintUsername(netip.MustParseAddr(peer), time.Now().Add(validFor))
	return username, mintPassword([]byte(testSecret), username)
}

func dialClient(t *testing.T, r *relay, overTCP bool, username, password string) *turn.Client {
	t.Helper()
	var (
		conn   net.PacketConn
		server string
	)
	if overTCP {
		server = r.tcp.Addr().String()
		c, err := net.Dial("tcp4", server)
		if err != nil {
			t.Fatalf("dial tcp: %v", err)
		}
		conn = turn.NewSTUNConn(c)
	} else {
		server = r.udp.LocalAddr().String()
		c, err := net.ListenPacket("udp4", "127.0.0.1:0")
		if err != nil {
			t.Fatalf("listen udp: %v", err)
		}
		conn = c
	}
	client, err := turn.NewClient(&turn.ClientConfig{
		STUNServerAddr: server,
		TURNServerAddr: server,
		Conn:           conn,
		Username:       username,
		Password:       password,
		Realm:          r.cfg.realm,
		RTO:            200 * time.Millisecond,
		LoggerFactory:  quietLoggers(),
	})
	if err != nil {
		t.Fatalf("client: %v", err)
	}
	t.Cleanup(func() {
		client.Close()
		_ = conn.Close()
	})
	if err := client.Listen(); err != nil {
		t.Fatalf("client listen: %v", err)
	}
	return client
}

func machineSocket(t *testing.T) net.PacketConn {
	t.Helper()
	c, err := net.ListenPacket("udp4", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("machine socket: %v", err)
	}
	t.Cleanup(func() { _ = c.Close() })
	return c
}

func readWithin(t *testing.T, c net.PacketConn, d time.Duration) ([]byte, net.Addr, bool) {
	t.Helper()
	_ = c.SetReadDeadline(time.Now().Add(d))
	buf := make([]byte, 2000)
	n, from, err := c.ReadFrom(buf)
	if err != nil {
		return nil, nil, false
	}
	return buf[:n], from, true
}

// Both ways through the relay, for a client on each transport.
func TestRelayCarriesBothWays(t *testing.T) {
	for _, overTCP := range []bool{false, true} {
		name := "udp client"
		if overTCP {
			name = "tcp client"
		}
		t.Run(name, func(t *testing.T) {
			r := startRelay(t, nil)
			username, password := credentials("127.0.0.1", time.Hour)
			client := dialClient(t, r, overTCP, username, password)

			// The relay answers plain STUN too: it is the address the entry
			// page asks its own public address of.
			if _, err := client.SendBindingRequest(); err != nil {
				t.Fatalf("binding request: %v", err)
			}

			relayed, err := client.Allocate()
			if err != nil {
				t.Fatalf("allocate: %v", err)
			}
			defer relayed.Close()
			relayAddr := relayed.LocalAddr().(*net.UDPAddr)
			if !relayAddr.IP.Equal(net.ParseIP("127.0.0.1")) || relayAddr.Port < 51000 || relayAddr.Port > 51199 {
				t.Fatalf("relayed address %v is outside the announced address and range", relayAddr)
			}

			machine := machineSocket(t)

			// Browser → machine. The write opens the permission first.
			if _, err := relayed.WriteTo([]byte("from the browser"), machine.LocalAddr()); err != nil {
				t.Fatalf("write through the relay: %v", err)
			}
			got, from, ok := readWithin(t, machine, 3*time.Second)
			if !ok || string(got) != "from the browser" {
				t.Fatalf("the machine received %q (ok=%v)", got, ok)
			}
			if from.String() != relayAddr.String() {
				t.Fatalf("the machine heard from %v, not from the relayed address %v", from, relayAddr)
			}

			// Machine → browser.
			if _, err := machine.WriteTo([]byte("from the machine"), relayAddr); err != nil {
				t.Fatalf("machine write: %v", err)
			}
			back, peer, ok := readWithin(t, relayed, 3*time.Second)
			if !ok || string(back) != "from the machine" {
				t.Fatalf("the browser received %q (ok=%v)", back, ok)
			}
			if peer.String() != machine.LocalAddr().String() {
				t.Fatalf("the browser heard from %v, not from the machine %v", peer, machine.LocalAddr())
			}

			st := r.policy.status()
			if st.Allocations != 1 || st.Machines != 1 || st.Created != 1 {
				t.Fatalf("status after one allocation: %+v", st)
			}
			if st.FromMachines < int64(len("from the machine")) || st.ToMachines < int64(len("from the browser")) {
				t.Fatalf("bytes were not counted: %+v", st)
			}
		})
	}
}

// Credentials name one machine: the relay carries nothing to another address.
func TestRelayReachesOnlyTheNamedMachine(t *testing.T) {
	r := startRelay(t, nil)
	// Valid credentials — for a machine at another address.
	username, password := credentials("127.0.0.2", time.Hour)
	client := dialClient(t, r, false, username, password)
	relayed, err := client.Allocate()
	if err != nil {
		t.Fatalf("allocate: %v", err)
	}
	defer relayed.Close()

	other := machineSocket(t) // on 127.0.0.1: not the address the credentials name
	if _, err := relayed.WriteTo([]byte("to someone else"), other.LocalAddr()); err == nil {
		// The write may be accepted locally and refused by the server; what
		// matters is below: nothing arrives.
		t.Log("the client library accepted the write locally")
	}
	if got, _, ok := readWithin(t, other, 700*time.Millisecond); ok {
		t.Fatalf("the relay carried %q to an address the credentials do not name", got)
	}
	// And nothing comes back in from it either.
	if _, err := other.WriteTo([]byte("uninvited"), relayed.LocalAddr()); err != nil {
		t.Fatalf("write: %v", err)
	}
	if got, _, ok := readWithin(t, relayed, 700*time.Millisecond); ok {
		t.Fatalf("the relay delivered %q from an address the credentials do not name", got)
	}
	if r.policy.status().RefusedPeer == 0 {
		t.Fatal("the refusal was not counted")
	}
}

func TestRelayRefusesBadCredentials(t *testing.T) {
	r := startRelay(t, nil)
	good, goodPassword := credentials("127.0.0.1", time.Hour)

	cases := []struct{ name, username, password string }{
		{"wrong password", good, goodPassword + "x"},
		{"another username with this password", strings.Replace(good, "127.0.0.1", "127.0.0.3", 1), goodPassword},
		{"not our format", "someone", "something"},
	}
	expired := mintUsername(netip.MustParseAddr("127.0.0.1"), time.Now().Add(-time.Minute))
	cases = append(cases, struct{ name, username, password string }{
		"expired", expired, mintPassword([]byte(testSecret), expired),
	})
	tooFar := mintUsername(netip.MustParseAddr("127.0.0.1"), time.Now().Add(72*time.Hour))
	cases = append(cases, struct{ name, username, password string }{
		"valid for three days", tooFar, mintPassword([]byte(testSecret), tooFar),
	})

	for _, c := range cases {
		client := dialClient(t, r, false, c.username, c.password)
		if conn, err := client.Allocate(); err == nil {
			_ = conn.Close()
			t.Errorf("%s: an allocation was granted", c.name)
		}
	}
	if st := r.policy.status(); st.Allocations != 0 || st.Created != 0 {
		t.Fatalf("status after refusals: %+v", st)
	}
}

// A private peer is refused on a server (the default), whatever the signature says.
func TestRelayRefusesPrivatePeersByDefault(t *testing.T) {
	r := startRelay(t, func(c *config) { c.allowPrivate = false })
	username, password := credentials("127.0.0.1", time.Hour)
	client := dialClient(t, r, false, username, password)
	if conn, err := client.Allocate(); err == nil {
		_ = conn.Close()
		t.Fatal("credentials naming a loopback machine were accepted")
	}
}

func TestRelayQuotaPerMachine(t *testing.T) {
	r := startRelay(t, func(c *config) { c.maxPerPeer = 1 })
	username, password := credentials("127.0.0.1", time.Hour)

	first := dialClient(t, r, false, username, password)
	conn, err := first.Allocate()
	if err != nil {
		t.Fatalf("first allocation: %v", err)
	}
	second := dialClient(t, r, true, username, password)
	if extra, err := second.Allocate(); err == nil {
		_ = extra.Close()
		t.Fatal("a second allocation was granted past the per-machine ceiling")
	}
	// Another machine is not held back by the first one's ceiling.
	otherUser, otherPassword := credentials("127.0.0.2", time.Hour)
	third := dialClient(t, r, false, otherUser, otherPassword)
	otherConn, err := third.Allocate()
	if err != nil {
		t.Fatalf("another machine was refused: %v", err)
	}
	_ = otherConn.Close()

	// Released, the place is free again.
	_ = conn.Close()
	deadline := time.Now().Add(3 * time.Second)
	for r.policy.status().Allocations != 0 && time.Now().Before(deadline) {
		time.Sleep(50 * time.Millisecond)
	}
	again := dialClient(t, r, false, username, password)
	reconn, err := again.Allocate()
	if err != nil {
		t.Fatalf("allocation after a release: %v", err)
	}
	_ = reconn.Close()
}

func TestRelayRefusesRelayedTCP(t *testing.T) {
	r := startRelay(t, nil)
	username, password := credentials("127.0.0.1", time.Hour)
	client := dialClient(t, r, true, username, password)
	if alloc, err := client.AllocateTCP(); err == nil {
		_ = alloc.Close()
		t.Fatal("a relayed TCP allocation was granted")
	}
}

// The ceiling drops what is over it and lets the rest through.
func TestRelayCeiling(t *testing.T) {
	// 512 kbit/s: 64 000 bytes a second, and a burst of 64 KiB.
	r := startRelay(t, func(c *config) { c.kbps = 512 })
	username, password := credentials("127.0.0.1", time.Hour)
	client := dialClient(t, r, false, username, password)
	relayed, err := client.Allocate()
	if err != nil {
		t.Fatalf("allocate: %v", err)
	}
	defer relayed.Close()
	machine := machineSocket(t)
	if _, err := relayed.WriteTo([]byte("open"), machine.LocalAddr()); err != nil {
		t.Fatalf("open the permission: %v", err)
	}
	if _, _, ok := readWithin(t, machine, 3*time.Second); !ok {
		t.Fatal("the permission did not open")
	}

	// 400 packets of 1000 bytes at once: far more than a burst.
	payload := bytes.Repeat([]byte{'x'}, 1000)
	for i := 0; i < 400; i++ {
		if _, err := machine.WriteTo(payload, relayed.LocalAddr()); err != nil {
			t.Fatalf("machine write: %v", err)
		}
	}
	received := 0
	for {
		if _, _, ok := readWithin(t, relayed, 500*time.Millisecond); !ok {
			break
		}
		received++
	}
	st := r.policy.status()
	if received == 0 {
		t.Fatal("the ceiling let nothing through")
	}
	if received >= 400 || st.OverLimit == 0 {
		t.Fatalf("the ceiling dropped nothing: %d of 400 arrived, over_limit=%d", received, st.OverLimit)
	}
	t.Logf("%d of 400 packets passed a 512 kbit/s ceiling; %d bytes dropped", received, st.OverLimit)
}
