/*
 * S3XYCast PC — an edition of MoonlightWeb. GPLv3, like the rest of the tree.
 *
 * What the icon next to the clock says about a newer version.
 *
 * MoonlightWeb says it on its page: a banner with an "Update" button, read by
 * whoever opens that page. A subscriber's PC runs for weeks with nobody
 * opening it — they watch it from the car — and a version that fixes what
 * they complained about waited there unseen ("faut que s3xycast pc face une
 * notification ou quoi sur le pc client, si mise a jour dispo", 17/11/2026).
 *
 * So the program says it where its owner is: a notification from the icon,
 * and an entry at the top of its menu for as long as the version is on offer.
 * This is the part that decides when: once per version and per run — a PC
 * that stays on is told once, and one that restarts is reminded at its next
 * start, until the update is taken.
 */
#pragma once

#include <QJsonObject>
#include <QString>

namespace mw::edition {

class UpdateNotice
{
public:
    /// The update checker's answer, after a look. Returns the version to
    /// announce now, or an empty string: none is on offer, or this one was
    /// announced already in this run.
    QString take(const QJsonObject& status)
    {
        const QString latest = status.value(QStringLiteral("update_available")).toBool()
                                   ? status.value(QStringLiteral("latest")).toString().trimmed()
                                   : QString();
        m_Offered = latest;
        if (latest.isEmpty() || latest == m_Announced) return {};
        m_Announced = latest;
        return latest;
    }

    /// The version on offer, empty when there is none: what the menu's entry
    /// is written from.
    QString offered() const { return m_Offered; }

private:
    QString m_Offered;
    QString m_Announced;
};

} // namespace mw::edition
