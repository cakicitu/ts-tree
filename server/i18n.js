// German is the source language of every server message; this maps each one to English.
// The client sends its UI language in the X-Lang header.
const en = {
  'Bitte gib eine gültige E-Mail-Adresse ein.': 'Please enter a valid email address.',
  'Das Passwort muss mindestens 8 Zeichen lang sein.': 'The password must be at least 8 characters long.',
  'Das Passwort darf höchstens 256 Zeichen lang sein.': 'The password must be at most 256 characters long.',
  'Das Turnier wurde zwischenzeitlich geändert. Der aktuelle Stand wurde geladen.': 'The tournament was changed in the meantime. The current state has been loaded.',
  'Alle sechsstelligen Turniercodes wurden bereits vergeben.': 'All six-digit tournament codes have been used.',
  'JSON erwartet.': 'JSON expected.',
  'Anfrage zu groß.': 'Request too large.',
  'Ungültige Anfrage.': 'Invalid request.',
  'Anfrage von einer fremden Seite abgelehnt.': 'Request from a foreign site rejected.',
  'Diese Ansicht ist nur zum Lesen verfügbar.': 'This view is read-only.',
  'Dieses Turnier ist nicht verfügbar. Prüfe den Code; möglicherweise wurde das Turnier gelöscht.': 'This tournament is not available. Check the code; the tournament may have been deleted.',
  'Zu viele Registrierungen. Bitte in 15 Minuten erneut versuchen.': 'Too many sign-ups. Please try again in 15 minutes.',
  'Für diese E-Mail-Adresse gibt es bereits ein Konto. Melde dich an oder setze dein Passwort zurück.': 'An account with this email address already exists. Sign in or reset your password.',
  'Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.': 'Too many sign-in attempts. Please try again in 15 minutes.',
  'E-Mail-Adresse oder Passwort ist falsch.': 'Email address or password is incorrect.',
  'Zu viele Anfragen. Bitte in 15 Minuten erneut versuchen.': 'Too many requests. Please try again in 15 minutes.',
  'Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.': 'Too many attempts. Please try again in 15 minutes.',
  'Dieser Link ist ungültig oder abgelaufen. Fordere einen neuen an.': 'This link is invalid or has expired. Request a new one.',
  'Bitte melde dich an.': 'Please sign in.',
  'Nicht gefunden.': 'Not found.',
  'Methode nicht erlaubt.': 'Method not allowed.',
  'Ein Serverfehler ist aufgetreten.': 'A server error occurred.',
  'Bitte wähle 4 bis 16 Spieler.': 'Please choose 4 to 16 players.',
  'Jeder Spieler braucht einen Namen mit 1 bis 40 Zeichen.': 'Every player needs a name with 1 to 40 characters.',
  'Dieses Spiel ist noch nicht bereit.': 'This match is not ready yet.',
  'Dieser Spieler gehört nicht zu diesem Spiel.': 'This player is not part of this match.',
  'Bitte wähle 3 bis 16 Spieler.': 'Please choose 3 to 16 players.',
  'Unbekannter Spielmodus.': 'Unknown format.',
  'Dieses Spiel gibt es nicht.': 'This match does not exist.',
  'Ein Ergebnis besteht aus zwei ganzen Zahlen von 0 bis 999.': 'A result consists of two whole numbers from 0 to 999.',
  'Diese Aktion passt nicht zum Spielmodus des Turniers.': 'This action does not match the tournament’s format.',
  'Dieses Turnier gibt es nicht mehr.': 'This tournament no longer exists.',
  'Du kannst höchstens 100 Turniere anlegen. Lösche zuerst alte Turniere.': 'You can have at most 100 tournaments. Delete old ones first.',
  'Der Turniername darf höchstens 60 Zeichen lang sein.': 'The tournament name must be at most 60 characters long.',
};

export const requestLang = req => req.headers['x-lang'] === 'en' ? 'en' : 'de';
export const translate = (lang, text) => lang === 'en' ? en[text] ?? text : text;

export const resetMail = {
  de: {
    subject: app => `${app}: Passwort zurücksetzen`,
    greeting: 'Hallo,',
    intro: app => `jemand hat ein neues Passwort für dein ${app}-Konto angefordert.`,
    textLink: 'Über diesen Link kannst du eines festlegen:',
    button: 'Neues Passwort festlegen',
    validity: 'Der Link funktioniert einmal und ist eine Stunde gültig.',
    ignore: 'Warst du das nicht, ignoriere diese Mail – dein Passwort bleibt unverändert.',
  },
  en: {
    subject: app => `${app}: Reset your password`,
    greeting: 'Hi,',
    intro: app => `someone asked for a new password for your ${app} account.`,
    textLink: 'You can choose one using this link:',
    button: 'Choose a new password',
    validity: 'The link works once and expires in an hour.',
    ignore: 'If that wasn’t you, ignore this email – your password stays as it is.',
  },
};
