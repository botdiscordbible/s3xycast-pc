/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * The stream's quick actions (ui/StreamViewQuick.js): the keys no touch screen
 * has, the PC's other screens, the zoom and the move of the picture. Over a
 * view made of the mixin's methods and of what StreamView gives them (its key
 * sender, its zoom). What is looked at for the keys is what reaches the input
 * channel, since that is all the PC ever knows of them.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../js/i18n/i18n.js', () => ({
    t: (key) => key,
    getLanguage: () => 'en',
}));

import { QUICK_KEYS, StreamViewQuick, quickKeyEvents } from '../js/ui/StreamViewQuick.js';
import { panBounds } from '../js/stream/ViewZoom.js';

const HTML = `
    <div class="stream-header">
        <button id="btn-stream-keyboard"></button>
        <button id="btn-stream-quit"></button>
    </div>
    <div class="stream-canvas-area"><div class="stream-input-layer"></div></div>`;

const AREA = { left: 0, top: 100, width: 1000, height: 600 };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the stream’s quick actions', () => {
    let send;
    let views;

    /** A view with the mixin's methods, and StreamView's own part reduced to what they call. */
    function makeView(fields = {}) {
        const root = document.createElement('div');
        root.className = 'stream-overlay';
        root.innerHTML = HTML;
        document.body.appendChild(root);
        const proto = {};
        for (const name of Object.getOwnPropertyNames(StreamViewQuick.prototype)) {
            if (name === 'constructor') continue;
            Object.defineProperty(
                proto,
                name,
                Object.getOwnPropertyDescriptor(StreamViewQuick.prototype, name),
            );
        }
        const view = Object.create(proto);
        const area = root.querySelector('.stream-canvas-area');
        area.getBoundingClientRect = () => ({
            ...AREA,
            right: AREA.left + AREA.width,
            bottom: AREA.top + AREA.height,
        });
        Object.assign(view, {
            _rootEl: root,
            canvasArea: area,
            webrtc: { send },
            _mouseAllowed: true,
            _heldPhysKeys: new Map(),
            _zoom: 1,
            _panX: 0,
            _panY: 0,
            _lastOutputZoomScale: 1,
            applied: 0,
            // As StreamView has them.
            _sendKeyEvent(msg) {
                const id = msg.code || msg.keyCode;
                if (msg.type === 'keydown') this._heldPhysKeys.set(id, { ...msg, type: 'keyup' });
                else this._heldPhysKeys.delete(id);
                this.webrtc.send(msg);
            },
            // The clamp of the real one, for a 16:9 picture in the area above.
            _applyZoomTransform() {
                const max = panBounds({
                    areaW: AREA.width,
                    areaH: AREA.height,
                    imgW: 1000,
                    imgH: 562.5,
                    zoom: this._zoom,
                });
                this._panX = Math.max(-max.x, Math.min(max.x, this._panX));
                this._panY = Math.max(-max.y, Math.min(max.y, this._panY));
                this.applied++;
                this._quickSyncZoom();
            },
            _outputZoomScale() {
                return Math.max(1, Math.ceil(this._zoom || 1));
            },
            _applyOutputSize: vi.fn(function () {
                this._lastOutputZoomScale = this._outputZoomScale();
            }),
            _stopPanMomentum: vi.fn(),
            _invalidateMediaRect: vi.fn(),
            _placeClientCursor: vi.fn(),
            _positionStatsOverlay: vi.fn(),
            ...fields,
        });
        views.push(view);
        return view;
    }

    const q = (view, selector) => view._rootEl.querySelector(selector);
    const click = (view, selector) => q(view, selector).click();
    const sent = () => send.mock.calls.map((c) => c[0]);

    /** A touch event on `target`, with the fingers given as [x, y] pairs. */
    function touch(type, target, points) {
        const e = new Event(type, { bubbles: true, cancelable: true });
        const list = points.map(([clientX, clientY]) => ({ clientX, clientY }));
        Object.defineProperty(e, 'touches', { value: list });
        Object.defineProperty(e, 'changedTouches', { value: list });
        target.dispatchEvent(e);
        return e;
    }

    beforeEach(() => {
        send = vi.fn();
        views = [];
    });
    afterEach(() => {
        for (const view of views) view._destroyQuick();
        document.body.innerHTML = '';
    });

    // ── The keys ─────────────────────────────────────────────────────────────

    it('presses the Windows key as a key of its own: down, then up', () => {
        expect(quickKeyEvents(QUICK_KEYS.find((k) => k.id === 'win'))).toEqual([
            {
                type: 'keydown',
                keyCode: 0x5b,
                code: '',
                key: '',
                ctrlKey: false,
                shiftKey: false,
                altKey: false,
                metaKey: true,
            },
            {
                type: 'keyup',
                keyCode: 0x5b,
                code: '',
                key: '',
                ctrlKey: false,
                shiftKey: false,
                altKey: false,
                metaKey: false,
            },
        ]);
    });

    it('presses Alt+Tab and Alt+F4 in the order a hand does', () => {
        for (const [id, vk] of [
            ['switch', 0x09],
            ['close', 0x73],
        ]) {
            const events = quickKeyEvents(QUICK_KEYS.find((k) => k.id === id));
            expect(
                events.map((e) => [e.type, e.keyCode, e.altKey]),
                id,
            ).toEqual([
                ['keydown', 0x12, true],
                ['keydown', vk, true],
                ['keyup', vk, true],
                ['keyup', 0x12, false],
            ]);
            // Alt alone: no other modifier is ever claimed.
            for (const e of events) {
                expect(e.ctrlKey || e.shiftKey || e.metaKey, id).toBe(false);
            }
        }
    });

    it('presses Win+Tab, Esc and Win+D, the letter as the key that carries it on the PC', () => {
        const of = (id) => quickKeyEvents(QUICK_KEYS.find((k) => k.id === id));
        expect(of('tasks').map((e) => [e.type, e.keyCode, e.metaKey])).toEqual([
            ['keydown', 0x5b, true],
            ['keydown', 0x09, true],
            ['keyup', 0x09, true],
            ['keyup', 0x5b, false],
        ]);
        expect(of('esc').map((e) => [e.type, e.keyCode])).toEqual([
            ['keydown', 0x1b],
            ['keyup', 0x1b],
        ]);
        const desktop = of('desktop');
        expect(desktop.map((e) => [e.type, e.keyCode])).toEqual([
            ['keydown', 0x5b],
            ['keydown', 0x44],
            ['keyup', 0x44],
            ['keyup', 0x5b],
        ]);
        expect(desktop[1]).toMatchObject({ char: 'd', chord: true, metaKey: true });
        expect(desktop[2]).toMatchObject({ char: 'd', chord: true });
        expect(desktop[0].char).toBeUndefined();
    });

    it('puts its button on the bar before Stop, and its strip between the bar and the picture', () => {
        const view = makeView();
        view._mountQuick();
        view._mountQuick(); // idempotent
        const header = q(view, '.stream-header');
        const ids = Array.from(header.children).map((el) => el.id);
        expect(ids).toEqual(['btn-stream-keyboard', 'btn-stream-quick', 'btn-stream-quit']);
        const order = Array.from(view._rootEl.children).map((el) => el.className);
        expect(order).toEqual(['stream-header', 'stream-quick', 'stream-canvas-area']);
        expect(view._rootEl.querySelectorAll('#stream-quick').length).toBe(1);
        // Closed until asked for.
        expect(q(view, '#stream-quick').hidden).toBe(true);
        expect(q(view, '#btn-stream-quick').getAttribute('aria-expanded')).toBe('false');
    });

    it('opens and closes, and says so to the page', () => {
        const view = makeView();
        view._mountQuick();
        click(view, '#btn-stream-quick');
        expect(q(view, '#stream-quick').hidden).toBe(false);
        expect(view._rootEl.classList.contains('stream-quick-open')).toBe(true);
        expect(q(view, '#btn-stream-quick').getAttribute('aria-expanded')).toBe('true');
        expect(q(view, '#btn-stream-quick').classList.contains('active')).toBe(true);
        // The picture's area changed: what was measured of it is stale, and
        // the stats card goes under the strip.
        expect(view._invalidateMediaRect).toHaveBeenCalled();
        expect(view._positionStatsOverlay).toHaveBeenCalled();
        click(view, '[data-quick="close"]');
        expect(q(view, '#stream-quick').hidden).toBe(true);
        expect(view._rootEl.classList.contains('stream-quick-open')).toBe(false);
        expect(q(view, '#btn-stream-quick').getAttribute('aria-expanded')).toBe('false');
        expect(view._quickBottom()).toBe(0);
    });

    it('offers the six keys in the viewer’s words, each with the keys it presses', () => {
        const view = makeView();
        view._mountQuick();
        const keys = Array.from(view._rootEl.querySelectorAll('[data-quick="key"]'));
        expect(keys.map((b) => b.dataset.key)).toEqual([
            'win',
            'switch',
            'close',
            'tasks',
            'esc',
            'desktop',
        ]);
        expect(keys.map((b) => b.querySelector('.stream-quick-caption').textContent)).toEqual([
            'Win',
            'Alt+Tab',
            'Alt+F4',
            'Win+Tab',
            'Esc',
            'Win+D',
        ]);
        expect(keys.map((b) => b.querySelector('.stream-quick-name').textContent)).toEqual([
            'quick.keyWin',
            'quick.keySwitch',
            'quick.keyClose',
            'quick.keyTasks',
            'quick.keyEsc',
            'quick.keyDesktop',
        ]);
    });

    it('sends a key’s presses to the PC when its button is pressed, and leaves none held', () => {
        const view = makeView();
        view._mountQuick();
        click(view, '[data-key="switch"]');
        expect(sent().map((m) => [m.type, m.keyCode])).toEqual([
            ['keydown', 0x12],
            ['keydown', 0x09],
            ['keyup', 0x09],
            ['keyup', 0x12],
        ]);
        expect(view._heldPhysKeys.size).toBe(0);
        send.mockClear();
        click(view, '[data-key="close"]');
        expect(sent().map((m) => [m.type, m.keyCode])).toEqual([
            ['keydown', 0x12],
            ['keydown', 0x73],
            ['keyup', 0x73],
            ['keyup', 0x12],
        ]);
        send.mockClear();
        click(view, '[data-key="win"]');
        expect(sent().map((m) => [m.type, m.keyCode])).toEqual([
            ['keydown', 0x5b],
            ['keyup', 0x5b],
        ]);
        expect(view._heldPhysKeys.size).toBe(0);
    });

    it('gives a guest without the keyboard no keys, and sends none', () => {
        const view = makeView({ _mouseAllowed: false });
        view._mountQuick();
        expect(q(view, '[data-group="keys"]')).toBeNull();
        expect(q(view, '[data-quick="key"]')).toBeNull();
        view._quickPressKey('close');
        expect(send).not.toHaveBeenCalled();
        // The zoom is the viewer's own: it stays.
        expect(q(view, '[data-quick="zoom-in"]')).not.toBeNull();
    });

    // ── The zoom ─────────────────────────────────────────────────────────────

    it('zooms by its two buttons, says the zoom, and knows where each ends', () => {
        const view = makeView();
        view._mountQuick();
        const label = () => q(view, '.stream-quick-zoom').textContent;
        expect(label()).toBe('100 %');
        expect(q(view, '[data-quick="zoom-out"]').disabled).toBe(true);
        expect(q(view, '[data-quick="fit"]').disabled).toBe(true);
        click(view, '[data-quick="zoom-in"]');
        expect(view._zoom).toBe(1.5);
        expect(label()).toBe('150 %');
        expect(q(view, '[data-quick="zoom-out"]').disabled).toBe(false);
        for (let i = 0; i < 8; i++) click(view, '[data-quick="zoom-in"]');
        expect(view._zoom).toBe(8);
        expect(label()).toBe('800 %');
        expect(q(view, '[data-quick="zoom-in"]').disabled).toBe(true);
        // The enhancer follows the zoom, as with the pinch.
        expect(view._applyOutputSize).toHaveBeenCalled();
        click(view, '[data-quick="zoom-out"]');
        expect(view._zoom).toBe(6);
        click(view, '[data-quick="fit"]');
        expect([view._zoom, view._panX, view._panY]).toEqual([1, 0, 0]);
        expect(label()).toBe('100 %');
    });

    it('says the zoom the pinch left, whoever changed it', () => {
        const view = makeView();
        view._mountQuick();
        // The pinch of StreamViewTouch: it sets the zoom and applies it.
        view._zoom = 2.6;
        view._applyZoomTransform();
        expect(q(view, '.stream-quick-zoom').textContent).toBe('260 %');
        click(view, '[data-quick="zoom-in"]');
        expect(view._zoom).toBe(3);
    });

    it('keeps what is in the middle of the screen there when a button zooms', () => {
        const view = makeView();
        view._mountQuick();
        view._zoom = 2;
        view._panX = 300;
        view._panY = -120;
        // The point of the picture under the middle of the area, before…
        const before = { x: -view._panX / view._zoom, y: -view._panY / view._zoom };
        click(view, '[data-quick="zoom-in"]');
        // …and after.
        expect(view._zoom).toBe(3);
        expect(-view._panX / view._zoom).toBeCloseTo(before.x, 9);
        expect(-view._panY / view._zoom).toBeCloseTo(before.y, 9);
    });

    // ── Moving the picture ───────────────────────────────────────────────────

    it('turns "move the picture" on over a whole picture by zooming one stop', () => {
        const view = makeView();
        view._mountQuick();
        click(view, '[data-quick="move"]');
        expect(view._quickMoveOn).toBe(true);
        expect(view._zoom).toBe(1.5);
        expect(q(view, '[data-quick="move"]').getAttribute('aria-pressed')).toBe('true');
        expect(q(view, '.stream-quick-badge').hidden).toBe(false);
        expect(view._rootEl.classList.contains('stream-quick-moving')).toBe(true);
        // The badge over the picture ends it.
        click(view, '.stream-quick-badge');
        expect(view._quickMoveOn).toBe(false);
        expect(q(view, '.stream-quick-badge').hidden).toBe(true);
        expect(view._rootEl.classList.contains('stream-quick-moving')).toBe(false);
        // The zoom is the viewer's: it stays.
        expect(view._zoom).toBe(1.5);
    });

    it('moves the picture with one finger, and keeps that finger from the PC’s pointer', () => {
        const view = makeView();
        view._mountQuick();
        const stream = vi.fn();
        for (const type of ['touchstart', 'touchmove', 'touchend'])
            view._rootEl.addEventListener(type, stream);
        const layer = q(view, '.stream-input-layer');
        // Off: the finger is the stream's.
        touch('touchstart', layer, [[500, 400]]);
        expect(stream).toHaveBeenCalledTimes(1);
        touch('touchend', layer, []);
        stream.mockClear();

        view._zoom = 2;
        view._quickSetMove(true);
        const start = touch('touchstart', layer, [[500, 400]]);
        touch('touchmove', layer, [[560, 370]]);
        touch('touchmove', layer, [[600, 340]]);
        touch('touchend', layer, []);
        expect(stream).not.toHaveBeenCalled();
        expect(start.defaultPrevented).toBe(true);
        expect([view._panX, view._panY]).toEqual([100, -60]);
        // Nothing went to the PC either.
        expect(send).not.toHaveBeenCalled();
    });

    it('lets the picture’s edge come to the middle of the screen, and no further', () => {
        const view = makeView();
        view._mountQuick();
        view._zoom = 2;
        view._quickSetMove(true);
        const layer = q(view, '.stream-input-layer');
        touch('touchstart', layer, [[100, 300]]);
        touch('touchmove', layer, [[5000, 300]]);
        touch('touchend', layer, []);
        // ×2 of 1000 px: edge on edge is 500, the middle of the area 500 more.
        expect(view._panX).toBe(1000);
    });

    it('zooms with two fingers around the point between them while moving', () => {
        const view = makeView();
        view._mountQuick();
        view._zoom = 2;
        view._quickSetMove(true);
        const layer = q(view, '.stream-input-layer');
        // Around the middle of the area (500, 400): the offset stays 0.
        touch('touchstart', layer, [
            [450, 400],
            [550, 400],
        ]);
        touch('touchmove', layer, [
            [400, 400],
            [600, 400],
        ]);
        expect(view._zoom).toBe(4);
        expect([view._panX, view._panY]).toEqual([0, 0]);
        touch('touchend', layer, []);
        // A finger lifted mid-gesture does not make the picture jump.
        touch('touchstart', layer, [
            [450, 400],
            [550, 400],
        ]);
        touch('touchend', layer, [[550, 400]]);
        touch('touchmove', layer, [[560, 400]]);
        expect([view._panX, view._panY]).toEqual([10, 0]);
    });

    it('ends the move when the picture is pinched back whole, and drops the rest of that gesture', () => {
        const view = makeView();
        view._mountQuick();
        const stream = vi.fn();
        for (const type of ['touchstart', 'touchmove', 'touchend'])
            view._rootEl.addEventListener(type, stream);
        view._zoom = 1.5;
        view._quickSetMove(true);
        const layer = q(view, '.stream-input-layer');
        touch('touchstart', layer, [
            [300, 400],
            [700, 400],
        ]);
        touch('touchmove', layer, [
            [480, 400],
            [520, 400],
        ]);
        expect(view._zoom).toBe(1);
        expect(view._quickMoveOn).toBe(false);
        // The fingers are still down: what they do next is not the PC's.
        touch('touchmove', layer, [
            [400, 300],
            [450, 300],
        ]);
        touch('touchend', layer, [[450, 300]]);
        touch('touchend', layer, []);
        expect(stream).not.toHaveBeenCalled();
        // The next touch is the stream's again.
        touch('touchstart', layer, [[500, 400]]);
        expect(stream).toHaveBeenCalledTimes(1);
    });

    it('leaves the buttons to the stream’s own touch handling while moving', () => {
        const view = makeView();
        view._mountQuick();
        view._quickToggle(true);
        view._zoom = 2;
        view._quickSetMove(true);
        const stream = vi.fn();
        view._rootEl.addEventListener('touchstart', stream);
        // StreamViewTouch presses a button from its touchend: it must see it.
        touch('touchstart', q(view, '.stream-quick-badge'), [[500, 120]]);
        touch('touchstart', q(view, '[data-quick="zoom-in"]'), [[500, 60]]);
        touch('touchstart', q(view, '#btn-stream-quit'), [[900, 20]]);
        expect(stream).toHaveBeenCalledTimes(3);
        expect(view._panX).toBe(0);
    });

    it('keeps a finger between two of its buttons from clicking on the PC', () => {
        const view = makeView();
        view._mountQuick();
        view._quickToggle(true);
        const stream = vi.fn();
        for (const type of ['touchstart', 'touchmove', 'touchend'])
            view._rootEl.addEventListener(type, stream);
        touch('touchstart', q(view, '.stream-quick-title'), [[20, 60]]);
        touch('touchend', q(view, '.stream-quick-title'), []);
        touch('touchstart', q(view, '#stream-quick'), [[20, 60]]);
        expect(stream).not.toHaveBeenCalled();
        // A button of the strip is the stream's to press.
        touch('touchstart', q(view, '[data-key="win"]'), [[120, 60]]);
        expect(stream).toHaveBeenCalledTimes(1);
    });

    it('moves the picture with the mouse held down, zooms with its wheel, and sends neither', () => {
        const view = makeView();
        view._mountQuick();
        view._zoom = 2;
        view._quickSetMove(true);
        const layer = q(view, '.stream-input-layer');
        const stream = vi.fn();
        for (const type of ['mousedown', 'mousemove', 'mouseup', 'wheel', 'click'])
            layer.addEventListener(type, stream);
        const mouse = (type, x, y, more = {}) =>
            layer.dispatchEvent(
                new MouseEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    clientX: x,
                    clientY: y,
                    button: 0,
                    ...more,
                }),
            );
        mouse('mousemove', 480, 380); // not held: nothing moves
        mouse('mousedown', 500, 400);
        mouse('mousemove', 540, 430);
        mouse('mouseup', 540, 430);
        mouse('mousemove', 700, 700);
        mouse('click', 540, 430);
        expect([view._panX, view._panY]).toEqual([40, 30]);
        const wheel = new Event('wheel', { bubbles: true, cancelable: true });
        Object.assign(wheel, { deltaY: -120, clientX: 500, clientY: 400 });
        layer.dispatchEvent(wheel);
        expect(view._zoom).toBe(3);
        expect(stream).not.toHaveBeenCalled();
        // Off, the mouse is the stream's again.
        view._quickSetMove(false);
        mouse('mousedown', 500, 400);
        expect(stream).toHaveBeenCalledTimes(1);
    });

    // ── The PC's other screens ───────────────────────────────────────────────

    const TWO = [
        { id: 11, name: 'Screen 1', current: true },
        { id: 12, name: 'Screen 2', current: false },
    ];

    it('keeps the screens away unless there are at least two to go between', async () => {
        for (const list of [undefined, [], [TWO[0]]]) {
            const view = makeView({ onQuickScreens: list ? async () => list : undefined });
            view._mountQuick();
            view._quickToggle(true);
            await flush();
            expect(q(view, '[data-group="screens"]').hidden).toBe(true);
        }
        // A list that cannot be read is no list.
        const view = makeView({
            onQuickScreens: async () => {
                throw new Error('offline');
            },
        });
        view._mountQuick();
        view._quickToggle(true);
        await flush();
        expect(q(view, '[data-group="screens"]').hidden).toBe(true);
    });

    it('shows the PC’s screens, the one on screen marked, and goes to the other when asked', async () => {
        const change = vi.fn(async () => true);
        const view = makeView({ onQuickScreens: async () => TWO, onQuickSwitchScreen: change });
        view._mountQuick();
        view._zoom = 3;
        view._panX = 200;
        view._quickToggle(true);
        await flush();
        const row = q(view, '[data-group="screens"]');
        expect(row.hidden).toBe(false);
        const buttons = Array.from(row.querySelectorAll('[data-quick="screen"]'));
        expect(buttons.map((b) => b.querySelector('.stream-quick-name').textContent)).toEqual([
            'Screen 1',
            'Screen 2',
        ]);
        expect(buttons[0].disabled).toBe(true);
        expect(buttons[0].classList.contains('is-current')).toBe(true);
        expect(buttons[0].querySelector('.stream-quick-caption').textContent).toBe(
            'quick.screenShown',
        );
        expect(buttons[1].disabled).toBe(false);
        buttons[1].click();
        expect(change).toHaveBeenCalledWith(12);
        // One change at a time, and the other screen starts whole.
        expect(buttons[1].disabled).toBe(true);
        expect([view._zoom, view._panX]).toEqual([1, 0]);
        buttons[1].click();
        expect(change).toHaveBeenCalledTimes(1);
    });

    it('answers again when the change was refused', async () => {
        const view = makeView({
            onQuickScreens: async () => TWO,
            onQuickSwitchScreen: async () => false,
        });
        view._mountQuick();
        view._quickToggle(true);
        await flush();
        q(view, '[data-id="12"]').click();
        await flush();
        await flush();
        expect(q(view, '[data-id="12"]').disabled).toBe(false);
    });

    it('never shows a screen’s name as markup', async () => {
        const view = makeView({
            onQuickScreens: async () => [
                { id: 1, name: '<img src=x onerror=alert(1)>', current: true },
                { id: 2, name: 'B', current: false },
            ],
        });
        view._mountQuick();
        view._quickToggle(true);
        await flush();
        expect(q(view, '[data-group="screens"] img')).toBeNull();
        expect(q(view, '[data-id="1"] .stream-quick-name').textContent).toBe(
            '<img src=x onerror=alert(1)>',
        );
    });

    // ── From one view to the next ────────────────────────────────────────────

    it('is still open, and still moving, on the view that replaces this one', () => {
        const first = makeView();
        first._mountQuick();
        first._quickToggle(true);
        first._zoom = 2;
        first._quickSetMove(true);
        const carry = first._quickSnapshot();
        expect(carry).toEqual({ open: true, move: true });

        // Adopted before the first picture: kept until the strip is mounted.
        const next = makeView({ _zoom: 2 });
        next._adoptQuick(carry);
        expect(q(next, '#stream-quick')).toBeNull();
        next._mountQuick();
        expect(q(next, '#stream-quick').hidden).toBe(false);
        expect(next._quickMoveOn).toBe(true);

        // A whole picture (another screen) has nowhere to go: open, not moving.
        const whole = makeView();
        whole._mountQuick();
        whole._adoptQuick(carry);
        expect(q(whole, '#stream-quick').hidden).toBe(false);
        expect(!!whole._quickMoveOn).toBe(false);
        expect(q(whole, '.stream-quick-badge').hidden).toBe(true);
        expect(whole._zoom).toBe(1);

        // Closed stays closed.
        const closed = makeView();
        closed._mountQuick();
        closed._adoptQuick({ open: false, move: false });
        expect(q(closed, '#stream-quick').hidden).toBe(true);
    });

    it('takes everything of its own away with the view', () => {
        const view = makeView();
        view._mountQuick();
        view._quickToggle(true);
        view._zoom = 2;
        view._quickSetMove(true);
        view._destroyQuick();
        expect(q(view, '#btn-stream-quick')).toBeNull();
        expect(q(view, '#stream-quick')).toBeNull();
        expect(q(view, '.stream-quick-badge')).toBeNull();
        expect(view._rootEl.className).toBe('stream-overlay');
        // And no longer stands between a finger and the stream.
        const stream = vi.fn();
        view._rootEl.addEventListener('touchstart', stream);
        touch('touchstart', q(view, '.stream-input-layer'), [[500, 400]]);
        expect(stream).toHaveBeenCalledTimes(1);
        view._destroyQuick(); // idempotent
    });

    // ── Its words ────────────────────────────────────────────────────────────

    it('has every sentence it shows in the four languages', async () => {
        const shown = [
            'open',
            'openTitle',
            'close',
            'keysTitle',
            'screensTitle',
            'screenShown',
            'switchFailed',
            'switchShared',
            'viewTitle',
            'zoomIn',
            'zoomOut',
            'move',
            'moveOn',
            'moveDone',
            'fit',
            ...QUICK_KEYS.map((k) => k.label.replace('quick.', '')),
        ];
        for (const lang of ['en', 'fr', 'tr', 'zh']) {
            const cat = (await import(`../locales/${lang}.json`)).default.quick;
            for (const key of shown) expect(cat[key], `${lang} quick.${key}`).toBeTruthy();
        }
    });

    it('names the edition, never the program it is made from, in every sentence of every language', async () => {
        // Seen on the owner's phone (15/11/2026): "lancez Moonlight depuis
        // l'icône". The file names and the keys may say it; what is read may not.
        const texts = (node, path, out) => {
            for (const [key, value] of Object.entries(node)) {
                if (value && typeof value === 'object') texts(value, `${path}${key}.`, out);
                else if (/moonlight/i.test(String(value))) out.push(`${path}${key}`);
            }
            return out;
        };
        for (const lang of ['en', 'fr', 'tr', 'zh']) {
            const cat = (await import(`../locales/${lang}.json`)).default;
            expect(texts(cat, `${lang}:`, [])).toEqual([]);
        }
    });
});
