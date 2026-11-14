/*
 * S3XYCast edition of MoonlightWeb — frontend TNR. GPLv3.
 *
 * The owner's personal code on the login screen: the form shown first when the
 * host has one, since whoever opens this page away from the host has no PIN to
 * read; counted apart from the PIN, so what one form said of attempts and
 * lockout is not carried to the other.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../js/api/BackendClient.js', () => ({
    BackendClient: {
        getAuthStatus: vi.fn(),
        validatePin: vi.fn(),
        validateAccessCode: vi.fn(),
        validateCertificate: vi.fn(async () => ({ status: 'ok' })),
    },
}));
vi.mock('../js/ui/Toast.js', () => ({
    Toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock('../js/i18n/i18n.js', () => ({
    t: (key, vars) => (vars && 'count' in vars ? `${key}:${vars.count}` : key),
}));
vi.mock('../js/net/tunnelBridge.js', () => ({
    tunnelHostId: () => null,
}));

import { LoginView } from '../js/ui/LoginView.js';
import { BackendClient } from '../js/api/BackendClient.js';

describe('the personal code on the login screen', () => {
    let view;
    let signedIn;

    const open = async (status) => {
        BackendClient.getAuthStatus.mockResolvedValue({ authenticated: false, ...status });
        document.body.innerHTML = '<div id="host"></div>';
        signedIn = vi.fn();
        view = new LoginView(document.getElementById('host'), signedIn);
        await view.start();
    };
    const codeInput = () =>
        /** @type {HTMLInputElement} */ (document.getElementById('login-code-input'));
    const unlock = () =>
        /** @type {HTMLButtonElement} */ (document.getElementById('btn-login-unlock'));
    const type = (text) => {
        codeInput().value = text;
        codeInput().dispatchEvent(new Event('input'));
    };
    const refuse = (statusCode, body) => {
        const err = new Error('refused');
        err.statusCode = statusCode;
        err.responseBody = body;
        BackendClient.validateAccessCode.mockRejectedValueOnce(err);
    };

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });
    afterEach(() => view && view.destroy());

    it('is not offered by a host that has none', async () => {
        await open({ remaining: 3 });
        expect(codeInput()).toBeNull();
        expect(document.getElementById('btn-toggle-code-mode')).toBeNull();
        expect(document.getElementById('login-pin-input')).not.toBeNull();
    });

    it('is the form shown first when the host has one', async () => {
        await open({ access_code_set: true, remaining: 3 });
        expect(codeInput()).not.toBeNull();
        expect(codeInput().type).toBe('password');
        expect(document.getElementById('login-pin-input')).toBeNull();
        expect(document.getElementById('btn-toggle-code-mode').textContent.trim()).toBe(
            'login.usePinNotCode',
        );
    });

    it('does not carry the PIN lockout the host reported to its own form', async () => {
        await open({ access_code_set: true, remaining: 1, lockout_seconds: 25 });
        expect(codeInput().disabled).toBe(false);
        expect(document.getElementById('login-remaining').textContent).toBe('');
    });

    it('needs six characters before it can be sent', async () => {
        await open({ access_code_set: true });
        expect(unlock().disabled).toBe(true);
        type('abc12');
        expect(unlock().disabled).toBe(true);
        type('  abc12 ');
        expect(unlock().disabled).toBe(true);
        type('abc123');
        expect(unlock().disabled).toBe(false);
    });

    it('signs in with the code, trimmed, the session name and the remember choice', async () => {
        BackendClient.validateAccessCode.mockResolvedValueOnce({ status: 'ok' });
        await open({ access_code_set: true });
        const name = /** @type {HTMLInputElement} */ (
            document.getElementById('login-machine-input')
        );
        name.value = 'Tesla';
        name.dispatchEvent(new Event('input'));
        const remember = /** @type {HTMLInputElement} */ (
            document.getElementById('login-remember')
        );
        remember.checked = false;
        remember.dispatchEvent(new Event('change'));
        type('  tournesol-42 ');
        unlock().click();
        await vi.waitFor(() => expect(signedIn).toHaveBeenCalled());
        expect(BackendClient.validateAccessCode).toHaveBeenCalledWith(
            'tournesol-42',
            'Tesla',
            false,
        );
        expect(BackendClient.validatePin).not.toHaveBeenCalled();
    });

    it('is sent by Enter as well', async () => {
        BackendClient.validateAccessCode.mockResolvedValueOnce({ status: 'ok' });
        await open({ access_code_set: true });
        type('tournesol-42');
        codeInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await vi.waitFor(() => expect(signedIn).toHaveBeenCalled());
    });

    it('says a wrong code, empties the field and counts the attempts left', async () => {
        await open({ access_code_set: true });
        refuse(401, { error: 'invalid_code', remaining: 2, lockout_seconds: 0 });
        type('wrong-code');
        unlock().click();
        await vi.waitFor(() =>
            expect(document.getElementById('login-error').textContent).toBe('login.invalidCode'),
        );
        expect(codeInput().value).toBe('');
        expect(document.getElementById('login-remaining').textContent).toBe(
            'login.attemptsRemaining:2',
        );
        expect(signedIn).not.toHaveBeenCalled();
    });

    it('locks its field for the time the host gives after too many wrong codes', async () => {
        await open({ access_code_set: true });
        refuse(429, { error: 'rate_limited', lockout_seconds: 30 });
        type('wrong-code');
        unlock().click();
        await vi.waitFor(() =>
            expect(document.getElementById('login-error').textContent).toBe(
                'login.tooManyAttempts',
            ),
        );
        expect(codeInput().disabled).toBe(true);
        expect(unlock().disabled).toBe(true);
        // The countdown itself is the translation's (this test's t() keeps the key).
        const lockout = document.getElementById('login-lockout');
        expect(lockout.style.display).not.toBe('none');
        expect(lockout.textContent.trim()).toBe('login.lockout');
    });

    it('shows the code when asked, and keeps it shown after a wrong one', async () => {
        await open({ access_code_set: true });
        const show = /** @type {HTMLInputElement} */ (document.getElementById('login-code-show'));
        show.checked = true;
        show.dispatchEvent(new Event('change'));
        expect(codeInput().type).toBe('text');
        refuse(401, { error: 'invalid_code', remaining: 2 });
        type('wrong-code');
        unlock().click();
        await vi.waitFor(() =>
            expect(document.getElementById('login-error').textContent).toBe('login.invalidCode'),
        );
        expect(codeInput().type).toBe('text');
    });

    it('gives way to the PIN, and back, with a clean count each time', async () => {
        await open({ access_code_set: true });
        refuse(401, { error: 'invalid_code', remaining: 1 });
        type('wrong-code');
        unlock().click();
        await vi.waitFor(() =>
            expect(document.getElementById('login-remaining').textContent).toBe(
                'login.attemptsRemaining:1',
            ),
        );

        document.getElementById('btn-toggle-code-mode').click();
        expect(document.getElementById('login-pin-input')).not.toBeNull();
        expect(codeInput()).toBeNull();
        expect(document.getElementById('login-remaining').textContent).toBe('');
        expect(document.getElementById('login-error').textContent).toBe('');
        expect(document.getElementById('btn-toggle-code-mode').textContent.trim()).toBe(
            'login.useCodeInstead',
        );

        document.getElementById('btn-toggle-code-mode').click();
        expect(codeInput()).not.toBeNull();
        expect(document.getElementById('login-remaining').textContent).toBe('');
    });
});
