/*
 * S3XYCast PC — an edition of MoonlightWeb. GPLv3, like the rest of the tree.
 *
 * The program's page in a window of its own: see AppWindow.h.
 */
#include "AppWindow.h"

#include "DetachedProcess.h"
#include "Edition.h"

#include <QCoreApplication>
#include <QDateTime>
#include <QDebug>
#include <QFileInfo>
#include <QTimer>
#include <QVector>

#include <atomic>

#ifdef Q_OS_WIN
#include <windows.h>
#endif

namespace mw::edition::appwindow {

namespace {

/// The browsers that open a window of their own with --app=<address>. Opera
/// is started by a launcher under another name and Firefox has no such
/// window: both are answered with Edge, which every Windows has.
const char* const kAppWindowBrowsers[] = {
    "chrome.exe", "msedge.exe", "brave.exe", "vivaldi.exe", "chromium.exe",
};

/// A path's file name, lower case. By hand rather than QFileInfo: a Windows
/// path has to read the same on every OS the tests run on.
QString fileNameOf(const QString& path)
{
    const qsizetype cut =
        qMax(path.lastIndexOf(QLatin1Char('\\')), path.lastIndexOf(QLatin1Char('/')));
    return path.mid(cut + 1).trimmed().toLower();
}

} // namespace

QString programOfCommand(const QString& command)
{
    const QString text = command.trimmed();
    if (text.isEmpty()) return {};
    if (text.startsWith(QLatin1Char('"'))) {
        const qsizetype end = text.indexOf(QLatin1Char('"'), 1);
        return end > 1 ? text.mid(1, end - 1) : QString();
    }
    // Unquoted, and the path may hold spaces ("C:\Program Files\…"): it ends
    // with the first ".exe" that a space or nothing follows.
    qsizetype from = 0;
    while (true) {
        const qsizetype exe = text.indexOf(QLatin1String(".exe"), from, Qt::CaseInsensitive);
        if (exe < 0) break;
        const qsizetype after = exe + 4;
        if (after == text.size() || text.at(after).isSpace()) return text.left(after);
        from = after;
    }
    const qsizetype space = text.indexOf(QLatin1Char(' '));
    return space > 0 ? text.left(space) : text;
}

bool opensAppWindow(const QString& browser)
{
    const QString name = fileNameOf(browser);
    if (name.isEmpty()) return false;
    for (const char* known : kAppWindowBrowsers) {
        if (name == QLatin1String(known)) return true;
    }
    return false;
}

QString chooseBrowser(const QString& defaultBrowser, const QString& edge)
{
    if (opensAppWindow(defaultBrowser)) return defaultBrowser;
    if (opensAppWindow(edge)) return edge;
    return {};
}

QStringList arguments(const QString& url, bool isDefault, const QStringList& extra)
{
    QStringList args;
    args << QStringLiteral("--app=") + url;
    if (!isDefault) args << QStringLiteral("--no-first-run");
    for (const QString& more : extra) {
        const QString one = more.trimmed();
        if (!one.isEmpty()) args << one;
    }
    return args;
}

bool isOurTitle(const QString& title)
{
    return title.trimmed() == QLatin1String(kWindowTitle);
}

#ifdef Q_OS_WIN

namespace {

/// A string of the registry (the key's own value when @p value is null), or
/// nothing. Environment names in it are expanded.
QString registryString(HKEY root, const QString& key, const wchar_t* value)
{
    wchar_t buffer[1024];
    DWORD size = sizeof(buffer);
    const LSTATUS status =
        RegGetValueW(root, reinterpret_cast<const wchar_t*>(key.utf16()), value,
                     RRF_RT_REG_SZ | RRF_RT_REG_EXPAND_SZ, nullptr, buffer, &size);
    if (status != ERROR_SUCCESS) return {};
    return QString::fromWCharArray(buffer);
}

/// The program that opens an https link for this user: the browser they chose.
QString defaultBrowser()
{
    const QString progId = registryString(
        HKEY_CURRENT_USER,
        QStringLiteral("Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https"
                       "\\UserChoice"),
        L"ProgId");
    if (progId.isEmpty()) return {};
    return programOfCommand(registryString(
        HKEY_CLASSES_ROOT, progId + QStringLiteral("\\shell\\open\\command"), nullptr));
}

/// Edge, where Windows says it is, then where it is installed by default.
QString edge()
{
    QStringList places;
    places << programOfCommand(registryString(
        HKEY_LOCAL_MACHINE,
        QStringLiteral("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe"),
        nullptr));
    for (const char* variable : {"ProgramFiles(x86)", "ProgramFiles"}) {
        const QString base = qEnvironmentVariable(variable);
        if (!base.isEmpty())
            places << base + QStringLiteral("\\Microsoft\\Edge\\Application\\msedge.exe");
    }
    for (const QString& place : places) {
        if (!place.isEmpty() && QFileInfo::exists(place)) return place;
    }
    return {};
}

/// The program a window belongs to, or nothing.
QString programOfWindow(HWND hwnd)
{
    DWORD pid = 0;
    GetWindowThreadProcessId(hwnd, &pid);
    if (!pid) return {};
    const HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (!process) return {};
    wchar_t path[1024];
    DWORD size = 1024;
    const BOOL ok = QueryFullProcessImageNameW(process, 0, path, &size);
    CloseHandle(process);
    return ok ? QString::fromWCharArray(path, static_cast<qsizetype>(size)) : QString();
}

/// Whether this window is a page of ours in a window of its own: a top-level
/// window of a Chromium browser whose title is the page's and nothing more.
/// Every part counts — Discord and VS Code have windows of that class, and
/// the browser's ordinary windows add its name to the title.
bool isOurWindow(HWND hwnd)
{
    if (!IsWindow(hwnd) || !IsWindowVisible(hwnd) || GetWindow(hwnd, GW_OWNER)) return false;
    wchar_t name[64];
    if (!GetClassNameW(hwnd, name, 64) || wcscmp(name, L"Chrome_WidgetWin_1") != 0) return false;
    wchar_t title[256];
    const int length = GetWindowTextW(hwnd, title, 256);
    if (length <= 0 || !isOurTitle(QString::fromWCharArray(title, length))) return false;
    return opensAppWindow(programOfWindow(hwnd));
}

BOOL CALLBACK collectOurs(HWND hwnd, LPARAM found)
{
    if (isOurWindow(hwnd)) reinterpret_cast<QVector<HWND>*>(found)->append(hwnd);
    return TRUE;
}

/// The windows of ours that are open now.
QVector<HWND> ourWindows()
{
    QVector<HWND> found;
    EnumWindows(collectOurs, reinterpret_cast<LPARAM>(&found));
    return found;
}

/// Close what a new window replaced — asked the way its own cross asks, and
/// only of a window that is still ours (it was looked at a moment ago, and
/// may have been closed, or its number given to another, since).
void closeWindows(const QVector<HWND>& windows)
{
    int closed = 0;
    for (HWND hwnd : windows) {
        if (!isOurWindow(hwnd)) continue;
        PostMessageW(hwnd, WM_CLOSE, 0, 0);
        ++closed;
    }
    if (closed) qInfo() << "[AppWindow] Closed the window the new one replaces:" << closed;
}

/// Once the new window is up, so the screen is never left without one. On the
/// application's thread, whichever thread asked.
void closeLater(const QVector<HWND>& windows)
{
    QCoreApplication* app = QCoreApplication::instance();
    if (!app) {
        closeWindows(windows);
        return;
    }
    QMetaObject::invokeMethod(
        app,
        [windows]() {
            QTimer::singleShot(kCloseDelayMs, QCoreApplication::instance(),
                               [windows]() { closeWindows(windows); });
        },
        Qt::QueuedConnection);
}

} // namespace

bool open(const QString& url)
{
    const QString usual = defaultBrowser();
    const bool isDefault = opensAppWindow(usual);
    const QString browser = isDefault ? usual : chooseBrowser(QString(), edge());
    if (browser.isEmpty()) {
        static std::atomic<bool> said{false};
        if (!said.exchange(true)) {
            qInfo() << "[AppWindow] No browser here opens a window of its own: the page opens "
                       "in a tab";
        }
        return false;
    }

    // Two asks in a row (the icon's double click, then its menu) are one
    // window: the first is still on its way and cannot be seen to be replaced.
    static std::atomic<qint64> lastLaunch{0};
    const qint64 now = QDateTime::currentMSecsSinceEpoch();
    if (now - lastLaunch.load() < 1200) {
        qInfo() << "[AppWindow] A window is already on its way";
        return true;
    }

    // A --dev copy can be given more to say to the browser (a profile of its
    // own, a place off the screen), so that trying it puts nothing in front
    // of whoever is at the PC: MW_DEV_APP_WINDOW_ARGS, parts split by "|".
    QStringList extra;
    if (mw::edition::devFlag()) {
        extra = qEnvironmentVariable("MW_DEV_APP_WINDOW_ARGS")
                    .split(QLatin1Char('|'), Qt::SkipEmptyParts);
    }

    const QVector<HWND> replaced = ourWindows();
    if (!mw::startDetached(browser, arguments(url, isDefault, extra))) {
        qWarning().noquote() << "[AppWindow]" << QFileInfo(browser).fileName()
                             << "could not be started: the page opens in a tab";
        return false;
    }
    lastLaunch.store(now);
    QString said = QStringLiteral("[AppWindow] Opening in a window of its own, by %1 (%2)")
                       .arg(QFileInfo(browser).fileName(),
                            isDefault ? QStringLiteral("the default browser")
                                      : QStringLiteral("the default browser has no such window"));
    if (!replaced.isEmpty()) said += QStringLiteral(", in place of the one already open");
    qInfo().noquote() << said;
    if (!replaced.isEmpty()) closeLater(replaced);
    return true;
}

#else // !Q_OS_WIN

bool open(const QString&)
{
    // The edition is Windows': elsewhere the page opens as upstream opens it.
    return false;
}

#endif

} // namespace mw::edition::appwindow
