/*
 * S3XYCast PC — the S3XYCast edition of MoonlightWeb.
 * Copyright (C) 2026 Bruno Martin <brunoocto@gmail.com> (MoonlightWeb)
 * Modifications for the S3XYCast edition, 2026.
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

#include "network/RelayGrant.h"
#include "test_framework.h"

#include <QDateTime>
#include <QJsonArray>
#include <QJsonObject>

// The relay of last resort, as the host reads it off the introduction server's
// "ice" frame and hands it to a browser. Pure: no socket, no clock but the one
// passed in.

namespace {

QJsonObject payload(const QJsonArray& urls, const QJsonValue& username,
                    const QJsonValue& credential, const QJsonValue& ttl)
{
    QJsonObject o;
    o["urls"] = urls;
    if (!username.isUndefined()) o["username"] = username;
    if (!credential.isUndefined()) o["credential"] = credential;
    if (!ttl.isUndefined()) o["ttl"] = ttl;
    return o;
}

const QJsonArray kUrls{QStringLiteral("turn:pc.example:3478?transport=udp"),
                       QStringLiteral("turn:pc.example:3478?transport=tcp")};
const QString kUser = QStringLiteral("1800086400:109.215.10.20");
const QString kPass = QStringLiteral("iU2tbBjtnBRD2LHtSLUQr7SYqK5bxu7VAC-v_0MFWTs");
constexpr qint64 kNow = 1'800'000'000'000; // ms

} // namespace

void run_relay_grant_tests()
{
    using namespace mw::relay;

    SECTION("RelayGrant — the server's frame, read by its shape");
    {
        const Grant g = parse(payload(kUrls, kUser, kPass, 86400), kNow);
        CHECK(g.isValid());
        CHECK_EQ(g.urls.size(), 2);
        CHECK_EQ(g.urls.at(1), QStringLiteral("turn:pc.example:3478?transport=tcp"));
        CHECK_EQ(g.username, kUser);
        CHECK_EQ(g.credential, kPass);
        CHECK_EQ(g.expiresAtMs, kNow + qint64(86400) * 1000);

        // TLS, a bare address, an IPv6 literal: all things a relay may be.
        const QJsonArray odd{QStringLiteral("turns:pc.example:5349?transport=tcp"),
                             QStringLiteral("turn:203.0.113.5:3478"),
                             QStringLiteral("turn:[2001:db8::1]:3478")};
        CHECK_EQ(parse(payload(odd, kUser, kPass, 3600), kNow).urls.size(), 3);
    }

    SECTION("RelayGrant — only what looks like a relay's address is kept");
    {
        const QJsonArray mixed{QStringLiteral("stun:pc.example:3478"),
                               QStringLiteral("https://pc.example/"),
                               QStringLiteral("turn:pc.example:3478 ?transport=udp"),
                               QStringLiteral("turn:pc.example\"><script>"),
                               QStringLiteral("turn:pc.example:3478?transport=sctp"),
                               QStringLiteral("turn:") + QString(300, QLatin1Char('a')),
                               42,
                               QStringLiteral("turn:pc.example:3478?transport=tcp")};
        const Grant g = parse(payload(mixed, kUser, kPass, 86400), kNow);
        CHECK(g.isValid());
        CHECK_EQ(g.urls.size(), 1);
        CHECK_EQ(g.urls.first(), QStringLiteral("turn:pc.example:3478?transport=tcp"));

        // Nothing usable left: no grant at all, not credentials for nowhere.
        CHECK(!parse(payload({QStringLiteral("stun:pc.example:3478")}, kUser, kPass, 86400), kNow)
                   .isValid());
        QJsonObject notAList = payload(kUrls, kUser, kPass, 86400);
        notAList["urls"] = QStringLiteral("turn:pc.example:3478");
        CHECK(!parse(notAList, kNow).isValid());
        CHECK(!parse(QJsonObject(), kNow).isValid());

        // Never more than six, however many the frame lists.
        QJsonArray many;
        for (int i = 0; i < 20; ++i)
            many.append(QStringLiteral("turn:pc%1.example:3478").arg(i));
        CHECK_EQ(parse(payload(many, kUser, kPass, 86400), kNow).urls.size(), 6);
    }

    SECTION("RelayGrant — credentials are plain, short strings, and the lifetime a sane one");
    {
        CHECK(!parse(payload(kUrls, QString(), kPass, 86400), kNow).isValid());
        CHECK(!parse(payload(kUrls, kUser, QString(), 86400), kNow).isValid());
        CHECK(!parse(payload(kUrls, QJsonValue(QJsonValue::Undefined), kPass, 86400), kNow)
                   .isValid());
        CHECK(!parse(payload(kUrls, kUser, 12345, 86400), kNow).isValid());
        CHECK(!parse(payload(kUrls, QString(300, QLatin1Char('u')), kPass, 86400), kNow).isValid());
        CHECK(!parse(payload(kUrls, kUser, kPass, QJsonValue(QJsonValue::Undefined)), kNow)
                   .isValid());
        CHECK(!parse(payload(kUrls, kUser, kPass, 0), kNow).isValid());
        CHECK(!parse(payload(kUrls, kUser, kPass, -60), kNow).isValid());
        CHECK(!parse(payload(kUrls, kUser, kPass, QStringLiteral("86400")), kNow).isValid());
        // More than the relay itself would honour: not taken at its word.
        CHECK(!parse(payload(kUrls, kUser, kPass, double(kMaxTtlSeconds) + 1), kNow).isValid());
        CHECK(parse(payload(kUrls, kUser, kPass, double(kMaxTtlSeconds)), kNow).isValid());
        CHECK(parse(payload(kUrls, kUser, kPass, 1), kNow).isValid());
    }

    SECTION("RelayGrant — what a browser is handed, and until when");
    {
        const Grant g = parse(payload(kUrls, kUser, kPass, 3600), kNow);
        const QJsonObject server = asIceServer(g, kNow);
        CHECK_EQ(server.value("urls").toArray().size(), 2);
        CHECK_EQ(server.value("urls").toArray().at(0).toString(),
                 QStringLiteral("turn:pc.example:3478?transport=udp"));
        CHECK_EQ(server.value("username").toString(), kUser);
        CHECK_EQ(server.value("credential").toString(), kPass);
        // Nothing else rides along: not the lifetime, not the expiry.
        CHECK_EQ(server.size(), 3);

        // Handed out until ten minutes before its end, and not after.
        const qint64 end = g.expiresAtMs;
        CHECK(!asIceServer(g, end - kUsableMarginMs - 1).isEmpty());
        CHECK(asIceServer(g, end - kUsableMarginMs).isEmpty());
        CHECK(asIceServer(g, end).isEmpty());
        CHECK(asIceServer(g, end + 1'000'000).isEmpty());
        CHECK(asIceServer(Grant{}, kNow).isEmpty());
    }

    SECTION("RelayGrant — the one this process holds");
    {
        setCurrent(Grant{});
        CHECK(!available());
        CHECK(currentIceServer().isEmpty());

        // Against the real clock: good for an hour from now.
        const qint64 now = QDateTime::currentMSecsSinceEpoch();
        setCurrent(parse(payload(kUrls, kUser, kPass, 3600), now));
        CHECK(available());
        CHECK_EQ(currentIceServer().value("username").toString(), kUser);

        // One that lapsed while the line was down is not handed out.
        setCurrent(parse(payload(kUrls, kUser, kPass, 3600), now - qint64(2) * 3600 * 1000));
        CHECK(!available());

        // A frame this build cannot read leaves no relay, not the previous one.
        setCurrent(parse(payload(kUrls, kUser, kPass, 3600), now));
        setCurrent(parse(QJsonObject(), now));
        CHECK(!available());
        setCurrent(Grant{});
    }
}
