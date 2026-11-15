// S3XYCast PC — s3x-relais: who may relay to whom, and how much.
//
// Three rules, all decided here so that they can be tested without a socket:
//
//	one peer per client     a client's traffic goes to the address its credentials
//	                        name, and to no other (permission);
//	a ceiling per machine   so many allocations at once for one machine, and so
//	                        many for the whole server (quota);
//	a ceiling per relay     so many bytes a second through one allocation, each
//	                        way (limit), so one stream cannot take the server's line.
package main

import (
	"net"
	"net/netip"
	"sync"
	"sync/atomic"
	"time"
)

// How long a client's entry is kept after its last authenticated request. A
// browser refreshes its permissions every few minutes and its allocation at
// least every ten, each of which passes through auth again.
const clientIdle = 30 * time.Minute

type clientEntry struct {
	peer netip.Addr
	seen time.Time
}

type policy struct {
	mu      sync.Mutex
	clients map[string]clientEntry // the client's transport address → the peer it may reach
	perPeer map[string]int         // allocations held, by peer (the user id)
	held    int                    // allocations held, all of them

	maxPerPeer int
	maxAll     int

	// Counters for the status page: nothing here names anyone.
	created   atomic.Int64
	refusedQ  atomic.Int64
	refusedP  atomic.Int64
	fromPeers atomic.Int64 // bytes received from machines (the picture)
	toPeers   atomic.Int64 // bytes sent to machines (the inputs)
	overLimit atomic.Int64 // bytes dropped by the per-relay ceiling
	startedAt time.Time
	now       func() time.Time
}

func newPolicy(maxPerPeer, maxAll int) *policy {
	return &policy{
		clients:    make(map[string]clientEntry),
		perPeer:    make(map[string]int),
		maxPerPeer: maxPerPeer,
		maxAll:     maxAll,
		startedAt:  time.Now(),
		now:        time.Now,
	}
}

// remember notes which peer the client at addr proved it may reach. Called on
// every authenticated request, so an entry lives as long as its allocation.
func (p *policy) remember(addr net.Addr, peer netip.Addr) {
	if addr == nil {
		return
	}
	p.mu.Lock()
	p.clients[addr.String()] = clientEntry{peer: peer, seen: p.now()}
	p.mu.Unlock()
}

// permit answers a CreatePermission or a ChannelBind: the peer named in the
// client's credentials, and that one only. A client the relay has not seen
// authenticate reaches nobody.
func (p *policy) permit(client net.Addr, peerIP net.IP) bool {
	if client == nil {
		p.refusedP.Add(1)
		return false
	}
	want, ok := netip.AddrFromSlice(peerIP)
	if !ok {
		p.refusedP.Add(1)
		return false
	}
	want = want.Unmap()
	p.mu.Lock()
	entry, known := p.clients[client.String()]
	p.mu.Unlock()
	if !known || entry.peer != want {
		p.refusedP.Add(1)
		return false
	}
	return true
}

// room answers an Allocate: whether the machine at peer, and the server, have
// room for one more allocation.
func (p *policy) room(peer string) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.maxAll > 0 && p.held >= p.maxAll {
		p.refusedQ.Add(1)
		return false
	}
	if p.maxPerPeer > 0 && p.perPeer[peer] >= p.maxPerPeer {
		p.refusedQ.Add(1)
		return false
	}
	return true
}

func (p *policy) allocated(peer string) {
	p.mu.Lock()
	p.perPeer[peer]++
	p.held++
	p.mu.Unlock()
	p.created.Add(1)
}

func (p *policy) released(peer string) {
	p.mu.Lock()
	if n := p.perPeer[peer]; n <= 1 {
		delete(p.perPeer, peer)
	} else {
		p.perPeer[peer] = n - 1
	}
	if p.held > 0 {
		p.held--
	}
	p.mu.Unlock()
}

// sweep forgets clients that have not authenticated for clientIdle.
func (p *policy) sweep() {
	cutoff := p.now().Add(-clientIdle)
	p.mu.Lock()
	for addr, entry := range p.clients {
		if entry.seen.Before(cutoff) {
			delete(p.clients, addr)
		}
	}
	p.mu.Unlock()
}

type status struct {
	UptimeSeconds int64 `json:"uptime_seconds"`
	Allocations   int   `json:"allocations"`
	Machines      int   `json:"machines"`
	Clients       int   `json:"clients"`
	Created       int64 `json:"allocations_created"`
	RefusedQuota  int64 `json:"refused_quota"`
	RefusedPeer   int64 `json:"refused_peer"`
	FromMachines  int64 `json:"bytes_from_machines"`
	ToMachines    int64 `json:"bytes_to_machines"`
	OverLimit     int64 `json:"bytes_over_limit"`
}

func (p *policy) status() status {
	p.mu.Lock()
	held, machines, clients := p.held, len(p.perPeer), len(p.clients)
	p.mu.Unlock()
	return status{
		UptimeSeconds: int64(p.now().Sub(p.startedAt).Seconds()),
		Allocations:   held,
		Machines:      machines,
		Clients:       clients,
		Created:       p.created.Load(),
		RefusedQuota:  p.refusedQ.Load(),
		RefusedPeer:   p.refusedP.Load(),
		FromMachines:  p.fromPeers.Load(),
		ToMachines:    p.toPeers.Load(),
		OverLimit:     p.overLimit.Load(),
	}
}
