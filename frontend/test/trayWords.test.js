/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * The program's own words in French (backend/src/common/EditionWords.cpp): the
 * menu of the icon next to the clock and its notices, which MoonlightWeb has in
 * English only. This holds the French table against the program's tr() calls,
 * read from the C++ sources themselves: a sentence upstream adds or rewords has
 * no French until somebody writes it, and Qt would then show that one line in
 * English in the middle of a French menu. It fails here first.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const backend = (...path) =>
    readFileSync(join(here, '..', '..', 'backend', 'src', ...path), 'utf8');

const STRING = '"((?:[^"\\\\]|\\\\.)*)"';
/** The sentences a C++ file passes to tr(). */
function trCalls(text) {
    return [...text.matchAll(new RegExp(`\\btr\\(\\s*${STRING}`, 'g'))].map((m) => m[1]);
}
/** The table: { "English", "Français" }, on one line or two. */
function table(text) {
    return [...text.matchAll(new RegExp(`\\{\\s*${STRING},\\s*${STRING}\\s*\\}`, 'g'))].map(
        (m) => ({ english: m[1], french: m[2] }),
    );
}
const places = (text) => (text.match(/%\d/g) || []).sort().join(' ');

describe('the program’s own words, in French', () => {
    const spoken = [
        ...new Set([
            ...trCalls(backend('TrayManager.cpp')),
            ...trCalls(backend('ViewerNotices.cpp')),
        ]),
    ];
    const words = table(backend('common', 'EditionWords.cpp'));
    const french = Object.fromEntries(words.map((w) => [w.english, w.french]));

    it('finds the program’s sentences and the table', () => {
        expect(spoken.length).toBeGreaterThanOrEqual(29);
        expect(words.length).toBeGreaterThanOrEqual(29);
        expect(spoken).toContain('&Quit');
        expect(spoken).toContain('%1 started streaming this screen');
    });

    it('has a French sentence for every one the program says', () => {
        expect(spoken.filter((sentence) => !(sentence in french))).toEqual([]);
    });

    it('holds no sentence the program no longer says', () => {
        expect(words.map((w) => w.english).filter((english) => !spoken.includes(english))).toEqual(
            [],
        );
    });

    it('says each sentence once', () => {
        const seen = words.map((w) => w.english);
        expect(seen.filter((english, i) => seen.indexOf(english) !== i)).toEqual([]);
    });

    it('keeps the places Qt fills in: %1, %2, %3', () => {
        expect(words.filter((w) => places(w.english) !== places(w.french))).toEqual([]);
    });

    it('keeps one keyboard letter where the menu has one', () => {
        for (const { english, french: text } of words) {
            const had = (english.match(/&/g) || []).length;
            expect((text.match(/&/g) || []).length, english).toBe(had);
        }
    });

    it('gives the entries of one menu different keyboard letters', () => {
        // "Restart" and "Restart Server", "Quit" and "Quit Server" are the
        // same entry in the two shapes of the menu: one of each is shown.
        for (const menu of [
            ['&Open', '&Server Settings', 'Start at &login', '&Restart', '&Quit'],
            ['&Open', '&Server Settings', 'Start at &login', '&Restart Server', '&Quit Server'],
        ]) {
            const letters = menu.map((english) =>
                french[english].charAt(french[english].indexOf('&') + 1).toLowerCase(),
            );
            expect(new Set(letters).size, menu.join(' | ')).toBe(letters.length);
        }
    });

    it('is French: no sentence is left as it was', () => {
        expect(words.filter((w) => w.english === w.french)).toEqual([]);
        expect(french['&Server Settings']).toBe('&Réglages du PC');
        expect(french['%1 stopped streaming this screen']).toBe('%1 ne regarde plus cet écran');
    });
});

describe('where the program was touched for its French', () => {
    const main = backend('main.cpp');

    it('installs the translator right after the application object, before any menu', () => {
        const at = main.indexOf('mw::edition::installWords();');
        expect(at).toBeGreaterThan(-1);
        expect(main).toContain('#include "common/EditionWords.h"');
        const app = main.indexOf('QApplication app(argc, argv);');
        expect(app).toBeGreaterThan(-1);
        expect(at).toBeGreaterThan(app);
        // The tray of this process is built much later.
        expect(at).toBeLessThan(main.indexOf('TrayManager trayManager(&server);'));
    });
});
