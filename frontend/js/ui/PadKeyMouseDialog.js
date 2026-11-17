/*
 * S3XYCast PC — an edition of MoonlightWeb. GPLv3, like the rest of the tree.
 *
 * PadKeyMouseDialog — what the controllers are for the host, and their keys.
 *
 * One dialog for the two places it is asked from: the settings page, and the
 * on-screen controller in a stream, where a viewer finds out that a game does
 * not answer to a pad. Two big choices at the top, then what only the second
 * one needs: how fast the mouse stick is, and the key under each control.
 *
 * The two are named for what the player wants, not for how it is done:
 * "Normal", and "Works in every game". The first owner to try it found
 * "keyboard and mouse" an odd thing to pick to make a controller work
 * (15/11/2026), and he was right: the keyboard is the means, said in the
 * line under the choice.
 *
 * Every change is told at once (`onChange`): in a stream it takes effect while
 * the dialog is still up, so a key can be tried without closing it.
 */
import { t } from '../i18n/i18n.js';
import { escapeHtml } from '../util/escapeHtml.js';
import {
    PAD_KBM_ACTIONS,
    PAD_KBM_BUTTONS,
    PAD_KBM_DEFAULT_MAP,
    PAD_KBM_ROLES,
    PAD_KBM_SENS_MAX,
    PAD_KBM_SENS_MIN,
    PAD_KBM_STICKS,
    padKbmLabel,
    padKbmMap,
} from '../stream/PadKeyMouse.js';
import { PAD_GAMES_MAX, PAD_GAME_NAME_MAX } from '../stream/PadGames.js';

/** The game list's entries that are not games (a game's is its name, prefixed). */
const GAME_ALL = 'all';
const GAME_NEW = 'new';
const GAME_DELETE = 'delete';
const GAME_PREFIX = 'game:';

/** The order the groups of a button's choices come in. */
const GROUPS = ['mouse', 'keys', 'digits', 'letters', 'functions'];

/** The cross's arms, as the on-screen controller draws them. */
const ARROWS = { up: '▲', right: '▶', down: '▼', left: '◀' };

/** A control's name beside its choice. */
function controlName(id) {
    if (id === 'ls') return t('settings.touchPadControlStickLeft');
    if (id === 'rs') return t('settings.touchPadControlStickRight');
    if (id === 'view') return t('settings.touchPadControlView');
    if (id === 'menu') return t('settings.touchPadControlMenu');
    if (ARROWS[id]) return t('padKbm.dpad') + ' ' + ARROWS[id];
    return id.toUpperCase();
}

function option(value, label, current) {
    return `<option value="${escapeHtml(value)}"${value === current ? ' selected' : ''}>${escapeHtml(label)}</option>`;
}

function stickChoices(current) {
    return PAD_KBM_ROLES.map((role) => option(role, t('padKbm.role.' + role), current)).join('');
}

function buttonChoices(current) {
    const groups = GROUPS.map(
        (group) =>
            `<optgroup label="${escapeHtml(t('padKbm.group.' + group))}">${PAD_KBM_ACTIONS[group]
                .map((token) => option(token, padKbmLabel(token, t), current))
                .join('')}</optgroup>`,
    ).join('');
    return option('', padKbmLabel('', t), current) + groups;
}

export class PadKeyMouseDialog {
    /**
     * @param {{ container?: HTMLElement,
     *           settings: { mode: string, sens: number, map: Record<string, string> },
     *           onChange?: (settings: { mode: string, sens: number, map: Record<string, string> }) => void,
     *           onOpen?: () => void, onClose?: () => void,
     *           onMoveControls?: (() => void)|null }} options
     *   `onMoveControls`: given by a stream that has the on-screen controller.
     *   The dialog then offers to move its joysticks and buttons; a press
     *   closes the dialog first, then calls it.
     *   `games`: given by a stream whose viewer keeps settings game by game
     *   (stream/PadGames.js) — the games named so far, the one these settings
     *   are (`current`, empty for every game's) and a name to offer for a new
     *   one. `onGame(name)`, `onNewGame(typed)` and `onDeleteGame(name)` do
     *   what their names say and answer with what the dialog shows next:
     *   `{ names, current, settings }`, or nothing when nothing was done.
     */
    constructor({
        container,
        settings,
        onChange,
        onOpen,
        onClose,
        onMoveControls,
        games,
        onGame,
        onNewGame,
        onDeleteGame,
    }) {
        this._container = container || document.body;
        this._settings = { mode: settings.mode, sens: settings.sens, map: padKbmMap(settings.map) };
        this._onChange = onChange || null;
        this._onOpen = onOpen || null;
        this._onClose = onClose || null;
        this._onMoveControls = onMoveControls || null;
        this._games = games
            ? {
                  names: [...(games.names || [])],
                  current: games.current || '',
                  suggested: games.suggested || '',
              }
            : null;
        this._onGame = onGame || null;
        this._onNewGame = onNewGame || null;
        this._onDeleteGame = onDeleteGame || null;
        this._overlay = null;
        // What had the keyboard when the dialog opened.
        this._returnFocus = null;
        this._onKey = (e) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            e.stopPropagation();
            this.close();
        };
    }

    get isOpen() {
        return !!this._overlay;
    }

    /** What the dialog holds now. */
    get settings() {
        return {
            mode: this._settings.mode,
            sens: this._settings.sens,
            map: { ...this._settings.map },
        };
    }

    open() {
        if (this._overlay) return;
        if (document.pointerLockElement) document.exitPointerLock();
        const overlay = document.createElement('div');
        overlay.className = 'pad-kbm-overlay';
        const field = (id, choices) => `
            <label class="pad-kbm-field${PAD_KBM_STICKS.includes(id) ? ' is-stick' : ''}">
                <span class="pad-kbm-name">${escapeHtml(controlName(id))}</span>
                <select class="pad-kbm-select" data-control="${id}">${choices}</select>
            </label>`;
        const map = this._settings.map;
        // Where the joysticks and buttons sit: offered where there is a
        // controller on screen to move (a stream), not on the settings page,
        // which has its own button for it.
        const moveControls = this._onMoveControls
            ? `<div class="pad-kbm-move">
                        <button type="button" class="btn btn-neutral pad-kbm-move-btn">${escapeHtml(t('padKbm.moveControls'))}</button>
                    </div>`
            : '';
        // Whose settings these are, first: everything below is that game's.
        // The list holds the games, then what can be done about them; adding
        // one and deleting one each ask their one question in the row below.
        const games = this._games
            ? `<div class="pad-kbm-game">
                        <label class="pad-kbm-game-row">
                            <span class="pad-kbm-name">${escapeHtml(t('padKbm.game'))}</span>
                            <select class="pad-kbm-game-select"></select>
                        </label>
                        <form class="pad-kbm-game-new" hidden>
                            <input type="text" class="pad-kbm-game-name" required
                                   maxlength="${PAD_GAME_NAME_MAX}"
                                   placeholder="${escapeHtml(t('padKbm.gameName'))}"
                                   aria-label="${escapeHtml(t('padKbm.gameName'))}"
                                   autocomplete="off" autocapitalize="words"
                                   spellcheck="false" enterkeyhint="done" />
                            <button type="submit" class="btn btn-save pad-kbm-game-add">${escapeHtml(t('padKbm.gameAdd'))}</button>
                            <button type="button" class="btn btn-neutral pad-kbm-game-cancel">${escapeHtml(t('padKbm.gameCancel'))}</button>
                        </form>
                        <div class="pad-kbm-game-ask" hidden>
                            <span class="pad-kbm-game-question"></span>
                            <button type="button" class="btn btn-danger pad-kbm-game-delete">${escapeHtml(t('padKbm.gameDeleteYes'))}</button>
                            <button type="button" class="btn btn-neutral pad-kbm-game-keep">${escapeHtml(t('padKbm.gameCancel'))}</button>
                        </div>
                        <p class="pad-kbm-game-hint"></p>
                    </div>`
            : '';
        overlay.innerHTML = `
            <div class="pad-kbm" role="dialog" aria-modal="true" aria-labelledby="pad-kbm-title">
                <div class="pad-kbm-head">
                    <h3 class="pad-kbm-title" id="pad-kbm-title">${escapeHtml(t('padKbm.title'))}</h3>
                    <button type="button" class="pad-kbm-close" aria-label="${escapeHtml(t('padKbm.close'))}">✕</button>
                </div>
                <!-- Between the title and the way out, which stay in sight: on a
                     phone held sideways the keys are taller than the screen. -->
                <div class="pad-kbm-scroll">
                    ${games}
                    <div class="pad-kbm-modes" role="group" aria-labelledby="pad-kbm-title">
                        <button type="button" class="pad-kbm-mode" data-mode="pad">${escapeHtml(t('padKbm.modePad'))}</button>
                        <button type="button" class="pad-kbm-mode" data-mode="kbm">${escapeHtml(t('padKbm.modeKbm'))}</button>
                    </div>
                    <p class="pad-kbm-desc"></p>
                    ${moveControls}
                    <div class="pad-kbm-body">
                        <h4 class="pad-kbm-subtitle">${escapeHtml(t('padKbm.keysTitle'))}</h4>
                        <label class="pad-kbm-sens">
                            <span class="pad-kbm-name">${escapeHtml(t('padKbm.sens'))}</span>
                            <input type="range" class="pad-kbm-range"
                                   min="${Math.round(PAD_KBM_SENS_MIN * 100)}"
                                   max="${Math.round(PAD_KBM_SENS_MAX * 100)}" step="5" />
                            <output class="pad-kbm-percent"></output>
                        </label>
                        <div class="pad-kbm-grid">
                            ${PAD_KBM_STICKS.map((id) => field(id, stickChoices(map[id]))).join('')}
                            ${PAD_KBM_BUTTONS.map((id) => field(id, buttonChoices(map[id]))).join('')}
                        </div>
                        <p class="pad-kbm-hint">${escapeHtml(t('padKbm.hintLetters'))}</p>
                    </div>
                </div>
                <div class="pad-kbm-actions">
                    <button type="button" class="btn btn-neutral pad-kbm-reset">${escapeHtml(t('padKbm.reset'))}</button>
                    <span class="pad-kbm-spacer"></span>
                    <button type="button" class="btn btn-save pad-kbm-done">${escapeHtml(t('padKbm.done'))}</button>
                </div>
            </div>`;
        this._container.appendChild(overlay);
        this._overlay = overlay;

        // Over a stream the whole surface is the game's: nothing touched or
        // clicked in here may go on to its trackpad.
        for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
            overlay.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
        }
        for (const type of [
            'pointerdown',
            'pointerup',
            'pointermove',
            'pointercancel',
            'mousedown',
            'mouseup',
            'mousemove',
            'wheel',
            'contextmenu',
        ]) {
            overlay.addEventListener(type, (e) => e.stopPropagation());
        }
        overlay.addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.target === overlay) this.close();
        });
        overlay.querySelector('.pad-kbm-close').addEventListener('click', () => this.close());
        overlay.querySelector('.pad-kbm-done').addEventListener('click', () => this.close());
        const move = overlay.querySelector('.pad-kbm-move-btn');
        if (move) {
            move.addEventListener('click', () => {
                // The dialog goes first: the editor takes the whole screen.
                const go = this._onMoveControls;
                this.close();
                if (go) go();
            });
        }
        overlay.querySelector('.pad-kbm-reset').addEventListener('click', () => {
            this._settings.map = padKbmMap(PAD_KBM_DEFAULT_MAP);
            for (const select of overlay.querySelectorAll('.pad-kbm-select')) {
                /** @type {HTMLSelectElement} */ (select).value =
                    this._settings.map[/** @type {HTMLElement} */ (select).dataset.control];
            }
            this._changed();
        });
        for (const button of overlay.querySelectorAll('.pad-kbm-mode')) {
            button.addEventListener('click', () => {
                const mode = /** @type {HTMLElement} */ (button).dataset.mode;
                if (mode === this._settings.mode) return;
                this._settings.mode = mode;
                this._sync();
                this._changed();
            });
        }
        const range = /** @type {HTMLInputElement} */ (overlay.querySelector('.pad-kbm-range'));
        range.value = String(Math.round(this._settings.sens * 100));
        range.addEventListener('input', () => {
            this._settings.sens = Number(range.value) / 100;
            this._sync();
            this._changed();
        });
        for (const select of overlay.querySelectorAll('.pad-kbm-select')) {
            select.addEventListener('change', () => {
                const el = /** @type {HTMLSelectElement} */ (select);
                this._settings.map = padKbmMap({
                    ...this._settings.map,
                    [el.dataset.control]: el.value,
                });
                this._changed();
            });
        }
        this._bindGames();
        document.addEventListener('keydown', this._onKey, true);
        this._sync();
        // The keyboard comes in here with the dialog: left on the stream, what
        // is typed while it is up would go on to the game.
        this._returnFocus = document.activeElement;
        const chosen = /** @type {HTMLElement|null} */ (
            overlay.querySelector('.pad-kbm-mode.is-on')
        );
        if (chosen) chosen.focus({ preventScroll: true });
        if (this._onOpen) this._onOpen();
    }

    close() {
        if (!this._overlay) return;
        document.removeEventListener('keydown', this._onKey, true);
        this._overlay.remove();
        this._overlay = null;
        // Back to what had the keyboard: the stream's own capture, usually.
        const back = /** @type {HTMLElement|null} */ (this._returnFocus);
        this._returnFocus = null;
        if (back && typeof back.focus === 'function' && back.isConnected) {
            back.focus({ preventScroll: true });
        }
        if (this._onClose) this._onClose();
    }

    /** Show which of the two is chosen, and what it means. */
    _sync() {
        const overlay = this._overlay;
        if (!overlay) return;
        const kbm = this._settings.mode === 'kbm';
        for (const button of overlay.querySelectorAll('.pad-kbm-mode')) {
            const on = /** @type {HTMLElement} */ (button).dataset.mode === this._settings.mode;
            button.classList.toggle('is-on', on);
            button.setAttribute('aria-pressed', on ? 'true' : 'false');
        }
        overlay.querySelector('.pad-kbm-desc').textContent = t(
            kbm ? 'padKbm.descKbm' : 'padKbm.descPad',
        );
        // The keys are there to be read in either mode, and set before a game.
        overlay.querySelector('.pad-kbm-body').classList.toggle('is-idle', !kbm);
        overlay.querySelector('.pad-kbm-percent').textContent = t('padKbm.sensValue', {
            percent: Math.round(this._settings.sens * 100),
        });
    }

    _changed() {
        if (this._onChange) this._onChange(this.settings);
    }

    // ── The games (a stream's dialog) ───────────────────────────────────────

    /** The list as it stands: the games, then what can be done about them. */
    _renderGames() {
        const overlay = this._overlay;
        const games = this._games;
        if (!overlay || !games) return;
        const select = /** @type {HTMLSelectElement} */ (
            overlay.querySelector('.pad-kbm-game-select')
        );
        const current = games.current;
        const chosen = current ? GAME_PREFIX + current : GAME_ALL;
        select.innerHTML =
            option(GAME_ALL, t('padKbm.gameAll'), chosen) +
            games.names.map((name) => option(GAME_PREFIX + name, name, chosen)).join('') +
            // No room left for one more: not offered, rather than refused.
            (games.names.length < PAD_GAMES_MAX
                ? option(GAME_NEW, t('padKbm.gameNew'), chosen)
                : '') +
            (current ? option(GAME_DELETE, t('padKbm.gameDelete', { name: current }), chosen) : '');
        select.value = chosen;
        overlay.querySelector('.pad-kbm-game-hint').textContent = t(
            current ? 'padKbm.gameHintOne' : 'padKbm.gameHintAll',
        );
    }

    /** Put the two one-question rows away, and the list back on its game. */
    _hideGameForms() {
        const overlay = this._overlay;
        if (!overlay || !this._games) return;
        /** @type {HTMLElement} */ (overlay.querySelector('.pad-kbm-game-new')).hidden = true;
        /** @type {HTMLElement} */ (overlay.querySelector('.pad-kbm-game-ask')).hidden = true;
        const select = /** @type {HTMLSelectElement} */ (
            overlay.querySelector('.pad-kbm-game-select')
        );
        select.value = this._games.current ? GAME_PREFIX + this._games.current : GAME_ALL;
    }

    _bindGames() {
        const overlay = this._overlay;
        if (!overlay || !this._games) return;
        this._renderGames();
        const select = /** @type {HTMLSelectElement} */ (
            overlay.querySelector('.pad-kbm-game-select')
        );
        const form = /** @type {HTMLFormElement} */ (overlay.querySelector('.pad-kbm-game-new'));
        const input = /** @type {HTMLInputElement} */ (overlay.querySelector('.pad-kbm-game-name'));
        const ask = /** @type {HTMLElement} */ (overlay.querySelector('.pad-kbm-game-ask'));

        select.addEventListener('change', () => {
            const value = select.value;
            if (value === GAME_NEW) {
                this._hideGameForms();
                // One of the PC's apps offers its own name, unless it is taken.
                const suggested = this._games.suggested;
                input.value = suggested && !this._games.names.includes(suggested) ? suggested : '';
                form.hidden = false;
                input.focus({ preventScroll: true });
                input.select();
                return;
            }
            if (value === GAME_DELETE) {
                this._hideGameForms();
                overlay.querySelector('.pad-kbm-game-question').textContent = t(
                    'padKbm.gameDeleteAsk',
                    { name: this._games.current },
                );
                ask.hidden = false;
                return;
            }
            this._hideGameForms();
            const name = value === GAME_ALL ? '' : value.slice(GAME_PREFIX.length);
            if (name === this._games.current) return;
            this._takeGames(this._onGame ? this._onGame(name) : null);
        });
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const state = this._onNewGame ? this._onNewGame(input.value) : null;
            if (!state) {
                // Nothing to call it by: the question stays.
                input.focus({ preventScroll: true });
                return;
            }
            this._takeGames(state);
        });
        overlay
            .querySelector('.pad-kbm-game-cancel')
            .addEventListener('click', () => this._hideGameForms());
        overlay
            .querySelector('.pad-kbm-game-keep')
            .addEventListener('click', () => this._hideGameForms());
        overlay.querySelector('.pad-kbm-game-delete').addEventListener('click', () => {
            const name = this._games.current;
            this._takeGames(name && this._onDeleteGame ? this._onDeleteGame(name) : null);
        });
    }

    /**
     * Show what the stream answered: the games as they are now, and the
     * settings of the one chosen in every field. Nothing is told back
     * (`onChange`): these were read, not set.
     * @param {{ names: string[], current: string,
     *           settings: { mode: string, sens: number, map: Record<string, string> } }|null} state
     */
    _takeGames(state) {
        const overlay = this._overlay;
        this._hideGameForms();
        if (!overlay || !state || !this._games) return;
        this._games = {
            names: [...(state.names || [])],
            current: state.current || '',
            suggested: this._games.suggested,
        };
        this._settings = {
            mode: state.settings.mode,
            sens: state.settings.sens,
            map: padKbmMap(state.settings.map),
        };
        this._renderGames();
        /** @type {HTMLInputElement} */ (overlay.querySelector('.pad-kbm-range')).value = String(
            Math.round(this._settings.sens * 100),
        );
        for (const select of overlay.querySelectorAll('.pad-kbm-select')) {
            const el = /** @type {HTMLSelectElement} */ (select);
            el.value = this._settings.map[el.dataset.control];
        }
        this._sync();
    }
}
