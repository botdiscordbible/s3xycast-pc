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
 * The About window, and the rule it exists for: the interface only says
 * « S3XYCast PC », and the project it is made from — its name, its author,
 * its copyright and the licence — is one click away from the footer of every
 * page, kept there as that project's COPYRIGHT file asks of a fork.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// The key, then what it was given: enough to see which names reach which text.
vi.mock('../js/i18n/i18n.js', () => ({
    t: (key, vars) => (vars ? `${key} ${JSON.stringify(vars)}` : key),
}));

const { mountAboutButton, openAbout } = await import('../js/ui/AboutDialog.js');
const brand = await import('../js/brand.js');

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = join(HERE, '..');
const LANGS = ['en', 'fr', 'tr', 'zh'];
const UPSTREAM = /moonlight ?web/i;

function locale(lang) {
    return JSON.parse(readFileSync(join(FRONTEND, 'locales', `${lang}.json`), 'utf8'));
}

/** Every text of a catalogue, with its dotted key. */
function texts(node, path = '', out = []) {
    if (typeof node === 'string') out.push([path, node]);
    else if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) texts(v, path ? `${path}.${k}` : k, out);
    }
    return out;
}

async function close() {
    const pending = openAbout._pending;
    /** @type {HTMLElement|null} */ (document.querySelector('.about-box [data-close]'))?.click();
    await pending;
}

afterEach(async () => {
    await close();
    document.body.innerHTML = '';
});

describe('AboutDialog (what the program is, its licence, where it comes from)', () => {
    it('credits the original project and its author, with its copyright line', () => {
        openAbout();
        const origin = document.querySelector('.about-box [data-part="origin"]');
        expect(origin.querySelector('.about-part-text').textContent).toBe(
            `footer.credits ${JSON.stringify({
                name: brand.BRAND_NAME,
                upstream: brand.UPSTREAM_NAME,
                author: brand.UPSTREAM_AUTHOR,
            })}`,
        );
        expect(origin.querySelector('.about-copyright').textContent).toBe(
            'MoonlightWeb — Copyright © 2026 Bruno Martin',
        );
        const link = origin.querySelector('a');
        expect(link.getAttribute('href')).toBe('https://github.com/linckosz/moonlight-web');
        expect(link.getAttribute('target')).toBe('_blank');
        expect(link.getAttribute('rel')).toContain('noopener');
    });

    it('says the licence, that there is no warranty, and where to read it', () => {
        openAbout();
        const licence = document.querySelector('.about-box [data-part="licence"]');
        expect(licence.querySelector('.about-part-text').textContent).toContain('footer.aboutFree');
        const link = licence.querySelector('a');
        expect(link.getAttribute('href')).toBe('https://www.gnu.org/licenses/gpl-3.0.html');
        expect(link.textContent).toBe('footer.aboutLicenceLink');
        expect(link.getAttribute('rel')).toContain('noopener');
    });

    it("offers this edition's source exactly when brand.js has an address for it", () => {
        openAbout();
        const links = [...document.querySelectorAll('.about-box a')].map((a) => a.textContent);
        expect(links.includes('footer.aboutSourceLink')).toBe(Boolean(brand.EDITION_SOURCE_URL));
    });

    it('shows the version the header shows, and nothing before the PC has answered', async () => {
        document.body.innerHTML =
            '<header class="app-header"><span class="version">v0.4.3</span></header>';
        openAbout();
        expect(document.querySelector('.about-version').textContent).toBe(
            'footer.aboutVersion {"version":"0.4.3"}',
        );
        await close();

        /** @type {HTMLElement} */ (document.querySelector('.version')).hidden = true;
        openAbout();
        expect(document.querySelector('.about-box')).not.toBeNull();
        expect(document.querySelector('.about-version')).toBeNull();
    });

    it('closes on its button, on Escape and on a click beside the box', async () => {
        let closed = openAbout();
        /** @type {HTMLElement} */ (document.querySelector('.about-box [data-close]')).click();
        await closed;
        expect(document.querySelector('.about-box')).toBeNull();

        closed = openAbout();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await closed;
        expect(document.querySelector('.about-box')).toBeNull();

        closed = openAbout();
        /** @type {HTMLElement} */ (document.querySelector('.about-overlay')).click();
        await closed;
        expect(document.querySelector('.about-box')).toBeNull();
    });

    it('stays open on a click inside the box', () => {
        openAbout();
        /** @type {HTMLElement} */ (document.querySelector('.about-lead')).click();
        expect(document.querySelector('.about-box')).not.toBeNull();
    });

    it('is one window, however many times it is asked for', () => {
        const first = openAbout();
        expect(openAbout()).toBe(first);
        expect(document.querySelectorAll('.about-box')).toHaveLength(1);
    });

    it('gives the focus back to what opened it', async () => {
        document.body.innerHTML = '<button id="btn-about">About</button>';
        const btn = document.getElementById('btn-about');
        btn.focus();
        const closed = openAbout();
        expect(document.activeElement).toBe(document.querySelector('.about-box [data-close]'));
        /** @type {HTMLElement} */ (document.querySelector('.about-box [data-close]')).click();
        await closed;
        expect(document.activeElement).toBe(btn);
    });
});

describe('the footer’s About button', () => {
    it('opens the window, and is wired once however often the app boots its chrome', () => {
        document.body.innerHTML = '<footer><button id="btn-about">About</button></footer>';
        mountAboutButton();
        mountAboutButton();
        document.getElementById('btn-about').click();
        expect(document.querySelectorAll('.about-box')).toHaveLength(1);
    });

    it('does nothing on a page without a footer (a guest, the stream)', () => {
        document.body.innerHTML = '';
        expect(() => mountAboutButton()).not.toThrow();
    });

    it('is in the page, where the credit line used to be', () => {
        const html = readFileSync(join(FRONTEND, 'index.html'), 'utf8');
        const footer = html.match(/<footer class="app-footer">[\s\S]*?<\/footer>/)?.[0] ?? '';
        expect(footer).toMatch(/<button[^>]*id="btn-about"[^>]*data-i18n="footer\.about"/);
        expect(footer).not.toMatch(/<a\b/);
    });
});

describe('the interface only says « S3XYCast PC »', () => {
    it.each(LANGS)('%s: no text of the catalogue writes the original project’s name', (lang) => {
        const named = texts(locale(lang))
            .filter(([, text]) => UPSTREAM.test(text))
            .map(([key]) => key);
        expect(named).toEqual([]);
    });

    it.each(LANGS)('%s: the credit takes both names from brand.js', (lang) => {
        const { credits } = locale(lang).footer;
        expect(credits).toContain('{{upstream}}');
        expect(credits).toContain('{{author}}');
    });

    it('nor does the page itself, outside its comments', () => {
        const html = readFileSync(join(FRONTEND, 'index.html'), 'utf8').replace(
            /<!--[\s\S]*?-->/g,
            '',
        );
        expect(html).not.toMatch(UPSTREAM);
    });

    it('nor the name the home screen and the installed app go by', () => {
        const manifest = readFileSync(join(FRONTEND, 'manifest.webmanifest'), 'utf8');
        expect(manifest).not.toMatch(UPSTREAM);
    });
});
