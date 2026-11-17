/*
 * S3XYCast PC — an edition of MoonlightWeb. GPLv3, like the rest of the tree.
 *
 * Real full screen on an iPhone, said so that it is read.
 *
 * Safari on iPhone has no Fullscreen API for a page (only for a video, whose
 * player would take every touch): the stream can fill the page, never hide
 * Safari's bars. The one way to a screen without them is Apple's own — add the
 * page to the Home Screen and open it from its icon. Upstream said so in one
 * line that faded after four seconds, over a game that had just started; a
 * subscriber asked for "a real full screen mode for Safari" without ever
 * having seen it (17/11/2026).
 *
 * This is that line as a card: the reason in one sentence, the three taps, and
 * it stays until it is closed. "Don't show again" is kept for this browser.
 */
import { t } from '../i18n/i18n.js';

/** localStorage: '1' once the viewer asked not to be shown the guide again. */
export const FULLSCREEN_GUIDE_OFF_KEY = 's3x_fullscreen_guide_off';

/** The card on screen, or null. One at a time. */
let shown = null;

/** Whether this browser was told not to show the guide again. */
export function fullscreenGuideOff() {
    try {
        return window.localStorage.getItem(FULLSCREEN_GUIDE_OFF_KEY) === '1';
    } catch (_e) {
        // Storage refused (private mode): the guide is simply shown each time.
        return false;
    }
}

function rememberOff() {
    try {
        window.localStorage.setItem(FULLSCREEN_GUIDE_OFF_KEY, '1');
    } catch (_e) {
        /* nothing to keep it in */
    }
}

/** Safari's Share glyph, drawn here: a tray with an arrow leaving it. */
function shareGlyph() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'fs-guide-share');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M12 3v12M8 7l4-4 4 4M6 11H5v9h14v-9h-1');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.8');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    return svg;
}

function text(tag, className, content) {
    const el = document.createElement(tag);
    el.className = className;
    el.textContent = content;
    return el;
}

/** Take the card away, if it is there. */
export function closeFullscreenGuide() {
    if (!shown) return;
    shown.remove();
    shown = null;
}

/** Whether the card is on screen. */
export function fullscreenGuideShown() {
    return !!shown;
}

/**
 * Show the guide over the page. Returns true when the moment is taken care of
 * — the card is up, or the viewer asked not to see it again — and false only
 * when there is nowhere to put it, so that the caller can fall back.
 * @param {HTMLElement|null} [parent]
 */
export function showFullscreenGuide(parent = document.body) {
    if (!parent) return false;
    if (shown || fullscreenGuideOff()) return true;

    const card = document.createElement('div');
    card.className = 'fs-guide';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', t('stream.fsGuideTitle'));

    const box = document.createElement('div');
    box.className = 'fs-guide-box';
    box.appendChild(text('h2', 'fs-guide-title', t('stream.fsGuideTitle')));
    box.appendChild(text('p', 'fs-guide-why', t('stream.fsGuideWhy')));

    const steps = document.createElement('ol');
    steps.className = 'fs-guide-steps';
    const first = text('li', 'fs-guide-step', t('stream.fsGuideStep1'));
    first.appendChild(shareGlyph());
    steps.appendChild(first);
    steps.appendChild(text('li', 'fs-guide-step', t('stream.fsGuideStep2')));
    steps.appendChild(text('li', 'fs-guide-step', t('stream.fsGuideStep3')));
    box.appendChild(steps);
    box.appendChild(text('p', 'fs-guide-note', t('stream.fsGuideNote')));

    const actions = document.createElement('div');
    actions.className = 'fs-guide-actions';
    const never = text('button', 'fs-guide-never', t('stream.fsGuideNever'));
    never.type = 'button';
    never.addEventListener('click', (e) => {
        e.stopPropagation();
        rememberOff();
        closeFullscreenGuide();
    });
    const ok = text('button', 'fs-guide-ok', t('stream.fsGuideOk'));
    ok.type = 'button';
    ok.addEventListener('click', (e) => {
        e.stopPropagation();
        closeFullscreenGuide();
    });
    actions.appendChild(never);
    actions.appendChild(ok);
    box.appendChild(actions);

    card.appendChild(box);
    // A touch on the card is the card's: it never reaches the stream under it.
    for (const type of ['touchstart', 'touchmove', 'touchend', 'pointerdown', 'mousedown']) {
        card.addEventListener(type, (e) => e.stopPropagation());
    }
    parent.appendChild(card);
    shown = card;
    return true;
}
