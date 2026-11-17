import { StreamViewKeyboard } from '../ui/StreamViewKeyboard.js';
import { StreamViewTouch } from '../ui/StreamViewTouch.js';
import { StreamViewTouchPad } from '../ui/StreamViewTouchPad.js';
import { StreamViewFullscreen } from '../ui/StreamViewFullscreen.js';
// S3XYCast PC: the controllers played as a keyboard and a mouse.
import { StreamViewPadKbm } from '../ui/StreamViewPadKbm.js';
import { PadKeyMouse } from '../stream/PadKeyMouse.js';
import { PadKeyMouseDialog } from '../ui/PadKeyMouseDialog.js';
// S3XYCast PC: the stream's quick actions (keys, screens, zoom).
import { StreamViewQuick } from '../ui/StreamViewQuick.js';

/**
 * `StreamView` is assembled at runtime: the bottom of StreamView.js copies the
 * keyboard, touch and fullscreen prototypes onto `StreamView.prototype`. The
 * mixin methods declare `@this {StreamView}`, so this merge is what closes the
 * loop in both directions — it tells the checker the instance really does carry
 * that surface.
 *
 * State owned by a mixin is declared here too: it is only ever assigned from a
 * mixin method, whose `this` is a StreamView, so there is no assignment for the
 * checker to infer the property from.
 */
declare module '../ui/StreamView.js' {
    interface StreamView
        extends
            StreamViewKeyboard,
            StreamViewTouch,
            StreamViewTouchPad,
            StreamViewPadKbm,
            StreamViewQuick,
            StreamViewFullscreen {
        /**
         * Latched toolbar modifiers on the mobile soft keyboard. The index
         * signature is load-bearing: `_setMod`/`_resetMods` address entries
         * through `Object.keys()`.
         */
        _heldMods: {
            ctrl?: boolean;
            shift?: boolean;
            alt?: boolean;
            meta?: boolean;
            [name: string]: boolean;
        };

        /** Fired once when the first decoded frame reaches the canvas. */
        onFirstFrame: (() => void) | null;
        /** Fired when the user initiates a quit, before teardown starts. */
        onQuitStart: (() => void) | null;
        /** Fired on every individual congestion hint (IDR/PLI/drops). */
        onCongestionSignal: (() => void) | null;
        /** The on-screen controller: its parts, and what the viewer last decided. */
        _touchPadBtn: HTMLElement | null;
        _touchPadHandle: HTMLElement | null;
        _touchPadState: any;
        _touchPadView: any;
        _touchPadShown: boolean;
        _touchPadYields: boolean;
        _touchPadStarted: boolean;
        _touchPadStartQueued: boolean;
        _touchPadCarry: { plugged: boolean; shown: boolean; yields: boolean } | null;
        _touchPadKbdTimer: ReturnType<typeof setTimeout> | null;
        _stopTouchWatch: (() => void) | null;
        /** S3XYCast PC — the controllers as a keyboard and a mouse (StreamViewPadKbm). */
        _padKbm: PadKeyMouse | null;
        _padKbmPrefs: { mode: string; sens: number; map: Record<string, string> } | null;
        _padKbmBtn: HTMLButtonElement | null;
        _padKbmDialog: PadKeyMouseDialog | null;
        /** S3XYCast PC — the stream's quick actions (StreamViewQuick). */
        _quickBtn: HTMLButtonElement | null;
        _quickStrip: HTMLElement | null;
        _quickBadge: HTMLButtonElement | null;
        /** "Move the picture" is on: a finger on the picture moves it. */
        _quickMoveOn: boolean;
        /** Where the fingers (or the held mouse) were at the last move. */
        _quickMoveLast: { count: number; x: number; y: number; spread: number } | null;
        _quickMouseHeld: boolean;
        /** The mode ended under the fingers: the rest of that gesture is dropped. */
        _quickMoveTail: boolean;
        /** A replaced view's state, kept until this one's strip is mounted. */
        _quickCarry: { open?: boolean; move?: boolean } | null;
        /** What re-lays the bar's middle out when the bar changes. */
        _quickBarChildren: MutationObserver | null;
        _quickBarWidth: ResizeObserver | null;
        _quickBarFrame: number;
        _quickMoveTouch: ((e: TouchEvent) => void) | null;
        _quickMoveMouse: ((e: MouseEvent) => void) | null;
        /** Set by the application: the PC's screens this stream may go to. */
        onQuickScreens:
            | (() => Promise<Array<{ id: number; name: string; current: boolean }>>)
            | null;
        /** Set by the application: go to that screen. False when it refused. */
        onQuickSwitchScreen: ((id: number) => Promise<boolean>) | null;
        /** Suppress the one-shot gesture-hint slide on the next activation. */
        _suppressShortcutsSlide: boolean;
    }
}
