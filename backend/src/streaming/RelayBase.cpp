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

#include "RelayBase.h"

#include "IMediaEngine.h"
#include "IceMuxClient.h"
#include "IcePriority.h"
#include "MicRtp.h"
#include "MicUplink.h"
#include "server/NetClassify.h"

#include <rtc/rtc.hpp>

#include <QDebug>
#include <QHostAddress>
#include <QHostInfo>
#include <QJsonDocument>
#include <QString>
#include <QStringList>

namespace {

/// Resolved address of a candidate. Host candidates carry a literal IP, so this
/// succeeds for every candidate we consider rewriting.
bool candidateAddress(const rtc::Candidate& candidate, QHostAddress* out)
{
    const auto addr = candidate.address();
    if (!addr.has_value()) return false;
    return out->setAddress(QString::fromStdString(*addr));
}

/// Fallback for an unresolved candidate: the address field sits after the first
/// space, so a colon past that point means IPv6. Kept because it is what this
/// code did before the resolved address was used, and an unresolved candidate
/// must keep behaving exactly as it used to.
bool looksIpv6(const std::string& candStr)
{
    const size_t firstSpace = candStr.find(' ');
    return firstSpace != std::string::npos &&
           candStr.find(':', firstSpace + 1) != std::string::npos;
}

/// "host 192.168.1.66:48550/UDP" — enough to tell a direct path from one that
/// leaves through the router and comes back (same public IP on both ends).
QString describeCandidate(const rtc::Candidate& c)
{
    const char* type = "unknown";
    switch (c.type()) {
    case rtc::Candidate::Type::Host: type = "host"; break;
    case rtc::Candidate::Type::ServerReflexive: type = "srflx"; break;
    case rtc::Candidate::Type::PeerReflexive: type = "prflx"; break;
    case rtc::Candidate::Type::Relayed: type = "relay"; break;
    case rtc::Candidate::Type::Unknown: break;
    }
    const char* transport = c.transportType() == rtc::Candidate::TransportType::Udp ? "UDP" : "TCP";

    const auto addr = c.address();
    const auto port = c.port();
    if (!addr.has_value() || !port.has_value()) {
        // Unresolved (an mDNS .local candidate, typically): the raw line is all
        // there is, and it still names the type.
        return QStringLiteral("%1 %2").arg(type, QString::fromStdString(c.candidate()));
    }
    return QStringLiteral("%1 %2:%3/%4")
        .arg(type, QString::fromStdString(*addr))
        .arg(*port)
        .arg(transport);
}

/// S3XYCast edition: an address as the route verdict compares it — the text
/// QHostAddress gives, an IPv4 written as IPv6 (::ffff:a.b.c.d) as IPv4.
/// Empty when it is not an address.
QString routeAddress(const std::string& text)
{
    const QHostAddress addr(QString::fromStdString(text));
    if (addr.isNull()) return {};
    bool isV4 = false;
    const quint32 v4 = addr.toIPv4Address(&isV4);
    return isV4 ? QHostAddress(v4).toString() : addr.toString();
}

/// S3XYCast edition: the candidate's address the same way, when it has one
/// (a literal one; a .local name stays unresolved here, no lookup made).
QString routeAddress(const rtc::Candidate& given)
{
    rtc::Candidate c = given;
    if (!c.isResolved()) c.resolve(rtc::Candidate::ResolveMode::Simple);
    const auto addr = c.address();
    return addr.has_value() ? routeAddress(*addr) : QString();
}

void addOnce(std::vector<QString>& list, const QString& value)
{
    if (value.isEmpty()) return;
    for (const QString& v : list)
        if (v == value) return;
    list.push_back(value);
}

} // namespace

void RelayBase::setPublicAddress(const std::string& publicIP, uint16_t publicPort)
{
    m_PublicIP = publicIP;
    m_PublicPort = publicPort;
    m_OnSharedPorts = false;
    m_SharedHoles.clear();
    m_SharedTcpHoles.clear();
    m_Tcp443LeadsTo = 0;
    qInfo() << "[Relay] UPnP public address set:" << QString::fromStdString(publicIP) << ":"
            << publicPort;
}

void RelayBase::setSharedPublicPorts(const std::string& publicIP, std::vector<uint16_t> ports,
                                     std::vector<uint16_t> tcpPorts, uint16_t tcp443)
{
    m_PublicIP = publicIP;
    m_PublicPort = 0;
    m_OnSharedPorts = true;
    m_SharedHoles = std::move(ports);
    m_SharedTcpHoles = std::move(tcpPorts);
    // Only towards a port the router forwards in TCP: 443 leads to that port
    m_Tcp443LeadsTo = mw::ice::publicPortFor(tcp443, true, 0, m_SharedTcpHoles);
    QStringList list;
    for (const uint16_t port : m_SharedHoles)
        list << QString::number(port);
    qInfo().noquote() << "[Relay] Shared ports the router forwards:"
                      << QString::fromStdString(publicIP) << "port"
                      << list.join(QStringLiteral(", "))
                      << (m_Tcp443LeadsTo != 0 ? "(and TCP 443)" : "");
}

void RelayBase::logSelectedCandidatePair(rtc::PeerConnection& pc, const char* logTag)
{
    rtc::Candidate local;
    rtc::Candidate remote;
    if (!pc.getSelectedCandidatePair(&local, &remote)) {
        qInfo() << logTag << "Selected candidate pair: none reported";
        return;
    }
    qInfo() << logTag << "Selected candidate pair: local" << describeCandidate(local) << "-> remote"
            << describeCandidate(remote);
    // S3XYCast edition: which way it went, for the PC's own page
    // (judgeRouteLocked).
    {
        std::lock_guard<std::mutex> lock(m_RouteMutex);
        m_RouteHavePair = true;
        m_RouteLocalRelay = local.type() == rtc::Candidate::Type::Relayed;
        m_RouteRemoteRelay = remote.type() == rtc::Candidate::Type::Relayed;
        m_RouteRemoteIp = routeAddress(remote);
        m_RoutePairText = describeCandidate(local) + QStringLiteral(" -> ") + describeCandidate(remote);
        tellRouteLocked();
    }
    // On the server's shared ports, the peer it may now trust for this agent
    mw::icemuxclient::confirmed(remote);
}

void RelayBase::recheckSelectedPair(rtc::PeerConnection& pc, const char* logTag)
{
    rtc::Candidate local;
    rtc::Candidate remote;
    if (!pc.getSelectedCandidatePair(&local, &remote)) return;
    const QString text =
        describeCandidate(local) + QStringLiteral(" -> ") + describeCandidate(remote);
    std::lock_guard<std::mutex> lock(m_RouteMutex);
    // Nominated before the connection is up (no other pair was pending): the
    // pair read at Connected is this one, and a connection that never comes
    // up must tell nothing.
    if (!m_RouteHavePair) return;
    if (text != m_RoutePairText) {
        m_RouteLocalRelay = local.type() == rtc::Candidate::Type::Relayed;
        m_RouteRemoteRelay = remote.type() == rtc::Candidate::Type::Relayed;
        m_RouteRemoteIp = routeAddress(remote);
        m_RoutePairText = text;
        // The shared ports' trust is left to the pair read at Connected, as
        // it always was: this only says which way the stream now goes.
        qInfo() << logTag << "Selected candidate pair once nominated: local"
                << describeCandidate(local) << "-> remote" << describeCandidate(remote);
    }
    tellRouteLocked();
}

void RelayBase::noteRelayServers(const QStringList& hosts)
{
    for (const QString& host : hosts) {
        const QString literal = routeAddress(host.toStdString());
        if (!literal.isEmpty()) {
            addRelayServer(literal);
            continue;
        }
        // Looked up off this thread, answered on it; nothing if the relay is
        // gone by then (this is the context). The relay's candidates still
        // name it if the answer comes late.
        QHostInfo::lookupHost(host, this, [this](const QHostInfo& info) {
            if (info.error() != QHostInfo::NoError) return;
            for (const QHostAddress& addr : info.addresses())
                addRelayServer(routeAddress(addr.toString().toStdString()));
        });
    }
}

void RelayBase::addRelayServer(const QString& ip)
{
    if (ip.isEmpty()) return;
    std::lock_guard<std::mutex> lock(m_RouteMutex);
    addOnce(m_RelayServerIps, ip);
    if (m_RouteHavePair) tellRouteLocked();
}

void RelayBase::tellRouteLocked()
{
    // Told while the lock is held, so that two threads' words go out in the
    // order they were reached: every receiver is queued (the main program's
    // context, never this relay's thread), so emitting only posts an event,
    // and nothing it posts comes back here.
    const QJsonObject tell = judgeRouteLocked();
    if (!tell.isEmpty()) emit routeSelected(tell);
}

void RelayBase::noteRemoteCandidate(const rtc::Candidate& candidate)
{
    using mw::edition::route::CandidateKind;
    CandidateKind kind = CandidateKind::Other;
    switch (candidate.type()) {
    case rtc::Candidate::Type::Host: kind = CandidateKind::Host; break;
    case rtc::Candidate::Type::ServerReflexive:
    case rtc::Candidate::Type::PeerReflexive: kind = CandidateKind::Reflexive; break;
    case rtc::Candidate::Type::Relayed: kind = CandidateKind::Relay; break;
    case rtc::Candidate::Type::Unknown: break;
    }
    const QString ip = routeAddress(candidate);
    const bool udp = candidate.transportType() == rtc::Candidate::TransportType::Udp;
    const bool isPublic =
        !ip.isEmpty() && NetClassify::classify(ip) == NetClassify::Kind::Public;
    std::lock_guard<std::mutex> lock(m_RouteMutex);
    if (kind == CandidateKind::Relay) addOnce(m_RelayServerIps, ip);
    if (mw::edition::route::showsInternetUdp(kind, udp, isPublic)) m_BrowserUdp = true;
    if (m_RouteHavePair) tellRouteLocked();
}

QJsonObject RelayBase::judgeRouteLocked()
{
    using namespace mw::edition::route;
    // Through the relay when either end is the relay's — or when the
    // browser's end is the relay server's own address: a check from the
    // browser's relay candidate that came in before the candidate did, which
    // ICE names peer-reflexive and never renames (a box that lets the relay's
    // packets in, as a forwarded port does). On the PC's own network when the
    // browser's address is not a public one: an unresolved .local is a
    // browser of this network hiding its address. Whether a public one is
    // this network's own (the box's public address, a global IPv6 of the PC's
    // prefix) is the main program's to say: it has the box's address (peer).
    bool fromRelayAddress = false;
    for (const QString& ip : m_RelayServerIps)
        if (!m_RouteRemoteIp.isEmpty() && ip == m_RouteRemoteIp) fromRelayAddress = true;
    Seen s;
    s.relayed = m_RouteLocalRelay || m_RouteRemoteRelay || fromRelayAddress;
    s.lan = !s.relayed &&
            (m_RouteRemoteIp.isEmpty() ||
             NetClassify::isTrustedPeer(NetClassify::classify(m_RouteRemoteIp)));
    if (!s.relayed) s.peer = m_RouteRemoteIp;
    // A port the box had open for this stream: its own UPnP hole, or a shared
    // port the router forwards (only then is m_OnSharedPorts set) — or the
    // relay's own check came in, from a relayed address this PC had not been
    // told of yet and so had sent nothing to. A box that filters by port
    // drops that; one that lets it in has a rule made by hand, or lets in
    // whatever comes from an address this PC wrote to, and then the car's
    // own checks come straight in as well. Relayed so, the detour is ICE's
    // choice between two ways that both work, not the box's doing: no rule
    // would change it.
    const bool relayLetIn = fromRelayAddress && !m_RouteLocalRelay && !m_RouteRemoteRelay;
    s.hole = relayLetIn || (m_OnSharedPorts ? !m_SharedHoles.empty() : m_PublicPort > 0);
    s.browserUdp = m_BrowserUdp;
    if (m_RouteTold && s == m_RouteLast) return {};
    if (relayLetIn)
        qInfo() << "[Relay] The browser's end of the pair is the relay server's own address:"
                << "the stream goes through the relay, its check let in by the box";
    m_RouteTold = true;
    m_RouteLast = s;
    return mw::edition::route::event(s);
}

void RelayBase::wireMicUplink(rtc::Track& audioTrack, const char* logTag)
{
    if (!m_Mic) return;
    std::weak_ptr<MicUplink> weak = m_Mic;
    audioTrack.onMessage([weak](rtc::message_variant message) {
        const auto* bytes = std::get_if<rtc::binary>(&message);
        if (!bytes || bytes->empty()) return;
        if (const auto mic = weak.lock())
            mic->onPacket(reinterpret_cast<const uint8_t*>(bytes->data()), bytes->size());
    });
    qInfo() << logTag << "Audio offered sendrecv: the viewer's microphone plays into"
            << QString::fromStdString(m_Mic->deviceName());
}

void RelayBase::logMicAnswer(const std::string& sdp, const char* logTag) const
{
    if (!m_Mic) return;
    const mw::mic::AudioAnswer answer = mw::mic::readAudioAnswer(sdp);
    if (!answer.found || !answer.sends)
        qInfo() << logTag
                << "Microphone: the browser answered without sending (no track, or "
                   "the page has the setting off)";
    else if (!answer.hasSsrc)
        qWarning() << logTag
                   << "Microphone: the browser sends, but its answer names no SSRC — "
                      "libdatachannel cannot route that RTP to the track";
    else
        qInfo() << logTag << "Microphone: the browser will send on the audio section";
}

void RelayBase::stopMic()
{
    if (m_Mic) m_Mic->stop();
}

std::string RelayBase::micOpusFmtp() const
{
    std::string fmtp = "minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1";
    if (m_Mic) fmtp += ";maxaveragebitrate=128000;maxplaybackrate=48000";
    return fmtp;
}

void RelayBase::emitLocalCandidate(const rtc::Candidate& candidate, const char* logTag)
{
    rtc::Candidate modCandidate = candidate;
    // The copy on the router's TCP 443, when this candidate has one
    std::string by443;

    QHostAddress addr;
    const bool resolved = candidateAddress(candidate, &addr);
    const bool isIpv4 = resolved ? addr.protocol() == QAbstractSocket::IPv4Protocol
                                 : !looksIpv6(candidate.candidate());
    // An unresolved candidate is treated as public: the conservative verdict,
    // since the tunnel branch below grants an exemption.
    const NetClassify::Kind kind =
        resolved ? NetClassify::classify(addr.toString()) : NetClassify::Kind::Public;

    // S3XYCast edition: a relay candidate of ours would name the relay server
    // too (judgeRouteLocked). This PC is given no relay today (buildIceConfig:
    // the relay is the browser's, SignalingServer::sendIceConfig): kept for
    // the day it is.
    if (candidate.type() == rtc::Candidate::Type::Relayed) addRelayServer(routeAddress(candidate));

    // If UPnP is active and this is a host candidate, rewrite it with the
    // public IP and mapped port. This gives the browser a reachable endpoint
    // through the UPnP-opened router port. On the server's shared ports there
    // are several, and each has its copy on its own number, when the router
    // forwards it.
    // On the shared ports a TCP candidate has its copy where the router
    // forwards the port in TCP, which it may not where it forwards it in UDP.
    const bool overTcp = candidate.transportType() != rtc::Candidate::TransportType::Udp;
    const std::vector<uint16_t>& holes = overTcp ? m_SharedTcpHoles : m_SharedHoles;
    const bool hasHole =
        m_OnSharedPorts ? !m_SharedHoles.empty() || !m_SharedTcpHoles.empty() : m_PublicPort > 0;
    const uint16_t publicPort =
        mw::ice::publicPortFor(candidate.port().value_or(0), m_OnSharedPorts, m_PublicPort, holes);
    if (m_ForceHostPublic && !m_PublicIP.empty() && hasHole &&
        candidate.type() == rtc::Candidate::Type::Host) {
        if (kind == NetClassify::Kind::Tunnel) {
            // A mesh VPN interface carries its own NAT traversal and is already
            // reachable by any peer that can see it. Rewriting it to the public
            // IP would duplicate the LAN candidate *and* push the media back out
            // to the internet — silently defeating the tunnel the user chose.
            // Emit it untouched, and only to a peer inside our own network.
            if (m_EmitLanCandidate) {
                qInfo() << logTag << "Tunnel host candidate kept as-is:" << addr.toString();
                emit signalingIceCandidate(std::string(candidate.candidate()),
                                           std::string(candidate.mid()));
            } else {
                qInfo() << logTag << "Dropping tunnel host candidate for a public peer";
            }
            return;
        }

        if (isIpv4) {
            // For a peer inside our own network (incl. one reaching us through
            // the public URL via NAT hairpin), also advertise the original
            // private host candidate so it can connect directly to 192.168.x.x —
            // many routers don't hairpin UDP, so a public-only candidate never
            // becomes reachable locally. Gated on m_EmitLanCandidate (false for
            // public peers) so the internal address is never leaked outside.
            if (m_EmitLanCandidate)
                emit signalingIceCandidate(candidate.candidate(), std::string(candidate.mid()));
            if (publicPort == 0) {
                // A shared port the router does not forward: nothing at the
                // public address leads to it. The peer of our own network has
                // it above; no other is shown an internal address.
                if (!m_EmitLanCandidate)
                    qInfo() << logTag << "Host candidate on port" << candidate.port().value_or(0)
                            << "withheld from a public peer: the router does not forward it";
                return;
            }
            try {
                modCandidate.changeAddress(m_PublicIP, publicPort);
                // A reflexive address's priority, below the LAN host candidate
                // just emitted: a same-LAN peer then prefers the direct pair to
                // the router's hairpin instead of racing them (IcePriority.h).
                const uint32_t priority = mw::ice::srflxPriority(candidate.priority());
                modCandidate = rtc::Candidate(
                    mw::ice::withPriority(modCandidate.candidate(), priority), candidate.mid());
                qInfo() << logTag << "Host candidate ->" << QString::fromStdString(m_PublicIP)
                        << ":" << publicPort << "priority" << priority
                        << (m_EmitLanCandidate ? "(+ LAN)" : "");
                // The router's TCP 443 leads to this very port: the same
                // listener, reached by the one port some networks let out.
                // Below every other candidate: a browser that gets through
                // any other way never ends on it.
                if (mw::ice::has443Copy(candidate.transportType() ==
                                            rtc::Candidate::TransportType::TcpPassive,
                                        publicPort, m_Tcp443LeadsTo)) {
                    rtc::Candidate other = candidate;
                    other.changeAddress(m_PublicIP, mw::ice::kTcp443);
                    const uint32_t last = mw::ice::lastResortPriority(candidate.priority());
                    by443 = mw::ice::withPriority(other.candidate(), last);
                    qInfo() << logTag << "Host candidate ->" << QString::fromStdString(m_PublicIP)
                            << ": 443 (TCP) priority" << last;
                }
            } catch (const std::exception& e) {
                qWarning() << logTag << "Failed to rewrite candidate:" << e.what();
            }
        } else {
            // Only the REWRITE is skipped — IPv6 needs no NAT hole, so the
            // candidate goes out as it is (subject to the non-global gate
            // below). The old wording said "Skipping IPv6 candidate", which
            // read as a drop.
            qInfo() << logTag << "IPv6 candidate kept unrewritten (no NAT to traverse):"
                    << QString::fromStdString(candidate.candidate());
        }
    }

    // IPv6 under UPnP. This used to suppress every IPv6 candidate so ICE was
    // forced onto the IPv4 UPnP path, on the grounds that residential IPv6 often
    // blocks unsolicited inbound traffic (DTLS/SCTP timing out silently).
    //
    // That cost more than it bought. The IPv4 path it forces goes to the public
    // address, so a peer on our own LAN reaches us by hairpinning through the
    // router — measured 2026-08-30: three DataChannel sessions from a Mac two
    // metres away nominated `srflx <public v4> -> prflx 10.0.0.254`, the
    // router's own LAN address, at 20 Mbps. The two MediaTrack sessions of the
    // same run reached a direct IPv6 pair instead, and only because ICE
    // rediscovered it peer-reflexively — suppression never stopped IPv6, it just
    // made winning it a race the transports lost or won at random.
    //
    // So: a GLOBAL IPv6 address is emitted. It is no more private than the
    // public IPv4 already advertised beside it, and it is an ADDITIONAL pair —
    // ICE falls back to the IPv4 pairs if its checks fail, which is precisely
    // the blocked-inbound case the suppression was guarding against.
    //
    // A non-global IPv6 (ULA — including a mesh-VPN address — or link-local)
    // stays behind the same gate as the private IPv4 host candidate above: only
    // a peer inside a network we control may see it.
    // `kind` classifies THIS candidate's own address, so a global v6 is Public
    // (emit) and a ULA/link-local one is Private (gate it).
    if (m_SuppressIPv6 && !isIpv4 && NetClassify::isTrustedPeer(kind) && !m_EmitLanCandidate) {
        qInfo() << logTag << "Suppressing non-global IPv6 candidate:"
                << QString::fromStdString(modCandidate.candidate()).left(80);
        return;
    }

    emit signalingIceCandidate(std::string(modCandidate.candidate()),
                               std::string(modCandidate.mid()));
    if (!by443.empty()) emit signalingIceCandidate(by443, std::string(candidate.mid()));
}

QByteArray RelayBase::inputCapsMessage(const InputMsg::Policy& policy)
{
    return QJsonDocument(QJsonObject{{QStringLiteral("type"), QStringLiteral("inputcaps")},
                                     {QStringLiteral("keyboardMouse"), policy.keyboardMouse}})
        .toJson(QJsonDocument::Compact);
}

QJsonObject RelayBase::hidCapsMessage(const InputMsg::Policy& policy, IMediaEngine& engine)
{
    const QString why =
        !policy.hid ? QStringLiteral("not allowed for this player") : engine.hidUnavailableReason();
    return QJsonObject{{QStringLiteral("type"), QStringLiteral("hidcaps")},
                       {QStringLiteral("available"), why.isEmpty()},
                       {QStringLiteral("ffb"), why.isEmpty() && engine.hidForceFeedback()},
                       {QStringLiteral("hidpp"), why.isEmpty() && engine.hidRelaysHidpp()},
                       {QStringLiteral("why"), why}};
}
