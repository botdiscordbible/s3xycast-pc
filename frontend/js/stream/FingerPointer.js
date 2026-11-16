/*
 * S3XYCast PC — an edition of MoonlightWeb. GPLv3, like the rest of the tree.
 *
 * Whose pointer it is, where the browser is neither a phone nor a tablet: a
 * mouse's, or a finger's.
 *
 * A phone or a tablet has no pointer of its own, so the stream draws the
 * host's for it and moves it from the finger (StreamView,
 * MOBILE_CURSOR_CLIENT_DRAWN). Every other browser was taken for a computer:
 * its mouse has an arrow, the page left the pointer to that arrow and told the
 * host to keep its own out of the picture. A touch screen behind a desktop's
 * user agent fell between the two. The owner's Tesla did (16/11/2026): its
 * browser says "X11; Linux x86_64" and nothing else, his fingers moved and
 * clicked the host's pointer 390 times in one session, and no pointer was
 * drawn anywhere to see them by — "touch does nothing, I do not even see the
 * cursor". An Android tablet asked for the desktop site, a kiosk, a
 * touchscreen laptop whose owner reaches for the screen are the same case.
 *
 * Nothing in the user agent tells such a screen from a computer, and what a
 * browser says of its pointing devices is a guess: a Surface with its
 * trackpad answered that it had no fine pointer (BrowserDetect,
 * supportsGamingMode). The device in use is not a guess. The pointer belongs
 * to whichever of the two was used last: a finger on the stream takes it, and
 * the page draws it from then on; a mouse that really moves, or presses, takes
 * it back, and its own arrow is the pointer again.
 */

/**
 * How far a mouse must travel, in CSS pixels, to take the pointer back. A
 * mouse at rest on the table a finger taps trembles by a pixel, and a browser
 * re-sends a still mouse's position when the page moves under it.
 */
export const MOUSE_TRAVEL_PX = 4;

/**
 * How long after the last finger left a mouse is still not listened to: what
 * a browser makes up after a tap, it makes up at once.
 */
export const AFTER_TOUCH_MS = 500;

/** The device of the last press on this page: 'touch', 'mouse', '' before any. */
let lastKind = '';

/**
 * A press was made with this device. A pen, or a browser that does not say,
 * changes nothing.
 * @param {string} pointerType  a pointer event's: 'mouse', 'touch' or 'pen'
 */
export function notePointerKind(pointerType) {
    if (pointerType === 'touch' || pointerType === 'mouse') lastKind = pointerType;
}

/**
 * The device the viewer last pressed with on this page — how they got to the
 * stream, since a stream is started by a press: 'touch', 'mouse', or '' when
 * nothing was pressed (a stream started by a link, a remote or a pad).
 * @returns {string}
 */
export function lastPointerKind() {
    return lastKind;
}

/** Forget it (tests). */
export function forgetPointerKind() {
    lastKind = '';
}

/**
 * Note the device of every press on `win`, from now on. Pointer events name
 * their device; a touch event is a finger by definition and has the last word,
 * for a browser whose pointer events call a finger a mouse.
 * @param {Window} win
 * @returns {() => void} what stops it
 */
export function watchPointerKind(win) {
    if (!win || !win.addEventListener) return () => {};
    const onPointer = (e) => notePointerKind(e.pointerType);
    const onTouch = () => notePointerKind('touch');
    const how = { capture: true, passive: true };
    win.addEventListener('pointerdown', onPointer, how);
    win.addEventListener('touchstart', onTouch, how);
    return () => {
        win.removeEventListener('pointerdown', onPointer, how);
        win.removeEventListener('touchstart', onTouch, how);
    };
}

// From the page's first moment, well before any stream: the press that starts
// one is the best evidence there is of what the viewer holds.
if (typeof window !== 'undefined') watchPointerKind(window);

/**
 * Whether a finger holds the pointer as a stream starts: the device of the
 * last press when there was one, and otherwise what the browser says of
 * itself — a touch screen and nothing else to point with.
 * @param {{kind?: string, touchOnly?: boolean}} [known]
 * @returns {boolean}
 */
export function fingerStarts({ kind = lastPointerKind(), touchOnly = false } = {}) {
    if (kind === 'touch') return true;
    if (kind === 'mouse') return false;
    return touchOnly === true;
}

export class FingerPointer {
    /**
     * @param {{always?: boolean, never?: boolean, start?: boolean}} [how]
     *   always: a phone or a tablet — the finger's, whatever happens.
     *   never: a television — its remote's, whatever happens.
     *   start: elsewhere, whether a finger holds it as the stream starts
     *          (fingerStarts).
     */
    constructor({ always = false, never = false, start = false } = {}) {
        this._always = always === true;
        this._never = !this._always && never === true;
        this._finger = this._always || (!this._never && start === true);
        // Fingers on the glass right now, and when the last one left.
        this._down = false;
        this._liftedAt = -Infinity;
        // Where the mouse was last seen at rest, to measure its travel from.
        this._mouseAt = null;
    }

    /** Whether the finger holds the pointer for good (a phone, a tablet). */
    always() {
        return this._always;
    }

    /** Whether the pointer is the finger's right now: the page draws it. */
    on() {
        return this._finger;
    }

    /**
     * A finger came down on the stream.
     * @returns {boolean} whether the pointer has just changed hands
     */
    touched() {
        this._down = true;
        this._mouseAt = null;
        if (this._always || this._never || this._finger) return false;
        this._finger = true;
        return true;
    }

    /**
     * The last finger left the stream.
     * @param {number} now  ms, any monotonic clock
     */
    lifted(now) {
        this._down = false;
        this._liftedAt = now;
    }

    /** Whether a mouse is not listened to: a finger is down, or barely gone. */
    _fingerBusy(now) {
        return this._down || now - this._liftedAt < AFTER_TOUCH_MS;
    }

    /**
     * A mouse moved over the stream, to (x, y) in CSS pixels.
     * @returns {boolean} whether the pointer has just changed hands
     */
    mouseMoved(x, y, now) {
        if (this._always || this._never) return false;
        if (this._fingerBusy(now)) {
            this._mouseAt = null;
            return false;
        }
        // The first sighting is a place, not a move.
        if (!this._mouseAt) {
            this._mouseAt = { x, y };
            return false;
        }
        if (Math.hypot(x - this._mouseAt.x, y - this._mouseAt.y) < MOUSE_TRAVEL_PX) return false;
        this._mouseAt = { x, y };
        return this._toMouse();
    }

    /**
     * A mouse button went down on the stream: no tremble presses a button.
     * @returns {boolean} whether the pointer has just changed hands
     */
    mousePressed(now) {
        if (this._always || this._never || this._fingerBusy(now)) return false;
        return this._toMouse();
    }

    _toMouse() {
        if (!this._finger) return false;
        this._finger = false;
        return true;
    }
}
