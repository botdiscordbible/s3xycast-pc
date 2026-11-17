/*
 * S3XYCast PC — an edition of MoonlightWeb. GPLv3, like the rest of the tree.
 *
 * CarScreen — a car's screen, away from the PC: Auto goes light.
 *
 * A subscriber's first long stream from his car (17/11/2026, 26 minutes) asked
 * what Auto asks of any computer screen: the PC's 1080 lines, 11 Mbit/s. The
 * PC took 7 ms a frame. The car's mobile link did not hold the rate: the host
 * cut and raised its bitrate about fifty times between 3 and 11 Mbit/s, each
 * overshoot a queue the picture waits in, and the link froze twelve times for
 * a third of a second or more. "on peut opti le delais latence?" — the delay
 * was on the road, not in the PC.
 *
 * So Auto treats a car's screen away from the PC's own network the way
 * upstream treats a TV (TV_AUTO_MAX_HEIGHT, "latency first"): a ceiling on the
 * lines it asks for. 800 lines — a 1918×1200 car screen asks for a 1278×800
 * box, a 16:9 PC fills it at 720p — and the automatic bitrate follows the
 * size, 6 Mbit/s where it was 11 (util/AutoBitrate.js): under what the link
 * held most of the time, where the old figure sat above it.
 *
 * Only what was left to us. "Match my screen", a custom size and a bitrate set
 * by hand are the viewer's and are not touched; and on the PC's own network
 * (the car in the garage, on Wi-Fi) Auto stays what it is for a computer.
 *
 * What a car is, here: a browser that says it is a Linux computer and has a
 * touch screen. A car's browser carries no mark of its own (a plain Chrome on
 * "X11; Linux x86_64", seen in that subscriber's car), so this is a guess —
 * right for a car, and for the odd Linux touch laptop on the road, which
 * loses nothing it cannot ask back by name.
 */
import { IS_HANDHELD, IS_TV } from './BrowserDetect.js';
import { AUTO_MAX_HEIGHT } from './StreamResolution.js';

/** Auto's ceiling on a car's screen away from the PC's network: 800 lines. */
export const CAR_AUTO_MAX_HEIGHT = 800;

/** A finger has been on this page: said once, kept while the page lives. */
let touchSeen = false;
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener(
        'touchstart',
        () => {
            touchSeen = true;
        },
        { capture: true, passive: true, once: true },
    );
}

/**
 * Whether what a browser says of itself is what a car's says: a Linux
 * computer — neither a phone, a tablet nor a TV, neither Android nor ChromeOS —
 * with a touch screen, known from the browser's own count or from a finger
 * that has been on the page. The older cars' browsers say their name, and are
 * taken at their word.
 * @param {{ ua?: string, maxTouchPoints?: number, touchSeen?: boolean,
 *           handheld?: boolean, tv?: boolean }} env
 * @returns {boolean}
 */
export function isCarScreen({ ua, maxTouchPoints, touchSeen: seen, handheld, tv }) {
    if (handheld || tv) return false;
    const agent = typeof ua === 'string' ? ua : '';
    if (/\bTesla(Browser)?\/|QtCarBrowser/i.test(agent)) return true;
    if (!/\bLinux\b/i.test(agent) || /Android|CrOS/i.test(agent)) return false;
    return maxTouchPoints > 0 || seen === true;
}

/**
 * Whether this page is on a car's screen away from the PC's network — where
 * Auto goes light. Asked at each launch: the touch screen may only have been
 * told by the finger that started it.
 * @param {boolean} lan the host sees this browser on its own network
 * @param {{ nav?: Navigator }} [env] replace the live source (tests)
 * @returns {boolean}
 */
export function carScreenAway(lan, { nav = navigator } = {}) {
    if (lan === true) return false;
    return isCarScreen({
        ua: nav.userAgent || '',
        maxTouchPoints: nav.maxTouchPoints,
        touchSeen,
        handheld: IS_HANDHELD,
        tv: IS_TV,
    });
}

/**
 * The ceiling Auto works under: a computer's (@p maxHeight, from the pixel
 * budget — none is AUTO_MAX_HEIGHT), brought down to a car's when this is one.
 * Never raised: a ceiling already under the car's stays.
 * @param {number|undefined} maxHeight
 * @param {boolean} car carScreenAway()'s answer
 * @returns {number|undefined}
 */
export function carAutoMaxHeight(maxHeight, car) {
    if (!car) return maxHeight;
    const usual = maxHeight > 0 ? maxHeight : AUTO_MAX_HEIGHT;
    return Math.min(usual, CAR_AUTO_MAX_HEIGHT);
}
