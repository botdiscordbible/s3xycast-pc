/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * Fixed joysticks on the on-screen controller.
 *
 * Upstream's sticks float: each side of the screen is one large zone, and a
 * stick is born under the thumb wherever it lands in it. On a phone, in the
 * "all games" mode with its extra keys, a thumb aiming between two keys got a
 * joystick drawn over them at the top of the screen (a subscriber, 17/11/2026:
 * "besoin joysticks fixes, pas qui suivent mes doigts"). The edition's default
 * is a stick that stays where it is drawn: it is taken on its ring, or just
 * around it, and the rest of the screen is the picture's.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TouchPadView } from '../js/ui/TouchPadView.js';
import {
    FIXED_STICK_REACH,
    PAD,
    TOUCH_PAD_STICKS,
    TouchPadState,
    fixedStickFromFinger,
    layoutTouchPad,
    stickAt,
    touchPadSettings,
} from '../js/stream/TouchPadState.js';

const W = 844;
const H = 390;
const stick = (layout, side) => layout.controls.find((c) => c.id === 'stick-' + side);

describe('a fixed stick, from where the finger is', () => {
    const centre = { x: 200, y: 300 };
    const R = 60;

    it('is at rest on its centre and inside the dead zone', () => {
        expect(fixedStickFromFinger(centre, 200, 300, R)).toEqual({
            ax: 0,
            ay: 0,
            kx: 200,
            ky: 300,
        });
        const near = fixedStickFromFinger(centre, 203, 300, R);
        expect([near.ax, near.ay]).toEqual([0, 0]);
        // The knob still follows the thumb there.
        expect(near.kx).toBe(203);
    });

    it('goes as far as the finger, up to the ring', () => {
        const half = fixedStickFromFinger(centre, 230, 300, R);
        expect(half.ax).toBeGreaterThan(0.4);
        expect(half.ax).toBeLessThan(0.5);
        expect(half.ay).toBeCloseTo(0, 10);
        expect([half.kx, half.ky]).toEqual([230, 300]);
        const edge = fixedStickFromFinger(centre, 260, 300, R);
        expect(edge.ax).toBeCloseTo(1, 10);
    });

    it('holds full travel past the ring, the knob on its edge', () => {
        const far = fixedStickFromFinger(centre, 200, 300 - 4 * R, R);
        expect(far.ax).toBeCloseTo(0, 10);
        expect(far.ay).toBeCloseTo(-1, 10);
        expect(far.kx).toBeCloseTo(200, 10);
        expect(far.ky).toBeCloseTo(300 - R, 10);
        const diagonal = fixedStickFromFinger(centre, 200 + 500, 300 + 500, R);
        expect(Math.hypot(diagonal.ax, diagonal.ay)).toBeCloseTo(1, 10);
        expect(Math.hypot(diagonal.kx - 200, diagonal.ky - 300)).toBeCloseTo(R, 10);
    });
});

describe('the layout with fixed sticks', () => {
    const screens = [
        ['a phone on its side', 844, 390],
        ['a small phone on its side', 568, 320],
        ['a phone held upright', 390, 844],
        ['a tablet', 1180, 820],
        ['a car', 959, 600],
    ];

    it('names the two ways a stick can be had', () => {
        expect(TOUCH_PAD_STICKS).toEqual(['fixed', 'follow']);
    });

    it.each(screens)('on %s, a stick answers on the disc around its ring only', (_n, w, h) => {
        const floating = layoutTouchPad({ width: w, height: h });
        const fixed = layoutTouchPad({ width: w, height: h, sticks: 'fixed' });
        for (const side of ['left', 'right']) {
            const was = stick(floating, side);
            const c = stick(fixed, side);
            // The ring rests where it always did.
            expect([c.restX, c.restY, c.radius]).toEqual([was.restX, was.restY, was.radius]);
            expect(c.fixed).toBe(true);
            expect(c.reach).toBeCloseTo(c.radius * FIXED_STICK_REACH, 10);
            // Its zone is the square around that disc, no longer a side of the screen.
            expect(c.x).toBeCloseTo(c.restX - c.reach, 10);
            expect(c.y).toBeCloseTo(c.restY - c.reach, 10);
            expect(c.w).toBeCloseTo(c.reach * 2, 10);
            expect(c.h).toBeCloseTo(c.reach * 2, 10);
            expect(c.w).toBeLessThan(was.w);
            // On the ring, and a little around it.
            expect(stickAt(fixed.controls, c.restX, c.restY)).toBe(c);
            expect(stickAt(fixed.controls, c.restX + c.radius, c.restY)).toBe(c);
            expect(stickAt(fixed.controls, c.restX, c.restY - c.reach + 1)).toBe(c);
            // Not past it, and not in the corner of its square.
            expect(stickAt(fixed.controls, c.restX, c.restY - c.reach - 1)).toBeNull();
            expect(stickAt(fixed.controls, c.x + 1, c.y + 1)).toBeNull();
            // Where a floating stick was born — the top of its side — is nothing now.
            const [fx, fy] = [was.x + was.w / 2, was.y + 4];
            expect(stickAt(floating.controls, fx, fy)).toBe(was);
            if (Math.hypot(fx - c.restX, fy - c.restY) > c.reach) {
                expect(stickAt(fixed.controls, fx, fy)).toBeNull();
            }
        }
        // Every other control is where it was.
        const others = (l) => l.controls.filter((c) => c.kind !== 'stick');
        expect(others(fixed)).toEqual(others(floating));
        expect(fixed.toggle).toEqual(floating.toggle);
    });

    it('leaves upstream’s floating sticks as they were when not asked', () => {
        const plain = layoutTouchPad({ width: W, height: H });
        expect(layoutTouchPad({ width: W, height: H, sticks: 'follow' })).toEqual(plain);
        expect(stick(plain, 'left').fixed).toBeUndefined();
        expect(stick(plain, 'left').w).toBeCloseTo(W * 0.42, 10);
    });

    it('follows a ring the viewer moved', () => {
        const overrides = { 'stick-left': { x: 0.3, y: 0.6, s: 1 } };
        const floating = layoutTouchPad({ width: W, height: H, overrides });
        const fixed = layoutTouchPad({ width: W, height: H, overrides, sticks: 'fixed' });
        const c = stick(fixed, 'left');
        expect([c.restX, c.restY]).toEqual([
            stick(floating, 'left').restX,
            stick(floating, 'left').restY,
        ]);
        expect(c.x + c.w / 2).toBeCloseTo(c.restX, 10);
        expect(c.y + c.h / 2).toBeCloseTo(c.restY, 10);
        expect(stickAt(fixed.controls, c.restX, c.restY)).toBe(c);
    });
});

describe('the settings', () => {
    it('are fixed joysticks unless the viewer asked for the others', () => {
        expect(touchPadSettings().sticks).toBe('fixed');
        expect(touchPadSettings({ touch_pad_sticks: 'follow' }).sticks).toBe('follow');
        expect(touchPadSettings({ touch_pad_sticks: 'fixed' }).sticks).toBe('fixed');
        expect(touchPadSettings({ touch_pad_sticks: 'sideways' }).sticks).toBe('fixed');
        expect(touchPadSettings({ touch_pad_sticks: null }).sticks).toBe('fixed');
    });
});

describe('a fixed stick held', () => {
    let state;
    beforeEach(() => {
        state = new TouchPadState();
    });

    it('stays on its centre and is pushed at once from where the thumb lands', () => {
        const centre = { x: 200, y: 300 };
        expect(state.stickDown('left', 230, 300, 60, 0, centre)).toBe(true);
        expect(state.stickView('left')).toEqual({ x: 200, y: 300, kx: 230, ky: 300 });
        expect(state.axes[0]).toBeGreaterThan(0.4);
        expect(state.axes[1]).toBeCloseTo(0, 10);
        // A second finger on it is not a second stick.
        expect(state.stickDown('left', 200, 300, 60, 0, centre)).toBe(false);
    });

    it('does not move when the thumb goes past its ring', () => {
        state.stickDown('left', 200, 300, 60, 0, { x: 200, y: 300 });
        state.stickMove('left', 200, 20);
        const view = state.stickView('left');
        expect([view.x, view.y]).toEqual([200, 300]);
        expect(view.kx).toBeCloseTo(200, 10);
        expect(view.ky).toBeCloseTo(240, 10);
        expect(state.axes[1]).toBeCloseTo(-1, 10);
        // Coming back to the centre is the centre, with no dead stretch.
        state.stickMove('left', 200, 300);
        expect([state.axes[0], state.axes[1]]).toEqual([0, 0]);
        state.stickUp('left');
        expect(state.stickView('left')).toBeNull();
        expect([state.axes[0], state.axes[1]]).toEqual([0, 0]);
    });

    it('still clicks on a double tap', () => {
        const centre = { x: 200, y: 300 };
        state.stickDown('left', 200, 300, 60, 0, centre);
        state.stickUp('left', 100);
        state.stickDown('left', 204, 302, 60, 250, centre);
        expect(state.buttons[PAD.L3].pressed).toBe(true);
        state.stickUp('left', 400);
        expect(state.buttons[PAD.L3].pressed).toBe(false);
    });

    it('leaves a floating stick as it was: born under the thumb, following it', () => {
        state.stickDown('right', 600, 250, 60, 0);
        expect(state.stickView('right')).toEqual({ x: 600, y: 250, kx: 600, ky: 250 });
        expect([state.axes[2], state.axes[3]]).toEqual([0, 0]);
        state.stickMove('right', 600, 50);
        // Its centre came along, a radius behind the thumb.
        expect(state.stickView('right').y).toBeCloseTo(110, 10);
    });
});

describe('the layer with fixed sticks', () => {
    let parent;
    let state;
    let view;
    let el;
    const fixed = layoutTouchPad({ width: W, height: H, sticks: 'fixed' });

    function fire(target, type, changed, all) {
        const touch = ([identifier, clientX, clientY]) => ({ identifier, clientX, clientY });
        const e = new Event(type, { bubbles: true, cancelable: true });
        e.changedTouches = changed.map(touch);
        e.touches = all.map(touch);
        target.dispatchEvent(e);
        return e;
    }
    function build(options) {
        state = new TouchPadState();
        view = new TouchPadView(parent, state, options);
        view.mount();
        el = parent.querySelector('.touch-pad');
        el.getBoundingClientRect = () => ({ left: 0, top: 0, width: W, height: H });
        view.setVisible(true);
    }
    const ringAt = (side) => {
        const rings = el.querySelectorAll('.touch-pad-ring');
        return rings[side === 'left' ? 0 : 1].style.transform;
    };

    beforeEach(() => {
        parent = document.createElement('div');
        document.body.appendChild(parent);
    });
    afterEach(() => {
        parent.remove();
        vi.useRealTimers();
    });

    it('draws each zone as the disc of its stick', () => {
        build({ sticks: 'fixed' });
        const zones = [...el.querySelectorAll('.touch-pad-zone')];
        expect(zones).toHaveLength(2);
        for (const zone of zones) {
            expect(zone.classList.contains('is-fixed')).toBe(true);
            const c = fixed.controls.find((x) => x.id === zone.dataset.control);
            expect(parseFloat(zone.style.left)).toBeCloseTo(c.x, 6);
            expect(parseFloat(zone.style.top)).toBeCloseTo(c.y, 6);
            expect(parseFloat(zone.style.width)).toBeCloseTo(c.reach * 2, 6);
            expect(parseFloat(zone.style.height)).toBeCloseTo(c.reach * 2, 6);
        }
    });

    it('keeps the ring where it rests while a thumb pushes it', () => {
        build({ sticks: 'fixed' });
        const c = stick(fixed, 'left');
        const rest = ringAt('left');
        fire(el, 'touchstart', [[1, c.restX + 20, c.restY]], [[1, c.restX + 20, c.restY]]);
        expect(state.stickView('left')).not.toBeNull();
        expect(ringAt('left')).toBe(rest);
        expect(state.axes[0]).toBeGreaterThan(0);
        fire(
            el,
            'touchmove',
            [[1, c.restX + 300, c.restY - 200]],
            [[1, c.restX + 300, c.restY - 200]],
        );
        expect(ringAt('left')).toBe(rest);
        expect(Math.hypot(state.axes[0], state.axes[1])).toBeCloseTo(1, 6);
        fire(el, 'touchend', [[1, c.restX + 300, c.restY - 200]], []);
        expect(state.stickView('left')).toBeNull();
        expect(ringAt('left')).toBe(rest);
    });

    it('takes no stick for a thumb away from the rings', () => {
        build({ sticks: 'fixed' });
        // The top of the left side, between the keys: a floating stick's birthplace.
        const was = stick(layoutTouchPad({ width: W, height: H }), 'left');
        const [x, y] = [was.x + was.w - 6, was.y + 6];
        fire(el, 'touchstart', [[1, x, y]], [[1, x, y]]);
        expect(state.stickView('left')).toBeNull();
        expect([state.axes[0], state.axes[1]]).toEqual([0, 0]);
    });

    it('floats as upstream’s does when the viewer chose that, and changes on the fly', () => {
        build({ sticks: 'follow' });
        expect(el.querySelector('.touch-pad-zone.is-fixed')).toBeNull();
        const was = stick(layoutTouchPad({ width: W, height: H }), 'left');
        const [x, y] = [was.x + was.w - 6, was.y + 6];
        fire(el, 'touchstart', [[1, x, y]], [[1, x, y]]);
        expect(state.stickView('left')).toEqual({ x, y, kx: x, ky: y });
        fire(el, 'touchend', [[1, x, y]], []);
        view.setLook({ sticks: 'fixed' });
        expect(el.querySelectorAll('.touch-pad-zone.is-fixed')).toHaveLength(2);
        view.setLook({ sticks: 'follow' });
        expect(el.querySelector('.touch-pad-zone.is-fixed')).toBeNull();
    });

    it('is upstream’s floating layer when nothing is said', () => {
        build({});
        expect(el.querySelector('.touch-pad-zone.is-fixed')).toBeNull();
    });
});
