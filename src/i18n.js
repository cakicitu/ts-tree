import { ref } from 'vue';

export const languages = ['de', 'en'];
const storageKey = 'ts-tree-lang';

const messages = {
  de: {
    title: 'Ts-Tree · Turnierbaum',
    language: 'Sprache',
    loading: 'Dein Turnier wird geladen …',
    tagline: 'DEIN TURNIER. KLAR ORGANISIERT.',
    footnote: 'TURNIERE EINFACH ORGANISIEREN',
    auth: {
      loginTitle: 'Willkommen bei Ts-Tree.', loginText: 'Melde dich an, um dein Turnier zu verwalten.',
      registerTitle: 'Konto erstellen.', registerText: 'Registriere dich kostenlos und lege dein eigenes Turnier an.',
      forgotTitle: 'Passwort vergessen?', forgotText: 'Gib deine E-Mail-Adresse ein. Wir schicken dir einen Link, mit dem du ein neues Passwort festlegen kannst.',
      resetTitle: 'Neues Passwort.', resetText: 'Lege ein neues Passwort für dein Konto fest. Danach bist du direkt angemeldet.',
      email: 'E-Mail-Adresse', emailPlaceholder: 'du@beispiel.de',
      password: 'Passwort', newPassword: 'Neues Passwort', passwordPlaceholder: 'Dein Passwort', newPasswordPlaceholder: 'Mindestens 8 Zeichen',
      submit: { login: 'Anmelden', register: 'Konto erstellen', forgot: 'Link senden', reset: 'Passwort speichern' },
      wait: 'Einen Moment …',
      forgotLink: 'Passwort vergessen?', noAccount: 'Noch kein Konto?', register: 'Registrieren',
      haveAccount: 'Schon registriert?', login: 'Anmelden', back: 'Zurück zur Anmeldung', newLink: 'Neuen Link anfordern',
      logout: 'Abmelden',
    },
    notice: {
      resetSent: 'Falls ein Konto mit dieser Adresse existiert, ist eine E-Mail mit einem Link zum Zurücksetzen unterwegs. Schau auch im Spam-Ordner nach.',
      started: 'Los geht’s! Wähle nach jedem Spiel den Sieger über den Pfeil.',
      saved: 'Ergebnis gespeichert.',
      undone: 'Ergebnis und betroffene Folgerunden zurückgesetzt.',
      deleted: 'Das alte Turnier wurde gelöscht. Bereit für eine neue Runde.',
      cleared: 'Ergebnis gelöscht.',
      leagueStarted: 'Los geht’s! Trage die Ergebnisse im Spielplan ein.',
    },
    errors: {
      offline: 'Keine Verbindung zum Server. Bitte versuche es erneut.',
      failed: 'Die Anfrage ist fehlgeschlagen.',
      loadState: 'Der Turnierstand konnte nicht geladen werden.',
      invalidCode: 'Ungültiger Turniercode. Der Link muss sechs Ziffern enthalten, zum Beispiel /tree/123456.',
      loadTournament: 'Das Turnier konnte nicht geladen werden.',
      loadTournamentRetry: 'Das Turnier konnte nicht geladen werden. Bitte versuche es erneut.',
      refreshFailed: 'Aktualisierung fehlgeschlagen. Angezeigt wird der zuletzt geladene Stand.',
    },
    retry: 'Erneut versuchen',
    manager: 'Turniermanager', viewer: 'Turnieransicht',
    dashTagline: 'DEIN TURNIER. DEIN ÜBERBLICK.', dashText: 'Spieler eintragen. Sieger wählen.',
    newGame: 'Neues Spiel',
    overview: 'Turnierübersicht', participants: 'TEILNEHMER', players: 'Spieler', mode: 'SPIELMODUS', knockout: 'K. o.',
    rounds: n => `${n} Runden`, status: 'STATUS', matchesProgress: (done, total) => `${done} / ${total} Spiele`,
    state: { setup: 'Vorbereitung', done: 'Abgeschlossen', running: 'Turnier läuft' },
    share: 'Turnier teilen', code: 'TURNIERCODE', openPublic: 'Öffentliche Ansicht in neuem Tab öffnen',
    setupTitle: 'Teilnehmer vorbereiten', setupText: 'Wähle Spielmodus und Spieleranzahl und trage die Namen ein.',
    playerCount: 'Spieleranzahl', nPlayers: n => `${n} Spieler`, saving: 'Wird gespeichert …', start: 'Turnier starten',
    decided: 'DAS TURNIER IST ENTSCHIEDEN.', congrats: 'Herzlichen Glückwunsch zum Turniersieg!', championWord: 'CHAMPION',
    bracketTitle: 'Turnierbaum', tagKo: 'K. O. SYSTEM', tagPreview: 'VORSCHAU', tagReadOnly: 'NUR ANSEHEN',
    hintPreview: 'Namen eintragen – die Begegnungen stehen schon bereit.', hintPlay: 'Pfeil anklicken, um den Sieger in die nächste Runde zu schicken.',
    hintPublic: 'Ergebnisse werden automatisch aktualisiert.',
    won: 'Gewonnen', lost: 'Ausgeschieden',
    byes: n => `${n} Freilose · Spieler ohne Gegner kommen automatisch weiter.`, allRounds: 'Von der ersten Runde bis ins Finale.',
    allSaved: 'Alle Ergebnisse gespeichert', loadingTournament: 'Turnier wird geladen …',
    resetTitle: 'Neue Runde, neues Glück?', resetText: 'Das aktuelle Turnier mit allen Spielern und Ergebnissen wird endgültig gelöscht. Danach kannst du ein neues konfigurieren.',
    cancel: 'Abbrechen', deleting: 'Wird gelöscht …', deleteAndNew: 'Löschen & neues Spiel',
    formats: { label: 'Spielmodus', ko: 'K. o.', league: 'Jeder gegen jeden' },
    matchdays: n => `${n} Spieltage`,
    titleLeague: 'Tabelle & Spielplan', tagLeague: 'JEDER GEGEN JEDEN',
    hintLeaguePreview: 'Namen eintragen – der Spielplan entsteht beim Start.',
    hintLeague: 'Ergebnis eintragen und mit Enter oder dem Haken speichern. Die Tabelle rechnet sich automatisch.',
    leagueFooter: (matches, days) => `${matches} Spiele an ${days} Spieltagen`,
    league: {
      table: 'Tabelle', fixtures: 'Spielplan', player: 'SPIELER',
      played: 'SP', playedLong: 'Spiele', won: 'S', wonLong: 'Siege', drawn: 'U', drawnLong: 'Unentschieden', lost: 'N', lostLong: 'Niederlagen',
      score: 'TREFFER', diff: 'DIFF', diffLong: 'Differenz', points: 'PKT',
      rule: 'Sieg 3 Punkte · Unentschieden 1 · Niederlage 0. Bei Punktgleichheit entscheiden die Differenz, dann die erzielten Treffer.',
      matchday: n => `Spieltag ${n}`, resting: name => `${name} spielfrei`, scoreOf: name => `Ergebnis ${name}`,
      save: 'Ergebnis speichern', clear: 'Ergebnis löschen',
    },
    bracket: {
      region: 'Turnierbaum; bei Bedarf horizontal scrollen',
      roundNames: ['Finale', 'Halbfinale', 'Viertelfinale', 'Achtelfinale'],
      matches: n => n === 1 ? '1 Spiel' : `${n} Spiele`,
      match: n => `Spiel ${n}`, matchUpper: n => `SPIEL ${n}`, final: 'DAS FINALE', bye: 'Freilos',
      undo: (round, n) => `Ergebnis ${round}, Spiel ${n} zurücksetzen`, undoTitle: 'Ergebnis und betroffene Folgerunden zurücksetzen',
      preview: 'Vorschau', finished: 'Beendet', ready: 'Spielbereit', pending: 'Ausstehend',
      playerName: n => `Name Spieler ${n}`, player: n => `Spieler ${n}`, previousWinner: 'Sieger der Vorrunde',
      pick: name => `${name} als Sieger wählen`, wins: name => `${name} gewinnt`,
    },
  },
  en: {
    title: 'Ts-Tree · Tournament bracket',
    language: 'Language',
    loading: 'Loading your tournament …',
    tagline: 'YOUR TOURNAMENT. NEATLY ORGANIZED.',
    footnote: 'TOURNAMENTS MADE SIMPLE',
    auth: {
      loginTitle: 'Welcome to Ts-Tree.', loginText: 'Sign in to manage your tournament.',
      registerTitle: 'Create an account.', registerText: 'Sign up for free and set up your own tournament.',
      forgotTitle: 'Forgot your password?', forgotText: 'Enter your email address and we’ll send you a link to choose a new password.',
      resetTitle: 'New password.', resetText: 'Choose a new password for your account. You’ll be signed in right away.',
      email: 'Email address', emailPlaceholder: 'you@example.com',
      password: 'Password', newPassword: 'New password', passwordPlaceholder: 'Your password', newPasswordPlaceholder: 'At least 8 characters',
      submit: { login: 'Sign in', register: 'Create account', forgot: 'Send link', reset: 'Save password' },
      wait: 'One moment …',
      forgotLink: 'Forgot password?', noAccount: 'No account yet?', register: 'Sign up',
      haveAccount: 'Already registered?', login: 'Sign in', back: 'Back to sign in', newLink: 'Request a new link',
      logout: 'Sign out',
    },
    notice: {
      resetSent: 'If an account exists for this address, an email with a reset link is on its way. Check your spam folder too.',
      started: 'Let’s go! After each match, pick the winner with the arrow.',
      saved: 'Result saved.',
      undone: 'Result and affected later rounds reset.',
      deleted: 'The old tournament was deleted. Ready for a new round.',
      cleared: 'Result deleted.',
      leagueStarted: 'Let’s go! Enter the results in the fixtures.',
    },
    errors: {
      offline: 'Can’t reach the server. Please try again.',
      failed: 'The request failed.',
      loadState: 'The tournament could not be loaded.',
      invalidCode: 'Invalid tournament code. The link must contain six digits, for example /tree/123456.',
      loadTournament: 'The tournament could not be loaded.',
      loadTournamentRetry: 'The tournament could not be loaded. Please try again.',
      refreshFailed: 'Update failed. Showing the last loaded state.',
    },
    retry: 'Try again',
    manager: 'Tournament manager', viewer: 'Tournament view',
    dashTagline: 'YOUR TOURNAMENT. AT A GLANCE.', dashText: 'Enter players. Pick winners.',
    newGame: 'New game',
    overview: 'Tournament overview', participants: 'PARTICIPANTS', players: 'players', mode: 'FORMAT', knockout: 'Knockout',
    rounds: n => `${n} rounds`, status: 'STATUS', matchesProgress: (done, total) => `${done} / ${total} matches`,
    state: { setup: 'Setup', done: 'Finished', running: 'In progress' },
    share: 'Share tournament', code: 'TOURNAMENT CODE', openPublic: 'Open public view in a new tab',
    setupTitle: 'Set up participants', setupText: 'Choose the format and number of players, then enter their names.',
    playerCount: 'Number of players', nPlayers: n => `${n} players`, saving: 'Saving …', start: 'Start tournament',
    decided: 'THE TOURNAMENT IS DECIDED.', congrats: 'Congratulations on winning the tournament!', championWord: 'CHAMPION',
    bracketTitle: 'Bracket', tagKo: 'KNOCKOUT', tagPreview: 'PREVIEW', tagReadOnly: 'VIEW ONLY',
    hintPreview: 'Enter names – the matchups are already set.', hintPlay: 'Click the arrow to send the winner to the next round.',
    hintPublic: 'Results update automatically.',
    won: 'Won', lost: 'Eliminated',
    byes: n => `${n} byes · players without an opponent advance automatically.`, allRounds: 'From the first round to the final.',
    allSaved: 'All results saved', loadingTournament: 'Loading tournament …',
    resetTitle: 'New round, new luck?', resetText: 'The current tournament with all players and results will be deleted permanently. Afterwards you can set up a new one.',
    cancel: 'Cancel', deleting: 'Deleting …', deleteAndNew: 'Delete & new game',
    formats: { label: 'Format', ko: 'Knockout', league: 'Round robin' },
    matchdays: n => `${n} matchdays`,
    titleLeague: 'Table & fixtures', tagLeague: 'ROUND ROBIN',
    hintLeaguePreview: 'Enter names – the fixtures are created when you start.',
    hintLeague: 'Enter a result and save it with Enter or the check mark. The table updates automatically.',
    leagueFooter: (matches, days) => `${matches} matches over ${days} matchdays`,
    league: {
      table: 'Table', fixtures: 'Fixtures', player: 'PLAYER',
      played: 'P', playedLong: 'Played', won: 'W', wonLong: 'Won', drawn: 'D', drawnLong: 'Drawn', lost: 'L', lostLong: 'Lost',
      score: 'SCORE', diff: 'DIFF', diffLong: 'Difference', points: 'PTS',
      rule: 'Win 3 points · draw 1 · loss 0. Ties on points are decided by difference, then by points scored.',
      matchday: n => `Matchday ${n}`, resting: name => `${name} sits out`, scoreOf: name => `Score of ${name}`,
      save: 'Save result', clear: 'Delete result',
    },
    bracket: {
      region: 'Tournament bracket; scroll horizontally if needed',
      roundNames: ['Final', 'Semifinal', 'Quarterfinal', 'Round of 16'],
      matches: n => n === 1 ? '1 match' : `${n} matches`,
      match: n => `Match ${n}`, matchUpper: n => `MATCH ${n}`, final: 'THE FINAL', bye: 'Bye',
      undo: (round, n) => `Reset result of ${round}, match ${n}`, undoTitle: 'Reset result and affected later rounds',
      preview: 'Preview', finished: 'Finished', ready: 'Ready', pending: 'Pending',
      playerName: n => `Name of player ${n}`, player: n => `Player ${n}`, previousWinner: 'Winner of previous round',
      pick: name => `Pick ${name} as winner`, wins: name => `${name} wins`,
    },
  },
};

function initial() {
  try {
    const stored = localStorage.getItem(storageKey);
    if (languages.includes(stored)) return stored;
  } catch { /* storage unavailable */ }
  return 'de';
}

export const lang = ref(initial());

function apply() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang.value;
  document.title = messages[lang.value].title;
}
apply();

export function setLang(value) {
  if (!languages.includes(value)) return;
  lang.value = value;
  try { localStorage.setItem(storageKey, value); } catch { /* storage unavailable */ }
  apply();
}

// t('auth.email') or t('rounds', 4): looks up a dotted key; functions are called with the extra arguments.
export function t(key, ...args) {
  const value = key.split('.').reduce((node, part) => node?.[part], messages[lang.value]);
  return typeof value === 'function' ? value(...args) : value ?? key;
}
