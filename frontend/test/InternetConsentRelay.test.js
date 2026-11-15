/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * MoonlightWeb streams directly or not at all, and its agreement says so:
 * "Streaming is direct". This edition has a relay of last resort
 * (deploy/s3xycast-relais): when a router opens no port, the encrypted stream
 * passes through the edition's server. What is recorded as consent is the text
 * that was on screen, so every surface of the agreement has to say it — the
 * wizard, the settings page and the installer, in each language they speak.
 *
 * Upstream's own pin (InternetConsentText.test.js) keeps the surfaces one text;
 * this one keeps that text true about the relay.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const ISS = readFileSync(join(REPO, 'backend', 'installer', 'moonlightweb.iss'), 'utf8');

// How each language names the relay, the same word its settings page uses
// (admin.upnpUnavailableNote).
const RELAY = {
    en: 'S3XYCast relay',
    fr: 'relais de S3XYCast',
    tr: 'S3XYCast aktarıcısı',
    zh: 'S3XYCast 中继',
};
// A sentence that promised a stream that never leaves the direct path.
const ONLY_DIRECT = [
    'Streaming is direct, from this PC',
    'Le streaming est direct, de ce PC',
    'Yayın doğrudan bu bilgisayardan davet ettiğiniz tarayıcıya yapılır.',
    '串流是点对点直连的',
];

function locale(lang) {
    return JSON.parse(readFileSync(join(REPO, 'frontend', 'locales', `${lang}.json`), 'utf8'));
}

function installerBody(lang) {
    const line = ISS.split(/\r?\n/).find((l) => l.startsWith(`${lang}.InternetPageBody=`));
    return line ? line.slice(`${lang}.InternetPageBody=`.length) : null;
}

describe('Internet consent text and the relay', () => {
    it.each(Object.keys(RELAY))('wizard and settings page name the relay (%s)', (lang) => {
        const l = locale(lang);
        for (const text of [l.setup.internetBody, l.admin.internetInfo1]) {
            expect(text).toContain(RELAY[lang]);
            for (const old of ONLY_DIRECT) expect(text).not.toContain(old);
        }
        // The settings page says the same of a router that opens nothing.
        expect(l.admin.upnpUnavailableNote).toContain(
            RELAY[lang].replace('relais de S3XYCast', 'relais S3XYCast'),
        );
    });

    it('the installer names it in every language it speaks', () => {
        const spoken = Object.keys(RELAY).filter((lang) => installerBody(lang) !== null);
        expect(spoken).toEqual(['en', 'fr', 'zh']);
        for (const lang of spoken) {
            expect(installerBody(lang)).toContain(RELAY[lang]);
            for (const old of ONLY_DIRECT) expect(installerBody(lang)).not.toContain(old);
        }
    });
});
