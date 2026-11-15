/*
 * S3XYCast PC — an edition of MoonlightWeb. GPLv3, like the rest of the tree.
 *
 * PcDashboard — what the program shows on the PC itself.
 *
 * The page a subscriber opens on their PC is not where they watch anything:
 * that happens in the car. On the PC there are three things to know and one to
 * do — may this PC be opened from outside, at which address, behind which
 * code — so that is all the page says: a state in one line, one big button
 * that allows or stops the streaming, the link (which never changes), and a
 * "Settings" button for everything else. The owner asked for exactly that
 * (15/11/2026): "a big button Allow streaming / Turn off, a settings button",
 * something simple.
 *
 * "Streaming allowed" is upstream's Internet Access, by the name of what it is
 * for. Turning it on records the same agreement text the settings page shows,
 * which is on this page too, under the button, while it is off.
 *
 * Everything it reads is upstream's own status; it adds no state of its own.
 */
import { t } from '../i18n/i18n.js';
import { BackendClient } from '../api/BackendClient.js';
import { escapeHtml } from '../util/escapeHtml.js';
import { Toast } from './Toast.js';

/** How often the state is read again while the page shows it. */
const REFRESH_MS = 5000;
/** After the switch is turned on, how often and how long the address is waited for. */
const STARTING_POLL_MS = 1000;
const STARTING_MAX_MS = 60000;

/**
 * What the page says, from what the program reports.
 * @param {{ internet: any, auth: any, native: any, starting: boolean }} s
 * @returns {{ state: 'starting'|'on'|'offline'|'off'|'unknown', url: string,
 *            codeSet: boolean, noDisplay: boolean, canSwitch: boolean }}
 */
export function pcDashboardView({ internet, auth, native, starting }) {
    const net = internet || {};
    const url = (net.rendezvous && net.rendezvous.url) || '';
    const enabled = net.internet_access_enabled === true;
    let state = 'unknown';
    if (starting) state = 'starting';
    else if (!internet) state = 'unknown';
    else if (!enabled) state = 'off';
    else if (url && net.rendezvous.online) state = 'on';
    else if (url) state = 'offline';
    // Allowed, and the address not there yet: still on its way.
    else state = 'starting';
    return {
        state,
        url: enabled ? url : '',
        codeSet: !!(auth && auth.access_code_set),
        // Unknown is not "no screen": only what the program says outright.
        noDisplay: !!native && native.available === false,
        // A build that never reaches outside has nothing to allow.
        canSwitch: !!internet && net.lan_only !== true,
    };
}

export class PcDashboard {
    /**
     * @param {{ openSettings: () => void, onToggleHosts?: (shown: boolean) => void }} options
     *   `openSettings` opens the settings page (the personal code is its first
     *   section). `onToggleHosts` is told when the viewer asks to see, or put
     *   away, the list of what can be opened from this very PC.
     */
    constructor({ openSettings, onToggleHosts }) {
        this._openSettings = openSettings;
        this._onToggleHosts = onToggleHosts || null;
        this._el = null;
        this._timer = null;
        this._starting = false;
        this._busy = false;
        this._hostsShown = false;
        this._data = { internet: null, auth: null, native: null };
        this._destroyed = false;
    }

    /** Put the panel at the top of `view`, and start reading the state. */
    mount(view) {
        if (this._el) return;
        const el = document.createElement('section');
        el.className = 'pc-dash';
        el.setAttribute('aria-live', 'polite');
        this._el = el;
        // Under the update notice when there is one: a new version is the one
        // thing worth reading before the state.
        const notice = view.querySelector('#update-banner');
        view.insertBefore(
            el,
            notice && notice.parentNode === view ? notice.nextSibling : view.firstChild,
        );
        el.addEventListener('click', (e) => this._onClick(e));
        this._render();
        this.refresh();
        this._timer = setInterval(() => this.refresh(), REFRESH_MS);
    }

    destroy() {
        this._destroyed = true;
        if (this._timer) clearInterval(this._timer);
        this._timer = null;
        if (this._el) this._el.remove();
        this._el = null;
    }

    /** Read the three statuses again; a refused one leaves what was known. */
    async refresh() {
        const read = async (fn) => {
            try {
                return await fn();
            } catch {
                return undefined;
            }
        };
        const [internet, auth, native] = await Promise.all([
            read(() => BackendClient.getInternetStatus()),
            read(() => BackendClient.getAuthStatus()),
            read(() => BackendClient.getNativeStatus()),
        ]);
        if (this._destroyed) return;
        if (internet !== undefined) this._data.internet = internet;
        if (auth !== undefined) this._data.auth = auth;
        if (native !== undefined) this._data.native = native;
        this._render();
    }

    _view() {
        return pcDashboardView({ ...this._data, starting: this._starting });
    }

    _render() {
        const el = this._el;
        if (!el) return;
        const v = this._view();
        const on = v.state === 'on' || v.state === 'offline';
        const waiting = v.state === 'starting' || v.state === 'unknown';
        const title = t('pcDash.state.' + v.state);
        const desc = t('pcDash.desc.' + v.state);
        const toggle = v.canSwitch
            ? `<button type="button" class="btn ${on || v.state === 'starting' ? 'btn-neutral' : 'btn-primary'} pc-dash-toggle"
                       data-act="${on || v.state === 'starting' ? 'off' : 'on'}" ${this._busy || v.state === 'unknown' ? 'disabled' : ''}>
                   ${escapeHtml(t(on || v.state === 'starting' ? 'pcDash.turnOff' : 'pcDash.turnOn'))}
               </button>`
            : '';
        const consent =
            v.state === 'off' && v.canSwitch
                ? `<details class="pc-dash-consent">
                       <summary>${escapeHtml(t('pcDash.consentTitle'))}</summary>
                       <p>${escapeHtml(t('admin.internetInfo1'))}</p>
                   </details>`
                : '';
        const link = v.url
            ? `<div class="pc-dash-link">
                   <div class="pc-dash-label">${escapeHtml(t('pcDash.linkTitle'))}</div>
                   <div class="pc-dash-row">
                       <a class="pc-dash-url" href="${escapeHtml(v.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(v.url)}</a>
                       <button type="button" class="btn btn-secondary pc-dash-copy" data-act="copy">${escapeHtml(t('pcDash.copy'))}</button>
                   </div>
                   <p class="pc-dash-help">${escapeHtml(t('pcDash.linkHelp'))}</p>
               </div>`
            : '';
        const code = v.codeSet
            ? `<p class="pc-dash-note is-ok">
                   <span>${escapeHtml(t('pcDash.codeSet'))}</span>
                   <button type="button" class="pc-dash-inline" data-act="settings">${escapeHtml(t('pcDash.codeChange'))}</button>
               </p>`
            : `<p class="pc-dash-note is-bad">
                   <span>${escapeHtml(t('pcDash.codeMissing'))}</span>
                   <button type="button" class="btn btn-primary pc-dash-code" data-act="settings">${escapeHtml(t('pcDash.codeChoose'))}</button>
               </p>`;
        const display = v.noDisplay
            ? `<p class="pc-dash-note is-bad"><span>${escapeHtml(t('pcDash.noDisplay'))}</span></p>`
            : '';
        el.innerHTML = `
            <div class="pc-dash-state is-${v.state}">
                <span class="pc-dash-dot${waiting ? ' is-waiting' : ''}" aria-hidden="true"></span>
                <div class="pc-dash-text">
                    <h2 class="pc-dash-title">${escapeHtml(title)}</h2>
                    <p class="pc-dash-desc">${escapeHtml(desc)}</p>
                </div>
            </div>
            ${toggle}
            ${consent}
            ${link}
            <div class="pc-dash-notes">${this._data.auth ? code : ''}${display}</div>
            <div class="pc-dash-foot">
                <button type="button" class="btn btn-neutral pc-dash-settings" data-act="settings">${escapeHtml(t('pcDash.settings'))}</button>
                <button type="button" class="pc-dash-inline pc-dash-hosts" data-act="hosts">${escapeHtml(
                    t(this._hostsShown ? 'pcDash.hideHosts' : 'pcDash.showHosts'),
                )}</button>
            </div>`;
    }

    _onClick(e) {
        const target = /** @type {HTMLElement} */ (e.target);
        const actor = target.closest
            ? /** @type {HTMLElement|null} */ (target.closest('[data-act]'))
            : null;
        if (!actor || !this._el || !this._el.contains(actor)) return;
        const act = actor.dataset.act;
        if (act === 'settings') this._openSettings();
        else if (act === 'copy') this._copy();
        else if (act === 'on') this._turnOn();
        else if (act === 'off') this._turnOff();
        else if (act === 'hosts') {
            this._hostsShown = !this._hostsShown;
            if (this._onToggleHosts) this._onToggleHosts(this._hostsShown);
            this._render();
        }
    }

    async _copy() {
        const url = this._view().url;
        if (!url) return;
        try {
            await navigator.clipboard.writeText(url);
            Toast.success(t('pcDash.copied'));
        } catch {
            // No clipboard here: the link is on the page, to be selected by hand.
            Toast.info(t('pcDash.copyFailed'));
        }
    }

    async _turnOn() {
        if (this._busy) return;
        this._busy = true;
        this._starting = true;
        this._render();
        try {
            const result = await BackendClient.enableInternet({
                internet_access_enabled: true,
                auto_ip_detection: true,
                // What was on the page when the button was pressed, as the
                // settings page records it.
                consent_message: t('admin.internetInfo1') + ' / ' + t('pcDash.turnOn'),
            });
            if (!result || result.status !== 'enabled') throw new Error('refused');
            // The address comes a moment after the switch.
            const until = Date.now() + STARTING_MAX_MS;
            while (!this._destroyed && Date.now() < until) {
                await this.refresh();
                const net = this._data.internet || {};
                if (net.rendezvous && net.rendezvous.url) break;
                if (net.phase === 'error' || net.internet_access_enabled === false) break;
                await new Promise((resolve) => setTimeout(resolve, STARTING_POLL_MS));
            }
        } catch {
            Toast.error(t('pcDash.turnOnFailed'));
        }
        this._starting = false;
        this._busy = false;
        await this.refresh();
    }

    async _turnOff() {
        if (this._busy) return;
        this._busy = true;
        this._render();
        try {
            await BackendClient.disableInternet();
        } catch {
            Toast.error(t('pcDash.turnOffFailed'));
        }
        this._starting = false;
        this._busy = false;
        await this.refresh();
    }
}
