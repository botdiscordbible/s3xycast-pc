/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * The pointer of a touch screen that is neither a phone nor a tablet, as the
 * stream draws it (StreamView + stream/FingerPointer.js). The owner's Tesla
 * (16/11/2026): the stream played, his fingers moved and clicked the host's
 * pointer, and nothing showed where it was — its browser reads as a computer,
 * and the page left a computer's pointer to a mouse that a car does not have.
 *
 * jsdom reads as that very class of browser here: a desktop's user agent, and
 * a touch screen (it defines `ontouchstart`). Over a view made of StreamView's
 * own methods and of the few things they read; what is looked at is the
 * pointer on the page and what would reach the host.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StreamView } from '../js/ui/StreamView.js';
import { FingerPointer } from '../js/stream/FingerPointer.js';
import { TouchScreenPointer } from '../js/stream/TouchScreenPointer.js';

const here = dirname(fileURLToPath(import.meta.url));
const source = (...path) => readFileSync(join(here, '..', 'js', ...path), 'utf8');

/** The owner's desktop, 3440 wide, as his car shows it: across 959 points. */
const FRAME = { w: 3440, h: 1440 };
const RECT = { left: 0, top: 100, width: 959, height: 401 };

let now = 0;

/**
 * A stream on a browser of that class, the host's pointer handed over.
 * @param {{start?: boolean, always?: boolean, never?: boolean, touchScreen?: boolean}} [how]
 */
function view({ start = false, always = false, never = false, touchScreen = false } = {}) {
    const streamEl = document.createElement('div');
    const inputEl = document.createElement('div');
    const cursor = document.createElement('img');
    cursor.hidden = true;
    streamEl.append(inputEl, cursor);
    document.body.appendChild(streamEl);
    const sent = [];
    const v = Object.create(StreamView.prototype);
    Object.assign(v, {
        streamEl,
        inputEl,
        sent,
        pointerLocked: false,
        _quitting: false,
        _zoom: 1,
        _clientCursorEl: cursor,
        _clientCursorPos: null,
        _clientCursorImg: null,
        _clientCursorSeedTimer: null,
        _hostCursorAt: null,
        _hostDrawsCursor: true,
        _hostCursorVisible: true,
        _hostCursorPng: null,
        _hostCursorHotspot: [0, 0],
        _hostCursorScale: 1,
        _sentCursorComposite: false,
        _sentCursorPx: 0,
        _touchScreenPointer: new TouchScreenPointer(touchScreen),
        _fingerPointer: new FingerPointer({ always, never, start }),
        _pictureWidth: () => FRAME.w,
        _pictureHeight: () => FRAME.h,
        _mediaRect: () => RECT,
        _sendToHost: (m) => sent.push(m),
        webrtc: { send: (m) => sent.push(m) },
    });
    v._bindFingerPointer();
    return v;
}

const touch = (v, type, fingers) =>
    v.inputEl.dispatchEvent(
        Object.assign(new Event(type, { bubbles: true }), { touches: new Array(fingers).fill({}) }),
    );
const mouse = (v, type, x, y) =>
    v.inputEl.dispatchEvent(
        Object.assign(new Event(type, { bubbles: true }), {
            pointerType: 'mouse',
            clientX: x,
            clientY: y,
        }),
    );
/** Where the drawing's hotspot is on the page. */
const drawnAt = (v) => {
    const m = /translate\(([-0-9.]+)px, ([-0-9.]+)px\)/.exec(v._clientCursorEl.style.transform);
    return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
};
const hostSays = (v, x, y) => v._clientCursorHostSaid({ x, y, visible: true });

describe('the pointer of a touch screen that reads as a computer', () => {
    beforeEach(() => {
        now = 10000;
        vi.spyOn(performance, 'now').mockImplementation(() => now);
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        document.body.innerHTML = '';
    });

    it('is left to the mouse while nothing was touched, as on any computer', () => {
        const v = view();
        hostSays(v, 1720, 720);
        v._placeClientCursor();
        expect(v._clientCursorActive()).toBe(false);
        expect(v._clientCursorEl.hidden).toBe(true);
        expect(v._clientCursorSteers()).toBe(false);
    });

    it('is drawn from the first finger on the stream, where the host said its pointer is', () => {
        const v = view();
        hostSays(v, 1720, 720);
        touch(v, 'touchstart', 1);
        expect(v._clientCursorActive()).toBe(true);
        expect(v._clientCursorEl.hidden).toBe(false);
        // The middle of the frame is the middle of the picture on the page.
        expect(drawnAt(v)).toEqual({ x: 479.5, y: 300.5 });
    });

    it('is drawn from the start when a finger started the stream', () => {
        const v = view({ start: true });
        expect(v._clientCursorActive()).toBe(true);
        expect(v._clientCursorEl.hidden).toBe(true); // no word of the host yet
        hostSays(v, 860, 360);
        expect(v._clientCursorEl.hidden).toBe(false);
        expect(drawnAt(v)).toEqual({ x: 239.75, y: 200.25 });
    });

    it('is then steered by the finger with exact positions, not with deltas', () => {
        const v = view();
        hostSays(v, 1720, 720);
        touch(v, 'touchstart', 1);
        expect(v._clientCursorSteers()).toBe(true);
        v._clientCursorSteer(20, -10, 1);
        expect(v.sent).toEqual([
            { type: 'mousemove', x: 1740, y: 710, referenceWidth: 3440, referenceHeight: 1440 },
        ]);
        const at = drawnAt(v);
        expect(at.x).toBeCloseTo(RECT.left + (1740 * RECT.width) / FRAME.w, 3);
        expect(at.y).toBeCloseTo(RECT.top + (710 * RECT.height) / FRAME.h, 3);
    });

    it('starts from the middle of the picture against a host that never says where', () => {
        const v = view();
        touch(v, 'touchstart', 1);
        expect(v._clientCursorEl.hidden).toBe(true);
        vi.advanceTimersByTime(1100);
        expect(v._clientCursorEl.hidden).toBe(false);
        expect(drawnAt(v)).toEqual({ x: 479.5, y: 300.5 });
    });

    it('is sized for a screen looked at from an arm’s length', () => {
        const v = view({ start: true });
        hostSays(v, 1720, 720);
        // No bitmap from the host yet: the ordinary arrow, 22 points of ink.
        expect(parseFloat(v._clientCursorEl.style.height)).toBeCloseTo(22, 3);
        expect(parseFloat(v._clientCursorEl.style.width)).toBeCloseTo((12 * 22) / 19, 3);
        // The host's own arrow, 12×19 of ink in a 32-pixel bitmap: at its
        // real size it would be 5.7 points high on this screen.
        v._clientCursorImg = { png: 'AAAA', w: 32, h: 32, inkW: 12, inkH: 19 };
        v._placeClientCursor();
        expect(parseFloat(v._clientCursorEl.style.height)).toBeCloseTo((32 * 22) / 19, 3);
    });

    it('is stretched no further than a bitmap still looks like a pointer', () => {
        const v = view({ start: true });
        // A desktop so wide that the arrow would need more than 5 times its
        // real size (the picture's scale has a floor of a quarter).
        v._mediaRect = () => ({ left: 0, top: 0, width: 344, height: 144 });
        v._clientCursorImg = { png: 'AAAA', w: 32, h: 32, inkW: 6, inkH: 6 };
        expect(v._clientCursorCssScale()).toBeCloseTo(0.25 * 5, 6);
    });

    it('is never drawn smaller than it really is', () => {
        const v = view({ start: true });
        // A host desktop shown larger than life: nothing to stretch.
        v._mediaRect = () => ({ left: 0, top: 0, width: FRAME.w * 2, height: FRAME.h * 2 });
        v._clientCursorImg = { png: 'AAAA', w: 32, h: 32, inkW: 12, inkH: 19 };
        expect(v._clientCursorCssScale()).toBe(2);
    });

    it('goes back to a mouse that really moves, and the drawing goes', () => {
        const v = view();
        hostSays(v, 1720, 720);
        touch(v, 'touchstart', 1);
        touch(v, 'touchend', 0);
        now += 2000;
        mouse(v, 'pointermove', 300, 300);
        expect(v._clientCursorEl.hidden).toBe(false);
        mouse(v, 'pointermove', 301, 300); // a tremble
        expect(v._clientCursorEl.hidden).toBe(false);
        mouse(v, 'pointermove', 320, 305);
        expect(v._clientCursorActive()).toBe(false);
        expect(v._clientCursorEl.hidden).toBe(true);
        expect(v._clientCursorSteers()).toBe(false);
    });

    it('goes back at once to a mouse that presses', () => {
        const v = view({ start: true });
        hostSays(v, 1720, 720);
        mouse(v, 'pointerdown', 300, 300);
        expect(v._clientCursorEl.hidden).toBe(true);
    });

    it('is not lost to the mouse events that follow a finger', () => {
        const v = view();
        hostSays(v, 1720, 720);
        touch(v, 'touchstart', 1);
        mouse(v, 'pointermove', 300, 300);
        mouse(v, 'pointermove', 400, 400);
        touch(v, 'touchend', 0);
        now += 100;
        mouse(v, 'pointermove', 500, 500);
        mouse(v, 'pointerdown', 500, 500);
        expect(v._clientCursorActive()).toBe(true);
        expect(v._clientCursorEl.hidden).toBe(false);
    });

    it('stays the finger’s while one of two fingers is still down', () => {
        const v = view();
        touch(v, 'touchstart', 1);
        touch(v, 'touchstart', 2);
        touch(v, 'touchend', 1);
        now += 5000;
        mouse(v, 'pointermove', 300, 300);
        mouse(v, 'pointermove', 400, 400);
        expect(v._clientCursorActive()).toBe(true);
    });

    it('comes back with the finger, where the mouse left the host’s pointer', () => {
        const v = view({ start: true });
        hostSays(v, 1720, 720);
        mouse(v, 'pointerdown', 300, 300);
        // The mouse moves the host's pointer; the host says where, and
        // nothing is drawn for it.
        hostSays(v, 344, 144);
        expect(v._clientCursorEl.hidden).toBe(true);
        now += 2000;
        touch(v, 'touchstart', 1);
        expect(v._clientCursorEl.hidden).toBe(false);
        expect(drawnAt(v)).toEqual({ x: 95.9, y: 140.1 });
    });

    it('is not moved by a pen or by another finger’s pointer events', () => {
        const v = view({ start: true });
        hostSays(v, 1720, 720);
        for (const pointerType of ['touch', 'pen']) {
            v.inputEl.dispatchEvent(
                Object.assign(new Event('pointerdown', { bubbles: true }), { pointerType }),
            );
        }
        expect(v._clientCursorEl.hidden).toBe(false);
    });

    it('stays hidden in Touch Screen Mode, where the finger is the pointer', () => {
        const v = view({ touchScreen: true });
        hostSays(v, 1720, 720);
        touch(v, 'touchstart', 1);
        expect(v._clientCursorActive()).toBe(true);
        expect(v._clientCursorEl.hidden).toBe(true);
    });

    it('is the host’s to draw under a pointer lock, as everywhere', () => {
        const v = view({ start: true });
        hostSays(v, 1720, 720);
        v.pointerLocked = true;
        v._placeClientCursor();
        expect(v._clientCursorActive()).toBe(false);
        expect(v._clientCursorEl.hidden).toBe(true);
        v._sendCursorMode();
        expect(v.sent).toEqual([{ type: 'cursormode', composite: true, cursorPx: 0 }]);
    });

    it('tells the host nothing new when it changes hands: the page draws either way', () => {
        const v = view();
        touch(v, 'touchstart', 1);
        touch(v, 'touchend', 0);
        now += 2000;
        mouse(v, 'pointerdown', 10, 10);
        expect(v.sent.filter((m) => m.type === 'cursormode')).toEqual([]);
    });

    it('is no longer watched once the stream’s events are unbound', () => {
        const v = view();
        v._unbindFingerPointer();
        touch(v, 'touchstart', 1);
        expect(v._clientCursorActive()).toBe(false);
        // Twice is as good as once.
        expect(() => v._unbindFingerPointer()).not.toThrow();
        // And bound again, it is watched again — once.
        v._bindFingerPointer();
        v._bindFingerPointer();
        touch(v, 'touchstart', 1);
        expect(v._clientCursorActive()).toBe(true);
    });
});

describe('a phone, a tablet and a television keep the pointer they had', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('a phone or a tablet draws it whatever a mouse does', () => {
        const v = view({ always: true });
        hostSays(v, 1720, 720);
        expect(v._clientCursorEl.hidden).toBe(false);
        mouse(v, 'pointerdown', 10, 10);
        mouse(v, 'pointermove', 10, 10);
        mouse(v, 'pointermove', 200, 200);
        expect(v._clientCursorActive()).toBe(true);
        expect(v._clientCursorEl.hidden).toBe(false);
    });

    it('a television that does not read as a phone draws none, touched or not', () => {
        const v = view({ never: true, start: true });
        hostSays(v, 1720, 720);
        touch(v, 'touchstart', 1);
        expect(v._clientCursorActive()).toBe(false);
        expect(v._clientCursorEl.hidden).toBe(true);
    });
});

describe('where StreamView was touched for the finger’s pointer', () => {
    // Each of these is a line or two in a very long upstream file, the kind a
    // merge of a new upstream release drops without a conflict — and the car
    // would be back to a stream with no pointer.
    const text = source('ui', 'StreamView.js');
    const method = (signature) => {
        const from = text.slice(text.indexOf(`\n    ${signature} {`));
        return from.slice(0, from.indexOf('\n    }\n'));
    };

    it('decides whose pointer it is as the view is made', () => {
        expect(text).toContain(
            "import { FingerPointer, fingerStarts } from '../stream/FingerPointer.js';",
        );
        const made = text.slice(text.indexOf('this._fingerPointer = new FingerPointer({'));
        const args = made.slice(0, made.indexOf('});'));
        expect(args).toContain('always: IS_MOBILE_OR_TABLET,');
        expect(args).toContain('never: IS_TV,');
        expect(args).toContain('start: fingerStarts({ touchOnly: touchIsOnlyPointer() }),');
    });

    it('draws the pointer wherever a finger holds it, not on phones and tablets alone', () => {
        expect(method('_clientCursorActive()')).toContain(
            'return MOBILE_CURSOR_CLIENT_DRAWN && this._fingerPointer.on() && !this.pointerLocked;',
        );
    });

    it('watches the fingers and the mouse with the stream’s other events', () => {
        const bind = method('bindEvents()');
        expect(bind).toContain('this._bindFingerPointer();');
        const unbind = method('unbindEvents()');
        expect(unbind).toContain('this._unbindFingerPointer();');
    });

    it('keeps the host’s word on its pointer whoever draws it', () => {
        const said = method('_clientCursorHostSaid(msg)');
        expect(said.indexOf('this._hostCursorAt = { x, y };')).toBeGreaterThan(-1);
        expect(said.indexOf('this._hostCursorAt = { x, y };')).toBeLessThan(
            said.indexOf('if (!this._clientCursorActive() || this._clientCursorPos) return;'),
        );
    });

    it('does not draw a second pointer under a computer’s mouse in Touch Screen Mode', () => {
        const from = text.slice(text.indexOf('this._onTouchScreenPointerMove = (e) => {'));
        const handler = from.slice(0, from.indexOf('\n        };'));
        expect(handler.indexOf('if (!this._fingerPointer.always()) return;')).toBeGreaterThan(-1);
        expect(handler.indexOf('if (!this._fingerPointer.always()) return;')).toBeLessThan(
            handler.indexOf('this._clientCursorPlacedAt(fx, fy);'),
        );
    });
});
