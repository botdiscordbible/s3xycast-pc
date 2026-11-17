/*
 * S3XYCast PC — an edition of MoonlightWeb. GPLv3, like the rest of the tree.
 *
 * The stream's quick actions, for StreamView.
 *
 * Watching a PC from a car's screen or a phone, three things were out of reach,
 * and the owner asked for each of them (15/11/2026):
 *
 *   - the keys no touch screen has: the Windows key, Alt+Tab, Alt+F4. The
 *     special-keys bar has Win and Alt, but only above the device's keyboard,
 *     and Alt+Tab there is three taps;
 *   - another screen of the same PC, without stopping the stream and opening
 *     the other card;
 *   - the zoom, and above all moving the zoomed picture: the pinch zooms, but
 *     the move takes three fingers, which a car's browser or a phone held in
 *     one hand does not give. He zoomed, and could no longer reach the parts
 *     that had left the screen.
 *
 * One button on the stream bar opens a strip under it, which stays until it is
 * closed: the keys in the viewer's words (each wears its keys as a caption),
 * the PC's other screens, and the zoom with a "move the picture" mode in which
 * one finger moves the picture instead of the PC's pointer.
 *
 * The strip is in the page's flow, between the bar and the picture: the picture
 * shrinks to make room, and nothing of the PC's screen is hidden under it. In
 * the fullscreen that fills the page (an iPhone held sideways) the bar and the
 * strip come back into that flow for as long as the strip is open: that part is
 * CSS alone (.stream-quick-open, css/s3xycast.css).
 *
 * Nothing changes on the host or in the protocol. The keys go out through the
 * stream's own sender, in the order a hand presses them. A guest who was given
 * no keyboard gets no keys; the screens are the owner's to change (app.js gives
 * the list and makes the change, or the row stays away).
 *
 * Plain prototype methods (`this` = the StreamView instance), copied onto
 * StreamView.prototype at the bottom of StreamView.js.
 */
import { t } from '../i18n/i18n.js';
import { escapeHtml } from '../util/escapeHtml.js';
import {
    ZOOM_MAX,
    ZOOM_MIN,
    ZOOM_STEPS,
    clampZoom,
    panAfterZoom,
    touchSpan,
    zoomLabel,
    zoomStep,
} from '../stream/ViewZoom.js';

/** @typedef {import('./StreamView.js').StreamView} StreamViewInstance */

/** Windows virtual-key codes of the keys the strip presses. */
const VK = {
    alt: 0x12,
    ctrl: 0x11,
    shift: 0x10,
    meta: 0x5b,
    tab: 0x09,
    f4: 0x73,
    escape: 0x1b,
    d: 0x44,
};
const FLAG = { alt: 'altKey', ctrl: 'ctrlKey', shift: 'shiftKey', meta: 'metaKey' };

/**
 * The keys of the strip. `label` says what the key is for, `caption` which keys
 * it presses. `mods` go down in order, `vk` is pressed and let go, then the
 * modifiers come up in reverse: the Windows key alone is a modifier pressed and
 * let go, which is what opens the Start menu. `char` makes a letter a chord, so
 * that the host presses the key that carries it on its own layout.
 * @type {Array<{ id: string, label: string, caption: string, mods: string[], vk?: number, char?: string }>}
 */
export const QUICK_KEYS = [
    { id: 'win', label: 'quick.keyWin', caption: 'Win', mods: ['meta'] },
    { id: 'switch', label: 'quick.keySwitch', caption: 'Alt+Tab', mods: ['alt'], vk: VK.tab },
    { id: 'close', label: 'quick.keyClose', caption: 'Alt+F4', mods: ['alt'], vk: VK.f4 },
    { id: 'tasks', label: 'quick.keyTasks', caption: 'Win+Tab', mods: ['meta'], vk: VK.tab },
    { id: 'esc', label: 'quick.keyEsc', caption: 'Esc', mods: [], vk: VK.escape },
    {
        id: 'desktop',
        label: 'quick.keyDesktop',
        caption: 'Win+D',
        mods: ['meta'],
        vk: VK.d,
        char: 'd',
    },
];

/**
 * What one key of the strip sends, as the stream's own key messages: every
 * press carries the modifiers held at that moment, the one going down included
 * and the one coming up left out, as the special-keys bar says them.
 * @param {{ mods?: string[], vk?: number, char?: string }} def
 * @returns {Array<Record<string, unknown>>}
 */
export function quickKeyEvents(def) {
    const flags = { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false };
    const mods = def.mods || [];
    /** @type {Array<Record<string, unknown>>} */
    const out = [];
    for (const name of mods) {
        flags[FLAG[name]] = true;
        out.push({ type: 'keydown', keyCode: VK[name], code: '', key: '', ...flags });
    }
    if (def.vk) {
        /** @type {Record<string, unknown>} */
        const key = { keyCode: def.vk, code: '', key: '', ...flags };
        if (def.char) {
            key.char = def.char;
            key.chord = true;
        }
        out.push({ type: 'keydown', ...key }, { type: 'keyup', ...key });
    }
    for (let i = mods.length - 1; i >= 0; i--) {
        flags[FLAG[mods[i]]] = false;
        out.push({ type: 'keyup', keyCode: VK[mods[i]], code: '', key: '', ...flags });
    }
    return out;
}

const TOUCH_EVENTS = ['touchstart', 'touchmove', 'touchend', 'touchcancel'];
/** What a mouse does on the picture while it is being moved. */
const MOUSE_EVENTS = [
    'mousedown',
    'mousemove',
    'mouseup',
    'pointerdown',
    'click',
    'dblclick',
    'contextmenu',
    'wheel',
];

/** Where a finger is not on the picture: the page's own controls. */
const NOT_THE_PICTURE =
    'button, .stream-quick, .stream-header, .touch-pad, #stream-stats-overlay, ' +
    '.stream-kbd-toolbar, .pad-kbm-overlay, .share-popin-overlay';

export class StreamViewQuick {
    /**
     * May this viewer press the PC's keys? Not a guest who was given no keyboard.
     * @this {StreamViewInstance}
     */
    _quickKeysAllowed() {
        return this._mouseAllowed !== false;
    }

    /**
     * The button on the stream bar and the strip under it. Called once the
     * stream shows, with the bar's other controls. Idempotent.
     * @this {StreamViewInstance}
     */
    _mountQuick() {
        if (this._quickBtn || !this._rootEl) return;
        const header = /** @type {HTMLElement|null} */ (
            this._rootEl.querySelector('.stream-header')
        );
        if (!header || !this.canvasArea) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'btn-stream-quick';
        btn.className = 'btn-stream-kbd btn-stream-quick';
        btn.title = t('quick.openTitle');
        btn.setAttribute('aria-label', t('quick.openTitle'));
        btn.setAttribute('aria-expanded', 'false');
        btn.innerHTML =
            '<span class="btn-stream-quick-dots" aria-hidden="true">⋯</span>' +
            `<span class="btn-stream-quick-label">${escapeHtml(t('quick.open'))}</span>`;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._quickToggle();
        });
        header.insertBefore(btn, header.querySelector(':scope > #btn-stream-quit'));
        this._quickBtn = btn;

        const strip = document.createElement('div');
        strip.id = 'stream-quick';
        strip.className = 'stream-quick';
        strip.hidden = true;
        strip.innerHTML = this._quickMarkup();
        // In the flow, between the bar and the picture.
        this.canvasArea.before(strip);
        strip.addEventListener('click', (e) => this._quickOnClick(e));
        // The whole stream view is a trackpad, and a finger that lands between
        // two of the strip's buttons would click on the PC: what is not a
        // button here is nobody's. The buttons are left to the view's own
        // touch handlers, which press them (StreamViewTouch.handleTouchEnd),
        // the device's keyboard up or not.
        const between = (e) => {
            const target = /** @type {HTMLElement} */ (e.target);
            if (!(target.closest && target.closest('button'))) e.stopPropagation();
        };
        for (const type of TOUCH_EVENTS) strip.addEventListener(type, between, { passive: true });
        this._quickStrip = strip;

        // The badge that says the picture is being moved, and ends it.
        const badge = document.createElement('button');
        badge.type = 'button';
        badge.className = 'stream-quick-badge';
        badge.hidden = true;
        badge.innerHTML =
            `<span class="stream-quick-badge-text">${escapeHtml(t('quick.moveOn'))}</span>` +
            `<span class="stream-quick-badge-done">${escapeHtml(t('quick.moveDone'))}</span>`;
        badge.addEventListener('click', (e) => {
            e.stopPropagation();
            this._quickSetMove(false);
        });
        this.canvasArea.appendChild(badge);
        this._quickBadge = badge;

        // Ahead of the stream's own handlers (capture), for the one mode in
        // which a finger on the picture is not the PC's pointer.
        this._quickMoveTouch = (e) => this._quickOnMoveTouch(e);
        this._quickMoveMouse = (e) => this._quickOnMoveMouse(e);
        for (const type of TOUCH_EVENTS)
            this._rootEl.addEventListener(type, this._quickMoveTouch, {
                capture: true,
                passive: false,
            });
        for (const type of MOUSE_EVENTS)
            this._rootEl.addEventListener(type, this._quickMoveMouse, {
                capture: true,
                passive: false,
            });

        // The middle of the bar is laid out against its right-hand buttons
        // (_barFlowStart): again now that there is one more, and each time the
        // bar gains or loses a button (Share comes later) or changes width.
        const relay = () => {
            if (this._quickBarFrame) return;
            this._quickBarFrame = requestAnimationFrame(() => {
                this._quickBarFrame = 0;
                // Not while the browser's own fullscreen hides the bar: there
                // is nothing to lay out, and the reminder is placed by itself.
                if (this._quickBtn && header.getBoundingClientRect().width > 0)
                    this._positionGamingOverlay?.();
            });
        };
        if (typeof MutationObserver !== 'undefined') {
            this._quickBarChildren = new MutationObserver(relay);
            this._quickBarChildren.observe(header, { childList: true });
        }
        if (typeof ResizeObserver !== 'undefined') {
            this._quickBarWidth = new ResizeObserver(relay);
            this._quickBarWidth.observe(header);
        }
        this._positionGamingOverlay?.();

        this._quickSyncZoom();
        if (this._quickCarry) {
            const carry = this._quickCarry;
            this._quickCarry = null;
            this._adoptQuick(carry);
        }
    }

    /**
     * Where the bar's right-hand buttons begin (a viewport x), or null when
     * none is laid out. The Fullscreen button and what is docked to it are
     * centred over the bar and take no room in it; the buttons on the right do.
     * Nothing kept the two apart: with one more button in the flow (this one),
     * the gamepad button sat on "Fullscreen" on a screen as wide as a car's.
     * StreamView._positionGamingOverlay asks this before it places the group.
     * @this {StreamViewInstance}
     * @returns {number|null}
     */
    _barFlowStart() {
        const header = this._rootEl ? this._rootEl.querySelector('.stream-header') : null;
        if (!header) return null;
        let start = null;
        for (const el of Array.from(header.children)) {
            if (el === this._mobileFsBtn || el.classList.contains('stream-brand')) continue;
            const position = getComputedStyle(el).position;
            if (position === 'absolute' || position === 'fixed') continue;
            const rect = el.getBoundingClientRect();
            if (!(rect.width > 0)) continue;
            if (start === null || rect.left < start) start = rect.left;
        }
        return start;
    }

    /** @this {StreamViewInstance} */
    _quickMarkup() {
        const keys = this._quickKeysAllowed()
            ? `<div class="stream-quick-row" data-group="keys">
                   <span class="stream-quick-title">${escapeHtml(t('quick.keysTitle'))}</span>
                   <div class="stream-quick-items">${QUICK_KEYS.map(
                       (k) =>
                           `<button type="button" class="stream-quick-btn" data-quick="key" data-key="${k.id}">
                                <span class="stream-quick-name">${escapeHtml(t(k.label))}</span>
                                <span class="stream-quick-caption">${escapeHtml(k.caption)}</span>
                            </button>`,
                   ).join('')}</div>
               </div>`
            : '';
        return `
            ${keys}
            <div class="stream-quick-row" data-group="screens" hidden>
                <span class="stream-quick-title">${escapeHtml(t('quick.screensTitle'))}</span>
                <div class="stream-quick-items"></div>
            </div>
            <div class="stream-quick-row" data-group="view">
                <span class="stream-quick-title">${escapeHtml(t('quick.viewTitle'))}</span>
                <div class="stream-quick-items">
                    <button type="button" class="stream-quick-btn is-square" data-quick="zoom-out"
                            aria-label="${escapeHtml(t('quick.zoomOut'))}">−</button>
                    <span class="stream-quick-zoom" aria-live="polite"></span>
                    <button type="button" class="stream-quick-btn is-square" data-quick="zoom-in"
                            aria-label="${escapeHtml(t('quick.zoomIn'))}">+</button>
                    <button type="button" class="stream-quick-btn" data-quick="move"
                            aria-pressed="false">${escapeHtml(t('quick.move'))}</button>
                    <button type="button" class="stream-quick-btn" data-quick="fit">${escapeHtml(
                        t('quick.fit'),
                    )}</button>
                </div>
            </div>
            <button type="button" class="stream-quick-close" data-quick="close"
                    aria-label="${escapeHtml(t('quick.close'))}">✕</button>`;
    }

    /**
     * Open or close the strip. The picture's area changes size with it.
     * @this {StreamViewInstance}
     * @param {boolean} [open]
     */
    _quickToggle(open) {
        if (!this._quickStrip || !this._quickBtn) return;
        const want = open === undefined ? this._quickStrip.hidden : open;
        if (want === !this._quickStrip.hidden) return;
        this._quickStrip.hidden = !want;
        this._quickBtn.classList.toggle('active', want);
        this._quickBtn.setAttribute('aria-expanded', want ? 'true' : 'false');
        // What the stylesheet lays the fullscreen out by.
        if (this._rootEl) this._rootEl.classList.toggle('stream-quick-open', want);
        if (want) {
            this._quickSyncZoom();
            this._quickLoadScreens();
        }
        this._quickAreaChanged();
    }

    /** @this {StreamViewInstance} */
    _quickIsOpen() {
        return !!this._quickStrip && !this._quickStrip.hidden;
    }

    /**
     * The picture's area has another size, or sits elsewhere: what the stream
     * cached of it is stale, the pan is held to the new area, and the stats
     * card goes under the strip. (The size the picture is drawn at follows on
     * its own: the view observes the area.)
     * @this {StreamViewInstance}
     */
    _quickAreaChanged() {
        this._invalidateMediaRect?.();
        if (this._zoom > 1.001) this._applyZoomTransform();
        else this._placeClientCursor?.();
        this._positionStatsOverlay?.();
    }

    /**
     * Where the bars end: under the strip when it is open. The stats card sits
     * under that line. 0 when the strip is closed.
     * @this {StreamViewInstance}
     */
    _quickBottom() {
        if (!this._quickIsOpen()) return 0;
        const rect = this._quickStrip.getBoundingClientRect();
        return rect.height > 0 ? rect.bottom : 0;
    }

    /** @this {StreamViewInstance} */
    _quickOnClick(e) {
        const target = /** @type {HTMLElement} */ (e.target);
        const actor = target.closest
            ? /** @type {HTMLElement|null} */ (target.closest('[data-quick]'))
            : null;
        if (!actor || !this._quickStrip || !this._quickStrip.contains(actor)) return;
        e.stopPropagation();
        const act = actor.dataset.quick;
        if (act === 'key') this._quickPressKey(actor.dataset.key || '');
        else if (act === 'zoom-in') this._quickZoomBy(1);
        else if (act === 'zoom-out') this._quickZoomBy(-1);
        else if (act === 'move') this._quickSetMove(!this._quickMoveOn);
        else if (act === 'fit') this._quickZoomTo(ZOOM_MIN);
        else if (act === 'close') this._quickToggle(false);
        else if (act === 'screen') this._quickPickScreen(Number(actor.dataset.id));
    }

    // ── Keys ─────────────────────────────────────────────────────────────────

    /**
     * Press one key of the strip on the PC.
     * @this {StreamViewInstance}
     * @param {string} id
     */
    _quickPressKey(id) {
        if (!this._quickKeysAllowed()) return;
        const def = QUICK_KEYS.find((k) => k.id === id);
        if (!def) return;
        for (const event of quickKeyEvents(def)) this._sendKeyEvent(event);
    }

    // ── Screens ──────────────────────────────────────────────────────────────

    /**
     * Fill the row of the PC's screens, when the application offers them: at
     * least two, or there is nothing to change to and the row stays away.
     * @this {StreamViewInstance}
     */
    async _quickLoadScreens() {
        const strip = this._quickStrip;
        const row = strip
            ? /** @type {HTMLElement|null} */ (strip.querySelector('[data-group="screens"]'))
            : null;
        if (!row) return;
        let list = [];
        if (typeof this.onQuickScreens === 'function') {
            try {
                list = (await this.onQuickScreens()) || [];
            } catch {
                list = [];
            }
        }
        if (this._quickStrip !== strip) return;
        const was = row.hidden;
        if (!Array.isArray(list) || list.length < 2) {
            row.hidden = true;
        } else {
            row.hidden = false;
            /** @type {HTMLElement} */ (row.querySelector('.stream-quick-items')).innerHTML = list
                .map(
                    (s) =>
                        `<button type="button" class="stream-quick-btn${s.current ? ' is-current' : ''}"
                                 data-quick="screen" data-id="${Number(s.id)}"
                                 ${s.current ? 'aria-pressed="true" disabled' : 'aria-pressed="false"'}>
                             <span class="stream-quick-name">${escapeHtml(String(s.name || ''))}</span>
                             ${
                                 s.current
                                     ? `<span class="stream-quick-caption">${escapeHtml(t('quick.screenShown'))}</span>`
                                     : ''
                             }
                         </button>`,
                )
                .join('');
        }
        if (was !== row.hidden) this._quickAreaChanged();
    }

    /**
     * Another screen was chosen: the application ends this stream and starts
     * that one, on the stream's own screen.
     * @this {StreamViewInstance}
     * @param {number} id
     */
    _quickPickScreen(id) {
        if (!Number.isFinite(id) || typeof this.onQuickSwitchScreen !== 'function') return;
        // One change at a time: the row answers again on the next view.
        const row = this._quickStrip?.querySelector('[data-group="screens"]');
        const taken = row ? Array.from(row.querySelectorAll('button')) : [];
        for (const b of taken) /** @type {HTMLButtonElement} */ (b).disabled = true;
        // The other screen is another picture: it starts whole.
        this._quickZoomTo(ZOOM_MIN);
        Promise.resolve(this.onQuickSwitchScreen(id)).then((changing) => {
            // Refused (a share is running, another change is under way): this
            // view stays, and its row is to answer again.
            if (changing === false && this._quickStrip) this._quickLoadScreens();
        });
    }

    // ── Zoom, and moving the picture ─────────────────────────────────────────

    /**
     * One stop in or out, around the middle of the picture's area.
     * @this {StreamViewInstance}
     * @param {number} dir
     */
    _quickZoomBy(dir) {
        this._quickZoomTo(zoomStep(this._zoom, dir));
    }

    /**
     * @this {StreamViewInstance}
     * @param {number} zoom
     * @param {{ x: number, y: number }} [focal] the point held still, from the
     *   middle of the area; its middle when absent
     */
    _quickZoomTo(zoom, focal) {
        const next = clampZoom(zoom);
        const factor = next / (this._zoom || 1);
        this._panX = panAfterZoom(this._panX, focal ? focal.x : 0, factor);
        this._panY = panAfterZoom(this._panY, focal ? focal.y : 0, factor);
        this._zoom = next;
        if (this._zoom <= 1.001) {
            this._zoom = ZOOM_MIN;
            this._panX = 0;
            this._panY = 0;
            // A whole picture has nowhere to go.
            if (this._quickMoveOn) this._quickSetMove(false);
        }
        this._stopPanMomentum?.();
        this._applyZoomTransform();
        // The enhancer draws at the zoomed size: same step as the pinch.
        if (this._outputZoomScale() !== this._lastOutputZoomScale) this._applyOutputSize();
    }

    /**
     * What the strip says of the zoom, and which of its buttons mean something.
     * Called by the stream each time the zoom or the pan is applied, the
     * pinch's included.
     * @this {StreamViewInstance}
     */
    _quickSyncZoom() {
        const strip = this._quickStrip;
        if (!strip) return;
        const zoom = clampZoom(this._zoom);
        const label = strip.querySelector('.stream-quick-zoom');
        if (label) label.textContent = zoomLabel(zoom);
        const set = (name, disabled) => {
            const b = /** @type {HTMLButtonElement|null} */ (
                strip.querySelector(`[data-quick="${name}"]`)
            );
            if (b) b.disabled = disabled;
        };
        set('zoom-out', zoom <= ZOOM_MIN + 0.001);
        set('zoom-in', zoom >= ZOOM_MAX - 0.001);
        set('fit', zoom <= ZOOM_MIN + 0.001);
    }

    /**
     * "Move the picture": on, one finger (or the mouse held down) moves the
     * picture and two fingers zoom it; the PC's pointer is left alone. Turned
     * on over a whole picture, it zooms one stop first, or there would be
     * nothing to move.
     * @this {StreamViewInstance}
     * @param {boolean} on
     */
    _quickSetMove(on) {
        const want = !!on;
        if (want === !!this._quickMoveOn) return;
        // Ended under the fingers (pinched back to the whole picture): what is
        // left of that gesture must not become the PC's pointer half-way.
        if (!want && this._quickMoveLast && !this._quickMouseHeld) this._quickMoveTail = true;
        this._quickMoveOn = want;
        this._quickMoveLast = null;
        this._quickMouseHeld = false;
        if (want) {
            if (this._zoom <= 1.001) this._quickZoomTo(ZOOM_STEPS[1]);
            // The mouse may be held by the picture (a game's look): it is given
            // back, or a drag would turn the view on the PC instead.
            if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
        }
        const btn = this._quickStrip?.querySelector('[data-quick="move"]');
        if (btn) {
            btn.classList.toggle('active', want);
            btn.setAttribute('aria-pressed', want ? 'true' : 'false');
        }
        if (this._quickBadge) this._quickBadge.hidden = !want;
        if (this._rootEl) this._rootEl.classList.toggle('stream-quick-moving', want);
    }

    /**
     * Is this touch or click the picture's, in the mode that moves it?
     * @this {StreamViewInstance}
     */
    _quickOnPicture(e) {
        if (!this._quickMoveOn) return false;
        const target = /** @type {HTMLElement} */ (e.target);
        return !(target && target.closest && target.closest(NOT_THE_PICTURE));
    }

    /**
     * A finger on the picture while it is being moved: one finger moves it, two
     * zoom it around the point between them and move it with them.
     * @this {StreamViewInstance}
     */
    _quickOnMoveTouch(e) {
        if (this._quickMoveTail) {
            e.stopImmediatePropagation();
            if (e.cancelable) e.preventDefault();
            if (!e.touches.length) this._quickMoveTail = false;
            return;
        }
        if (!this._quickOnPicture(e)) return;
        e.stopImmediatePropagation();
        if (e.cancelable) e.preventDefault();
        const now = touchSpan(e.touches);
        const last = this._quickMoveLast;
        // A finger came or went: the next move is counted from here.
        if (e.type !== 'touchmove' || !last || last.count !== now.count || !now.count) {
            this._quickMoveLast = now.count ? now : null;
            return;
        }
        this._quickMoveLast = now;
        if (now.count >= 2 && last.spread > 0 && now.spread > 0) {
            const next = clampZoom(this._zoom * (now.spread / last.spread));
            if (next !== this._zoom && this.canvasArea) {
                const rect = this.canvasArea.getBoundingClientRect();
                this._quickZoomTo(next, {
                    x: now.x - (rect.left + rect.width / 2),
                    y: now.y - (rect.top + rect.height / 2),
                });
                // Pinched back to the whole picture: the mode ended with it.
                if (!this._quickMoveOn) return;
            }
        }
        this._panX += now.x - last.x;
        this._panY += now.y - last.y;
        this._applyZoomTransform();
    }

    /**
     * The same with a mouse: held down it moves the picture, its wheel zooms
     * around the pointer. Nothing of it reaches the PC.
     * @this {StreamViewInstance}
     */
    _quickOnMoveMouse(e) {
        if (!this._quickOnPicture(e)) return;
        // A finger also sends pointer events: they are the touch handler's.
        if (e.pointerType && e.pointerType !== 'mouse') return;
        e.stopImmediatePropagation();
        if (e.cancelable) e.preventDefault();
        if (e.type === 'wheel') {
            if (!this.canvasArea || !e.deltaY) return;
            const rect = this.canvasArea.getBoundingClientRect();
            this._quickZoomTo(zoomStep(this._zoom, e.deltaY < 0 ? 1 : -1), {
                x: e.clientX - (rect.left + rect.width / 2),
                y: e.clientY - (rect.top + rect.height / 2),
            });
            return;
        }
        if (e.type === 'mousedown') {
            this._quickMouseHeld = e.button === 0;
            this._quickMoveLast = { count: 1, x: e.clientX, y: e.clientY, spread: 0 };
        } else if (e.type === 'mouseup') {
            this._quickMouseHeld = false;
            this._quickMoveLast = null;
        } else if (e.type === 'mousemove' && this._quickMouseHeld && this._quickMoveLast) {
            this._panX += e.clientX - this._quickMoveLast.x;
            this._panY += e.clientY - this._quickMoveLast.y;
            this._quickMoveLast = { count: 1, x: e.clientX, y: e.clientY, spread: 0 };
            this._applyZoomTransform();
        }
    }

    // ── From one view to the next ────────────────────────────────────────────

    /**
     * What the viewer left open, for the view that replaces this one (a change
     * of quality, of transport, of screen).
     * @this {StreamViewInstance}
     */
    _quickSnapshot() {
        return { open: this._quickIsOpen(), move: this._quickMoveOn === true };
    }

    /**
     * Adopt a replaced view's _quickSnapshot.
     * @this {StreamViewInstance}
     * @param {{ open?: boolean, move?: boolean }|null|undefined} carry
     */
    _adoptQuick(carry) {
        if (!carry) return;
        if (!this._quickStrip) {
            // Not mounted yet (the strip comes with the first picture).
            this._quickCarry = carry;
            return;
        }
        if (carry.open) this._quickToggle(true);
        if (carry.move && this._zoom > 1.001) this._quickSetMove(true);
    }

    /** @this {StreamViewInstance} */
    _destroyQuick() {
        if (this._rootEl) {
            if (this._quickMoveTouch)
                for (const type of TOUCH_EVENTS)
                    this._rootEl.removeEventListener(type, this._quickMoveTouch, true);
            if (this._quickMoveMouse)
                for (const type of MOUSE_EVENTS)
                    this._rootEl.removeEventListener(type, this._quickMoveMouse, true);
            this._rootEl.classList.remove('stream-quick-moving', 'stream-quick-open');
        }
        if (this._quickBarChildren) this._quickBarChildren.disconnect();
        if (this._quickBarWidth) this._quickBarWidth.disconnect();
        if (this._quickBarFrame) cancelAnimationFrame(this._quickBarFrame);
        this._quickBarChildren = null;
        this._quickBarWidth = null;
        this._quickBarFrame = 0;
        this._quickMoveTouch = null;
        this._quickMoveMouse = null;
        this._quickMoveOn = false;
        this._quickMoveLast = null;
        this._quickMoveTail = false;
        if (this._quickBtn) this._quickBtn.remove();
        if (this._quickStrip) this._quickStrip.remove();
        if (this._quickBadge) this._quickBadge.remove();
        this._quickBtn = null;
        this._quickStrip = null;
        this._quickBadge = null;
    }
}
