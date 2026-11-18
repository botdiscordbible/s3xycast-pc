/*
 * S3XYCast PC — TNR suite of the edition. GPLv3, like the files under test.
 *
 * Which way the streams from outside go (common/StreamRoute.h): the worker's
 * word to the main program, which of those words say something of the box,
 * and what is kept of them for the PC's own page.
 */
#include "test_framework.h"
#include "common/StreamRoute.h"
#include "server/NetClassify.h"

#include <QDateTime>
#include <QHostAddress>
#include <QJsonArray>
#include <QJsonObject>
#include <QJsonValue>
#include <QList>

using namespace mw::edition::route;

void run_edition_stream_route_tests()
{
    SECTION("StreamRoute (edition) — the worker's word to the main program");

    {
        Seen relayed;
        relayed.relayed = true;
        relayed.browserUdp = true;
        const QJsonObject ev = event(relayed);
        CHECK_EQ(ev.value("event").toString(), QStringLiteral("route"));
        CHECK(ev.value("relayed").toBool());
        CHECK(!ev.value("lan").toBool());
        CHECK(!ev.value("hole").toBool());
        CHECK(ev.value("browserUdp").toBool());
        // No address on a relayed pair: the main program has nothing to ask.
        CHECK(!ev.contains("peer"));
        // Read back the way StreamWorkerHost hands it on.
        CHECK(seenOf(ev) == relayed);

        Seen direct;
        direct.peer = QStringLiteral("2001:db8:1:2::5");
        direct.hole = true;
        direct.browserUdp = true;
        CHECK_EQ(event(direct).value("peer").toString(), QStringLiteral("2001:db8:1:2::5"));
        CHECK(seenOf(event(direct)) == direct);
        CHECK(seenOf(event(direct)) != relayed);
    }

    {
        // A word with fields missing keeps nothing it should not: on the PC's
        // network without "lan", no UDP from the browser without "browserUdp".
        const Seen s = seenOf(QJsonObject{{"event", "route"}, {"relayed", true}});
        CHECK(s.relayed);
        CHECK(s.lan);
        CHECK(!s.browserUdp);
        CHECK(!s.hole);
        CHECK(keep(s, false) == Kept::OnThisNetwork);
        const Seen t = seenOf(QJsonObject{{"event", "route"}, {"relayed", true}, {"lan", false}});
        CHECK(keep(t, false) == Kept::NoBrowserUdp);
    }

    SECTION("StreamRoute (edition) — the relay servers named by the grant");

    {
        // As RelayGrant's asIceServer gives it: a list of turn:/turns: urls.
        const QJsonObject grant{
            {"urls", QJsonArray{QStringLiteral("turn:relay.example:3478?transport=udp"),
                                QStringLiteral("turn:relay.example:3478?transport=tcp"),
                                QStringLiteral("turns:Relay.Example:443?transport=tcp")}},
            {"username", "u"},
            {"credential", "c"}};
        CHECK_EQ(relayHosts(grant), QStringList{QStringLiteral("relay.example")});
        // One url as a plain string; an address as it is; IPv6 in brackets.
        CHECK_EQ(relayHosts(QJsonObject{{"urls", "turn:203.0.113.9:3478"}}),
                 QStringList{QStringLiteral("203.0.113.9")});
        CHECK_EQ(relayHosts(QJsonObject{{"urls", "turn:[2001:db8::7]:3478?transport=udp"}}),
                 QStringList{QStringLiteral("2001:db8::7")});
        CHECK_EQ(relayHosts(QJsonObject{{"urls", "turn:relay.example"}}),
                 QStringList{QStringLiteral("relay.example")});
        // Not a relay: a STUN server, nothing, or no grant at all.
        CHECK(relayHosts(QJsonObject{{"urls", "stun:stun.example:3478"}}).isEmpty());
        CHECK(relayHosts(QJsonObject{}).isEmpty());
        CHECK(relayHosts(QJsonObject{{"urls", QJsonArray{1, true}}}).isEmpty());
    }

    SECTION("StreamRoute (edition) — what the browser's candidates show of its UDP");

    {
        // Reflexive: its address as the internet sees it.
        CHECK(showsInternetUdp(CandidateKind::Reflexive, true, true));
        // A host candidate on the internet itself (a global IPv6).
        CHECK(showsInternetUdp(CandidateKind::Host, true, true));
        // A private host candidate, or a .local one: nothing of the internet.
        CHECK(!showsInternetUdp(CandidateKind::Host, true, false));
        // A relay candidate: the relay may be reached over TCP.
        CHECK(!showsInternetUdp(CandidateKind::Relay, true, true));
        // Over TCP: no UDP shown, whatever the kind.
        CHECK(!showsInternetUdp(CandidateKind::Reflexive, false, true));
        CHECK(!showsInternetUdp(CandidateKind::Other, true, true));
    }

    SECTION("StreamRoute (edition) — which streams say something of the box");

    {
        Seen s;
        s.browserUdp = true;
        // Direct from outside: kept, the card goes.
        CHECK(keep(s, false) == Kept::Yes);
        // Relayed from outside, from a browser with UDP to offer: kept, the
        // card speaks (unless the box had a port open: the page reads hole).
        s.relayed = true;
        CHECK(keep(s, false) == Kept::Yes);
        // Relayed, from a browser that showed no UDP: no rule would help.
        s.browserUdp = false;
        CHECK(keep(s, false) == Kept::NoBrowserUdp);
        // Direct over TCP from such a browser still says the box let it in.
        s.relayed = false;
        CHECK(keep(s, false) == Kept::Yes);
    }

    {
        // On the PC's own network, whatever the pair: never kept.
        Seen lan;
        lan.lan = true;
        lan.browserUdp = true;
        CHECK(keep(lan, false) == Kept::OnThisNetwork);
        // The main program's view wins over a public pair: a phone at home on
        // a global IPv6 of the box's own prefix (18/11/2026 review), the car
        // on the home Wi-Fi in the garage.
        Seen home;
        home.peer = QStringLiteral("2001:db8:1:2::5");
        home.browserUdp = true;
        CHECK(keep(home, true) == Kept::OnThisNetwork);
        // Relayed, from a browser of this network: says nothing of the box.
        home.relayed = true;
        home.peer.clear();
        CHECK(keep(home, true) == Kept::OnThisNetwork);
    }

    {
        // What decides "this network's own" for a public pair: the rule the
        // stream's planning already uses (NetClassify::sharesHostNetwork).
        const QList<QHostAddress> pcAddresses{QHostAddress(QStringLiteral("192.168.1.20")),
                                              QHostAddress(QStringLiteral("2001:db8:1:2::20"))};
        const QStringList box{QStringLiteral("203.0.113.9"), QString()};
        // A global IPv6 in the PC's own /64: at home.
        CHECK(NetClassify::sharesHostNetwork(QStringLiteral("2001:db8:1:2::5"), box,
                                             pcAddresses));
        // The box's own public address (a hairpin), found by STUN when the box
        // answers no UPnP (UPnP's address is empty then): at home.
        CHECK(NetClassify::sharesHostNetwork(QStringLiteral("203.0.113.9"), box, pcAddresses));
        // A car on a mobile network: outside.
        CHECK(!NetClassify::sharesHostNetwork(QStringLiteral("198.51.100.7"), box, pcAddresses));
        CHECK(!NetClassify::sharesHostNetwork(QStringLiteral("2001:db8:9:8::1"), box,
                                              pcAddresses));
    }

    SECTION("StreamRoute (edition) — what is kept for the PC's page");

    {
        const QDateTime at = QDateTime::fromString(QStringLiteral("2026-11-18T16:29:51Z"),
                                                   Qt::ISODate);
        const QJsonObject kept = record(false, false, at);
        CHECK(kept.value("relayed").isBool());
        CHECK(!kept.value("relayed").toBool());
        CHECK(kept.value("hole").isBool());
        CHECK(!kept.value("hole").toBool());
        CHECK_EQ(kept.value("at").toString(), QStringLiteral("2026-11-18T16:29:51Z"));
        // As written, as read: the same record.
        CHECK(readable(QJsonValue(kept)) == kept);
        const QJsonObject holed = record(true, true, at);
        CHECK(holed.value("hole").toBool());
        CHECK(readable(QJsonValue(holed)) == holed);

        // Written in UTC whatever the clock's zone: the page compares it.
        const QDateTime paris = at.toOffsetFromUtc(3600);
        CHECK_EQ(record(true, false, paris).value("at").toString(),
                 QStringLiteral("2026-11-18T16:29:51Z"));
        CHECK(record(true, false, paris).value("relayed").toBool());
    }

    {
        // Kept by 0.1.14, with no "hole": given without, for the page to read
        // the box's word instead.
        const QJsonObject old{{"relayed", true}, {"at", "2026-11-18T16:29:51Z"}};
        const QJsonObject given = readable(QJsonValue(old));
        CHECK(given.value("relayed").toBool());
        CHECK(!given.contains("hole"));
        CHECK_EQ(given.value("at").toString(), QStringLiteral("2026-11-18T16:29:51Z"));
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
        // A "hole" that is not a yes or a no is left out, not guessed.
        const QJsonObject odd{{"relayed", true}, {"hole", "oui"}, {"at", "2026-11-18T16:29:51Z"}};
        CHECK(!readable(QJsonValue(odd)).contains("hole"));
    }

    {
        // The key the settings keep it under, which the page's status names too.
        CHECK_EQ(QString::fromLatin1(kSettingsKey), QStringLiteral("last_outside_route"));
    }
}
