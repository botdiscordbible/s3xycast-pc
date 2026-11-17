/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * The layout editor opened from a game starts as its pill.
 *
 * Unfolded, its bar holds the pad style, the presets, two sliders, the
 * backgrounds and three buttons: taller than an iPhone held sideways with
 * Safari's bars on (about 330 px), where Done ended up under the screen. A
 * player who comes from the game came to move a joystick: the editor then
 * opens folded — grip, unfold, Done — with the whole controller in view, and
 * the bar, when unfolded, never goes past the screen.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../js/i18n/i18n.js', () => ({
    t: (key) => 'text:' + key,
}));

import { TouchPadLayoutEditor } from '../js/ui/TouchPadLayoutEditor.js';
import { touchPadLayouts } from '../js/stream/TouchPadState.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('the layout editor, folded from the start', () => {
    let container;
    let editor;
    const bar = () => container.querySelector('.tp-layout-editor-bar');

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });
    afterEach(() => {
        if (editor) editor.close();
        editor = null;
        container.remove();
    });

    it('opens unfolded on the settings page, as it always did', () => {
        editor = new TouchPadLayoutEditor(container, { layout: touchPadLayouts() });
        editor.open();
        expect(bar().classList.contains('is-folded')).toBe(false);
    });

    it('opens as its pill when asked: unfold and Done are there', () => {
        editor = new TouchPadLayoutEditor(container, {
            layout: touchPadLayouts(),
            startFolded: true,
        });
        editor.open();
        expect(bar().classList.contains('is-folded')).toBe(true);
        expect(bar().querySelector('.tp-bar-done-folded[data-act="done"]')).not.toBeNull();
        expect(bar().querySelector('[data-act="unfold"]')).not.toBeNull();
    });

    it('unfolds to everything it has, and folds again', () => {
        editor = new TouchPadLayoutEditor(container, {
            layout: touchPadLayouts(),
            startFolded: true,
        });
        editor.open();
        bar().querySelector('[data-act="unfold"]').click();
        expect(bar().classList.contains('is-folded')).toBe(false);
        bar().querySelector('[data-act="fold"]').click();
        expect(bar().classList.contains('is-folded')).toBe(true);
    });

    it('hands back the arrangement from the pill’s own Done', () => {
        const onChange = vi.fn();
        const onClosed = vi.fn();
        editor = new TouchPadLayoutEditor(container, {
            layout: touchPadLayouts({ preset: 'compact' }),
            scale: 1.1,
            opacity: 0.7,
            style: 'ps',
            startFolded: true,
            onChange,
            onClosed,
        });
        editor.open();
        bar().querySelector('.tp-bar-done-folded').click();
        expect(onChange).toHaveBeenCalledTimes(1);
        const [layout, look] = onChange.mock.calls[0];
        expect(layout.preset).toBe('compact');
        expect(look.style).toBe('ps');
        expect(look.scale).toBeCloseTo(1.1, 5);
        expect(look.opacity).toBeCloseTo(0.7, 5);
        expect(onClosed).toHaveBeenCalledTimes(1);
        expect(editor.isOpen()).toBe(false);
    });

    it('wears the names of the game it was opened from', () => {
        const labels = { lt: 'Clic D', a: 'Espace' };
        editor = new TouchPadLayoutEditor(container, { layout: touchPadLayouts(), labels });
        editor.open();
        expect(editor._view._labels).toBe(labels);
        editor.close();
        // And a pad's own names when it is given none.
        editor = new TouchPadLayoutEditor(container, { layout: touchPadLayouts() });
        editor.open();
        expect(editor._view._labels).toBeNull();
    });

    it('keeps its unfolded bar inside a short screen', () => {
        const css = readFileSync(join(here, '..', 'css', 's3xycast.css'), 'utf8');
        expect(css).toMatch(
            /\.tp-layout-editor-bar:not\(\.is-folded\) \{\s*max-height: calc\(100% - 16px\);\s*overflow-y: auto;/,
        );
    });
});
