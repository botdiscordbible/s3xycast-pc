/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * The arithmetic of the picture's zoom by buttons, and of how far the zoomed
 * picture may be moved (stream/ViewZoom.js).
 */
import { describe, it, expect } from 'vitest';
import {
    LOOSE_FULL_AT,
    ZOOM_MAX,
    ZOOM_MIN,
    ZOOM_STEPS,
    clampZoom,
    panAfterZoom,
    panBounds,
    touchSpan,
    zoomLabel,
    zoomStep,
} from '../js/stream/ViewZoom.js';

describe('the zoom by buttons', () => {
    it('keeps the zoom between the whole picture and what the pinch allows', () => {
        expect(clampZoom(0.2)).toBe(ZOOM_MIN);
        expect(clampZoom(3)).toBe(3);
        expect(clampZoom(40)).toBe(ZOOM_MAX);
        expect(clampZoom(NaN)).toBe(ZOOM_MIN);
        expect(clampZoom(undefined)).toBe(ZOOM_MIN);
    });

    it('goes from stop to stop, up and down, and no further than the ends', () => {
        let zoom = ZOOM_MIN;
        const up = [];
        for (let i = 0; i < ZOOM_STEPS.length + 1; i++) {
            zoom = zoomStep(zoom, 1);
            up.push(zoom);
        }
        expect(up).toEqual([1.5, 2, 3, 4, 6, 8, 8, 8]);
        const down = [];
        for (let i = 0; i < ZOOM_STEPS.length + 1; i++) {
            zoom = zoomStep(zoom, -1);
            down.push(zoom);
        }
        expect(down).toEqual([6, 4, 3, 2, 1.5, 1, 1, 1]);
    });

    it('takes a zoom left between two stops by a pinch to the nearest one on that side', () => {
        expect(zoomStep(1.7, 1)).toBe(2);
        expect(zoomStep(1.7, -1)).toBe(1.5);
        expect(zoomStep(2.004, 1)).toBe(3);
        expect(zoomStep(1.996, -1)).toBe(1.5);
        expect(zoomStep(7.2, 1)).toBe(8);
        expect(zoomStep(1.2, -1)).toBe(1);
    });

    it('holds a point still while the zoom changes around it', () => {
        // The middle of the area: only the offset is scaled.
        expect(panAfterZoom(100, 0, 2)).toBe(200);
        // A point 150 px right of the middle, zoom doubled: what was under it
        // stays under it.
        const pan = 40;
        const focal = 150;
        const before = (focal - pan) / 1.5; // in the picture's own px at ×1.5
        const after = (focal - panAfterZoom(pan, focal, 3 / 1.5)) / 3;
        expect(after).toBeCloseTo(before, 9);
    });

    it('says the zoom in percent', () => {
        expect(zoomLabel(1)).toBe('100 %');
        expect(zoomLabel(1.5)).toBe('150 %');
        expect(zoomLabel(2.337)).toBe('234 %');
        expect(zoomLabel(99)).toBe('800 %');
    });

    it('reads the middle of the fingers and how far apart the first two are', () => {
        expect(touchSpan([])).toEqual({ count: 0, x: 0, y: 0, spread: 0 });
        expect(touchSpan([{ clientX: 10, clientY: 20 }])).toEqual({
            count: 1,
            x: 10,
            y: 20,
            spread: 0,
        });
        expect(
            touchSpan([
                { clientX: 0, clientY: 0 },
                { clientX: 30, clientY: 40 },
            ]),
        ).toEqual({ count: 2, x: 15, y: 20, spread: 50 });
    });
});

describe('how far the zoomed picture may be moved', () => {
    // A 16:9 picture in an area 1000 × 600: 1000 × 562.5 at zoom 1.
    const area = { areaW: 1000, areaH: 600, imgW: 1000, imgH: 562.5 };

    it('holds the whole picture in the middle', () => {
        expect(panBounds({ ...area, zoom: 1 })).toEqual({ x: 0, y: 0 });
    });

    it('lets every edge come as far as the middle of the area once zoomed', () => {
        const max = panBounds({ ...area, zoom: 2 });
        // ×2: 2000 × 1125. Edge on edge is ±500 and ±262.5; the middle of the
        // area is half of it further.
        expect(max.x).toBe(500 + 500);
        expect(max.y).toBe(262.5 + 300);
        // At that offset the picture's left edge is exactly in the middle.
        const left = 500 + max.x - (area.imgW * 2) / 2;
        expect(left).toBe(500);
    });

    it('grows that freedom with the zoom, so a pinch back to the whole picture does not jump', () => {
        const at = (zoom) => panBounds({ ...area, zoom }).x - Math.max(0, (1000 * zoom - 1000) / 2);
        expect(at(1)).toBe(0);
        expect(at(1.25)).toBeCloseTo(250, 6);
        expect(at(LOOSE_FULL_AT)).toBe(500);
        expect(at(4)).toBe(500);
        // Never more at a smaller zoom than at a larger one.
        let last = -1;
        for (let zoom = 1; zoom <= 8; zoom += 0.05) {
            const now = panBounds({ ...area, zoom }).x;
            expect(now).toBeGreaterThanOrEqual(last);
            last = now;
        }
    });

    it('holds the picture up and down while the special-keys bar is up, as before', () => {
        const typing = panBounds({ ...area, zoom: 3, typing: true });
        expect(typing.y).toBe((562.5 * 3 - 600) / 2);
        // Sideways there is no bar: the freedom stays.
        expect(typing.x).toBe((1000 * 3 - 1000) / 2 + 500);
    });

    it('lets a picture narrower than its area be moved too', () => {
        // A 4:3 picture in the same area: 800 × 600, bars left and right.
        const max = panBounds({ areaW: 1000, areaH: 600, imgW: 800, imgH: 600, zoom: 1.5 });
        expect(max.x).toBe(100 + 500);
        expect(max.y).toBe(150 + 300);
    });
});
