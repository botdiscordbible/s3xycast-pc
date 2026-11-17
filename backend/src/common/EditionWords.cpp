/*
 * S3XYCast PC — an edition of MoonlightWeb. GPLv3, like the rest of the tree.
 *
 * See EditionWords.h.
 */
#include "common/EditionWords.h"

#include <QCoreApplication>
#include <QLocale>

#include <cstring>

namespace mw::edition {
namespace {

struct Words
{
    const char* english; ///< exactly as the tr() call spells it
    const char* french;
};

// Kept in the order the program shows them. "Streaming" is the word the
// interface uses in French too ("Le streaming est autorisé"); somebody who
// watches the PC "regarde cet écran", which is what the owner would say.
// frontend/test/trayWords.test.js holds this table against every tr() call of
// TrayManager.cpp and ViewerNotices.cpp: a sentence upstream adds, or rewords,
// fails there until it has its French.
const Words kFrench[] = {
    // ── The icon's menu (TrayManager.cpp) ──────────────────────────────────
    {"Server runs as a system service", "Le programme tourne comme un service de Windows"},
    {"Streaming", "Streaming en cours"},
    {"Streaming (%1)", "Streaming en cours (%1)"},
    {"&Open", "&Ouvrir"},
    {"&Server Settings", "&Réglages du PC"},
    {"Start at &login", "&Démarrer à l'ouverture de session"},
    {"&Restart", "R&edémarrer"},
    {"&Restart Server", "R&edémarrer le programme"},
    {"&Quit", "&Quitter"},
    {"&Quit Server", "&Quitter le programme"},
    {"Could not enable start at login",
     "Le démarrage à l'ouverture de session n'a pas pu être activé"},
    {"Could not disable start at login",
     "Le démarrage à l'ouverture de session n'a pas pu être désactivé"},
    {"Restarting the server…", "Redémarrage du programme…"},

    // ── Who watches, in the menu and in the notices (ViewerNotices.cpp) ────
    {"This computer", "Cet ordinateur"},
    {"Someone", "Quelqu'un"},
    {"%1 started streaming this screen", "%1 commence à regarder cet écran"},
    {"%1 stopped streaming this screen", "%1 ne regarde plus cet écran"},
    {"%1 has been streaming this screen since %2", "%1 regarde cet écran depuis %2"},
    {"%1 streamed this screen from %2 to %3", "%1 a regardé cet écran de %2 à %3"},
    {"%1, since %2", "%1, depuis %2"},
    {"%1, %2 to %3", "%1, de %2 à %3"},
    {"Disconnect %1", "Déconnecter %1"},
    {"Disconnect %1 (plain HTTP)", "Déconnecter %1 (HTTP non chiffré)"},
    {"Disconnect %1 (%2, plain HTTP)", "Déconnecter %1 (%2, HTTP non chiffré)"},
    {"Security notice: %1 started streaming this screen over plain HTTP",
     "Avis de sécurité : %1 commence à regarder cet écran en HTTP non chiffré"},
    {"Security notice: %1 is streaming over plain HTTP",
     "Avis de sécurité : %1 regarde en HTTP non chiffré"},
    {"Security notice: %1 has been streaming this screen over plain HTTP since %2",
     "Avis de sécurité : %1 regarde cet écran en HTTP non chiffré depuis %2"},
    {"Security notice: %1 devices are streaming over plain HTTP",
     "Avis de sécurité : %1 appareils regardent en HTTP non chiffré"},
    {"Security notice: %1 are streaming over plain HTTP",
     "Avis de sécurité : %1 regardent en HTTP non chiffré"},
};

} // namespace

QString frenchWordsFor(const char* sourceText)
{
    if (!sourceText) return {};
    for (const Words& words : kFrench)
        if (std::strcmp(words.english, sourceText) == 0) return QString::fromUtf8(words.french);
    return {};
}

int frenchWordsCount()
{
    return static_cast<int>(sizeof(kFrench) / sizeof(kFrench[0]));
}

bool speaksFrench(const QStringList& uiLanguages)
{
    if (uiLanguages.isEmpty()) return false;
    const QString first = uiLanguages.first().toLower();
    return first == QLatin1String("fr") || first.startsWith(QLatin1String("fr-")) ||
           first.startsWith(QLatin1String("fr_"));
}

QString WordsTranslator::translate(const char* context, const char* sourceText,
                                   const char* disambiguation, int n) const
{
    Q_UNUSED(context);
    Q_UNUSED(disambiguation);
    Q_UNUSED(n);
    return frenchWordsFor(sourceText);
}

bool installWords()
{
    QCoreApplication* app = QCoreApplication::instance();
    if (!app) return false;
    if (!speaksFrench(QLocale::system().uiLanguages())) return false;
    // The application's child: it lives exactly as long as the tr() calls do.
    return QCoreApplication::installTranslator(new WordsTranslator(app));
}

} // namespace mw::edition
