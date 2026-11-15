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

#pragma once

#include <QJsonObject>
#include <QString>
#include <QStringList>

/**
 * The relay of last resort, as this host knows it.
 *
 * MoonlightWeb runs no relay: the picture goes from the PC to the browser
 * directly or not at all. This edition's introduction server names one
 * (deploy/s3xycast-relais) for the browsers no direct path reaches — a home
 * whose router opens nothing, a car that sends no UDP. The browser is the one
 * that connects to it; the host only passes its address and credentials on,
 * in the `ice-config` it already sends before a stream (SignalingServer), and
 * then finds one more candidate to answer among the browser's.
 *
 * The server sends them in an "ice" frame when the host's line comes up and
 * again well before they lapse (RendezvousClient). They name this host's own
 * public address — the only one the relay will carry traffic to for them.
 *
 * Kept in memory only, on the main thread: nothing is written to settings.json,
 * and a restart learns them again with the line.
 */
namespace mw::relay {

struct Grant
{
    QStringList urls;       ///< turn: / turns: addresses, as a browser takes them
    QString username;       ///< "<expiry>:<this host's public IPv4>"
    QString credential;     ///< good until expiresAtMs
    qint64 expiresAtMs = 0; ///< on this machine's clock (ms since the epoch)

    bool isValid() const { return !urls.isEmpty() && expiresAtMs > 0; }
};

/// How long before its end a grant stops being handed out: a stream that
/// starts now must not find its relay refusing it a few minutes in.
inline constexpr qint64 kUsableMarginMs = 10 * 60 * 1000;
/// The longest lifetime taken at its word (the relay itself refuses more).
inline constexpr qint64 kMaxTtlSeconds = 48 * 3600;

/// Reads the payload of an "ice" frame: {"urls": [...], "username", "credential",
/// "ttl": seconds}. Anything that does not look like it gives an invalid grant:
/// the frame comes from the introduction server, and is still read by its
/// shape alone.
Grant parse(const QJsonObject& payload, qint64 nowMs);

/// The grant as one entry of a browser's `iceServers`, or an empty object when
/// it is not usable at @p nowMs (none, or about to lapse).
QJsonObject asIceServer(const Grant& grant, qint64 nowMs);

/// The grant this process holds. Main thread only.
void setCurrent(const Grant& grant);
/// What to tell a browser now: asIceServer() of the grant held, at this
/// machine's time. Empty when there is none. Main thread only.
QJsonObject currentIceServer();
/// Whether a usable grant is held (for the status the admin page reads).
bool available();

} // namespace mw::relay
