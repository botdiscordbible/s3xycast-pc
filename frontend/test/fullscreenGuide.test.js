/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * Real full screen on an iPhone (js/ui/FullscreenGuide.js).
 *
 * Safari on iPhone lets no page hide its bars; the only screen without them is
 * the page opened from the Home Screen. Upstream said it in a line that faded
 * after four seconds. The edition says it in a card that stays until it is
 * closed, and that the viewer can ask never to see again.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../js/i18n/i18n.js', () => ({ t: (key) => key }));

import {
    FULLSCREEN_GUIDE_OFF_KEY,
    closeFullscreenGuide,
    fullscreenGuideOff,
    fullscreenGuideShown,
    showFullscreenGuide,
} from '../js/ui/FullscreenGuide.js';

const here = dirname(fileURLToPath(import.meta.url));
const source = (...path) => readFileSync(join(here, '..', ...path), 'utf8');
const card = () => document.querySelector('.fs-guide');

describe('the full-screen guide', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });
    afterEach(() => {
        closeFullscreenGuide();
        vi.useRealTimers();
    });

    it('says why, then the three taps, and stays', () => {
        vi.useFakeTimers();
        expect(showFullscreenGuide()).toBe(true);
        expect(fullscreenGuideShown()).toBe(true);
        const el = card();
        expect(el).not.toBeNull();
        expect(el.getAttribute('role')).toBe('dialog');
        expect(el.querySelector('.fs-guide-title').textContent).toBe('stream.fsGuideTitle');
        expect(el.querySelector('.fs-guide-why').textContent).toBe('stream.fsGuideWhy');
        const steps = [...el.querySelectorAll('.fs-guide-step')].map((s) => s.textContent);
        expect(steps).toEqual([
            'stream.fsGuideStep1',
            'stream.fsGuideStep2',
            'stream.fsGuideStep3',
        ]);
        // The Share glyph is drawn beside the step that names it.
        expect(el.querySelector('.fs-guide-step .fs-guide-share')).not.toBeNull();
        expect(el.querySelector('.fs-guide-note').textContent).toBe('stream.fsGuideNote');
        // Upstream's line was gone after four seconds: this one is still there.
        vi.advanceTimersByTime(60000);
        expect(card()).toBe(el);
    });

    it('is one card, however often it is asked for', () => {
        showFullscreenGuide();
        expect(showFullscreenGuide()).toBe(true);
        expect(document.querySelectorAll('.fs-guide')).toHaveLength(1);
    });

    it('closes on "Got it", and comes back the next time', () => {
        showFullscreenGuide();
        card().querySelector('.fs-guide-ok').click();
        expect(card()).toBeNull();
        expect(fullscreenGuideShown()).toBe(false);
        expect(fullscreenGuideOff()).toBe(false);
        showFullscreenGuide();
        expect(card()).not.toBeNull();
    });

    it('is not shown again once the viewer said so, in this browser', () => {
        showFullscreenGuide();
        card().querySelector('.fs-guide-never').click();
        expect(card()).toBeNull();
        expect(window.localStorage.getItem(FULLSCREEN_GUIDE_OFF_KEY)).toBe('1');
        expect(fullscreenGuideOff()).toBe(true);
        // The moment is still taken care of: the caller falls back to nothing.
        expect(showFullscreenGuide()).toBe(true);
        expect(card()).toBeNull();
    });

    it('keeps its touches from the stream under it', () => {
        showFullscreenGuide();
        const seen = vi.fn();
        document.body.addEventListener('touchstart', seen);
        document.body.addEventListener('pointerdown', seen);
        card()
            .querySelector('.fs-guide-box')
            .dispatchEvent(new Event('touchstart', { bubbles: true }));
        card()
            .querySelector('.fs-guide-box')
            .dispatchEvent(new Event('pointerdown', { bubbles: true }));
        expect(seen).not.toHaveBeenCalled();
        document.body.removeEventListener('touchstart', seen);
        document.body.removeEventListener('pointerdown', seen);
    });

    it('says it could not when there is nowhere to put it', () => {
        expect(showFullscreenGuide(null)).toBe(false);
        expect(card()).toBeNull();
    });

    it('is shown though storage is refused', () => {
        const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('denied');
        });
        expect(fullscreenGuideOff()).toBe(false);
        expect(showFullscreenGuide()).toBe(true);
        expect(card()).not.toBeNull();
        get.mockRestore();
    });
});

describe('where the stream shows it', () => {
    const fullscreen = source('js', 'ui', 'StreamViewFullscreen.js');

    it('takes the place of the four-second line, on an iPhone outside the Home Screen', () => {
        // Asked for exactly where upstream showed its hint, and before it.
        expect(fullscreen).toMatch(
            /const installHint = IS_IOS && !IS_STANDALONE && !this\._installHintShown;\s*if \(installHint\) this\._showInstallHint\(\);/,
        );
        expect(fullscreen).toMatch(
            /this\._installHintShown = true;\s*(?:\/\/[^\n]*\s*)*if \(showFullscreenGuide\(\)\) return;/,
        );
    });

    it('goes when that fullscreen is left', () => {
        expect(fullscreen).toMatch(
            /this\._hideFsBar\(\);\s*(?:\/\/[^\n]*\s*)*closeFullscreenGuide\(\);/,
        );
    });

    it('has its words in every language', () => {
        const keys = [
            'fsGuideTitle',
            'fsGuideWhy',
            'fsGuideStep1',
            'fsGuideStep2',
            'fsGuideStep3',
            'fsGuideNote',
            'fsGuideOk',
            'fsGuideNever',
        ];
        for (const lang of ['en', 'fr', 'tr', 'zh']) {
            const stream = JSON.parse(source('locales', `${lang}.json`)).stream;
            for (const key of keys) expect(stream[key], `${lang} ${key}`).toBeTruthy();
        }
        const fr = JSON.parse(source('locales', 'fr.json')).stream;
        expect(fr.fsGuideTitle).toBe('Vrai plein écran sur iPhone');
        // The words Safari itself shows, in French.
        expect(fr.fsGuideStep2).toContain("« Sur l'écran d'accueil »");
    });
});
