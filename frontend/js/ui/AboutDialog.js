/*
 * S3XYCast PC — the S3XYCast edition of MoonlightWeb.
 * Copyright (C) 2026 Bruno Martin <brunoocto@gmail.com> (MoonlightWeb)
 * Modifications for the S3XYCast edition, 2026.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * AboutDialog — what this program is, its licence, and where it comes from.
 *
 * The one place of the interface that names the project this edition is made
 * from. Its COPYRIGHT file asks a fork to keep the notice and to credit the
 * author, and the GPL asks an interactive program for its legal notices
 * somewhere easy to find (the copyright, no warranty, the licence and how to
 * read it): this window is both, a click away from the footer of every page.
 * The rest of the interface only says « S3XYCast PC ».
 */

import { t } from '../i18n/i18n.js';
import { escapeHtml } from '../util/escapeHtml.js';
import {
    BRAND_NAME,
    EDITION_SOURCE_URL,
    LICENCE_URL,
    UPSTREAM_AUTHOR,
    UPSTREAM_NAME,
    UPSTREAM_URL,
    UPSTREAM_YEAR,
} from '../brand.js';

/** The footer's button (index.html). */
const BUTTON_ID = 'btn-about';

/** The version the header shows once the PC has answered ('' before that). */
function shownVersion() {
    const el = /** @type {HTMLElement|null} */ (document.querySelector('.app-header .version'));
    if (!el || el.hidden) return '';
    return (el.textContent || '').trim().replace(/^v/i, '');
}

function link(href, label) {
    return `<a class="about-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

/**
 * Open the window. One at a time: a second call while it is up returns the
 * first one's promise.
 *
 * @returns {Promise<void>} once closed
 */
export function openAbout() {
    if (openAbout._pending) return openAbout._pending;
    openAbout._pending = new Promise((resolve) => {
        const names = { name: BRAND_NAME, upstream: UPSTREAM_NAME, author: UPSTREAM_AUTHOR };
        const version = shownVersion();
        const opener = /** @type {HTMLElement|null} */ (document.activeElement);
        const el = document.createElement('div');
        el.className = 'share-popin-overlay about-overlay';
        el.innerHTML = `
            <div class="share-popin about-box" role="dialog" aria-modal="true" aria-labelledby="about-title">
                <div class="about-head">
                    <span class="about-logo" aria-hidden="true"></span>
                    <div class="about-head-text">
                        <h3 id="about-title">${escapeHtml(t('footer.aboutTitle', names))}</h3>
                        ${version ? `<div class="about-version">${escapeHtml(t('footer.aboutVersion', { version }))}</div>` : ''}
                    </div>
                </div>
                <p class="about-lead">${escapeHtml(t('footer.aboutLead', names))}</p>
                <div class="about-part" data-part="licence">
                    <div class="about-part-title">${escapeHtml(t('footer.aboutFreeTitle'))}</div>
                    <p class="about-part-text">${escapeHtml(t('footer.aboutFree', names))}</p>
                    ${link(LICENCE_URL, t('footer.aboutLicenceLink'))}
                    ${EDITION_SOURCE_URL ? link(EDITION_SOURCE_URL, t('footer.aboutSourceLink')) : ''}
                </div>
                <div class="about-part" data-part="origin">
                    <div class="about-part-title">${escapeHtml(t('footer.aboutOriginTitle'))}</div>
                    <p class="about-part-text">${escapeHtml(t('footer.credits', names))}</p>
                    <p class="about-part-text about-copyright">${escapeHtml(`${UPSTREAM_NAME} — Copyright © ${UPSTREAM_YEAR} ${UPSTREAM_AUTHOR}`)}</p>
                    ${link(UPSTREAM_URL, t('footer.aboutOriginLink'))}
                </div>
                <div class="share-popin-actions">
                    <button type="button" class="btn" data-close data-nav-initial>${escapeHtml(t('common.close'))}</button>
                </div>
            </div>
        `;
        const done = () => {
            document.removeEventListener('keydown', onKey, true);
            el.remove();
            openAbout._pending = null;
            // Back where the reader was, for a keyboard or a TV remote.
            if (opener && document.contains(opener)) opener.focus?.();
            resolve();
        };
        const onKey = (e) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            e.stopPropagation();
            done();
        };
        el.addEventListener('click', (e) => {
            const target = /** @type {Element} */ (e.target);
            if (target === el || target.closest('[data-close]')) done();
        });
        document.addEventListener('keydown', onKey, true);
        document.body.appendChild(el);
        // The button takes the focus (Enter closes, a TV remote starts there)
        // without pulling a phone's box down to it: the window opens on its
        // title, and the reader scrolls to the rest.
        /** @type {HTMLElement|null} */ (el.querySelector('[data-close]'))?.focus({
            preventScroll: true,
        });
        const box = el.querySelector('.about-box');
        if (box) box.scrollTop = 0;
    });
    return openAbout._pending;
}
/** @type {Promise<void>|null} */
openAbout._pending = null;

/**
 * Wire the footer's button. Once: the footer is static markup that outlives
 * every view, and this runs at boot.
 */
export function mountAboutButton() {
    const btn = document.getElementById(BUTTON_ID);
    if (!btn || btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => {
        openAbout();
    });
}
