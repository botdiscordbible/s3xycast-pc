/*
 * S3XYCast edition of MoonlightWeb — frontend TNR. GPLv3.
 *
 * The owner's personal code on the admin page: chosen, replaced and removed
 * there, never shown again once saved (the host keeps a digest), and the host
 * has the last word on a code that is too short, too long or too easy to guess.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../js/api/BackendClient.js', () => ({
    BackendClient: {
        setAccessCode: vi.fn(),
        clearAccessCode: vi.fn(),
    },
}));
vi.mock('../js/ui/Toast.js', () => ({
    Toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock('../js/i18n/i18n.js', () => ({
    t: (key, vars) => (vars && 'count' in vars ? `${key}:${vars.count}` : key),
    onLocaleChange: () => () => {},
    getLocale: () => 'en',
}));

import { AdminView } from '../js/ui/AdminView.js';
import { BackendClient } from '../js/api/BackendClient.js';
import { Toast } from '../js/ui/Toast.js';

/**
 * The section alone, on a view that renders and binds nothing else: what the
 * page does around it is the other admin tests' business.
 */
function sectionOf({ admin = true, codeSet = false } = {}) {
    document.body.innerHTML = '<div id="host"></div>';
    const container = document.getElementById('host');
    const view = Object.create(AdminView.prototype);
    view.container = container;
    view._accessCodeSet = codeSet;
    view._isLocalhost = () => admin;
    view.esc = (text) => String(text);
    const draw = () => {
        container.innerHTML = view._renderAccessCode();
        const input = container.querySelector('#admin-access-code');
        const save = container.querySelector('#btn-set-access-code');
        if (save) save.addEventListener('click', () => view._saveAccessCode(input.value));
        const remove = container.querySelector('#btn-clear-access-code');
        if (remove) remove.addEventListener('click', () => view._clearAccessCode());
    };
    view.render = draw;
    view.bindEvents = () => {};
    draw();
    return view;
}

const field = () => /** @type {HTMLInputElement} */ (document.getElementById('admin-access-code'));
const state = () => document.getElementById('admin-access-code-state').textContent.trim();

describe('the personal code on the admin page', () => {
    beforeEach(() => vi.clearAllMocks());

    it('is not drawn for someone who does not administer', () => {
        sectionOf({ admin: false });
        expect(document.getElementById('admin-section-access-code')).toBeNull();
    });

    it('says that there is none, and offers to save one', () => {
        sectionOf();
        expect(state()).toBe('admin.accessCodeNone');
        expect(document.getElementById('btn-set-access-code').textContent.trim()).toBe(
            'admin.accessCodeChoose',
        );
        expect(document.getElementById('btn-clear-access-code')).toBeNull();
        expect(field().type).toBe('password');
        expect(field().placeholder).toBe('admin.accessCodePlaceholder:6');
    });

    it('refuses a code under six characters without asking the host', async () => {
        const view = sectionOf();
        await view._saveAccessCode('  abc12  ');
        expect(BackendClient.setAccessCode).not.toHaveBeenCalled();
        expect(Toast.warning).toHaveBeenCalledWith('admin.accessCodeTooShort:6');
    });

    it('saves the code trimmed, then says one is in place and never shows it', async () => {
        BackendClient.setAccessCode.mockResolvedValueOnce({ status: 'ok', access_code_set: true });
        const view = sectionOf();
        field().value = '  tournesol-42 ';
        document.getElementById('btn-set-access-code').click();
        await vi.waitFor(() => expect(Toast.success).toHaveBeenCalledWith('admin.accessCodeSaved'));
        expect(BackendClient.setAccessCode).toHaveBeenCalledWith('tournesol-42');
        expect(view._accessCodeSet).toBe(true);
        expect(state()).toBe('admin.accessCodeSet');
        expect(field().value).toBe('');
        expect(document.getElementById('btn-set-access-code').textContent.trim()).toBe(
            'admin.accessCodeChange',
        );
        expect(document.getElementById('btn-clear-access-code')).not.toBeNull();
    });

    it.each([
        [{ error: 'too_weak' }, 'admin.accessCodeTooWeak'],
        [{ error: 'too_short', min_length: 6 }, 'admin.accessCodeTooShort:6'],
        [{ error: 'too_long', max_length: 64 }, 'admin.accessCodeTooLong:64'],
    ])('says why the host refused (%o) and keeps what was typed', async (body, message) => {
        const err = new Error('refused');
        err.statusCode = 400;
        err.responseBody = body;
        BackendClient.setAccessCode.mockRejectedValueOnce(err);
        const view = sectionOf();
        field().value = '123456';
        await view._saveAccessCode(field().value);
        expect(Toast.warning).toHaveBeenCalledWith(message);
        expect(view._accessCodeSet).toBe(false);
        expect(field().value).toBe('123456');
    });

    it('removes the code only once confirmed', async () => {
        BackendClient.clearAccessCode.mockResolvedValueOnce({ status: 'ok', access_code_set: false });
        const view = sectionOf({ codeSet: true });
        const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
        document.getElementById('btn-clear-access-code').click();
        await Promise.resolve();
        expect(BackendClient.clearAccessCode).not.toHaveBeenCalled();
        expect(view._accessCodeSet).toBe(true);

        confirm.mockReturnValueOnce(true);
        document.getElementById('btn-clear-access-code').click();
        await vi.waitFor(() =>
            expect(Toast.success).toHaveBeenCalledWith('admin.accessCodeRemoved'),
        );
        expect(view._accessCodeSet).toBe(false);
        expect(state()).toBe('admin.accessCodeNone');
        confirm.mockRestore();
    });
});
