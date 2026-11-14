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
 */

const FR = {
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
    'Not connected': 'Non connecté',
    'Reload the page': 'Recharger la page',
    'Remove this machine from my list': 'Retirer ce PC de ma liste',
    'Removed from this browser’s list of machines.': 'Retiré de la liste de ce navigateur.',
    'That machine is not online right now.':
        'Votre PC n’est pas en ligne pour le moment. Vérifiez qu’il est allumé, que sa session est ouverte et que S3XYCast PC y tourne.',
    'That machine went offline.': 'Votre PC vient de se déconnecter.',
    'Your machine did not answer in time.': 'Votre PC n’a pas répondu à temps.',
    'Your machine answered, but no direct connection could be opened.':
        'Votre PC a répondu, mais aucune liaison directe n’a pu s’ouvrir.',
    'This network is not letting the two ends reach each other. Company networks and public Wi-Fi often block what that takes. A phone hotspot is the quickest way to tell.':
        'Le réseau empêche les deux côtés de se joindre. Depuis une voiture, la box de la maison doit laisser entrer la liaison (UPnP, ou une règle de ports vers le PC). Un partage de connexion du téléphone permet de vérifier.',
    'This machine serves a modified interface.': 'Ce PC sert une interface modifiée.',
    'MoonlightWeb only opens the official one, so nothing from it was run.':
        'S3XYCast PC n’ouvre que l’interface officielle : rien n’a été exécuté.',
    'This page is out of date — reload it.': 'Cette page n’est plus à jour : rechargez-la.',
};

/** Sentences with a part that varies. `$1`, `$2` take what the pattern caught. */
const FR_PATTERNS = [
    [/^(\d+) of (\d+) files$/, '$1 fichiers sur $2'],
    [/^The interface did not come through: ([\s\S]*)$/, 'L’interface n’est pas arrivée : $1'],
    [
        /^This browser refused to install the application: ([\s\S]*)$/,
        'Ce navigateur a refusé d’installer l’application : $1',
    ],
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
        if (pattern.test(text)) return text.replace(pattern, to);
    }
    return text;
}
