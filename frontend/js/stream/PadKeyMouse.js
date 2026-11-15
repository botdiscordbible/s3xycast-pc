/*
 * S3XYCast PC — an edition of MoonlightWeb. GPLv3, like the rest of the tree.
 *
 * PadKeyMouse — a controller played as a keyboard and a mouse.
 *
 * A game written for the keyboard and the mouse ignores a controller, whatever
 * plugs it in: the host's virtual Xbox pad is there and the game never reads
 * it. From a phone or a car's screen there is nothing else to hold. So this
 * sits between GamepadManager and the input channel, and in its `kbm` mode the
 * pads never reach the host as pads: the left stick holds the movement keys,
 * the right one moves the mouse, the buttons are keys and mouse buttons, each
 * of them the viewer's to choose (PadKeyMouseDialog).
 *
 * Everything goes out through the stream's own key and mouse senders (the `io`
 * it is given), so the host cannot tell these keys from a keyboard's: they sit
 * in the held-input heartbeat, come back after a stall, and are let go with
 * the others.
 *
 * No DOM here, and no translation: tokens in, tokens out.
 *
 * A binding is a token:
 *   `k:<code>`  a key by its place on the keyboard (KeyboardEvent.code): Space,
 *               the digits' row, the arrows — and the movement keys, which are
 *               where W A S D sit on a US keyboard whatever the host's layout
 *               prints on them (Z Q S D on a French one).
 *   `c:<a-z>`   a letter by what the host's keyboard prints on its key: the
 *               viewer reads "H" in the game's settings and picks H.
 *   `m:<1-3>`   a mouse button (1 left, 2 middle, 3 right).
 *   `w:up|down` one notch of the wheel, repeated while held.
 *   ``          nothing.
 */

export const PAD_KBM_MODES = ['pad', 'kbm'];

/** The pad's buttons, by the bit GamepadManager sends for each (Limelight's). */
const BUTTON_BITS = {
    up: 0x0001,
    down: 0x0002,
    left: 0x0004,
    right: 0x0008,
    menu: 0x0010,
    view: 0x0020,
    l3: 0x0040,
    r3: 0x0080,
    lb: 0x0100,
    rb: 0x0200,
    a: 0x1000,
    b: 0x2000,
    x: 0x4000,
    y: 0x8000,
};

/** What a binding can sit on, in the order the dialog lists them. */
export const PAD_KBM_STICKS = ['ls', 'rs'];
export const PAD_KBM_BUTTONS = [
    'a',
    'b',
    'x',
    'y',
    'lb',
    'rb',
    'lt',
    'rt',
    'l3',
    'r3',
    'view',
    'menu',
    'up',
    'right',
    'down',
    'left',
];

/** What a stick can be. */
export const PAD_KBM_ROLES = ['move', 'arrows', 'mouse', 'none'];

/** A stick's four keys, up, down, left, right. */
const ROLE_KEYS = {
    move: ['k:KeyW', 'k:KeyS', 'k:KeyA', 'k:KeyD'],
    arrows: ['k:ArrowUp', 'k:ArrowDown', 'k:ArrowLeft', 'k:ArrowRight'],
};

/** Keys by their place: the code, its Windows virtual key, its `key` value. */
const PLACED_KEYS = {
    Space: [0x20, ' '],
    ShiftLeft: [0x10, 'Shift'],
    ControlLeft: [0x11, 'Control'],
    AltLeft: [0x12, 'Alt'],
    Tab: [0x09, 'Tab'],
    Escape: [0x1b, 'Escape'],
    Enter: [0x0d, 'Enter'],
    Backspace: [0x08, 'Backspace'],
    Delete: [0x2e, 'Delete'],
    Insert: [0x2d, 'Insert'],
    Home: [0x24, 'Home'],
    End: [0x23, 'End'],
    PageUp: [0x21, 'PageUp'],
    PageDown: [0x22, 'PageDown'],
    ArrowUp: [0x26, 'ArrowUp'],
    ArrowDown: [0x28, 'ArrowDown'],
    ArrowLeft: [0x25, 'ArrowLeft'],
    ArrowRight: [0x27, 'ArrowRight'],
    // The movement keys: a stick's, never offered for a button.
    KeyW: [0x57, 'w'],
    KeyA: [0x41, 'a'],
    KeyS: [0x53, 's'],
    KeyD: [0x44, 'd'],
};
for (let d = 0; d <= 9; d++) PLACED_KEYS['Digit' + d] = [0x30 + d, String(d)];
for (let f = 1; f <= 12; f++) PLACED_KEYS['F' + f] = [0x6f + f, 'F' + f];

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

/**
 * What a button can be given, in the groups the dialog shows. The movement keys
 * are missing on purpose: a letter is picked by what is printed on it.
 */
export const PAD_KBM_ACTIONS = {
    mouse: ['m:1', 'm:3', 'm:2', 'w:up', 'w:down'],
    keys: [
        'Space',
        'ShiftLeft',
        'ControlLeft',
        'AltLeft',
        'Tab',
        'Escape',
        'Enter',
        'Backspace',
        'Delete',
        'Insert',
        'Home',
        'End',
        'PageUp',
        'PageDown',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
    ].map((code) => 'k:' + code),
    digits: [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d) => 'k:Digit' + d),
    letters: [...LETTERS].map((c) => 'c:' + c),
    functions: Array.from({ length: 12 }, (_, i) => 'k:F' + (i + 1)),
};

const BUTTON_TOKENS = new Set(['', ...Object.values(PAD_KBM_ACTIONS).flat()]);

/**
 * The keys of a pad for a first game: the places a shooter or an adventure
 * puts them, and the digits' row on the cross for the weapons.
 */
export const PAD_KBM_DEFAULT_MAP = Object.freeze({
    ls: 'move',
    rs: 'mouse',
    a: 'k:Space',
    b: 'c:c',
    x: 'c:e',
    y: 'c:r',
    lb: 'w:up',
    rb: 'w:down',
    lt: 'm:3',
    rt: 'm:1',
    l3: 'k:ShiftLeft',
    r3: 'c:v',
    view: 'k:Tab',
    menu: 'k:Escape',
    up: 'k:Digit1',
    right: 'k:Digit2',
    down: 'k:Digit3',
    left: 'k:Digit4',
});

/** The slowest and the fastest the mouse stick can be set, 1 = as shipped. */
export const PAD_KBM_SENS_MIN = 0.25;
export const PAD_KBM_SENS_MAX = 4;

/**
 * A saved map made whole: every control has a binding this build knows, the
 * default one where the save has none or one it cannot read.
 * @param {any} source
 * @returns {Record<string, string>}
 */
export function padKbmMap(source) {
    const saved = source && typeof source === 'object' ? source : {};
    /** @type {Record<string, string>} */
    const map = {};
    for (const stick of PAD_KBM_STICKS) {
        map[stick] = PAD_KBM_ROLES.includes(saved[stick])
            ? saved[stick]
            : PAD_KBM_DEFAULT_MAP[stick];
    }
    for (const button of PAD_KBM_BUTTONS) {
        map[button] =
            typeof saved[button] === 'string' && BUTTON_TOKENS.has(saved[button])
                ? saved[button]
                : PAD_KBM_DEFAULT_MAP[button];
    }
    return map;
}

/**
 * The settings as saved (per device, with the stream's others), with the
 * defaults of a viewer who never opened them: a pad is a pad.
 * @param {Record<string, any>} [data]
 */
export function padKbmSettings(data = {}) {
    const sens = data.pad_kbm_sens;
    return {
        mode: data.pad_kbm_mode === 'kbm' ? 'kbm' : 'pad',
        sens:
            typeof sens === 'number' && sens >= PAD_KBM_SENS_MIN && sens <= PAD_KBM_SENS_MAX
                ? sens
                : 1,
        map: padKbmMap(data.pad_kbm_map),
    };
}

/** The same, as the fields the settings are saved under. */
export function padKbmFields(settings) {
    return {
        pad_kbm_mode: settings.mode,
        pad_kbm_sens: settings.sens,
        pad_kbm_map: { ...settings.map },
    };
}

/** Whether a map is the one a viewer who changed nothing has. */
export function padKbmIsDefault(map) {
    return [...PAD_KBM_STICKS, ...PAD_KBM_BUTTONS].every((c) => map[c] === PAD_KBM_DEFAULT_MAP[c]);
}

/**
 * The key message a key token stands for, without its type or its modifier
 * flags; null for a token that is no key. A placed key goes as the stream's
 * gaming mode sends one (its US virtual key, no character: the host plays it by
 * its place). A letter goes with its character, as a chord of the touch
 * keyboard does: the host presses the key its own layout prints that letter
 * on, under whatever is held, and holds it.
 * @param {string} token
 */
export function padKbmKey(token) {
    const base = { nonUs: false, dead: false, hold: true, gaming: true, altGraph: false };
    if (token.startsWith('k:')) {
        const code = token.slice(2);
        const placed = PLACED_KEYS[code];
        if (!placed) return null;
        return { keyCode: placed[0], code, key: placed[1], char: null, ...base };
    }
    if (token.startsWith('c:') && token.length === 3 && LETTERS.includes(token[2])) {
        const c = token[2];
        return {
            keyCode: 0x41 + LETTERS.indexOf(c),
            code: 'Key' + c.toUpperCase(),
            key: c,
            char: c,
            chord: true,
            ...base,
        };
    }
    return null;
}

/** The name of a binding in the catalogue: `padKbm.action.<this>`, or null for one that is its own name. */
function actionName(token) {
    if (!token) return 'none';
    if (token === 'm:1') return 'clickLeft';
    if (token === 'm:2') return 'clickMiddle';
    if (token === 'm:3') return 'clickRight';
    if (token === 'w:up') return 'wheelUp';
    if (token === 'w:down') return 'wheelDown';
    if (token.startsWith('k:')) {
        const code = token.slice(2);
        if (/^(Digit\d|F\d+|Key[A-Z])$/.test(code)) return null;
        return code.charAt(0).toLowerCase() + code.slice(1);
    }
    return null;
}

/** A binding that is its own name in every language: a letter, a digit, F5. */
function plainName(token) {
    if (token.startsWith('c:')) return token[2].toUpperCase();
    const code = token.slice(2);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Key')) return code.slice(3);
    return code;
}

/**
 * A binding as the dialog lists it ("Left click", "Space", "H").
 * @param {string} token
 * @param {(key: string) => string} t
 */
export function padKbmLabel(token, t) {
    const name = actionName(token);
    return name ? t('padKbm.action.' + name) : plainName(token);
}

/**
 * A binding as it is written on a button of the on-screen controller: a few
 * characters at most, nothing for no binding.
 * @param {string} token
 * @param {(key: string) => string} t
 */
export function padKbmShortLabel(token, t) {
    if (!token) return '';
    const arrows = {
        'k:ArrowUp': '↑',
        'k:ArrowDown': '↓',
        'k:ArrowLeft': '←',
        'k:ArrowRight': '→',
    };
    if (arrows[token]) return arrows[token];
    const name = actionName(token);
    return name ? t('padKbm.short.' + name) : plainName(token);
}

/** A button counts as pressed from here, and as let go under there (0–255). */
const TRIGGER_ON = 100;
const TRIGGER_OFF = 60;
/** A stick holds its keys from this far out, and lets go of them under that (0–1). */
const KEYS_ON = 0.42;
const KEYS_OFF = 0.3;
/**
 * A direction is held from this share of the push, and let go under that: eight
 * ways, each key a little reluctant to change so a thumb on the line between
 * two of them does not drum on one.
 */
const WAY_ON = 0.42;
const WAY_OFF = 0.34;
/** Under this the mouse stick is at rest: a real stick never sits at zero. */
const MOUSE_DEAD = 0.14;
/** Counts a second at full push, and how the push in between is shaped. */
const MOUSE_SPEED = 2400;
const MOUSE_CURVE = 1.8;
/** Looking up and down takes less than turning: a thumb overshoots it. */
const MOUSE_VERTICAL = 0.75;
/** How often the mouse moves while its stick is pushed. */
const MOUSE_TICK_MS = 8;
/** A read that came late moves the mouse no further than this much time's worth. */
const MOUSE_MAX_STEP_MS = 50;
/** A wheel button held turns it again this often. */
const WHEEL_REPEAT_MS = 160;

const REST = Object.freeze({ buttons: 0, lt: 0, rt: 0, lx: 0, ly: 0, rx: 0, ry: 0 });

export class PadKeyMouse {
    /**
     * @param {{ send: (msg: object) => void,
     *           key: (key: object, down: boolean) => void,
     *           button: (button: number, down: boolean) => void,
     *           wheel: (notches: number) => void,
     *           move: (dx: number, dy: number) => void,
     *           now?: () => number }} io
     *   `send` ships a pad's own message to the host. `key` presses or lets go
     *   of a key (padKbmKey's message), `button` of a mouse button, `wheel`
     *   turns it by whole notches (up is positive), `move` moves the mouse by
     *   whole counts.
     * @param {{ mode?: string, sens?: number, map?: Record<string, string> }} [settings]
     */
    constructor(io, settings = {}) {
        this._io = io;
        this._now = typeof io.now === 'function' ? io.now : () => performance.now();
        this._mode = settings.mode === 'kbm' ? 'kbm' : 'pad';
        this._sens = typeof settings.sens === 'number' && settings.sens > 0 ? settings.sens : 1;
        this._map = padKbmMap(settings.map);
        // Host index → { ctype, rumble, state }: every pad GamepadManager forwards.
        this._pads = new Map();
        // Tokens this holds down on the host.
        this._held = new Set();
        // The wheel tokens held, turned again by _wheelTimer.
        this._wheels = new Set();
        this._wheelTimer = null;
        this._lt = false;
        this._rt = false;
        // Stick → whether it holds keys, and which of its four ways.
        this._stickOn = { ls: false, rs: false };
        this._ways = { ls: [false, false, false, false], rs: [false, false, false, false] };
        // Counts a second the mouse moves at, and what is left of a count.
        this._vx = 0;
        this._vy = 0;
        this._carryX = 0;
        this._carryY = 0;
        this._moveTimer = null;
        this._movedAt = 0;
    }

    get mode() {
        return this._mode;
    }

    /** Whether the pads are keys and a mouse for the host right now. */
    get active() {
        return this._mode === 'kbm';
    }

    /** Whether anything is held on the host through this. */
    isHolding() {
        return this._held.size > 0;
    }

    /** Whether a mouse button is: the heartbeat says a held one is no drag. */
    holdsButtons() {
        for (const token of this._held) if (token[0] === 'm') return true;
        return false;
    }

    /**
     * A message from GamepadManager, on its way to the host. A pad's own go
     * through as they are in `pad` mode, and never in `kbm` mode, where they
     * become keys; anything else is none of this module's business.
     * @param {any} msg
     */
    handle(msg) {
        const type = msg && msg.type;
        if (type === 'gamepadconnect') {
            this._pads.set(msg.index, {
                ctype: msg.ctype,
                rumble: msg.rumble === true,
                state: null,
            });
        } else if (type === 'gamepaddisconnect') {
            this._pads.delete(msg.index);
        } else if (type === 'gamepad') {
            let pad = this._pads.get(msg.index);
            if (!pad) {
                // A state with no arrival before it: still a pad.
                pad = { ctype: 1, rumble: false, state: null };
                this._pads.set(msg.index, pad);
            }
            pad.state = {
                buttons: msg.buttons | 0,
                lt: msg.lt | 0,
                rt: msg.rt | 0,
                lx: msg.lx | 0,
                ly: msg.ly | 0,
                rx: msg.rx | 0,
                ry: msg.ry | 0,
            };
        } else {
            this._io.send(msg);
            return;
        }
        if (this._mode === 'kbm') this._apply();
        else this._io.send(msg);
    }

    /**
     * Change what the pads are for the host. To keys: the host is told its
     * controllers are gone, or the game would keep reading a pad nobody holds.
     * To a pad: every key is let go first, then the controllers come back with
     * what they hold.
     * @param {string} mode 'pad' or 'kbm'
     */
    setMode(mode) {
        const next = mode === 'kbm' ? 'kbm' : 'pad';
        if (next === this._mode) return;
        if (next === 'kbm') {
            const left = new Set(this._pads.keys());
            for (const index of this._pads.keys()) {
                left.delete(index);
                this._io.send({ type: 'gamepaddisconnect', index, mask: maskOf(left) });
            }
            this._mode = 'kbm';
            this._apply();
            return;
        }
        this.releaseAll();
        this._mode = 'pad';
        const there = new Set();
        for (const [index, pad] of this._pads) {
            there.add(index);
            const mask = maskOf(there);
            this._io.send({
                type: 'gamepadconnect',
                index,
                mask,
                ctype: pad.ctype,
                rumble: pad.rumble,
            });
            if (pad.state) this._io.send({ type: 'gamepad', index, mask, ...pad.state });
        }
    }

    /** New keys: what the old ones held is let go, what the pads hold is pressed anew. */
    setMap(map) {
        this.releaseAll();
        this._map = padKbmMap(map);
        if (this._mode === 'kbm') this._apply();
    }

    setSensitivity(sens) {
        if (typeof sens === 'number' && sens > 0) this._sens = sens;
        if (this._mode === 'kbm') this._apply();
    }

    /** Let go on the host of everything this holds there. */
    releaseAll() {
        for (const token of [...this._held]) this._release(token);
        this._rest();
    }

    /**
     * Forget what is held without a word to the host: the stream has just let
     * go of every key and button itself (a lost focus, a menu). What the pads
     * still hold is pressed again at their next read.
     */
    forget() {
        this._held.clear();
        this._rest();
    }

    /** The end of the stream: nothing is sent, the timers go. */
    destroy() {
        this.forget();
        this._pads.clear();
    }

    _rest() {
        this._wheels.clear();
        this._lt = false;
        this._rt = false;
        this._stickOn = { ls: false, rs: false };
        this._ways = { ls: [false, false, false, false], rs: [false, false, false, false] };
        this._vx = 0;
        this._vy = 0;
        this._syncTimers();
    }

    /** What all the pads hold together: any button of any, the stick pushed furthest. */
    _combined() {
        let all = null;
        for (const pad of this._pads.values()) {
            const s = pad.state;
            if (!s) continue;
            if (!all) {
                all = { ...s };
                continue;
            }
            all.buttons |= s.buttons;
            all.lt = Math.max(all.lt, s.lt);
            all.rt = Math.max(all.rt, s.rt);
            if (Math.hypot(s.lx, s.ly) > Math.hypot(all.lx, all.ly)) {
                all.lx = s.lx;
                all.ly = s.ly;
            }
            if (Math.hypot(s.rx, s.ry) > Math.hypot(all.rx, all.ry)) {
                all.rx = s.rx;
                all.ry = s.ry;
            }
        }
        return all || REST;
    }

    _apply() {
        const s = this._combined();
        const want = new Set();
        const wheels = new Set();
        const add = (token) => {
            if (!token) return;
            if (token[0] === 'w') wheels.add(token);
            else want.add(token);
        };
        for (const name of Object.keys(BUTTON_BITS)) {
            if (s.buttons & BUTTON_BITS[name]) add(this._map[name]);
        }
        this._lt = s.lt >= (this._lt ? TRIGGER_OFF : TRIGGER_ON);
        this._rt = s.rt >= (this._rt ? TRIGGER_OFF : TRIGGER_ON);
        if (this._lt) add(this._map.lt);
        if (this._rt) add(this._map.rt);

        this._vx = 0;
        this._vy = 0;
        this._stick('ls', s.lx, s.ly, want);
        this._stick('rs', s.rx, s.ry, want);

        // Let go before pressing: a thumb sliding from one way to the next
        // never holds three keys.
        for (const token of [...this._held]) if (!want.has(token)) this._release(token);
        for (const token of want) if (!this._held.has(token)) this._press(token);

        for (const token of wheels) {
            if (!this._wheels.has(token)) this._io.wheel(token === 'w:up' ? 1 : -1);
        }
        this._wheels = wheels;
        this._syncTimers();
    }

    /** One stick, by what the viewer made of it: four keys, or the mouse. */
    _stick(name, x, y, want) {
        const role = this._map[name];
        const push = Math.min(1, Math.hypot(x, y) / 32767);
        const keys = ROLE_KEYS[role];
        if (keys) {
            const on = push >= (this._stickOn[name] ? KEYS_OFF : KEYS_ON);
            this._stickOn[name] = on;
            const ways = this._ways[name];
            // Up is positive, as GamepadManager sends it.
            const shares = on ? [y, -y, -x, x].map((v) => v / (push * 32767)) : [0, 0, 0, 0];
            for (let i = 0; i < 4; i++) {
                ways[i] = on && shares[i] >= (ways[i] ? WAY_OFF : WAY_ON);
                if (ways[i]) want.add(keys[i]);
            }
            return;
        }
        this._stickOn[name] = false;
        this._ways[name] = [false, false, false, false];
        if (role !== 'mouse' || push <= MOUSE_DEAD) return;
        const speed =
            MOUSE_SPEED *
            this._sens *
            Math.pow((push - MOUSE_DEAD) / (1 - MOUSE_DEAD), MOUSE_CURVE);
        const length = push * 32767;
        this._vx += (speed * x) / length;
        // The screen's y goes down.
        this._vy -= (speed * MOUSE_VERTICAL * y) / length;
    }

    _press(token) {
        this._held.add(token);
        this._edge(token, true);
    }

    _release(token) {
        this._held.delete(token);
        this._edge(token, false);
    }

    _edge(token, down) {
        if (token[0] === 'm') {
            this._io.button(Number(token[2]), down);
            return;
        }
        const key = padKbmKey(token);
        if (key) this._io.key(key, down);
    }

    /** The mouse moves and the wheel turns on timers of their own, for as long as they are held. */
    _syncTimers() {
        const moving = this._vx !== 0 || this._vy !== 0;
        if (moving && this._moveTimer === null) {
            this._movedAt = this._now();
            this._moveTimer = setInterval(() => this._moveStep(), MOUSE_TICK_MS);
        } else if (!moving && this._moveTimer !== null) {
            clearInterval(this._moveTimer);
            this._moveTimer = null;
            this._carryX = 0;
            this._carryY = 0;
        }
        const turning = this._wheels.size > 0;
        if (turning && this._wheelTimer === null) {
            this._wheelTimer = setInterval(() => {
                for (const token of this._wheels) this._io.wheel(token === 'w:up' ? 1 : -1);
            }, WHEEL_REPEAT_MS);
        } else if (!turning && this._wheelTimer !== null) {
            clearInterval(this._wheelTimer);
            this._wheelTimer = null;
        }
    }

    _moveStep() {
        const now = this._now();
        const dt = Math.min(MOUSE_MAX_STEP_MS, Math.max(0, now - this._movedAt)) / 1000;
        this._movedAt = now;
        const x = this._vx * dt + this._carryX;
        const y = this._vy * dt + this._carryY;
        const dx = Math.trunc(x);
        const dy = Math.trunc(y);
        this._carryX = x - dx;
        this._carryY = y - dy;
        if (dx || dy) this._io.move(dx, dy);
    }
}

function maskOf(indexes) {
    let mask = 0;
    for (const index of indexes) mask |= 1 << index;
    return mask;
}
