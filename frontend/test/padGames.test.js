/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * The controller's settings, kept game by game (js/stream/PadGames.js).
 *
 * One game takes the controller as it is, the next wants it played as a
 * keyboard and a mouse with its own keys, and the joysticks do not belong in
 * the same places in both. A viewer names a game and what they set from then
 * on is that game's; the rest stays every game's. This holds the store: what
 * a game keeps, which game a card was last played as, and that nothing of it
 * leaks into the settings sent to the host.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    PAD_GAMES_KEY,
    PAD_GAMES_MAX,
    PAD_GAME_NAME_MAX,
    PadGames,
    padGameCard,
    padGameForStream,
    padGameKeys,
    padGameLook,
    padGameName,
    padGameSettings,
    storedStreamingSettings,
} from '../js/stream/PadGames.js';
import { padKbmSettings } from '../js/stream/PadKeyMouse.js';
import { touchPadLayouts } from '../js/stream/TouchPadState.js';

const keys = (over = {}) =>
    padGameKeys(padKbmSettings({ pad_kbm_mode: 'kbm', pad_kbm_sens: 1.5, ...over }));
const moved = {
    preset: 'default',
    landscape: { 'stick-left': { x: 0.2, y: 0.55, s: 1 } },
    portrait: {},
};
const look = (over = {}) =>
    padGameLook({ layout: moved, scale: 1.2, opacity: 0.7, style: 'ps', ...over });

beforeEach(() => {
    window.localStorage.clear();
});

describe('a game’s name', () => {
    it('is what was typed, without its stray spaces', () => {
        expect(padGameName('  ROB   RUN ')).toBe('ROB RUN');
        expect(padGameName('Forza\tHorizon\n5')).toBe('Forza Horizon 5');
    });

    it('is cut to a length the dialog shows', () => {
        const long = 'x'.repeat(PAD_GAME_NAME_MAX + 25);
        expect(padGameName(long)).toHaveLength(PAD_GAME_NAME_MAX);
        // Not left ending on the space the cut fell after.
        expect(padGameName('a'.repeat(PAD_GAME_NAME_MAX - 1) + ' bcd')).toBe(
            'a'.repeat(PAD_GAME_NAME_MAX - 1),
        );
    });

    it('is empty when nothing is left', () => {
        expect(padGameName('   ')).toBe('');
        expect(padGameName('')).toBe('');
        expect(padGameName(null)).toBe('');
        expect(padGameName(42)).toBe('');
    });
});

describe('the card a stream was opened from', () => {
    it('is the PC and the card’s own key', () => {
        expect(padGameCard({ uuid: 'pc-1' }, { id: 7, device: { key: 'host-app-rob' } })).toBe(
            'pc-1|host-app-rob',
        );
        // The same card on another PC is another card.
        expect(padGameCard({ uuid: 'pc-2' }, { id: 7, device: { key: 'host-app-rob' } })).toBe(
            'pc-2|host-app-rob',
        );
    });

    it('is the card’s number on a host that gives no key', () => {
        expect(padGameCard({ uuid: 'pc-1' }, { id: 7, device: null })).toBe('pc-1|id-7');
    });

    it('is nothing without a card', () => {
        expect(padGameCard(null, { id: 7 })).toBe('');
        expect(padGameCard({ uuid: 'pc-1' }, null)).toBe('');
        expect(padGameCard({ uuid: 'pc-1' }, { id: 0, device: null })).toBe('');
    });
});

describe('the games of this browser', () => {
    it('starts with none', () => {
        const games = new PadGames();
        expect(games.names()).toEqual([]);
        expect(games.of('pc-1|host-app-rob')).toBe('');
        expect(games.fields('ROB RUN')).toBeNull();
    });

    it('keeps a game’s keys and its controls’ places', () => {
        const games = new PadGames();
        expect(games.add(' ROB  RUN ', { ...keys(), ...look() })).toEqual({
            name: 'ROB RUN',
            existed: false,
        });
        expect(games.names()).toEqual(['ROB RUN']);
        const fields = games.fields('ROB RUN');
        expect(fields.pad_kbm_mode).toBe('kbm');
        expect(fields.pad_kbm_sens).toBe(1.5);
        expect(fields.touch_pad_scale).toBe(1.2);
        expect(fields.touch_pad_style).toBe('ps');
        expect(fields.touch_pad_layout).toEqual(touchPadLayouts(moved));
        // Read again by another object: it is in the store, not in memory.
        expect(new PadGames().fields('ROB RUN')).toEqual(fields);
    });

    it('keeps nothing else it is handed', () => {
        const games = new PadGames();
        games.add('ROB RUN', { ...keys(), bitrate: 50000, touch_pad_vibrate: false });
        expect(Object.keys(games.fields('ROB RUN')).sort()).toEqual([
            'pad_kbm_map',
            'pad_kbm_mode',
            'pad_kbm_sens',
        ]);
    });

    it('takes a name already there as that game, and replaces nothing of it', () => {
        const games = new PadGames();
        games.add('ROB RUN', keys({ pad_kbm_sens: 2 }));
        expect(games.add('rob run', keys({ pad_kbm_sens: 0.5 }))).toEqual({
            name: 'ROB RUN',
            existed: true,
        });
        expect(games.names()).toEqual(['ROB RUN']);
        expect(games.fields('ROB RUN').pad_kbm_sens).toBe(2);
        expect(games.find('  Rob Run')).toBe('ROB RUN');
        expect(games.find('Autre')).toBe('');
    });

    it('refuses a game with no name, and one more than it has room for', () => {
        const games = new PadGames();
        expect(games.add('   ', keys())).toBeNull();
        for (let i = 0; i < PAD_GAMES_MAX; i++) games.add('Jeu ' + i, keys());
        expect(games.names()).toHaveLength(PAD_GAMES_MAX);
        expect(games.add('Un de trop', keys())).toBeNull();
        expect(games.names()).toHaveLength(PAD_GAMES_MAX);
    });

    it('lists the games in an order that reads well', () => {
        const games = new PadGames();
        for (const name of ['Zelda-like', 'forza 10', 'Forza 9', 'apex']) games.add(name, keys());
        expect(games.names()).toEqual(['apex', 'Forza 9', 'forza 10', 'Zelda-like']);
    });

    it('changes part of a game and leaves the rest', () => {
        const games = new PadGames();
        games.add('ROB RUN', { ...keys(), ...look() });
        expect(games.update('ROB RUN', look({ scale: 0.9 }))).toBe(true);
        const fields = games.fields('ROB RUN');
        expect(fields.touch_pad_scale).toBe(0.9);
        expect(fields.pad_kbm_mode).toBe('kbm');
        expect(games.update('Inconnu', look())).toBe(false);
        expect(games.names()).toEqual(['ROB RUN']);
    });

    it('remembers which game a card was last played as', () => {
        const games = new PadGames();
        games.add('ROB RUN', keys());
        games.add('Forza', keys());
        games.choose('pc-1|screen', 'ROB RUN');
        games.choose('pc-1|host-app-forza', 'Forza');
        expect(new PadGames().of('pc-1|screen')).toBe('ROB RUN');
        expect(new PadGames().of('pc-1|host-app-forza')).toBe('Forza');
        expect(new PadGames().of('pc-1|other')).toBe('');
        // Back to every game's: the card is played as none.
        games.choose('pc-1|screen', '');
        expect(new PadGames().of('pc-1|screen')).toBe('');
        // A game that does not exist is not remembered.
        games.choose('pc-1|screen', 'Inconnu');
        expect(new PadGames().of('pc-1|screen')).toBe('');
    });

    it('forgets a game, and that any card was played as it', () => {
        const games = new PadGames();
        games.add('ROB RUN', keys());
        games.add('Forza', keys());
        games.choose('pc-1|screen', 'ROB RUN');
        games.choose('pc-1|big-picture', 'ROB RUN');
        games.choose('pc-1|host-app-forza', 'Forza');
        expect(games.remove('ROB RUN')).toBe(true);
        expect(games.names()).toEqual(['Forza']);
        expect(games.of('pc-1|screen')).toBe('');
        expect(games.of('pc-1|big-picture')).toBe('');
        expect(games.of('pc-1|host-app-forza')).toBe('Forza');
        expect(games.remove('ROB RUN')).toBe(false);
    });

    it('keeps both games when two windows each add one', () => {
        const first = new PadGames();
        const second = new PadGames();
        first.add('ROB RUN', keys());
        second.add('Forza', keys());
        expect(new PadGames().names()).toEqual(['Forza', 'ROB RUN']);
    });

    it('reads a store that is not what it wrote as no games', () => {
        for (const junk of ['not json', '[]', '"text"', '{"games":[1,2]}', '{"games":{"":{}}}']) {
            window.localStorage.setItem(PAD_GAMES_KEY, junk);
            const games = new PadGames();
            expect(games.names()).toEqual([]);
            expect(games.of('pc-1|screen')).toBe('');
        }
        // A card left pointing at a game that is gone is played as none.
        window.localStorage.setItem(
            PAD_GAMES_KEY,
            JSON.stringify({ games: { Forza: {} }, cards: { 'pc-1|screen': 'ROB RUN' } }),
        );
        expect(new PadGames().of('pc-1|screen')).toBe('');
    });

    it('lasts the page where the store cannot be written', () => {
        const refusing = {
            getItem: () => null,
            setItem: () => {
                throw new Error('QuotaExceededError');
            },
        };
        const games = new PadGames(refusing);
        expect(games.add('ROB RUN', keys())).toEqual({ name: 'ROB RUN', existed: false });
        games.choose('pc-1|screen', 'ROB RUN');
        expect(games.names()).toEqual(['ROB RUN']);
        expect(games.of('pc-1|screen')).toBe('ROB RUN');
        // And without a store at all.
        const none = new PadGames(null);
        expect(none.names()).toEqual([]);
        expect(none.add('Forza', keys())).toEqual({ name: 'Forza', existed: false });
        expect(none.names()).toEqual(['Forza']);
    });

    it('is kept apart from the settings sent to the host at each launch', () => {
        window.localStorage.setItem('mw-streaming-settings', JSON.stringify({ bitrate: 20000 }));
        const games = new PadGames();
        games.add('ROB RUN', { ...keys(), ...look() });
        games.choose('pc-1|screen', 'ROB RUN');
        expect(JSON.parse(window.localStorage.getItem('mw-streaming-settings'))).toEqual({
            bitrate: 20000,
        });
        expect(PAD_GAMES_KEY).not.toBe('mw-streaming-settings');
    });
});

describe('the controller a set of fields asks for', () => {
    const common = {
        pad_kbm_mode: 'pad',
        pad_kbm_sens: 1,
        touch_pad_scale: 1,
        touch_pad_opacity: 1,
        touch_pad_style: 'xbox',
        touch_pad_sticks: 'follow',
    };

    it('is every game’s when the game keeps nothing', () => {
        const { kbm, look: shown } = padGameSettings(common, null);
        expect(kbm.mode).toBe('pad');
        expect(kbm.sens).toBe(1);
        expect(shown.scale).toBe(1);
        expect(shown.style).toBe('xbox');
        expect(shown.layout).toEqual(touchPadLayouts(undefined));
    });

    it('is the game’s where the game keeps something', () => {
        const { kbm, look: shown } = padGameSettings(common, { ...keys(), ...look() });
        expect(kbm.mode).toBe('kbm');
        expect(kbm.sens).toBe(1.5);
        expect(shown).toEqual({
            layout: touchPadLayouts(moved),
            scale: 1.2,
            opacity: 0.7,
            style: 'ps',
        });
    });

    it('falls back on every game’s for what a game does not keep', () => {
        const { kbm, look: shown } = padGameSettings(
            { ...common, touch_pad_scale: 1.3, pad_kbm_mode: 'kbm' },
            look({ scale: 0.9 }),
        );
        expect(kbm.mode).toBe('kbm');
        expect(shown.scale).toBe(0.9);
    });

    it('corrects what a store holds that the controller cannot be', () => {
        const { kbm, look: shown } = padGameSettings(common, {
            pad_kbm_mode: 'joystick',
            pad_kbm_sens: 99,
            touch_pad_scale: 12,
            touch_pad_style: 'gamecube',
        });
        expect(kbm.mode).toBe('pad');
        expect(kbm.sens).toBe(1);
        expect(shown.scale).toBe(1);
        expect(shown.style).toBe('xbox');
    });

    it('reads the stream’s own settings as this browser keeps them', () => {
        expect(storedStreamingSettings()).toEqual({});
        window.localStorage.setItem('mw-streaming-settings', JSON.stringify(common));
        expect(storedStreamingSettings()).toEqual(common);
        window.localStorage.setItem('mw-streaming-settings', '[1,2]');
        expect(storedStreamingSettings()).toEqual({});
        window.localStorage.setItem('mw-streaming-settings', 'not json');
        expect(storedStreamingSettings()).toEqual({});
    });
});

describe('what a stream about to start plays its controller with', () => {
    const pc = { uuid: 'pc-1' };
    const screen = { id: 3, name: 'Display 1', isHostApp: false, device: { key: 'screen-a' } };
    const robRun = { id: 9, name: ' ROB RUN ', isHostApp: true, device: { key: 'host-app-rob' } };

    it('is every game’s for a card played as none', () => {
        expect(padGameForStream(pc, screen)).toEqual({
            card: 'pc-1|screen-a',
            name: '',
            suggested: '',
            fields: null,
        });
    });

    it('offers the card’s own name when the card is one of the PC’s apps', () => {
        expect(padGameForStream(pc, robRun).suggested).toBe('ROB RUN');
        // A screen shows the whole desktop: its name is no game's.
        expect(padGameForStream(pc, screen).suggested).toBe('');
    });

    it('is the game the card was last played as', () => {
        const games = new PadGames();
        games.add('ROB RUN', { ...keys(), ...look() });
        games.choose('pc-1|screen-a', 'ROB RUN');
        const found = padGameForStream(pc, screen);
        expect(found.name).toBe('ROB RUN');
        expect(found.fields.pad_kbm_mode).toBe('kbm');
        expect(found.fields.touch_pad_scale).toBe(1.2);
        // Another card of the same PC is still every game's.
        expect(padGameForStream(pc, robRun).name).toBe('');
    });

    it('is nothing for a stream without a card (a guest’s)', () => {
        expect(padGameForStream(null, screen)).toBeNull();
        expect(padGameForStream(pc, null)).toBeNull();
    });
});
