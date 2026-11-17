/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * Which way the stream goes: straight to the PC, or through the relay.
 *
 * Where a box opens no port, a stream from outside goes through the S3XYCast
 * relay. The transport knew which way each stream went and nothing showed it:
 * an owner who had just made a rule on his box had no way to see whether it
 * worked. The stream now says it — a line in its statistics, and one notice
 * at the start of a stream from outside the PC's network.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../js/i18n/i18n.js', () => ({
    t: (key) => key,
    getLanguage: () => 'en',
}));

import { StreamViewRoute, routeWords } from '../js/ui/StreamViewRoute.js';

const here = dirname(fileURLToPath(import.meta.url));
const source = (...path) => readFileSync(join(here, '..', ...path), 'utf8');

function makeView(fields = {}) {
    const proto = {};
    for (const name of Object.getOwnPropertyNames(StreamViewRoute.prototype)) {
        if (name === 'constructor') continue;
        Object.defineProperty(
            proto,
            name,
            Object.getOwnPropertyDescriptor(StreamViewRoute.prototype, name),
        );
    }
    return Object.assign(Object.create(proto), fields);
}

describe('the words for a route', () => {
    it('are the relay’s when the stream goes through it', () => {
        expect(routeWords(true)).toEqual({
            stat: 'stream.statRouteRelay',
            notice: 'stream.routeRelay',
        });
    });

    it('are the direct link’s when it does not', () => {
        expect(routeWords(false)).toEqual({
            stat: 'stream.statRouteDirect',
            notice: 'stream.routeDirect',
        });
    });

    it('are none while the browser has not said', () => {
        expect(routeWords(null)).toBeNull();
        expect(routeWords(undefined)).toBeNull();
        expect(routeWords('relay')).toBeNull();
    });
});

describe('the stream’s view', () => {
    it('has no line for the route before the transport has said it', () => {
        expect(makeView()._routeStat()).toBeNull();
    });

    it('keeps what the transport says, and tells its owner', () => {
        const onRoute = vi.fn();
        const view = makeView({ onRoute });
        view._onStreamRoute(true);
        expect(view._routeStat()).toEqual({
            label: 'stream.statRoute',
            value: 'stream.statRouteRelay',
        });
        expect(onRoute).toHaveBeenCalledWith(true);
        view._onStreamRoute(false);
        expect(view._routeStat().value).toBe('stream.statRouteDirect');
        expect(onRoute).toHaveBeenLastCalledWith(false);
    });

    it('says nothing of a route the browser could not name', () => {
        const onRoute = vi.fn();
        const view = makeView({ onRoute });
        view._onStreamRoute(null);
        expect(view._routeStat()).toBeNull();
        expect(onRoute).not.toHaveBeenCalled();
        // And works with no owner listening.
        makeView()._onStreamRoute(true);
    });
});

describe('where the route is read and said', () => {
    const view = source('js', 'ui', 'StreamView.js');
    const app = source('js', 'app.js');
    const channel = source('js', 'api', 'WebRtcDataChannel.js');
    const media = source('js', 'api', 'WebRtcMedia.js');

    it('comes from both WebRTC transports, once their link is up', () => {
        for (const transport of [channel, media]) {
            expect(transport).toMatch(/routeIsRelayed\(pc\)\.then\(\(relayed\) => \{/);
            expect(transport).toContain('if (this.onRoute) this.onRoute(relayed);');
        }
    });

    it('is taken by the view, which has a line for it in its statistics', () => {
        expect(view).toContain('this.webrtc.onRoute = (relayed) => this._onStreamRoute(relayed);');
        expect(view).toMatch(
            /const route = this\._routeStat\(\);\s*if \(route\) rows\.push\(legRow\(escapeHtml\(route\.label\), escapeHtml\(route\.value\)\)\);/,
        );
        expect(view).toMatch(/StreamViewQuick,\s*StreamViewRoute,\s*StreamViewFullscreen,/);
    });

    it('is said once, at a stream the viewer started from outside the PC’s network', () => {
        expect(app).toContain('sv.onRoute = (relayed) => this._sayStreamRoute(sv, relayed);');
        const say = app.slice(app.indexOf('    _sayStreamRoute(sv, relayed) {'));
        const body = say.slice(0, say.indexOf('\n    },'));
        // Once: the flag is spent before anything is said.
        expect(body).toMatch(
            /if \(!this\._routeNoticeDue \|\| sv !== this\.streamView\) return;\s*this\._routeNoticeDue = false;/,
        );
        // Not on the PC's own network, and never to a guest.
        expect(body).toContain('if (this._viewerOnLan === true || sv._playerMode) return;');
        expect(body).toContain('if (words) Toast.info(t(words.notice));');
        // Due at a launch the viewer asked for, not at a relaunch of it.
        expect(app).toContain('this._routeNoticeDue = !suppressShortcuts;');
    });

    it('has its words in the four languages', () => {
        for (const lang of ['en', 'fr', 'tr', 'zh']) {
            const words = JSON.parse(source('locales', lang + '.json')).stream;
            for (const key of [
                'statRoute',
                'statRouteDirect',
                'statRouteRelay',
                'routeDirect',
                'routeRelay',
            ]) {
                expect(typeof words[key], `${lang} ${key}`).toBe('string');
                expect(words[key].length, `${lang} ${key}`).toBeGreaterThan(1);
            }
            // The relay is named: it is S3XYCast's, not the box's.
            expect(words.statRouteRelay).toContain('S3XYCast');
            expect(words.routeRelay).toContain('S3XYCast');
        }
    });
});
