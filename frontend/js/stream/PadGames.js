/*
 * S3XYCast PC — an edition of MoonlightWeb. GPLv3, like the rest of the tree.
 *
 * PadGames — the controller's settings, kept game by game.
 *
 * One game wants the controller as it is, the next wants it played as a
 * keyboard and a mouse with its own keys, and thumbs do not rest in the same
 * places in a racing game and in a shooter. Until now there was one set for
 * everything, and changing game meant setting it all again.
 *
 * So a viewer can name a game — in the dialog the controller's button opens in
 * a stream — and from then on what they set there is that game's: the mode,
 * the mouse stick's speed, the key under each control, and where the on-screen
 * joysticks and buttons sit and how they look. Everything else stays
 * "every game's", which is the set the settings page shows.
 *
 * The program cannot see which game is on the screen (a card may be the whole
 * desktop), so the game is the viewer's to say; what is remembered is which
 * game each card was last played as, so the next stream of that card starts
 * with it. A card that is one of the PC's apps offers its own name.
 *
 * Kept in this browser, beside the stream's settings and apart from them:
 * those are sent whole to the host at each launch, which has no use for this.
 */
import { padKbmFields, padKbmSettings } from './PadKeyMouse.js';
import { touchPadLayouts, touchPadSettings } from './TouchPadState.js';

/** Where it is kept on this device. */
export const PAD_GAMES_KEY = 's3x_pad_games';

/** Where the stream's own settings are kept (app.js, StreamViewPadKbm.js). */
const STREAMING_SETTINGS_KEY = 'mw-streaming-settings';

/** More games than anyone sets up; a bound on what one browser keeps. */
export const PAD_GAMES_MAX = 40;

/** A name that still fits the dialog on a phone. */
export const PAD_GAME_NAME_MAX = 40;

/** The fields a game keeps, by the names the stream's settings use. */
const KBM_FIELDS = ['pad_kbm_mode', 'pad_kbm_sens', 'pad_kbm_map'];
const LOOK_FIELDS = ['touch_pad_layout', 'touch_pad_scale', 'touch_pad_opacity', 'touch_pad_style'];

/**
 * A game's name as it is kept: what was typed without its stray spaces, cut to
 * a length the dialog shows. Empty when nothing is left.
 * @param {unknown} text
 * @returns {string}
 */
export function padGameName(text) {
    if (typeof text !== 'string') return '';
    // Control characters would break the list's lines; the rest is the viewer's.
    const clean = text
        .replace(/\p{Cc}/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return clean.slice(0, PAD_GAME_NAME_MAX).trim();
}

/** The same game, however it was typed. */
function sameGame(a, b) {
    return a.toLocaleLowerCase() === b.toLocaleLowerCase();
}

/**
 * The card a stream was opened from, as one string: the PC, and the card's own
 * key where it has one (a native host's), its number otherwise.
 * @param {{ uuid?: string }|null} host
 * @param {{ id?: number, device?: { key?: string }|null }|null} app
 * @returns {string} empty when there is no card to speak of
 */
export function padGameCard(host, app) {
    if (!host || !app) return '';
    const key = app.device && typeof app.device.key === 'string' ? app.device.key : '';
    const card = key || (app.id ? 'id-' + app.id : '');
    return card ? `${host.uuid || ''}|${card}` : '';
}

/**
 * What a game keeps of the controller's keys.
 * @param {{ mode: string, sens: number, map: Record<string, string> }} settings
 */
export function padGameKeys(settings) {
    return padKbmFields(settings);
}

/**
 * What a game keeps of the on-screen controls.
 * @param {{ layout: object, scale: number, opacity: number, style: string }} look
 */
export function padGameLook({ layout, scale, opacity, style }) {
    return {
        touch_pad_layout: touchPadLayouts(layout),
        touch_pad_scale: scale,
        touch_pad_opacity: opacity,
        touch_pad_style: style,
    };
}

/**
 * The controller as a set of fields asks for it, over the stream's own
 * settings: the keys, and the on-screen controls' places and look.
 * @param {object} common the stream's settings ("every game's")
 * @param {object|null} fields a game's, or null for every game's
 */
export function padGameSettings(common, fields) {
    const source = { ...(common || {}), ...(fields || {}) };
    const pad = touchPadSettings(source);
    return {
        kbm: padKbmSettings(source),
        look: { layout: pad.layout, scale: pad.scale, opacity: pad.opacity, style: pad.style },
    };
}

/** The stream's own settings as this browser keeps them, or nothing. */
export function storedStreamingSettings(storage = defaultStorage()) {
    try {
        const stored = storage && storage.getItem(STREAMING_SETTINGS_KEY);
        const data = stored ? JSON.parse(stored) : {};
        return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch {
        return {};
    }
}

function defaultStorage() {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
        // A browser that refuses the store outright (some private modes).
        return null;
    }
}

function isRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Only the fields a game keeps, whatever else the store was handed. */
function gameFields(source) {
    /** @type {Record<string, unknown>} */
    const fields = {};
    if (!isRecord(source)) return fields;
    for (const name of [...KBM_FIELDS, ...LOOK_FIELDS]) {
        if (source[name] !== undefined) fields[name] = source[name];
    }
    return fields;
}

/**
 * The games of this browser. Every change reads the store first, so two
 * windows that each add a game keep both.
 */
export class PadGames {
    /** @param {Storage|null} [storage] */
    constructor(storage = defaultStorage()) {
        this._storage = storage;
        // What this object set while the store could not be written (a private
        // window): it lasts as long as the page does.
        this._memory = null;
    }

    /** @returns {{ games: Record<string, object>, cards: Record<string, string> }} */
    _read() {
        if (this._memory) return this._memory;
        /** @type {{ games: Record<string, object>, cards: Record<string, string> }} */
        const data = { games: {}, cards: {} };
        try {
            const stored = this._storage && this._storage.getItem(PAD_GAMES_KEY);
            const parsed = stored ? JSON.parse(stored) : null;
            if (!isRecord(parsed)) return data;
            if (isRecord(parsed.games)) {
                for (const [typed, fields] of Object.entries(parsed.games)) {
                    const name = padGameName(typed);
                    if (!name || !isRecord(fields)) continue;
                    if (Object.keys(data.games).length >= PAD_GAMES_MAX) break;
                    data.games[name] = gameFields(fields);
                }
            }
            if (isRecord(parsed.cards)) {
                for (const [card, name] of Object.entries(parsed.cards)) {
                    if (typeof name === 'string' && data.games[name]) data.cards[card] = name;
                }
            }
        } catch {
            // Not ours to read, or not what we wrote: no games.
        }
        return data;
    }

    _write(data) {
        try {
            this._storage.setItem(PAD_GAMES_KEY, JSON.stringify({ v: 1, ...data }));
            this._memory = null;
        } catch {
            this._memory = data;
        }
    }

    /** The games' names, in the order a list reads well. */
    names() {
        return Object.keys(this._read().games).sort((a, b) =>
            a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }),
        );
    }

    /** The name a game is kept under, however it is typed; empty when there is none. */
    find(typed) {
        const name = padGameName(typed);
        if (!name) return '';
        return Object.keys(this._read().games).find((kept) => sameGame(kept, name)) || '';
    }

    /** What a game keeps, or null when there is no such game. */
    fields(name) {
        const games = this._read().games;
        return Object.prototype.hasOwnProperty.call(games, name) ? { ...games[name] } : null;
    }

    /** The game a card was last played as; empty for "every game". */
    of(card) {
        if (!card) return '';
        const data = this._read();
        const name = data.cards[card];
        return typeof name === 'string' && data.games[name] ? name : '';
    }

    /** Remember the game a card is played as ('' : every game's set again). */
    choose(card, name) {
        if (!card) return;
        const data = this._read();
        if (name && data.games[name]) data.cards[card] = name;
        else delete data.cards[card];
        this._write(data);
    }

    /**
     * A new game, starting from @p fields. A name already there is that game:
     * nothing of it is replaced.
     * @param {string} typed
     * @param {object} fields
     * @returns {{ name: string, existed: boolean }|null} null when the name is
     *   empty or there is no room left
     */
    add(typed, fields) {
        const name = padGameName(typed);
        if (!name) return null;
        const data = this._read();
        const kept = Object.keys(data.games).find((game) => sameGame(game, name));
        if (kept) return { name: kept, existed: true };
        if (Object.keys(data.games).length >= PAD_GAMES_MAX) return null;
        data.games[name] = gameFields(fields);
        this._write(data);
        return { name, existed: false };
    }

    /** Keep more of a game's settings; the rest of them is left as it was. */
    update(name, fields) {
        const data = this._read();
        if (!data.games[name]) return false;
        data.games[name] = { ...data.games[name], ...gameFields(fields) };
        this._write(data);
        return true;
    }

    /** Forget a game, and that any card was played as it. */
    remove(name) {
        const data = this._read();
        if (!data.games[name]) return false;
        delete data.games[name];
        for (const [card, game] of Object.entries(data.cards)) {
            if (game === name) delete data.cards[card];
        }
        this._write(data);
        return true;
    }
}

/**
 * What a stream about to start plays its controller with.
 * @param {{ uuid?: string }|null} host
 * @param {{ id?: number, name?: string, isHostApp?: boolean, device?: object|null }|null} app
 * @param {Storage|null} [storage]
 * @returns {{ card: string, name: string, suggested: string, fields: object|null }|null}
 *   null when the stream has no card (a guest's)
 */
export function padGameForStream(host, app, storage = defaultStorage()) {
    const card = padGameCard(host, app);
    if (!card) return null;
    const games = new PadGames(storage);
    const name = games.of(card);
    return {
        card,
        name,
        // One of the PC's apps is most likely the game itself; a screen is not.
        suggested: app.isHostApp === true ? padGameName(app.name) : '',
        fields: name ? games.fields(name) : null,
    };
}
