/*
 * S3XYCast PC — TNR suite of the edition. GPLv3, like the files under test.
 *
 * When the icon next to the clock says that a newer version exists
 * (common/UpdateNotice.h): once per version and per run, and the menu's entry
 * for as long as it is on offer.
 */
#include "test_framework.h"
#include "common/UpdateNotice.h"

#include <QJsonObject>

using mw::edition::UpdateNotice;

namespace {

QJsonObject status(bool available, const char* latest)
{
    QJsonObject obj;
    obj["current"] = QStringLiteral("0.1.10");
    obj["update_available"] = available;
    if (latest) obj["latest"] = QString::fromLatin1(latest);
    return obj;
}

} // namespace

void run_edition_update_notice_tests()
{
    SECTION("UpdateNotice (edition) — a newer version is said once, and stays on offer");

    // Nothing was ever looked up: nothing to say, nothing on offer.
    {
        UpdateNotice notice;
        CHECK(notice.offered().isEmpty());
        CHECK(notice.take(QJsonObject()).isEmpty());
        CHECK(notice.offered().isEmpty());
    }

    // Up to date: the checker names the latest version, which is this one.
    {
        UpdateNotice notice;
        CHECK(notice.take(status(false, "0.1.10")).isEmpty());
        CHECK(notice.offered().isEmpty());
    }

    // A newer version: announced at the look that finds it, on offer from then
    // on, and not announced again by the looks that follow (one every six
    // hours on a PC that stays on).
    {
        UpdateNotice notice;
        CHECK_EQ(notice.take(status(true, "0.1.11")), QStringLiteral("0.1.11"));
        CHECK_EQ(notice.offered(), QStringLiteral("0.1.11"));
        CHECK(notice.take(status(true, "0.1.11")).isEmpty());
        CHECK(notice.take(status(true, "0.1.11")).isEmpty());
        CHECK_EQ(notice.offered(), QStringLiteral("0.1.11"));

        // A newer one still, before the first was taken: that one is news.
        CHECK_EQ(notice.take(status(true, "0.1.12")), QStringLiteral("0.1.12"));
        CHECK_EQ(notice.offered(), QStringLiteral("0.1.12"));
        CHECK(notice.take(status(true, "0.1.12")).isEmpty());
    }

    // A look that failed keeps the previous result (UpdateChecker): the offer
    // stands and nothing is said twice. One that says there is none takes the
    // entry away — and the same version coming back is not announced again in
    // this run.
    {
        UpdateNotice notice;
        CHECK_EQ(notice.take(status(true, "0.1.11")), QStringLiteral("0.1.11"));
        CHECK(notice.take(status(true, "0.1.11")).isEmpty());
        CHECK(notice.take(status(false, "0.1.11")).isEmpty());
        CHECK(notice.offered().isEmpty());
        CHECK(notice.take(status(true, "0.1.11")).isEmpty());
        CHECK_EQ(notice.offered(), QStringLiteral("0.1.11"));
    }

    // "Available" with no version named offers nothing: there would be
    // nothing to write in the menu.
    {
        UpdateNotice notice;
        CHECK(notice.take(status(true, nullptr)).isEmpty());
        CHECK(notice.take(status(true, "  ")).isEmpty());
        CHECK(notice.offered().isEmpty());
    }
}
