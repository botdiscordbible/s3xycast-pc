/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * The dialog that says what a controller is for the host, a pad or a keyboard
 * and a mouse, and sets its keys. It is opened over a running game: what it is
 * told must take effect at once, and nothing touched in it may reach the game.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../js/i18n/i18n.js', () => ({
    t: (key, params) => key + (params ? ':' + JSON.stringify(params) : ''),
}));

import { PadKeyMouseDialog } from '../js/ui/PadKeyMouseDialog.js';
import {
    PAD_KBM_ACTIONS,
    PAD_KBM_BUTTONS,
    PAD_KBM_DEFAULT_MAP,
    PAD_KBM_STICKS,
    padKbmSettings,
} from '../js/stream/PadKeyMouse.js';

describe('PadKeyMouseDialog', () => {
    let host;
    let onChange;
    let onOpen;
    let onClose;
    let dlg;

    const open = (settings = padKbmSettings()) => {
        dlg = new PadKeyMouseDialog({ container: host, settings, onChange, onOpen, onClose });
        dlg.open();
        return dlg;
    };
    const el = (selector) => host.querySelector(selector);
    const select = (control) => el(`.pad-kbm-select[data-control="${control}"]`);
    const modeButton = (mode) => el(`.pad-kbm-mode[data-mode="${mode}"]`);
    const last = () => onChange.mock.calls.at(-1)[0];
    const choose = (control, value) => {
        select(control).value = value;
        select(control).dispatchEvent(new Event('change'));
    };

    beforeEach(() => {
        host = document.createElement('div');
        document.body.appendChild(host);
        onChange = vi.fn();
        onOpen = vi.fn();
        onClose = vi.fn();
    });
    afterEach(() => {
        if (dlg) dlg.close();
        dlg = null;
        document.body.innerHTML = '';
    });

    it('opens on what the viewer has: a pad, said in words, the keys set aside', () => {
        open();
        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(modeButton('pad').getAttribute('aria-pressed')).toBe('true');
        expect(modeButton('kbm').getAttribute('aria-pressed')).toBe('false');
        expect(el('.pad-kbm-desc').textContent).toBe('padKbm.descPad');
        expect(el('.pad-kbm-body').classList.contains('is-idle')).toBe(true);
        expect(el('.pad-kbm-percent').textContent).toBe('padKbm.sensValue:{"percent":100}');
    });

    it('says whose settings the keys are: the second mode’s', () => {
        open();
        expect(el('.pad-kbm-body .pad-kbm-subtitle').textContent).toBe('padKbm.keysTitle');
    });

    it('has one choice for each stick and each button, set to the viewer’s key', () => {
        open(padKbmSettings({ pad_kbm_map: { ...PAD_KBM_DEFAULT_MAP, y: 'c:h', ls: 'arrows' } }));
        const controls = [...host.querySelectorAll('.pad-kbm-select')].map(
            (s) => s.dataset.control,
        );
        expect(controls).toEqual([...PAD_KBM_STICKS, ...PAD_KBM_BUTTONS]);
        expect(select('ls').value).toBe('arrows');
        expect(select('rs').value).toBe('mouse');
        expect(select('a').value).toBe('k:Space');
        expect(select('y').value).toBe('c:h');
        // Every key there is, and nothing.
        const offered = [...select('a').options].map((o) => o.value);
        expect(offered).toEqual(['', ...Object.values(PAD_KBM_ACTIONS).flat()]);
        expect(select('a').querySelectorAll('optgroup').length).toBe(5);
    });

    it('tells of the mode the moment it is chosen', () => {
        open();
        modeButton('kbm').click();
        expect(last().mode).toBe('kbm');
        expect(modeButton('kbm').classList.contains('is-on')).toBe(true);
        expect(el('.pad-kbm-desc').textContent).toBe('padKbm.descKbm');
        expect(el('.pad-kbm-body').classList.contains('is-idle')).toBe(false);
        // The one already chosen is no news.
        modeButton('kbm').click();
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('tells of a key the moment it is chosen, with the others as they were', () => {
        open(padKbmSettings({ pad_kbm_mode: 'kbm' }));
        choose('b', 'c:g');
        expect(last().map).toEqual({ ...PAD_KBM_DEFAULT_MAP, b: 'c:g' });
        choose('rs', 'none');
        expect(last().map.rs).toBe('none');
        expect(last().map.b).toBe('c:g');
        expect(last().mode).toBe('kbm');
    });

    it('tells of the mouse speed as it is dragged', () => {
        open();
        const range = el('.pad-kbm-range');
        expect(range.value).toBe('100');
        range.value = '250';
        range.dispatchEvent(new Event('input'));
        expect(last().sens).toBe(2.5);
        expect(el('.pad-kbm-percent').textContent).toBe('padKbm.sensValue:{"percent":250}');
    });

    it('gives the keys back as shipped, and leaves the mode and the speed alone', () => {
        open(
            padKbmSettings({
                pad_kbm_mode: 'kbm',
                pad_kbm_sens: 2,
                pad_kbm_map: { ...PAD_KBM_DEFAULT_MAP, a: 'c:z', ls: 'none' },
            }),
        );
        el('.pad-kbm-reset').click();
        expect(last()).toEqual({ mode: 'kbm', sens: 2, map: { ...PAD_KBM_DEFAULT_MAP } });
        expect(select('a').value).toBe('k:Space');
        expect(select('ls').value).toBe('move');
    });

    it.each([
        ['its Done button', () => el('.pad-kbm-done').click()],
        ['its cross', () => el('.pad-kbm-close').click()],
        ['a touch beside it', () => el('.pad-kbm-overlay').click()],
        [
            'Escape',
            () =>
                document.dispatchEvent(
                    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
                ),
        ],
    ])('closes on %s, once', (_how, act) => {
        open();
        act();
        expect(el('.pad-kbm-overlay')).toBeNull();
        expect(dlg.isOpen).toBe(false);
        expect(onClose).toHaveBeenCalledTimes(1);
        dlg.close();
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not close on a touch inside it', () => {
        open();
        el('.pad-kbm').click();
        el('.pad-kbm-title').click();
        expect(dlg.isOpen).toBe(true);
    });

    it('keeps what is touched or clicked in it from the stream underneath', () => {
        const seen = vi.fn();
        const types = [
            'touchstart',
            'touchmove',
            'touchend',
            'mousedown',
            'mouseup',
            'click',
            'wheel',
        ];
        for (const type of types) host.addEventListener(type, seen);
        open();
        for (const type of types) {
            el('.pad-kbm-title').dispatchEvent(
                new Event(type, { bubbles: true, cancelable: true }),
            );
        }
        expect(seen).not.toHaveBeenCalled();
    });

    it('keeps Escape from the game: it closes the dialog and goes no further', () => {
        const seen = vi.fn();
        document.addEventListener('keydown', seen);
        open();
        const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        document.dispatchEvent(e);
        expect(e.defaultPrevented).toBe(true);
        expect(seen).not.toHaveBeenCalled();
        // Closed, it listens to nothing.
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(seen).toHaveBeenCalledTimes(1);
        document.removeEventListener('keydown', seen);
    });

    it('takes the keyboard while it is up, and gives it back to what had it', () => {
        // Over a stream, a key typed with the focus left outside goes to the game.
        const capture = document.createElement('button');
        document.body.appendChild(capture);
        capture.focus();
        open(padKbmSettings({ pad_kbm_mode: 'kbm' }));
        expect(document.activeElement).toBe(modeButton('kbm'));
        dlg.close();
        expect(document.activeElement).toBe(capture);
    });

    it('keeps a pointer pressed in it from the stream too', () => {
        const seen = vi.fn();
        const types = ['pointerdown', 'pointermove', 'pointerup', 'contextmenu'];
        for (const type of types) host.addEventListener(type, seen);
        open();
        for (const type of types) {
            el('.pad-kbm-title').dispatchEvent(new Event(type, { bubbles: true }));
        }
        expect(seen).not.toHaveBeenCalled();
    });

    it('opens once', () => {
        open();
        dlg.open();
        expect(host.querySelectorAll('.pad-kbm-overlay').length).toBe(1);
        expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it('never hands out the map it holds: the caller’s copy is the caller’s', () => {
        open();
        const given = dlg.settings;
        given.map.a = 'c:x';
        expect(dlg.settings.map.a).toBe('k:Space');
    });
});
