/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * A box that does not open ports: the rule to make by hand.
 *
 * The program asks the box for its ports (UPnP). Where the box does not
 * answer — a subscriber's own, which says UPnP is on and answers nothing —
 * streams from outside go through the relay, a detour of several tens of
 * milliseconds each way. The way out upstream documents is a rule made by
 * hand: the stream's UDP ports, forwarded to the PC under the same numbers.
 * The administration page said only "turn on UPnP"; it now says the rule
 * too. The numbers are the program's own (RouterPortPools.h): if the block
 * ever moves, the sentence has to move with it — it fails here first.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const read = (...path) => readFileSync(join(root, ...path), 'utf8');

const pools = read('backend', 'src', 'network', 'RouterPortPools.h');
const first = Number((/constexpr uint16_t kMediaBasePort = (\d+);/.exec(pools) || [])[1]);
const count = Number((/constexpr int kMediaPortCount = (\d+);/.exec(pools) || [])[1]);
const last = first + count - 1;

describe('the stream’s ports', () => {
    it('are a block the program never moves a slot out of', () => {
        expect(first).toBe(48550);
        expect(count).toBe(24);
        expect(last).toBe(48573);
        // "Each stream slot binds 48550 + slot locally, and that never changes."
        expect(pools).toMatch(
            /Each stream slot binds 48550 \+ slot locally, and that never changes/,
        );
    });

    it('are the ones upstream tells an owner to forward by hand, in UDP', () => {
        const reference = read('docs', 'wiki', '07-Settings-Reference.md');
        expect(reference).toContain(`UDP ${first}-${last}`);
        // The same numbers outside and inside: a rule that translates the
        // port leads nowhere.
        expect(reference).toMatch(/the UDP rules may not/);
    });
});

describe('what the administration page says of a box that opens nothing', () => {
    for (const lang of ['en', 'fr', 'tr', 'zh']) {
        it(`names the rule to make by hand (${lang})`, () => {
            const words = JSON.parse(read('frontend', 'locales', lang + '.json'));
            const note = words.admin.upnpUnavailableNote;
            expect(note).toContain(String(first));
            expect(note).toContain(String(last));
            expect(note).toContain('UDP');
            // Still the first thing offered: the box doing it by itself.
            expect(note).toContain('UPnP');
            expect(note.indexOf('UPnP')).toBeLessThan(note.indexOf(String(first)));
        });
    }

    it('is shown where the box was asked and did not answer', () => {
        const admin = read('frontend', 'js', 'ui', 'AdminView.js');
        expect(admin).toMatch(
            /this\._upnpAvailable\s*\? t\('admin\.upnpAvailableNote'\)\s*: t\('admin\.upnpUnavailableNote'\)/,
        );
    });
});
