/*
 * S3XYCast PC — an edition of MoonlightWeb. GPLv3, like the rest of the tree.
 *
 * The controllers played as a keyboard and a mouse, for StreamView: every
 * message GamepadManager has for the host goes through a PadKeyMouse, which in
 * its keyboard-and-mouse mode turns it into keys, mouse buttons and mouse moves
 * sent the way the stream sends its own. The on-screen controller gets a small
 * button that says which of the two it is, and opens the dialog that sets it.
 *
 * A guest of a shared stream keeps a pad a pad: they have what their
 * invitation gave them, and a keyboard may not be part of it.
 *
 * Plain prototype methods (`this` = the StreamView instance), copied onto
 * StreamView.prototype at the bottom of StreamView.js.
 */
import { t } from '../i18n/i18n.js';
import {
    PAD_KBM_BUTTONS,
    PadKeyMouse,
    padKbmFields,
    padKbmSettings,
    padKbmShortLabel,
} from '../stream/PadKeyMouse.js';
import { PadKeyMouseDialog } from './PadKeyMouseDialog.js';

/** @typedef {import('./StreamView.js').StreamView} StreamViewInstance */

/** Where the stream's settings are kept on this device (app.js reads it at each launch). */
export const STREAMING_SETTINGS_KEY = 'mw-streaming-settings';

/**
 * Keep the viewer's choice with the stream's other settings, for the next
 * stream and for the settings page. Nothing else in the store is touched.
 * @param {{ mode: string, sens: number, map: Record<string, string> }} settings
 */
export function savePadKbmSettings(settings) {
    try {
        const stored = localStorage.getItem(STREAMING_SETTINGS_KEY);
        const data = stored ? JSON.parse(stored) : {};
        Object.assign(data, padKbmFields(settings));
        localStorage.setItem(STREAMING_SETTINGS_KEY, JSON.stringify(data));
    } catch {
        // No store here (private browsing), or one that is not ours to read:
        // the choice lasts this stream.
    }
}

export class StreamViewPadKbm {
    /**
     * What this viewer chose, with the defaults of one who never did.
     * @this {StreamViewInstance}
     */
    _padKbmSettings() {
        if (!this._padKbmPrefs) this._padKbmPrefs = padKbmSettings();
        return this._padKbmPrefs;
    }

    /** @this {StreamViewInstance} */
    _padKbmAllowed() {
        return !this._playerMode;
    }

    /**
     * The translator, made at the first thing a pad has to say.
     * @this {StreamViewInstance}
     */
    _ensurePadKbm() {
        if (this._padKbm) return this._padKbm;
        const settings = this._padKbmSettings();
        this._padKbm = new PadKeyMouse(
            {
                send: (msg) => this.webrtc.send(msg),
                key: (key, down) => this._padKbmKey(key, down),
                // A genuine hold whatever the mouse mode: aim, fire.
                button: (button, down) => this._sendMouseButton(button, down, null, true),
                wheel: (notches) => this._sendWheel('mousewheel', notches, 'y'),
                // Not _sendRelativeMouse: that one carries the setting of a
                // mouse in the hand, and this stick has its own.
                move: (dx, dy) => this._sendToHost({ type: 'mousemove', dx, dy }),
            },
            { ...settings, mode: this._padKbmAllowed() ? settings.mode : 'pad' },
        );
        return this._padKbm;
    }

    /**
     * What GamepadManager sends, on its way to the host.
     * @this {StreamViewInstance}
     */
    _padSend(msg) {
        this._ensurePadKbm().handle(msg);
    }

    /**
     * One key of the translator's, sent as the keyboard's are: in the held set
     * the heartbeat beats, with the modifier flags of everything held.
     * @this {StreamViewInstance}
     */
    _padKbmKey(key, down) {
        const held = this._heldPhysKeys;
        // A modifier's own press carries its flag, as a keyboard's does.
        const flag = (left, right) =>
            key.code === left ? down || held.has(right) : held.has(left) || held.has(right);
        this._sendKeyEvent({
            type: down ? 'keydown' : 'keyup',
            ...key,
            ctrlKey: flag('ControlLeft', 'ControlRight'),
            shiftKey: flag('ShiftLeft', 'ShiftRight'),
            altKey: flag('AltLeft', 'AltRight'),
            metaKey: held.has('MetaLeft') || held.has('MetaRight'),
        });
    }

    /**
     * What the on-screen controller's buttons are called while they are keys:
     * the key each one presses. Null while it is a pad, which has its names.
     * @this {StreamViewInstance}
     * @returns {Record<string, string>|null}
     */
    _padKbmLabels() {
        const settings = this._padKbmSettings();
        if (!this._padKbmAllowed() || settings.mode !== 'kbm') return null;
        /** @type {Record<string, string>} */
        const labels = {};
        for (const id of PAD_KBM_BUTTONS) labels[id] = padKbmShortLabel(settings.map[id], t);
        return labels;
    }

    /**
     * The button that says what the controllers are, and opens the dialog. It
     * lives with the on-screen controller: under its handle, while it shows.
     * @this {StreamViewInstance}
     */
    _mountPadKbmButton() {
        if (this._padKbmBtn || !this._padKbmAllowed() || !this._rootEl) return;
        const area = this._rootEl.querySelector('.stream-canvas-area');
        if (!area) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'touch-pad-mode';
        btn.hidden = true;
        btn.title = t('padKbm.button');
        btn.setAttribute('aria-label', t('padKbm.button'));
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._openPadKbmDialog();
        });
        area.appendChild(btn);
        this._padKbmBtn = btn;
        this._syncPadKbmButton();
    }

    /** @this {StreamViewInstance} */
    _syncPadKbmButton() {
        const btn = this._padKbmBtn;
        if (!btn) return;
        const kbm = this._padKbmSettings().mode === 'kbm';
        btn.textContent = t(kbm ? 'padKbm.pillKbm' : 'padKbm.pillPad');
        btn.classList.toggle('is-kbm', kbm);
    }

    /**
     * Under the handle while the controller is on screen, gone with it.
     * @this {StreamViewInstance}
     */
    _placePadKbmButton() {
        const btn = this._padKbmBtn;
        if (!btn) return;
        const view = this._touchPadView;
        const rect = view && view.isVisible() ? view.toggleRect() : null;
        btn.hidden = !rect;
        if (!rect) return;
        btn.style.left = rect.x + rect.w / 2 + 'px';
        btn.style.top = rect.y + rect.h + 6 + 'px';
        btn.style.opacity = String(this._touchPadPref('opacity'));
    }

    /**
     * The dialog over the stream. The pads stop reaching the host while it is
     * up, so trying a button in it presses nothing in the game.
     * @this {StreamViewInstance}
     */
    _openPadKbmDialog() {
        if (!this._padKbmAllowed()) return;
        if (this._padKbmDialog && this._padKbmDialog.isOpen) return;
        this._padKbmDialog = new PadKeyMouseDialog({
            container: this._rootEl || document.body,
            settings: this._padKbmSettings(),
            onOpen: () => this._holdPads('pad-kbm'),
            onChange: (settings) => this._setPadKbm(settings),
            onClose: () => this._releasePads('pad-kbm'),
        });
        this._padKbmDialog.open();
    }

    /**
     * Take the viewer's choice: at once for this stream, and kept for the next.
     * @this {StreamViewInstance}
     * @param {{ mode: string, sens: number, map: Record<string, string> }} settings
     * @param {{ save?: boolean }} [options]
     */
    _setPadKbm(settings, { save = true } = {}) {
        if (!this._padKbmAllowed()) return;
        const next = padKbmSettings(padKbmFields(settings));
        const before = this._padKbmSettings();
        this._padKbmPrefs = next;
        const padKbm = this._padKbm;
        if (padKbm) {
            if (JSON.stringify(next.map) !== JSON.stringify(before.map)) padKbm.setMap(next.map);
            if (next.sens !== before.sens) padKbm.setSensitivity(next.sens);
            padKbm.setMode(next.mode);
        }
        if (this._touchPadView) this._touchPadView.setLook({ labels: this._padKbmLabels() });
        this._syncPadKbmButton();
        if (save) savePadKbmSettings(next);
    }

    /**
     * What the viewer chose, for the view that replaces this one.
     * @this {StreamViewInstance}
     */
    _padKbmSnapshot() {
        return this._padKbmPrefs || null;
    }

    /**
     * Adopt a replaced view's choice: a change of quality is no reason to hand
     * the game a controller it does not read.
     * @this {StreamViewInstance}
     */
    _adoptPadKbm(settings) {
        if (settings) this._setPadKbm(settings, { save: false });
    }

    /**
     * Take it all away with the view. Nothing is sent: the stream is over, and
     * the host lets go of what it held.
     * @this {StreamViewInstance}
     */
    _destroyPadKbm() {
        if (this._padKbmDialog) this._padKbmDialog.close();
        this._padKbmDialog = null;
        if (this._padKbm) this._padKbm.destroy();
        this._padKbm = null;
        if (this._padKbmBtn) this._padKbmBtn.remove();
        this._padKbmBtn = null;
    }
}
