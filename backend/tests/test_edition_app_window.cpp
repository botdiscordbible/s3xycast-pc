/*
 * S3XYCast PC — TNR suite of the edition. GPLv3, like the files under test.
 *
 * The program's page in a window of its own (common/AppWindow.h): which
 * browser is asked for it, with what, and which window a new one replaces.
 * The window itself is the browser's and is not opened here.
 */
#include "test_framework.h"
#include "common/AppWindow.h"

#include <QString>
#include <QStringList>

using namespace mw::edition::appwindow;

void run_edition_app_window_tests()
{
    SECTION("AppWindow (edition) — the program a registry command starts");

    // What Chrome, Edge and Brave write under <ProgId>\shell\open\command.
    CHECK_EQ(programOfCommand(QStringLiteral(
                 "\"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe\" "
                 "--single-argument %1")),
             QStringLiteral("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"));
    CHECK_EQ(programOfCommand(QStringLiteral(
                 "\"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe\" "
                 "--single-argument %1")),
             QStringLiteral("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"));
    // Firefox's, with its own switches.
    CHECK_EQ(programOfCommand(QStringLiteral(
                 "\"C:\\Program Files\\Mozilla Firefox\\firefox.exe\" -osint -url \"%1\"")),
             QStringLiteral("C:\\Program Files\\Mozilla Firefox\\firefox.exe"));
    // Without quotes, and with spaces in the path: up to the program's ".exe".
    CHECK_EQ(programOfCommand(QStringLiteral(
                 "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe -- %1")),
             QStringLiteral("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"));
    CHECK_EQ(programOfCommand(QStringLiteral("C:\\Outils\\CHROME.EXE")),
             QStringLiteral("C:\\Outils\\CHROME.EXE"));
    // A folder whose name holds ".exe" is not where the program ends.
    CHECK_EQ(programOfCommand(QStringLiteral("C:\\mes.exe.vieux\\brave.exe --flag %1")),
             QStringLiteral("C:\\mes.exe.vieux\\brave.exe"));
    // A path as App Paths gives it: no argument, quoted or not.
    CHECK_EQ(programOfCommand(QStringLiteral("  \"C:\\Edge\\msedge.exe\"  ")),
             QStringLiteral("C:\\Edge\\msedge.exe"));
    // Nothing, or a quote never closed: no program.
    CHECK(programOfCommand(QString()).isEmpty());
    CHECK(programOfCommand(QStringLiteral("   ")).isEmpty());
    CHECK(programOfCommand(QStringLiteral("\"C:\\Program Files\\chrome.exe")).isEmpty());

    SECTION("AppWindow (edition) — which browsers have a window of their own");

    CHECK(opensAppWindow(QStringLiteral("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")));
    CHECK(opensAppWindow(QStringLiteral("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe")));
    CHECK(opensAppWindow(QStringLiteral("C:/Users/x/AppData/Local/BraveSoftware/brave.exe")));
    CHECK(opensAppWindow(QStringLiteral("D:\\Vivaldi\\Application\\vivaldi.exe")));
    CHECK(opensAppWindow(QStringLiteral("CHROME.EXE")));
    // Firefox has none; Opera is started by a launcher; a name that only
    // looks like one is not one.
    CHECK(!opensAppWindow(QStringLiteral("C:\\Program Files\\Mozilla Firefox\\firefox.exe")));
    CHECK(!opensAppWindow(QStringLiteral("C:\\Users\\x\\AppData\\Local\\Programs\\Opera\\launcher.exe")));
    CHECK(!opensAppWindow(QStringLiteral("C:\\outils\\notchrome.exe")));
    CHECK(!opensAppWindow(QStringLiteral("C:\\chrome.exe\\autre.exe")));
    CHECK(!opensAppWindow(QString()));
    CHECK(!opensAppWindow(QStringLiteral("C:\\Program Files\\Google\\Chrome\\Application\\")));

    SECTION("AppWindow (edition) — the browser the window is asked of");

    const QString chrome = QStringLiteral("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
    const QString edge = QStringLiteral("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe");
    const QString firefox = QStringLiteral("C:\\Program Files\\Mozilla Firefox\\firefox.exe");
    // The one the user browses with, when it can.
    CHECK_EQ(chooseBrowser(chrome, edge), chrome);
    CHECK_EQ(chooseBrowser(edge, edge), edge);
    CHECK_EQ(chooseBrowser(chrome, QString()), chrome);
    // Edge when it cannot, or when Windows names none.
    CHECK_EQ(chooseBrowser(firefox, edge), edge);
    CHECK_EQ(chooseBrowser(QString(), edge), edge);
    // Neither: no window, and the caller opens a tab.
    CHECK(chooseBrowser(firefox, QString()).isEmpty());
    CHECK(chooseBrowser(QString(), QString()).isEmpty());
    CHECK(chooseBrowser(firefox, firefox).isEmpty());

    SECTION("AppWindow (edition) — Edge stands in only once it has run");

    // The file its first run leaves, and every run after it finds.
    CHECK_EQ(edgeStateFile(QStringLiteral("C:\\Users\\x\\AppData\\Local")),
             QStringLiteral("C:\\Users\\x\\AppData\\Local\\Microsoft\\Edge\\User Data\\Local State"));
    CHECK_EQ(edgeStateFile(QStringLiteral("  D:\\Profils\\y\\Local ")),
             QStringLiteral("D:\\Profils\\y\\Local\\Microsoft\\Edge\\User Data\\Local State"));
    // No folder known: no file to look for, and Edge is not asked.
    CHECK(edgeStateFile(QString()).isEmpty());
    CHECK(edgeStateFile(QStringLiteral("   ")).isEmpty());

    SECTION("AppWindow (edition) — what the browser is started with");

    const QString link = QStringLiteral("https://pc.s3xycast.com/abc#k=clef%2Bune&p=/admin");
    // The default browser: the page, whole — its key included — and nothing else.
    CHECK_EQ(arguments(link, true), QStringList{QStringLiteral("--app=") + link});
    // Edge standing in: it may never have been opened, and keeps its welcome.
    CHECK_EQ(arguments(link, false),
             (QStringList{QStringLiteral("--app=") + link, QStringLiteral("--no-first-run")}));
    // A --dev copy's extras, after ours; blanks are dropped.
    CHECK_EQ(arguments(link, true,
                       QStringList{QStringLiteral(" --user-data-dir=C:\\essai "), QStringLiteral("  "),
                                   QStringLiteral("--window-position=-2400,-2400")}),
             (QStringList{QStringLiteral("--app=") + link,
                          QStringLiteral("--user-data-dir=C:\\essai"),
                          QStringLiteral("--window-position=-2400,-2400")}));

    SECTION("AppWindow (edition) — which window a new one replaces");

    // The page's title and nothing more: a window of its own.
    CHECK(isOurTitle(QStringLiteral("S3XYCast PC")));
    CHECK(isOurTitle(QStringLiteral(" S3XYCast PC ")));
    // The same page in a tab: the browser adds its name. Never closed.
    CHECK(!isOurTitle(QStringLiteral("S3XYCast PC - Google Chrome")));
    CHECK(!isOurTitle(QStringLiteral("S3XYCast PC - Personnel \u2013 Microsoft\u200b Edge")));
    CHECK(!isOurTitle(QStringLiteral("S3XYCast PC - Brave")));
    // The site, another page, a window with no title yet.
    CHECK(!isOurTitle(QStringLiteral("S3XYCast")));
    CHECK(!isOurTitle(QStringLiteral("S3XYCast PC DEV")));
    CHECK(!isOurTitle(QStringLiteral("s3xycast pc")));
    CHECK(!isOurTitle(QString()));
    // The title is the page's own: the interface and the entry page say the
    // same (frontend/index.html, bootstrap/index.html — checked by the
    // frontend's tests, which can read them).
    CHECK_EQ(QString::fromLatin1(kWindowTitle), QStringLiteral("S3XYCast PC"));
    // The window replaced stays until the new one is up, and not for long.
    CHECK(kCloseDelayMs >= 800);
    CHECK(kCloseDelayMs <= 4000);
}
