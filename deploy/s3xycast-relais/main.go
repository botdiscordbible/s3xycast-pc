// S3XYCast PC — s3x-relais: the relay of last resort.
//
// What it is for
// --------------
// S3XYCast PC streams a PC to a browser directly: the picture goes from the
// home to the car without touching any server. That needs a way in. A home
// router opens one when it is asked (UPnP); some do not answer, and some homes
// share their address with others and have no way in at all. A car's browser,
// for its part, sends no UDP, so it cannot be met half-way either.
//
// For those, and only for those, the two ends meet here. The browser connects
// to this server (TURN, RFC 8656, over UDP or TCP), the machine sends to the
// address the browser was given, and this process copies the packets across.
// The direct path stays the one that is tried first and preferred: a relayed
// candidate has the lowest priority there is, in the browser and on the
// machine alike.
//
// What it will not do
// -------------------
// Carry traffic for anyone who asks. Credentials come from the introduction
// server, last a day, and name the one machine they are for (cred.go); a
// client reaches that address and no other (policy.go). Relayed TCP is refused
// outright: nothing here needs it.
//
// What it knows
// -------------
// The addresses of the two ends, while they are connected, as any relay must.
// None of it is written down: the log counts, it does not name, unless
// S3X_RELAIS_LOG_ADDR=1 is set to chase a fault.
//
// This program is not part of MoonlightWeb. It uses github.com/pion/turn (MIT).
package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/netip"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/pion/logging"
	"github.com/pion/turn/v5"
	"golang.org/x/time/rate"
)

// ── Configuration (env-driven, like mw-rendezvous) ──────────────────────────

type config struct {
	listen       string     // S3X_RELAIS_LISTEN        (default "0.0.0.0:3478"; UDP and TCP)
	publicIP     netip.Addr // S3X_RELAIS_PUBLIC_IP     (required: the address browsers and machines reach)
	minPort      uint16     // S3X_RELAIS_PORTS         (default "49160-49359"; UDP, one per allocation)
	maxPort      uint16
	realm        string // S3X_RELAIS_REALM         (default "pc.s3xycast.com")
	secret       []byte // S3X_RELAIS_SECRET[_FILE] (shared with mw-rendezvous)
	maxPerPeer   int    // S3X_RELAIS_MAX_PER_MACHINE (default 8 allocations at once for one machine)
	maxAll       int    // S3X_RELAIS_MAX_ALLOCATIONS (default 150; never more than the port range)
	kbps         int    // S3X_RELAIS_MAX_KBPS      (default 40000 each way per allocation; 0 = no ceiling)
	status       string // S3X_RELAIS_STATUS        (default "127.0.0.1:8091"; "" = none)
	allowPrivate bool   // S3X_RELAIS_ALLOW_PRIVATE (tests and benches only: private peers accepted)
	logAddr      bool   // S3X_RELAIS_LOG_ADDR      (addresses in the log, to chase a fault)
}

const minSecretBytes = 32

func envOr(name, def string) string {
	if v := strings.TrimSpace(os.Getenv(name)); v != "" {
		return v
	}
	return def
}

func envInt(name string, def, min, max int) (int, error) {
	text := strings.TrimSpace(os.Getenv(name))
	if text == "" {
		return def, nil
	}
	v, err := strconv.Atoi(text)
	if err != nil || v < min || v > max {
		return 0, fmt.Errorf("%s must be a number from %d to %d", name, min, max)
	}
	return v, nil
}

func envBool(name string) bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(name))) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}

// readSecret returns the secret shared with the introduction server: the
// variable if it is set, else the file. A file keeps it out of the registry,
// where a Windows service's environment is stored.
func readSecret() ([]byte, error) {
	if v := os.Getenv("S3X_RELAIS_SECRET"); v != "" {
		if len(v) < minSecretBytes {
			return nil, fmt.Errorf("S3X_RELAIS_SECRET is shorter than %d bytes", minSecretBytes)
		}
		return []byte(v), nil
	}
	path := strings.TrimSpace(os.Getenv("S3X_RELAIS_SECRET_FILE"))
	if path == "" {
		return nil, errors.New("S3X_RELAIS_SECRET or S3X_RELAIS_SECRET_FILE is required")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("S3X_RELAIS_SECRET_FILE: %w", err)
	}
	secret := bytes.TrimSpace(bytes.TrimPrefix(raw, []byte{0xEF, 0xBB, 0xBF}))
	if len(secret) < minSecretBytes {
		return nil, fmt.Errorf("S3X_RELAIS_SECRET_FILE holds fewer than %d bytes", minSecretBytes)
	}
	return secret, nil
}

func parsePorts(text string) (uint16, uint16, error) {
	lo, hi, ok := strings.Cut(text, "-")
	if !ok {
		return 0, 0, errors.New("S3X_RELAIS_PORTS must be <first>-<last>")
	}
	first, err1 := strconv.ParseUint(strings.TrimSpace(lo), 10, 16)
	last, err2 := strconv.ParseUint(strings.TrimSpace(hi), 10, 16)
	if err1 != nil || err2 != nil || first < 1024 || last < first {
		return 0, 0, errors.New("S3X_RELAIS_PORTS must be <first>-<last>, from 1024 up")
	}
	return uint16(first), uint16(last), nil
}

func loadConfig() (config, error) {
	var (
		cfg config
		err error
	)
	cfg.listen = envOr("S3X_RELAIS_LISTEN", "0.0.0.0:3478")
	cfg.realm = envOr("S3X_RELAIS_REALM", "pc.s3xycast.com")
	cfg.status = envOr("S3X_RELAIS_STATUS", "127.0.0.1:8091")
	if strings.EqualFold(cfg.status, "off") {
		cfg.status = ""
	}
	cfg.allowPrivate = envBool("S3X_RELAIS_ALLOW_PRIVATE")
	cfg.logAddr = envBool("S3X_RELAIS_LOG_ADDR")

	ip, perr := netip.ParseAddr(strings.TrimSpace(os.Getenv("S3X_RELAIS_PUBLIC_IP")))
	if perr != nil || !ip.Is4() {
		return cfg, errors.New("S3X_RELAIS_PUBLIC_IP is required: this server's public IPv4 address")
	}
	cfg.publicIP = ip

	if cfg.minPort, cfg.maxPort, err = parsePorts(envOr("S3X_RELAIS_PORTS", "49160-49359")); err != nil {
		return cfg, err
	}
	if cfg.maxPerPeer, err = envInt("S3X_RELAIS_MAX_PER_MACHINE", 8, 1, 1000); err != nil {
		return cfg, err
	}
	if cfg.maxAll, err = envInt("S3X_RELAIS_MAX_ALLOCATIONS", 150, 1, 60000); err != nil {
		return cfg, err
	}
	// One port per allocation: the range is the hard ceiling whatever is asked.
	if ports := int(cfg.maxPort-cfg.minPort) + 1; cfg.maxAll > ports {
		cfg.maxAll = ports
	}
	if cfg.kbps, err = envInt("S3X_RELAIS_MAX_KBPS", 40000, 0, 10_000_000); err != nil {
		return cfg, err
	}
	if cfg.secret, err = readSecret(); err != nil {
		return cfg, err
	}
	return cfg, nil
}

// ── The relayed socket: counted, and held under a ceiling ───────────────────

// meteredConn is the UDP socket of one allocation, on the machine's side.
// ReadFrom is what a machine sends (the picture and the sound); WriteTo is
// what goes to it (the inputs, the acknowledgements).
type meteredConn struct {
	net.PacketConn
	p       *policy
	in, out *rate.Limiter // nil: no ceiling
}

func (c *meteredConn) ReadFrom(b []byte) (int, net.Addr, error) {
	for {
		n, addr, err := c.PacketConn.ReadFrom(b)
		if err != nil {
			return n, addr, err
		}
		// Over the ceiling: dropped here, as a full queue would drop it. The
		// stream's own congestion control reads that as a slower line.
		if c.in != nil && !c.in.AllowN(time.Now(), n) {
			c.p.overLimit.Add(int64(n))
			continue
		}
		c.p.fromPeers.Add(int64(n))
		return n, addr, nil
	}
}

func (c *meteredConn) WriteTo(b []byte, addr net.Addr) (int, error) {
	if c.out != nil && !c.out.AllowN(time.Now(), len(b)) {
		c.p.overLimit.Add(int64(len(b)))
		return len(b), nil
	}
	n, err := c.PacketConn.WriteTo(b, addr)
	if err == nil {
		c.p.toPeers.Add(int64(n))
	}
	return n, err
}

var errNoTCPRelay = errors.New("relayed TCP is not offered by this server")

// relayGenerator hands out the UDP socket of an allocation, from the port
// range, wrapped in the counters and the ceiling. It refuses relayed TCP
// (RFC 6062): nothing in S3XYCast PC asks for it, and it would be one more way
// to make this server open connections on someone's behalf.
type relayGenerator struct {
	turn.RelayAddressGenerator
	p           *policy
	bytesPerSec int // 0: no ceiling
}

func newLimiter(bytesPerSec int) *rate.Limiter {
	if bytesPerSec <= 0 {
		return nil
	}
	// Half a second of burst, and never less than a few full packets: a key
	// frame arrives all at once, and a limiter smaller than one packet lets
	// nothing through at all.
	burst := bytesPerSec / 2
	if burst < 64*1024 {
		burst = 64 * 1024
	}
	return rate.NewLimiter(rate.Limit(bytesPerSec), burst)
}

func (g *relayGenerator) AllocatePacketConn(conf turn.AllocateListenerConfig) (net.PacketConn, net.Addr, error) {
	conn, addr, err := g.RelayAddressGenerator.AllocatePacketConn(conf)
	if err != nil {
		return nil, nil, err
	}
	return &meteredConn{
		PacketConn: conn,
		p:          g.p,
		in:         newLimiter(g.bytesPerSec),
		out:        newLimiter(g.bytesPerSec),
	}, addr, nil
}

func (g *relayGenerator) AllocateListener(turn.AllocateListenerConfig) (net.Listener, net.Addr, error) {
	return nil, nil, errNoTCPRelay
}

func (g *relayGenerator) AllocateConn(turn.AllocateConnConfig) (net.Conn, error) {
	return nil, errNoTCPRelay
}

// ── The server ──────────────────────────────────────────────────────────────

type relay struct {
	cfg    config
	policy *policy
	server *turn.Server
	udp    net.PacketConn
	tcp    net.Listener
}

// auth is the relay library's question "who is this, and what is their key":
// asked on every Allocate, Refresh, CreatePermission and ChannelBind.
func (r *relay) auth(ra *turn.RequestAttributes) (string, []byte, bool) {
	peer, err := parseUsername(ra.Username, time.Now(), r.cfg.allowPrivate)
	if err != nil {
		return "", nil, false
	}
	// The key the library compares the request's integrity with. A username
	// nobody issued gets a key too — the wrong one, and the check fails there.
	password := mintPassword(r.cfg.secret, ra.Username)
	r.policy.remember(ra.SrcAddr, peer)
	return peer.String(), turn.GenerateAuthKey(ra.Username, ra.Realm, password), true
}

// quota is asked before an allocation is made. What the library hands over is
// the user id auth returned, not the username: the machine's address, which is
// what the ceiling is counted by.
func (r *relay) quota(userID, _ string, _ net.Addr) bool {
	return r.policy.room(userID)
}

func newRelay(cfg config) (*relay, error) {
	r := &relay{cfg: cfg, policy: newPolicy(cfg.maxPerPeer, cfg.maxAll)}

	udp, err := net.ListenPacket("udp4", cfg.listen)
	if err != nil {
		return nil, fmt.Errorf("listen udp %s: %w", cfg.listen, err)
	}
	tcp, err := net.Listen("tcp4", cfg.listen)
	if err != nil {
		_ = udp.Close()
		return nil, fmt.Errorf("listen tcp %s: %w", cfg.listen, err)
	}
	r.udp, r.tcp = udp, tcp

	generator := func() turn.RelayAddressGenerator {
		return &relayGenerator{
			RelayAddressGenerator: &turn.RelayAddressGeneratorPortRange{
				RelayAddress: net.IP(cfg.publicIP.AsSlice()),
				Address:      "0.0.0.0",
				MinPort:      cfg.minPort,
				MaxPort:      cfg.maxPort,
				MaxRetries:   50,
			},
			p:           r.policy,
			bytesPerSec: cfg.kbps * 1000 / 8,
		}
	}

	loggers := logging.NewDefaultLoggerFactory()
	loggers.DefaultLogLevel = logging.LogLevelError
	if cfg.logAddr {
		loggers.DefaultLogLevel = logging.LogLevelDebug
	}

	r.server, err = turn.NewServer(turn.ServerConfig{
		Realm:         cfg.realm,
		AuthHandler:   r.auth,
		QuotaHandler:  r.quota,
		LoggerFactory: loggers,
		EventHandler: turn.EventHandler{
			OnAllocationCreated: func(_, _ net.Addr, _, userID, _ string, _ net.Addr, _ int) {
				r.policy.allocated(userID)
			},
			OnAllocationDeleted: func(_, _ net.Addr, _, userID, _ string) {
				r.policy.released(userID)
			},
		},
		PacketConnConfigs: []turn.PacketConnConfig{{
			PacketConn:            udp,
			RelayAddressGenerator: generator(),
			PermissionHandler:     r.policy.permit,
		}},
		ListenerConfigs: []turn.ListenerConfig{{
			Listener:              tcp,
			RelayAddressGenerator: generator(),
			PermissionHandler:     r.policy.permit,
		}},
	})
	if err != nil {
		_ = udp.Close()
		_ = tcp.Close()
		return nil, fmt.Errorf("relay: %w", err)
	}
	return r, nil
}

func (r *relay) close() {
	if r.server != nil {
		_ = r.server.Close()
	}
}

// statusHandler serves the two local pages: /healthz for whoever installs the
// service, /statz for whoever wonders how much goes through it.
func (r *relay) statusHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte("ok\n"))
	})
	mux.HandleFunc("/statz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(r.policy.status())
	})
	return mux
}

func main() {
	log.SetFlags(log.LstdFlags | log.LUTC)
	cfg, err := loadConfig()
	if err != nil {
		log.Fatalf("[s3x-relais] %v", err)
	}
	r, err := newRelay(cfg)
	if err != nil {
		log.Fatalf("[s3x-relais] %v", err)
	}
	defer r.close()

	ceiling := "no ceiling"
	if cfg.kbps > 0 {
		ceiling = fmt.Sprintf("%d kbit/s each way per allocation", cfg.kbps)
	}
	log.Printf("[s3x-relais] listening on %s (udp and tcp), relaying from %s ports %d-%d, "+
		"%d allocations at most (%d per machine), %s",
		cfg.listen, cfg.publicIP, cfg.minPort, cfg.maxPort, cfg.maxAll, cfg.maxPerPeer, ceiling)
	if cfg.allowPrivate {
		log.Printf("[s3x-relais] WARNING: S3X_RELAIS_ALLOW_PRIVATE is on — private peers are accepted. " +
			"For tests only, never on a server.")
	}

	if cfg.status != "" {
		srv := &http.Server{Addr: cfg.status, Handler: r.statusHandler(), ReadHeaderTimeout: 5 * time.Second}
		go func() {
			if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
				log.Printf("[s3x-relais] status page on %s unavailable: %v", cfg.status, err)
			}
		}()
		defer srv.Close()
	}

	// Housekeeping: forget idle clients, and say once in a while what went
	// through — in counts and bytes, never in names.
	tick := time.NewTicker(time.Minute)
	defer tick.Stop()
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	var lastBytes int64
	minutes := 0
	for {
		select {
		case <-stop:
			log.Printf("[s3x-relais] stopping")
			return
		case <-tick.C:
			r.policy.sweep()
			minutes++
			if minutes%10 != 0 {
				continue
			}
			st := r.policy.status()
			total := st.FromMachines + st.ToMachines
			if total == lastBytes && st.Allocations == 0 {
				continue
			}
			log.Printf("[s3x-relais] %d allocation(s) for %d machine(s); %d MB relayed since start "+
				"(+%d MB in ten minutes); refused: %d quota, %d peer",
				st.Allocations, st.Machines, total/1_000_000, (total-lastBytes)/1_000_000,
				st.RefusedQuota, st.RefusedPeer)
			lastBytes = total
		}
	}
}
