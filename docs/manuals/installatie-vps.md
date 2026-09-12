# Installatie op een VPS achter WireGuard, volledig vanuit de terminal

Van een verse Debian-VPS naar een draaiende Studio die **uitsluitend over je
WireGuard-VPN** bereikbaar is, met een eerste eigenaar en een nachtelijke
versleutelde back-up. Elke stap is een commando over SSH; er is geen console,
geen grafische omgeving en geen editor nodig.

Dit is de VPS-variant van [installatie.md](installatie.md). Die handleiding gaat
uit van een publiek domein met een automatisch Let's Encrypt-certificaat; hier
is niets publiek bereikbaar, en dat verandert vier dingen.

**Lees dit eerst.** Net als de basishandleiding is deze procedure opgeschreven
vanaf de scripts en de configuratie in de repository, en is de stack **nog nooit
op een echte host opgestart**. De twee bestandsaanpassingen uit stap 7 zijn wel
gecontroleerd: de YAML parseert en de Caddyfile houdt zijn structuur.

## Wat VPN-only anders maakt

**1. Geen Let's Encrypt-certificaat.** De gebruikelijke validatie vraagt dat
Let's Encrypt poort 80 of 443 van buiten bereikt, en dat is precies wat je niet
wil. Daarom gebruikt Caddy hier zijn **eigen CA** (`tls internal`) en rol je die
root eenmalig uit naar je eigen apparaten. Eén ding is daarbij nagekeken en
blijkt goed te gaan: de zwaarste route van de app, de offerte-PDF, laadt geen
pagina over HTTPS maar krijgt zijn HTML rechtstreeks aangeleverd
(`page.setContent` in `packages/documents/src/quote-pdf.ts`), en bevat geen
enkele externe verwijzing. Chromium in de container hoeft dat certificaat dus
niet te vertrouwen, en de PDF-export raakt hier niet door in de knoop.

**2. De DNS-naam wijst naar je WireGuard-adres**, niet naar het publieke adres
van de VPS. De preflight eist alleen dát de naam resolveert, niet dat hij
publiek bereikbaar is.

**3. Caddy mag niet op het publieke adres luisteren.** Dat regel je niet met de
firewall maar met de binding zelf — zie stap 4 voor waarom een firewall hier
niet genoeg is.

**4. Twee bestanden in de repository krijgen een lokale aanpassing.** Die komen
bij elke `git pull` terug; stap 7 en [Bijwerken](#bijwerken) houden dat
beheersbaar.

En één ding om nu te weten, niet omdat het technisch is maar omdat het het
product raakt: **een klant kan zonder VPN niets zien.** Wil je later een
presentatie of offerte met iemand buiten je netwerk delen, dan is dat met deze
opzet niet mogelijk — dan komt er een publieke route bij, en die keuze staat aan
het eind onder [Wat deze installatie nog niet heeft](#wat-deze-installatie-nog-niet-heeft).

## Voordat je begint

**Specificaties.** 4 vCPU en 8 GB RAM is de startschatting; één zware export
tegelijk is waar de containergrenzen op gedimensioneerd zijn. Op **6 vCores en
12 GB RAM** zit je daar comfortabel boven: de limieten in
`compose.production.yaml` tellen in bedrijf op tot 4,5 vCPU en ongeveer 2,25 GB
(Caddy 0,5/256m, API 2,0/1g, PostgreSQL 2,0/1g, plus de migrator die alleen
tijdens een migratie draait). Het geheugen daarboven is niet verspild — de
kernel gebruikt het als paginacache voor PostgreSQL, en dat is precies waar een
database het graag heeft. Wil je meer dan één zware export tegelijk aankunnen,
dan is dat een bewuste verhoging van `mem_limit` en `cpus` voor de API in
`compose.production.yaml`, geen automatisch gevolg van een ruimer pakket.

**Schijfruimte.** De preflight weigert te beginnen bij minder dan 100 GiB vrij
op `STUDIO_DATA_DIR`. Let op het verschil tussen GB en GiB — een pakket van
"100 GB" toont na formatteren ongeveer 93 GiB en valt er net onder — maar
**200 GB is 186 GiB en haalt de grens ruim**. Twee dingen om in de gaten te
houden naarmate de installatie volloopt:

- De back-up legt onderweg een volledige kopie van de assets plus de
  databasedump in `STUDIO_DATA_DIR/backups/staging`. Reken dus op je assets,
  nog eens zoveel voor die staging, en de database erbij.
- Zakt de vrije ruimte onder 100 GiB, dan stopt niet alleen `install.sh` maar
  ook `upgrade.sh` — die draait de preflight opnieuw.

**Een domeinnaam.** Ook binnen een VPN heb je een echte DNS-naam nodig:
`PUBLIC_BASE_URL` moet exact `https://` + `CADDY_SITE_ADDRESS` zijn en de app
accepteert geen andere origin. Een IP-adres invullen werkt niet. Gebruik een
(sub)domein dat je bezit, bijvoorbeeld `studio.voorbeeld.nl`, en laat het naar je
WireGuard-adres wijzen. Dat kan gewoon in publieke DNS — een A-record met een
privé-adres is toegestaan en werkt meteen voor al je clients én voor de VPS
zelf.

Twee dingen om te weten bij die keuze: het verraadt je interne adresplan aan wie
je DNS opvraagt, en sommige resolvers filteren privé-adressen uit publieke
antwoorden weg ("DNS rebinding protection", onder andere in dnsmasq en Unbound).
Loop je daar tegenaan, dan zet je de naam in `/etc/hosts` op de VPS en op elke
client.

---

## 1. Eerste login en de host vastzetten

Log in als root op het publieke IP-adres dat je provider geeft:

```bash
ssh root@203.0.113.10
```

Werk bij en installeer wat je nodig hebt:

```bash
apt update && apt full-upgrade -y
apt install -y ca-certificates curl git restic openssl tmux ufw \
  wireguard qrencode unattended-upgrades systemd-timesyncd
```

`tmux` staat er met een reden: de installatie in stap 10 bouwt twee images en
duurt minuten. Valt je SSH-verbinding dan weg, dan gaat de build mee. In tmux
niet.

Hostnaam, tijdzone en klok:

```bash
hostnamectl set-hostname studio
timedatectl set-timezone Europe/Amsterdam
timedatectl set-ntp true
timedatectl        # verwacht: "System clock synchronized: yes"
```

Die laatste regel is precies wat de preflight opvraagt, en een verkeerde klok
laat elk certificaat — ook dat van je eigen CA — buiten zijn geldigheidsvenster
vallen.

Met 12 GB RAM heb je geen swapbestand nodig; de containergrenzen tellen op tot
ruim daaronder.

Zet automatische beveiligingsupdates aan:

```bash
dpkg-reconfigure -plow unattended-upgrades   # kies "Yes"
```

## 2. WireGuard

Draait WireGuard al, sla dit over en controleer alleen twee dingen: welk adres
de server op de tunnel heeft (`ip -4 addr show wg0`) en dat de interface na een
reboot automatisch opkomt (`systemctl is-enabled wg-quick@wg0`). Dat adres heb
je in stap 7 nodig.

Zo niet — sleutels, met een veilige umask:

```bash
umask 077
mkdir -p /etc/wireguard/keys
wg genkey | tee /etc/wireguard/keys/server.key | wg pubkey > /etc/wireguard/keys/server.pub
wg genkey | tee /etc/wireguard/keys/laptop.key | wg pubkey > /etc/wireguard/keys/laptop.pub
```

De serverconfiguratie. Let op wat er **niet** in staat: geen `PostUp` met NAT en
geen IP-forwarding. Je clients moeten alleen de VPS zelf bereiken, niet het
internet via de VPS, en dan is forwarding onnodig — en wat je niet aanzet, kan
niet verkeerd staan.

```bash
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
wg show
ip -4 addr show wg0        # verwacht: 10.8.0.1/24
```

De clientconfiguratie maak je hier en neem je mee. `AllowedIPs` staat bewust op
alleen het VPN-subnet: een split tunnel, zodat de rest van het internetverkeer
van je laptop niet door de VPS gaat.

```bash
cat > /root/laptop.conf <<CONF
[Interface]
PrivateKey = $(cat /etc/wireguard/keys/laptop.key)
Address = 10.8.0.2/32

[Peer]
PublicKey = $(cat /etc/wireguard/keys/server.pub)
Endpoint = 203.0.113.10:51820
AllowedIPs = 10.8.0.0/24
PersistentKeepalive = 25
CONF
```

Voor een telefoon of tablet hoef je geen bestand over te zetten — laat de
terminal een QR-code tekenen en scan hem in de WireGuard-app:

```bash
qrencode -t ansiutf8 < /root/laptop.conf
```

Elke extra client krijgt een eigen sleutelpaar, een eigen `[Peer]`-blok in
`wg0.conf` met een eigen `AllowedIPs`-adres (`10.8.0.3/32`, enzovoort), en daarna
`systemctl reload wg-quick@wg0`. Sleutels delen tussen apparaten maakt
intrekken onmogelijk.

Haal de clientconfiguratie op vanaf **je eigen machine**, en verwijder hem daarna
van de server:

```bash
scp root@203.0.113.10:/root/laptop.conf ./studio-wg.conf   # op je eigen machine
ssh root@203.0.113.10 'shred -u /root/laptop.conf'
```

Zet de tunnel op je laptop op (`wg-quick up ./studio-wg.conf`, of via de
WireGuard-app) en controleer dat je de VPS over de tunnel bereikt:

```bash
ping -c3 10.8.0.1        # op je eigen machine, met de tunnel actief
```

## 3. Een gewone gebruiker en SSH dichtzetten

Je installeert niet als root. Maak een gebruiker en geef hem je sleutel:

```bash
adduser --gecos "" studio
usermod -aG sudo studio
install -d -m 700 -o studio -g studio /home/studio/.ssh
cp /root/.ssh/authorized_keys /home/studio/.ssh/authorized_keys
chown studio:studio /home/studio/.ssh/authorized_keys
chmod 600 /home/studio/.ssh/authorized_keys
```

Heb je nog geen sleutel op de server maar wel op je eigen machine, dan zet je
die er vanaf je eigen terminal neer met `ssh-copy-id studio@203.0.113.10`.

**Controleer nu, in een tweede terminal, dat inloggen als `studio` werkt** —
voordat je wachtwoordlogin uitschakelt. Sluit je je hier buiten, dan heb je de
webconsole van je provider nodig.

```bash
ssh studio@203.0.113.10 'id'
```

Werkt dat, dan zet je wachtwoord- en rootlogin uit met een eigen bestand in
plaats van in `sshd_config` te snijden:

```bash
cat > /etc/ssh/sshd_config.d/99-studio.conf <<'CONF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
CONF
sshd -t && systemctl reload ssh
```

`sshd -t` controleert de configuratie vóór de herstart. Faalt hij, dan herstart
er niets en blijft je huidige sessie leven.

Je kunt SSH ook helemaal achter de VPN zetten. Dat is een echte verbetering —
poort 22 verdwijnt dan van het publieke internet — maar het is ook de stap waar
je je het makkelijkst buitensluit. Doe het pas als de tunnel uit stap 2 betrouwbaar
staat, test het in een tweede terminal, en weet waar de webconsole van je
provider zit:

```bash
echo 'ListenAddress 10.8.0.1' > /etc/ssh/sshd_config.d/98-vpn-only.conf
sshd -t && systemctl reload ssh
ssh studio@10.8.0.1 'id'      # met de tunnel actief, in een tweede terminal
```

Werkt dat niet, dan verwijder je dat bestand en herlaad je `ssh` opnieuw — je
huidige sessie blijft bij een `reload` in leven.

## 4. De firewall, en waarom hij hier niet het werk doet

Alleen WireGuard en SSH van buiten; 80 en 443 blijven publiek dicht:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 51820/udp
sudo ufw allow OpenSSH
sudo ufw --force enable
sudo ufw status verbose
```

Zet hier géén `ufw allow 80/tcp` of `443/tcp` bij. Heeft je provider een
cloudfirewall, laat daar dan alleen 51820/udp door (en 22 zolang SSH nog niet
achter de VPN zit).

**En lees dit voordat je denkt dat je klaar bent.** Docker zet zijn eigen regels
in iptables voor gepubliceerde containerpoorten, en die worden vóór de regels
van ufw beoordeeld. Een container die poort 80 publiceert op `0.0.0.0` is dus
van buiten bereikbaar **ook al weigert ufw poort 80**. Dat is geen bug in ufw
maar de manier waarop Docker zijn poorten doorzet, en het is precies de reden
dat we in stap 7 Caddy aan het WireGuard-adres binden in plaats van op de
firewall te vertrouwen. Dan luistert er op het publieke adres niets, en valt er
ook niets te omzeilen.

## 5. Docker Engine en Compose v2

Via de officiële route van Docker voor Debian:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
```

Krijg je bij `apt update` een 404 op de map van je release, dan heeft Docker die
nog niet gepubliceerd: vervang de codenaam in
`/etc/apt/sources.list.d/docker.list` door `bookworm` en probeer het opnieuw.

Geef je gebruiker toegang tot de daemon:

```bash
sudo usermod -aG docker "$USER"
newgrp docker
docker info >/dev/null && docker compose version
```

Beide moeten slagen **zonder** `sudo` — de preflight eist dat. Lid zijn van de
groep `docker` staat in de praktijk gelijk aan root op deze machine; houd die
groep beperkt tot jou en straks de back-upgebruiker.

Docker moet ná WireGuard starten, anders kan Caddy bij een reboot niet aan een
adres binden dat nog niet bestaat:

```bash
sudo install -d -m 755 /etc/systemd/system/docker.service.d
sudo tee /etc/systemd/system/docker.service.d/10-wireguard.conf >/dev/null <<'CONF'
[Unit]
Wants=wg-quick@wg0.service
After=wg-quick@wg0.service
CONF
sudo systemctl daemon-reload
```

Kan of wil je die ordening niet, dan is `net.ipv4.ip_nonlocal_bind=1` het
alternatief: binden op een adres dat nog niet actief is, wordt dan toegestaan.
De ordening is netter, omdat er dan niets luistert op een tunnel die nog niet
staat. Stap 15 toont of het klopt.

## 6. DNS controleren

Vanaf de VPS zelf:

```bash
getent ahosts studio.voorbeeld.nl
```

Dit moet je **WireGuard**-adres teruggeven (`10.8.0.1`), niet het publieke
adres. Resolveert het niet, dan stopt de preflight. Krijg je het publieke adres,
dan wijst je A-record nog verkeerd of wacht je op de TTL.

Filtert je resolver privé-adressen weg, zet de naam dan lokaal vast:

```bash
echo '10.8.0.1 studio.voorbeeld.nl' | sudo tee -a /etc/hosts
```

Doe dat dan ook op elke client — zonder werkende naam krijgt de browser de app
niet te zien, hoe goed de tunnel ook staat.

## 7. De code en de twee lokale aanpassingen

```bash
sudo mkdir -p /opt/interieurstudio
sudo chown "$USER" /opt/interieurstudio
git clone <repository-url> /opt/interieurstudio
cd /opt/interieurstudio
```

Houd deze map aan: de systemd-unit voor de back-up verwijst ernaar. Node.js,
pnpm en PostgreSQL hoef je **niet** op de host te installeren — alles wordt in
de containers gebouwd en gedraaid.

Zet de aanpassingen op een eigen branch, zodat een `git pull` straks een
zichtbaar conflict geeft in plaats van je wijzigingen stil te overschrijven:

```bash
git checkout -b vps-vpn
```

**Aanpassing 1 — Caddy een eigen CA laten gebruiken.** Zonder dit blijft Caddy
proberen een Let's Encrypt-certificaat te halen, wat achter de VPN niet lukt:

```bash
sed -i 's/^\tencode zstd gzip$/\ttls internal\n\tencode zstd gzip/' infra/docker/Caddyfile
head -3 infra/docker/Caddyfile      # verwacht: tls internal onder de eerste regel
```

**Aanpassing 2 — Caddy alleen op de tunnel laten luisteren.** Vul hier het adres
van je eigen `wg0` in:

```bash
WG_ADDR=10.8.0.1
sed -i \
  -e "s|- \"\${HTTP_PORT:-80}:80\"|- \"$WG_ADDR:\${HTTP_PORT:-80}:80\"|" \
  -e "s|- \"\${HTTPS_PORT:-443}:443\"|- \"$WG_ADDR:\${HTTPS_PORT:-443}:443\"|" \
  compose.production.yaml
grep -A3 '^    ports:' compose.production.yaml
```

Je verwacht `"10.8.0.1:${HTTP_PORT:-80}:80"` en de tegenhanger voor 443.

Dit staat in `compose.production.yaml` en niet in `.env` omdat de preflight eist
dat `HTTP_PORT` en `HTTPS_PORT` **getallen** zijn; een `adres:poort` erin zetten
laat de controle falen. Laat die twee dus op 80 en 443 staan.

Leg de aanpassingen vast:

```bash
git commit -am "lokaal: eigen CA en binding op de WireGuard-interface"
```

## 8. Configuratie

Nu `.env`, zonder editor. Vul eerst je eigen waarden in als variabele:

```bash
DOMEIN=studio.voorbeeld.nl
DATA=/srv/interieurstudio

cp .env.example .env
chmod 600 .env
sed -i \
  -e "s|^PUBLIC_BASE_URL=.*|PUBLIC_BASE_URL=https://$DOMEIN|" \
  -e "s|^CADDY_SITE_ADDRESS=.*|CADDY_SITE_ADDRESS=$DOMEIN|" \
  -e "s|^STUDIO_DATA_DIR=.*|STUDIO_DATA_DIR=$DATA|" \
  .env
```

Dan de vijf geheimen. `install.sh` vraagt ze anders interactief op; hier zet je
ze in één keer neer:

```bash
for key in POSTGRES_PASSWORD MIGRATION_DATABASE_PASSWORD \
           RUNTIME_DATABASE_PASSWORD AUTH_DATABASE_PASSWORD AUTH_SECRET; do
  sed -i "s|^${key}=.*|${key}=$(openssl rand -base64 48 | tr -d '+/=' | cut -c1-48)|" .env
done
grep -c '^AUTH_SECRET=[A-Za-z0-9_-]\{32,\}$' .env   # moet 1 zijn
```

Vijf verschillende geheimen is opzet en geen omslachtigheid: beheer, migratie,
runtime, identity en sessies zijn gescheiden. Laat ze bij een herstart
ongewijzigd — `install.sh` en `upgrade.sh` roteren nooit stilzwijgend een
bestaand geheim.

Maak de datamap aan:

```bash
sudo install -d -o "$USER" -g "$USER" "$DATA"
df -h "$DATA"        # moet ≥ 100 GiB vrij tonen
```

**Zet `.env` nu buiten deze VPS.** Vanaf je eigen machine, met de tunnel actief:

```bash
scp studio@10.8.0.1:/opt/interieurstudio/.env ./interieurstudio-env-backup
```

Bewaar dat bestand veilig, samen met het restic-wachtwoord uit de volgende stap.
De back-up bevat de geheimen met opzet **niet**; zonder het restic-wachtwoord is
elke back-up onleesbaar.

## 9. Restic-bestemmingen

Er zijn er twee nodig, op twee verschillende plekken, en geen van beide op deze
VPS — anders verlies je bij één storing de app én de back-up. Objectopslag
(S3-compatibel, Backblaze B2, een restic REST-server) is hier de praktische
keuze; kies voor de tweede bestemming een andere aanbieder of locatie.

```bash
sudo install -d -m 700 /etc/interieurstudio
openssl rand -base64 48 | sudo tee /etc/interieurstudio/restic-password >/dev/null
sudo chmod 600 /etc/interieurstudio/restic-password
```

Zet de credentials van je opslag in een apart bestand. Dit is geen extra
netheid maar een noodzaak: `scripts/backup-lib.sh` geeft restic alleen de
repository en het wachtwoordbestand mee en erft de rest van de omgeving. Een
S3- of B2-repository werkt dus alleen als die credentials in de omgeving staan —
ook straks in de nachtelijke systemd-run, die geen shell van jou erft.

```bash
sudo tee /etc/interieurstudio/backup.env >/dev/null <<'CONF'
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
CONF
sudo chmod 600 /etc/interieurstudio/backup.env
```

Voor Backblaze B2 heten die twee `B2_ACCOUNT_ID` en `B2_ACCOUNT_KEY`.

Vul de twee repositories in `.env` in en initialiseer ze eenmalig:

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

De variabele heet historisch `BACKUP_SYNOLOGY_REPOSITORY`; er hoeft geen
Synology achter te zitten. `backup.sh` initialiseert niet zelf — een repository
die er niet is, is een vergissing en geen situatie om stilzwijgend op te lossen.

Heb je een back-updoel dat zelf in je VPN hangt (een NAS achter dezelfde
WireGuard), dan kan dat, maar dan heeft de back-upgebruiker uit stap 12 er een
route en credentials voor nodig — en is het geen *tweede plek* meer als het
naast je VPS in dezelfde ruimte staat. Objectopslag met een `EnvironmentFile` is
op een VPS de kortste en de beste weg.

**Sla `/etc/interieurstudio/restic-password` nu ook buiten deze VPS op.** Dit is
het makkelijkst te vergeten bestand van de hele installatie en het enige dat je
back-ups leesbaar maakt.

## 10. Installeren

Start een tmux-sessie, zodat een wegvallende verbinding de build niet meeneemt:

```bash
tmux new -s install
cd /opt/interieurstudio
./scripts/install.sh
```

Raak je de verbinding kwijt: opnieuw inloggen en `tmux attach -t install`.

`install.sh` draait de preflight — besturingssysteem, architectuur, Docker,
schijfruimte, schrijfrechten, vrije poorten, DNS en klok — maakt de datamappen
aan en start de stack. De eerste keer duurt dit een paar minuten: er worden twee
images gebouwd. De migrator draait eenmalig en legt het databaseschema aan; pas
als hij klaar is, start de API.

Controleer meteen dat er alleen op de tunnel geluisterd wordt:

```bash
sudo ss -ltnp | grep -E ':(80|443)\b'
```

Je verwacht `10.8.0.1:80` en `10.8.0.1:443`, en **niet** `0.0.0.0:*`. Staat er
`0.0.0.0`, dan is aanpassing 2 uit stap 7 niet meegekomen en is de app publiek
bereikbaar.

Blijft het hangen op `--wait`, dan wordt een container niet gezond. Kijk in deze
volgorde — postgres moet gezond zijn voordat de migrator draait, en de migrator
moet klaar zijn voordat de API start:

```bash
docker compose --env-file .env -f compose.production.yaml ps
docker compose --env-file .env -f compose.production.yaml logs postgres
docker compose --env-file .env -f compose.production.yaml logs migrator
docker compose --env-file .env -f compose.production.yaml logs api
```

## 11. De eigen CA uitrollen

Caddy heeft bij de eerste start een eigen CA aangemaakt. Haal de root eruit:

```bash
docker compose --env-file .env -f compose.production.yaml exec caddy \
  cat /data/caddy/pki/authorities/local/root.crt > /tmp/studio-root-ca.crt
openssl x509 -in /tmp/studio-root-ca.crt -noout -subject -dates
```

Vindt hij dat pad niet, dan zoek je hem op de host — hij staat onder de
gegevensmap van Caddy:

```bash
sudo find "$DATA/caddy" -name root.crt
```

Vertrouw hem op de VPS zelf (handig voor de controles in stap 12):

```bash
sudo cp /tmp/studio-root-ca.crt /usr/local/share/ca-certificates/studio-root.crt
sudo update-ca-certificates
```

En haal hem naar je eigen machines. Vanaf je eigen terminal:

```bash
scp studio@10.8.0.1:/tmp/studio-root-ca.crt ./studio-root-ca.crt
```

Per besturingssysteem, allemaal vanuit de terminal:

```bash
# Debian/Ubuntu
sudo cp studio-root-ca.crt /usr/local/share/ca-certificates/studio-root.crt && sudo update-ca-certificates

# macOS
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain studio-root-ca.crt

# Windows, in een PowerShell als administrator
certutil -addstore -f Root studio-root-ca.crt
```

Op iOS en Android installeer je het bestand als profiel en zet je het daarna
**expliciet aan** onder de certificaatvertrouwensinstellingen; de installatie
alleen is niet genoeg. Firefox gebruikt zijn eigen certificaatopslag en negeert
die van het systeem: importeer de root daar apart, of zet
`security.enterprise_roots.enabled` aan.

Twee dingen die anders voor verwarring zorgen: de bladcertificaten van Caddy's
eigen CA leven maar een halve dag en de tussenliggende een week — dat is met
opzet en Caddy vernieuwt ze zelf, zolang hij draait. En de root zelf zit in de
back-up van je gegevensmap; zet je de installatie ooit ergens anders neer zonder
die data, dan krijg je een nieuwe CA en moet je opnieuw uitrollen.

## 12. Eerste eigenaar en controle

```bash
cd /opt/interieurstudio
./scripts/setup-owner.sh
```

Vraagt om naam, e-mailadres, naam van de werkruimte en een wachtwoord van
minstens 12 tekens. Dit kan maar één keer: zodra er een gebruiker bestaat, is
deze ingang gesloten. Het draait bewust in een wegwerpcontainer met de
migratierol — de app zelf mag geen organisaties aanmaken.

Dan de controle, ook vanuit de terminal:

```bash
./scripts/doctor.sh
curl -sSI "https://$DOMEIN" | head -1
curl -sS "https://$DOMEIN/api/v1/health"
```

Die laatste twee zijn samen de test die de meeste eerste installaties afvangt.
De `curl -I` bewijst dat het certificaat wordt vertrouwd — `curl` faalt zelf op
een certificaat dat hij niet kan verifiëren, dus een antwoord is het bewijs.
Werkte stap 11 niet, dan kun je hem eenmalig met het bestand meegeven:
`curl --cacert /tmp/studio-root-ca.crt ...`. En `/api/v1/health` moet **JSON**
teruggeven; krijg je HTML, dan stuurt Caddy je API-aanroepen naar de SPA en doet
de app straks geen knop.

Controleer daarna, vanaf je eigen machine, dat het aan de buitenkant dicht zit:

```bash
curl --connect-timeout 5 -sSI https://203.0.113.10/     # verwacht: timeout of refused
```

Een antwoord hier betekent dat de app publiek bereikbaar is. Loop dan stap 7
(binding) en stap 4 (firewall) opnieuw na.

De rest van de smoketest heeft wél een browser nodig, met de tunnel actief:
inloggen, meteen **MFA** aanzetten onder Beveiliging, een project maken dat na
herladen blijft staan, en een **offerte-PDF downloaden**. Doe die laatste
meteen — dat is de zwaarste route, want daar start Chromium in de container.

## 13. De nachtelijke back-up

De meegeleverde unit draait als gebruiker `interieurstudio` vanuit
`/opt/interieurstudio`:

```bash
sudo useradd --system --home /opt/interieurstudio --shell /usr/sbin/nologin interieurstudio
sudo usermod -aG docker interieurstudio
sudo chown -R interieurstudio /opt/interieurstudio
sudo chown interieurstudio "$DATA"
sudo chown interieurstudio /etc/interieurstudio/restic-password \
                           /etc/interieurstudio/backup.env
```

Drie dingen heeft die gebruiker nodig en mist hij standaard: toegang tot Docker,
leesrecht op het restic-wachtwoord, en schrijfrecht in `STUDIO_DATA_DIR` voor de
staging. Ontbreekt er één, dan faalt de timer stil in de nacht.

Installeer de unit en hang de credentials eraan:

```bash
sudo cp infra/systemd/interieurstudio-backup.* /etc/systemd/system/
sudo install -d -m 755 /etc/systemd/system/interieurstudio-backup.service.d
sudo tee /etc/systemd/system/interieurstudio-backup.service.d/10-credentials.conf >/dev/null <<'CONF'
[Service]
EnvironmentFile=/etc/interieurstudio/backup.env
CONF
sudo systemctl daemon-reload
sudo systemctl enable --now interieurstudio-backup.timer
systemctl list-timers interieurstudio-backup.timer
```

Die drop-in is niet optioneel bij objectopslag. De unit in de repository heeft
geen `EnvironmentFile`, en zonder die regel heeft de nachtelijke run geen
credentials voor je bucket — je handmatige back-up slaagt dan wel, en de
nachtelijke faalt.

Draai de eerste back-up precies zoals systemd hem straks draait:

```bash
sudo systemctl start interieurstudio-backup.service
journalctl -u interieurstudio-backup.service -n 50 --no-pager
```

Let op: **de API gaat tijdens de back-up even uit.** Dat is het
onderhoudsvenster dat de dump consistent maakt. Hij gaat daarna vanzelf weer
aan, ook als de back-up mislukt.

## 14. De back-up verifiëren

Een geslaagde upload is nog geen geslaagde herstelbaarheid:

```bash
set -a; . /etc/interieurstudio/backup.env; set +a
./scripts/verify-backup.sh --from synology --target /srv/hersteltest
./scripts/verify-backup.sh --from external --target /srv/hersteltest-extern
```

Dit haalt de nieuwste back-up naar een lege map, controleert de assethashes,
start een geïsoleerde PostgreSQL **zonder netwerk**, zet de dump terug en eist
dat de kerntabellen erin staan. Het hersteldoel krijgt een volledige kopie, dus
ruim de testmappen daarna op. Herhaal dit periodiek.

`restore.sh` weigert naar de productiedatamap te herstellen en weigert een doel
dat niet leeg is. Een echte terugzetactie is met opzet geen one-liner; zie
[backup-herstel.md](../notes/backup-herstel.md).

## 15. Een reboot proeven

Vijf minuten, en met VPN-only is dit de belangrijkste test van de hele
installatie: de tunnel moet omhoog zijn voordat Caddy aan zijn adres bindt.

```bash
sudo reboot
# even wachten, dan opnieuw inloggen
ssh studio@203.0.113.10        # of 10.8.0.1, met de tunnel actief
systemctl is-active wg-quick@wg0
sudo ss -ltnp | grep -E ':(80|443)\b'     # verwacht: 10.8.0.1, niet 0.0.0.0
cd /opt/interieurstudio && ./scripts/doctor.sh
curl -sS "https://$DOMEIN/api/v1/health"
systemctl list-timers interieurstudio-backup.timer
```

Alle services draaien (de containers hebben `restart: unless-stopped`), de
tunnel staat, Caddy luistert op de tunnel en de timer staat op de volgende
nacht. Draait Caddy niet en meldt hij in de logs iets over een adres dat niet
toegewezen kan worden, dan is de ordening uit stap 5 niet actief.

## Bijwerken

```bash
cd /opt/interieurstudio
tmux new -s upgrade
set -a; . /etc/interieurstudio/backup.env; set +a

git fetch origin
git rebase origin/main          # jouw twee aanpassingen komen hier bovenop
docker compose --env-file .env -f compose.production.yaml stop caddy
./scripts/upgrade.sh
```

Twee dingen wijken hier af van de basishandleiding.

**De rebase.** Je twee lokale aanpassingen staan als commit op de branch
`vps-vpn`; `git rebase origin/main` zet ze op de nieuwe versie. Raakt een
update dezelfde regels, dan krijg je een zichtbaar conflict in plaats van een
stille overschrijving — los het op, en controleer met `grep -A3 '^    ports:'
compose.production.yaml` en `head -3 infra/docker/Caddyfile` dat beide
aanpassingen er nog in staan voordat je verder gaat.

**Het stoppen van Caddy.** `upgrade.sh` draait de preflight, en die controleert
of poort 80 en 443 vrij zijn met een filter dat alleen naar het poortnummer
kijkt — niet naar het adres waarop iets luistert. Bij de standaardinstellingen
van Docker luistert er een `docker-proxy` op die poorten zolang de stack draait,
en dan meldt de preflight ze als bezet en stopt de upgrade. Caddy eerst stoppen
haalt die listener weg; `upgrade.sh` start hem daarna zelf weer met
`up --build --wait`. Dit geldt net zo goed voor een publieke installatie en is
hier beredeneerd uit `scripts/preflight.sh` en `scripts/upgrade.sh`, niet gemeten
— faalt de preflight toch nog op de poorten, dan weet je waar het zit.

`upgrade.sh` draait eerst de preflight, dan een volledige back-up, en pas daarna
de nieuwe images en migrations. Zijn je restic-bestemmingen niet bereikbaar, dan
stopt de upgrade — met opzet: geen schemawijziging zonder terugweg. Dat is ook
waarom de credentials hier in je omgeving moeten staan.

---

## Valkuilen

**De browser vertrouwt het certificaat niet.** Stap 11, en let op de twee
uitzonderingen: Firefox gebruikt zijn eigen opslag, en op iOS/Android moet je de
root na installatie apart aanzetten.

**`getent ahosts` geeft het publieke adres.** Je A-record wijst nog naar de VPS
in plaats van naar `10.8.0.1`, of je wacht op de TTL. De app laadt dan buiten de
tunnel niet en binnen de tunnel niet over de juiste route.

**De app is van buiten bereikbaar.** `sudo ss -ltnp | grep -E ':(80|443)\b'`
moet je WireGuard-adres tonen. Staat er `0.0.0.0`, dan is aanpassing 2 uit stap 7
weggevallen — bijvoorbeeld door een `git pull` die de rebase niet meenam. Ufw
helpt hier niet tegen; zie stap 4.

**Na een reboot draait Caddy niet.** De tunnel kwam later dan Docker. Controleer
`systemctl is-active wg-quick@wg0` en de drop-in uit stap 5.

**`upgrade.sh` stopt op "HTTP-poort 80 is al in gebruik".** Zie
[Bijwerken](#bijwerken): stop Caddy vóór de upgrade.

**De nachtelijke back-up faalt terwijl de handmatige slaagde.** Dan mist de
systemd-run iets wat jouw shell wel had: meestal de credentials
(`EnvironmentFile`-drop-in uit stap 13), soms leesrecht op het restic-wachtwoord
of schrijfrecht in `STUDIO_DATA_DIR`. `journalctl -u
interieurstudio-backup.service` zegt welke.

**Je hebt jezelf buitengesloten.** Wachtwoordlogin uitzetten of SSH achter de
VPN zetten zonder eerst te testen is de klassieker. Gebruik de webconsole of het
rescue-systeem van je provider en verwijder het betreffende bestand uit
`/etc/ssh/sshd_config.d/`.

**Een snapshot van je provider is geen back-up van de database.** Een
momentopname van een draaiende PostgreSQL is niet consistent. Gebruik hem voor
de host, en `backup.sh` voor de data.

Voor alles wat niet VPS- of VPN-specifiek is — rechten van de containers, de
routering van Caddy, Chromium-fouten bij een PDF, niet meer kunnen inloggen —
zie [Als het misgaat](installatie.md#als-het-misgaat) en
[accountherstel.md](accountherstel.md).

## Wat deze installatie nog niet heeft

**Geen toegang zonder VPN.** Dat is de bedoeling, maar het heeft een gevolg dat
je pas merkt als je het nodig hebt: een klant kan geen presentatie of offerte
bekijken, ook niet met een link. Wil je dat later, dan zijn er twee routes, en
geen van beide staat in deze handleiding: een publieke ingang naast de VPN (dan
heb je een publiek domein met een echt certificaat nodig, en een besluit over
wie wat mag zien), of het gedeelde stuk buiten de app om delen — een PDF
exporteren en die verzenden.

Geen monitoring en geen waarschuwing als een back-up stilvalt — `doctor.sh` en
`journalctl` tonen de status, maar je moet er zelf naar kijken. Geen
projectexport of -import, geen storagemigratie, en geen repetitie van een
verhuizing naar een tweede host. Exports draaien in het API-proces, en daarom
gaat de API tijdens een back-up even uit.

Deze handleiding is geschreven vóór de eerste echte installatie. Kom je iets
tegen wat hier niet klopt, werk hem dan bij op het punt waar je vastliep — dat is
precies waar de volgende persoon ook vastloopt.
