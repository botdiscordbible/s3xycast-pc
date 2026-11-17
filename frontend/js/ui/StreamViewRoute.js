/*
 * S3XYCast PC — an edition of MoonlightWeb. GPLv3, like the rest of the tree.
 *
 * Which way the stream goes: straight to the PC, or through the relay.
 *
 * Where a box opens no port, a stream from outside goes through the S3XYCast
 * relay: it works, and it is a detour. The transport has known which way each
 * stream went since the relay exists (WebRtcDataChannel.onRoute) and nothing
 * showed it. An owner who had just made a rule on his box to do without the
 * relay had no way to see whether it worked ("comment savoir si je passe par
 * ma box direct ou par le serveur vps", 17/11/2026) — short of having the
 * PC's log read for him.
 *
 * So the stream says it: a line in its statistics, and the view tells its
 * owner (`onRoute`), who says it once at the start of a stream from outside
 * the PC's network (app.js). On that network there is nothing to choose
 * between, and nothing is said.
 *
 * Plain prototype methods (`this` = the StreamView instance), copied onto
 * StreamView.prototype at the bottom of StreamView.js.
 */
import { t } from '../i18n/i18n.js';

/** @typedef {import('./StreamView.js').StreamView} StreamViewInstance */

/**
 * The words for a route: the statistics' value and the notice. Null while the
 * browser has not said which it is.
 * @param {boolean|null|undefined} relayed
 * @returns {{ stat: string, notice: string }|null}
 */
export function routeWords(relayed) {
    if (relayed === true) return { stat: 'stream.statRouteRelay', notice: 'stream.routeRelay' };
    if (relayed === false) return { stat: 'stream.statRouteDirect', notice: 'stream.routeDirect' };
    return null;
}

export class StreamViewRoute {
    /**
     * The transport says which way the stream went, once its link is up.
     * @this {StreamViewInstance}
     * @param {boolean|null} relayed null when the browser does not say
     */
    _onStreamRoute(relayed) {
        this._routeRelayed = relayed === true ? true : relayed === false ? false : null;
        if (this._routeRelayed !== null && this.onRoute) this.onRoute(this._routeRelayed);
    }

    /**
     * The route's line for the statistics: its label and its value, or null
     * while it is not known.
     * @this {StreamViewInstance}
     * @returns {{ label: string, value: string }|null}
     */
    _routeStat() {
        const words = routeWords(this._routeRelayed);
        return words ? { label: t('stream.statRoute'), value: t(words.stat) } : null;
    }
}
