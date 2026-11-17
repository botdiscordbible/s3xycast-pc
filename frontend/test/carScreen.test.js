/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * A car's screen, away from the PC: Auto goes light (js/util/CarScreen.js).
 *
 * A subscriber's first long stream from his car asked for the PC's 1080
 * lines at 11 Mbit/s over a mobile link that did not hold it: the delay he
 * asked about was the queue each overshoot left, not the PC (7 ms a frame).
 * Auto now treats a car's screen away from the PC's network as upstream
 * treats a TV — a ceiling on the lines, latency first — and the automatic
 * bitrate follows the size. This holds what a car is taken to be, what the
 * ceiling comes to, and that nothing the viewer named is touched.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
    CAR_AUTO_MAX_HEIGHT,
    carAutoMaxHeight,
    carScreenAway,
    isCarScreen,
} from '../js/util/CarScreen.js';
import {
    AUTO_MAX_HEIGHT,
    AUTO_RAISED_MAX_HEIGHT,
    TV_AUTO_MAX_HEIGHT,
    bitrateReference,
    resolveStreamSize,
    virtualDisplaySize,
} from '../js/util/StreamResolution.js';
import { computeAutoBitrate } from '../js/util/AutoBitrate.js';

const here = dirname(fileURLToPath(import.meta.url));
const source = (...path) => readFileSync(join(here, '..', ...path), 'utf8');

/** What that subscriber's car says of itself (seen 04/11/2026): no mark of its own. */
const CAR =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';
const WINDOWS =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';
const ANDROID =
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36';
const CHROMEBOOK =
    'Mozilla/5.0 (X11; CrOS x86_64 16000.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';
/** The car's own screen: 959×600 CSS pixels at twice the density. */
const carPanel = { width: 1918, height: 1200 };

describe('what is taken for a car’s screen', () => {
    it('is a Linux computer with a touch screen', () => {
        expect(isCarScreen({ ua: CAR, maxTouchPoints: 10 })).toBe(true);
    });

    it('is one whose touch screen only a finger has told of', () => {
        expect(isCarScreen({ ua: CAR, maxTouchPoints: 0, touchSeen: true })).toBe(true);
        expect(isCarScreen({ ua: CAR, touchSeen: true })).toBe(true);
    });

    it('is not a Linux computer with a mouse and no touch screen', () => {
        expect(isCarScreen({ ua: CAR, maxTouchPoints: 0, touchSeen: false })).toBe(false);
        expect(isCarScreen({ ua: CAR })).toBe(false);
    });

    it('is no other kind of computer, touch screen or not', () => {
        expect(isCarScreen({ ua: WINDOWS, maxTouchPoints: 10, touchSeen: true })).toBe(false);
        expect(isCarScreen({ ua: CHROMEBOOK, maxTouchPoints: 10 })).toBe(false);
        expect(
            isCarScreen({
                ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.5 Safari/605.1.15',
                maxTouchPoints: 5,
            }),
        ).toBe(false);
    });

    it('is neither a phone, a tablet nor a TV, which have their own rules', () => {
        expect(isCarScreen({ ua: ANDROID, maxTouchPoints: 5 })).toBe(false);
        expect(isCarScreen({ ua: CAR, maxTouchPoints: 10, handheld: true })).toBe(false);
        expect(isCarScreen({ ua: CAR, maxTouchPoints: 10, tv: true })).toBe(false);
    });

    it('takes the older cars’ browsers at their word', () => {
        expect(
            isCarScreen({
                ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36 TeslaBrowser/113.0.5672.126',
            }),
        ).toBe(true);
        expect(
            isCarScreen({
                ua: 'Mozilla/5.0 (X11; GNU/Linux) AppleWebKit/537.36 (KHTML, like Gecko) Chromium/88.0.4324.150 Chrome/88.0.4324.150 Safari/537.36 Tesla/2022.44.30',
            }),
        ).toBe(true);
        expect(
            isCarScreen({ ua: 'Mozilla/5.0 (X11; Linux) AppleWebKit/534.34 QtCarBrowser' }),
        ).toBe(true);
    });

    it('answers no where a browser says nothing', () => {
        expect(isCarScreen({})).toBe(false);
        expect(isCarScreen({ ua: null, maxTouchPoints: 10 })).toBe(false);
    });
});

describe('a car’s screen away from the PC', () => {
    const touchCar = { userAgent: CAR, maxTouchPoints: 10 };
    const silentCar = { userAgent: CAR, maxTouchPoints: 0 };

    it('is never one on the PC’s own network: the car in the garage, on Wi-Fi', () => {
        expect(carScreenAway(true, { nav: touchCar })).toBe(false);
    });

    it('is one over the Internet, and where the PC does not say', () => {
        expect(carScreenAway(false, { nav: touchCar })).toBe(true);
        expect(carScreenAway(undefined, { nav: touchCar })).toBe(true);
        expect(carScreenAway(false, { nav: { userAgent: WINDOWS, maxTouchPoints: 10 } })).toBe(
            false,
        );
    });

    it('learns of a touch screen the browser does not count from the first finger', () => {
        // Kept last: once a finger has been on the page it has, for good.
        expect(carScreenAway(false, { nav: silentCar })).toBe(false);
        window.dispatchEvent(new Event('touchstart'));
        expect(carScreenAway(false, { nav: silentCar })).toBe(true);
        // Still not on the PC's own network, and still not for another kind.
        expect(carScreenAway(true, { nav: silentCar })).toBe(false);
        expect(carScreenAway(false, { nav: { userAgent: WINDOWS, maxTouchPoints: 0 } })).toBe(
            false,
        );
    });
});

describe('the ceiling Auto works under', () => {
    it('is a computer’s where this is no car', () => {
        expect(carAutoMaxHeight(undefined, false)).toBeUndefined();
        expect(carAutoMaxHeight(AUTO_MAX_HEIGHT, false)).toBe(AUTO_MAX_HEIGHT);
        expect(carAutoMaxHeight(AUTO_RAISED_MAX_HEIGHT, false)).toBe(AUTO_RAISED_MAX_HEIGHT);
    });

    it('is 800 lines in a car, whatever the machine could hold', () => {
        expect(CAR_AUTO_MAX_HEIGHT).toBe(800);
        expect(carAutoMaxHeight(undefined, true)).toBe(800);
        expect(carAutoMaxHeight(AUTO_MAX_HEIGHT, true)).toBe(800);
        expect(carAutoMaxHeight(AUTO_RAISED_MAX_HEIGHT, true)).toBe(800);
    });

    it('is never raised by it', () => {
        expect(carAutoMaxHeight(TV_AUTO_MAX_HEIGHT, true)).toBe(TV_AUTO_MAX_HEIGHT);
    });

    it('sits between a TV’s and a computer’s', () => {
        expect(CAR_AUTO_MAX_HEIGHT).toBeGreaterThan(TV_AUTO_MAX_HEIGHT);
        expect(CAR_AUTO_MAX_HEIGHT).toBeLessThan(AUTO_MAX_HEIGHT);
    });
});

describe('what a launch asks for from a car', () => {
    const auto = { mode: 'auto' };
    const native = (autoMaxHeight) => ({ nativeHost: true, device: carPanel, autoMaxHeight });
    const light = carAutoMaxHeight(AUTO_MAX_HEIGHT, true);
    const usual = carAutoMaxHeight(AUTO_MAX_HEIGHT, false);

    it('was the whole screen, at 11 Mbit/s', () => {
        const size = resolveStreamSize(auto, native(usual));
        expect(size.height).toBe(1200);
        expect(size.aspect).toBe('1918:1200');
        expect(computeAutoBitrate(1200, '1918:1200', false, false, false)).toBe(11);
    });

    it('is now a box of 800 lines the PC’s picture is fitted into, at 6 Mbit/s', () => {
        const size = resolveStreamSize(auto, native(light));
        expect(size.height).toBe(800);
        expect(size.aspect).toBe('1278:800');
        // The PC's own shape inside the box, never upscaled: 720p for a 16:9 PC.
        expect(size.fitBox).toBe(true);
        expect(size.allowUpscale).toBe(false);
        expect(computeAutoBitrate(800, '1278:800', false, false, false)).toBe(6);
        // And what a 16:9 PC really sends in that box.
        expect(computeAutoBitrate(718, '1278:718', false, false, false)).toBe(6);
    });

    it('counts its automatic bitrate on that box, on the settings page too', () => {
        expect(bitrateReference(auto, carPanel, false, false, light)).toEqual({
            height: 800,
            aspect: '1278:800',
        });
        expect(bitrateReference(auto, carPanel, false, false, usual)).toEqual({
            height: 1200,
            aspect: '1918:1200',
        });
    });

    it('makes the screen made for the stream at that size', () => {
        expect(virtualDisplaySize(auto, carPanel, false, light)).toEqual({
            width: 1278,
            height: 800,
        });
    });

    it('leaves a size the viewer named as named', () => {
        const mine = resolveStreamSize({ mode: 'device' }, native(light));
        expect(mine.height).toBe(1200);
        expect(mine.aspect).toBe('1918:1200');
        const typed = resolveStreamSize(
            { mode: 'custom', customWidth: 1920, customHeight: 1080 },
            native(light),
        );
        expect(typed.height).toBe(1080);
        expect(typed.aspect).toBe('1920:1080');
        expect(resolveStreamSize({ mode: 'fixed', height: 1080 }, native(light)).height).toBe(1080);
    });

    it('leaves a PC smaller than the box as it is', () => {
        const small = resolveStreamSize(auto, {
            nativeHost: true,
            device: { width: 1280, height: 720 },
            autoMaxHeight: light,
        });
        expect(small.height).toBe(720);
        expect(small.aspect).toBe('1280:720');
    });
});

describe('where the rule is asked', () => {
    const app = source('js', 'app.js');
    const settings = source('js', 'ui', 'SettingsView.js');

    it('is at every place a launch takes Auto’s ceiling', () => {
        // The launch, its trial under a budget, and a change of this screen.
        expect(app.match(/sizeAt\(this\._autoMaxHeight\(/g)).toHaveLength(3);
        expect(app).not.toMatch(/sizeAt\(autoMaxHeightFor\(/);
        expect(app).toMatch(
            /_autoMaxHeight\(budget\) \{\s*const car = carScreenAway\(this\._viewerOnLan === true\);/,
        );
        expect(app).toContain('return carAutoMaxHeight(autoMaxHeightFor(budget), car);');
    });

    it('is on the settings page, which shows the bitrate a launch will get', () => {
        expect(settings).toContain(
            'carAutoMaxHeight(autoMaxHeightFor(budget), this._onCarScreenAway()),',
        );
        expect(settings).toContain("return carScreenAway(this._viewerPath === 'lan');");
        expect(settings).toContain("? 'settings.resolutionAutoDescCar'");
    });

    it('is said in the four languages, with this screen’s size', () => {
        for (const lang of ['en', 'fr', 'tr', 'zh']) {
            const words = JSON.parse(source('locales', lang + '.json'));
            const said = words.settings.resolutionAutoDescCar;
            expect(said).toContain('800');
            expect(said).toContain('{{size}}');
        }
    });
});
