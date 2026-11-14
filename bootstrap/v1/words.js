/*
 * S3XYCast PC — the S3XYCast edition of MoonlightWeb. Entry page. GPLv3.
 * Copyright (C) 2026 Bruno Martin <brunoocto@gmail.com> (MoonlightWeb)
 * Modifications for the S3XYCast edition, 2026.
 *
 * The words of the entry page in the visitor's language.
 *
 * The entry page speaks English in its own code (boot.js, tunnel.js), in
 * sentences written where each thing happens. This edition's visitors are
 * mostly French speakers reading a car's screen, so what the page is about to
 * show goes through tr() first: an exact sentence, or a sentence with a
 * variable part, is replaced by its translation; anything else is shown as it
 * was written. Nothing here changes what the page does, only what it says, and
 * a sentence missing from the tables is English rather than an error.
 *
 * test/entryPageWords.test.js (frontend) reads the two scripts and fails on a
 * sentence the page can show that has no French here.
 */

const FR = {
    // ── The steps, in the order the page goes through them ──
    'Starting…': 'Démarrage…',
    'Securing the communication…': 'Sécurisation de la liaison…',
    Secured: 'Liaison sécurisée',
    'Preparing this browser…': 'Préparation du navigateur…',
    'Looking for your machine…': 'Recherche de votre PC…',
    'Checking it is really yours…': 'Vérification que c’est bien le vôtre…',
    'Opening a direct connection…': 'Ouverture d’une liaison directe…',
    'Connected.': 'Connecté.',
    'Checking for updates…': 'Recherche de mises à jour…',
    'Fetching the interface…': 'Chargement de l’interface…',
    'from your machine, not from here': 'depuis votre PC, pas depuis ce serveur',
    'Your machine is installing an update — waiting for it…':
        'Votre PC installe une mise à jour, patientez…',

    // ── What the page itself offers ──
    'Not connected': 'Non connecté',
    'Not opened': 'Non ouvert',
    'Reload the page': 'Recharger la page',
    'Remove this machine from my list': 'Retirer ce PC de ma liste',
    'Removed from this browser’s list of machines.': 'Retiré de la liste de ce navigateur.',
    'No server found': 'Aucun PC trouvé',
    'Choose a machine': 'Choisir un PC',
    'Switch to another machine': 'Changer de PC',
    'Your machines': 'Vos PC',

    // ── The machine cannot be reached ──
    'That machine is not online right now.':
        'Votre PC n’est pas en ligne pour le moment. Vérifiez qu’il est allumé, que sa session est ouverte et que S3XYCast PC y tourne.',
    'That machine went offline.': 'Votre PC vient de se déconnecter.',
    'That machine already has as many connections as it accepts.':
        'Ce PC a déjà autant de connexions qu’il en accepte.',
    'Your machine did not answer in time.': 'Votre PC n’a pas répondu à temps.',
    'Your machine answered, but no direct connection could be opened.':
        'Votre PC a répondu, mais aucune liaison directe n’a pu s’ouvrir.',
    'This network is not letting the two ends reach each other. Company networks and public Wi-Fi often block what that takes. A phone hotspot is the quickest way to tell.':
        'Le réseau empêche les deux côtés de se joindre. Depuis une voiture, la box de la maison doit laisser entrer la liaison (UPnP, ou une règle de ports vers le PC). Un partage de connexion du téléphone permet de vérifier.',
    'If your machine is switched off or has no internet access, nothing here can reach it. That is by design, not a fault.':
        'Si votre PC est éteint ou sans accès à Internet, rien ici ne peut le joindre. C’est voulu, ce n’est pas une panne.',
    'Trying again every few seconds for a minute — this page carries on by itself as soon as your machine answers.':
        'Nouvel essai toutes les quelques secondes pendant une minute : cette page continue toute seule dès que votre PC répond.',
    'This page keeps trying and carries on by itself as soon as your machine can be reached.':
        'Cette page continue d’essayer et reprend toute seule dès que votre PC est joignable.',
    'This page has stopped trying. Reload it to try again.':
        'Cette page a cessé d’essayer. Rechargez-la pour réessayer.',
    'Could not reach the introduction server.': 'Le serveur d’entrée est injoignable.',
    'The introduction server hung up.': 'Le serveur d’entrée a coupé la liaison.',
    'The introduction server refused.': 'Le serveur d’entrée a refusé.',

    // ── The address, the browser ──
    'This address does not name a machine.': 'Cette adresse ne désigne aucun PC.',
    'A S3XYCast PC link ends in a 26-character identifier. Your machine shows its own on its settings page and in its tray menu.':
        'Un lien S3XYCast PC se termine par un identifiant de 26 caractères. Votre PC affiche le sien dans ses réglages et dans son menu près de l’horloge.',
    'This browser cannot run the application this way.':
        'Ce navigateur ne peut pas ouvrir l’application de cette façon.',
    'Service workers are unavailable — often because the page is in a private window, or because they are disabled in the browser’s settings.':
        'Une fonction du navigateur manque, souvent parce que la page est ouverte en navigation privée ou que cette fonction est coupée dans ses réglages.',
    'This browser cannot store a key for your machine — private browsing, or storage turned off for this site.':
        'Ce navigateur ne peut pas garder de clé pour votre PC : navigation privée, ou stockage coupé pour ce site.',
    'The application is installed but did not start.':
        'L’application est installée mais n’a pas démarré.',
    'Close this tab and open your machine’s link again.':
        'Fermez cet onglet et rouvrez le lien de votre PC.',
    'This page is out of date — reload it.': 'Cette page n’est plus à jour : rechargez-la.',

    // ── The interface the machine sent ──
    'This machine serves a modified interface.': 'Ce PC sert une interface modifiée.',
    'S3XYCast PC only opens the official one, so nothing from it was run.':
        'S3XYCast PC n’ouvre que l’interface officielle : rien n’a été exécuté.',
    'your machine did not describe its interface': 'votre PC n’a pas décrit son interface',
    'your machine reported no interface files': 'votre PC n’a annoncé aucun fichier d’interface',
    'your machine did not send its main page': 'votre PC n’a pas envoyé sa page principale',
    'the interface changed while it was being fetched':
        'l’interface a changé pendant son chargement',
    'the tunnel is not open': 'la liaison n’est pas ouverte',
    'the host did not answer': 'votre PC n’a pas répondu',
    'the connection to your machine is not open': 'la liaison avec votre PC n’est pas ouverte',
    'this browser could not sign its own answer': 'ce navigateur n’a pas pu signer sa réponse',
};

/**
 * Sentences with a part that varies. `$1`, `$2` take what the pattern caught,
 * itself translated when it is a sentence of the table (a reason, usually).
 */
const FR_PATTERNS = [
    [/^(\d+) of (\d+) files$/, '$1 fichiers sur $2'],
    [/^The interface did not come through: ([\s\S]*?)\.$/, 'L’interface n’est pas arrivée : $1.'],
    [
        /^This browser refused to install the application: ([\s\S]*?)\.$/,
        'Ce navigateur a refusé d’installer l’application : $1.',
    ],
    [/^Refused: ([\s\S]*?)\.$/, 'Refusé : $1.'],
];

const TABLES = { fr: { exact: FR, patterns: FR_PATTERNS } };

function language() {
    try {
        return String(globalThis.navigator?.language || 'en')
            .slice(0, 2)
            .toLowerCase();
    } catch {
        return 'en';
    }
}

/**
 * @p text as the visitor reads it: translated when its language has the
 * sentence, unchanged otherwise (and always unchanged for anything that is not
 * a non-empty string).
 */
export function tr(text, lang = language()) {
    if (typeof text !== 'string' || !text) return text;
    const table = TABLES[lang];
    if (!table) return text;
    const exact = table.exact[text];
    if (exact) return exact;
    for (const [pattern, to] of table.patterns) {
        const caught = pattern.exec(text);
        if (!caught) continue;
        return to.replace(/\$(\d)/g, (_, n) => {
            const part = caught[Number(n)] ?? '';
            return table.exact[part] || part;
        });
    }
    return text;
}

/** The sentences a language has, for the test that holds the table complete. */
export function sentencesOf(lang) {
    return Object.keys(TABLES[lang]?.exact || {});
}
