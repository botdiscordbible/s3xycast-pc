/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * Where StreamView itself was touched for the controllers played as a keyboard
 * and a mouse. Each of these is one line in a very long upstream file, the
 * kind a merge of a new upstream release drops without a conflict: the mode
 * would still look right and a trigger would let go at every hiccup of the
 * link, or the dialog would type into the game.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StreamView } from '../js/ui/StreamView.js';
import { StreamViewPadKbm } from '../js/ui/StreamViewPadKbm.js';
import { TouchPadState } from '../js/stream/TouchPadState.js';
import { TouchPadView } from '../js/ui/TouchPadView.js';
import { padKbmSettings } from '../js/stream/PadKeyMouse.js';

describe('StreamView and the controllers as a keyboard and a mouse', () => {
    let send;
    let view;

    beforeEach(() => {
        send = vi.fn();
        view = Object.create(StreamView.prototype);
        Object.assign(view, {
            webrtc: { send },
            _heldPhysKeys: new Map(),
            _heldMouseButtons: new Set(),
            _gamingMode: false,
            _gamepadManager: null,
            _mainThreadProbe: null,
            _lastBeatHadState: false,
            _pictureCursor: () => null,
            _playerMode: false,
            _padKbmPrefs: padKbmSettings({ pad_kbm_mode: 'kbm' }),
        });
    });
    afterEach(() => {
        if (view._padKbm) view._padKbm.destroy();
        document.body.innerHTML = '';
    });

    it('has the mixin’s methods', () => {
        for (const name of Object.getOwnPropertyNames(StreamViewPadKbm.prototype)) {
            if (name === 'constructor') continue;
            expect(typeof StreamView.prototype[name], name).toBe('function');
        }
    });

    it('gives GamepadManager the translator to send through, not the channel itself', () => {
        // Built deep inside the stream's start, where no test reaches: the
        // source is read instead. With the channel there, the mode would be set
        // and the game would still get a pad.
        const source = readFileSync(
            join(dirname(fileURLToPath(import.meta.url)), '..', 'js', 'ui', 'StreamView.js'),
            'utf8',
        );
        const built = source.slice(source.indexOf('new GamepadManager('));
        const sender = built.slice(0, built.indexOf('profile:'));
        expect(sender).toContain('this._padSend(msg)');
        expect(sender).not.toContain('this.webrtc.send(msg)');
    });

    it('keeps a mouse button a drag by default, and a hold when told it is one', () => {
        view._sendMouseButton(1, true);
        view._sendMouseButton(1, false);
        view._sendMouseButton(3, true, null, true);
        expect(send.mock.calls.map((c) => c[0])).toEqual([
            { type: 'mousedown', button: 1, hold: false },
            { type: 'mouseup', button: 1, hold: false },
            { type: 'mousedown', button: 3, hold: true },
        ]);
        // Gaming mode holds, as it always did.
        view._gamingMode = true;
        send.mockClear();
        view._sendMouseButton(1, true);
        expect(send.mock.calls[0][0].hold).toBe(true);
    });

    it('beats a trigger’s mouse button as a hold, so a stall of the link does not let go of it', () => {
        view._padSend({
            type: 'gamepad',
            index: 0,
            mask: 1,
            buttons: 0,
            lt: 0,
            rt: 255,
            lx: 0,
            ly: 0,
            rx: 0,
            ry: 0,
        });
        expect(view._heldMouseButtons.has(1)).toBe(true);
        send.mockClear();
        view._sendInputState();
        const beat = send.mock.calls[0][0];
        expect(beat.type).toBe('inputstate');
        expect(beat.buttons).toBe(1);
        expect(beat.buttonsHold).toBe(true);
    });

    it('beats the keys a stick holds, by their place and marked as held', () => {
        view._padSend({
            type: 'gamepad',
            index: 0,
            mask: 1,
            buttons: 0,
            lt: 0,
            rt: 0,
            lx: 0,
            ly: 32767,
            rx: 0,
            ry: 0,
        });
        send.mockClear();
        view._sendInputState();
        const beat = send.mock.calls[0][0];
        expect(beat.keys).toEqual([
            expect.objectContaining({
                keyCode: 0x57,
                code: 'KeyW',
                char: null,
                hold: true,
                gaming: true,
            }),
        ]);
    });

    it('beats a letter as the chord it went down as, or the host would press another key for it', () => {
        view._padSend({
            type: 'gamepad',
            index: 0,
            mask: 1,
            buttons: 0x4000,
            lt: 0,
            rt: 0,
            lx: 0,
            ly: 0,
            rx: 0,
            ry: 0,
        });
        send.mockClear();
        view._sendInputState();
        expect(send.mock.calls[0][0].keys).toEqual([
            expect.objectContaining({
                code: 'KeyE',
                char: 'e',
                chord: true,
                gaming: true,
                hold: true,
            }),
        ]);
    });

    it('forgets the controller’s keys when the stream lets go of every key', () => {
        view._padSend({
            type: 'gamepad',
            index: 0,
            mask: 1,
            buttons: 0x1000,
            lt: 0,
            rt: 0,
            lx: 0,
            ly: 0,
            rx: 0,
            ry: 0,
        });
        expect(view._padKbm.isHolding()).toBe(true);
        send.mockClear();
        view._releaseAllPhysKeys();
        // One release on the wire, the stream's own; the translator adds none.
        expect(send.mock.calls.map((c) => c[0].type)).toEqual(['keyup']);
        expect(view._padKbm.isHolding()).toBe(false);
        expect(view._heldPhysKeys.size).toBe(0);
    });

    it('takes a key typed in the dialog for the page’s, not the game’s', () => {
        document.body.innerHTML = `
            <div class="pad-kbm-overlay"><div class="pad-kbm"><span id="inside"></span></div></div>
            <div id="outside"></div>`;
        expect(StreamView.isLocalKeyboardTarget(document.getElementById('inside'))).toBe(true);
        expect(StreamView.isLocalKeyboardTarget(document.getElementById('outside'))).toBe(false);
    });

    it('carries the choice across a stream replacement', () => {
        const state = {
            zoom: 1,
            panX: 0,
            panY: 0,
            kbdVisible: false,
            statsClosed: false,
            touchPad: null,
            padKbm: padKbmSettings({ pad_kbm_mode: 'kbm', pad_kbm_sens: 3 }),
        };
        const adopt = vi.spyOn(StreamView.prototype, '_adoptPadKbm');
        const next = Object.create(StreamView.prototype);
        Object.assign(next, { _playerMode: false, _padKbmPrefs: null });
        try {
            next.restoreViewState(state);
        } catch {
            // The rest of a view is not there to restore: only the hand-over is looked at.
        }
        expect(adopt).toHaveBeenCalledWith(state.padKbm);
        adopt.mockRestore();
        expect(view._padKbmSnapshot()).toEqual(padKbmSettings({ pad_kbm_mode: 'kbm' }));
    });
});

describe('the on-screen controller wearing keys', () => {
    let host;
    let view;

    const mount = (labels) => {
        host = document.createElement('div');
        document.body.appendChild(host);
        view = new TouchPadView(host, new TouchPadState(), { labels });
        view.mount();
        host.querySelector('.touch-pad').getBoundingClientRect = () => ({
            left: 0,
            top: 0,
            width: 844,
            height: 390,
        });
        view.setVisible(true);
    };
    const button = (id) => host.querySelector(`.touch-pad-btn[data-control="${id}"]`);
    const arm = (name) => host.querySelector('.touch-pad-dpad-arm.arm-' + name);

    afterEach(() => {
        if (view) view.destroy();
        view = null;
        document.body.innerHTML = '';
    });

    it('writes a word smaller than a letter, and a long one smaller still', () => {
        mount({ a: 'Espace', b: 'C', x: 'Maj', y: 'Échap', up: '1', left: 'Suppr' });
        expect(button('a').textContent).toBe('Espace');
        expect(button('a').classList.contains('is-wordier')).toBe(true);
        expect(button('y').classList.contains('is-wordy')).toBe(true);
        for (const id of ['b', 'x']) {
            expect(button(id).classList.contains('is-wordy'), id).toBe(false);
            expect(button(id).classList.contains('is-wordier'), id).toBe(false);
        }
        expect(arm('up').textContent).toBe('1');
        expect(arm('left').classList.contains('is-wordy')).toBe(true);
        // A control the viewer said nothing of keeps its pad's name.
        expect(button('rt').textContent).toBe('RT');
        expect(arm('down').textContent).toBe('▼');
    });

    it('leaves a button with no key blank', () => {
        mount({ a: '' });
        expect(button('a').textContent).toBe('');
    });

    it('takes new names without moving anything or letting go of a finger', () => {
        mount(null);
        const before = button('a').style.left;
        expect(button('a').textContent).toBe('A');
        view.setLook({ labels: { a: 'Entrée', up: 'Tab' } });
        expect(button('a').textContent).toBe('Entrée');
        expect(button('a').classList.contains('is-wordier')).toBe(true);
        expect(arm('up').textContent).toBe('Tab');
        expect(button('a').style.left).toBe(before);
        view.setLook({ labels: null });
        expect(button('a').textContent).toBe('A');
        expect(button('a').classList.contains('is-wordier')).toBe(false);
        expect(arm('up').textContent).toBe('▲');
    });

    it('keeps the viewer’s names through a change of pad style', () => {
        mount({ a: 'E' });
        view.setLook({ style: 'ps' });
        expect(button('a').textContent).toBe('E');
        expect(button('b').textContent).toBe('○');
    });
});
