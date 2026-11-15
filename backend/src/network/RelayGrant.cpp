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

#include <QDateTime>
#include <QJsonArray>
#include <QRegularExpression>

namespace mw::relay {

namespace {

constexpr int kMaxUrls = 6;
constexpr int kMaxTextLength = 256;

// The same shape the entry page accepts (RELAY_URL in bootstrap/v1/tunnel.js):
// a turn: or turns: address and, at most, its transport.
bool looksLikeRelayUrl(const QString& url)
{
    static const QRegularExpression shape(
        QStringLiteral(R"(^turns?:[A-Za-z0-9.\-\[\]:]{1,120}(\?transport=(udp|tcp))?$)"));
    return shape.match(url).hasMatch();
}

bool plainText(const QString& text)
{
    return !text.isEmpty() && text.size() <= kMaxTextLength;
}

Grant g_current; // main thread only

} // namespace

Grant parse(const QJsonObject& payload, qint64 nowMs)
{
    Grant grant;
    const QJsonValue urls = payload.value(QStringLiteral("urls"));
    if (!urls.isArray()) return {};
    for (const QJsonValue& v : urls.toArray()) {
        if (!v.isString()) continue;
        const QString url = v.toString();
        if (looksLikeRelayUrl(url) && grant.urls.size() < kMaxUrls) grant.urls << url;
    }
    if (grant.urls.isEmpty()) return {};

    const QJsonValue username = payload.value(QStringLiteral("username"));
    const QJsonValue credential = payload.value(QStringLiteral("credential"));
    if (!username.isString() || !credential.isString()) return {};
    grant.username = username.toString();
    grant.credential = credential.toString();
    if (!plainText(grant.username) || !plainText(grant.credential)) return {};

    // A whole number of seconds, and a lifetime the relay itself would honour.
    const QJsonValue ttl = payload.value(QStringLiteral("ttl"));
    if (!ttl.isDouble()) return {};
    const double seconds = ttl.toDouble();
    if (!(seconds >= 1.0) || seconds > double(kMaxTtlSeconds)) return {};
    grant.expiresAtMs = nowMs + qint64(seconds) * 1000;
    return grant;
}

QJsonObject asIceServer(const Grant& grant, qint64 nowMs)
{
    if (!grant.isValid() || nowMs + kUsableMarginMs >= grant.expiresAtMs) return {};
    QJsonObject server;
    server[QStringLiteral("urls")] = QJsonArray::fromStringList(grant.urls);
    server[QStringLiteral("username")] = grant.username;
    server[QStringLiteral("credential")] = grant.credential;
    return server;
}

void setCurrent(const Grant& grant)
{
    g_current = grant;
}

QJsonObject currentIceServer()
{
    return asIceServer(g_current, QDateTime::currentMSecsSinceEpoch());
}

bool available()
{
    return !currentIceServer().isEmpty();
}

} // namespace mw::relay
