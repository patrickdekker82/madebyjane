# Installatie op een VPS, volledig vanuit de terminal

Van een verse Debian-VPS naar een draaiende Studio achter HTTPS, met een eerste
eigenaar en een nachtelijke versleutelde back-up. Elke stap is een commando over
SSH; er is geen console, geen grafische omgeving en geen editor nodig.

Dit is de VPS-variant van [installatie.md](installatie.md). Waar die handleiding
uitgaat van een host die er al staat, begint deze bij `ssh root@…` en dekt ook
wat een publieke machine extra nodig heeft: SSH-hardening, een firewall, en een
back-up die vanuit systemd bij zijn opslagcredentials kan.

**Lees dit eerst.** Net als de basishandleiding is deze procedure opgeschreven
vanaf de scripts en de configuratie in de repository, en is de stack **nog nooit
op een echte host opgestart**. Reken op één of twee ruwe randen bij de eerste
poging; [Als het misgaat](installatie.md#als-het-misgaat) staat in de
basishandleiding.

## Voordat je begint

Drie dingen bepalen of dit soepel gaat, en twee ervan kosten geld als je ze
verkeerd kiest.

**Schijfruimte is het echte knelpunt.** De preflight weigert te beginnen bij
minder dan 100 GiB vrij op `STUDIO_DATA_DIR`, en de meeste VPS-pakketten in de
8 GB-RAM-klasse leveren 80 tot 160 GB. Let op het verschil tussen GB en GiB: een
volume van "100 GB" toont na formatteren ongeveer 93 GiB en is dus **niet
genoeg**. Drie werkbare uitkomsten:

- Een pakket met ruim ≥ 120 GB lokale SSD/NVMe. Het eenvoudigst.
- Een apart blockstorage-volume van ≥ 120 GB, gemount op `STUDIO_DATA_DIR`. De
  preflight meet `df` op precies die map, dus dit voldoet. Blockstorage is
  blokniveau en daarmee geschikt voor PostgreSQL — een SMB- of NFS-share is dat
  niet, en die moet je dus niet gebruiken.
- Een kleinere installatie, met een bewuste aanpassing van `MIN_DISK_KIB` in
  `scripts/preflight.sh`. Die grens staat er niet voor niets: de assets groeien
  met elk project, en de back-up legt onderweg een volledige kopie van de assets
  plus de databasedump in `STUDIO_DATA_DIR/backups/staging`. Reken op ruimte voor
  je assets, nog eens zoveel voor die staging, en de database erbij.

**Specificaties.** 4 vCPU, 8 GB RAM (16 GB als er meerdere exports tegelijk
lopen). Eén zware export tegelijk is waar de containergrenzen op gedimensioneerd
zijn. Dit is een startschatting en geen meting.

**Een domeinnaam.** Caddy vraagt zelf een Let's Encrypt-certificaat aan. Op een
VPS is dat de makkelijke route: het adres is publiek, dus je hebt alleen een
A-record nodig en geen portforwarding. Zet dat record **nu** al, dan is de TTL
verlopen tegen de tijd dat je bij stap 5 bent.

Zet vooralsnog **alleen een A-record** (IPv4). Heb je ook een AAAA-record, dan
moet IPv6 werkelijk tot in de container reiken; zo niet, dan lopen zowel de
certificaataanvraag als bezoekers met IPv6 vast op een adres dat niet antwoordt.
Voeg AAAA later toe, als je het hebt gecontroleerd.

---

## 1. Eerste login en de host vastzetten

Log in als root op het IP-adres dat je provider geeft:

```bash
ssh root@203.0.113.10
```

Werk bij en installeer wat je nodig hebt:

```bash
apt update && apt full-upgrade -y
apt install -y ca-certificates curl git restic openssl tmux ufw \
  unattended-upgrades systemd-timesyncd
```

`tmux` staat er met een reden: de installatie in stap 6 bouwt twee images en
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
laat certificaataanvragen mislukken.

Heeft je pakket 8 GB RAM of minder, geef Chromium dan wat lucht met een
swapbestand:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### Een blockstorage-volume mounten (alleen als je die route kiest)

Controleer eerst hoe het volume heet — `lsblk` toont het naast je systeemschijf,
meestal als `/dev/sdb` of `/dev/disk/by-id/scsi-0DO_Volume_…`. Formatteren wist
het volume, dus lees de naam goed:

```bash
lsblk -o NAME,SIZE,FSTYPE,MOUNTPOINT
mkfs.ext4 -L studio-data /dev/sdb        # alleen op een leeg, nieuw volume
mkdir -p /srv/interieurstudio
echo 'LABEL=studio-data /srv/interieurstudio ext4 defaults,nofail 0 2' >> /etc/fstab
systemctl daemon-reload && mount -a
df -h /srv/interieurstudio               # moet ≥ 100 GiB vrij tonen
```

Mounten op label in plaats van op `/dev/sdb` is bewust: apparaatnamen kunnen na
een reboot verschuiven, een label niet.

## 2. Een gewone gebruiker en SSH dichtzetten

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
die er vanaf **je eigen terminal** neer:

```bash
ssh-copy-id studio@203.0.113.10
```

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

Firewall — SSH, HTTP en HTTPS, en de rest dicht:

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status verbose
```

**Weet wat `ufw` hier wel en niet doet.** Docker zet zijn eigen regels in
iptables voor gepubliceerde containerpoorten, en die worden vóór de regels van
ufw beoordeeld. Poorten die een container publiceert zijn dus bereikbaar, ook
als ufw ze zou weigeren. In deze stack is dat precies wat je wil — alleen Caddy
publiceert 80 en 443, de API en PostgreSQL publiceren niets — maar ga niet
uitrekenen dat ufw een gepubliceerde poort voor je afschermt. Wil je echt iets
blokkeren, gebruik dan ook de firewall van je provider.

Heeft je provider een cloudfirewall, zet daar dan 22, 80 en 443 open. Twee
firewalls die elkaar tegenspreken is een van de saaiste manieren om een
certificaataanvraag te zien mislukken.

Zet automatische beveiligingsupdates aan:

```bash
dpkg-reconfigure -plow unattended-upgrades   # kies "Yes"
```

Log hierna opnieuw in als `studio` en werk verder met `sudo`:

```bash
exit
ssh studio@203.0.113.10
```

## 3. Docker Engine en Compose v2

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

Beide moeten slagen **zonder** `sudo` — de preflight eist dat. Wees je ervan
bewust dat lid zijn van de groep `docker` in de praktijk gelijkstaat aan root op
deze machine; houd die groep leeg op één beheerder en straks de
back-upgebruiker.

## 4. DNS controleren

Voordat je verder gaat, vanaf de VPS zelf:

```bash
getent ahosts studio.voorbeeld.nl
curl -s ifconfig.me; echo
```

Het adres uit de eerste regel moet het adres uit de tweede zijn. Resolveert het
niet, dan stopt de preflight — en terecht, want dan mislukt ook de
certificaataanvraag. Wijst het naar een ander adres, dan wacht je op de TTL van
je oude record.

## 5. De code en de configuratie

```bash
sudo mkdir -p /opt/interieurstudio
sudo chown "$USER" /opt/interieurstudio
git clone <repository-url> /opt/interieurstudio
cd /opt/interieurstudio
```

Houd deze map aan: de systemd-unit voor de back-up verwijst ernaar. Node.js,
pnpm en PostgreSQL hoef je **niet** op de host te installeren — alles wordt in
de containers gebouwd en gedraaid.

Nu `.env`, zonder editor. Vul eerst je eigen twee waarden in als variabele:

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

`PUBLIC_BASE_URL` moet letterlijk `https://` + `CADDY_SITE_ADDRESS` zijn; de
preflight controleert dat, en de app accepteert geen andere origin.

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

Maak de datamap aan op de lokale schijf:

```bash
sudo install -d -o "$USER" -g "$USER" "$DATA"
df -h "$DATA"        # moet ≥ 100 GiB vrij tonen
```

**Zet `.env` nu buiten deze VPS.** Vanaf je eigen machine:

```bash
scp studio@203.0.113.10:/opt/interieurstudio/.env ./interieurstudio-env-backup
```

Bewaar dat bestand ergens veilig, samen met het restic-wachtwoord uit de
volgende stap. De back-up bevat de geheimen met opzet **niet**; zonder het
restic-wachtwoord is elke back-up onleesbaar.

## 6. Restic-bestemmingen

Er zijn er twee nodig, op twee verschillende plekken, en geen van beide op deze
VPS — anders verlies je bij één storing de app én de back-up. Op een VPS is
objectopslag de praktische keuze (S3-compatibel, Backblaze B2, een restic
REST-server); kies voor de tweede bestemming een andere aanbieder of locatie.

Maak het wachtwoordbestand:

```bash
sudo install -d -m 700 /etc/interieurstudio
openssl rand -base64 48 | sudo tee /etc/interieurstudio/restic-password >/dev/null
sudo chmod 600 /etc/interieurstudio/restic-password
```

Zet de credentials van je opslag in een apart bestand. Dit is geen extra
netheid maar een noodzaak: `scripts/backup-lib.sh` geeft restic alleen de
repository en het wachtwoordbestand mee en erft de rest van de omgeving. Een
S3- of B2-repository werkt dus alleen als die credentials in de omgeving staan
— ook straks in de nachtelijke systemd-run, die geen shell van jou erft.

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

Wil je in plaats van objectopslag een SFTP-doel (`sftp:gebruiker@host:/pad`),
dan heeft niet jouw gebruiker maar de back-upgebruiker uit stap 9 de SSH-sleutel
en de `known_hosts` nodig. Objectopslag met een `EnvironmentFile` is op een VPS
de kortste weg.

**Sla `/etc/interieurstudio/restic-password` nu ook buiten deze VPS op.** Dit is
het makkelijkst te vergeten bestand van de hele installatie en het enige dat je
back-ups leesbaar maakt.

## 7. Installeren

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

Blijft het hangen op `--wait`, dan wordt een container niet gezond. Kijk in deze
volgorde — postgres moet gezond zijn voordat de migrator draait, en de migrator
moet klaar zijn voordat de API start:

```bash
docker compose --env-file .env -f compose.production.yaml ps
docker compose --env-file .env -f compose.production.yaml logs postgres
docker compose --env-file .env -f compose.production.yaml logs migrator
docker compose --env-file .env -f compose.production.yaml logs api
```

## 8. Eerste eigenaar en controle

```bash
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
De `curl -I` bewijst dat het certificaat geldig is — `curl` faalt zelf op een
ongeldig certificaat, dus een antwoord is al het bewijs. En `/api/v1/health`
moet **JSON** teruggeven. Krijg je HTML, dan stuurt Caddy je API-aanroepen naar
de SPA en doet de app straks geen knop.

De rest van de smoketest heeft wél een browser nodig: inloggen, meteen **MFA**
aanzetten onder Beveiliging, een project maken dat na herladen blijft staan, en
een **offerte-PDF downloaden**. Doe die laatste meteen — dat is de zwaarste
route, want daar start Chromium in de container.

## 9. De nachtelijke back-up

De meegeleverde unit draait als gebruiker `interieurstudio` vanuit
`/opt/interieurstudio`. Maak die aan en geef hem wat hij nodig heeft:

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
credentials voor je bucket — je handmatige back-up van hieronder slaagt dan wel,
en de nachtelijke faalt.

Draai de eerste back-up met de hand, als de back-upgebruiker, precies zoals
systemd hem straks draait:

```bash
sudo systemctl start interieurstudio-backup.service
journalctl -u interieurstudio-backup.service -n 50 --no-pager
```

Let op: **de API gaat tijdens de back-up even uit.** Dat is het
onderhoudsvenster dat de dump consistent maakt. Hij gaat daarna vanzelf weer
aan, ook als de back-up mislukt.

## 10. De back-up verifiëren

Een geslaagde upload is nog geen geslaagde herstelbaarheid:

```bash
set -a; . /etc/interieurstudio/backup.env; set +a
./scripts/verify-backup.sh --from synology --target /srv/hersteltest
./scripts/verify-backup.sh --from external --target /srv/hersteltest-extern
```

Dit haalt de nieuwste back-up naar een lege map, controleert de assethashes,
start een geïsoleerde PostgreSQL **zonder netwerk**, zet de dump terug en eist
dat de kerntabellen erin staan. Let op de schijfruimte: het hersteldoel krijgt
een volledige kopie. Ruim de testmappen daarna op, en herhaal dit periodiek.

`restore.sh` weigert naar de productiedatamap te herstellen en weigert een doel
dat niet leeg is. Een echte terugzetactie is met opzet geen one-liner; zie
[backup-herstel.md](../notes/backup-herstel.md).

## 11. Een reboot proeven

Vijf minuten, en het is het stuk dat in deze omgeving niet gemeten is:

```bash
sudo reboot
# even wachten, dan opnieuw inloggen
ssh studio@203.0.113.10
cd /opt/interieurstudio && ./scripts/doctor.sh
curl -sS "https://$DOMEIN/api/v1/health"
systemctl list-timers interieurstudio-backup.timer
mount | grep interieurstudio     # alleen bij een blockstorage-volume
```

Alle services draaien (de containers hebben `restart: unless-stopped`), de
healthcheck slaagt, het volume is gemount en de timer staat op de volgende
nacht. Zo niet, dan weet je het nu en niet over drie weken.

## Bijwerken

```bash
cd /opt/interieurstudio
tmux new -s upgrade
set -a; . /etc/interieurstudio/backup.env; set +a
git pull
./scripts/upgrade.sh
```

`upgrade.sh` draait eerst de preflight, dan een volledige back-up, en pas daarna
de nieuwe images en migrations. Zijn je restic-bestemmingen niet bereikbaar, dan
stopt de upgrade — met opzet: geen schemawijziging zonder terugweg. Dat is ook
waarom de credentials hier in je omgeving moeten staan.

---

## VPS-specifieke valkuilen

**De preflight stopt op schijfruimte terwijl je pakket "100 GB" heet.** GB is
niet GiB. Zie [Voordat je begint](#voordat-je-begint); een volume van 120 GB of
meer haalt de grens comfortabel.

**Je hebt jezelf buitengesloten.** Wachtwoordlogin uitzetten zonder eerst met de
sleutel te testen is de klassieker. Gebruik de webconsole of het rescue-systeem
van je provider, en verwijder `/etc/ssh/sshd_config.d/99-studio.conf`.

**Het certificaat komt niet.** Loop na: resolveert het domein naar dít adres
(`getent ahosts` versus `curl ifconfig.me`), staan 80 en 443 open in ufw **en**
in de cloudfirewall van je provider, en heb je een AAAA-record dat niet
antwoordt? Kijk daarna in `docker compose ... logs caddy` — de ACME-fout staat er
letterlijk.

**`/api/v1/health` geeft HTML.** Dan worden API-aanroepen naar de webpagina
gestuurd. De app laadt wel, maar geen enkele knop doet iets.

**De nachtelijke back-up faalt terwijl de handmatige slaagde.** Dan mist de
systemd-run iets wat jouw shell wel had: meestal de credentials
(`EnvironmentFile`-drop-in uit stap 9), soms leesrecht op het
restic-wachtwoord of schrijfrecht in `STUDIO_DATA_DIR`. `journalctl -u
interieurstudio-backup.service` zegt welke.

**Een snapshot van je provider is geen back-up van de database.** Een
momentopname van een draaiende PostgreSQL is niet consistent. Gebruik hem voor
de host, en `backup.sh` voor de data.

**De schijf loopt vol tijdens een back-up.** De staging in
`STUDIO_DATA_DIR/backups/staging` houdt kort een volledige kopie van de assets
plus de dump. Reken dat mee, niet alleen de groei van de assets zelf.

Voor alles wat niet VPS-specifiek is — rechten van de containers, de routering
van Caddy, Chromium-fouten bij een PDF, niet meer kunnen inloggen — zie
[Als het misgaat](installatie.md#als-het-misgaat) en
[accountherstel.md](accountherstel.md).

## Wat deze installatie nog niet heeft

Geen monitoring en geen waarschuwing als een back-up stilvalt — `doctor.sh` en
`journalctl` tonen de status, maar je moet er zelf naar kijken. Geen
projectexport of -import, geen storagemigratie, en geen repetitie van een
verhuizing naar een tweede host. Exports draaien in het API-proces, en daarom
gaat de API tijdens een back-up even uit.

Deze handleiding is geschreven vóór de eerste echte installatie. Kom je iets
tegen wat hier niet klopt, werk hem dan bij op het punt waar je vastliep — dat is
precies waar de volgende persoon ook vastloopt.
