/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * The words of the French catalogue. MoonlightWeb speaks of "the host": the
 * machine that streams, whatever it is. This edition's subscriber has one, and
 * calls it "mon PC"; "l'hôte" read as jargon on a hundred lines, from the
 * settings to the messages of a stream that stops (finishing pass, 17/11/2026).
 * The French catalogue says "PC" — "ordinateur" where the machine may be a
 * Mac or a Linux box, "propriétaire" for the person a guest plays with — and a
 * merge of a new upstream release that brings the word back fails here.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const catalogue = (lang) =>
    JSON.parse(readFileSync(join(here, '..', 'locales', `${lang}.json`), 'utf8'));

/** Every text of a catalogue, with its path. */
function texts(tree, path = []) {
    const out = [];
    for (const [key, value] of Object.entries(tree)) {
        if (typeof value === 'string') out.push([path.concat(key).join('.'), value]);
        else if (value && typeof value === 'object') out.push(...texts(value, path.concat(key)));
    }
    return out;
}

describe('the French catalogue', () => {
    const fr = texts(catalogue('fr'));

    it('never says "hôte"', () => {
        const still = fr.filter(([, text]) => /\bh[ôo]tes?\b/i.test(text)).map(([path]) => path);
        expect(still).toEqual([]);
    });

    it('keeps every variable the English text has', () => {
        // A sentence rewritten by hand must still carry what the page puts in.
        const en = Object.fromEntries(texts(catalogue('en')));
        const variables = (text) => (text.match(/\{\{[^}]+\}\}/g) || []).sort().join(' ');
        const lost = fr
            .filter(([path, text]) => path in en && variables(text) !== variables(en[path]))
            .map(([path]) => path);
        expect(lost).toEqual([]);
    });

    it('says what a stream that stops on the PC is, in the owner’s words', () => {
        const c = catalogue('fr');
        expect(c.stream.hostLostTitle).toBe('Le PC ne répond plus');
        expect(c.hosts.empty).toBe('Aucun PC trouvé');
        expect(c.apps.backToHosts).toBe('← Retour aux PC');
        expect(c.sharing.presenceHost).toBe('Propriétaire');
    });
});
