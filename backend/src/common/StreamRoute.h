/*
 * S3XYCast PC — an edition of MoonlightWeb. GPLv3, like the rest of the tree.
 *
 * Which way the streams from outside go: straight to the PC, or through the
 * S3XYCast relay.
 *
 * Where the box opens no port for the PC, a stream from a car on a mobile
 * network goes through the relay: it works, and it is a detour that adds
 * delay. A rule made on the box lets it come straight in — the first owner
 * made one, and his next stream from the car went direct, with no drop of
 * rate and no freeze (18/11/2026). He wants the customers told, plainly,
 * where they can act ("faut juste afficher de façon plus visible au client
 * qu'il faut ouvrir ses ports réseau pour réduire latence").
 *
 * The stream's worker knows which way each connection went (the selected
 * candidate pair, RelayBase). It tells the main program (an event, below),
 * which keeps the last one that came from outside the PC's network
 * (AppSettings, "last_outside_route") and gives it to the PC's own page
 * (/api/internet/status), where a card says what to do while it says
 * "relay". A stream on the PC's own network says nothing of the box, and
 * is not kept.
 */
#pragma once

#include <QDateTime>
#include <QJsonObject>
#include <QJsonValue>
#include <QString>

namespace mw::edition::route {

/// The settings key of the last stream from outside the PC's network.
inline constexpr char kSettingsKey[] = "last_outside_route";

/// The worker's word to the main program once a stream's connection is up:
/// through the relay or not, and on the PC's own network or not.
inline QJsonObject event(bool relayed, bool lan)
{
    return QJsonObject{{QStringLiteral("event"), QStringLiteral("route")},
                       {QStringLiteral("relayed"), relayed},
                       {QStringLiteral("lan"), lan}};
}

/// What is kept of a stream from outside, and what the PC's page is given.
inline QJsonObject record(bool relayed, const QDateTime& at)
{
    return QJsonObject{{QStringLiteral("relayed"), relayed},
                       {QStringLiteral("at"), at.toUTC().toString(Qt::ISODate)}};
}

/// A kept record as the page may be given it: empty when nothing is kept, or
/// when what is kept is not such a record (a hand-edited file, an older one).
inline QJsonObject readable(const QJsonValue& kept)
{
    const QJsonObject obj = kept.toObject();
    const QJsonValue relayed = obj.value(QStringLiteral("relayed"));
    if (!relayed.isBool()) return {};
    const QDateTime at =
        QDateTime::fromString(obj.value(QStringLiteral("at")).toString(), Qt::ISODate);
    if (!at.isValid()) return {};
    return record(relayed.toBool(), at);
}

} // namespace mw::edition::route
