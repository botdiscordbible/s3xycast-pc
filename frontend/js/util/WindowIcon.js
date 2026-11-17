/*
 * S3XYCast PC — an edition of MoonlightWeb. GPLv3, like the rest of the tree.
 *
 * WindowIcon — the icon of the window the program's page lives in.
 *
 * Since 0.1.11 the page opens in a browser window of its own, whose button in
 * the taskbar carries the page's icon. On the first subscriber's PC it carried
 * the browser's blank globe instead ("et icone à corriger", 17/11/2026): the
 * page declares its icon (index.html) and the file is there, but through the
 * entry page the browser's own request for it came to nothing. The entry page
 * declares no icon at all, on purpose, so the window starts with the globe;
 * what then kept the interface's icon from replacing it is not known — the
 * same path, rebuilt on a bench, shows the icon.
 *
 * So the interface does not leave it to that request. It reads the icon the
 * way it reads every other file of its own — which works, or there would be no
 * page — and hands the browser the picture itself, as a data: address: no
 * request of the browser's left to fail, whatever made it fail. Tried on the
 * bench with that request refused: the window takes the icon.
 *
 * Only the tab's and the window's icon. The home-screen icon of a phone
 * (apple-touch-icon) is another declaration, read at another time, and is
 * left as it is.
 */

/** The picture the window gets: big enough for a taskbar at any scaling. */
export const WINDOW_ICON_PATH = '/assets/icon-192.png';

/** A blob as a data: address. */
function asDataUrl(blob, Reader = FileReader) {
    return new Promise((resolve, reject) => {
        const reader = new Reader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('unreadable'));
        reader.readAsDataURL(blob);
    });
}

/**
 * Give the page's window its icon. Nothing is changed when the picture cannot
 * be read: the page keeps the declaration it came with.
 * @param {{ doc?: Document, fetchFn?: typeof fetch, Reader?: typeof FileReader }} [env]
 *   replace the live sources (tests)
 * @returns {Promise<boolean>} whether the icon was set
 */
export async function setWindowIcon({ doc = document, fetchFn = fetch, Reader = FileReader } = {}) {
    let url = '';
    try {
        const response = await fetchFn(WINDOW_ICON_PATH);
        if (!response || !response.ok) return false;
        const blob = await response.blob();
        // Named a picture whatever the server called it: the browser decodes a
        // data: address by the type it states.
        const picture =
            blob.type && blob.type.startsWith('image/')
                ? blob
                : new Blob([blob], { type: 'image/png' });
        url = await asDataUrl(picture, Reader);
    } catch {
        return false;
    }
    if (!url.startsWith('data:image/')) return false;
    const head = doc.head || doc.documentElement;
    if (!head) return false;
    // A new element rather than a new address on the old one: a browser that
    // gave up on the old declaration looks at the new one afresh.
    for (const old of doc.querySelectorAll('link[rel~="icon"]')) old.remove();
    const link = doc.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    link.href = url;
    head.appendChild(link);
    return true;
}
