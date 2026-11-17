/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * The program's page in a window of its own (backend/src/common/AppWindow.h).
 *
 * The program opens its page in a browser window that holds nothing else, and
 * closes the one already open when it opens a new one. It tells its windows
 * from the browser's others by their title: the page's own and nothing more,
 * where an ordinary browser window adds the browser's name. That only holds
 * while the pages keep the title the program looks for — the entry page, the
 * interface, and the C++ constant. A title changed in one place would leave
 * a window open at every click; it fails here first.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const read = (...path) => readFileSync(join(root, ...path), 'utf8');

const header = read('backend', 'src', 'common', 'AppWindow.h');
const windowTitle = (/kWindowTitle\[\] = "([^"]+)"/.exec(header) || [])[1];
const titleOf = (html) => (/<title>([^<]*)<\/title>/.exec(html) || [])[1];

/** Every .js under a folder, tests and node_modules aside. */
function scripts(dir) {
    const found = [];
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules') continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) found.push(...scripts(path));
        else if (name.endsWith('.js') && !name.endsWith('.test.js')) found.push(path);
    }
    return found;
}

describe('the title the program knows its window by', () => {
    it('is the name of the program', () => {
        expect(windowTitle).toBe('S3XYCast PC');
    });

    it('is the interface’s', () => {
        expect(titleOf(read('frontend', 'index.html'))).toBe(windowTitle);
    });

    it('is the entry page’s, which the window shows first', () => {
        expect(titleOf(read('bootstrap', 'index.html'))).toBe(windowTitle);
    });

    it('is not changed by the page once it runs', () => {
        const writers = [
            ...scripts(join(root, 'frontend', 'js')),
            ...scripts(join(root, 'bootstrap', 'v1')),
        ].filter((path) => /document\.title\s*=[^=]/.test(readFileSync(path, 'utf8')));
        expect(writers).toEqual([]);
    });
});

describe('the places a page is opened from', () => {
    const tray = read('backend', 'src', 'TrayManager.cpp');
    const main = read('backend', 'src', 'main.cpp');

    it('all go to the window first, and to a tab only when there is none', () => {
        // The icon's menu and its notification.
        const openAppPage = tray.slice(tray.indexOf('void TrayManager::openAppPage('));
        const body = openAppPage.slice(0, openAppPage.indexOf('\n}\n'));
        // By the owner's link, and by this machine's own address: each time
        // the tab is what is done when the window was not.
        expect(body).toContain(
            'if (!mw::edition::appwindow::open(link)) QDesktopServices::openUrl(QUrl(link));',
        );
        expect(body).toMatch(
            /if \(!mw::edition::appwindow::open\(url\.toString\(QUrl::FullyEncoded\)\)\)\s*QDesktopServices::openUrl\(url\);/,
        );
        expect(body.match(/QDesktopServices::openUrl\(/g)).toHaveLength(2);
        expect(tray.match(/QDesktopServices::openUrl\(/g)).toHaveLength(2);
        // The shortcut, a second launch, the first start, the installer's ask.
        const opener = main.slice(main.indexOf('static bool openInBrowser('));
        const openerBody = opener.slice(0, opener.indexOf('\n}\n'));
        expect(openerBody).toMatch(
            /if \(mw::edition::appwindow::open\(url\)\) return true;\s*QDesktopServices::openUrl\(QUrl\(url\)\);/,
        );
        // Nothing else in the program opens a page behind its back.
        const direct = main
            .split('\n')
            .filter((l) => l.includes('QDesktopServices::openUrl(') && !l.trim().startsWith('//'));
        expect(direct).toHaveLength(1);
    });

    it('never write the address in the log: its end is a key', () => {
        const source = read('backend', 'src', 'common', 'AppWindow.cpp');
        // Said to the browser, and to nothing that writes.
        expect(source).toContain('arguments(url, isDefault, extra)');
        expect(source).not.toMatch(/<<\s*url\b/);
        expect(source).not.toMatch(/Logger::\w+\([^)]*\burl\b/);
    });

    it('wait for the old window to be closed before a one-shot command exits', () => {
        expect(main).toMatch(
            /if \(openInBrowser\(url\)\) waitMs\(mw::edition::appwindow::kCloseDelayMs \+ \d+\);/,
        );
    });
});
