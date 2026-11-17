/*
 * S3XYCast PC — an edition of MoonlightWeb. GPLv3, like the rest of the tree.
 *
 * The program's own words, in French.
 *
 * MoonlightWeb's interface speaks four languages. The program itself — the
 * menu of its icon next to the clock, the notices it raises when somebody
 * starts or stops watching — speaks English only: its tr() calls have no
 * catalogue behind them. A French subscriber right-clicks the icon and reads
 * "Server Settings", "Start at login", "Quit" (finishing pass, 17/11/2026).
 *
 * Some thirty sentences do not need Qt's catalogue machinery: they are a
 * table, behind a translator that answers from it. It is installed when the
 * user's interface is in French; every other language keeps the English.
 */

#pragma once

#include <QString>
#include <QStringList>
#include <QTranslator>

namespace mw::edition {

/// The French for one of the program's English sentences, as its tr() calls
/// spell it; empty when the table has none (Qt then shows the English).
QString frenchWordsFor(const char* sourceText);

/// How many sentences the table holds (the tests count them against the
/// program's tr() calls).
int frenchWordsCount();

/// Whether the user's interface is in French, from the languages the system
/// lists (QLocale::uiLanguages(): "fr-FR", "fr", "fr_CA"…). The first one
/// decides: it is the one Windows itself is shown in.
bool speaksFrench(const QStringList& uiLanguages);

/// A translator over the table. Not "empty", whatever Qt thinks of a
/// translator that loaded no file: an empty one is never asked.
class WordsTranslator final : public QTranslator
{
public:
    explicit WordsTranslator(QObject* parent = nullptr) : QTranslator(parent) {}
    bool isEmpty() const override { return false; }
    QString translate(const char* context, const char* sourceText,
                      const char* disambiguation = nullptr, int n = -1) const override;
};

/// Install the translator on the running application when the user's
/// interface is in French; true when it was. Once, after the application
/// object exists and before the tray builds its menu.
bool installWords();

} // namespace mw::edition
