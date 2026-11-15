/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * The page the program shows on the PC itself: one state, one big button that
 * allows or stops the streaming, the link, the settings. The owner asked for
 * something simple (15/11/2026), and a page this small has to be exactly right:
 * it must never say "allowed" for a PC nobody can reach, never show a link
 * that leads nowhere, and never switch the access on without the agreement
 * being recorded.
 */
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
vi.mock('../js/i18n/i18n.js', () => ({ t: (key) => key }));

import { PcDashboard, pcDashboardView } from '../js/ui/PcDashboard.js';

const URL_ = 'https://pc.example/abcdefghjkmnpqrstvwxyz0123';
const net = (fields = {}) => ({
    internet_access_enabled: true,
    lan_only: false,
    phase: 'active',
    rendezvous: { online: true, url: URL_ },
    ...fields,
});
const flush = async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
};

describe('what the page says', () => {
    const view = (internet, more = {}) =>
        pcDashboardView({
            internet,
            auth: { access_code_set: true },
            native: { available: true },
            starting: false,
            ...more,
        });

    it('says allowed only for a PC that is on the line', () => {
        expect(view(net()).state).toBe('on');
        expect(view(net()).url).toBe(URL_);
    });

    it('says so when the access is on and the line is down', () => {
        const v = view(net({ rendezvous: { online: false, url: URL_ } }));
        expect(v.state).toBe('offline');
        // The address is still the PC's: it is shown, with the warning.
        expect(v.url).toBe(URL_);
    });

    it('says turned off, and shows no link, when the access is off', () => {
        const v = view(net({ internet_access_enabled: false }));
        expect(v.state).toBe('off');
        expect(v.url).toBe('');
    });

    it('waits while the address is on its way', () => {
        expect(view(net({ rendezvous: { online: false, url: '' } })).state).toBe('starting');
        expect(view(net({ internet_access_enabled: false }), { starting: true }).state).toBe(
            'starting',
        );
    });

    it('does not guess before the program has answered', () => {
        const v = view(null);
        expect(v.state).toBe('unknown');
        expect(v.canSwitch).toBe(false);
    });

    it('offers no switch to a build that never reaches outside', () => {
        expect(view(net({ lan_only: true })).canSwitch).toBe(false);
        expect(view(net()).canSwitch).toBe(true);
    });

    it('speaks of a missing screen only when the program says there is none', () => {
        expect(view(net(), { native: { available: false } }).noDisplay).toBe(true);
        expect(view(net(), { native: { available: true } }).noDisplay).toBe(false);
        expect(view(net(), { native: null }).noDisplay).toBe(false);
    });

    it('knows whether the personal code is chosen', () => {
        expect(view(net()).codeSet).toBe(true);
        expect(view(net(), { auth: { access_code_set: false } }).codeSet).toBe(false);
    });
});

describe('PcDashboard', () => {
    let host;
    let dash;
    let openSettings;
    let onToggleHosts;

    const mount = async () => {
        dash = new PcDashboard({ openSettings, onToggleHosts });
        dash.mount(host);
        await flush();
        return dash;
    };
    const el = (selector) => host.querySelector(selector);
    const toggle = () => el('.pc-dash-toggle');

    beforeEach(() => {
        vi.useFakeTimers();
        for (const fn of Object.values(backend)) fn.mockReset();
        for (const fn of Object.values(toast)) fn.mockReset();
        backend.getInternetStatus.mockResolvedValue(net());
        backend.getAuthStatus.mockResolvedValue({ access_code_set: true });
        backend.getNativeStatus.mockResolvedValue({ available: true });
        host = document.createElement('div');
        host.innerHTML = '<div class="hosts-header"></div>';
        document.body.appendChild(host);
        openSettings = vi.fn();
        onToggleHosts = vi.fn();
    });
    afterEach(() => {
        if (dash) dash.destroy();
        dash = null;
        document.body.innerHTML = '';
        vi.useRealTimers();
    });

    it('goes at the top of the page', async () => {
        await mount();
        expect(host.firstElementChild.classList.contains('pc-dash')).toBe(true);
    });

    it('goes under the update notice, which is read first', async () => {
        host.innerHTML = '<div id="update-banner"></div><div class="hosts-header"></div>';
        await mount();
        expect([...host.children].map((c) => c.id || c.className)).toEqual([
            'update-banner',
            'pc-dash',
            'hosts-header',
        ]);
    });

    it('shows the state, the button that stops it, and the link', async () => {
        await mount();
        expect(el('.pc-dash-state').classList.contains('is-on')).toBe(true);
        expect(el('.pc-dash-title').textContent).toBe('pcDash.state.on');
        expect(toggle().textContent.trim()).toBe('pcDash.turnOff');
        expect(toggle().dataset.act).toBe('off');
        expect(el('.pc-dash-url').textContent).toBe(URL_);
        expect(el('.pc-dash-url').getAttribute('href')).toBe(URL_);
        // The agreement is for the moment it is given.
        expect(el('.pc-dash-consent')).toBeNull();
    });

    it('shows the button that allows it, with what is being allowed, when it is off', async () => {
        backend.getInternetStatus.mockResolvedValue(net({ internet_access_enabled: false }));
        await mount();
        expect(el('.pc-dash-state').classList.contains('is-off')).toBe(true);
        expect(toggle().textContent.trim()).toBe('pcDash.turnOn');
        expect(toggle().classList.contains('btn-primary')).toBe(true);
        expect(el('.pc-dash-consent p').textContent).toBe('admin.internetInfo1');
        expect(el('.pc-dash-url')).toBeNull();
    });

    it('records the agreement that was on the page when it allows the streaming', async () => {
        backend.getInternetStatus.mockResolvedValue(net({ internet_access_enabled: false }));
        backend.enableInternet.mockImplementation(async () => {
            backend.getInternetStatus.mockResolvedValue(net());
            return { status: 'enabled' };
        });
        await mount();
        toggle().click();
        await flush();
        expect(backend.enableInternet).toHaveBeenCalledWith({
            internet_access_enabled: true,
            auto_ip_detection: true,
            consent_message: 'admin.internetInfo1 / pcDash.turnOn',
        });
        await flush();
        expect(el('.pc-dash-state').classList.contains('is-on')).toBe(true);
        expect(el('.pc-dash-url').textContent).toBe(URL_);
        expect(toast.error).not.toHaveBeenCalled();
    });

    it('says so, and stays off, when the streaming could not be allowed', async () => {
        backend.getInternetStatus.mockResolvedValue(net({ internet_access_enabled: false }));
        backend.enableInternet.mockResolvedValue({ status: 'failed' });
        await mount();
        toggle().click();
        await flush();
        await flush();
        expect(toast.error).toHaveBeenCalledWith('pcDash.turnOnFailed');
        expect(el('.pc-dash-state').classList.contains('is-off')).toBe(true);
        expect(toggle().disabled).toBe(false);
    });

    it('stops the streaming at one press', async () => {
        backend.disableInternet.mockImplementation(async () => {
            backend.getInternetStatus.mockResolvedValue(net({ internet_access_enabled: false }));
            return {};
        });
        await mount();
        toggle().click();
        await flush();
        expect(backend.disableInternet).toHaveBeenCalledTimes(1);
        await flush();
        expect(el('.pc-dash-state').classList.contains('is-off')).toBe(true);
        expect(el('.pc-dash-url')).toBeNull();
    });

    it('takes one press at a time', async () => {
        let release;
        backend.disableInternet.mockReturnValue(new Promise((resolve) => (release = resolve)));
        await mount();
        toggle().click();
        await flush();
        expect(toggle().disabled).toBe(true);
        toggle().click();
        expect(backend.disableInternet).toHaveBeenCalledTimes(1);
        release({});
        await flush();
    });

    it('copies the link, and says so', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        await mount();
        el('.pc-dash-copy').click();
        await flush();
        expect(writeText).toHaveBeenCalledWith(URL_);
        expect(toast.success).toHaveBeenCalledWith('pcDash.copied');
        delete navigator.clipboard;
    });

    it('asks for the personal code when there is none, and leads to where it is chosen', async () => {
        backend.getAuthStatus.mockResolvedValue({ access_code_set: false });
        await mount();
        expect(el('.pc-dash-note.is-bad span').textContent).toBe('pcDash.codeMissing');
        el('.pc-dash-code').click();
        expect(openSettings).toHaveBeenCalledTimes(1);
    });

    it('says the code is in place when it is, with the way to change it', async () => {
        await mount();
        expect(el('.pc-dash-note.is-ok span').textContent).toBe('pcDash.codeSet');
        el('.pc-dash-note.is-ok .pc-dash-inline').click();
        expect(openSettings).toHaveBeenCalledTimes(1);
    });

    it('warns of a PC with no screen', async () => {
        backend.getNativeStatus.mockResolvedValue({ available: false });
        await mount();
        const notes = [...host.querySelectorAll('.pc-dash-note.is-bad span')].map(
            (n) => n.textContent,
        );
        expect(notes).toContain('pcDash.noDisplay');
    });

    it('opens the settings from its one button', async () => {
        await mount();
        el('.pc-dash-settings').click();
        expect(openSettings).toHaveBeenCalledTimes(1);
    });

    it('puts away what can be opened from this PC, and brings it back when asked', async () => {
        await mount();
        expect(el('.pc-dash-hosts').textContent).toBe('pcDash.showHosts');
        el('.pc-dash-hosts').click();
        expect(onToggleHosts).toHaveBeenLastCalledWith(true);
        expect(el('.pc-dash-hosts').textContent).toBe('pcDash.hideHosts');
        el('.pc-dash-hosts').click();
        expect(onToggleHosts).toHaveBeenLastCalledWith(false);
    });

    it('reads the state again by itself, and keeps what it knew through a failed read', async () => {
        await mount();
        backend.getInternetStatus.mockRejectedValue(new Error('down'));
        await vi.advanceTimersByTimeAsync(5000);
        await flush();
        expect(el('.pc-dash-state').classList.contains('is-on')).toBe(true);
        backend.getInternetStatus.mockResolvedValue(
            net({ rendezvous: { online: false, url: URL_ } }),
        );
        await vi.advanceTimersByTimeAsync(5000);
        await flush();
        expect(el('.pc-dash-state').classList.contains('is-offline')).toBe(true);
    });

    it('stops reading once it is taken away', async () => {
        await mount();
        dash.destroy();
        const calls = backend.getInternetStatus.mock.calls.length;
        await vi.advanceTimersByTimeAsync(20000);
        expect(backend.getInternetStatus.mock.calls.length).toBe(calls);
        expect(el('.pc-dash')).toBeNull();
    });

    it('has every sentence it shows in the four languages', async () => {
        vi.useRealTimers();
        for (const lang of ['en', 'fr', 'tr', 'zh']) {
            const cat = (await import(`../locales/${lang}.json`)).default.pcDash;
            for (const state of ['on', 'offline', 'off', 'starting', 'unknown']) {
                expect(cat.state[state], `${lang} state.${state}`).toBeTruthy();
                expect(cat.desc[state], `${lang} desc.${state}`).toBeTruthy();
            }
        }
    });
});
