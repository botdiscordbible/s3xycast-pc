/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * The relay of last resort, on the stream's side.
 *
 * MoonlightWeb's two WebRTC transports drop every relayed candidate: it runs no
 * relay, so one could only come from a server somebody slipped into the list.
 * This edition's host names its own in the ice-config it already sends — for a
 * browser no direct path reaches, a car's among them — and only then is a
 * relayed candidate passed on. Nothing else about the transports changes, and
 * the credentials never reach a console.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebRtcDataChannel } from '../js/api/WebRtcDataChannel.js';
import { WebRtcMedia } from '../js/api/WebRtcMedia.js';
import { iceServersForLog, relayAllowed, routeIsRelayed } from '../js/api/IceServers.js';

const STUN = { urls: 'stun:stun.example:3478' };
const RELAY = {
    urls: ['turn:pc.example:3478?transport=udp', 'turn:pc.example:3478?transport=tcp'],
    username: '1800086400:109.215.10.20',
    credential: 'iU2tbBjtnBRD2LHtSLUQr7SYqK5bxu7VAC-v_0MFWTs',
};
const RELAYED = 'candidate:9 1 udp 41885439 203.0.113.9 51002 typ relay raddr 0.0.0.0 rport 0';
const DIRECT = 'candidate:1 1 udp 2113937151 192.168.1.20 54034 typ host';

/** A peer connection that does nothing but hold its handlers and its configuration. */
class FakePeerConnection {
    static last = null;
    constructor(config) {
        this.config = config;
        this.iceConnectionState = 'new';
        this.connectionState = 'new';
        FakePeerConnection.last = this;
    }
    createDataChannel() {
        return { close() {} };
    }
    addTransceiver() {
        return {};
    }
    setConfiguration(config) {
        this.config = config;
    }
    close() {}
}

beforeEach(() => {
    FakePeerConnection.last = null;
    vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
    vi.stubGlobal('WebSocket', { OPEN: 1 });
    vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

/** What a transport sent on its signalling socket, as objects. */
function signalled(t) {
    return t.signalingWs.send.mock.calls.map((c) => JSON.parse(c[0]));
}

function transportOf(Transport) {
    const t = new Transport('wss://host.invalid/signal');
    t.signalingWs = { readyState: 1, send: vi.fn() };
    return t;
}

describe.each([
    ['WebRtcDataChannel', WebRtcDataChannel],
    ['WebRtcMedia', WebRtcMedia],
])('%s — relayed candidates', (_name, Transport) => {
    it('drops them when the host named no relay, as it always did', () => {
        const t = transportOf(Transport);
        t._handleSignalingMessage({ type: 'ice-config', iceServers: [STUN], iceTimeoutMs: 8000 });
        t._createPeerConnection();
        const pc = FakePeerConnection.last;

        pc.onicecandidate({ candidate: { candidate: RELAYED, sdpMid: '0' } });
        pc.onicecandidate({ candidate: { candidate: DIRECT, sdpMid: '0' } });

        const sent = signalled(t).filter((m) => m.type === 'ice');
        expect(sent.map((m) => m.candidate)).toEqual([DIRECT]);
        expect(t._relayAllowed).toBe(false);
    });

    it('passes them on when the host names its relay and says so', () => {
        const t = transportOf(Transport);
        t._handleSignalingMessage({
            type: 'ice-config',
            iceServers: [STUN, RELAY],
            relay: true,
            iceTimeoutMs: 8000,
        });
        t._createPeerConnection();
        const pc = FakePeerConnection.last;

        // The relay is one of the servers the browser is given.
        expect(pc.config.iceServers).toEqual([STUN, RELAY]);
        expect(pc.config.iceTransportPolicy).toBe('all'); // direct paths still gathered

        pc.onicecandidate({ candidate: { candidate: RELAYED, sdpMid: '0' } });
        pc.onicecandidate({ candidate: { candidate: DIRECT, sdpMid: '0' } });

        const sent = signalled(t).filter((m) => m.type === 'ice');
        expect(sent.map((m) => m.candidate)).toEqual([RELAYED, DIRECT]);
    });

    it('needs both: the flag, and a relay in the list', () => {
        for (const msg of [
            { type: 'ice-config', iceServers: [STUN, RELAY] }, // a relay nobody vouched for
            { type: 'ice-config', iceServers: [STUN], relay: true }, // a flag with nothing behind it
            { type: 'ice-config', iceServers: [STUN, RELAY], relay: 'yes' },
        ]) {
            const t = transportOf(Transport);
            t._handleSignalingMessage(msg);
            t._createPeerConnection();
            FakePeerConnection.last.onicecandidate({
                candidate: { candidate: RELAYED, sdpMid: '0' },
            });
            expect(signalled(t).filter((m) => m.type === 'ice')).toHaveLength(0);
        }
    });

    it('forgets the permission when a later ice-config names no relay', () => {
        const t = transportOf(Transport);
        t._handleSignalingMessage({ type: 'ice-config', iceServers: [STUN, RELAY], relay: true });
        expect(t._relayAllowed).toBe(true);
        t._handleSignalingMessage({ type: 'ice-config', iceServers: [] }); // a LAN session
        expect(t._relayAllowed).toBe(false);
    });

    it('never writes the relay credentials to the console', () => {
        const t = transportOf(Transport);
        t._handleSignalingMessage({ type: 'ice-config', iceServers: [STUN, RELAY], relay: true });
        t._createPeerConnection();
        const printed = console.log.mock.calls.map((c) => c.join(' ')).join('\n');
        expect(printed).toContain('turn:pc.example:3478?transport=tcp');
        expect(printed).not.toContain(RELAY.credential);
        expect(printed).not.toContain(RELAY.username);
    });

    it('does not know which way it went before the browser has said', () => {
        expect(transportOf(Transport).relayed).toBeNull();
    });
});

describe('IceServers — the relay the host allows', () => {
    it('is allowed with the flag and a turn: or turns: address', () => {
        expect(relayAllowed({ relay: true, iceServers: [STUN, RELAY] })).toBe(true);
        expect(
            relayAllowed({
                relay: true,
                iceServers: [
                    { urls: 'turns:pc.example:5349?transport=tcp', username: 'u', credential: 'c' },
                ],
            }),
        ).toBe(true);
    });

    it('is not allowed otherwise', () => {
        expect(relayAllowed(null)).toBe(false);
        expect(relayAllowed({})).toBe(false);
        expect(relayAllowed({ relay: true })).toBe(false);
        expect(relayAllowed({ relay: true, iceServers: 'turn:pc.example' })).toBe(false);
        expect(relayAllowed({ relay: true, iceServers: [STUN] })).toBe(false);
        expect(relayAllowed({ relay: false, iceServers: [RELAY] })).toBe(false);
        expect(relayAllowed({ relay: 1, iceServers: [RELAY] })).toBe(false);
        expect(relayAllowed({ relay: true, iceServers: [null, { urls: 42 }] })).toBe(false);
    });
});

describe('IceServers — what a log may show', () => {
    it('shows addresses and hides credentials', () => {
        const shown = iceServersForLog([STUN, RELAY]);
        expect(shown).toContain('stun:stun.example:3478');
        expect(shown).toContain('turn:pc.example:3478?transport=udp');
        expect(shown).toContain('(not shown)');
        expect(shown).not.toContain(RELAY.username);
        expect(shown).not.toContain(RELAY.credential);
    });

    it('copes with what is not a list', () => {
        expect(iceServersForLog(null)).toBe('null');
        expect(iceServersForLog([])).toBe('[]');
        expect(iceServersForLog([null])).toBe('[{}]');
    });
});

describe('IceServers — which way the connection went', () => {
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
        expect(await routeIsRelayed(pc)).toBe(true);
    });

    it('is direct for any other kind of candidate', async () => {
        for (const candidateType of ['host', 'srflx', 'prflx']) {
            const pc = stats([
                { id: 'T', type: 'transport', selectedCandidatePairId: 'P1' },
                pair,
                { id: 'L1', type: 'local-candidate', candidateType },
            ]);
            expect(await routeIsRelayed(pc)).toBe(false);
        }
    });

    it('says nothing when the browser does not', async () => {
        expect(await routeIsRelayed(stats([]))).toBeNull();
        expect(
            await routeIsRelayed({
                getStats: async () => {
                    throw new Error('no');
                },
            }),
        ).toBeNull();
    });
});
