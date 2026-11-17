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
import { TouchPadLayoutEditor } from './TouchPadLayoutEditor.js';
import { touchPadLayouts } from '../stream/TouchPadState.js';
import {
    PadGames,
    padGameKeys,
    padGameLook,
    padGameSettings,
    storedStreamingSettings,
} from '../stream/PadGames.js';

/** @typedef {import('./StreamView.js').StreamView} StreamViewInstance */

/** Where the stream's settings are kept on this device (app.js reads it at each launch). */
export const STREAMING_SETTINGS_KEY = 'mw-streaming-settings';

/**
 * How long the controller's button stays plain before it steps back. It sits
 * over the top of the game's picture: long enough to be read and found, then
 * faint — still there, still one touch from its dialog.
 */
export const PAD_KBM_PILL_REST_MS = 4000;

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

/**
 * Keep where the viewer put the on-screen controls and how they look, with
 * the rest of this browser's streaming settings: what the settings page's own
 * editor saves, written from a stream. Nothing else in the store is touched.
 * @param {{ layout: object, scale: number, opacity: number, style: string }} look
 */
export function saveTouchPadLook({ layout, scale, opacity, style }) {
    try {
        const stored = localStorage.getItem(STREAMING_SETTINGS_KEY);
        const data = stored ? JSON.parse(stored) : {};
        Object.assign(data, {
            touch_pad_layout: layout,
            touch_pad_scale: scale,
            touch_pad_opacity: opacity,
            touch_pad_style: style,
        });
        localStorage.setItem(STREAMING_SETTINGS_KEY, JSON.stringify(data));
    } catch {
        // No store here, or one that is not ours to read: it lasts this stream.
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
        const text = t(kbm ? 'padKbm.pillKbm' : 'padKbm.pillPad');
        const changed = btn.textContent !== text;
        btn.textContent = text;
        btn.classList.toggle('is-kbm', kbm);
        // It has something new to say: said plainly, even while it rested.
        if (changed && !btn.hidden) this._wakePadKbmButton();
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
        const wasHidden = btn.hidden;
        btn.hidden = !rect;
        if (!rect) {
            this._stopPadKbmButtonRest();
            return;
        }
        btn.style.left = rect.x + rect.w / 2 + 'px';
        btn.style.top = rect.y + rect.h + 6 + 'px';
        // The controller's own opacity, which the resting button takes a part
        // of (css/s3xycast.css): a property, so the style sheet has the say.
        btn.style.setProperty('--touch-pad-mode-opacity', String(this._touchPadPref('opacity')));
        // Back on screen (the stream started, a dialog closed): plain again.
        if (wasHidden) this._wakePadKbmButton();
    }

    /**
     * Show the button plainly, then let it step back. It sat over the top of
     * the game's picture for as long as the controller was on screen; it now
     * says what the controllers are for a few seconds, each time it comes
     * back or has something new to say, and stays faint in between.
     * @this {StreamViewInstance}
     */
    _wakePadKbmButton() {
        const btn = this._padKbmBtn;
        if (!btn) return;
        this._stopPadKbmButtonRest();
        btn.classList.remove('is-resting');
        this._padKbmRestTimer = setTimeout(() => {
            this._padKbmRestTimer = null;
            if (this._padKbmBtn) this._padKbmBtn.classList.add('is-resting');
        }, PAD_KBM_PILL_REST_MS);
    }

    /** @this {StreamViewInstance} */
    _stopPadKbmButtonRest() {
        if (this._padKbmRestTimer) clearTimeout(this._padKbmRestTimer);
        this._padKbmRestTimer = null;
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
            // Where the joysticks and buttons sit, without leaving the game.
            onMoveControls: this._padLayoutEditable() ? () => this._openPadLayoutEditor() : null,
            // Whose settings these are: every game's, or one the viewer named.
            games: this._padGame ? this._padGameList() : null,
            onGame: (name) => this._choosePadGame(name),
            onNewGame: (typed) => this._addPadGame(typed),
            onDeleteGame: (name) => this._removePadGame(name),
        });
        this._padKbmDialog.open();
    }

    // ── The controller's settings, game by game (stream/PadGames.js) ───────

    /**
     * The game this stream's controller is set for; empty for every game's
     * settings, which is all a guest and a stream without a card have.
     * @this {StreamViewInstance}
     */
    _padGameName() {
        return (this._padGame && this._padGame.name) || '';
    }

    /** @this {StreamViewInstance} */
    _padGames() {
        if (!this._padGamesStore) this._padGamesStore = new PadGames();
        return this._padGamesStore;
    }

    /**
     * What the dialog shows of the games: their names, the one in play, and
     * the name to offer for a new one.
     * @this {StreamViewInstance}
     */
    _padGameList() {
        return {
            names: this._padGames().names(),
            current: this._padGameName(),
            suggested: (this._padGame && this._padGame.suggested) || '',
        };
    }

    /** The games and the keys in play, for the dialog to show. */
    _padGameState() {
        return { ...this._padGameList(), settings: this._padKbmSettings() };
    }

    /**
     * Where the on-screen controls are and how they look, now.
     * @this {StreamViewInstance}
     */
    _padLookNow() {
        return {
            layout: touchPadLayouts((this._touchPadPrefs || {}).layout),
            scale: this._touchPadPref('scale'),
            opacity: this._touchPadPref('opacity'),
            style: this._touchPadPref('style'),
        };
    }

    /**
     * Play with a game's settings — or every game's, for an empty name — and
     * remember it for this card's next stream. Nothing of either set changes.
     * @this {StreamViewInstance}
     * @param {string} name
     */
    _choosePadGame(name) {
        if (!this._padGame) return null;
        const games = this._padGames();
        const fields = name ? games.fields(name) : null;
        const chosen = fields ? name : '';
        games.choose(this._padGame.card, chosen);
        this._padGame.name = chosen;
        const { kbm, look } = padGameSettings(storedStreamingSettings(), fields);
        this._setPadKbm(kbm, { save: false });
        this._setPadLook(look, { save: false });
        return this._padGameState();
    }

    /**
     * A new game, which starts as the controller is now. A name already taken
     * is that game: it is chosen, as it was left.
     * @this {StreamViewInstance}
     * @param {string} typed
     */
    _addPadGame(typed) {
        if (!this._padGame) return null;
        const games = this._padGames();
        const added = games.add(typed, {
            ...padGameKeys(this._padKbmSettings()),
            ...padGameLook(this._padLookNow()),
        });
        if (!added) return null;
        if (added.existed) return this._choosePadGame(added.name);
        games.choose(this._padGame.card, added.name);
        this._padGame.name = added.name;
        return this._padGameState();
    }

    /**
     * Forget a game. The stream it was in play in goes back to every game's.
     * @this {StreamViewInstance}
     * @param {string} name
     */
    _removePadGame(name) {
        if (!this._padGame) return null;
        this._padGames().remove(name);
        if (this._padGameName() === name) return this._choosePadGame('');
        return this._padGameState();
    }

    /**
     * The game in play, for the view that replaces this one.
     * @this {StreamViewInstance}
     */
    _padGameSnapshot() {
        return this._padGame ? { name: this._padGameName(), look: this._padLookNow() } : null;
    }

    /**
     * Adopt a replaced view's game: a change of quality, or of screen, is the
     * same game going on. Its keys come with the view's own (_adoptPadKbm);
     * its controls' places come here.
     * @this {StreamViewInstance}
     */
    _adoptPadGame(state) {
        if (!state || !this._padGame) return;
        this._padGame.name = state.name || '';
        if (state.look) this._setPadLook(state.look, { save: false });
    }

    /**
     * Whether the on-screen controls can be moved from this stream: there is a
     * controller on it, and its viewer has settings to keep the places in (a
     * guest's are the invitation's).
     * @this {StreamViewInstance}
     */
    _padLayoutEditable() {
        return !!this._touchPadView && !this._playerMode;
    }

    /**
     * The layout editor of the settings page, over the stream. A player finds
     * out where his thumbs want the joysticks while playing, not before, and
     * the editor was three screens away, behind the game (a subscriber,
     * 17/11/2026). The pads stop reaching the host while it is up.
     * @this {StreamViewInstance}
     */
    _openPadLayoutEditor() {
        if (!this._padLayoutEditable() || this._padLayoutEditor) return;
        const prefs = this._touchPadPrefs || {};
        const editor = new TouchPadLayoutEditor(document.body, {
            layout: touchPadLayouts(prefs.layout),
            scale: this._touchPadPref('scale'),
            opacity: this._touchPadPref('opacity'),
            style: this._touchPadPref('style'),
            // The controller in full view, and Done one tap away.
            startFolded: true,
            // The names the game shows: a key each, while they are keys.
            labels: this._padKbmLabels(),
            onChange: (layout, look) => this._setPadLook({ layout, ...look }),
            onClosed: () => {
                this._padLayoutEditor = null;
                this._releasePads('pad-layout');
            },
        });
        this._padLayoutEditor = editor;
        this._holdPads('pad-layout');
        editor.open();
    }

    /**
     * Take what the editor gave back: on the controller at once, and kept for
     * the next stream and for the settings page.
     * @this {StreamViewInstance}
     * @param {{ layout: object, scale: number, opacity: number, style: string }} look
     * @param {{ save?: boolean }} [options]
     */
    _setPadLook(look, { save = true } = {}) {
        const next = {
            layout: touchPadLayouts(look.layout),
            scale: look.scale,
            opacity: look.opacity,
            style: look.style,
        };
        this._touchPadPrefs = { ...(this._touchPadPrefs || {}), ...next };
        this._padLook = next;
        const view = this._touchPadView;
        if (view) {
            view.setLayout(next.layout);
            view.setLook({ scale: next.scale, opacity: next.opacity, style: next.style });
        }
        this._placePadKbmButton();
        if (!save) return;
        // A game the viewer named keeps its own places; every game's are the
        // settings page's.
        const game = this._padGameName();
        if (game) this._padGames().update(game, padGameLook(next));
        else saveTouchPadLook(next);
    }

    /**
     * What the viewer arranged in this stream, for the view that replaces this one.
     * @this {StreamViewInstance}
     */
    _padLookSnapshot() {
        return this._padLook || null;
    }

    /**
     * Adopt a replaced view's arrangement: a change of quality is no reason to
     * put the joysticks back where they were.
     * @this {StreamViewInstance}
     */
    _adoptPadLook(look) {
        if (look) this._setPadLook(look, { save: false });
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
        if (!save) return;
        // A game the viewer named keeps its own mode and keys.
        const game = this._padGameName();
        if (game) this._padGames().update(game, padGameKeys(next));
        else savePadKbmSettings(next);
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
        if (this._padLayoutEditor) this._padLayoutEditor.close();
        this._padLayoutEditor = null;
        if (this._padKbm) this._padKbm.destroy();
        this._padKbm = null;
        this._stopPadKbmButtonRest();
        if (this._padKbmBtn) this._padKbmBtn.remove();
        this._padKbmBtn = null;
    }
}
