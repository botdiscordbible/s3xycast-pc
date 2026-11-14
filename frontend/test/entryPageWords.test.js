/*
 * S3XYCast PC — the S3XYCast edition of MoonlightWeb.
 * Copyright (C) 2026 Bruno Martin <brunoocto@gmail.com> (MoonlightWeb)
 * Modifications for the S3XYCast edition, 2026.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 */

/**
 * The entry page in French (bootstrap/v1/words.js).
 *
 * The page's sentences are written in English where each thing happens
 * (boot.js, tunnel.js) and go through tr() on their way to the screen. This
 * reads the two scripts and holds the French table complete: a sentence added
 * upstream, or reworded, fails here instead of showing up in English on a
 * car's screen. It also holds the page to the edition's name.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { sentencesOf, tr } from '../../bootstrap/v1/words.js';

const BOOTSTRAP = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bootstrap');
const read = (name) => readFileSync(join(BOOTSTRAP, name), 'utf8');
const SCRIPTS = ['v1/boot.js', 'v1/tunnel.js'];

/** A script less its comments, so that prose about a sentence is not one. */
function code(source) {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/**
 * The sentences a script can put on screen: every chain of single-quoted
 * literals ('…' + '…') that reads as a sentence and is not an argument of a
 * console call.
 */
function sentences(source) {
    const text = code(source);
    const chain = /'(?:[^'\\\n]|\\.)*'(?:\s*\+\s*'(?:[^'\\\n]|\\.)*')*/g;
    const found = [];
    for (const m of text.matchAll(chain)) {
        const logged = text.lastIndexOf('console.', m.index);
        if (logged >= 0 && !text.slice(logged, m.index).includes(';')) continue;
        const value = [...m[0].matchAll(/'((?:[^'\\\n]|\\.)*)'/g)]
            .map((p) => p[1].replace(/\\(.)/g, '$1'))
            .join('');
        // A capital, then words: « Not connected », « A S3XYCast PC link… »,
        // not an SVG path (no word in it) or a header name. The lower-case
        // reasons are held by name below.
        const worded = /^[A-Z]/.test(value) && /[ …]/.test(value) && /[a-z]{3,}/.test(value);
        if (worded || /^[A-Z][a-z]+[.…]?$/.test(value)) found.push(value);
    }
    return [...new Set(found)];
}

/** Literals of that shape the page never shows. */
const NOT_SHOWN = new Set([
    // A key's name, compared with what the keyboard sent.
    'Escape',
]);

describe('the entry page speaks French to a French browser', () => {
    for (const script of SCRIPTS) {
        it(`${script}: every sentence it can show has its French`, () => {
            const missing = sentences(read(script))
                .filter((s) => !NOT_SHOWN.has(s))
                .filter((s) => tr(s, 'fr') === s);
            expect(missing).toEqual([]);
        });
    }

    it('the words the markup starts with have theirs too', () => {
        const html = read('index.html');
        for (const id of ['stage', 'status', 'reload', 'forget']) {
            const text = html.match(new RegExp(`id="${id}"[^>]*>([^<]+)<`))?.[1];
            expect(text, id).toBeTruthy();
            expect(tr(text, 'fr'), id).not.toBe(text);
        }
    });

    it('the reasons a failure carries are translated inside its sentence', () => {
        expect(
            tr(
                'The interface did not come through: your machine did not send its main page.',
                'fr',
            ),
        ).toBe('L’interface n’est pas arrivée : votre PC n’a pas envoyé sa page principale.');
        expect(tr('Refused: this browser could not sign its own answer.', 'fr')).toBe(
            'Refusé : ce navigateur n’a pas pu signer sa réponse.',
        );
        expect(tr('12 of 348 files', 'fr')).toBe('12 fichiers sur 348');
    });

    it('a reason it does not know stays as it was written, in its sentence', () => {
        expect(tr('The interface did not come through: HTTP 502.', 'fr')).toBe(
            'L’interface n’est pas arrivée : HTTP 502.',
        );
    });

    it('holds a reason for each one the scripts throw', () => {
        const reasons = SCRIPTS.flatMap((script) =>
            [...code(read(script)).matchAll(/new Error\('([a-z][^']*)'\)/g)].map((m) => m[1]),
        );
        expect(reasons.length).toBeGreaterThan(3);
        expect(reasons.filter((r) => tr(r, 'fr') === r)).toEqual([]);
    });

    it('leaves another language, and anything that is not a sentence, alone', () => {
        expect(tr('Not connected', 'en')).toBe('Not connected');
        expect(tr('Not connected', 'de')).toBe('Not connected');
        expect(tr('DESKTOP-AB12CD3', 'fr')).toBe('DESKTOP-AB12CD3');
        expect(tr('', 'fr')).toBe('');
        expect(tr(undefined, 'fr')).toBeUndefined();
    });

    it('has no French for a sentence the page no longer says', () => {
        const said = new Set(SCRIPTS.flatMap((script) => sentences(read(script))));
        const html = read('index.html');
        const reasons = new Set(
            SCRIPTS.flatMap((script) =>
                [...code(read(script)).matchAll(/'([a-z][^']*)'/g)].map((m) => m[1]),
            ),
        );
        // A reason may also be the variable part of a sentence written whole
        // (« Refused: … . »).
        const within = (s) => [...said].some((sentence) => sentence.includes(s));
        const stale = sentencesOf('fr').filter(
            (s) => !said.has(s) && !reasons.has(s) && !within(s) && !html.includes(`>${s}<`),
        );
        expect(stale).toEqual([]);
    });
});

describe('the entry page only says « S3XYCast PC »', () => {
    const UPSTREAM = /moonlight ?web/i;

    it.each(SCRIPTS)('%s: no sentence names the original project', (script) => {
        expect(sentences(read(script)).filter((s) => UPSTREAM.test(s))).toEqual([]);
    });

    it('nor the French table, nor the page outside its comments', () => {
        expect(
            sentencesOf('fr').filter((s) => UPSTREAM.test(s) || UPSTREAM.test(tr(s, 'fr'))),
        ).toEqual([]);
        const html = read('index.html')
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/\/\*[\s\S]*?\*\//g, '');
        expect(html).not.toMatch(UPSTREAM);
    });
});
