/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * A game written for the keyboard and the mouse ignores a controller (seen on
 * 15/11/2026: the host's virtual Xbox pad was plugged in, its stick reached
 * Windows, and the game never moved). PadKeyMouse is what plays such a game
 * from a phone or a car's screen: in its `kbm` mode a pad never reaches the
 * host as a pad, and its sticks and buttons go out as keys and as the mouse.
 *
 * What is pinned here is what a player would feel if it broke: a key left down,
 * a pad the game still sees, a mouse that drifts or does not stop, a letter
 * that lands on the wrong key of a French keyboard.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    PAD_KBM_ACTIONS,
    PAD_KBM_BUTTONS,
    PAD_KBM_DEFAULT_MAP,
    PAD_KBM_ROLES,
    PAD_KBM_STICKS,
    PadKeyMouse,
    padKbmFields,
    padKbmIsDefault,
    padKbmKey,
    padKbmLabel,
    padKbmMap,
    padKbmSettings,
    padKbmShortLabel,
} from '../js/stream/PadKeyMouse.js';
import { StreamView } from '../js/ui/StreamView.js';

const BTN = { A: 0x1000, B: 0x2000, X: 0x4000, Y: 0x8000, UP: 0x0001, LB: 0x0100, L3: 0x0040 };
const FULL = 32767;

/** A pad's state as GamepadManager sends it. */
const state = (fields = {}, index = 0) => ({
    type: 'gamepad',
    index,
    mask: 1 << index,
    buttons: 0,
    lt: 0,
    rt: 0,
    lx: 0,
    ly: 0,
    rx: 0,
    ry: 0,
    ...fields,
});
const arrival = (index = 0) => ({
    type: 'gamepadconnect',
    index,
    mask: 1 << index,
    ctype: 1,
    rumble: true,
});

describe('PadKeyMouse', () => {
    let io;
    let clock;
    let pkm;

    const make = (settings = { mode: 'kbm' }) => {
        pkm = new PadKeyMouse(io, settings);
        return pkm;
    };
    /** What went out as keys: 'KeyW+' for a press, 'KeyW-' for a release. */
    const keys = () => io.key.mock.calls.map(([key, down]) => key.code + (down ? '+' : '-'));
    const buttons = () => io.button.mock.calls.map(([button, down]) => button + (down ? '+' : '-'));
    const moved = () =>
        io.move.mock.calls.reduce((sum, [dx, dy]) => ({ x: sum.x + dx, y: sum.y + dy }), {
            x: 0,
            y: 0,
        });
    /** Let time pass for the timers and for the clock the mouse reads. */
    const wait = (ms) => {
        const step = 4;
        for (let t = 0; t < ms; t += step) {
            clock.t += step;
            vi.advanceTimersByTime(step);
        }
    };

    beforeEach(() => {
        vi.useFakeTimers();
        clock = { t: 1000 };
        io = {
            send: vi.fn(),
            key: vi.fn(),
            button: vi.fn(),
            wheel: vi.fn(),
            move: vi.fn(),
            now: () => clock.t,
        };
    });
    afterEach(() => {
        if (pkm) pkm.destroy();
        pkm = null;
        vi.useRealTimers();
    });

    describe('as a pad', () => {
        it('passes every message of a pad on, untouched', () => {
            make({ mode: 'pad' });
            const messages = [
                arrival(),
                state({ buttons: BTN.A, lx: FULL }),
                { type: 'gamepaddisconnect', index: 0, mask: 0 },
            ];
            for (const msg of messages) pkm.handle(msg);
            expect(io.send.mock.calls.map((c) => c[0])).toEqual(messages);
            expect(io.key).not.toHaveBeenCalled();
            expect(io.move).not.toHaveBeenCalled();
        });

        it('is what a viewer who chose nothing gets', () => {
            expect(padKbmSettings().mode).toBe('pad');
            expect(new PadKeyMouse(io).mode).toBe('pad');
        });
    });

    describe('as a keyboard and a mouse', () => {
        it('never lets the host see a pad', () => {
            make();
            pkm.handle(arrival());
            pkm.handle(state({ buttons: BTN.A, lx: FULL, rx: FULL }));
            pkm.handle({ type: 'gamepaddisconnect', index: 0, mask: 0 });
            expect(io.send).not.toHaveBeenCalled();
        });

        it('still passes on what is not a pad’s', () => {
            make();
            const other = { type: 'somethingelse', value: 1 };
            pkm.handle(other);
            expect(io.send).toHaveBeenCalledWith(other);
        });

        it('holds the forward key while the left stick is pushed up, and lets go at rest', () => {
            make();
            pkm.handle(arrival());
            pkm.handle(state({ ly: FULL }));
            expect(keys()).toEqual(['KeyW+']);
            // The same push repeated (GamepadManager re-emits it): nothing more.
            pkm.handle(state({ ly: FULL }));
            expect(keys()).toEqual(['KeyW+']);
            pkm.handle(state());
            expect(keys()).toEqual(['KeyW+', 'KeyW-']);
            expect(pkm.isHolding()).toBe(false);
        });

        it.each([
            ['up', { ly: FULL }, ['KeyW']],
            ['down', { ly: -FULL }, ['KeyS']],
            ['left', { lx: -FULL }, ['KeyA']],
            ['right', { lx: FULL }, ['KeyD']],
            ['up and right', { lx: 23170, ly: 23170 }, ['KeyD', 'KeyW']],
            ['down and left', { lx: -23170, ly: -23170 }, ['KeyA', 'KeyS']],
        ])('reads the stick pushed %s', (_way, push, want) => {
            make();
            pkm.handle(state(push));
            expect(
                keys()
                    .map((k) => k.slice(0, -1))
                    .sort(),
            ).toEqual(want.sort());
        });

        it('reads a diagonal pushed only half way: the way counts, not the two axes apart', () => {
            make();
            // 0.5 out at 45°: each axis is at 0.35, under what holds a key.
            pkm.handle(state({ lx: 11585, ly: 11585 }));
            expect(keys().sort()).toEqual(['KeyD+', 'KeyW+']);
        });

        it('leaves a stick that rests off its centre alone', () => {
            make();
            pkm.handle(state({ lx: 6000, ly: -5000, rx: 3000, ry: 2500 }));
            expect(io.key).not.toHaveBeenCalled();
            wait(100);
            expect(io.move).not.toHaveBeenCalled();
        });

        it('does not drum on a key when the push hovers at the edge', () => {
            make();
            const on = Math.round(0.45 * FULL);
            const between = Math.round(0.36 * FULL);
            pkm.handle(state({ ly: on }));
            pkm.handle(state({ ly: between }));
            pkm.handle(state({ ly: on }));
            pkm.handle(state({ ly: between }));
            expect(keys()).toEqual(['KeyW+']);
            pkm.handle(state({ ly: Math.round(0.2 * FULL) }));
            expect(keys()).toEqual(['KeyW+', 'KeyW-']);
        });

        it('lets go of one way before holding the next', () => {
            make();
            pkm.handle(state({ ly: FULL }));
            pkm.handle(state({ lx: FULL }));
            expect(keys()).toEqual(['KeyW+', 'KeyW-', 'KeyD+']);
        });

        it('presses each button’s key, and lets go of it', () => {
            make();
            pkm.handle(state({ buttons: BTN.A }));
            pkm.handle(state({ buttons: BTN.A | BTN.X }));
            pkm.handle(state({ buttons: BTN.X }));
            pkm.handle(state());
            expect(keys()).toEqual(['Space+', 'KeyE+', 'Space-', 'KeyE-']);
        });

        it('plays the triggers as the mouse’s buttons, right one to fire and left one to aim', () => {
            make();
            pkm.handle(state({ rt: 255 }));
            pkm.handle(state({ rt: 255, lt: 255 }));
            expect(buttons()).toEqual(['1+', '3+']);
            expect(pkm.holdsButtons()).toBe(true);
            pkm.handle(state());
            expect(buttons().slice(2).sort()).toEqual(['1-', '3-']);
            expect(pkm.holdsButtons()).toBe(false);
        });

        it('takes a trigger half pressed for one thing or the other, not both in turn', () => {
            make();
            pkm.handle(state({ rt: 120 }));
            pkm.handle(state({ rt: 80 }));
            pkm.handle(state({ rt: 120 }));
            expect(buttons()).toEqual(['1+']);
            pkm.handle(state({ rt: 40 }));
            expect(buttons()).toEqual(['1+', '1-']);
        });

        it('turns the wheel once at the press, then again while the button is held', () => {
            make();
            pkm.handle(state({ buttons: BTN.LB }));
            expect(io.wheel.mock.calls).toEqual([[1]]);
            wait(170);
            expect(io.wheel.mock.calls).toEqual([[1], [1]]);
            pkm.handle(state());
            wait(1000);
            expect(io.wheel).toHaveBeenCalledTimes(2);
        });

        it('moves the mouse for as long as the right stick is pushed, and stops with it', () => {
            make();
            pkm.handle(state({ rx: FULL }));
            wait(1000);
            const there = moved();
            // Full push: 2400 counts a second, give or take a timer's tick.
            expect(there.x).toBeGreaterThan(2300);
            expect(there.x).toBeLessThan(2500);
            expect(there.y).toBe(0);
            pkm.handle(state());
            const calls = io.move.mock.calls.length;
            wait(500);
            expect(io.move.mock.calls.length).toBe(calls);
        });

        it('moves up when the stick goes up, and slower than it turns', () => {
            make();
            pkm.handle(state({ ry: FULL }));
            wait(1000);
            const there = moved();
            expect(there.x).toBe(0);
            expect(there.y).toBeLessThan(-1700);
            expect(there.y).toBeGreaterThan(-1900);
        });

        it('moves slowly for a small push: a little of the way out is not a little of the speed', () => {
            make();
            pkm.handle(state({ rx: Math.round(0.4 * FULL) }));
            wait(1000);
            // (0.4 − 0.14) / 0.86 = 0.30 of the travel, raised to 1.8: 12 % of the speed.
            expect(moved().x).toBeGreaterThan(200);
            expect(moved().x).toBeLessThan(360);
        });

        it('goes as fast as the viewer set it', () => {
            make({ mode: 'kbm', sens: 2 });
            pkm.handle(state({ rx: FULL }));
            wait(500);
            expect(moved().x).toBeGreaterThan(2300);
            pkm.setSensitivity(0.5);
            io.move.mockClear();
            wait(500);
            expect(moved().x).toBeGreaterThan(550);
            expect(moved().x).toBeLessThan(650);
        });

        it('does not leap after a pause of the page: one late tick is one tick’s worth', () => {
            make();
            pkm.handle(state({ rx: FULL }));
            clock.t += 5000;
            vi.advanceTimersByTime(8);
            // 50 ms at most, whatever the wait was.
            expect(moved().x).toBeLessThanOrEqual(120);
        });

        it('plays every pad together: the on-screen one and the one in the hand', () => {
            make();
            pkm.handle(arrival(0));
            pkm.handle(arrival(1));
            pkm.handle(state({ ly: FULL }, 0));
            pkm.handle(state({ buttons: BTN.A }, 1));
            expect(keys().sort()).toEqual(['KeyW+', 'Space+']);
            // The second pad going away takes only what it held.
            pkm.handle({ type: 'gamepaddisconnect', index: 1, mask: 1 });
            expect(keys()).toEqual(['KeyW+', 'Space+', 'Space-']);
        });

        it('ignores the Guide button: there is no such key', () => {
            make();
            pkm.handle(state({ buttons: 0x0400 }));
            expect(io.key).not.toHaveBeenCalled();
            expect(io.button).not.toHaveBeenCalled();
        });
    });

    describe('the keys it sends', () => {
        it('sends a placed key as the stream’s gaming mode does: its US key, no character', () => {
            expect(padKbmKey('k:Space')).toEqual({
                keyCode: 0x20,
                code: 'Space',
                key: ' ',
                char: null,
                nonUs: false,
                dead: false,
                hold: true,
                gaming: true,
                altGraph: false,
            });
        });

        it('sends a letter with its character, as a chord: the host presses the key that prints it', () => {
            // "Q" on a French keyboard is where a US one has A: the position
            // alone would press the wrong key.
            expect(padKbmKey('c:q')).toMatchObject({
                keyCode: 0x51,
                code: 'KeyQ',
                char: 'q',
                chord: true,
                hold: true,
                gaming: true,
            });
        });

        it('sends the movement keys by their place, never by their letter', () => {
            for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) {
                const key = padKbmKey('k:' + code);
                expect(key.char).toBeNull();
                expect(key.chord).toBeUndefined();
            }
        });

        it('names every placed key as the keyboard’s own handler would', () => {
            const placed = [
                ...PAD_KBM_ACTIONS.keys,
                ...PAD_KBM_ACTIONS.digits,
                ...PAD_KBM_ACTIONS.functions,
            ];
            for (const token of [...placed, 'k:KeyW', 'k:KeyA', 'k:KeyS', 'k:KeyD']) {
                const key = padKbmKey(token);
                expect(key, token).not.toBeNull();
                expect(key.keyCode, token).toBe(StreamView.codeToWindowsVk(key.code));
            }
            for (const token of PAD_KBM_ACTIONS.letters) {
                const key = padKbmKey(token);
                expect(key.keyCode, token).toBe(StreamView.codeToWindowsVk(key.code));
            }
        });

        it('has no key for what is not one', () => {
            for (const token of ['', 'm:1', 'w:up', 'k:Nope', 'c:é', 'c:ab']) {
                expect(padKbmKey(token), token).toBeNull();
            }
        });
    });

    describe('changing what the pads are', () => {
        it('takes the controllers off the host when they become keys, and presses what is held', () => {
            make({ mode: 'pad' });
            pkm.handle(arrival(0));
            pkm.handle(arrival(1));
            pkm.handle(state({ ly: FULL }, 0));
            io.send.mockClear();
            pkm.setMode('kbm');
            expect(io.send.mock.calls.map((c) => c[0])).toEqual([
                { type: 'gamepaddisconnect', index: 0, mask: 0b10 },
                { type: 'gamepaddisconnect', index: 1, mask: 0 },
            ]);
            expect(keys()).toEqual(['KeyW+']);
        });

        it('lets go of every key when they become a pad again, then plugs the controllers back in', () => {
            make();
            pkm.handle(arrival(0));
            pkm.handle(state({ ly: FULL, buttons: BTN.A, rt: 255 }, 0));
            io.key.mockClear();
            io.button.mockClear();
            pkm.setMode('pad');
            expect(keys().sort()).toEqual(['KeyW-', 'Space-']);
            expect(buttons()).toEqual(['1-']);
            expect(io.send.mock.calls.map((c) => c[0])).toEqual([
                { type: 'gamepadconnect', index: 0, mask: 1, ctype: 1, rumble: true },
                state({ ly: FULL, buttons: BTN.A, rt: 255 }, 0),
            ]);
            expect(pkm.isHolding()).toBe(false);
        });

        it('stops the mouse and the wheel with the keys', () => {
            make();
            pkm.handle(state({ rx: FULL, buttons: BTN.LB }));
            pkm.setMode('pad');
            io.move.mockClear();
            io.wheel.mockClear();
            wait(1000);
            expect(io.move).not.toHaveBeenCalled();
            expect(io.wheel).not.toHaveBeenCalled();
        });

        it('says nothing when asked for what it already is', () => {
            make();
            pkm.handle(arrival());
            pkm.setMode('kbm');
            expect(io.send).not.toHaveBeenCalled();
        });
    });

    describe('what the stream lets go of', () => {
        it('forgets its keys without a word, and presses them again at the pad’s next read', () => {
            make();
            pkm.handle(state({ ly: FULL }));
            io.key.mockClear();
            // The stream has released every key itself (a lost focus).
            pkm.forget();
            expect(io.key).not.toHaveBeenCalled();
            expect(pkm.isHolding()).toBe(false);
            // GamepadManager repeats a pad held away from rest.
            pkm.handle(state({ ly: FULL }));
            expect(keys()).toEqual(['KeyW+']);
        });

        it('lets go of everything when told to', () => {
            make();
            pkm.handle(state({ ly: FULL, buttons: BTN.A, rt: 255, rx: FULL }));
            io.key.mockClear();
            io.button.mockClear();
            pkm.releaseAll();
            expect(keys().sort()).toEqual(['KeyW-', 'Space-']);
            expect(buttons()).toEqual(['1-']);
            io.move.mockClear();
            wait(200);
            expect(io.move).not.toHaveBeenCalled();
        });

        it('sends nothing at the end of the stream', () => {
            make();
            pkm.handle(state({ ly: FULL, rx: FULL }));
            io.key.mockClear();
            io.move.mockClear();
            pkm.destroy();
            wait(200);
            expect(io.key).not.toHaveBeenCalled();
            expect(io.move).not.toHaveBeenCalled();
        });
    });

    describe('the viewer’s own keys', () => {
        it('plays the keys the viewer chose', () => {
            make({
                mode: 'kbm',
                map: { ...PAD_KBM_DEFAULT_MAP, a: 'c:h', ls: 'arrows', rs: 'move' },
            });
            pkm.handle(state({ buttons: BTN.A, ly: FULL, rx: FULL }));
            expect(keys().sort()).toEqual(['ArrowUp+', 'KeyD+', 'KeyH+']);
            wait(200);
            expect(io.move).not.toHaveBeenCalled();
        });

        it('lets go of the old key when a held button is given a new one', () => {
            make();
            pkm.handle(state({ buttons: BTN.A }));
            pkm.setMap({ ...PAD_KBM_DEFAULT_MAP, a: 'k:Enter' });
            expect(keys()).toEqual(['Space+', 'Space-', 'Enter+']);
        });

        it('does nothing for a control set to nothing', () => {
            make({ mode: 'kbm', map: { ...PAD_KBM_DEFAULT_MAP, a: '', ls: 'none', rs: 'none' } });
            pkm.handle(state({ buttons: BTN.A, ly: FULL, rx: FULL }));
            wait(100);
            expect(io.key).not.toHaveBeenCalled();
            expect(io.move).not.toHaveBeenCalled();
        });

        it('can put the mouse under the left thumb', () => {
            make({ mode: 'kbm', map: { ...PAD_KBM_DEFAULT_MAP, ls: 'mouse', rs: 'move' } });
            pkm.handle(state({ lx: FULL }));
            wait(100);
            expect(moved().x).toBeGreaterThan(0);
        });
    });

    describe('what is saved', () => {
        it('reads what it wrote', () => {
            const settings = { mode: 'kbm', sens: 1.5, map: { ...PAD_KBM_DEFAULT_MAP, y: 'c:f' } };
            expect(padKbmSettings(padKbmFields(settings))).toEqual(settings);
        });

        it('gives a save from nowhere the defaults, control by control', () => {
            const read = padKbmSettings({
                pad_kbm_mode: 'sideways',
                pad_kbm_sens: 90,
                pad_kbm_map: { a: 'k:Launch', ls: 'fly', b: 'c:z', lt: 7 },
            });
            expect(read.mode).toBe('pad');
            expect(read.sens).toBe(1);
            expect(read.map.a).toBe(PAD_KBM_DEFAULT_MAP.a);
            expect(read.map.ls).toBe('move');
            expect(read.map.lt).toBe(PAD_KBM_DEFAULT_MAP.lt);
            // What it can read is kept.
            expect(read.map.b).toBe('c:z');
            expect(padKbmMap(null)).toEqual({ ...PAD_KBM_DEFAULT_MAP });
        });

        it('knows the keys nobody changed', () => {
            expect(padKbmIsDefault(padKbmMap())).toBe(true);
            expect(padKbmIsDefault({ ...PAD_KBM_DEFAULT_MAP, a: '' })).toBe(false);
        });

        it('ships a key the dialog offers for every control', () => {
            const offered = new Set(['', ...Object.values(PAD_KBM_ACTIONS).flat()]);
            for (const button of PAD_KBM_BUTTONS) {
                expect(offered.has(PAD_KBM_DEFAULT_MAP[button]), button).toBe(true);
            }
            for (const stick of PAD_KBM_STICKS) {
                expect(PAD_KBM_ROLES).toContain(PAD_KBM_DEFAULT_MAP[stick]);
            }
            // The left stick walks and the right one looks, as every such game expects.
            expect(PAD_KBM_DEFAULT_MAP.ls).toBe('move');
            expect(PAD_KBM_DEFAULT_MAP.rs).toBe('mouse');
        });
    });

    describe('what a key is called', () => {
        const t = (key) => '<' + key + '>';

        it('names a letter, a digit and a function key by themselves, in every language', () => {
            expect(padKbmLabel('c:h', t)).toBe('H');
            expect(padKbmLabel('k:Digit4', t)).toBe('4');
            expect(padKbmLabel('k:F11', t)).toBe('F11');
            expect(padKbmShortLabel('c:h', t)).toBe('H');
            expect(padKbmShortLabel('k:Digit0', t)).toBe('0');
        });

        it('asks the catalogue for the rest', () => {
            expect(padKbmLabel('', t)).toBe('<padKbm.action.none>');
            expect(padKbmLabel('m:1', t)).toBe('<padKbm.action.clickLeft>');
            expect(padKbmLabel('m:3', t)).toBe('<padKbm.action.clickRight>');
            expect(padKbmLabel('w:down', t)).toBe('<padKbm.action.wheelDown>');
            expect(padKbmLabel('k:ShiftLeft', t)).toBe('<padKbm.action.shiftLeft>');
            expect(padKbmLabel('k:PageUp', t)).toBe('<padKbm.action.pageUp>');
            expect(padKbmShortLabel('k:Space', t)).toBe('<padKbm.short.space>');
            expect(padKbmShortLabel('m:2', t)).toBe('<padKbm.short.clickMiddle>');
        });

        it('writes nothing on a button with no key, and an arrow on an arrow', () => {
            expect(padKbmShortLabel('', t)).toBe('');
            expect(padKbmShortLabel('k:ArrowLeft', t)).toBe('←');
        });
    });
});

describe('what the two modes are called', () => {
    // The first owner to try it, 15/11/2026: choosing "keyboard and mouse" to
    // make a controller work is not what a player expects to do. The modes are
    // named for what the player wants; the keyboard is the means, and is said
    // in the sentence under the choice.
    const MEANS = {
        en: /keyboard|mouse/i,
        fr: /clavier|souris/i,
        tr: /klavye|fare/i,
        zh: /键盘|鼠标|键鼠/,
    };

    it.each(Object.keys(MEANS))(
        'names them for the player, and says the means below (%s)',
        async (lang) => {
            const pad = (await import(`../locales/${lang}.json`)).default.padKbm;
            for (const name of ['title', 'modePad', 'modeKbm', 'pillPad', 'pillKbm', 'button']) {
                expect(pad[name], name).toBeTruthy();
                expect(MEANS[lang].test(pad[name]), `${name} = ${pad[name]}`).toBe(false);
            }
            expect(MEANS[lang].test(pad.descKbm)).toBe(true);
            // The two must not read the same on the pill.
            expect(pad.pillPad).not.toBe(pad.pillKbm);
            expect(pad.modePad).not.toBe(pad.modeKbm);
        },
    );
});

describe('the catalogue of the four languages', () => {
    it.each(['en', 'fr', 'tr', 'zh'])(
        'has a name, long and short, for every key offered (%s)',
        async (lang) => {
            const catalog = (await import(`../locales/${lang}.json`)).default;
            const t = (key) => key.split('.').reduce((o, k) => (o ? o[k] : undefined), catalog);
            for (const token of ['', ...Object.values(PAD_KBM_ACTIONS).flat()]) {
                expect(padKbmLabel(token, t), token).toBeTruthy();
                if (token) {
                    const short = padKbmShortLabel(token, t);
                    expect(short, token).toBeTruthy();
                    // It has to fit in a round button.
                    expect([...short].length, `${token} = ${short}`).toBeLessThanOrEqual(6);
                }
            }
            for (const role of PAD_KBM_ROLES) expect(t('padKbm.role.' + role), role).toBeTruthy();
        },
    );
});
