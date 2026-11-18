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
 * Everything it reads is upstream's own status, and one thing of the
 * edition's: which way the last stream from outside went (portsAdvice).
 */
import { t } from '../i18n/i18n.js';
import { BackendClient } from '../api/BackendClient.js';
import { escapeHtml } from '../util/escapeHtml.js';
import { BOX_HELP_URL } from '../brand.js';
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

/**
 * Whether to tell the owner that a rule on the box would shorten the delay,
 * and why. Where the box opens no port for the PC, a stream from a car on a
 * mobile network goes through the S3XYCast relay, a detour that adds delay;
 * a rule made on the box lets it come straight in. The first owner's next
 * stream from the car went direct with no drop of rate and no freeze
 * (18/11/2026), and he wants the customers told, plainly, where they can act.
 *
 *   'relayed' — the owner's last stream from outside went through the relay
 *               with no port open on the box for it (`hole`): it is why. Said
 *               even where the box answers UPnP: one that answers and then
 *               refuses, or gives the port away, is exactly the box that needs
 *               the rule made by hand.
 *   'noUpnp'  — no stream from outside yet, and the box has not opened ports
 *               by itself: the first one takes the relay, unless the owner
 *               already made the rule — which the program cannot see before a
 *               stream has come in. The card says it as a condition, and both
 *               cards say they go once a stream comes in directly: the first
 *               owner had made his rule, and the card said otherwise until his
 *               next stream from outside (18/11/2026, "Oui, corrige"). Not
 *               while the program is still asking the box (`upnp_looking`, the
 *               seconds after start-up).
 *   null      — nothing to do: the last stream from outside came straight in
 *               (a rule on the box, or the box's own), it went through the
 *               relay although the box had a port open for it (the car's
 *               network's doing), no stream yet and the box opens ports by
 *               itself, or the PC does not allow streaming from outside at all.
 * What is kept leaves out what says nothing of the box (common/StreamRoute.h
 * in the program): streams on the PC's own network, guests' streams, and
 * relayed streams from a browser that showed no UDP. A record kept by 0.1.14
 * has no `hole`. Relayed, the box's word stands in for it, as 0.1.14 read it.
 * Direct, it is not trusted: 0.1.14 took a phone at home on the box's IPv6,
 * a guest, or a relayed stream it misread for one (18/11/2026 review) — it
 * reads as no stream yet, and the next one from outside settles it.
 * "The box opens ports by itself" holds only while the program may ask it:
 * a box that answered once stays available after the owner switched UPnP off,
 * and nothing is opened then. Nor while it refuses the ports asked of it
 * (`upnp_refusing`): it answers UPnP and opens nothing.
 * @param {any} net /api/internet/status
 * @returns {'relayed'|'noUpnp'|null}
 */
export function portsAdvice(net) {
    if (!net || net.internet_access_enabled !== true || net.lan_only === true) return null;
    const boxOpens =
        net.upnp_enabled !== false &&
        net.upnp_refusing !== true &&
        (net.upnp_available === true || net.upnp_looking === true);
    const route = net.last_outside_route;
    if (route && typeof route.relayed === 'boolean') {
        const hole = typeof route.hole === 'boolean' ? route.hole : null;
        if (route.relayed === true) {
            if (hole !== null) return hole ? null : 'relayed';
            return boxOpens ? null : 'relayed';
        }
        if (hole !== null) return null;
    }
    // No stream from outside yet (or none to trust): the box opens ports by
    // itself, or is still being asked (no advice, or not yet).
    return boxOpens ? null : 'noUpnp';
}

/**
 * The rule to make on the box, as the card says it: the stream's first port
 * and the next one (a change of quality opens the next stream beside the
 * first), and this PC's address on the home network when the program gave it.
 * @param {any} net /api/internet/status
 * @returns {{ first: number, second: number, ip: string }}
 */
export function portsRule(net) {
    const port = Number(net && net.media_port_first);
    const first = Number.isInteger(port) && port > 0 && port < 65535 ? port : 48550;
    const ip = net && typeof net.local_ip === 'string' ? net.local_ip.trim() : '';
    return { first, second: first + 1, ip: /^[0-9a-fA-F.:]{3,45}$/.test(ip) ? ip : '' };
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
        // S3XYCast PC: a rule on the box would shorten the delay (portsAdvice).
        const advice = portsAdvice(this._data.internet);
        const ports = advice
            ? (() => {
                  const rule = portsRule(this._data.internet);
                  const ruleText = t(rule.ip ? 'pcDash.portsRule' : 'pcDash.portsRuleNoIp', {
                      first: rule.first,
                      second: rule.second,
                      ip: rule.ip,
                  });
                  return `<div class="pc-dash-ports is-${advice}" role="note">
                       <h3 class="pc-dash-ports-title">${escapeHtml(t('pcDash.portsTitle'))}</h3>
                       <p class="pc-dash-ports-text">${escapeHtml(t(advice === 'relayed' ? 'pcDash.portsRelayed' : 'pcDash.portsNoUpnp'))}</p>
                       <p class="pc-dash-ports-rule">${escapeHtml(ruleText)}</p>
                       <a class="btn btn-primary pc-dash-ports-how" href="${escapeHtml(BOX_HELP_URL)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t('pcDash.portsHow'))}</a>
                       <p class="pc-dash-ports-done">${escapeHtml(t('pcDash.portsDone'))}</p>
                   </div>`;
              })()
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
            ${ports}
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
