# Ts-Tree auf dem VPS

Kein Docker auf diesem Host: Der Node-Server läuft als systemd-Dienst auf
`127.0.0.1:8094` und liefert Oberfläche und API aus. nginx leitet
`https://tuerker-cakici.de/ts-tree/` dorthin weiter und entfernt dabei das Präfix.

## Einmalige Einrichtung

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin tstree
sudo install -m 750 -d /etc/ts-tree
sudo tee /etc/ts-tree/env >/dev/null <<'ENV'
PORT=8094
BIND_ADDR=127.0.0.1
ADMIN_USERNAME=admin
ADMIN_PASSWORD=CHANGEME
COOKIE_SECURE=true
COOKIE_PATH=/ts-tree
ENV
sudo chown root:tstree /etc/ts-tree/env && sudo chmod 640 /etc/ts-tree/env

cd /opt/Projects/ts-tree
npm ci && APP_BASE=/ts-tree/ npm run build
sudo cp deploy/ts-tree.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now ts-tree

# nginx: deploy/nginx-ts-tree.conf in den Homepage-Serverblock übernehmen
sudo /opt/homepages/deploy-nginx.sh
```

Die SQLite-Datenbank liegt unter `/var/lib/ts-tree/`.

## Aktualisieren

```bash
cd /opt/Projects/ts-tree
git pull
npm ci && APP_BASE=/ts-tree/ npm run build
sudo systemctl restart ts-tree
```

## Logs

```bash
journalctl -u ts-tree -f
```
