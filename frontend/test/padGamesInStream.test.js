/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * The controller's settings game by game, in a stream.
 *
 * The dialog the controller's button opens says first whose settings it
 * shows: every game's, or a game the viewer named. Choosing a game puts its
 * mode, its keys and its controls' places on the stream at once; what is
 * changed afterwards is kept for that game and no longer for the others; and
 * the card remembers the game for its next stream.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../js/i18n/i18n.js', () => ({
    t: (key, params) => (params && params.name ? `${key}(${params.name})` : key),
    getLanguage: () => 'en',
}));

import { PadKeyMouseDialog } from '../js/ui/PadKeyMouseDialog.js';
import { StreamViewTouchPad } from '../js/ui/StreamViewTouchPad.js';
import { StreamViewPadKbm, STREAMING_SETTINGS_KEY } from '../js/ui/StreamViewPadKbm.js';
import { padKbmSettings } from '../js/stream/PadKeyMouse.js';
import { PAD_GAMES_MAX, PadGames } from '../js/stream/PadGames.js';
import { touchPadLayouts } from '../js/stream/TouchPadState.js';

const here = dirname(fileURLToPath(import.meta.url));
const source = (...path) => readFileSync(join(here, '..', 'js', ...path), 'utf8');
const moved = {
    preset: 'default',
    landscape: { 'stick-left': { x: 0.2, y: 0.55, s: 1 } },
    portrait: {},
};
const stored = () => JSON.parse(window.localStorage.getItem(STREAMING_SETTINGS_KEY) || '{}');
const gameSelect = () => document.querySelector('.pad-kbm-game-select');
const choices = () => [...gameSelect().options].map((o) => o.textContent);
function pick(value) {
    const select = gameSelect();
    select.value = value;
    select.dispatchEvent(new Event('change'));
}

beforeEach(() => {
    window.localStorage.clear();
});

describe('the dialog’s list of games', () => {
    let dialog;
    const state = (current, names = ['Forza', 'ROB RUN']) => ({
        names,
        current,
        settings: padKbmSettings({ pad_kbm_mode: current ? 'kbm' : 'pad', pad_kbm_sens: 2 }),
    });
    afterEach(() => {
        if (dialog) dialog.close();
        dialog = null;
    });

    it('is not on the settings page, whose settings are every game’s', () => {
        dialog = new PadKeyMouseDialog({ settings: padKbmSettings() });
        dialog.open();
        expect(document.querySelector('.pad-kbm-game')).toBeNull();
    });

    it('comes first in a stream, and says whose settings these are', () => {
        dialog = new PadKeyMouseDialog({
            settings: padKbmSettings(),
            games: { names: ['Forza', 'ROB RUN'], current: '', suggested: '' },
        });
        dialog.open();
        const scroll = document.querySelector('.pad-kbm-scroll');
        expect(scroll.firstElementChild.classList.contains('pad-kbm-game')).toBe(true);
        expect(choices()).toEqual(['padKbm.gameAll', 'Forza', 'ROB RUN', 'padKbm.gameNew']);
        expect(gameSelect().value).toBe('all');
        expect(document.querySelector('.pad-kbm-game-hint').textContent).toBe('padKbm.gameHintAll');
        // Neither question is asked before it is called for.
        expect(document.querySelector('.pad-kbm-game-new').hidden).toBe(true);
        expect(document.querySelector('.pad-kbm-game-ask').hidden).toBe(true);
    });

    it('offers to delete the game in play, and only that one', () => {
        dialog = new PadKeyMouseDialog({
            settings: padKbmSettings(),
            games: { names: ['Forza', 'ROB RUN'], current: 'ROB RUN', suggested: '' },
        });
        dialog.open();
        expect(choices()).toEqual([
            'padKbm.gameAll',
            'Forza',
            'ROB RUN',
            'padKbm.gameNew',
            'padKbm.gameDelete(ROB RUN)',
        ]);
        expect(gameSelect().value).toBe('game:ROB RUN');
        expect(document.querySelector('.pad-kbm-game-hint').textContent).toBe('padKbm.gameHintOne');
    });

    it('does not offer one game more than there is room for', () => {
        const names = Array.from({ length: PAD_GAMES_MAX }, (_, i) => 'Jeu ' + i);
        dialog = new PadKeyMouseDialog({
            settings: padKbmSettings(),
            games: { names, current: '', suggested: '' },
        });
        dialog.open();
        expect(choices()).not.toContain('padKbm.gameNew');
    });

    it('shows a chosen game’s settings in every field, and tells no change back', () => {
        const onChange = vi.fn();
        const onGame = vi.fn((name) => state(name));
        dialog = new PadKeyMouseDialog({
            settings: padKbmSettings(),
            games: { names: ['Forza', 'ROB RUN'], current: '', suggested: '' },
            onGame,
            onChange,
        });
        dialog.open();
        pick('game:ROB RUN');
        expect(onGame).toHaveBeenCalledWith('ROB RUN');
        expect(gameSelect().value).toBe('game:ROB RUN');
        expect(document.querySelector('.pad-kbm-mode.is-on').dataset.mode).toBe('kbm');
        expect(document.querySelector('.pad-kbm-range').value).toBe('200');
        expect(dialog.settings.mode).toBe('kbm');
        // Read, not set: the stream is not told to keep what it just gave.
        expect(onChange).not.toHaveBeenCalled();
        // Back to every game's.
        pick('all');
        expect(onGame).toHaveBeenLastCalledWith('');
        expect(document.querySelector('.pad-kbm-mode.is-on').dataset.mode).toBe('pad');
    });

    it('asks a new game’s name in the row below, with the card’s own offered', () => {
        const onNewGame = vi.fn((typed) =>
            typed.trim() ? state(typed.trim(), [typed.trim()]) : null,
        );
        dialog = new PadKeyMouseDialog({
            settings: padKbmSettings(),
            games: { names: [], current: '', suggested: 'ROB RUN' },
            onNewGame,
        });
        dialog.open();
        pick('new');
        const form = document.querySelector('.pad-kbm-game-new');
        const input = document.querySelector('.pad-kbm-game-name');
        expect(form.hidden).toBe(false);
        expect(input.value).toBe('ROB RUN');
        expect(document.activeElement).toBe(input);
        // The list is back on what is in play while the question is asked.
        expect(gameSelect().value).toBe('all');
        // No name: the question stays.
        input.value = '   ';
        form.dispatchEvent(new Event('submit', { cancelable: true }));
        expect(form.hidden).toBe(false);
        input.value = 'ROB RUN';
        form.dispatchEvent(new Event('submit', { cancelable: true }));
        expect(onNewGame).toHaveBeenLastCalledWith('ROB RUN');
        expect(form.hidden).toBe(true);
        expect(gameSelect().value).toBe('game:ROB RUN');
    });

    it('does not offer a name that is already a game’s', () => {
        dialog = new PadKeyMouseDialog({
            settings: padKbmSettings(),
            games: { names: ['ROB RUN'], current: '', suggested: 'ROB RUN' },
        });
        dialog.open();
        pick('new');
        expect(document.querySelector('.pad-kbm-game-name').value).toBe('');
    });

    it('lets the question be dropped', () => {
        const onNewGame = vi.fn();
        dialog = new PadKeyMouseDialog({
            settings: padKbmSettings(),
            games: { names: ['Forza'], current: 'Forza', suggested: '' },
            onNewGame,
        });
        dialog.open();
        pick('new');
        document.querySelector('.pad-kbm-game-cancel').click();
        expect(document.querySelector('.pad-kbm-game-new').hidden).toBe(true);
        expect(gameSelect().value).toBe('game:Forza');
        expect(onNewGame).not.toHaveBeenCalled();
    });

    it('deletes a game only once asked twice', () => {
        const onDeleteGame = vi.fn(() => state('', ['Forza']));
        dialog = new PadKeyMouseDialog({
            settings: padKbmSettings({ pad_kbm_mode: 'kbm' }),
            games: { names: ['Forza', 'ROB RUN'], current: 'ROB RUN', suggested: '' },
            onDeleteGame,
        });
        dialog.open();
        pick('delete');
        const ask = document.querySelector('.pad-kbm-game-ask');
        expect(ask.hidden).toBe(false);
        expect(document.querySelector('.pad-kbm-game-question').textContent).toBe(
            'padKbm.gameDeleteAsk(ROB RUN)',
        );
        expect(onDeleteGame).not.toHaveBeenCalled();
        // "Cancel" keeps it.
        document.querySelector('.pad-kbm-game-keep').click();
        expect(ask.hidden).toBe(true);
        expect(gameSelect().value).toBe('game:ROB RUN');
        expect(onDeleteGame).not.toHaveBeenCalled();
        // Asked again, and answered yes.
        pick('delete');
        document.querySelector('.pad-kbm-game-delete').click();
        expect(onDeleteGame).toHaveBeenCalledWith('ROB RUN');
        expect(ask.hidden).toBe(true);
        expect(choices()).toEqual(['padKbm.gameAll', 'Forza', 'padKbm.gameNew']);
        expect(gameSelect().value).toBe('all');
    });

    it('keeps what is typed in it away from the game', () => {
        // The stream sends every keystroke to the host, except from a text
        // field or from inside this dialog (StreamView.isLocalKeyboardTarget).
        const guard = source('ui', 'StreamView.js');
        expect(guard).toMatch(/isLocalKeyboardTarget[\s\S]{0,600}'input, textarea, select/);
        expect(guard).toMatch(/isLocalKeyboardTarget[\s\S]{0,700}'\.pad-kbm-overlay'/);
    });
});

describe('a stream whose viewer keeps settings game by game', () => {
    let view;
    let pad;

    function makeView(fields = {}) {
        const root = document.createElement('div');
        root.innerHTML = '<div class="stream-canvas-area"></div>';
        document.body.appendChild(root);
        const proto = {};
        for (const Mixin of [StreamViewTouchPad, StreamViewPadKbm]) {
            for (const name of Object.getOwnPropertyNames(Mixin.prototype)) {
                if (name === 'constructor') continue;
                Object.defineProperty(
                    proto,
                    name,
                    Object.getOwnPropertyDescriptor(Mixin.prototype, name),
                );
            }
        }
        const made = Object.create(proto);
        Object.assign(made, {
            _rootEl: root,
            _playerMode: false,
            _gamepadAllowed: false,
            _touchPadPrefs: { mode: 'always', scale: 1, opacity: 1, style: 'xbox' },
            _padKbmPrefs: padKbmSettings({ pad_kbm_mode: 'pad' }),
            _padKbmBtn: null,
            _touchPadView: pad,
            _padGame: { card: 'pc-1|screen-a', name: '', suggested: '' },
            _holdPads: vi.fn(),
            _releasePads: vi.fn(),
            ...fields,
        });
        return made;
    }

    beforeEach(() => {
        window.localStorage.setItem(
            STREAMING_SETTINGS_KEY,
            JSON.stringify({ bitrate: 20000, pad_kbm_mode: 'pad', touch_pad_scale: 1 }),
        );
        pad = {
            setLayout: vi.fn(),
            setLook: vi.fn(),
            isVisible: () => true,
            toggleRect: () => null,
        };
        view = makeView();
    });
    afterEach(() => {
        view._destroyPadKbm();
        view._rootEl.remove();
    });

    it('keeps a change for every game while no game is in play', () => {
        view._setPadKbm(padKbmSettings({ pad_kbm_mode: 'kbm' }));
        view._setPadLook({ layout: moved, scale: 1.3, opacity: 0.6, style: 'ps' });
        expect(stored().pad_kbm_mode).toBe('kbm');
        expect(stored().touch_pad_scale).toBe(1.3);
        expect(new PadGames().names()).toEqual([]);
    });

    it('starts a new game as the controller is, and plays it from then on', () => {
        view._setPadKbm(padKbmSettings({ pad_kbm_mode: 'kbm', pad_kbm_sens: 1.5 }));
        view._setPadLook({ layout: moved, scale: 1.3, opacity: 0.6, style: 'ps' });
        const state = view._addPadGame('  ROB  RUN ');
        expect(state.current).toBe('ROB RUN');
        expect(state.names).toEqual(['ROB RUN']);
        expect(state.settings.mode).toBe('kbm');
        expect(view._padGameName()).toBe('ROB RUN');
        const kept = new PadGames().fields('ROB RUN');
        expect(kept.pad_kbm_mode).toBe('kbm');
        expect(kept.pad_kbm_sens).toBe(1.5);
        expect(kept.touch_pad_scale).toBe(1.3);
        expect(kept.touch_pad_style).toBe('ps');
        expect(kept.touch_pad_layout).toEqual(touchPadLayouts(moved));
        // The card's next stream starts as this game.
        expect(new PadGames().of('pc-1|screen-a')).toBe('ROB RUN');
    });

    it('refuses a game with no name', () => {
        expect(view._addPadGame('   ')).toBeNull();
        expect(view._padGameName()).toBe('');
        expect(new PadGames().names()).toEqual([]);
    });

    it('keeps what is changed in a game for that game, and no longer for the others', () => {
        view._addPadGame('ROB RUN');
        view._setPadKbm(padKbmSettings({ pad_kbm_mode: 'kbm', pad_kbm_sens: 2 }));
        view._setPadLook({ layout: moved, scale: 0.9, opacity: 0.5, style: 'ps' });
        const kept = new PadGames().fields('ROB RUN');
        expect(kept.pad_kbm_mode).toBe('kbm');
        expect(kept.pad_kbm_sens).toBe(2);
        expect(kept.touch_pad_scale).toBe(0.9);
        // Every game's settings are as they were, and so is the rest of the store.
        expect(stored()).toEqual({ bitrate: 20000, pad_kbm_mode: 'pad', touch_pad_scale: 1 });
    });

    it('puts a chosen game’s settings on the stream at once, and changes neither set', () => {
        new PadGames().add('Forza', {
            pad_kbm_mode: 'kbm',
            pad_kbm_sens: 0.5,
            touch_pad_layout: touchPadLayouts(moved),
            touch_pad_scale: 1.4,
            touch_pad_opacity: 0.4,
            touch_pad_style: 'ps',
        });
        const before = window.localStorage.getItem('s3x_pad_games');
        const state = view._choosePadGame('Forza');
        expect(state.current).toBe('Forza');
        expect(state.settings.mode).toBe('kbm');
        expect(state.settings.sens).toBe(0.5);
        expect(view._padKbmSettings().mode).toBe('kbm');
        expect(pad.setLayout).toHaveBeenLastCalledWith(touchPadLayouts(moved));
        expect(pad.setLook).toHaveBeenCalledWith({ scale: 1.4, opacity: 0.4, style: 'ps' });
        expect(new PadGames().of('pc-1|screen-a')).toBe('Forza');
        // Only the card's game was written: the game's own settings are untouched.
        expect(JSON.parse(window.localStorage.getItem('s3x_pad_games')).games).toEqual(
            JSON.parse(before).games,
        );
        expect(stored()).toEqual({ bitrate: 20000, pad_kbm_mode: 'pad', touch_pad_scale: 1 });

        // And back to every game's.
        const all = view._choosePadGame('');
        expect(all.current).toBe('');
        expect(view._padKbmSettings().mode).toBe('pad');
        expect(pad.setLook).toHaveBeenLastCalledWith({ scale: 1, opacity: 1, style: 'xbox' });
        expect(new PadGames().of('pc-1|screen-a')).toBe('');
    });

    it('takes a name already there as that game, as it was left', () => {
        new PadGames().add('Forza', { pad_kbm_mode: 'kbm', pad_kbm_sens: 0.5 });
        view._setPadKbm(padKbmSettings({ pad_kbm_mode: 'pad', pad_kbm_sens: 3 }));
        const state = view._addPadGame('forza');
        expect(state.current).toBe('Forza');
        expect(state.names).toEqual(['Forza']);
        expect(state.settings.sens).toBe(0.5);
        expect(new PadGames().fields('Forza').pad_kbm_sens).toBe(0.5);
    });

    it('goes back to every game’s when the game in play is deleted', () => {
        view._addPadGame('ROB RUN');
        view._setPadKbm(padKbmSettings({ pad_kbm_mode: 'kbm' }));
        const state = view._removePadGame('ROB RUN');
        expect(state.current).toBe('');
        expect(state.names).toEqual([]);
        expect(view._padGameName()).toBe('');
        expect(view._padKbmSettings().mode).toBe('pad');
        expect(new PadGames().of('pc-1|screen-a')).toBe('');
    });

    it('hands the dialog its games, and takes its three asks', () => {
        new PadGames().add('Forza', { pad_kbm_mode: 'kbm' });
        view._openPadKbmDialog();
        expect(choices()).toEqual(['padKbm.gameAll', 'Forza', 'padKbm.gameNew']);
        pick('game:Forza');
        expect(view._padGameName()).toBe('Forza');
        expect(document.querySelector('.pad-kbm-mode.is-on').dataset.mode).toBe('kbm');
        // A change made in the dialog now is the game's.
        document.querySelector('.pad-kbm-mode[data-mode="pad"]').click();
        expect(new PadGames().fields('Forza').pad_kbm_mode).toBe('pad');
        expect(stored().pad_kbm_mode).toBe('pad');
        view._padKbmDialog.close();
    });

    it('has no games for a guest, nor for a stream without a card', () => {
        const guest = makeView({ _padGame: null, _padKbmPrefs: padKbmSettings() });
        guest._openPadKbmDialog();
        expect(document.querySelector('.pad-kbm-game')).toBeNull();
        expect(guest._addPadGame('ROB RUN')).toBeNull();
        expect(guest._choosePadGame('ROB RUN')).toBeNull();
        expect(guest._removePadGame('ROB RUN')).toBeNull();
        expect(guest._padGameSnapshot()).toBeNull();
        guest._setPadKbm(padKbmSettings({ pad_kbm_mode: 'kbm' }));
        expect(stored().pad_kbm_mode).toBe('kbm');
        guest._destroyPadKbm();
        guest._rootEl.remove();
    });

    it('carries the game to the view that replaces this one', () => {
        view._addPadGame('ROB RUN');
        view._setPadLook({ layout: moved, scale: 1.3, opacity: 0.6, style: 'ps' });
        const snapshot = view._padGameSnapshot();
        expect(snapshot.name).toBe('ROB RUN');
        // Another screen of the PC: another card, the same game going on.
        const next = makeView({ _padGame: { card: 'pc-1|screen-b', name: '', suggested: '' } });
        next._adoptPadGame(snapshot);
        expect(next._padGameName()).toBe('ROB RUN');
        expect(pad.setLook).toHaveBeenLastCalledWith({ scale: 1.3, opacity: 0.6, style: 'ps' });
        // Adopted, not chosen: the other card's own game is not rewritten.
        expect(new PadGames().of('pc-1|screen-b')).toBe('');
        // What is changed next is still the game's.
        next._setPadKbm(padKbmSettings({ pad_kbm_mode: 'kbm', pad_kbm_sens: 2.5 }));
        expect(new PadGames().fields('ROB RUN').pad_kbm_sens).toBe(2.5);
        next._destroyPadKbm();
        next._rootEl.remove();
    });
});

describe('the launch', () => {
    const app = source('app.js');
    const view = source('ui', 'StreamView.js');

    it('reads the card’s game, and plays its settings over every game’s', () => {
        expect(app).toMatch(
            /const padGame =\s*viewOpts\.playerMode === true \? null : padGameForStream\(host, this\._lastStreamApp\);/,
        );
        expect(app).toMatch(/\? \{ \.\.\.streamingSettings, \.\.\.padGame\.fields \}/);
        expect(app).toContain('touchPad: viewOpts.touchPad || touchPadSettings(padSettings),');
        expect(app).toContain('padKbm: padKbmSettings(padSettings),');
        expect(app).toMatch(/padGame: padGame\s*\? \{ card: padGame\.card, name: padGame\.name/);
    });

    it('gives the view its own copy, and passes it on to the next', () => {
        expect(view).toContain('this._padGame = opts.padGame ? { ...opts.padGame } : null;');
        expect(view).toContain('padGame: this._padGameSnapshot(),');
        // Before the keys: the game they are saved under has to be known first.
        expect(view).toMatch(
            /this\._adoptPadGame\(state\.padGame\);\s*this\._adoptPadKbm\(state\.padKbm\);/,
        );
    });

    it('sends none of it to the host', () => {
        // The stream's settings go whole to the host at each launch; the games
        // have a store of their own.
        expect(source('stream', 'PadGames.js')).toContain("PAD_GAMES_KEY = 's3x_pad_games'");
        expect(app).not.toMatch(/s3x_pad_games/);
    });
});
