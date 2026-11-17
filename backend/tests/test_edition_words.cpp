/*
 * S3XYCast PC — TNR suite of the edition. GPLv3, like the files under test.
 *
 * The program's own words in French (common/EditionWords.h): the menu of the
 * icon next to the clock and the notices it raises, which MoonlightWeb has in
 * English only. A table behind a translator, installed where Windows is in
 * French.
 */
#include "test_framework.h"
#include "common/EditionWords.h"

#include <QCoreApplication>

using namespace mw::edition;

void run_edition_words_tests()
{
    // The menu, as a French subscriber reads it.
    CHECK_EQ(frenchWordsFor("&Open"), QStringLiteral("&Ouvrir"));
    CHECK_EQ(frenchWordsFor("&Server Settings"), QString::fromUtf8("&Réglages du PC"));
    CHECK_EQ(frenchWordsFor("&Quit"), QStringLiteral("&Quitter"));
    CHECK_EQ(frenchWordsFor("Start at &login"),
             QString::fromUtf8("&Démarrer à l'ouverture de session"));

    // A sentence carries its places: Qt fills %1, %2, %3 after the lookup.
    CHECK_EQ(frenchWordsFor("%1 streamed this screen from %2 to %3")
                 .arg(QStringLiteral("iPhone"), QStringLiteral("18:02"), QStringLiteral("18:40")),
             QString::fromUtf8("iPhone a regardé cet écran de 18:02 à 18:40"));
    CHECK_EQ(frenchWordsFor("Streaming (%1)").arg(2), QStringLiteral("Streaming en cours (2)"));

    // Exactly as spelt, the ellipsis included: a near miss is not a match.
    CHECK(!frenchWordsFor("Restarting the server\xE2\x80\xA6").isEmpty());
    CHECK(frenchWordsFor("Restarting the server...").isEmpty());
    CHECK(frenchWordsFor("&open").isEmpty());

    // What the table does not hold stays in English: Qt shows the source text
    // when a translator answers nothing.
    CHECK(frenchWordsFor("A sentence upstream adds tomorrow").isEmpty());
    CHECK(frenchWordsFor("").isEmpty());
    CHECK(frenchWordsFor(nullptr).isEmpty());
    CHECK(frenchWordsCount() >= 29);

    // The translator answers from the table whatever the context, and is
    // never "empty": Qt does not ask an empty translator.
    {
        WordsTranslator translator;
        CHECK(!translator.isEmpty());
        CHECK_EQ(translator.translate("TrayManager", "&Quit Server"),
                 QStringLiteral("&Quitter le programme"));
        CHECK_EQ(translator.translate("AnyOtherContext", "Someone"), QStringLiteral("Quelqu'un"));
        CHECK(translator.translate("TrayManager", "Not in the table").isEmpty());
        CHECK(translator.translate("TrayManager", nullptr).isEmpty());
    }

    // Through Qt itself, the way the tray asks: installed, its sentences come
    // back in French and one the table does not hold comes back as written;
    // removed, the English is back (the suites after this one read it).
    {
        WordsTranslator translator;
        CHECK(QCoreApplication::installTranslator(&translator));
        CHECK_EQ(QCoreApplication::translate("TrayManager", "&Quit"), QStringLiteral("&Quitter"));
        CHECK_EQ(QCoreApplication::translate("TrayManager", "%1 stopped streaming this screen")
                     .arg(QStringLiteral("Tesla")),
                 QString::fromUtf8("Tesla ne regarde plus cet écran"));
        CHECK_EQ(QCoreApplication::translate("TrayManager", "Not in the table"),
                 QStringLiteral("Not in the table"));
        CHECK(QCoreApplication::removeTranslator(&translator));
        CHECK_EQ(QCoreApplication::translate("TrayManager", "&Quit"), QStringLiteral("&Quit"));
    }

    // French where the system's first interface language is French, however
    // it spells the region; nothing else.
    CHECK(speaksFrench({QStringLiteral("fr-FR"), QStringLiteral("en-US")}));
    CHECK(speaksFrench({QStringLiteral("fr")}));
    CHECK(speaksFrench({QStringLiteral("fr_CA")}));
    CHECK(speaksFrench({QStringLiteral("FR-be")}));
    CHECK(!speaksFrench({QStringLiteral("en-US"), QStringLiteral("fr-FR")}));
    CHECK(!speaksFrench({QStringLiteral("fra")}));
    CHECK(!speaksFrench({QStringLiteral("de-DE")}));
    CHECK(!speaksFrench({}));
}
