# Ts-Tree on the VPS

No Docker on this host: the Node server runs as a systemd service on
`127.0.0.1:8094` and serves both UI and API. nginx proxies
`https://tuerker-cakici.de/ts-tree/` to it and strips the prefix.

## One-time setup

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin tstree
sudo install -m 750 -d /etc/ts-tree
sudo tee /etc/ts-tree/env >/dev/null <<'ENV'
PORT=8094
BIND_ADDR=127.0.0.1
APP_URL=https://tuerker-cakici.de/ts-tree
MAIL_FROM=noreply@tuerker-cakici.de
RESEND_API_KEY=re_...
COOKIE_SECURE=true
COOKIE_PATH=/ts-tree
ENV
sudo chown root:tstree /etc/ts-tree/env && sudo chmod 640 /etc/ts-tree/env

cd /opt/Projects/ts-tree
npm ci && APP_BASE=/ts-tree/ npm run build
sudo cp deploy/ts-tree.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now ts-tree

# nginx: merge deploy/nginx-ts-tree.conf into the homepage server block
sudo /opt/homepages/deploy-nginx.sh
```

The SQLite database lives in `/var/lib/ts-tree/`.

## Updating

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
