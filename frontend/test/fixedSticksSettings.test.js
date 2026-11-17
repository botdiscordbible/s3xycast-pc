/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * Fixed joysticks, in the Settings page: the choice is there, it is the
 * default, it is read back and it is saved (see fixedSticks.test.js for what
 * the choice does).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../js/ui/TouchPadLayoutEditor.js', () => ({
    TouchPadLayoutEditor: class {
        open() {}
    },
}));
vi.mock('../js/api/BackendClient.js', () => ({
    BackendClient: {
        getAuthStatus: vi.fn(async () => ({ has_session: false })),
        getStreamingSettings: vi.fn(async () => ({})),
    },
}));
vi.mock('../js/ui/Toast.js', () => ({
    Toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock('../js/i18n/i18n.js', () => ({
    t: (key) => 'text:' + key,
    getLanguage: () => 'en',
    setLanguage: vi.fn(),
    AVAILABLE_LANGUAGES: [{ code: 'en', label: 'English' }],
}));

import { SettingsView } from '../js/ui/SettingsView.js';
import { touchPadSettings } from '../js/stream/TouchPadState.js';

describe('the joystick choice in the Settings', () => {
    let view;

    const paint = () => {
        view.container.innerHTML =
            view._renderTouchPadSection() + '<div class="settings-section-shortcuts"></div>';
        view._bindTouchPadSection();
    };
    const field = (name) => view.container.querySelector('#settings-touch-pad-' + name);

    beforeEach(() => {
        Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
        window.matchMedia = (q) => ({
            matches: q === '(any-pointer: coarse)',
            addEventListener: () => {},
            removeEventListener: () => {},
        });
        const container = document.createElement('div');
        document.body.appendChild(container);
        view = Object.create(SettingsView.prototype);
        view.container = container;
        view._touchPad = touchPadSettings();
        view._autoSave = vi.fn();
        view._refreshShortcutsSection = vi.fn();
    });
    afterEach(() => {
        view.container.remove();
    });

    it('offers fixed joysticks, chosen, and the ones that follow the thumb', () => {
        paint();
        const select = field('sticks');
        expect(select).not.toBeNull();
        expect([...select.options].map((o) => o.value)).toEqual(['fixed', 'follow']);
        expect(select.value).toBe('fixed');
        expect([...select.options].map((o) => o.textContent)).toEqual([
            'text:settings.touchPadSticksFixed',
            'text:settings.touchPadSticksFollow',
        ]);
        // Said in a sentence under it, as the other choices of this page are.
        expect(view.container.innerHTML).toContain('text:settings.touchPadSticksDesc');
    });

    it('shows what was saved', () => {
        view._touchPad = touchPadSettings({ touch_pad_sticks: 'follow' });
        paint();
        expect(field('sticks').value).toBe('follow');
    });

    it('reads the choice back and saves at once', () => {
        paint();
        field('sticks').value = 'follow';
        field('sticks').dispatchEvent(new Event('change'));
        expect(view._autoSave).toHaveBeenCalledTimes(1);
        expect(view._readTouchPadSection().sticks).toBe('follow');
    });

    it('keeps what was saved when the section is not on the page', () => {
        view._touchPad = touchPadSettings({ touch_pad_sticks: 'follow' });
        view.container.innerHTML = '';
        expect(view._readTouchPadSection().sticks).toBe('follow');
    });
});
