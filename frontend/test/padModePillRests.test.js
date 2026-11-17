/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * The controller's button steps back.
 *
 * "Mode : tous jeux" sat over the top of the game's picture for as long as
 * the on-screen controller was shown. It now says what the controllers are
 * for a few seconds — each time it comes on screen, and each time it has
 * something new to say — then stays faint: still where a finger looks for it,
 * still one touch from its dialog.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../js/i18n/i18n.js', () => ({
    t: (key) => key,
    getLanguage: () => 'en',
}));

import { StreamViewTouchPad } from '../js/ui/StreamViewTouchPad.js';
import { StreamViewPadKbm, PAD_KBM_PILL_REST_MS } from '../js/ui/StreamViewPadKbm.js';
import { padKbmSettings } from '../js/stream/PadKeyMouse.js';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '..', 'css', 's3xycast.css'), 'utf8');

describe('the controller’s button', () => {
    let view;
    let shown;

    function makeView() {
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
            _touchPadPrefs: { mode: 'always', scale: 1, opacity: 0.8, style: 'xbox' },
            _padKbmPrefs: padKbmSettings({ pad_kbm_mode: 'kbm' }),
            _padKbmBtn: null,
            _padGame: null,
            _touchPadView: {
                setLayout: vi.fn(),
                setLook: vi.fn(),
                isVisible: () => shown,
                toggleRect: () => ({ x: 400, y: 10, w: 44, h: 44 }),
            },
            _holdPads: vi.fn(),
            _releasePads: vi.fn(),
        });
        return made;
    }
    const button = () => view._padKbmBtn;
    const resting = () => button().classList.contains('is-resting');

    beforeEach(() => {
        vi.useFakeTimers();
        window.localStorage.clear();
        shown = false;
        view = makeView();
        view._mountPadKbmButton();
    });
    afterEach(() => {
        view._destroyPadKbm();
        view._rootEl.remove();
        vi.useRealTimers();
    });

    it('is plain when the controller comes on screen', () => {
        expect(button().hidden).toBe(true);
        shown = true;
        view._placePadKbmButton();
        expect(button().hidden).toBe(false);
        expect(resting()).toBe(false);
    });

    it('steps back after a few seconds, and stays there', () => {
        shown = true;
        view._placePadKbmButton();
        vi.advanceTimersByTime(PAD_KBM_PILL_REST_MS - 1);
        expect(resting()).toBe(false);
        vi.advanceTimersByTime(1);
        expect(resting()).toBe(true);
        // Placed again and again as the picture is laid out: it does not come
        // back for that.
        view._placePadKbmButton();
        view._placePadKbmButton();
        expect(resting()).toBe(true);
        vi.advanceTimersByTime(60000);
        expect(resting()).toBe(true);
    });

    it('long enough to be read, short enough to be out of the way', () => {
        expect(PAD_KBM_PILL_REST_MS).toBeGreaterThanOrEqual(3000);
        expect(PAD_KBM_PILL_REST_MS).toBeLessThanOrEqual(6000);
    });

    it('is plain again each time it comes back (a dialog closed over it)', () => {
        shown = true;
        view._placePadKbmButton();
        vi.advanceTimersByTime(PAD_KBM_PILL_REST_MS);
        expect(resting()).toBe(true);
        // The controller goes away under a dialog, and its button with it.
        shown = false;
        view._placePadKbmButton();
        expect(button().hidden).toBe(true);
        shown = true;
        view._placePadKbmButton();
        expect(resting()).toBe(false);
        vi.advanceTimersByTime(PAD_KBM_PILL_REST_MS);
        expect(resting()).toBe(true);
    });

    it('is plain again when it has something new to say', () => {
        shown = true;
        view._placePadKbmButton();
        vi.advanceTimersByTime(PAD_KBM_PILL_REST_MS);
        expect(resting()).toBe(true);
        view._setPadKbm(padKbmSettings({ pad_kbm_mode: 'pad' }), { save: false });
        expect(button().textContent).toBe('padKbm.pillPad');
        expect(resting()).toBe(false);
        vi.advanceTimersByTime(PAD_KBM_PILL_REST_MS);
        expect(resting()).toBe(true);
        // Told the same thing again: nothing new, it stays back.
        view._syncPadKbmButton();
        expect(resting()).toBe(true);
    });

    it('does not count its seconds while it is off screen', () => {
        shown = true;
        view._placePadKbmButton();
        shown = false;
        view._placePadKbmButton();
        vi.advanceTimersByTime(PAD_KBM_PILL_REST_MS * 2);
        expect(resting()).toBe(false);
        // A new mode set while it is hidden waits for it to be seen.
        view._setPadKbm(padKbmSettings({ pad_kbm_mode: 'pad' }), { save: false });
        vi.advanceTimersByTime(PAD_KBM_PILL_REST_MS * 2);
        expect(resting()).toBe(false);
        shown = true;
        view._placePadKbmButton();
        vi.advanceTimersByTime(PAD_KBM_PILL_REST_MS);
        expect(resting()).toBe(true);
    });

    it('still opens its dialog with one touch while it rests', () => {
        shown = true;
        view._placePadKbmButton();
        vi.advanceTimersByTime(PAD_KBM_PILL_REST_MS);
        expect(resting()).toBe(true);
        button().click();
        expect(document.querySelector('.pad-kbm-overlay')).not.toBeNull();
        view._padKbmDialog.close();
    });

    it('leaves no timer behind when the stream ends', () => {
        shown = true;
        view._placePadKbmButton();
        const btn = button();
        view._destroyPadKbm();
        vi.advanceTimersByTime(PAD_KBM_PILL_REST_MS * 2);
        expect(btn.classList.contains('is-resting')).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
        // The teardown of afterEach runs on a view already taken away.
        view._mountPadKbmButton();
    });

    it('takes the controller’s opacity as a property the style sheet reads', () => {
        shown = true;
        view._placePadKbmButton();
        expect(button().style.getPropertyValue('--touch-pad-mode-opacity')).toBe('0.8');
        // Not an inline opacity: it would win over the resting state's.
        expect(button().style.opacity).toBe('');
    });
});

describe('the button’s style', () => {
    const rule = (selector) => {
        const at = css.indexOf(selector + ' {');
        return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
    };

    it('reads the controller’s opacity, and fades between its two states', () => {
        const plain = rule('.touch-pad-mode');
        expect(plain).toContain('opacity: var(--touch-pad-mode-opacity, 1);');
        expect(plain).toMatch(/transition:\s*opacity 0\.6s ease/);
    });

    it('is faint while it rests, not gone: it is still there to be touched', () => {
        const at = css.indexOf('.touch-pad-mode.is-resting,');
        expect(at).toBeGreaterThan(0);
        const resting = css.slice(at, css.indexOf('}', at));
        expect(resting).toContain('.touch-pad-mode.is-resting.is-kbm');
        expect(resting).toContain('opacity: calc(var(--touch-pad-mode-opacity, 1) * 0.3);');
        expect(resting).toContain('background: transparent;');
        expect(resting).not.toMatch(/display:\s*none|visibility:\s*hidden|pointer-events:\s*none/);
    });

    it('does not move for a viewer who asked for less motion', () => {
        expect(css).toMatch(
            /@media \(prefers-reduced-motion: reduce\) \{\s*\.touch-pad-mode \{\s*transition: none;/,
        );
    });
});
