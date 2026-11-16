/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * Whose pointer it is where the browser is neither a phone nor a tablet
 * (stream/FingerPointer.js): a finger's from the moment one touches the
 * stream, a mouse's again once one really moves. The owner's Tesla had no
 * pointer at all (16/11/2026): its browser reads as a computer, and a computer
 * was left to its mouse.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    AFTER_TOUCH_MS,
    FingerPointer,
    MOUSE_TRAVEL_PX,
    fingerStarts,
    forgetPointerKind,
    lastPointerKind,
    notePointerKind,
    watchPointerKind,
} from '../js/stream/FingerPointer.js';
import { touchIsOnlyPointer } from '../js/util/BrowserDetect.js';

/** The Tesla's browser, as its owner's car sent it: nothing says "Tesla". */
const TESLA_UA =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

describe('the device of the last press', () => {
    beforeEach(() => forgetPointerKind());

    it('is unknown before any press', () => {
        expect(lastPointerKind()).toBe('');
    });

    it('is a finger or a mouse, whichever pressed last', () => {
        notePointerKind('mouse');
        expect(lastPointerKind()).toBe('mouse');
        notePointerKind('touch');
        expect(lastPointerKind()).toBe('touch');
    });

    it('is not changed by a pen, nor by a browser that does not say', () => {
        notePointerKind('touch');
        notePointerKind('pen');
        notePointerKind('');
        notePointerKind(undefined);
        expect(lastPointerKind()).toBe('touch');
    });

    it('is read from the presses on a window, pointer events and touches alike', () => {
        const win = new EventTarget();
        const stop = watchPointerKind(win);
        win.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerType: 'mouse' }));
        expect(lastPointerKind()).toBe('mouse');
        win.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerType: 'touch' }));
        expect(lastPointerKind()).toBe('touch');
        // A browser whose pointer events call a finger a mouse: the touch
        // event that follows has the last word.
        win.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerType: 'mouse' }));
        win.dispatchEvent(new Event('touchstart'));
        expect(lastPointerKind()).toBe('touch');
        stop();
        win.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerType: 'mouse' }));
        expect(lastPointerKind()).toBe('touch');
    });

    it('is watched on the page itself from its first moment', () => {
        window.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerType: 'touch' }));
        expect(lastPointerKind()).toBe('touch');
    });

    it('asks nothing of what is not a window', () => {
        expect(() => watchPointerKind(null)()).not.toThrow();
        expect(() => watchPointerKind({})()).not.toThrow();
    });
});

describe('whether a finger holds the pointer as a stream starts', () => {
    it('goes by the press that started it', () => {
        expect(fingerStarts({ kind: 'touch', touchOnly: false })).toBe(true);
        expect(fingerStarts({ kind: 'mouse', touchOnly: true })).toBe(false);
    });

    it('goes by what the browser says of itself when nothing was pressed', () => {
        expect(fingerStarts({ kind: '', touchOnly: true })).toBe(true);
        expect(fingerStarts({ kind: '', touchOnly: false })).toBe(false);
    });

    it('reads the last press by itself', () => {
        forgetPointerKind();
        expect(fingerStarts()).toBe(false);
        notePointerKind('touch');
        expect(fingerStarts()).toBe(true);
        forgetPointerKind();
    });
});

describe('a touch screen that is all a browser has to point with', () => {
    /** A window that answers the two pointer questions. */
    function fakeWin({ coarse, fine }) {
        const win = new EventTarget();
        win.matchMedia = (q) => ({
            matches:
                q === '(any-pointer: coarse)' ? coarse : q === '(any-pointer: fine)' ? fine : false,
        });
        return win;
    }
    const tesla = { userAgent: TESLA_UA, maxTouchPoints: 10 };

    it('is a car’s screen: touch, and no mouse', () => {
        expect(
            touchIsOnlyPointer({ nav: tesla, win: fakeWin({ coarse: true, fine: false }) }),
        ).toBe(true);
    });

    it('is not a touchscreen laptop, which has a trackpad', () => {
        expect(touchIsOnlyPointer({ nav: tesla, win: fakeWin({ coarse: true, fine: true }) })).toBe(
            false,
        );
    });

    it('is not a computer without a touch screen', () => {
        const pc = { userAgent: TESLA_UA, maxTouchPoints: 0 };
        expect(touchIsOnlyPointer({ nav: pc, win: fakeWin({ coarse: false, fine: true }) })).toBe(
            false,
        );
        expect(touchIsOnlyPointer({ nav: pc, win: fakeWin({ coarse: false, fine: false }) })).toBe(
            false,
        );
    });

    it('is not claimed for a browser that answers nothing', () => {
        const win = new EventTarget();
        expect(touchIsOnlyPointer({ nav: tesla, win })).toBe(false);
        let asked = 0;
        win.matchMedia = (q) => {
            // The touch screen is there; the question about a mouse throws.
            if (q === '(any-pointer: coarse)') return { matches: true };
            asked++;
            throw new Error('unsupported');
        };
        expect(touchIsOnlyPointer({ nav: tesla, win })).toBe(false);
        expect(asked).toBe(1);
    });
});

describe('whose pointer it is, a mouse’s or a finger’s', () => {
    it('is the mouse’s on a computer, until a finger touches the stream', () => {
        const p = new FingerPointer();
        expect(p.on()).toBe(false);
        expect(p.touched()).toBe(true);
        expect(p.on()).toBe(true);
        // A second finger changes nothing.
        expect(p.touched()).toBe(false);
        expect(p.on()).toBe(true);
    });

    it('is the finger’s from the start when a finger started the stream', () => {
        const p = new FingerPointer({ start: true });
        expect(p.on()).toBe(true);
        expect(p.always()).toBe(false);
        expect(p.touched()).toBe(false);
    });

    it('goes back to a mouse that really moves', () => {
        const p = new FingerPointer({ start: true });
        // The first sighting is a place, not a move.
        expect(p.mouseMoved(100, 100, 5000)).toBe(false);
        expect(p.on()).toBe(true);
        expect(p.mouseMoved(100 + MOUSE_TRAVEL_PX, 100, 5010)).toBe(true);
        expect(p.on()).toBe(false);
        // Still moving: nothing more to change.
        expect(p.mouseMoved(140, 120, 5020)).toBe(false);
    });

    it('is not taken back by a mouse that trembles, or by a position sent again', () => {
        const p = new FingerPointer({ start: true });
        p.mouseMoved(100, 100, 5000);
        expect(p.mouseMoved(100, 100, 5010)).toBe(false);
        expect(p.mouseMoved(101, 101, 5020)).toBe(false);
        expect(p.mouseMoved(99, 100, 5030)).toBe(false);
        expect(p.on()).toBe(true);
    });

    it('does not listen to a mouse while a finger is down', () => {
        const p = new FingerPointer();
        p.touched();
        expect(p.mouseMoved(100, 100, 1000)).toBe(false);
        expect(p.mouseMoved(300, 300, 1010)).toBe(false);
        expect(p.mousePressed(1020)).toBe(false);
        expect(p.on()).toBe(true);
    });

    it('nor just after the last finger left, when a browser makes its mouse events up', () => {
        const p = new FingerPointer();
        p.touched();
        p.lifted(1000);
        expect(p.mouseMoved(100, 100, 1000 + AFTER_TOUCH_MS - 20)).toBe(false);
        expect(p.mouseMoved(300, 300, 1000 + AFTER_TOUCH_MS - 10)).toBe(false);
        expect(p.mousePressed(1000 + AFTER_TOUCH_MS - 5)).toBe(false);
        expect(p.on()).toBe(true);
        // Past that, the travel is measured from the first place seen then:
        // what was seen during the wait counts for nothing.
        expect(p.mouseMoved(300, 300, 1000 + AFTER_TOUCH_MS)).toBe(false);
        expect(p.mouseMoved(320, 300, 1000 + AFTER_TOUCH_MS + 10)).toBe(true);
        expect(p.on()).toBe(false);
    });

    it('goes back at once to a mouse that presses a button', () => {
        const p = new FingerPointer({ start: true });
        expect(p.mousePressed(5000)).toBe(true);
        expect(p.on()).toBe(false);
        expect(p.mousePressed(5010)).toBe(false);
    });

    it('goes from one to the other as often as they take turns', () => {
        const p = new FingerPointer();
        for (let turn = 0; turn < 3; turn++) {
            const t = turn * 10000;
            expect(p.touched()).toBe(true);
            p.lifted(t + 100);
            p.mouseMoved(10, 10, t + 2000);
            expect(p.mouseMoved(60, 10, t + 2010)).toBe(true);
            expect(p.on()).toBe(false);
        }
    });

    it('stays the finger’s on a phone or a tablet, whatever a mouse does', () => {
        const p = new FingerPointer({ always: true });
        expect(p.on()).toBe(true);
        expect(p.always()).toBe(true);
        expect(p.touched()).toBe(false);
        p.mouseMoved(10, 10, 5000);
        expect(p.mouseMoved(200, 200, 5010)).toBe(false);
        expect(p.mousePressed(5020)).toBe(false);
        expect(p.on()).toBe(true);
    });

    it('is never the finger’s on a television', () => {
        const p = new FingerPointer({ never: true, start: true });
        expect(p.on()).toBe(false);
        expect(p.touched()).toBe(false);
        expect(p.on()).toBe(false);
        expect(p.mouseMoved(10, 10, 5000)).toBe(false);
        expect(p.mousePressed(5010)).toBe(false);
    });

    it('a phone that is also a television is a phone', () => {
        // An Android TV reads as a phone and draws its pointer, as before.
        const p = new FingerPointer({ always: true, never: true });
        expect(p.on()).toBe(true);
    });

    it('takes a clock of any origin', () => {
        const now = vi.fn(() => 0);
        const p = new FingerPointer({ start: true });
        // Nothing was ever touched: a mouse is listened to at time zero.
        p.mouseMoved(0, 0, now());
        expect(p.mouseMoved(50, 0, now())).toBe(true);
    });
});
