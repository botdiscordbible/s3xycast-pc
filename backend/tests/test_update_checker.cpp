/*
 * MoonlightWeb — browser-based Sunshine/GameStream client.
 * Copyright (C) 2026 Bruno Martin <brunoocto@gmail.com>
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program. If not, see <https://www.gnu.org/licenses/>.
 */

#include "test_framework.h"
#include "network/UpdateChecker.h"

#include <QDateTime>

void run_update_checker_tests()
{
    SECTION("UpdateChecker: a fresh look at most once per floor, for every client");
    {
        const QDateTime now = QDateTime::currentDateTimeUtc();
        const int floor = UpdateChecker::kFreshFloorSeconds;
        CHECK(floor == 5 * 60);
        // Never checked: due.
        CHECK(UpdateChecker::freshDue(QDateTime(), now));
        // Just checked, or under the floor: the cache stands.
        CHECK(!UpdateChecker::freshDue(now, now));
        CHECK(!UpdateChecker::freshDue(now.addSecs(-(floor - 1)), now));
        // At the floor and past it: due again.
        CHECK(UpdateChecker::freshDue(now.addSecs(-floor), now));
        CHECK(UpdateChecker::freshDue(now.addSecs(-6 * 3600), now));
        // A clock set back: due, rather than waiting out the difference.
        CHECK(UpdateChecker::freshDue(now.addSecs(120), now));
    }

    SECTION("UpdateChecker: the version a release tag names, this edition's prefix included");
    {
        // This edition tags its releases "s3x-vX.Y.Z" (upstream's own "vX.Y.Z"
        // tags live in the same repository).
        CHECK_EQ(UpdateChecker::versionOfTag(QStringLiteral("s3x-v0.1.2")),
                 QStringLiteral("0.1.2"));
        CHECK_EQ(UpdateChecker::versionOfTag(QStringLiteral("  S3X-V1.0.0 ")),
                 QStringLiteral("1.0.0"));
        CHECK_EQ(UpdateChecker::versionOfTag(QStringLiteral("v0.4.1")), QStringLiteral("0.4.1"));
        CHECK_EQ(UpdateChecker::versionOfTag(QStringLiteral("V2.0")), QStringLiteral("2.0"));
        CHECK_EQ(UpdateChecker::versionOfTag(QStringLiteral("0.1.1")), QStringLiteral("0.1.1"));
        CHECK_EQ(UpdateChecker::versionOfTag(QString()), QString());
        // Only the prefix goes: what follows is left for isNewer to judge.
        CHECK_EQ(UpdateChecker::versionOfTag(QStringLiteral("s3x-v")), QString());
        CHECK_EQ(UpdateChecker::versionOfTag(QStringLiteral("s3x-0.1.2")),
                 QStringLiteral("s3x-0.1.2"));
    }

    SECTION("UpdateChecker: newer means newer, whatever the tag is dressed in");
    {
        CHECK(UpdateChecker::isNewer(QStringLiteral("0.1.2"), QStringLiteral("0.1.1")));
        CHECK(UpdateChecker::isNewer(QStringLiteral("1.2.10"), QStringLiteral("1.2.9")));
        CHECK(!UpdateChecker::isNewer(QStringLiteral("0.1.1"), QStringLiteral("0.1.1")));
        CHECK(!UpdateChecker::isNewer(QStringLiteral("0.1.0"), QStringLiteral("0.1.1")));
        // The edition's tags, given whole. The major is what a bare "v" strip
        // used to lose: "s3x-v1" read as 0, and 1.0.0 was never offered.
        CHECK(UpdateChecker::isNewer(QStringLiteral("s3x-v0.1.2"), QStringLiteral("0.1.1")));
        CHECK(UpdateChecker::isNewer(QStringLiteral("s3x-v1.0.0"), QStringLiteral("0.9.9")));
        CHECK(UpdateChecker::isNewer(QStringLiteral("s3x-v2.0.0"), QStringLiteral("s3x-v1.9.0")));
        CHECK(!UpdateChecker::isNewer(QStringLiteral("s3x-v1.0.0"), QStringLiteral("1.0.0")));
        CHECK(!UpdateChecker::isNewer(QStringLiteral("s3x-v0.9.0"), QStringLiteral("1.0.0")));
        // A tag that names no version never nags, and a source build (0.0.0-dev)
        // is never out of date.
        CHECK(!UpdateChecker::isNewer(QString(), QStringLiteral("0.1.1")));
        CHECK(!UpdateChecker::isNewer(QStringLiteral("s3x-v1.0.0"), QStringLiteral("0.0.0-dev")));
    }

    SECTION("UpdateChecker: nothing to wait for where nothing may be asked");
    {
        // Opted out: no request leaves, so a fresh ask has no check to wait on
        // and the cache answers at once.
        const QByteArray before = qgetenv("MW_NO_TELEMETRY");
        qputenv("MW_NO_TELEMETRY", "1");
        UpdateChecker checker(QStringLiteral("0.4.2"), false);
        CHECK(!checker.requestFresh());
        CHECK(!checker.requestFresh());
        CHECK(checker.statusJson().value(QStringLiteral("update_available")).toBool() == false);
        if (before.isEmpty())
            qunsetenv("MW_NO_TELEMETRY");
        else
            qputenv("MW_NO_TELEMETRY", before);
    }
}
