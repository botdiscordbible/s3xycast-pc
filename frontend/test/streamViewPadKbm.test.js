/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * The controllers played as a keyboard and a mouse, in a stream: the real
 * GamepadManager, the real on-screen controller and the real translator, over
 * a view made of the two mixins' methods and of what StreamView gives them
 * (its key and mouse senders, its held sets). What is looked at is what
 * reaches the input channel, since that is all the host ever knows.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../js/i18n/i18n.js', () => ({
    t: (key) => key,
    getLanguage: () => 'en',
}));

import { StreamViewTouchPad } from '../js/ui/StreamViewTouchPad.js';
import {
    StreamViewPadKbm,
    STREAMING_SETTINGS_KEY,
    savePadKbmSettings,
} from '../js/ui/StreamViewPadKbm.js';
import { GamepadManager } from '../js/stream/GamepadManager.js';
import { PAD } from '../js/stream/TouchPadState.js';
import { PAD_KBM_DEFAULT_MAP, padKbmSettings } from '../js/stream/PadKeyMouse.js';

const HTML = `
    <div class="stream-header"><button id="btn-stream-quit"></button></div>
    <div class="stream-canvas-area"></div>`;

const flush = () => new Promise((resolve) => queueMicrotask(resolve));
const kbm = (fields = {}) => padKbmSettings({ pad_kbm_mode: 'kbm', ...fields });

describe('the controllers as a keyboard and a mouse, in a stream', () => {
    let send;
    let media;
    let views;

    /** A view with both mixins' methods, and StreamView's own part reduced to what they call. */
    function makeView(fields = {}) {
        const root = document.createElement('div');
        root.innerHTML = HTML;
        document.body.appendChild(root);
        const proto = {};
        for (const Mixin of [StreamViewTouchPad, StreamViewPadKbm]) {
            for (const name of Object.getOwnPropertyNames(Mixin.prototype)) {
                if (name === 'constructor') continue;
                Object.defineProperty(
                    proto,
                    name,
                    Object.getOwnPropertyDescriptor(Mixin.prototype, name),
                );
            }
        }
        const view = Object.create(proto);
        Object.assign(view, {
            _rootEl: root,
            webrtc: { send },
            _padHolds: new Set(),
            _playerMode: false,
            _gamepadAllowed: false,
            _kbdVisible: false,
            _standby: false,
            _quitting: false,
            _touchPadPrefs: { mode: 'always' },
            _padKbmPrefs: null,
            _heldPhysKeys: new Map(),
            _heldMouseButtons: new Set(),
            _hideShortcutsSlide: vi.fn(),
            _toggleVirtualKeyboard: vi.fn(),
            // As StreamView has them.
            _sendKeyEvent(msg) {
                const id = msg.code || msg.keyCode;
                if (msg.type === 'keydown') this._heldPhysKeys.set(id, { ...msg, type: 'keyup' });
                else this._heldPhysKeys.delete(id);
                this.webrtc.send(msg);
            },
            _sendMouseButton(button, down, stamp = null, hold = null) {
                if (down) this._heldMouseButtons.add(button);
                else this._heldMouseButtons.delete(button);
                this.webrtc.send({
                    type: down ? 'mousedown' : 'mouseup',
                    button,
                    hold: down && (hold === null ? false : hold),
                });
            },
            _sendWheel(type, notches) {
                this.webrtc.send({ type, delta: notches * 120 });
            },
            _sendToHost(msg) {
                this.webrtc.send(msg);
            },
            _holdPads(who) {
                this._padHolds.add(who);
                this._gamepadManager.setPaused(true);
                if (this._touchPadView) this._syncTouchPad();
            },
            _releasePads(who) {
                this._padHolds.delete(who);
                if (this._padHolds.size === 0) this._gamepadManager.setPaused(false);
                if (this._touchPadView) this._syncTouchPad();
            },
            ...fields,
        });
        view._gamepadManager = new GamepadManager((msg) => view._padSend(msg), {
            single: view._playerMode === true,
            onVirtualYield: () => view._onTouchPadYielded(),
        });
        view._gamepadManager.start();
        views.push(view);
        return view;
    }

    /** The view with its on-screen controller plugged in and shown. */
    async function started(fields) {
        const view = makeView(fields);
        view._mountTouchPad();
        await flush();
        // jsdom measures nothing: the layer is given a phone's size.
        view._rootEl.querySelector('.touch-pad').getBoundingClientRect = () => ({
            left: 0,
            top: 0,
            width: 844,
            height: 390,
        });
        view._touchPadView.relayout();
        return view;
    }

    const sent = (type) => send.mock.calls.map((c) => c[0]).filter((m) => m.type === type);
    const pads = () =>
        send.mock.calls.map((c) => c[0]).filter((m) => String(m.type).startsWith('gamepad'));
    const press = (view, button) => {
        view._touchPadState.press(button);
        view._gamepadManager.pokeVirtual();
    };
    const release = (view, button) => {
        view._touchPadState.release(button);
        view._gamepadManager.pokeVirtual();
    };
    const pill = (view) => view._rootEl.querySelector('.touch-pad-mode');
    const padButton = (view, id) =>
        view._rootEl.querySelector(`.touch-pad-btn[data-control="${id}"]`);
    const dialog = (view) => view._rootEl.querySelector('.pad-kbm-overlay');

    beforeEach(() => {
        send = vi.fn();
        views = [];
        media = { '(any-pointer: coarse)': true, '(any-pointer: fine)': false };
        Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
        Object.defineProperty(navigator, 'getGamepads', {
            value: () => [],
            configurable: true,
            writable: true,
        });
        Object.defineProperty(navigator, 'userAgent', {
            value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile',
            configurable: true,
        });
        window.matchMedia = (q) => ({
            get matches() {
                return media[q] === true;
            },
            addEventListener: () => {},
            removeEventListener: () => {},
        });
        vi.stubGlobal('requestAnimationFrame', () => 1);
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        localStorage.clear();
    });
    afterEach(() => {
        for (const view of views) {
            view._gamepadManager.stop();
            view._destroyPadKbm();
        }
        document.body.innerHTML = '';
        delete window.matchMedia;
        delete navigator.maxTouchPoints;
        delete navigator.userAgent;
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('leaves a pad a pad for a viewer who chose nothing', async () => {
        const view = await started();
        press(view, PAD.A);
        expect(sent('gamepadconnect').length).toBe(1);
        expect(sent('gamepad').some((m) => m.buttons === 0x1000)).toBe(true);
        expect(sent('keydown')).toEqual([]);
    });

    it('sends a button as its key, the way the keyboard sends one, and no pad at all', async () => {
        const view = await started({ _padKbmPrefs: kbm() });
        press(view, PAD.A);
        expect(pads()).toEqual([]);
        expect(sent('keydown')).toEqual([
            {
                type: 'keydown',
                keyCode: 0x20,
                code: 'Space',
                key: ' ',
                char: null,
                nonUs: false,
                dead: false,
                hold: true,
                gaming: true,
                altGraph: false,
                ctrlKey: false,
                shiftKey: false,
                altKey: false,
                metaKey: false,
            },
        ]);
        // In the set the heartbeat beats: a stall cannot strand it.
        expect(view._heldPhysKeys.has('Space')).toBe(true);
        release(view, PAD.A);
        expect(sent('keyup').map((m) => m.code)).toEqual(['Space']);
        expect(view._heldPhysKeys.size).toBe(0);
    });

    it('carries the modifier a stick click holds on the keys pressed under it', async () => {
        const view = await started({ _padKbmPrefs: kbm() });
        press(view, PAD.L3);
        press(view, PAD.A);
        release(view, PAD.L3);
        const downs = sent('keydown');
        expect(downs.map((m) => [m.code, m.shiftKey])).toEqual([
            ['ShiftLeft', true],
            ['Space', true],
        ]);
        expect(sent('keyup').map((m) => [m.code, m.shiftKey])).toEqual([['ShiftLeft', false]]);
    });

    it('plays a trigger as a mouse button held for good, whatever the mouse mode', async () => {
        const view = await started({ _padKbmPrefs: kbm() });
        press(view, PAD.RT);
        expect(sent('mousedown')).toEqual([{ type: 'mousedown', button: 1, hold: true }]);
        release(view, PAD.RT);
        expect(sent('mouseup')).toEqual([{ type: 'mouseup', button: 1, hold: false }]);
    });

    it('turns the wheel by whole notches', async () => {
        const view = await started({ _padKbmPrefs: kbm() });
        press(view, PAD.LB);
        press(view, PAD.RB);
        expect(sent('mousewheel').map((m) => m.delta)).toEqual([120, -120]);
    });

    it('writes on each button the key it presses, and the pad’s names when it is a pad again', async () => {
        const view = await started({ _padKbmPrefs: kbm() });
        expect(padButton(view, 'a').textContent).toBe('padKbm.short.space');
        expect(padButton(view, 'x').textContent).toBe('E');
        expect(padButton(view, 'rt').textContent).toBe('padKbm.short.clickLeft');
        expect(view._rootEl.querySelector('.touch-pad-dpad-arm.arm-up').textContent).toBe('1');
        view._setPadKbm(padKbmSettings());
        expect(padButton(view, 'a').textContent).toBe('A');
        expect(padButton(view, 'rt').textContent).toBe('RT');
        expect(view._rootEl.querySelector('.touch-pad-dpad-arm.arm-up').textContent).toBe('▲');
    });

    it('lets go of the keys and hands the game its controller back when the viewer says so', async () => {
        const view = await started({ _padKbmPrefs: kbm() });
        press(view, PAD.A);
        send.mockClear();
        view._setPadKbm(padKbmSettings());
        const types = send.mock.calls.map((c) => c[0].type);
        expect(types.slice(0, 2)).toEqual(['keyup', 'gamepadconnect']);
        expect(sent('gamepad').at(-1).buttons).toBe(0x1000);
    });

    describe('its button on the controller', () => {
        it('is there with the controller on screen, and says which of the two it is', async () => {
            const view = await started();
            expect(pill(view).hidden).toBe(false);
            expect(pill(view).textContent).toBe('padKbm.pillPad');
            expect(pill(view).classList.contains('is-kbm')).toBe(false);
            view._setPadKbm(kbm());
            expect(pill(view).textContent).toBe('padKbm.pillKbm');
            expect(pill(view).classList.contains('is-kbm')).toBe(true);
        });

        it('goes away with the controller', async () => {
            const view = await started();
            view._toggleTouchPad();
            expect(pill(view).hidden).toBe(true);
            view._toggleTouchPad();
            expect(pill(view).hidden).toBe(false);
        });

        it('opens the dialog, and the pads press nothing in the game while it is up', async () => {
            const view = await started({ _padKbmPrefs: kbm() });
            pill(view).click();
            expect(dialog(view)).not.toBeNull();
            expect(view._padHolds.has('pad-kbm')).toBe(true);
            send.mockClear();
            press(view, PAD.A);
            expect(send).not.toHaveBeenCalled();
            release(view, PAD.A);
            dialog(view).querySelector('.pad-kbm-done').click();
            expect(dialog(view)).toBeNull();
            expect(view._padHolds.size).toBe(0);
            press(view, PAD.A);
            expect(sent('keydown').map((m) => m.code)).toEqual(['Space']);
        });

        it('takes the dialog’s choice at once, and keeps it for the next stream', async () => {
            const view = await started();
            localStorage.setItem(STREAMING_SETTINGS_KEY, JSON.stringify({ video_codec: 'h264' }));
            pill(view).click();
            dialog(view).querySelector('.pad-kbm-mode[data-mode="kbm"]').click();
            expect(pill(view).classList.contains('is-kbm')).toBe(true);
            expect(padButton(view, 'a').textContent).toBe('padKbm.short.space');
            const stored = JSON.parse(localStorage.getItem(STREAMING_SETTINGS_KEY));
            expect(stored.pad_kbm_mode).toBe('kbm');
            expect(stored.pad_kbm_map).toEqual({ ...PAD_KBM_DEFAULT_MAP });
            // The stream's other settings are not this dialog's to lose.
            expect(stored.video_codec).toBe('h264');
        });
    });

    it('keeps a guest’s pad a pad, whatever is stored on their device', async () => {
        const view = await started({
            _playerMode: true,
            _gamepadAllowed: true,
            _padKbmPrefs: kbm(),
        });
        expect(pill(view)).toBeNull();
        press(view, PAD.A);
        expect(sent('keydown')).toEqual([]);
        expect(sent('gamepad').some((m) => m.buttons === 0x1000)).toBe(true);
        view._setPadKbm(kbm());
        view._openPadKbmDialog();
        expect(dialog(view)).toBeNull();
        expect(view._padKbmLabels()).toBeNull();
    });

    it('hands the viewer’s choice to the view that replaces this one', async () => {
        const old = await started();
        old._setPadKbm(kbm({ pad_kbm_sens: 2 }), { save: false });
        const next = await started();
        next._adoptPadKbm(old._padKbmSnapshot());
        press(next, PAD.A);
        expect(next._padKbmSettings().sens).toBe(2);
        expect(sent('keydown').map((m) => m.code)).toEqual(['Space']);
        // Carried, not chosen again: nothing new to store.
        expect(localStorage.getItem(STREAMING_SETTINGS_KEY)).toBeNull();
    });

    it('survives a store it cannot write to', () => {
        const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('private browsing');
        });
        expect(() => savePadKbmSettings(kbm())).not.toThrow();
        setItem.mockRestore();
    });

    it('takes its button and its dialog away with the view', async () => {
        const view = await started({ _padKbmPrefs: kbm() });
        pill(view).click();
        view._destroyPadKbm();
        expect(pill(view)).toBeNull();
        expect(dialog(view)).toBeNull();
        expect(view._padKbm).toBeNull();
    });
});
