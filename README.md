# Ts-Tree

Eine kleine Turnierverwaltung mit Vue 3, Node.js und SQLite. Jeder kann sich mit E-Mail-Adresse und Passwort registrieren und verwaltet dann sein eigenes K.-o.-Turnier mit 4 bis 16 Spielern. Oberfläche und API laufen gemeinsam in einem Docker-Container; die Datenbank liegt in einem persistenten Docker-Volume.

## Mit Docker starten

Voraussetzung: Docker mit Docker Compose.

```bash
cd /opt/projects/padel-turnier
docker compose up -d --build
```

Anschließend **http://localhost:8080** öffnen. Von einem anderen Gerät aus die IP-Adresse des Docker-Hosts statt `localhost` verwenden.

Beim ersten Aufruf mit **Registrieren** ein Konto anlegen.

## Bedienung

1. Registrieren oder anmelden und im Auswahlfeld 4 bis 16 Spieler auswählen. Der Turnierbaum passt sich sofort an.
2. Namen direkt in die Felder der ersten Runde eintragen und **Turnier starten** anklicken.
3. Nach einer Begegnung auf den Pfeil beim Sieger klicken. Er wird automatisch in die nächste Runde übernommen. Grüne Markierungen und Verbindungslinien zeigen Gewinner, rote die ausgeschiedenen Spieler.
4. Im Finale den Sieger auswählen. Der Turniersieger erscheint über dem Baum.
5. Mit **Neues Spiel** und anschließender Bestätigung das bisherige Turnier samt Spielern und Ergebnissen löschen und ein neues konfigurieren.

Bei Spielerzahlen ohne vollständigen Baum (5–7 und 9–15) werden Freilose automatisch verteilt. Die Positionen orientieren sich an einer üblichen Setzliste; die Nummer am Namen ist die Setzposition. Freilose zählen nicht als ausgetragene Spiele.

Ein Ergebnis lässt sich durch Auswahl des anderen Spielers korrigieren oder mit dem Zurücksetzen-Symbol am Spiel entfernen. Dabei werden nur die davon abhängigen Folgerunden zurückgesetzt. Gleiche Namen sind möglich, weil Spieler intern eigene IDs haben. Auf schmalen Bildschirmen kann der Baum horizontal gescrollt werden.

## Konten und Passwort vergessen

Konten bestehen aus E-Mail-Adresse und Passwort (mindestens 8 Zeichen). Jedes Konto hat sein eigenes Turnier.

Über **Passwort vergessen?** wird ein Link zum Zurücksetzen per Mail über [Resend](https://resend.com) verschickt. Der Link ist eine Stunde gültig und funktioniert nur einmal; gespeichert wird nur ein Hash. Die Antwort ist immer gleich, sodass sich nicht herausfinden lässt, welche Adressen registriert sind. Pro Konto geht höchstens eine Mail pro Minute raus. Nach dem Zurücksetzen werden alle bestehenden Sitzungen des Kontos beendet. Ohne `RESEND_API_KEY` wird der Link stattdessen im Server-Log ausgegeben.

## Turnier teilen

Jedes gestartete Turnier bekommt einen zufälligen, sechsstelligen Zahlencode, zum Beispiel `042718`. Der Code und ein anklickbarer Link erscheinen in der Turnierverwaltung. Unter **`/tree/042718`** kann jeder mit dem Link den Baum ohne Anmeldung ansehen. Die öffentliche Ansicht zeigt Namen, Ergebnisse und den Turniersieger, enthält keine Bearbeitungsfunktionen und aktualisiert sich alle fünf Sekunden. Auch bei bestehender Anmeldung bleibt diese Ansicht schreibgeschützt.

Codes werden in SQLite dauerhaft als vergeben gespeichert und innerhalb dieser Datenbank niemals erneut verwendet, auch wenn das zugehörige Turnier gelöscht wurde. Ein gelöschter Turniercode liefert kein Turnier mehr. Neue Turniere bekommen einen neuen Code. Bestehende Turniere ohne Code erhalten beim ersten Start der aktualisierten Anwendung automatisch einen; Spieler und Ergebnisse bleiben erhalten. Das Daten-Volume enthält auch die vergebenen Codes und muss für deren dauerhafte Reservierung erhalten bleiben.

## Einstellungen

Optional vor dem Start:

```bash
cp .env.example .env
```

Werte in `.env` anpassen:

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `PORT` | `8080` | Port auf dem Docker-Host |
| `COOKIE_SECURE` | `false` | Bei Betrieb über HTTPS auf `true` setzen |
| `COOKIE_PATH` | `/` | Pfad des Sitzungs-Cookies, z. B. `/ts-tree` bei Betrieb unter einem Unterpfad |
| `APP_URL` | `http://localhost:3000` | Öffentliche Adresse der App, Grundlage für den Link in der Reset-Mail |
| `RESEND_API_KEY` | – | API-Schlüssel für Resend; ohne ihn wird der Reset-Link nur geloggt |
| `MAIL_FROM` | `noreply@tuerker-cakici.de` | Absender, muss bei Resend verifiziert sein |
| `BIND_ADDR` | `0.0.0.0` | Adresse, an die der Node-Server bindet (nur bei direktem Node-Betrieb) |

Änderungen mit `docker compose up -d` übernehmen. Für eine öffentliche Bereitstellung HTTPS über einen Reverse Proxy verwenden. Dieser muss den ursprünglichen Host-Header weiterreichen.

Sitzungen laufen nach zwölf Stunden ab und verwenden ein HttpOnly-Cookie mit SameSite=Strict. Zehn falsche Anmeldungen pro IP innerhalb von 15 Minuten sperren weitere Versuche vorübergehend; Registrierungen und Reset-Anfragen sind ebenfalls pro IP begrenzt. Passwörter werden mit scrypt und eigenem Salt gespeichert. Hinter einem Reverse Proxy gilt dessen IP. Turnieränderungen werden serverseitig geprüft; veraltete Änderungen aus einem zweiten Browser-Tab werden abgewiesen und der aktuelle Stand geladen.

## Betrieb und Daten

```bash
docker compose logs -f
docker compose down
docker compose up -d
```

Ein normales `down` erhält die Daten. `docker compose down -v` entfernt das Daten-Volume und damit alle gespeicherten Daten.

SQLite speichert Konten, Turniere und Sitzungen unter `/app/data/tournament.sqlite`. Das benannte Volume heißt in der Compose-Datei `tournament-data`. Der Container läuft als Benutzer `node`. Der Healthcheck prüft `/api/health`.

Für eine konsistente Sicherung den Container kurz stoppen und das gesamte Datenverzeichnis kopieren:

```bash
docker compose stop
mkdir -p backup
docker compose cp padel-turnier:/app/data/. ./backup/
docker compose start
```

## Lokale Entwicklung

Node.js ab 22.12, empfohlen Node.js 24, und npm verwenden.

```bash
npm ci
```

In zwei Terminals starten:

```bash
npm run dev:server
```

```bash
npm run dev
```

Die von Vite ausgegebene Adresse öffnen (normalerweise `http://localhost:5173`). API-Anfragen werden an Node.js auf Port 3000 weitergeleitet. Lokal wird die Datenbank unter `data/` angelegt. Die `.env`-Datei wird von Docker Compose gelesen; für direkten Node-Betrieb Einstellungen als Umgebungsvariablen setzen. Mit `DATA_DIR` kann lokal das Datenverzeichnis geändert werden.

Produktionsbuild ohne Docker:

```bash
npm run build
npm start
```

Danach `http://localhost:3000` öffnen.

## Prüfungen

```bash
npm test
npm run build
docker compose config --quiet
```

Die 28 automatisierten Tests prüfen alle Spielerzahlen, Freilose, vollständige Turnierabläufe, Ergebnisänderungen, Registrierung, Login, getrennte Turniere pro Konto, Passwort-Reset per Mail, Zugriffsschutz, Eingabevalidierung, konkurrierende Änderungen, Löschen/Neuanlegen und SQLite-Persistenz über Neustarts. Sie prüfen außerdem den öffentlichen Lesezugriff, gesperrte Schreibzugriffe, dauerhaft reservierte Codes, und die gerenderte Ansicht ohne Bearbeitungsbuttons. API-Tests führen echte Request-Streams durch den HTTP-Handler aus, ohne einen Netzwerkport zu öffnen.

## Bereitstellung

Läuft auf dem VPS unter **https://tuerker-cakici.de/ts-tree/** als systemd-Dienst hinter nginx. Für den Betrieb unter einem Unterpfad wird mit `APP_BASE=/ts-tree/ npm run build` gebaut. Siehe [`deploy/README.md`](deploy/README.md).

## Aufbau

- `src/`: Vue-Oberfläche und SVG-Verbindungen im Turnierbaum.
- `shared/tournament.js`: gemeinsame Turnierlogik für Vorschau und Server.
- `server/index.js`: Node-HTTP-Server, Konten, Passwort-Reset über Resend und SQLite.
- `tests/`: Logik- und API-Tests.
- `Dockerfile` und `compose.yaml`: Build, Betrieb und persistenter Speicher.

Die Vue-Oberfläche wird mit Vite gebaut ([Vue-Dokumentation](https://vuejs.org/guide/quick-start.html)). Das Backend verwendet das integrierte [`node:sqlite`](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html) und benötigt im Produktionscontainer keine zusätzlichen npm-Pakete.
