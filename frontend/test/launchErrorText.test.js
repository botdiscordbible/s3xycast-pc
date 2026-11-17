/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * What the page says when a screen does not open (util/LaunchErrorText.js).
 * The program answers in English, in its own words; from his car the owner read
 * "MW_CAPTURE=wgc" and "That display is no longer connected" (17/11/2026). The
 * sentences that come up are said in plain words; any other keeps its text,
 * behind a sentence that says what happened.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../js/i18n/i18n.js', () => ({
    t: (key, vars) => (vars ? `${key} ${JSON.stringify(vars)}` : key),
}));

import { launchErrorText } from '../js/util/LaunchErrorText.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('what the page says when a screen does not open', () => {
    it('says a screen that went away in plain words', () => {
        expect(launchErrorText('That display is no longer connected')).toBe('launch.displayGone');
        // The program appends its reason to some sentences.
        expect(launchErrorText('That display is no longer connected (output 2)')).toBe(
            'launch.displayGone',
        );
    });

    it('says a link that could not be opened, whichever way the program put it', () => {
        expect(launchErrorText('All transport modes failed')).toBe('launch.noRoute');
        expect(launchErrorText('No usable transport')).toBe('launch.noRoute');
    });

    it('says a PC that could not start its side', () => {
        expect(launchErrorText('Failed to spawn stream worker')).toBe('launch.pcCouldNotStart');
        expect(launchErrorText('Native streaming is not available on this machine')).toBe(
            'launch.noScreenNow',
        );
    });

    it('keeps any other sentence as the detail support will ask for', () => {
        expect(launchErrorText('MW_CAPTURE=wgc')).toBe(
            'launch.failedDetail {"detail":"MW_CAPTURE=wgc"}',
        );
        expect(launchErrorText('  NVENC: out of sessions  ')).toBe(
            'launch.failedDetail {"detail":"NVENC: out of sessions"}',
        );
    });

    it('does not take a sentence that merely contains a known one for it', () => {
        expect(launchErrorText('Cannot tell: That display is no longer connected')).toBe(
            'launch.failedDetail {"detail":"Cannot tell: That display is no longer connected"}',
        );
    });

    it('falls back on the plain "launch failed" when the program said nothing', () => {
        for (const nothing of [undefined, null, '', '   ', 42, {}]) {
            expect(launchErrorText(nothing)).toBe('launch.failed');
        }
    });
});

describe('those sentences, in every language the interface speaks', () => {
    const catalogue = (lang) =>
        JSON.parse(readFileSync(join(here, '..', 'locales', `${lang}.json`), 'utf8'));

    it('are all there', () => {
        for (const lang of ['en', 'fr', 'tr', 'zh']) {
            const launch = catalogue(lang).launch;
            for (const key of ['displayGone', 'noRoute', 'pcCouldNotStart', 'noScreenNow']) {
                expect(launch[key], `${lang} ${key}`).toBeTruthy();
            }
            expect(launch.failedDetail, lang).toContain('{{detail}}');
        }
    });

    it('name no host and no transport in French', () => {
        const launch = catalogue('fr').launch;
        for (const key of [
            'displayGone',
            'noRoute',
            'pcCouldNotStart',
            'noScreenNow',
            'failedDetail',
        ]) {
            expect(launch[key], key).not.toMatch(/hôte|transport|worker|stream/i);
        }
    });
});

describe('where the application was touched for it', () => {
    // One line in a very long upstream file: a merge of a new upstream release
    // would put the program's raw sentence back on the car's screen.
    const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');

    it('a failed launch is said through launchErrorText', () => {
        expect(app).toContain("import { launchErrorText } from './util/LaunchErrorText.js';");
        expect(app).toContain('launchErrorText(err && err.message);');
        expect(app).not.toContain(": err.message || t('launch.failed');");
    });
});
