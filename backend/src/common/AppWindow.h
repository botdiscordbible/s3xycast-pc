/*
 * S3XYCast PC — an edition of MoonlightWeb. GPLv3, like the rest of the tree.
 *
 * The program's page in a window of its own.
 *
 * MoonlightWeb is windowless: its icon, its shortcut and a second launch open
 * a tab in the default browser. To a subscriber that is a web page, not the
 * program he installed: the address bar shows his personal link, the browser
 * offers to translate it, and the tab is one among thirty ("quand j'ouvre
 * l'app ca ouvre page web, cest mieux ca ou que ca ouvre logiciel plutot que
 * web?", 17/11/2026).
 *
 * So the same page opens in a window that holds nothing else — no tabs, no
 * address bar, its own button in the taskbar. The window is the browser's
 * (Chrome, Edge and their kin open one when asked with --app=<address>), so
 * nothing is added to the installer and the page runs in the engine it always
 * ran in. The default browser is asked when it is one of those, Edge when it
 * is not — if it has ever been opened on this PC — and where there is neither
 * the page opens in a tab as before.
 *
 * One window, not one per click: the window a new one replaces is closed once
 * the new one is up. A fresh page each time rather than the old one brought
 * forward, because the link carries a key made for that click, and a page
 * left open since yesterday may have lost its way in.
 */
#pragma once

#include <QString>
#include <QStringList>

namespace mw::edition::appwindow {

// ── The rules, which need no Windows (tests/test_edition_app_window.cpp) ────

/// What the window's bar reads: the page's own title, in the entry page and
/// in the interface alike. A browser's ordinary window adds its name to it
/// ("S3XYCast PC - Google Chrome"), a window of its own does not — which is
/// how the window to replace is told from the browser's others.
inline constexpr char kWindowTitle[] = "S3XYCast PC";

/// How long the window being replaced stays, so the new one is up first.
inline constexpr int kCloseDelayMs = 1500;

/// The program a registry "shell\open\command" starts:
/// `"C:\…\chrome.exe" --single-argument %1` gives `C:\…\chrome.exe`.
QString programOfCommand(const QString& command);

/// Whether this browser opens a page in a window of its own when asked with
/// --app=<address>: the ones built on Chromium, told by their file name.
bool opensAppWindow(const QString& browser);

/// The browser the window is asked of: the default one when it can, Edge
/// otherwise, none (empty) when there is neither.
QString chooseBrowser(const QString& defaultBrowser, const QString& edge);

/// The file Edge writes at its first run, under the user's local application
/// data (@p localAppData), and keeps from then on. An Edge that never ran
/// greets its user with a window of its own beside ours — "Sans titre -
/// Personnel – Microsoft Edge", seen on a new profile on 17/11/2026, and gone
/// at the second start — so it stands in for the default browser only once it
/// has run. Empty when the folder is not known.
QString edgeStateFile(const QString& localAppData);

/// What that browser is started with. @p isDefault: it is the one the user
/// browses with; one that is not may never have been opened, and must not
/// greet him with its welcome page.
QStringList arguments(const QString& url, bool isDefault, const QStringList& extra = {});

/// Whether a window with this title is one of ours (see kWindowTitle).
bool isOurTitle(const QString& title);

// ── The window ───────────────────────────────────────────────────────────────

/// Open @p url in a window of its own, in place of the one already open if
/// there is one. False when no window could be asked for (no such browser
/// here, or not Windows): the caller opens the page the way it always did.
/// From any thread. The address is never logged: its fragment is a key.
bool open(const QString& url);

} // namespace mw::edition::appwindow
