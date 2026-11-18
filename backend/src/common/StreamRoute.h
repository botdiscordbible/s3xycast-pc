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
 * which keeps the last one that says something of the box (AppSettings,
 * "last_outside_route") and gives it to the PC's own page
 * (/api/internet/status), where a card says what to do while it says
 * "relay, with no port open".
 *
 * What says nothing of the box, and is not kept (keep(), 18/11/2026 review):
 *   - a stream on the PC's own network, whatever pair it ends on: a phone at
 *     home on a global IPv6 of the box's own prefix is no stream from outside;
 *   - a stream through the relay from a browser that showed no UDP to the
 *     internet: no rule on the box takes such a stream off the relay;
 *   - a guest's stream (main.cpp keeps the owner's only): its ports are not
 *     the ones the card asks for, and the card speaks of "your" stream.
 */
#pragma once

#include <QDateTime>
#include <QJsonArray>
#include <QJsonObject>
#include <QJsonValue>
#include <QString>
#include <QStringList>

namespace mw::edition::route {

/// The settings key of the last stream from outside the PC's network.
inline constexpr char kSettingsKey[] = "last_outside_route";

/// What the worker saw of one stream's connection, once it is up — and again
/// when that changes: the pair ICE nominates, or a candidate that arrives
/// late and tells what the pair really was.
struct Seen
{
    /// Through the relay: either end is the relay's, or the browser's end is
    /// the relay server's own address (a check from the browser's relay
    /// candidate that arrived before that candidate did, which ICE then names
    /// peer-reflexive).
    bool relayed = false;
    /// The browser's end is not a public address (private, CGNAT, ULA,
    /// link-local), or not one ICE resolved (a .local name).
    bool lan = false;
    /// The browser's address on the selected pair, when the stream is not
    /// relayed: the main program asks whether it is the PC's own network's
    /// (the box's public address, a global IPv6 of the PC's own prefix).
    QString peer;
    /// The box had a port open for this stream: a UPnP hole, a shared port
    /// the router forwards, or one the relay's own check came in through
    /// unasked (a rule made by hand, or a box that lets everything in). A
    /// stream relayed anyway was not the box's doing, and no rule on the box
    /// would change it.
    bool hole = false;
    /// The browser showed UDP to the internet: one of its candidates is a
    /// reflexive one, or a host one at a public address.
    bool browserUdp = false;

    bool operator==(const Seen& o) const
    {
        return relayed == o.relayed && lan == o.lan && peer == o.peer && hole == o.hole &&
               browserUdp == o.browserUdp;
    }
    bool operator!=(const Seen& o) const { return !(*this == o); }
};

/// The worker's word to the main program.
inline QJsonObject event(const Seen& s)
{
    QJsonObject ev{{QStringLiteral("event"), QStringLiteral("route")},
                   {QStringLiteral("relayed"), s.relayed},
                   {QStringLiteral("lan"), s.lan},
                   {QStringLiteral("hole"), s.hole},
                   {QStringLiteral("browserUdp"), s.browserUdp}};
    if (!s.peer.isEmpty()) ev[QStringLiteral("peer")] = s.peer;
    return ev;
}

/// The word read back. A field missing reads as the one that keeps nothing
/// it should not: on the PC's network when "lan" is missing, no UDP from the
/// browser when "browserUdp" is missing (so a relayed stream is not kept).
inline Seen seenOf(const QJsonObject& ev)
{
    Seen s;
    s.relayed = ev.value(QStringLiteral("relayed")).toBool(false);
    s.lan = ev.value(QStringLiteral("lan")).toBool(true);
    s.peer = ev.value(QStringLiteral("peer")).toString();
    s.hole = ev.value(QStringLiteral("hole")).toBool(false);
    s.browserUdp = ev.value(QStringLiteral("browserUdp")).toBool(false);
    return s;
}

/// The relay servers' hosts named by an ICE server object (RelayGrant's
/// asIceServer: "urls", one string or a list, "turn:host:port?transport=…" or
/// "turns:…"), each once. The worker knows from them, before any check comes
/// in, which address is the relay's: this PC has no relay of its own, so the
/// browser's relay candidates would otherwise be its only word of it, and
/// one may arrive after a check it sent.
inline QStringList relayHosts(const QJsonObject& iceServer)
{
    QStringList urls;
    const QJsonValue v = iceServer.value(QStringLiteral("urls"));
    if (v.isString()) urls << v.toString();
    for (const QJsonValue& u : v.toArray())
        if (u.isString()) urls << u.toString();
    QStringList hosts;
    for (QString url : urls) {
        url = url.trimmed();
        if (url.startsWith(QLatin1String("turns:"), Qt::CaseInsensitive))
            url = url.mid(6);
        else if (url.startsWith(QLatin1String("turn:"), Qt::CaseInsensitive))
            url = url.mid(5);
        else
            continue;
        if (url.startsWith(QLatin1String("//"))) url = url.mid(2);
        QString host;
        if (url.startsWith(QLatin1Char('['))) {
            const qsizetype end = url.indexOf(QLatin1Char(']'));
            if (end > 1) host = url.mid(1, end - 1);
        } else {
            qsizetype end = url.size();
            for (const QChar stop : {QLatin1Char(':'), QLatin1Char('?'), QLatin1Char('/')}) {
                const qsizetype at = url.indexOf(stop);
                if (at >= 0 && at < end) end = at;
            }
            host = url.left(end);
        }
        host = host.trimmed().toLower();
        if (!host.isEmpty() && !hosts.contains(host)) hosts << host;
    }
    return hosts;
}

/// What one of the browser's candidates shows of its UDP. A reflexive one is
/// its address as the internet sees it, and a host one at a public address
/// is on the internet itself: UDP leaves its network. A relay one shows
/// nothing of it (the relay may be reached over TCP), nor a host one on a
/// private address or behind a .local name.
enum class CandidateKind
{
    Host,
    Reflexive,
    Relay,
    Other,
};
inline bool showsInternetUdp(CandidateKind kind, bool udp, bool publicAddress)
{
    if (!udp) return false;
    return kind == CandidateKind::Reflexive || (kind == CandidateKind::Host && publicAddress);
}

/// Whether a stream says something of the box, and so is kept for the card.
enum class Kept
{
    /// Kept: from outside, and either direct, or relayed from a browser that
    /// had UDP to offer.
    Yes,
    /// On the PC's own network: by the worker's view of the pair (lan), or by
    /// the main program's view of the browser (its request, or the pair's
    /// address, is this network's own).
    OnThisNetwork,
    /// Relayed, from a browser that showed no UDP to the internet.
    NoBrowserUdp,
};
inline Kept keep(const Seen& seen, bool onThisNetwork)
{
    if (seen.lan || onThisNetwork) return Kept::OnThisNetwork;
    if (seen.relayed && !seen.browserUdp) return Kept::NoBrowserUdp;
    return Kept::Yes;
}

/// What is kept of a stream from outside, and what the PC's page is given.
inline QJsonObject record(bool relayed, bool hole, const QDateTime& at)
{
    return QJsonObject{{QStringLiteral("relayed"), relayed},
                       {QStringLiteral("hole"), hole},
                       {QStringLiteral("at"), at.toUTC().toString(Qt::ISODate)}};
}

/// A kept record as the page may be given it: empty when nothing is kept, or
/// when what is kept is not such a record (a hand-edited file). One kept by
/// 0.1.14 has no "hole": it is given without, and the page reads the box's
/// word instead (PcDashboard.portsAdvice).
inline QJsonObject readable(const QJsonValue& kept)
{
    const QJsonObject obj = kept.toObject();
    const QJsonValue relayed = obj.value(QStringLiteral("relayed"));
    if (!relayed.isBool()) return {};
    const QDateTime at =
        QDateTime::fromString(obj.value(QStringLiteral("at")).toString(), Qt::ISODate);
    if (!at.isValid()) return {};
    const QJsonValue hole = obj.value(QStringLiteral("hole"));
    if (hole.isBool()) return record(relayed.toBool(), hole.toBool(), at);
    return QJsonObject{{QStringLiteral("relayed"), relayed.toBool()},
                       {QStringLiteral("at"), at.toUTC().toString(Qt::ISODate)}};
}

} // namespace mw::edition::route
