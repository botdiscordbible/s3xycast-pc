/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * A PC whose Windows session Remote Desktop left shows one card, its sign-in
 * screen, in place of its screens. Nothing said why they were gone nor what
 * the card is for: the owner met it from his car (17/11/2026) and did not know
 * what to do. One sentence above the card says it — and only there.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../js/api/BackendClient.js', () => ({
    BackendClient: {
        adminLocked: false,
        getAppList: vi.fn(async () => ({ status: 'ok', apps: [] })),
        getVirtualDisplay: vi.fn(),
    },
}));
vi.mock('../js/i18n/i18n.js', () => ({ t: (key) => key }));

import { HostListView } from '../js/ui/HostListView.js';
import { Host } from '../js/models/Host.js';
import { BackendClient } from '../js/api/BackendClient.js';

const here = dirname(fileURLToPath(import.meta.url));
const PC = {
    uuid: 'moonlightweb-native-host',
    name: 'PC — S3XYCast PC',
    state: 'online',
    pairState: 'paired',
    backendType: 'native',
};
const left = (extra) => ({
    ...PC,
    nativeDisplay: { state: 'session_disconnected', input_permission: true, ...extra },
});

describe('a session left by Remote Desktop: what its one card is for', () => {
    let view;
    let container;

    beforeEach(() => {
        vi.clearAllMocks();
        BackendClient.adminLocked = false;
        document.body.innerHTML = '<div id="root"></div>';
        container = document.getElementById('root');
    });
    afterEach(() => {
        if (view) view.destroy();
        view = null;
    });

    const mount = (data) => {
        view = new HostListView(container);
        view.hosts = [new Host(data)];
        view.renderList();
        return container.querySelector('.host-card');
    };

    it('is said in one sentence, above the card', () => {
        const card = mount(left({ sign_in_screen: true, sign_in_held: false }));
        const hint = card.querySelector('.host-signin-hint');
        expect(hint).not.toBeNull();
        expect(hint.textContent).toBe('hosts.signInScreenHint');
        // Above the grid the card is painted in, not after it.
        const grid = card.querySelector('.host-apps');
        expect(grid).not.toBeNull();
        expect(hint.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(card.querySelectorAll('.host-signin-hint').length).toBe(1);
    });

    it('is not said in a kiosk, which is not offered the card', () => {
        BackendClient.adminLocked = true;
        const card = mount(left({ sign_in_screen: true, sign_in_held: false }));
        expect(card.querySelector('.host-signin-hint')).toBeNull();
    });

    it('is not said when the card cannot be offered', () => {
        const card = mount(left({ sign_in_screen: false, sign_in_held: false }));
        expect(card.querySelector('.host-signin-hint')).toBeNull();
        expect(card.querySelector('.host-empty-display-text').textContent).toBe(
            'hosts.sessionLeftByRemoteDesktop',
        );
    });

    it('is not said when somebody is signed in on the PC', () => {
        const card = mount(left({ sign_in_screen: false, sign_in_held: true }));
        expect(card.querySelector('.host-signin-hint')).toBeNull();
    });

    it('is not said on a PC whose screens are there', () => {
        const card = mount({ ...PC, nativeDisplay: { state: 'ok', input_permission: true } });
        expect(card.querySelector('.host-signin-hint')).toBeNull();
        expect(card.querySelector('.host-apps')).not.toBeNull();
    });
});

describe('the sentence, in every language the interface speaks', () => {
    const catalogue = (lang) =>
        JSON.parse(readFileSync(join(here, '..', 'locales', `${lang}.json`), 'utf8'));

    it('is there, and says what to do', () => {
        for (const lang of ['en', 'fr', 'tr', 'zh']) {
            const text = catalogue(lang).hosts.signInScreenHint;
            expect(text, lang).toBeTruthy();
            expect(text.length, lang).toBeGreaterThan(20);
            // Windows is what the PC is waiting for, in every language.
            expect(text, lang).toContain('Windows');
        }
    });

    it('is the one the owner was shown, in French', () => {
        expect(catalogue('fr').hosts.signInScreenHint).toBe(
            'Après un Bureau à distance, votre PC attend votre code Windows. ' +
                'Ouvrez cette carte et entrez-le : vos écrans reviennent.',
        );
    });

    it('where the card cannot be offered, the text sends nobody to a README', () => {
        // Upstream's text ends on "see the README": its users have one, this
        // edition's subscribers do not. It says what to do instead.
        for (const lang of ['en', 'fr', 'tr', 'zh']) {
            const text = catalogue(lang).hosts.sessionLeftByRemoteDesktop;
            expect(text, lang).toBeTruthy();
            expect(text, lang).not.toMatch(/readme/i);
            expect(text, lang).toContain('Windows');
        }
    });
});

describe('where HostListView was touched for the sentence', () => {
    // A few lines in a long upstream file: a merge of a new upstream release
    // drops them without a conflict, and the card is unexplained again.
    const text = readFileSync(join(here, '..', 'js', 'ui', 'HostListView.js'), 'utf8');

    it('puts it before the grid, where the sign-in screen is offered outside a kiosk', () => {
        const body = text.slice(text.indexOf('\n    renderBody(host) {'));
        const available = body.slice(body.indexOf('if (host.isAvailable) {'));
        const block = available.slice(0, available.indexOf('\n        }\n'));
        expect(block).toContain('host.opensSignInScreen && !this._booth()');
        expect(block).toContain('<p class="host-signin-hint">${t(\'hosts.signInScreenHint\')}</p>');
        expect(block.indexOf('signInHint +')).toBeGreaterThan(-1);
        expect(block.indexOf('signInHint +')).toBeLessThan(block.indexOf('<div class="host-apps"'));
    });
});
