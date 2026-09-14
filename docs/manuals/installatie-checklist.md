# Installatie-checklist — Studio op een VPS achter WireGuard

Afvinklijst om de app aan de praat te krijgen en te testen. Alleen wat je typt
en wat je moet zien; het *waarom* staat in
[installatie-vps.md](installatie-vps.md).

De back-up staat met opzet achteraan, in deel 3. Die vraagt twee restic-
bestemmingen en is voor het testen niet nodig — maar **neem de app niet in
gebruik voordat deel 3 klaar is.** Tot dat moment is er geen terugweg als er iets
omvalt, en `upgrade.sh` weigert zonder werkende back-up te draaien.

Doorlooptijd: deel 1 ongeveer 45 minuten, deel 2 een half uur plus buildtijd,
deel 3 een half uur.

---

## Vul dit eerst in

Deze vier waarden gebruikt de rest van de lijst. Plak dit blok in je terminal, en
**opnieuw na elke keer dat je opnieuw inlogt** — shellvariabelen overleven een
nieuwe sessie niet.

```bash
DOMEIN=studio.voorbeeld.nl      # jouw (sub)domein
WG_ADDR=10.8.0.1                # adres van de VPS op de WireGuard-tunnel
DATA=/srv/interieurstudio       # waar de data komt te staan
VPS_IP=203.0.113.10             # publieke IP van de VPS
```

### Hoe kom je aan `WG_ADDR`?

Draait WireGuard al op deze VPS, dan lees je het adres uit. Op de VPS:

```bash
ip -4 -br addr show | grep -E '^wg'
```

**Je ziet** bijvoorbeeld `wg0    UNKNOWN    10.8.0.1/24` — dan is `WG_ADDR` het
deel vóór de slash, dus `10.8.0.1`. Komt er niets terug, probeer dan de
configuratie zelf:

```bash
sudo grep -i '^Address' /etc/wireguard/*.conf
```

Blijft het leeg, dan is WireGuard hier nog niet ingericht. Dan valt er niets te
vinden: **je kiest het adres zelf**, en stap 2 maakt het aan. Houd dan gewoon
`10.8.0.1` aan zoals hierboven — dat is het adres dat stap 2 instelt, en er is
geen reden om ervan af te wijken tenzij `10.8.0.0/24` bij jou al voor iets
anders in gebruik is.

Twee dingen om niet te verwarren:

- Het gaat om het adres van de **VPS** op de tunnel (`Address` onder
  `[Interface]` in `wg0.conf` op de server), niet om dat van je laptop
  (`10.8.0.2`).
- Het is niet het publieke IP van de VPS. Dat is `VPS_IP`, en dat gebruik je
  alleen om in te loggen en als `Endpoint` in de clientconfiguratie.

Geeft `ip` meerdere adressen op `wg0`, neem dan het IPv4-adres: `HTTP_PORT` en
`HTTPS_PORT` ondersteunen geen IPv6.

### De naam moet naar `$WG_ADDR` wijzen — drie manieren

De app accepteert alleen `https://$DOMEIN` als origin, dus een IP-adres invullen
werkt niet. Die naam moet naar je tunneladres wijzen, en dat kan op drie
manieren. De preflight controleert alleen dát de naam op de VPS resolveert, niet
hóe.

**1. Een A-record in publieke DNS.** Het eenvoudigst, als je provider het
toestaat. Veel providers weigeren een A-record naar een privé-adres als
`10.8.0.1` ("geen geldig IPv4-adres"); dan valt deze route af en is dat geen
probleem — ga naar 2 of 3. Zet geen AAAA-record.

**2. `/etc/hosts`, op de VPS en op elke client.** Geen DNS nodig, werkt meteen,
en dit is de snelste route om te kunnen testen:

```bash
echo "$WG_ADDR $DOMEIN" | sudo tee -a /etc/hosts        # op de VPS
```

Op je laptop dezelfde regel (macOS en Linux: `/etc/hosts`; Windows:
`C:\Windows\System32\drivers\etc\hosts` als administrator). Nadeel: op iOS
en Android kan dit niet, dus telefoons en tablets bereiken de app zo niet.

**3. Een eigen DNS op de VPS**, en die aan je WireGuard-clients meegeven. Dit is
de route die óók op telefoons werkt; zie
[Telefoons en tablets](#telefoons-en-tablets-dns-op-de-vps) onderaan. Doe dit
gerust later — begin met 2 en test eerst.

---

# Deel 1 — De host klaarmaken

Als `root`, via `ssh root@$VPS_IP`.

## [ ] 1. Pakketten en basis

```bash
apt update && apt full-upgrade -y
apt install -y ca-certificates curl git restic openssl tmux ufw \
  wireguard qrencode unattended-upgrades systemd-timesyncd

hostnamectl set-hostname studio
timedatectl set-timezone Europe/Amsterdam
timedatectl set-ntp true
timedatectl
```

**Je ziet:** `System clock synchronized: yes` en `NTP service: active`.

```bash
dpkg-reconfigure -plow unattended-upgrades      # kies "Yes"
```

## [ ] 2. WireGuard

Draait WireGuard al? Controleer alleen dit en ga door naar stap 3:

```bash
ip -4 addr show wg0 && systemctl is-enabled wg-quick@wg0
```

Zo niet, dan sleutels en configuratie:

```bash
umask 077
mkdir -p /etc/wireguard/keys
wg genkey | tee /etc/wireguard/keys/server.key | wg pubkey > /etc/wireguard/keys/server.pub
wg genkey | tee /etc/wireguard/keys/laptop.key | wg pubkey > /etc/wireguard/keys/laptop.pub

cat > /etc/wireguard/wg0.conf <<CONF
[Interface]
Address = 10.8.0.1/24
ListenPort = 51820
PrivateKey = $(cat /etc/wireguard/keys/server.key)

[Peer]
# laptop
PublicKey = $(cat /etc/wireguard/keys/laptop.pub)
AllowedIPs = 10.8.0.2/32
CONF
chmod 600 /etc/wireguard/wg0.conf

systemctl enable --now wg-quick@wg0
ip -4 addr show wg0
```

**Je ziet:** `inet 10.8.0.1/24` op `wg0`.

De clientconfiguratie:

```bash
cat > /root/laptop.conf <<CONF
[Interface]
PrivateKey = $(cat /etc/wireguard/keys/laptop.key)
Address = 10.8.0.2/32

[Peer]
PublicKey = $(cat /etc/wireguard/keys/server.pub)
Endpoint = ${VPS_IP}:51820
AllowedIPs = 10.8.0.0/24
PersistentKeepalive = 25
CONF

qrencode -t ansiutf8 < /root/laptop.conf      # voor een telefoon: scannen in de WireGuard-app
```

Haal hem op **vanaf je eigen machine** en ruim hem op de server op:

```bash
scp root@203.0.113.10:/root/laptop.conf ./studio-wg.conf
ssh root@203.0.113.10 'shred -u /root/laptop.conf'
```

Op een laptop importeer je dat bestand; de QR-code is alleen voor telefoons.

- **macOS:** open de WireGuard-app, *File → Import Tunnel(s) from File*, kies
  `studio-wg.conf`. Of sleep het bestand op het venster. Liever plakken? *Add
  empty tunnel* opent een tekstveld waarin je de hele inhoud kunt plakken.
- **Windows:** WireGuard-app, *Add Tunnel → Import tunnel(s) from file*.
- **Linux:** `sudo cp studio-wg.conf /etc/wireguard/` en
  `sudo wg-quick up studio-wg`.

Is de tunnel al door een provider-app of paneel aangemaakt, dan bestaat die
configuratie ergens op de VPS. Clientconfiguraties herken je aan een
`Endpoint`-regel; de serverconfiguratie heeft die niet:

```bash
sudo grep -rl 'Endpoint' /root /home /etc/wireguard /opt --include='*.conf' 2>/dev/null
sudo cat <het gevonden bestand>
```

Controleer in wat je vindt twee regels. `Endpoint` hoort het **publieke** IP van
de VPS te zijn met de luisterpoort erachter. En `AllowedIPs` bepaalt wat er door
de tunnel gaat: `10.8.0.0/24` stuurt alleen verkeer naar de VPN die kant op
(wat deze opzet nodig heeft), terwijl `0.0.0.0/0` **al** je internetverkeer via
de VPS leidt. Dat laatste werkt ook, maar is een andere keuze dan deze
handleiding maakt.

> De clientconfiguratie bevat een privésleutel. Mail hem niet rond, plak hem niet
> in een chat, en verwijder het bestand van de server zodra je het hebt opgehaald.

Zet de tunnel op je laptop op en test:

```bash
ping -c3 10.8.0.1        # op je eigen machine, met de tunnel actief
```

**Je ziet:** drie antwoorden. Lukt dit niet, ga dan niet verder — de rest van de
installatie hangt hieraan.

## [ ] 3. Gebruiker en SSH

```bash
adduser --gecos "" studio
usermod -aG sudo studio
install -d -m 700 -o studio -g studio /home/studio/.ssh
cp /root/.ssh/authorized_keys /home/studio/.ssh/authorized_keys
chown studio:studio /home/studio/.ssh/authorized_keys
chmod 600 /home/studio/.ssh/authorized_keys
```

**Test nu in een tweede terminal** dat dit werkt, vóór de volgende stap:

```bash
ssh studio@203.0.113.10 'id'
```

Werkt het? Dan wachtwoord- en rootlogin uit:

```bash
cat > /etc/ssh/sshd_config.d/99-studio.conf <<'CONF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
CONF
sshd -t && systemctl reload ssh
```

**Je ziet:** geen uitvoer. Een foutmelding van `sshd -t` betekent dat er niets is
herstart en je sessie veilig is.

> SSH helemaal achter de VPN zetten kan ook, maar doe dat later — het is de
> stap waar je je het makkelijkst buitensluit. Zie stap 3 van
> [installatie-vps.md](installatie-vps.md).

## [ ] 4. Firewall

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 51820/udp
ufw allow OpenSSH
ufw --force enable
ufw status verbose
```

**Je ziet:** alleen 51820/udp en 22 open. **Zet hier géén 80 of 443 bij** — die
worden niet publiek gepubliceerd, en ufw zou gepubliceerde containerpoorten
sowieso niet afschermen.

Heeft je provider een cloudfirewall? Laat daar alleen 51820/udp en 22 door.

## [ ] 5. Docker

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list

apt update
apt install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
```

> 404 bij `apt update`? Vervang de codenaam in
> `/etc/apt/sources.list.d/docker.list` door `bookworm` en probeer opnieuw.

Docker moet ná WireGuard starten, anders bindt Caddy na een reboot aan een adres
dat nog niet bestaat:

```bash
install -d -m 755 /etc/systemd/system/docker.service.d
tee /etc/systemd/system/docker.service.d/10-wireguard.conf >/dev/null <<'CONF'
[Unit]
Wants=wg-quick@wg0.service
After=wg-quick@wg0.service
CONF
systemctl daemon-reload

usermod -aG docker studio
```

Deel 1 klaar. Log uit en verder als `studio`:

```bash
exit
ssh studio@203.0.113.10
```

---

# Deel 2 — De app installeren en testen

**Plak eerst het variabelenblok van bovenaan opnieuw in.**

## [ ] 6. DNS controleren

```bash
getent ahosts "$DOMEIN"
```

**Je ziet:** je tunneladres (`10.8.0.1`), niet het publieke adres. Komt er niets
of het verkeerde terug, dan stopt de preflight straks — repareer het hier, met
route 1, 2 of 3 uit het blok bovenaan. De snelste:

```bash
echo "$WG_ADDR $DOMEIN" | sudo tee -a /etc/hosts
getent ahosts "$DOMEIN"
```

Controleer ook dat Docker werkt zonder `sudo`:

```bash
docker info >/dev/null && docker compose version
```

**Je ziet:** een versienummer. Een rechtenfout betekent dat je opnieuw moet
inloggen (de groep `docker` uit stap 5).

## [ ] 7. De code

```bash
sudo mkdir -p /opt/interieurstudio
sudo chown "$USER" /opt/interieurstudio
git clone <repository-url> /opt/interieurstudio
cd /opt/interieurstudio
sudo install -d -o "$USER" -g "$USER" "$DATA"
df -h "$DATA"
```

**Je ziet:** ≥ 100 GiB vrij. Node, pnpm en PostgreSQL hoef je niet te
installeren — die zitten in de containers.

## [ ] 8. Configuratie

```bash
cp .env.example .env
chmod 600 .env

sed -i \
  -e "s|^PUBLIC_BASE_URL=.*|PUBLIC_BASE_URL=https://$DOMEIN|" \
  -e "s|^CADDY_SITE_ADDRESS=.*|CADDY_SITE_ADDRESS=$DOMEIN|" \
  -e "s|^STUDIO_DATA_DIR=.*|STUDIO_DATA_DIR=$DATA|" \
  -e "s|^HTTP_PORT=.*|HTTP_PORT=$WG_ADDR:80|" \
  -e "s|^HTTPS_PORT=.*|HTTPS_PORT=$WG_ADDR:443|" \
  -e "s|^CADDY_TLS=.*|CADDY_TLS=tls internal|" \
  .env

for key in POSTGRES_PASSWORD MIGRATION_DATABASE_PASSWORD \
           RUNTIME_DATABASE_PASSWORD AUTH_DATABASE_PASSWORD AUTH_SECRET; do
  sed -i "s|^${key}=.*|${key}=$(openssl rand -base64 48 | tr -d '+/=' | cut -c1-48)|" .env
done

grep -E '^(PUBLIC_BASE_URL|CADDY_SITE_ADDRESS|STUDIO_DATA_DIR|HTTP_PORT|HTTPS_PORT|CADDY_TLS)=' .env
```

**Je ziet:** zes regels met jouw waarden. `HTTP_PORT` en `HTTPS_PORT` hebben het
tunneladres ervoor — dát houdt de app van het publieke internet af. `CADDY_TLS`
staat op `tls internal`, want een publiek certificaat kan achter een VPN niet
worden uitgegeven.

**Zet `.env` buiten de VPS.** Vanaf je eigen machine, met de tunnel actief:

```bash
scp studio@10.8.0.1:/opt/interieurstudio/.env ./interieurstudio-env-backup
```

Zonder dit bestand is een herinstallatie niet te herhalen.

## [ ] 9. Installeren

```bash
tmux new -s install
cd /opt/interieurstudio
./scripts/install.sh
```

`tmux` is geen luxe: dit bouwt twee images en duurt minuten. Verbinding kwijt?
Opnieuw inloggen en `tmux attach -t install`.

**Je ziet:** de preflight die `Publicatie HTTP_PORT: uitsluitend op 10.8.0.1` en
`Certificaatroute: eigen CA van Caddy` meldt, daarna de builds, en tot slot
`Installatie gereed`.

Loopt het vast, kijk dan in deze volgorde — postgres moet gezond zijn vóór de
migrator, en de migrator klaar vóór de API:

```bash
docker compose --env-file .env -f compose.production.yaml ps
docker compose --env-file .env -f compose.production.yaml logs postgres
docker compose --env-file .env -f compose.production.yaml logs migrator
docker compose --env-file .env -f compose.production.yaml logs api
```

## [ ] 10. Certificaat vertrouwen

```bash
./scripts/export-ca.sh
sudo cp /tmp/studio-root-ca.crt /usr/local/share/ca-certificates/studio-root.crt
sudo update-ca-certificates
```

**Je ziet:** het pad, de uitgever en de geldigheidsdatums, plus
`1 added` bij `update-ca-certificates`.

Naar je eigen machine, vanaf je eigen terminal:

```bash
scp studio@10.8.0.1:/tmp/studio-root-ca.crt ./studio-root-ca.crt

# Debian/Ubuntu
sudo cp studio-root-ca.crt /usr/local/share/ca-certificates/studio-root.crt && sudo update-ca-certificates
# macOS
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain studio-root-ca.crt
# Windows, PowerShell als administrator
certutil -addstore -f Root studio-root-ca.crt
```

Twee uitzonderingen die anders een avond kosten: **Firefox** gebruikt zijn eigen
certificaatopslag (importeer de root daar apart), en op **iOS/Android** moet je
de root na installatie nog expliciet aanzetten bij de
certificaatvertrouwensinstellingen.

## [ ] 11. De eerste eigenaar

```bash
./scripts/setup-owner.sh
```

Naam, e-mailadres, naam van de werkruimte, en een wachtwoord van minstens 12
tekens. **Dit kan maar één keer** — zodra er een gebruiker is, sluit deze ingang.

## [ ] 12. Testen

Vanuit de terminal op de VPS:

```bash
./scripts/doctor.sh
curl -sSI "https://$DOMEIN" | head -1
curl -sS "https://$DOMEIN/api/v1/health"
```

**Je ziet:**
- `doctor.sh`: alle containers `Up`, `Luistert op: 10.8.0.1:443`, en
  `API-healthcheck is geslaagd`. Een `LET OP` over alle interfaces betekent dat
  het adres in `.env` mist.
- `curl -sSI`: `HTTP/2 200`. Dat `curl` antwoordt, is het bewijs dat het
  certificaat vertrouwd wordt.
- `/api/v1/health`: **JSON**. Krijg je HTML, dan gaan API-aanroepen naar de
  webpagina en doet straks geen enkele knop iets.

Vanaf je eigen machine, **met de tunnel uit**:

```bash
curl --connect-timeout 5 -sSI https://203.0.113.10/
```

**Je ziet:** een timeout of `Connection refused`. Krijg je wél antwoord, dan is
de app publiek bereikbaar — controleer `HTTP_PORT`/`HTTPS_PORT` in `.env`.

Dan in de browser, met de tunnel aan, op `https://$DOMEIN`:

- [ ] Inloggen werkt, zonder certificaatwaarschuwing
- [ ] **MFA aanzetten** onder Beveiliging (de HTTPS-routes vragen erom)
- [ ] Een nieuw project met de fictieve woonkamer maken
- [ ] Herladen: het project staat er nog
- [ ] Een **offerte-PDF** downloaden

Die laatste is de zwaarste route van de app — daar start Chromium in de
container. Doe hem meteen, niet later.

---

# Deel 3 — Vóór ingebruikname

Niet optioneel. Tot dit klaar is heb je geen terugweg, en `upgrade.sh` weigert
te draaien.

## [ ] 13. Back-up inrichten

Twee restic-bestemmingen, op twee verschillende plekken, geen van beide op deze
VPS. Objectopslag is de praktische keuze.

```bash
sudo install -d -m 700 /etc/interieurstudio
openssl rand -base64 48 | sudo tee /etc/interieurstudio/restic-password >/dev/null
sudo chmod 600 /etc/interieurstudio/restic-password

sudo tee /etc/interieurstudio/backup.env >/dev/null <<'CONF'
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
CONF
sudo chmod 600 /etc/interieurstudio/backup.env
```

> Backblaze B2 gebruikt in plaats daarvan `B2_ACCOUNT_ID` en `B2_ACCOUNT_KEY`.

```bash
sed -i \
  -e "s|^BACKUP_SYNOLOGY_REPOSITORY=.*|BACKUP_SYNOLOGY_REPOSITORY=s3:https://s3.voorbeeld.nl/studio-backup/primair|" \
  -e "s|^BACKUP_EXTERNAL_REPOSITORY=.*|BACKUP_EXTERNAL_REPOSITORY=b2:studio-backup-extern:pad|" \
  .env

set -a; . /etc/interieurstudio/backup.env; set +a
export RESTIC_PASSWORD_FILE=/etc/interieurstudio/restic-password
restic -r "$(awk -F= '$1=="BACKUP_SYNOLOGY_REPOSITORY"{sub(/^[^=]*=/,"");print}' .env)" init
restic -r "$(awk -F= '$1=="BACKUP_EXTERNAL_REPOSITORY"{sub(/^[^=]*=/,"");print}' .env)" init
unset RESTIC_PASSWORD_FILE AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
```

**Sla `/etc/interieurstudio/restic-password` buiten deze VPS op.** Zonder dat
bestand is elke back-up onleesbaar, en de back-up bevat het met opzet niet.

De back-upgebruiker en de timer:

```bash
sudo useradd --system --home /opt/interieurstudio --shell /usr/sbin/nologin interieurstudio
sudo usermod -aG docker interieurstudio
sudo chown -R interieurstudio /opt/interieurstudio
sudo chown interieurstudio "$DATA"
sudo chown interieurstudio /etc/interieurstudio/restic-password \
                           /etc/interieurstudio/backup.env

sudo cp infra/systemd/interieurstudio-backup.* /etc/systemd/system/
sudo install -d -m 755 /etc/systemd/system/interieurstudio-backup.service.d
sudo tee /etc/systemd/system/interieurstudio-backup.service.d/10-credentials.conf >/dev/null <<'CONF'
[Service]
EnvironmentFile=/etc/interieurstudio/backup.env
CONF
sudo systemctl daemon-reload
sudo systemctl enable --now interieurstudio-backup.timer
```

Die laatste drop-in is niet optioneel bij objectopslag: de meegeleverde unit
heeft geen `EnvironmentFile`, en zonder die regel slaagt je handmatige back-up
wel en faalt de nachtelijke.

## [ ] 14. Back-up draaien en verifiëren

```bash
sudo systemctl start interieurstudio-backup.service
journalctl -u interieurstudio-backup.service -n 50 --no-pager
```

**Je ziet:** `Back-up geslaagd`. De API gaat hierbij even uit — dat is het
onderhoudsvenster dat de dump consistent maakt, en hij komt vanzelf terug.

```bash
set -a; . /etc/interieurstudio/backup.env; set +a
./scripts/verify-backup.sh --from synology --target /srv/hersteltest
./scripts/verify-backup.sh --from external --target /srv/hersteltest-extern
sudo rm -rf /srv/hersteltest /srv/hersteltest-extern
```

**Je ziet:** `Verificatie geslaagd`, twee keer. Een geslaagde upload is nog geen
geslaagde herstelbaarheid — dit is het verschil.

## [ ] 15. Reboot proeven

Met VPN-only is dit de belangrijkste test: de tunnel moet omhoog zijn vóór Caddy
aan zijn adres bindt.

```bash
sudo reboot
# wachten, opnieuw inloggen, variabelenblok opnieuw plakken
systemctl is-active wg-quick@wg0
cd /opt/interieurstudio && ./scripts/doctor.sh
curl -sS "https://$DOMEIN/api/v1/health"
systemctl list-timers interieurstudio-backup.timer
```

**Je ziet:** `active`, alle containers `Up`, `Luistert op: 10.8.0.1:443`, JSON
van de healthcheck, en de timer op de volgende nacht. Draait Caddy niet en meldt
hij iets over een adres dat niet toegewezen kan worden, dan is de ordening uit
stap 5 niet actief.

---

## Bijwerken, later

```bash
cd /opt/interieurstudio
tmux new -s upgrade
set -a; . /etc/interieurstudio/backup.env; set +a
git pull
./scripts/upgrade.sh
./scripts/doctor.sh
```

Eerst de preflight, dan een volledige back-up, dan de nieuwe images en
migrations. Zijn je back-upbestemmingen onbereikbaar, dan stopt de upgrade — met
opzet.

## Telefoons en tablets: DNS op de VPS

`/etc/hosts` bestaat niet op iOS en Android. Wil je de app ook daar openen — en
dat wil je, want presentaties bekijk je op een tablet — geef je clients dan een
DNS mee die de naam kent. Een kleine `dnsmasq` op de VPS volstaat.

```bash
sudo apt install -y dnsmasq
sudo tee /etc/dnsmasq.d/studio.conf >/dev/null <<CONF
listen-address=$WG_ADDR
bind-interfaces
no-resolv
server=9.9.9.9
server=1.1.1.1
address=/$DOMEIN/$WG_ADDR
CONF
sudo systemctl restart dnsmasq
sudo ufw allow in on wg0 to any port 53 proto udp
```

`bind-interfaces` met `listen-address` houdt hem op de tunnel, en `no-resolv`
met expliciete upstreams voorkomt een lus als er een lokale resolver draait.

Voeg daarna in **elke clientconfiguratie** onder `[Interface]` toe:

```
DNS = 10.8.0.1
```

Controleer vanaf een client met de tunnel actief:

```bash
nslookup studio.voorbeeld.nl
```

**Je ziet:** `10.8.0.1`, met de VPS als server.

Twee dingen om te weten. Al je DNS-verkeer loopt dan tijdens een actieve tunnel
via de VPS, die het doorzet naar de upstreams hierboven. En op een
**Linux**-client vereist `DNS =` dat `resolvconf` of `systemd-resolved`
aanwezig is; ontbreekt dat, dan weigert `wg-quick` te starten en gebruik je daar
`/etc/hosts`.

## Als iets niet klopt

| Symptoom | Waar het zit |
|---|---|
| Preflight: adres niet actief op deze host | De tunnel staat niet: `systemctl status wg-quick@wg0` |
| DNS-provider weigert een A-record naar 10.8.0.1 | Normaal; gebruik `/etc/hosts` of DNS op de VPS |
| App werkt op de laptop, niet op de telefoon | `/etc/hosts` bestaat daar niet; zet DNS op de VPS |
| Preflight: poort al in gebruik | Iets anders luistert op 80/443: `sudo ss -ltnp` |
| `doctor.sh` meldt alle interfaces | Het adres mist in `HTTP_PORT`/`HTTPS_PORT` in `.env` |
| Certificaatwaarschuwing in de browser | Stap 10; let op Firefox en iOS/Android |
| `/api/v1/health` geeft HTML | Caddy stuurt API-aanroepen naar de SPA |
| Nachtelijke back-up faalt, handmatige niet | De `EnvironmentFile`-drop-in uit stap 13 |
| Na reboot geen Caddy | De Docker-ordening uit stap 5 |

Uitgebreider: [installatie-vps.md](installatie-vps.md) en
[Als het misgaat](installatie.md#als-het-misgaat).

---

Deze lijst is geschreven vóór de eerste echte installatie. Loop je ergens vast,
werk hem dan bij op dát punt — daar loopt de volgende persoon ook vast.
