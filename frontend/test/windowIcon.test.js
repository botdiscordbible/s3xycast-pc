/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * The icon of the window the program's page lives in (js/util/WindowIcon.js).
 *
 * The page opens in a browser window of its own, whose taskbar button carries
 * the page's icon. On the first subscriber's PC it carried the browser's
 * blank globe: through the entry page, the browser's own request for the icon
 * file came to nothing. The interface now reads the picture as it reads its
 * other files and hands it to the browser as a data: address, so that no
 * request of the browser's is left to fail.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { WINDOW_ICON_PATH, setWindowIcon } from '../js/util/WindowIcon.js';

const here = dirname(fileURLToPath(import.meta.url));
const frontend = join(here, '..');
const png = readFileSync(join(frontend, 'assets', 'icon-192.png'));

/** A fetch that serves the picture, the way the page's own would. */
const serving =
    (type = 'image/png', ok = true) =>
    async (path) => ({
        ok,
        status: ok ? 200 : 404,
        url: path,
        blob: async () => new Blob([png], { type }),
    });

const icons = () => [...document.querySelectorAll('link[rel~="icon"]')];

beforeEach(() => {
    document.head.innerHTML =
        '<title>S3XYCast PC</title>' +
        '<link rel="manifest" href="/manifest.webmanifest" />' +
        '<link rel="apple-touch-icon" sizes="180x180" href="/assets/icon-180.png" />' +
        '<link rel="icon" href="/assets/favicon.ico" type="image/x-icon" />';
});

describe('the window’s icon', () => {
    it('is a picture the interface already has, big enough for a taskbar', () => {
        expect(WINDOW_ICON_PATH).toBe('/assets/icon-192.png');
        // A PNG: its eight-byte signature.
        expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        // And part of what the page declares, so the list of the interface holds it.
        expect(readFileSync(join(frontend, 'manifest.webmanifest'), 'utf8')).toContain(
            'icon-192.png',
        );
    });

    it('is handed to the browser as the picture itself, not as an address to ask for', async () => {
        const asked = [];
        const fetchFn = async (path) => {
            asked.push(path);
            return serving()(path);
        };
        expect(await setWindowIcon({ fetchFn })).toBe(true);
        expect(asked).toEqual([WINDOW_ICON_PATH]);
        const [icon] = icons();
        expect(icons()).toHaveLength(1);
        expect(icon.getAttribute('href')).toMatch(/^data:image\/png;base64,/);
        expect(icon.type).toBe('image/png');
        // The whole picture, byte for byte.
        const sent = Buffer.from(icon.getAttribute('href').split(',')[1], 'base64');
        expect(sent.equals(png)).toBe(true);
    });

    it('replaces the declaration the page came with by a new one', async () => {
        const before = icons()[0];
        await setWindowIcon({ fetchFn: serving() });
        expect(before.isConnected).toBe(false);
        expect(document.querySelector('link[href="/assets/favicon.ico"]')).toBeNull();
        expect(icons()[0].parentNode).toBe(document.head);
    });

    it('leaves the phone’s home-screen icon and the manifest as they are', async () => {
        await setWindowIcon({ fetchFn: serving() });
        expect(document.querySelector('link[rel="apple-touch-icon"]').getAttribute('href')).toBe(
            '/assets/icon-180.png',
        );
        expect(document.querySelector('link[rel="manifest"]').getAttribute('href')).toBe(
            '/manifest.webmanifest',
        );
    });

    it('calls it a picture even when the server did not', async () => {
        await setWindowIcon({ fetchFn: serving('application/octet-stream') });
        expect(icons()[0].getAttribute('href')).toMatch(/^data:image\/png;base64,/);
        await setWindowIcon({ fetchFn: serving('') });
        expect(icons()[0].getAttribute('href')).toMatch(/^data:image\/png;base64,/);
    });

    it('changes nothing when the picture cannot be read', async () => {
        for (const fetchFn of [
            serving('image/png', false),
            async () => {
                throw new Error('offline');
            },
            async () => null,
            async () => ({
                ok: true,
                blob: async () => {
                    throw new Error('cut');
                },
            }),
        ]) {
            expect(await setWindowIcon({ fetchFn })).toBe(false);
            expect(icons()).toHaveLength(1);
            expect(icons()[0].getAttribute('href')).toBe('/assets/favicon.ico');
        }
    });

    it('sets it once more without piling declarations up', async () => {
        await setWindowIcon({ fetchFn: serving() });
        await setWindowIcon({ fetchFn: serving() });
        expect(icons()).toHaveLength(1);
    });
});

describe('where the icon is set and allowed', () => {
    const app = readFileSync(join(frontend, 'js', 'app.js'), 'utf8');

    it('is at the very start of the application, and waited for by nothing', () => {
        const init = app.slice(app.indexOf('    async init() {'));
        const start = init.slice(0, init.indexOf('migrateStoredCodecToAuto();'));
        expect(start).toContain('setWindowIcon().catch(() => {});');
        expect(start).not.toMatch(/await setWindowIcon/);
    });

    it('is a kind of address the pages’ security policy lets a picture come from', () => {
        // The interface served through the entry page (its service worker)…
        const worker = readFileSync(join(frontend, '..', 'bootstrap', 'sw.js'), 'utf8');
        expect(worker).toMatch(/img-src 'self' data: blob:/);
        // …and the same interface served by the PC itself.
        const server = readFileSync(
            join(frontend, '..', 'backend', 'src', 'server', 'HttpServer.cpp'),
            'utf8',
        );
        expect(server).toMatch(/img-src 'self' data: blob:/);
    });
});
