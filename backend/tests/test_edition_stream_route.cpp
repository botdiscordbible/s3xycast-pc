/*
 * S3XYCast PC — TNR suite of the edition. GPLv3, like the files under test.
 *
 * Which way the streams from outside go (common/StreamRoute.h): the worker's
 * word to the main program, and what is kept of it for the PC's own page.
 */
#include "test_framework.h"
#include "common/StreamRoute.h"

#include <QDateTime>
#include <QJsonObject>
#include <QJsonValue>

using namespace mw::edition::route;

void run_edition_stream_route_tests()
{
    SECTION("StreamRoute (edition) — the worker's word to the main program");

    {
        const QJsonObject relayed = event(true, false);
        CHECK_EQ(relayed.value("event").toString(), QStringLiteral("route"));
        CHECK(relayed.value("relayed").toBool());
        CHECK(!relayed.value("lan").toBool());
        // Read back the way StreamWorkerHost reads it.
        CHECK(relayed["relayed"].toBool() == true);
        CHECK(relayed["lan"].toBool() == false);

        const QJsonObject home = event(false, true);
        CHECK(!home.value("relayed").toBool());
        CHECK(home.value("lan").toBool());
    }

    SECTION("StreamRoute (edition) — what is kept for the PC's page");

    {
        const QDateTime at = QDateTime::fromString(QStringLiteral("2026-11-18T16:29:51Z"),
                                                   Qt::ISODate);
        const QJsonObject kept = record(false, at);
        CHECK(kept.value("relayed").isBool());
        CHECK(!kept.value("relayed").toBool());
        CHECK_EQ(kept.value("at").toString(), QStringLiteral("2026-11-18T16:29:51Z"));
        // As written, as read: the same record.
        CHECK(readable(QJsonValue(kept)) == kept);

        // Written in UTC whatever the clock's zone: the page compares it.
        const QDateTime paris = at.toOffsetFromUtc(3600);
        CHECK_EQ(record(true, paris).value("at").toString(),
                 QStringLiteral("2026-11-18T16:29:51Z"));
        CHECK(record(true, paris).value("relayed").toBool());
    }

    {
        // Nothing kept, or not a record: the page is given nothing.
        CHECK(readable(QJsonValue()).isEmpty());
        CHECK(readable(QJsonValue(QStringLiteral("relay"))).isEmpty());
        CHECK(readable(QJsonValue(QJsonObject{})).isEmpty());
        CHECK(readable(QJsonValue(QJsonObject{{"relayed", "yes"}, {"at", "2026-11-18T16:29:51Z"}}))
                  .isEmpty());
        CHECK(readable(QJsonValue(QJsonObject{{"relayed", true}})).isEmpty());
        CHECK(readable(QJsonValue(QJsonObject{{"relayed", true}, {"at", "hier"}})).isEmpty());
    }

    {
        // The key the settings keep it under, which the page's status names too.
        CHECK_EQ(QString::fromLatin1(kSettingsKey), QStringLiteral("last_outside_route"));
    }
}
