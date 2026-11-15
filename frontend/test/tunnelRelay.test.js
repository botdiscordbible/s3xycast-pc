/*
 * S3XYCast PC — frontend TNR. GPLv3, like the file under test.
 *
 * The relay of last resort, as the entry page takes it from the introduction
 * server: named in the `ready` frame, handed to the peer connection behind the
 * server's own STUN answer, and reported once the connection is up.
 *
 * MoonlightWeb has no relay. This edition's is for the home whose router opens
 * nothing and for the browser that sends no UDP — a car's. Everything here is
 * about not trusting the frame further than its shape, and about the direct
 * path staying the first thing that is tried.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

function memoryStorage() {
    const map = new Map();
    return {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, String(v)),
        removeItem: (k) => map.delete(k),
    };
}

vi.mock('../../bootstrap/v1/pairing.js', () => ({
    loadIdentity: async () => ({ keyId: 'k', publicKeyBase64: 'p' }),
    helloMessage: () => ({ type: 'hello' }),
    verifyOffer: async () => true,
    signAnswer: async () => ({}),
}));

const HOST = 'a'.repeat(26);

class FakeWebSocket {
    static last = null;
    static OPEN = 1;
    constructor(url) {
        this.url = String(url);
        this.readyState = FakeWebSocket.OPEN;
        this.sent = [];
        FakeWebSocket.last = this;
    }
    send(s) {
        this.sent.push(s);
    }
    close() {}
    frame(obj) {
        this.onmessage({ data: JSON.stringify(obj) });
    }
}

const GRANT = {
    urls: ['turn:pc.example:3478?transport=udp', 'turn:pc.example:3478?transport=tcp'],
    username: '1800086400:109.215.10.20',
    credential: 'iU2tbBjtnBRD2LHtSLUQr7SYqK5bxu7VAC-v_0MFWTs',
    ttl: 86400,
};

let tunnelModule;

beforeEach(async () => {
    vi.stubGlobal('sessionStorage', memoryStorage());
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal('WebSocket', FakeWebSocket);
    FakeWebSocket.last = null;
    vi.resetModules();
    tunnelModule = await import('../../bootstrap/v1/tunnel.js');
});

describe('the relay named in the ready frame', () => {
    it('is read as one ICE server: its addresses and its credentials, nothing else', () => {
        expect(tunnelModule.relayOf({ t: 'ready', v: 1, ice: GRANT })).toEqual({
            urls: GRANT.urls,
            username: GRANT.username,
            credential: GRANT.credential,
        });
        // TLS, a bare address, an IPv6 literal: all things a relay may be.
        const odd = {
            ...GRANT,
            urls: [
                'turns:pc.example:5349?transport=tcp',
                'turn:203.0.113.5:3478',
                'turn:[2001:db8::1]:3478',
            ],
        };
        expect(tunnelModule.relayOf({ ice: odd }).urls).toEqual(odd.urls);
    });

    it('is absent when the server names none', () => {
        expect(tunnelModule.relayOf({ t: 'ready', v: 1 })).toBeNull();
        expect(tunnelModule.relayOf({ t: 'ready', ice: null })).toBeNull();
        expect(tunnelModule.relayOf(null)).toBeNull();
        expect(tunnelModule.relayOf({ ice: 'turn:pc.example:3478' })).toBeNull();
    });

    it('keeps only what looks like a relay address', () => {
        const mixed = {
            ...GRANT,
            urls: [
                'stun:pc.example:3478',
                'https://pc.example/',
                'turn:pc.example:3478 ?transport=udp',
                'turn:pc.example"><script>',
                'turn:pc.example:3478?transport=sctp',
                'turn:' + 'a'.repeat(300),
                42,
                'turn:pc.example:3478?transport=tcp',
            ],
        };
        expect(tunnelModule.relayOf({ ice: mixed }).urls).toEqual([
            'turn:pc.example:3478?transport=tcp',
        ]);
        // Nothing usable left: no relay at all, rather than credentials for nowhere.
        expect(
            tunnelModule.relayOf({ ice: { ...GRANT, urls: ['stun:pc.example:3478'] } }),
        ).toBeNull();
        expect(
            tunnelModule.relayOf({ ice: { ...GRANT, urls: 'turn:pc.example:3478' } }),
        ).toBeNull();
    });

    it('never hands a browser more than six addresses', () => {
        const many = {
            ...GRANT,
            urls: Array.from({ length: 20 }, (_, i) => `turn:pc${i}.example:3478`),
        };
        expect(tunnelModule.relayOf({ ice: many }).urls).toHaveLength(6);
    });

    it('is refused without credentials that are plain, short strings', () => {
        for (const bad of [
            { ...GRANT, username: '' },
            { ...GRANT, credential: '' },
            { ...GRANT, username: undefined },
            { ...GRANT, credential: 12345 },
            { ...GRANT, username: 'u'.repeat(300) },
            { ...GRANT, credential: { toString: () => 'x' } },
        ]) {
            expect(tunnelModule.relayOf({ ice: bad })).toBeNull();
        }
    });
});

describe('what the peer connection is given', () => {
    it('is the introduction server and nothing else when there is no relay', () => {
        expect(tunnelModule.iceServersFor('pc.example', null)).toEqual([
            { urls: 'stun:pc.example:3478' },
        ]);
    });

    it('is the introduction server first, then the relay', () => {
        const relay = tunnelModule.relayOf({ ice: GRANT });
        expect(tunnelModule.iceServersFor('pc.example', relay)).toEqual([
            { urls: 'stun:pc.example:3478' },
            relay,
        ]);
    });

    it('takes the relay from the ready frame of the line it opened', async () => {
        const t = new tunnelModule.Tunnel(HOST, 'https://example.test');
        expect(t._relay).toBeNull();
        expect(t.relayed).toBeNull();
        const pending = t.connect();
        pending.catch(() => {});
        await vi.waitFor(() => expect(FakeWebSocket.last).not.toBeNull());

        FakeWebSocket.last.frame({ t: 'ready', v: 1, ice: GRANT });
        await vi.waitFor(() => expect(t._relay).not.toBeNull());
        expect(t._relay.urls).toEqual(GRANT.urls);
        // The hello still goes out: the relay is a note beside the introduction.
        expect(FakeWebSocket.last.sent.some((s) => s.includes('hello'))).toBe(true);
    });

    it('has none when the ready frame names none, or names nonsense', async () => {
        for (const frame of [
            { t: 'ready', v: 1 },
            { t: 'ready', v: 1, ice: { urls: ['javascript:alert(1)'] } },
        ]) {
            const t = new tunnelModule.Tunnel(HOST, 'https://example.test');
            t._relay = { urls: ['turn:stale.example:3478'], username: 'u', credential: 'c' };
            const pending = t.connect();
            pending.catch(() => {});
            await vi.waitFor(() => expect(FakeWebSocket.last).not.toBeNull());
            FakeWebSocket.last.frame(frame);
            await vi.waitFor(() => expect(t._relay).toBeNull());
            FakeWebSocket.last = null;
        }
    });
});

describe('which way the connection went', () => {
    const stats = (reports) => ({
        getStats: async () => new Map(reports.map((r) => [r.id, r])),
    });
    const pair = {
        id: 'P1',
        type: 'candidate-pair',
        localCandidateId: 'L1',
        state: 'succeeded',
        nominated: true,
    };

    it('is relayed when the local side of the pair in use is a relayed candidate', async () => {
        const pc = stats([
            { id: 'T', type: 'transport', selectedCandidatePairId: 'P1' },
            pair,
            { id: 'L1', type: 'local-candidate', candidateType: 'relay' },
        ]);
        expect(await tunnelModule.routeIsRelayed(pc)).toBe(true);
    });

    it('is direct for a host, reflexive or peer-reflexive candidate', async () => {
        for (const candidateType of ['host', 'srflx', 'prflx']) {
            const pc = stats([
                { id: 'T', type: 'transport', selectedCandidatePairId: 'P1' },
                pair,
                { id: 'L1', type: 'local-candidate', candidateType },
            ]);
            expect(await tunnelModule.routeIsRelayed(pc)).toBe(false);
        }
    });

    it('reads the pair in use, not one that merely exists', async () => {
        const pc = stats([
            { id: 'T', type: 'transport', selectedCandidatePairId: 'P2' },
            pair,
            { id: 'L1', type: 'local-candidate', candidateType: 'relay' },
            {
                id: 'P2',
                type: 'candidate-pair',
                localCandidateId: 'L2',
                state: 'succeeded',
                nominated: true,
            },
            { id: 'L2', type: 'local-candidate', candidateType: 'host' },
        ]);
        expect(await tunnelModule.routeIsRelayed(pc)).toBe(false);
    });

    it('falls back on the nominated pair where the browser reports no transport', async () => {
        const pc = stats([pair, { id: 'L1', type: 'local-candidate', candidateType: 'relay' }]);
        expect(await tunnelModule.routeIsRelayed(pc)).toBe(true);
    });

    it('says nothing when the browser does not', async () => {
        expect(await tunnelModule.routeIsRelayed(stats([]))).toBeNull();
        expect(
            await tunnelModule.routeIsRelayed({
                getStats: async () => {
                    throw new Error('no');
                },
            }),
        ).toBeNull();
        expect(
            await tunnelModule.routeIsRelayed(
                stats([{ id: 'T', type: 'transport', selectedCandidatePairId: 'gone' }]),
            ),
        ).toBeNull();
    });
});
