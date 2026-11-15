/*
 * MoonlightWeb — ICE server fallback list.
 * Copyright (C) 2026 Bruno Martin. GPLv3 — see repository LICENSE.
 */

/**
 * The list a PeerConnection starts with when the host has not said otherwise.
 *
 * It is a fallback and nothing else: every current host sends an `ice-config`
 * message naming the one server it wants used — or an empty list, which is how
 * a LAN session says "none" — and that message replaces this. What is left here
 * is the case where no such message ever arrives, which means a host older than
 * this file.
 *
 * A STUN binding request tells whoever answers the public address of whoever
 * asked, so this list is the set of third parties that learn a viewer's IP.
 * Ours goes first for the same reason the backend's does: it belongs to the
 * operator the consent text already names. The public servers stay behind it
 * because a viewer who cannot discover their own address cannot connect at all,
 * and a failed connection is a worse answer than a widely-used third party.
 *
 * Ours is derived from where the page came from rather than hard-coded: an
 * instance running under its own MW_DOMAIN should reach its own operator, not
 * this project's. Served from `stream.<domain>` (the introduction server, which
 * answers STUN on 3478 as well) that host is used directly; anywhere else —
 * loopback, a LAN address — the project default stands, since a LAN page has no
 * way to know which introduction server its host talks to and, being on the LAN,
 * will be told to use no STUN at all.
 *
 * @returns {RTCIceServer[]}
 */
export function defaultIceServers() {
    const servers = [];
    const ours = ourStunHost();
    if (ours) servers.push({ urls: `stun:${ours}:3478` });
    servers.push(
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:stun.nextcloud.com:443' },
        { urls: 'stun:relay.metered.ca:80' },
    );
    return servers;
}

/**
 * Hostname of the introduction server this page was served from, or the project
 * default. Empty when there is no usable location at all.
 *
 * @returns {string}
 */
export function ourStunHost() {
    try {
        const host = globalThis.location?.hostname || '';
        if (host.startsWith('stream.')) return host;
    } catch (_e) {
        /* no location (worker, test harness) — fall through to the default */
    }
    // S3XYCast edition: its introduction server (pc.s3xycast.com) does not
    // answer STUN, and upstream's is not this edition's to use. No server of
    // "ours", then: defaultIceServers() goes straight to the public ones.
    return '';
}

/**
 * S3XYCast edition — whether the host's list carries a relay it allows.
 *
 * MoonlightWeb drops every relayed candidate: it has no relay, so one could
 * only come from a server somebody slipped into the list. This edition's host
 * names its own (the `relay` flag of its ice-config, set when the introduction
 * server gave it one), for the browsers no direct path reaches. Both have to
 * hold — the flag, and a turn: address in the list — before a relayed
 * candidate is let through.
 *
 * @param {object} msg the host's ice-config message
 * @returns {boolean}
 */
export function relayAllowed(msg) {
    if (!msg || msg.relay !== true || !Array.isArray(msg.iceServers)) return false;
    return msg.iceServers.some((server) =>
        [].concat(server?.urls ?? []).some((u) => typeof u === 'string' && /^turns?:/.test(u)),
    );
}

/**
 * The servers as a log may show them: their addresses, never their
 * credentials. A relay's username names the host's public address and its
 * password opens the relay for a day; a console is read by more people than
 * should hold either.
 *
 * @param {object[]} servers
 * @returns {string}
 */
export function iceServersForLog(servers) {
    if (!Array.isArray(servers)) return String(servers);
    return JSON.stringify(
        servers.map((server) => ({
            urls: server?.urls,
            ...(server?.username || server?.credential ? { credentials: '(not shown)' } : {}),
        })),
    );
}

/**
 * Whether the connection in use goes through the relay: the local side of the
 * selected pair is a relayed candidate. Null when the browser does not say.
 *
 * @param {RTCPeerConnection} pc
 * @returns {Promise<boolean|null>}
 */
export async function routeIsRelayed(pc) {
    let stats;
    try {
        stats = await pc.getStats();
    } catch (_e) {
        return null;
    }
    const byId = new Map();
    let pairId = null;
    let fallback = null;
    stats.forEach((report) => {
        byId.set(report.id, report);
        if (report.type === 'transport' && report.selectedCandidatePairId)
            pairId = report.selectedCandidatePairId;
        // Firefox has no transport report: the pair says it of itself.
        if (
            report.type === 'candidate-pair' &&
            (report.selected || report.nominated) &&
            report.state === 'succeeded'
        )
            fallback = report.id;
    });
    const pair = byId.get(pairId || fallback);
    const local = pair && byId.get(pair.localCandidateId);
    if (!local || typeof local.candidateType !== 'string') return null;
    return local.candidateType === 'relay';
}
