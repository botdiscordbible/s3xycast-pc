/*
 * S3XYCast PC — an edition of MoonlightWeb. GPLv3, like the rest of the tree.
 *
 * What the page says when a screen does not open.
 *
 * The program answers a failed launch with a sentence of its own, in English
 * and in its own words: "That display is no longer connected", "Failed to spawn
 * stream worker", or whatever its engine last said to itself. MoonlightWeb shows
 * that sentence as it is. Its users read English and know what a transport is;
 * this edition's subscriber reads it from a car's screen and takes it for a
 * breakdown (the owner, 17/11/2026, copied one out letter by letter).
 *
 * The sentences that do come up are said in the page's language, in plain
 * words, with what to do. Any other keeps its text — it is what support will
 * ask for — behind a sentence that says what happened.
 */
import { t } from '../i18n/i18n.js';

/**
 * The program's sentences that are known, and the catalogue key that says
 * each one in plain words. Matched on their start: the program appends a
 * reason to some of them.
 */
const KNOWN = [
    // A card opened from a list that was painted before the PC's screens
    // changed (a monitor unplugged, Remote Desktop coming or going).
    { says: /^That display is no longer connected\b/i, key: 'launch.displayGone' },
    // Nothing reached the PC, or nothing came back: the link, not the PC.
    { says: /^(All transport modes failed|No usable transport)\b/i, key: 'launch.noRoute' },
    // The PC answered and could not start its side.
    { says: /^Failed to spawn stream worker\b/i, key: 'launch.pcCouldNotStart' },
    { says: /^Native streaming is not available on this machine\b/i, key: 'launch.noScreenNow' },
];

/**
 * The text to show for a launch that failed with `message`.
 * @param {string|undefined|null} message  the program's own sentence, if any
 * @returns {string}
 */
export function launchErrorText(message) {
    const said = typeof message === 'string' ? message.trim() : '';
    if (!said) return t('launch.failed');
    for (const { says, key } of KNOWN) if (says.test(said)) return t(key);
    return t('launch.failedDetail', { detail: said });
}
