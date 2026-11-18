/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * "Less delay in the car: open your router's ports", on the PC's own page.
 *
 * Where the box opens no port for the PC, a stream from a car on a mobile
 * network goes through the S3XYCast relay, a detour that adds delay; a rule
 * on the box lets it come straight in. The first owner's next stream from the
 * car went direct, with no drop of rate and no freeze (18/11/2026), and he
 * wants the customers told plainly, where they can act: on the PC, at home,
 * next to their box. The card says it while it is true, and goes once a
 * stream from outside has come straight in.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { backend, toast } = vi.hoisted(() => ({
    backend: {
        getInternetStatus: vi.fn(),
        getAuthStatus: vi.fn(),
        getNativeStatus: vi.fn(),
        enableInternet: vi.fn(),
        disableInternet: vi.fn(),
    },
    toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock('../js/api/BackendClient.js', () => ({ BackendClient: backend }));
vi.mock('../js/ui/Toast.js', () => ({ Toast: toast }));
vi.mock('../js/i18n/i18n.js', () => ({
    t: (key, params) => (params ? `${key}${JSON.stringify(params)}` : key),
}));

import { PcDashboard, portsAdvice, portsRule } from '../js/ui/PcDashboard.js';
import { BOX_HELP_URL } from '../js/brand.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (...path) => readFileSync(join(here, '..', ...path), 'utf8');

/** The status of a PC that allows streaming from outside, its box opening nothing. */
const net = (fields = {}) => ({
    internet_access_enabled: true,
    lan_only: false,
    upnp_enabled: true,
    upnp_available: false,
    media_port_first: 48550,
    local_ip: '192.168.1.32',
    rendezvous: { online: true, url: 'https://pc.example/abcdefghjkmnpqrstvwxyz0123' },
    ...fields,
});
const relayedAt = { relayed: true, at: '2026-11-17T20:19:17Z' };
const directAt = { relayed: false, at: '2026-11-18T15:29:51Z' };

describe('when the page says to open the box’s ports', () => {
    it('says it after a stream from outside went through the relay', () => {
        expect(portsAdvice(net({ last_outside_route: relayedAt }))).toBe('relayed');
    });

    it('says it before any, when the box does not open ports by itself', () => {
        expect(portsAdvice(net())).toBe('noUpnp');
        // The owner switched the box's own opening off: same thing.
        expect(portsAdvice(net({ upnp_enabled: false }))).toBe('noUpnp');
    });

    it('stops saying it once a stream from outside came straight in', () => {
        expect(portsAdvice(net({ last_outside_route: directAt }))).toBeNull();
    });

    it('does not say it where the box opens ports by itself', () => {
        // A relayed stream is then the car's network's doing, not the box's.
        expect(portsAdvice(net({ upnp_available: true }))).toBeNull();
        expect(
            portsAdvice(net({ upnp_available: true, last_outside_route: relayedAt })),
        ).toBeNull();
    });

    it('does not say it where nothing comes from outside', () => {
        expect(portsAdvice(net({ internet_access_enabled: false }))).toBeNull();
        expect(portsAdvice(net({ lan_only: true, last_outside_route: relayedAt }))).toBeNull();
        expect(portsAdvice(null)).toBeNull();
        expect(portsAdvice(undefined)).toBeNull();
    });

    it('reads a record it does not understand as no record', () => {
        expect(portsAdvice(net({ last_outside_route: { relayed: 'yes' } }))).toBe('noUpnp');
        expect(portsAdvice(net({ last_outside_route: 'relay' }))).toBe('noUpnp');
    });
});

describe('the rule the card gives', () => {
    it('is the stream’s first port and the next, to this PC', () => {
        expect(portsRule(net())).toEqual({ first: 48550, second: 48551, ip: '192.168.1.32' });
        expect(portsRule(net({ media_port_first: 48600 }))).toEqual({
            first: 48600,
            second: 48601,
            ip: '192.168.1.32',
        });
    });

    it('falls back on the usual ports, and leaves out an address it cannot show', () => {
        expect(portsRule(net({ media_port_first: undefined, local_ip: undefined }))).toEqual({
            first: 48550,
            second: 48551,
            ip: '',
        });
        expect(portsRule(net({ media_port_first: 'x', local_ip: '<b>' })).ip).toBe('');
        expect(portsRule(net({ media_port_first: 70000 })).first).toBe(48550);
        expect(portsRule(null)).toEqual({ first: 48550, second: 48551, ip: '' });
    });

    it('is the one upstream documents for a box that opens nothing', () => {
        const pools = read('..', 'backend', 'src', 'network', 'RouterPortPools.h');
        expect(pools).toContain('constexpr uint16_t kMediaBasePort = 48550;');
    });
});

describe('the card on the page', () => {
    let host;
    let dash;
    const flush = async () => {
        for (let i = 0; i < 6; i++) await Promise.resolve();
    };
    const mount = async (internet) => {
        backend.getInternetStatus.mockResolvedValue(internet);
        host = document.createElement('div');
        document.body.appendChild(host);
        dash = new PcDashboard({ openSettings: () => {} });
        dash.mount(host);
        await flush();
        return host.querySelector('.pc-dash-ports');
    };

    beforeEach(() => {
        vi.useFakeTimers();
        backend.getAuthStatus.mockResolvedValue({ access_code_set: true });
        backend.getNativeStatus.mockResolvedValue({ available: true });
    });
    afterEach(() => {
        if (dash) dash.destroy();
        if (host) host.remove();
        dash = null;
        vi.useRealTimers();
    });

    it('names the gain, says why, gives the rule and leads to the guide', async () => {
        const card = await mount(net({ last_outside_route: relayedAt }));
        expect(card).not.toBeNull();
        expect(card.querySelector('.pc-dash-ports-title').textContent).toBe('pcDash.portsTitle');
        expect(card.querySelector('.pc-dash-ports-text').textContent).toBe('pcDash.portsRelayed');
        expect(card.querySelector('.pc-dash-ports-rule').textContent).toBe(
            'pcDash.portsRule{"first":48550,"second":48551,"ip":"192.168.1.32"}',
        );
        const how = card.querySelector('a.pc-dash-ports-how');
        expect(how.getAttribute('href')).toBe(BOX_HELP_URL);
        expect(how.getAttribute('target')).toBe('_blank');
        expect(how.getAttribute('rel')).toContain('noopener');
        expect(how.textContent).toBe('pcDash.portsHow');
    });

    it('says the box opens nothing before any stream from outside', async () => {
        const card = await mount(net({ local_ip: undefined }));
        expect(card.querySelector('.pc-dash-ports-text').textContent).toBe('pcDash.portsNoUpnp');
        expect(card.querySelector('.pc-dash-ports-rule').textContent).toBe(
            'pcDash.portsRuleNoIp{"first":48550,"second":48551,"ip":""}',
        );
    });

    it('is not there once a stream from outside came straight in', async () => {
        expect(await mount(net({ last_outside_route: directAt }))).toBeNull();
    });

    it('goes away by itself when the state it read changes', async () => {
        const card = await mount(net({ last_outside_route: relayedAt }));
        expect(card).not.toBeNull();
        backend.getInternetStatus.mockResolvedValue(net({ last_outside_route: directAt }));
        await dash.refresh();
        expect(host.querySelector('.pc-dash-ports')).toBeNull();
    });

    it('comes after the link and before the notes', async () => {
        await mount(net({ last_outside_route: relayedAt }));
        const order = [...host.querySelector('.pc-dash').children].map((el) => el.className);
        const link = order.findIndex((c) => c.startsWith('pc-dash-link'));
        const ports = order.findIndex((c) => c.startsWith('pc-dash-ports'));
        const notes = order.findIndex((c) => c.startsWith('pc-dash-notes'));
        expect(link).toBeGreaterThanOrEqual(0);
        expect(ports).toBe(link + 1);
        expect(notes).toBe(ports + 1);
    });
});

describe('the words and the look', () => {
    it('say it in the four languages, with the rule’s numbers', () => {
        for (const lang of ['en', 'fr', 'tr', 'zh']) {
            const words = JSON.parse(read('locales', lang + '.json')).pcDash;
            for (const key of [
                'portsTitle',
                'portsRelayed',
                'portsNoUpnp',
                'portsRule',
                'portsRuleNoIp',
                'portsHow',
            ]) {
                expect(typeof words[key], `${lang} ${key}`).toBe('string');
            }
            expect(words.portsRule).toContain('{{first}}');
            expect(words.portsRule).toContain('{{second}}');
            expect(words.portsRule).toContain('{{ip}}');
            expect(words.portsRule).toContain('UDP');
            expect(words.portsRuleNoIp).not.toContain('{{ip}}');
            expect(words.portsRelayed).toContain('S3XYCast');
        }
        // In French: the goal first, and the PC called a PC.
        const fr = JSON.parse(read('locales', 'fr.json')).pcDash;
        expect(fr.portsTitle).toMatch(/^Moins de délai dans la voiture/);
        for (const text of Object.values(fr)) {
            if (typeof text === 'string') expect(text).not.toMatch(/hôte|serveur|backend/i);
        }
    });

    it('stand out from the rest of the page', () => {
        const css = read('css', 's3xycast.css');
        const at = css.indexOf('.pc-dash-ports {');
        expect(at).toBeGreaterThan(0);
        const rule = css.slice(at, css.indexOf('}', at));
        expect(rule).toContain('border-left: 4px solid var(--c-warning);');
        expect(rule).toContain('background: var(--c-warning-soft);');
    });
});

describe('the car’s notice of a relayed stream', () => {
    it('says the delay and what to do, in the four languages', () => {
        const said = {
            en: /more delay.*ports/,
            fr: /plus de délai.*ports de votre box/,
            tr: /gecikme.*port/,
            zh: /延迟.*端口/,
        };
        for (const [lang, expected] of Object.entries(said)) {
            const words = JSON.parse(read('locales', lang + '.json')).stream;
            expect(words.routeRelay, lang).toMatch(expected);
            expect(words.routeRelay, lang).toContain('S3XYCast');
        }
    });

    it('stays long enough to be read', () => {
        expect(read('js', 'app.js')).toContain(
            'if (words) Toast.info(t(words.notice), relayed ? { durationMs: 9000 } : undefined);',
        );
    });
});
