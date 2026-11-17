/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * Where StreamView and the application were touched for the stream's quick
 * actions. Each of these is one line in a very long upstream file, the kind a
 * merge of a new upstream release drops without a conflict: the button would
 * be gone, or the strip would close at every change of quality, or the picture
 * could no longer be moved past its edges.
 *
 * And the change of screen itself (app.js): which screens are offered, and
 * that a screen which does not start brings back the one that was showing.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StreamView } from '../js/ui/StreamView.js';
import { StreamViewQuick } from '../js/ui/StreamViewQuick.js';
import { StreamViewTouch } from '../js/ui/StreamViewTouch.js';
import { MoonlightApp } from '../js/app.js';
import { BackendClient } from '../js/api/BackendClient.js';
import { Toast } from '../js/ui/Toast.js';
import { App } from '../js/models/App.js';

const here = dirname(fileURLToPath(import.meta.url));
const source = (...path) => readFileSync(join(here, '..', 'js', ...path), 'utf8');

describe('StreamView and the stream’s quick actions', () => {
    const view = source('ui', 'StreamView.js');

    it('has the mixin’s methods', () => {
        for (const name of Object.getOwnPropertyNames(StreamViewQuick.prototype)) {
            if (name === 'constructor') continue;
            expect(typeof StreamView.prototype[name], name).toBe('function');
        }
    });

    it('mounts the button with the bar’s other controls, once the stream shows', () => {
        const reveal = view.slice(view.indexOf('    _revealStreamControls() {'));
        const body = reveal.slice(0, reveal.indexOf('\n    }'));
        expect(body).toContain('this._mountQuick();');
        // Before Share, which is put before Stop later and so lands after it.
        expect(body.indexOf('this._mountQuick();')).toBeLessThan(
            body.indexOf('this._mountShareMenu();'),
        );
    });

    it('carries the strip from a view to the one that replaces it', () => {
        const capture = view.slice(view.indexOf('    captureViewState() {'));
        expect(capture.slice(0, capture.indexOf('\n    }'))).toContain(
            'quick: this._quickSnapshot(),',
        );
        const restore = view.slice(view.indexOf('    restoreViewState(state) {'));
        const body = restore.slice(0, restore.indexOf('\n    }'));
        expect(body).toContain('this._adoptQuick(state.quick);');
        // Ahead of the wait for the first frame, like the other controls.
        expect(body.indexOf('this._adoptQuick(state.quick);')).toBeLessThan(
            body.indexOf('this._pendingViewState = state;'),
        );
    });

    it('takes the strip away on both ways out of a view', () => {
        expect(view.split('this._destroyQuick();').length - 1).toBe(2);
    });

    it('puts the stats card under the strip while it is open', () => {
        const el = document.createElement('div');
        const root = document.createElement('div');
        root.innerHTML = '<div class="stream-header"></div>';
        root.querySelector('.stream-header').getBoundingClientRect = () => ({
            height: 50,
            bottom: 50,
        });
        const v = Object.create(StreamView.prototype);
        Object.assign(v, { _overlayEl: el, _rootEl: root, _quickStrip: null });
        v._positionStatsOverlay();
        expect(el.style.top).toBe('60px');
        const strip = document.createElement('div');
        strip.getBoundingClientRect = () => ({ height: 96, bottom: 146 });
        v._quickStrip = strip;
        v._positionStatsOverlay();
        expect(el.style.top).toBe('156px');
        strip.hidden = true;
        v._positionStatsOverlay();
        expect(el.style.top).toBe('60px');
        // A card the viewer moved stays where they put it.
        strip.hidden = false;
        el.classList.add('user-moved');
        v._positionStatsOverlay();
        expect(el.style.top).toBe('60px');
    });

    /** The real clamp, on a 1920×1080 canvas in an area 1000 × 600. */
    function zoomed(zoom, panX, panY, typing = false) {
        const v = Object.create(StreamView.prototype);
        const canvasArea = document.createElement('div');
        canvasArea.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600 });
        const bar = document.createElement('div');
        if (typing) bar.classList.add('visible');
        Object.assign(v, {
            canvasArea,
            canvas: { width: 1920, height: 1080, style: {} },
            videoEl: null,
            _kbToolbar: bar,
            _displayEl: () => v.canvas,
            _videoIsDisplay: () => false,
            _seatPictureOnKbToolbar: () => {},
            _invalidateMediaRect: () => {},
            _placeClientCursor: () => {},
            _quickStrip: null,
            _zoom: zoom,
            _panX: panX,
            _panY: panY,
        });
        StreamViewTouch.prototype._applyZoomTransform.call(v);
        return v;
    }

    it('lets every edge of the zoomed picture come to the middle of the screen', () => {
        // ×2: 2000 × 1125 in 1000 × 600. Edge on edge: ±500, ±262.5.
        for (const [x, y, wantX, wantY] of [
            [9999, 0, 1000, 0],
            [-9999, 0, -1000, 0],
            [0, 9999, 0, 562.5],
            [0, -9999, 0, -562.5],
            [300, -200, 300, -200],
        ]) {
            const v = zoomed(2, x, y);
            expect(v._panX, `${x},${y}`).toBeCloseTo(wantX, 6);
            expect(v._panY, `${x},${y}`).toBeCloseTo(wantY, 6);
        }
        expect(zoomed(2, 300, -200).canvas.style.transform).toBe(
            'translate(300px, -200px) scale(2)',
        );
    });

    it('still holds the whole picture in the middle, and the picture on the special-keys bar', () => {
        const whole = zoomed(1, 400, -300);
        expect(whole._panX).toBeCloseTo(0, 6);
        expect(whole._panY).toBeCloseTo(0, 6);
        expect(whole.canvas.style.transform).toBe('');
        const typing = zoomed(2, 0, -9999, true);
        expect(typing._panY).toBeCloseTo(-262.5, 6);
    });

    /** A bar 1180 px wide: the mark, the Fullscreen button centred on 590, and the flow's buttons. */
    function bar(padLeft) {
        const root = document.createElement('div');
        root.innerHTML = `<div class="stream-header">
                <div class="stream-brand"></div>
                <button id="fs"></button>
                <div id="volume" style="position: absolute"></div>
                <button id="hidden"></button>
                <button id="pad"></button>
                <button id="quit"></button>
            </div>`;
        document.body.appendChild(root);
        const at = (el, left, width) => {
            el.getBoundingClientRect = () => ({
                left,
                right: left + width,
                width,
                height: width ? 30 : 0,
                top: 15,
                bottom: 45,
            });
        };
        const q = (id) => root.querySelector(id);
        at(q('.stream-header'), 0, 1180);
        at(q('.stream-brand'), 24, 300);
        at(q('#volume'), 480, 36);
        at(q('#hidden'), 0, 0);
        at(q('#pad'), padLeft, 38);
        at(q('#quit'), 951, 205);
        const fs = q('#fs');
        // 102 px wide; its transform takes it left of the middle by what it names.
        const moved = () => {
            const m = /- ([0-9.]+)px[)]/.exec(fs.style.transform || '');
            return m ? Number(m[1]) : 0;
        };
        fs.getBoundingClientRect = () => ({
            left: 539 - moved(),
            right: 641 - moved(),
            width: 102,
            height: 30,
            top: 15,
            bottom: 45,
        });
        const v = Object.create(StreamView.prototype);
        Object.assign(v, {
            _rootEl: root,
            _mobileFsBtn: fs,
            _gamingOverlay: null,
            _volumeCtl: null,
            _micBtn: null,
        });
        return { v, fs, root };
    }

    it('knows where the bar’s right-hand buttons begin', () => {
        // Not the mark, not the centred button, nothing out of the flow, nothing hidden.
        expect(bar(618).v._barFlowStart()).toBe(618);
        const empty = Object.create(StreamView.prototype);
        empty._rootEl = document.createElement('div');
        expect(empty._barFlowStart()).toBeNull();
        document.body.innerHTML = '';
    });

    it('moves the bar’s middle left where its right-hand buttons would meet it (a car’s screen)', () => {
        const { v, fs } = bar(618);
        v._positionGamingOverlay();
        // The button ended at 641: with the gap of 12, 35 px past the gamepad button.
        expect(fs.getBoundingClientRect().right).toBe(606);
        // With room to spare it stays in the middle, untouched.
        const wide = bar(700);
        wide.v._positionGamingOverlay();
        expect(wide.fs.style.transform).toBe('');
        expect(wide.fs.getBoundingClientRect().right).toBe(641);
        // And never further than the bar's own left edge allows.
        const tight = bar(40);
        tight.v._positionGamingOverlay();
        expect(tight.fs.getBoundingClientRect().left).toBe(12);
        document.body.innerHTML = '';
    });

    it('tells the strip the zoom each time it is applied', () => {
        const touch = source('ui', 'StreamViewTouch.js');
        const apply = touch.slice(touch.indexOf('    _applyZoomTransform() {'));
        const body = apply.slice(0, apply.indexOf('\n    }'));
        expect(body).toContain('panBounds({');
        expect(body).toContain('this._quickSyncZoom?.();');
    });
});

describe('another screen of the same PC, without stopping the stream', () => {
    const display = (id, n, more = {}) => ({
        id,
        name: `Display ${n}`,
        boxArt: false,
        device: { key: `display-${n}`, ...more },
    });
    const HOST = { uuid: 'host-1', backendType: 'native', displayName: 'PC' };
    let saved;
    let relaunch;
    let warn;

    beforeEach(() => {
        saved = {};
        for (const key of [
            '_lastStreamHost',
            '_lastStreamApp',
            'streamView',
            '_streamScreenApps',
            '_relaunching',
            '_standbyView',
            '_standbyLaunching',
            '_startupAborted',
            '_transportIndex',
        ])
            saved[key] = MoonlightApp[key];
        saved.overlay = MoonlightApp._nav.overlay;
        MoonlightApp._lastStreamHost = HOST;
        MoonlightApp._lastStreamApp = new App(display(11, 1), HOST.uuid);
        MoonlightApp.streamView = { _playerMode: false, hasActiveShare: () => false };
        MoonlightApp._streamScreenApps = null;
        MoonlightApp._relaunching = false;
        MoonlightApp._standbyView = null;
        MoonlightApp._standbyLaunching = false;
        MoonlightApp._startupAborted = false;
        MoonlightApp._transportIndex = 2;
        MoonlightApp._nav.overlay = 'streaming';
        relaunch = vi.spyOn(MoonlightApp, '_doRelaunchTransport').mockResolvedValue(null);
        vi.spyOn(MoonlightApp, '_noteLiveQuality').mockImplementation(() => {});
        vi.spyOn(MoonlightApp, '_onTransportFailed').mockImplementation(() => {});
        warn = vi.spyOn(Toast, 'warning').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        for (const [key, value] of Object.entries(saved)) {
            if (key === 'overlay') MoonlightApp._nav.overlay = value;
            else MoonlightApp[key] = value;
        }
    });

    const apps = (list) =>
        vi.spyOn(BackendClient, 'getAppList').mockResolvedValue({ status: 'ok', apps: list });

    it('tells a PC’s own screen from every other card', () => {
        const card = (data) => new App(data, HOST.uuid).isPcScreen;
        expect(card(display(11, 1))).toBe(true);
        expect(card(display(12, 2, { off: true }))).toBe(false);
        expect(
            card({ id: 1, name: 'Virtual', device: { key: 'moonlightweb-virtual-display' } }),
        ).toBe(false);
        expect(card({ id: 2, name: 'Sign in', device: { key: 'console-sign-in' } })).toBe(false);
        expect(card({ id: 3, name: 'Back', device: { key: 'remote-desktop-return' } })).toBe(false);
        expect(card({ id: 4, name: 'Steam', device: { key: 'launcher', screen: 'primary' } })).toBe(
            false,
        );
        expect(card({ id: 5, name: 'Big Picture', device: { key: 'gamescope-steam' } })).toBe(
            false,
        );
        // A GameStream host's app has no screen of its own to name.
        expect(card({ id: 6, name: 'Desktop' })).toBe(false);
    });

    it('offers the PC’s own screens, the one on screen marked, and nothing else', async () => {
        apps([
            display(11, 1),
            display(12, 2),
            display(13, 3, { off: true }),
            { id: 20, name: 'Virtual', device: { key: 'moonlightweb-virtual-display' } },
            { id: 21, name: 'Steam', device: { key: 'launcher', screen: 'primary' } },
        ]);
        const list = await MoonlightApp._streamScreens();
        expect(list.map((s) => [s.id, s.current])).toEqual([
            [11, true],
            [12, false],
        ]);
        // In the viewer's words, as on the cards.
        expect(list.every((s) => typeof s.name === 'string' && s.name.length > 0)).toBe(true);
    });

    it('offers none on another kind of host, to a guest, or from a screen made for the stream', async () => {
        const list = apps([display(11, 1), display(12, 2)]);
        MoonlightApp._lastStreamHost = { ...HOST, backendType: 'sunshine' };
        expect(await MoonlightApp._streamScreens()).toEqual([]);
        MoonlightApp._lastStreamHost = HOST;
        MoonlightApp.streamView = { _playerMode: true, hasActiveShare: () => false };
        expect(await MoonlightApp._streamScreens()).toEqual([]);
        MoonlightApp.streamView = { _playerMode: false, hasActiveShare: () => false };
        MoonlightApp._lastStreamApp = new App(
            { id: 20, name: 'Virtual', device: { key: 'moonlightweb-virtual-display' } },
            HOST.uuid,
        );
        expect(await MoonlightApp._streamScreens()).toEqual([]);
        // None of these even asked the PC.
        expect(list).not.toHaveBeenCalled();
    });

    it('offers none when the PC does not answer, or no longer lists the screen on screen', async () => {
        vi.spyOn(BackendClient, 'getAppList').mockRejectedValue(new Error('offline'));
        expect(await MoonlightApp._streamScreens()).toEqual([]);
        apps([display(12, 2), display(13, 3)]);
        expect(await MoonlightApp._streamScreens()).toEqual([]);
    });

    it('goes to the other screen the way a change of transport is made, on the same rung', async () => {
        apps([display(11, 1), display(12, 2)]);
        await MoonlightApp._streamScreens();
        const done = await MoonlightApp._switchStreamScreen(12);
        expect(done).toBe(true);
        expect(relaunch).toHaveBeenCalledTimes(1);
        const [index, host, app] = relaunch.mock.calls[0];
        expect([index, host, app.id]).toEqual([2, HOST, 12]);
        // What a later relaunch (quality, transport) starts again is that screen.
        expect(MoonlightApp._lastStreamApp.id).toBe(12);
        expect(MoonlightApp._relaunching).toBe(false);
        expect(MoonlightApp._onTransportFailed).not.toHaveBeenCalled();
    });

    it('holds every other relaunch off while the screen changes', async () => {
        apps([display(11, 1), display(12, 2)]);
        await MoonlightApp._streamScreens();
        let during = null;
        relaunch.mockImplementation(async () => {
            during = MoonlightApp._relaunching;
            return null;
        });
        await MoonlightApp._switchStreamScreen(12);
        expect(during).toBe(true);
    });

    it('brings back the screen that was showing when the other does not start', async () => {
        apps([display(11, 1), display(12, 2)]);
        await MoonlightApp._streamScreens();
        relaunch.mockResolvedValueOnce('launch_failed').mockResolvedValueOnce(null);
        await MoonlightApp._switchStreamScreen(12);
        expect(relaunch.mock.calls.map((c) => c[2].id)).toEqual([12, 11]);
        expect(MoonlightApp._lastStreamApp.id).toBe(11);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(MoonlightApp._onTransportFailed).not.toHaveBeenCalled();
    });

    it('leaves it to the stream’s own failure handling when neither starts', async () => {
        apps([display(11, 1), display(12, 2)]);
        await MoonlightApp._streamScreens();
        relaunch.mockResolvedValue('launch_failed');
        await MoonlightApp._switchStreamScreen(12);
        expect(relaunch).toHaveBeenCalledTimes(2);
        expect(MoonlightApp._lastStreamApp.id).toBe(11);
        expect(MoonlightApp._onTransportFailed).toHaveBeenCalledWith('launch_failed');
        expect(MoonlightApp._relaunching).toBe(false);
    });

    it('changes nothing while guests are on the stream, and says why', async () => {
        apps([display(11, 1), display(12, 2)]);
        await MoonlightApp._streamScreens();
        MoonlightApp.streamView = { _playerMode: false, hasActiveShare: () => true };
        expect(await MoonlightApp._switchStreamScreen(12)).toBe(false);
        expect(relaunch).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(MoonlightApp._lastStreamApp.id).toBe(11);
    });

    it('changes nothing for the screen on screen, an unknown one, or while a relaunch is on its way', async () => {
        apps([display(11, 1), display(12, 2)]);
        await MoonlightApp._streamScreens();
        expect(await MoonlightApp._switchStreamScreen(11)).toBe(false);
        expect(await MoonlightApp._switchStreamScreen(99)).toBe(false);
        MoonlightApp._relaunching = true;
        expect(await MoonlightApp._switchStreamScreen(12)).toBe(false);
        MoonlightApp._relaunching = false;
        MoonlightApp._standbyLaunching = true;
        expect(await MoonlightApp._switchStreamScreen(12)).toBe(false);
        MoonlightApp._standbyLaunching = false;
        MoonlightApp._nav.overlay = null;
        expect(await MoonlightApp._switchStreamScreen(12)).toBe(false);
        expect(relaunch).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
    });

    it('gives the view on screen the two calls the strip makes', () => {
        const wire = String(MoonlightApp._wireLiveView);
        expect(wire).toContain('sv.onQuickScreens = () => this._streamScreens();');
        expect(wire).toContain('sv.onQuickSwitchScreen = (id) => this._switchStreamScreen(id);');
    });
});
