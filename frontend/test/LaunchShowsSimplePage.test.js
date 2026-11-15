/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * The program started again while it runs, as seen by the tab that is already
 * open on the PC. Upstream brings the administration page forward. This
 * edition shows the simple page (the state, the big button, a new version
 * announced first): the owner asked that whoever starts the program be told of
 * an update (15/11/2026), and that page is where it is said. A stream running
 * in the tab is never disturbed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MoonlightApp } from '../js/app.js';
import { BackendClient } from '../js/api/BackendClient.js';

describe('the program started again, in the tab already open on the PC', () => {
    let saved;
    let back;
    let open;

    beforeEach(() => {
        saved = {
            hostMachine: MoonlightApp._isRealHostMachine,
            overlay: MoonlightApp._nav.overlay,
            adminLocked: BackendClient.adminLocked,
        };
        MoonlightApp._isRealHostMachine = true;
        BackendClient.adminLocked = false;
        back = vi.spyOn(history, 'back').mockImplementation(() => {});
        open = vi.spyOn(MoonlightApp, '_openOverlay').mockImplementation(() => {});
        vi.spyOn(window, 'focus').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        MoonlightApp._isRealHostMachine = saved.hostMachine;
        MoonlightApp._nav.overlay = saved.overlay;
        BackendClient.adminLocked = saved.adminLocked;
    });

    it('leaves the simple page where it is', () => {
        MoonlightApp._nav.overlay = null;
        MoonlightApp._onFocusAdminRequest();
        expect(back).not.toHaveBeenCalled();
        expect(open).not.toHaveBeenCalled();
    });

    it('puts away the settings, which brings the simple page back', () => {
        for (const overlay of ['admin', 'settings']) {
            back.mockClear();
            MoonlightApp._nav.overlay = overlay;
            MoonlightApp._onFocusAdminRequest();
            expect(back, overlay).toHaveBeenCalledTimes(1);
            expect(open).not.toHaveBeenCalled();
        }
    });

    it('never disturbs a stream', () => {
        MoonlightApp._nav.overlay = 'streaming';
        MoonlightApp._onFocusAdminRequest();
        expect(back).not.toHaveBeenCalled();
        expect(open).not.toHaveBeenCalled();
    });

    it('keeps the way of the original where there is no simple page', () => {
        // A booth: no simple page is mounted there (app.js, _mountHostsBanners).
        BackendClient.adminLocked = true;
        MoonlightApp._nav.overlay = null;
        MoonlightApp._onFocusAdminRequest();
        expect(back).not.toHaveBeenCalled();
        expect(open).toHaveBeenCalledWith('admin');
    });

    it('opens the simple page, not the settings, through the popstate it relies on', () => {
        // What history.back() leads to: the handler closes the page that was
        // open and renders the main view, where the simple page is mounted.
        const source = String(MoonlightApp._initRouter);
        expect(source).toMatch(
            /this\._closeOverlay\(\);[\s\S]*this\._setMainView\('hosts', \{\}\);/,
        );
    });
});
