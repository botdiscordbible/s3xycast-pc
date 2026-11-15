/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * The Settings page's row for the controllers played as a keyboard and a
 * mouse: there for every device (a real pad needs no touch screen), opening
 * the dialog a stream opens too, and saving what it says with the stream's
 * other settings — without putting back, over a choice made in a stream since,
 * what the page read when it was drawn.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { dialogs } = vi.hoisted(() => ({ dialogs: [] }));
vi.mock('../js/ui/PadKeyMouseDialog.js', () => ({
    PadKeyMouseDialog: class {
        constructor(options) {
            this.options = options;
            this.opened = false;
            dialogs.push(this);
        }
        open() {
            this.opened = true;
        }
    },
}));
vi.mock('../js/api/BackendClient.js', () => ({
    BackendClient: {
        getAuthStatus: vi.fn(async () => ({ has_session: false })),
        getStreamingSettings: vi.fn(async () => ({})),
        saveStreamingSettings: vi.fn(async () => ({})),
        getMetricsReporting: vi.fn(),
        setMetricsReporting: vi.fn(async () => ({ enabled: true })),
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
import { PAD_KBM_DEFAULT_MAP, padKbmSettings } from '../js/stream/PadKeyMouse.js';

const STORAGE_KEY = 'mw-streaming-settings';

describe('SettingsView controllers as a keyboard and a mouse', () => {
    let view;

    const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY));
    const summary = () => view.container.querySelector('#settings-pad-kbm-summary');
    const edit = () => view.container.querySelector('#settings-pad-kbm-edit');
    const kbm = (fields = {}) => padKbmSettings({ pad_kbm_mode: 'kbm', ...fields });

    beforeEach(() => {
        localStorage.clear();
        dialogs.length = 0;
        document.body.innerHTML = '<div id="settings"></div>';
        vi.clearAllMocks();
        view = new SettingsView(document.getElementById('settings'), () => {});
    });

    it('is there on a device with no touch screen: a real pad needs none', () => {
        Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
        view.render();
        expect(view.container.querySelector('.settings-section-pad-kbm')).not.toBeNull();
        expect(view.container.querySelector('.settings-section-touch-pad')).toBeNull();
        delete navigator.maxTouchPoints;
    });

    it('says in one line what the controllers are', () => {
        view.render();
        expect(summary().textContent).toBe('text:padKbm.modePad');
        view._padKbm = kbm();
        expect(view._padKbmSummary()).toBe('text:padKbm.modeKbm');
        view._padKbm = kbm({ pad_kbm_map: { ...PAD_KBM_DEFAULT_MAP, a: 'c:h' } });
        expect(view._padKbmSummary()).toBe('text:padKbm.modeKbm · text:padKbm.summaryCustom');
    });

    it('opens the dialog on what is set, and takes what it says', () => {
        view._applySettings({ pad_kbm_mode: 'kbm', pad_kbm_sens: 1.5 });
        view.render();
        view.bindEvents();
        view._autoSave = vi.fn();
        edit().click();
        expect(dialogs.length).toBe(1);
        expect(dialogs[0].opened).toBe(true);
        expect(dialogs[0].options.settings).toEqual(kbm({ pad_kbm_sens: 1.5 }));
        // A second click while it is up opens no second one.
        edit().click();
        expect(dialogs.length).toBe(1);

        const chosen = kbm({ pad_kbm_map: { ...PAD_KBM_DEFAULT_MAP, b: 'c:g' } });
        dialogs[0].options.onChange(chosen);
        expect(view._padKbm).toEqual(chosen);
        expect(summary().textContent).toBe('text:padKbm.modeKbm · text:padKbm.summaryCustom');
        expect(view._autoSave).toHaveBeenCalledTimes(1);

        dialogs[0].options.onClose();
        edit().click();
        expect(dialogs.length).toBe(2);
    });

    it('saves it with the stream’s other settings, and reads it back', async () => {
        view.render();
        view.bindEvents();
        edit().click();
        dialogs[0].options.onChange(kbm({ pad_kbm_sens: 2 }));
        await view._saveToStorage();
        expect(stored().pad_kbm_mode).toBe('kbm');
        expect(stored().pad_kbm_sens).toBe(2);
        expect(stored().pad_kbm_map).toEqual({ ...PAD_KBM_DEFAULT_MAP });
        expect(stored().touch_pad_mode).toBe('auto');

        const again = new SettingsView(document.getElementById('settings'), () => {});
        again._applySettings(stored());
        expect(again._padKbm).toEqual(kbm({ pad_kbm_sens: 2 }));
    });

    it('does not put back, on a later save, what a stream changed since the page was drawn', async () => {
        view._applySettings({});
        view.render();
        view.bindEvents();
        await view._saveToStorage();
        expect(stored().pad_kbm_mode).toBe('pad');
        // A stream's dialog writes its choice into the same store.
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...stored(), pad_kbm_mode: 'kbm' }));
        // Then another setting is changed on this page.
        await view._saveToStorage();
        expect(stored().pad_kbm_mode).toBe('kbm');
        expect(view._padKbm.mode).toBe('kbm');
    });

    it('keeps its own choice over the store’s when it is the one that changed', async () => {
        view.render();
        view.bindEvents();
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ pad_kbm_mode: 'kbm' }));
        edit().click();
        // Opened on what the store holds by now.
        expect(dialogs[0].options.settings.mode).toBe('kbm');
        dialogs[0].options.onChange(padKbmSettings());
        await view._saveToStorage();
        expect(stored().pad_kbm_mode).toBe('pad');
    });

    it('goes back to a pad with the other defaults', async () => {
        view._applySettings({ pad_kbm_mode: 'kbm', pad_kbm_map: { a: 'c:h' } });
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ pad_kbm_mode: 'kbm' }));
        view.render();
        view.bindEvents();
        await view._resetDefaults();
        expect(view._padKbm).toEqual(padKbmSettings());
        expect(stored().pad_kbm_mode).toBe('pad');
    });
});
