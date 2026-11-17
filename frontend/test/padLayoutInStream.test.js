/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * Moving the on-screen joysticks and buttons without leaving the game.
 *
 * The layout editor is upstream's and lives on the settings page: three
 * screens away from a game, which is where a player finds out that a joystick
 * is not where his thumb rests ("faut pouvoir config la position des joystick",
 * a subscriber, 17/11/2026 — it could be configured, he could not find where).
 * The dialog the controller's pill opens in a stream now has a button for it;
 * the editor opens over the game, and what it gives back is on the controller
 * at once and kept for the next stream.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { editors } = vi.hoisted(() => ({ editors: [] }));
vi.mock('../js/ui/TouchPadLayoutEditor.js', () => ({
    TouchPadLayoutEditor: class {
        constructor(container, options) {
            this.container = container;
            this.options = options;
            this.opened = false;
            editors.push(this);
        }
        open() {
            this.opened = true;
        }
        isOpen() {
            return this.opened;
        }
        close() {
            if (!this.opened) return;
            this.opened = false;
            if (this.options.onClosed) this.options.onClosed();
        }
    },
}));
vi.mock('../js/i18n/i18n.js', () => ({
    t: (key) => key,
    getLanguage: () => 'en',
}));

import { PadKeyMouseDialog } from '../js/ui/PadKeyMouseDialog.js';
import { StreamViewTouchPad } from '../js/ui/StreamViewTouchPad.js';
import {
    StreamViewPadKbm,
    STREAMING_SETTINGS_KEY,
    saveTouchPadLook,
} from '../js/ui/StreamViewPadKbm.js';
import { padKbmSettings } from '../js/stream/PadKeyMouse.js';

const here = dirname(fileURLToPath(import.meta.url));
const source = (...path) => readFileSync(join(here, '..', 'js', ...path), 'utf8');
const settings = () => padKbmSettings({ pad_kbm_mode: 'kbm' });
const moved = {
    preset: 'default',
    landscape: { 'stick-left': { x: 0.2, y: 0.55, s: 1 } },
    portrait: {},
};

describe('the controller dialog', () => {
    let dialog;
    afterEach(() => {
        if (dialog) dialog.close();
        dialog = null;
    });

    it('has no such button on the settings page, which has its own', () => {
        dialog = new PadKeyMouseDialog({ settings: settings() });
        dialog.open();
        expect(document.querySelector('.pad-kbm-move-btn')).toBeNull();
    });

    it('offers to move the joysticks and buttons in a stream', () => {
        dialog = new PadKeyMouseDialog({ settings: settings(), onMoveControls: () => {} });
        dialog.open();
        const button = document.querySelector('.pad-kbm-move-btn');
        expect(button).not.toBeNull();
        expect(button.textContent).toBe('padKbm.moveControls');
        // Under the two modes and what they mean, above the keys.
        const before = document.querySelector('.pad-kbm-desc');
        const after = document.querySelector('.pad-kbm-body');
        expect(
            before.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
            button.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    it('goes away first, then hands over', () => {
        const order = [];
        dialog = new PadKeyMouseDialog({
            settings: settings(),
            onClose: () => order.push('closed'),
            onMoveControls: () => order.push('move'),
        });
        dialog.open();
        document.querySelector('.pad-kbm-move-btn').click();
        expect(order).toEqual(['closed', 'move']);
        expect(dialog.isOpen).toBe(false);
        expect(document.querySelector('.pad-kbm-overlay')).toBeNull();
    });
});

describe('moving the controls from a stream', () => {
    let view;
    let pad;

    function makeView(fields = {}) {
        const root = document.createElement('div');
        root.innerHTML = '<div class="stream-canvas-area"></div>';
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
        const made = Object.create(proto);
        Object.assign(made, {
            _rootEl: root,
            _playerMode: false,
            _gamepadAllowed: false,
            _touchPadPrefs: { mode: 'always', scale: 1.1, opacity: 0.8, style: 'ps' },
            _padKbmPrefs: settings(),
            _padKbmBtn: null,
            _touchPadView: pad,
            _holdPads: vi.fn(),
            _releasePads: vi.fn(),
            ...fields,
        });
        return made;
    }

    beforeEach(() => {
        editors.length = 0;
        window.localStorage.clear();
        pad = {
            setLayout: vi.fn(),
            setLook: vi.fn(),
            isVisible: () => true,
            toggleRect: () => null,
        };
        view = makeView();
    });
    afterEach(() => {
        view._destroyPadKbm();
        view._rootEl.remove();
    });

    it('is possible where there is a controller on screen, for its owner', () => {
        expect(view._padLayoutEditable()).toBe(true);
        expect(makeView({ _touchPadView: null })._padLayoutEditable()).toBe(false);
        // A guest's arrangement is the invitation's: there is nowhere to keep one.
        expect(makeView({ _playerMode: true })._padLayoutEditable()).toBe(false);
    });

    it('is offered by the dialog the pill opens', () => {
        view._openPadKbmDialog();
        expect(document.querySelector('.pad-kbm-move-btn')).not.toBeNull();
        view._padKbmDialog.close();
        const guest = makeView({ _touchPadView: null });
        guest._openPadKbmDialog();
        expect(document.querySelector('.pad-kbm-move-btn')).toBeNull();
        guest._destroyPadKbm();
        guest._rootEl.remove();
    });

    it('opens the editor over the game with what the viewer has, the pads held', () => {
        view._openPadKbmDialog();
        document.querySelector('.pad-kbm-move-btn').click();
        expect(editors).toHaveLength(1);
        const editor = editors[0];
        expect(editor.opened).toBe(true);
        expect(editor.container).toBe(document.body);
        expect(editor.options.layout).toEqual({ preset: 'default', landscape: {}, portrait: {} });
        expect(editor.options.scale).toBe(1.1);
        expect(editor.options.opacity).toBe(0.8);
        expect(editor.options.style).toBe('ps');
        // As its pill: the controller in full view, Done one tap away.
        expect(editor.options.startFolded).toBe(true);
        // With the names the game shows: keys, in the mode that plays as a keyboard.
        expect(editor.options.labels).toEqual(view._padKbmLabels());
        expect(editor.options.labels.a).toBeTruthy();
        expect(view._holdPads).toHaveBeenCalledWith('pad-layout');
        // One editor: a second press while it is up opens nothing more.
        view._openPadLayoutEditor();
        expect(editors).toHaveLength(1);
    });

    it('puts what the editor gives back on the controller at once, and keeps it', () => {
        window.localStorage.setItem(
            STREAMING_SETTINGS_KEY,
            JSON.stringify({ bitrate: 20000, touch_pad_sticks: 'fixed' }),
        );
        view._openPadLayoutEditor();
        editors[0].options.onChange(moved, { scale: 1.2, opacity: 0.6, style: 'xbox' });
        expect(pad.setLayout).toHaveBeenCalledWith(moved);
        expect(pad.setLook).toHaveBeenCalledWith({ scale: 1.2, opacity: 0.6, style: 'xbox' });
        expect(view._touchPadPrefs).toMatchObject({
            mode: 'always',
            layout: moved,
            scale: 1.2,
            opacity: 0.6,
            style: 'xbox',
        });
        const stored = JSON.parse(window.localStorage.getItem(STREAMING_SETTINGS_KEY));
        expect(stored).toEqual({
            bitrate: 20000,
            touch_pad_sticks: 'fixed',
            touch_pad_layout: moved,
            touch_pad_scale: 1.2,
            touch_pad_opacity: 0.6,
            touch_pad_style: 'xbox',
        });
    });

    it('gives the pads back when the editor closes, saved or not', () => {
        view._openPadLayoutEditor();
        editors[0].close();
        expect(view._releasePads).toHaveBeenCalledWith('pad-layout');
        expect(view._padLayoutEditor).toBeNull();
        // And it can be opened again.
        view._openPadLayoutEditor();
        expect(editors).toHaveLength(2);
    });

    it('cleans what it is handed before using it', () => {
        view._setPadLook({
            layout: { preset: 'sideways', landscape: { nonsense: { x: 2, y: 2 } } },
            scale: 1,
            opacity: 1,
            style: 'xbox',
        });
        expect(pad.setLayout).toHaveBeenCalledWith({
            preset: 'default',
            landscape: {},
            portrait: {},
        });
    });

    it('follows the view that replaces this one, without saving twice', () => {
        expect(view._padLookSnapshot()).toBeNull();
        view._setPadLook({ layout: moved, scale: 1.2, opacity: 0.6, style: 'xbox' });
        const carried = view._padLookSnapshot();
        expect(carried).toEqual({ layout: moved, scale: 1.2, opacity: 0.6, style: 'xbox' });

        window.localStorage.clear();
        const nextPad = {
            setLayout: vi.fn(),
            setLook: vi.fn(),
            isVisible: () => true,
            toggleRect: () => null,
        };
        const next = makeView({ _touchPadView: nextPad, _touchPadPrefs: { mode: 'always' } });
        next._adoptPadLook(carried);
        expect(nextPad.setLayout).toHaveBeenCalledWith(moved);
        expect(next._touchPadPrefs.layout).toEqual(moved);
        expect(window.localStorage.getItem(STREAMING_SETTINGS_KEY)).toBeNull();
        next._adoptPadLook(null);
        expect(nextPad.setLayout).toHaveBeenCalledTimes(1);
        next._rootEl.remove();
    });

    it('takes the editor away with the stream', () => {
        view._openPadLayoutEditor();
        view._destroyPadKbm();
        expect(editors[0].opened).toBe(false);
        expect(view._padLayoutEditor).toBeNull();
    });

    it('survives a browser with no store', () => {
        const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('denied');
        });
        expect(() =>
            saveTouchPadLook({ layout: moved, scale: 1, opacity: 1, style: 'xbox' }),
        ).not.toThrow();
        set.mockRestore();
    });
});

describe('where StreamView was touched for it', () => {
    const streamView = source('ui', 'StreamView.js');

    it('carries the arrangement to the view that replaces this one', () => {
        expect(streamView).toMatch(/padLook: this\._padLookSnapshot\(\),/);
        expect(streamView).toMatch(
            /this\._adoptPadKbm\(state\.padKbm\);\s*this\._adoptPadLook\(state\.padLook\);/,
        );
    });

    it('has the words for the button in every language', () => {
        for (const lang of ['en', 'fr', 'tr', 'zh']) {
            const words = JSON.parse(
                readFileSync(join(here, '..', 'locales', `${lang}.json`), 'utf8'),
            ).padKbm;
            expect(words.moveControls, lang).toBeTruthy();
        }
        const fr = JSON.parse(readFileSync(join(here, '..', 'locales', 'fr.json'), 'utf8'));
        expect(fr.padKbm.moveControls).toBe('Déplacer les joysticks et les boutons…');
    });
});
