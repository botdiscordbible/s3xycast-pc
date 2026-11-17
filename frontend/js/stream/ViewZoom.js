/*
 * S3XYCast PC — an edition of MoonlightWeb. GPLv3, like the rest of the tree.
 *
 * The picture's zoom, by buttons.
 *
 * MoonlightWeb zooms the streamed picture with a pinch and moves it with three
 * fingers. On a car's screen, or with a phone held in one hand, neither is at
 * hand: the owner zoomed, then could not reach the parts that had left the
 * screen (15/11/2026). The stream's quick actions (ui/StreamViewQuick.js) put
 * the same zoom on two buttons, and the move on one finger. What is here is the
 * arithmetic they share, free of the page so that it is tested as it is.
 */

/** The picture's zoom: whole at 1, never past what the pinch allows. */
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 8;

/** Where the + and − buttons stop. */
export const ZOOM_STEPS = [1, 1.5, 2, 3, 4, 6, 8];

/** @param {number} zoom */
export function clampZoom(zoom) {
    const z = Number(zoom);
    if (!Number.isFinite(z)) return ZOOM_MIN;
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

/**
 * The stop after (`dir` > 0) or before the zoom the picture has. A zoom between
 * two stops, as a pinch leaves it, goes to the nearest stop on that side.
 * @param {number} zoom
 * @param {number} dir
 */
export function zoomStep(zoom, dir) {
    const z = clampZoom(zoom);
    if (dir > 0) {
        for (const stop of ZOOM_STEPS) if (stop > z + 0.01) return stop;
        return ZOOM_MAX;
    }
    for (let i = ZOOM_STEPS.length - 1; i >= 0; i--)
        if (ZOOM_STEPS[i] < z - 0.01) return ZOOM_STEPS[i];
    return ZOOM_MIN;
}

/**
 * Where the picture's offset goes when its zoom is multiplied by `factor`
 * around a point held still. The offset and the point are counted from the
 * middle of the area the picture is shown in (the origin of its transform).
 * @param {number} pan    the offset on one axis, in CSS px
 * @param {number} focal  the point held still, on the same axis
 * @param {number} factor new zoom / old zoom
 */
export function panAfterZoom(pan, focal, factor) {
    return focal * (1 - factor) + factor * pan;
}

/** The zoom from which the picture may be moved as far as it ever can. */
export const LOOSE_FULL_AT = 1.5;

/**
 * How far the zoomed picture may be moved from the middle of its area, on each
 * axis (the offset stays within ± the value returned).
 *
 * MoonlightWeb held the picture's edges on the area's: no black ever showed,
 * except under the picture, which could be pushed up by half the area. The
 * owner asked to move it "as one likes" (15/11/2026): on a car's screen the far
 * corner is out of the driver's reach, and what is to be read or touched is
 * wanted in the middle. So every edge may now come as far as the middle of the
 * area, the way the bottom one already did.
 *
 * That freedom grows with the zoom, from none on the whole picture to all of it
 * at LOOSE_FULL_AT: a picture pinched back to its whole size then returns to
 * the middle as it shrinks, instead of jumping there at the last step.
 *
 * With the special-keys bar up (`typing`) the area already ends at the bar: up
 * and down the edges are held, as before.
 * @param {{ areaW: number, areaH: number, imgW: number, imgH: number, zoom: number, typing?: boolean }} v
 *   the area and the picture at zoom 1, in CSS px
 * @returns {{ x: number, y: number }}
 */
export function panBounds({ areaW, areaH, imgW, imgH, zoom, typing }) {
    const z = clampZoom(zoom);
    const loose = Math.min(1, Math.max(0, (z - ZOOM_MIN) / (LOOSE_FULL_AT - ZOOM_MIN)));
    return {
        x: Math.max(0, (imgW * z - areaW) / 2) + (areaW / 2) * loose,
        y: Math.max(0, (imgH * z - areaH) / 2) + (typing ? 0 : (areaH / 2) * loose),
    };
}

/** What the zoom reads as: "150 %". */
export function zoomLabel(zoom) {
    return `${Math.round(clampZoom(zoom) * 100)} %`;
}

/**
 * The middle of the fingers on the screen, and how far apart the first two are
 * (0 with one finger).
 * @param {ArrayLike<{ clientX: number, clientY: number }>} touches
 */
export function touchSpan(touches) {
    const n = touches.length;
    let x = 0;
    let y = 0;
    for (let i = 0; i < n; i++) {
        x += touches[i].clientX;
        y += touches[i].clientY;
    }
    const spread =
        n >= 2
            ? Math.hypot(
                  touches[0].clientX - touches[1].clientX,
                  touches[0].clientY - touches[1].clientY,
              )
            : 0;
    return { count: n, x: n ? x / n : 0, y: n ? y / n : 0, spread };
}
