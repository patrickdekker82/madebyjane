# Installatie

Voor het opzetten van Studio op een eigen server. Aan het eind draait de app
achter HTTPS, is er een eerste eigenaar, en staat er een nachtelijke
versleutelde back-up.

**Lees dit eerst.** Deze procedure is opgeschreven vanaf de scripts en de
configuratie zoals die in de repository staan, maar is **nog nooit op een echte
host uitgevoerd**. Alles is getoetst wat zonder Docker-daemon te toetsen valt:
de routetabel van Caddy is gecompileerd en nagelopen, de afhankelijkheden van de
productie-image zijn tegen een echte `--prod`-installatie gelegd, en het
aanmaken van de eerste eigenaar is tegen een echte PostgreSQL met de
productierolverdeling gedraaid. Wat niemand heeft gezien is de stack die
werkelijk opstart. Reken dus op één of twee ruwe randen bij de eerste poging, en
zie [Als het misgaat](#als-het-misgaat) — daar staat wat je dan het eerst
bekijkt.

## Wat je nodig hebt

Twee handleidingen beginnen eerder dan deze en nemen de stappen hieronder over,
elk met de valkuilen van hun eigen soort host:

- [installatie-checklist.md](installatie-checklist.md) — de afvinkbare versie
  van de VPS-route, met per stap wat je moet zien. Dit is wat je erbij houdt
  terwijl je installeert.
- [installatie-vps.md](installatie-vps.md) — een VPS achter een
  WireGuard-VPN, volledig vanuit de terminal. Niets publiek bereikbaar, dus
  Caddy's eigen CA in plaats van Let's Encrypt, een binding op de tunnel, en
  een back-up die vanuit systemd bij zijn opslagcredentials kan.
- [installatie-hyper-v.md](installatie-hyper-v.md) — een Hyper-V-VM, vanaf het
  aanmaken van de machine.

**Een Linux-host.** Debian 13 is het beoogde doel; de preflight waarschuwt bij
iets anders maar gaat door. x86_64 of aarch64. Als startschatting: 4 vCPU,
8–16 GB RAM en 100–200 GB lokale SSD. De preflight weigert te beginnen bij
minder dan 100 GiB vrij. Dat is een schatting en geen meting — er is nog geen
capaciteitsprofiel gedraaid.

**Docker Engine en Compose v2**, geïnstalleerd via de gedocumenteerde route van
je distributie, en bruikbaar door de gebruiker die de installatie uitvoert.

**Een domeinnaam die naar deze host wijst.** Caddy vraagt standaard zelf een
publiek vertrouwd certificaat aan, en dat lukt alleen als DNS al klopt en poort
80 en 443 van buiten bereikbaar zijn. Installeer je intern of achter een VPN,
zet dan `CADDY_TLS=tls internal` in `.env`: Caddy gebruikt dan zijn eigen CA en
`scripts/export-ca.sh` haalt de root eruit om op je apparaten te vertrouwen. Ook
dan heb je een DNS-naam nodig die vanaf de host resolveert — een IP-adres
invullen werkt niet. De volledige route staat in
[installatie-vps.md](installatie-vps.md).

**Lokale schijf voor de data.** Geen SMB- of NFS-share voor de
PostgreSQL-directory.

**`restic` op de host** en twee versleutelde back-upbestemmingen. Zonder die
twee draait de app wel, maar faalt `backup.sh` en dus ook `upgrade.sh`.

## 1. De code op de host zetten

```bash
sudo mkdir -p /opt/interieurstudio
sudo chown "$USER" /opt/interieurstudio
git clone <repository-url> /opt/interieurstudio
cd /opt/interieurstudio
```

De scripts gaan uit van deze map. Kies je een andere, pas dan later de
systemd-unit aan.

## 2. Configuratie invullen

```bash
cp .env.example .env
chmod 600 .env
$EDITOR .env
```

Wat je zelf moet invullen:

| Veld | Wat erin hoort |
|---|---|
| `PUBLIC_BASE_URL` | `https://` plus je domein. Moet exact `https://` + `CADDY_SITE_ADDRESS` zijn; de preflight controleert dat. |
| `CADDY_SITE_ADDRESS` | Het domein zelf, zonder schema. |
| `STUDIO_DATA_DIR` | Waar de data komt te staan, bijvoorbeeld `/srv/interieurstudio`. |
| `HTTP_PORT` / `HTTPS_PORT` | Alleen wijzigen als 80 en 443 al bezet zijn, of als `adres:poort` om uitsluitend op één interface te publiceren — de manier om de app achter een VPN te houden. |
| `CADDY_TLS` | Leeg voor een automatisch, publiek vertrouwd certificaat. `tls internal` voor Caddy's eigen CA, de enige werkende route als poort 80 en 443 niet van buiten bereikbaar zijn. |
| `BACKUP_RESTIC_PASSWORD_FILE` | Pad naar een bestand met het restic-wachtwoord, bijvoorbeeld `/etc/interieurstudio/restic-password`, met rechten `600`. |
| `BACKUP_SYNOLOGY_REPOSITORY` / `BACKUP_EXTERNAL_REPOSITORY` | Twee restic-repositories, op twee verschillende plekken. |

De vijf geheimen (`POSTGRES_PASSWORD`, `MIGRATION_DATABASE_PASSWORD`,
`RUNTIME_DATABASE_PASSWORD`, `AUTH_DATABASE_PASSWORD`, `AUTH_SECRET`) kun je
laten staan: `install.sh` vraagt er in stap 4 om met verborgen invoer. Vul je ze
liever zelf in, gebruik dan minstens 32 tekens uit `A–Z a–z 0–9 _ -`:

```bash
openssl rand -base64 48 | tr -d '+/=' | cut -c1-48
```

Deze vijf zijn met opzet vijf verschillende geheimen en geen één. Laat ze bij
een herstart ongewijzigd: `install.sh` en `upgrade.sh` roteren nooit
stilzwijgend een bestaand geheim.

**Bewaar `.env` en het restic-wachtwoord ook buiten deze host.** Zonder het
restic-wachtwoord is elke back-up onleesbaar, en de back-up bevat die zelf niet
— dat is de bedoeling, en het is ook het makkelijkst te vergeten.

## 3. Restic-repositories aanmaken

Eenmalig, per bestemming, met hetzelfde wachtwoordbestand:

```bash
sudo install -d -m 700 /etc/interieurstudio
openssl rand -base64 48 | sudo tee /etc/interieurstudio/restic-password >/dev/null
sudo chmod 600 /etc/interieurstudio/restic-password

export RESTIC_PASSWORD_FILE=/etc/interieurstudio/restic-password
restic -r <synology-repository> init
restic -r <externe-repository> init
unset RESTIC_PASSWORD_FILE
```

`backup.sh` initialiseert niet zelf: een repository die er niet is, is een
vergissing en geen situatie om stilzwijgend op te lossen.

## 4. Installeren

```bash
./scripts/install.sh
```

Dit vraagt om de ontbrekende geheimen, maakt de datamappen aan, draait de
preflight en start de stack. De preflight controleert besturingssysteem,
architectuur, Docker, schijfruimte, schrijfrechten, vrije poorten, DNS en de
klok, en stopt bij de eerste echte belemmering.

De eerste keer duurt dit een paar minuten: twee images worden gebouwd. De
migrator draait eenmalig en legt het databaseschema aan; pas als hij klaar is,
start de API.

## 5. De eerste eigenaar

```bash
./scripts/setup-owner.sh
```

Vraagt om naam, e-mailadres, naam van de werkruimte en een wachtwoord van
minstens 12 tekens. Dit kan maar één keer: zodra er een gebruiker bestaat, is
deze ingang gesloten.

Dit draait bewust in een wegwerpcontainer met de **migratierol** en niet via de
app. De rol waarmee de app aanmeldingen afhandelt mag zelf geen organisatie of
lidmaatschap aanmaken — zou dat wel kunnen, dan kon een gekaapte app zichzelf
een tweede werkruimte met een eigen eigenaar geven. Het aanmaken van de eerste
eigenaar hoort daarom bij de installateur.

Log daarna in op je domein en zet meteen **MFA** aan onder Beveiliging: de
HTTPS-routes vragen erom.

## 6. Controleren

```bash
./scripts/doctor.sh
```

Toont de containerstatus, draait de healthcheck van de API en meldt de
back-upstatus. Controleer daarnaast zelf in een browser:

- Het domein opent over HTTPS met een geldig certificaat.
- Inloggen werkt.
- Een nieuw project met de fictieve woonkamer wordt aangemaakt en blijft na
  herladen staan.
- Een offerte-PDF downloaden werkt — dat is de zwaarste route, want daar start
  Chromium in de container.

Die laatste is de moeite waard om meteen te doen: hij raakt het stuk van de
image dat het lastigst te bewijzen was.

## 7. De nachtelijke back-up inschakelen

```bash
sudo cp infra/systemd/interieurstudio-backup.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now interieurstudio-backup.timer
```

De timer draait elke nacht om 03:15 met een spreiding van een kwartier. De
service draait als gebruiker `interieurstudio`; maak die aan en geef hem toegang
tot Docker en tot de map, of pas de unit aan op de gebruiker die je gebruikt.

Draai de eerste back-up met de hand en kijk of hij doorkomt:

```bash
./scripts/backup.sh
```

Let op: **de API gaat tijdens de back-up even uit.** Dat is het
onderhoudsvenster dat de dump consistent maakt. Hij gaat daarna vanzelf weer
aan, ook als de back-up mislukt.

## 8. De back-up verifiëren

Een geslaagde upload is nog geen geslaagde herstelbaarheid. Test het:

```bash
./scripts/verify-backup.sh --from synology --target /srv/hersteltest
```

Dit haalt de nieuwste back-up op naar een lege map, controleert de assethashes,
start een geïsoleerde PostgreSQL zonder netwerk, zet de dump daarin terug en
eist dat de kerntabellen erin staan. Doe dit ook voor `--from external`, en
herhaal het periodiek.

`restore.sh` weigert naar de productiedatamap te herstellen en weigert een doel
dat niet leeg is. Een echte terugzetactie naar productie is daarmee bewust geen
one-liner.

## Bijwerken

```bash
git pull
./scripts/upgrade.sh
```

`upgrade.sh` draait eerst de preflight, dan een volledige back-up, en pas daarna
de nieuwe images en migrations. Zijn je restic-bestemmingen niet bereikbaar, dan
stopt de upgrade — dat is met opzet: je wilt geen schemawijziging zonder
terugweg.

## Als het misgaat

**De stack komt niet omhoog.** Kijk eerst welke container het begeeft:

```bash
docker compose --env-file .env -f compose.production.yaml ps
docker compose --env-file .env -f compose.production.yaml logs postgres
docker compose --env-file .env -f compose.production.yaml logs migrator
docker compose --env-file .env -f compose.production.yaml logs api
```

De volgorde is niet willekeurig: postgres moet gezond zijn voordat de migrator
draait, en de migrator moet klaar zijn voordat de API start. Blijft `install.sh`
hangen op `--wait`, dan wacht hij op een container die niet gezond wordt.

Twee dingen waar dit het meest waarschijnlijk op strandt, allebei nog niet op
een echte host bewezen:

- **Rechten van de containers.** De API- en PostgreSQL-container laten kort een
  rootproces een eigenaar goedzetten en stappen daarna over naar een
  onbevoorrechte gebruiker. Ze krijgen daarvoor precies de Linux-capabilities
  die ze nodig hebben. Zie je in de logs iets over `gosu`, `chown` of
  `operation not permitted`, dan zit het daar.
- **De routering van Caddy.** Laadt de app wel maar doet geen enkele knop iets,
  kijk dan of `/api/v1/health` JSON teruggeeft en geen HTML. Krijg je HTML, dan
  worden API-aanroepen naar de webpagina gestuurd.

**Chromium-fouten bij een PDF.** De sandbox staat bewust aan. Zie je in de logs
iets over de sandbox of over user namespaces, meld dat dan met de logregels
erbij; zet hem niet uit om er vanaf te zijn.

**Je kunt niet meer inloggen.** Zie `docs/manuals/accountherstel.md`. Is er nog
geen enkele gebruiker, dan werkt `setup-owner.sh` gewoon opnieuw.

## Wat deze installatie nog niet heeft

Geen monitoring en geen waarschuwing als een back-up stilvalt — `doctor.sh`
toont de status, maar je moet er zelf naar kijken. Geen projectexport of
-import, geen storagemigratie en geen repetitie van een verhuizing naar een
tweede host. Geen losse workercontainer: exports draaien in het API-proces, en
daarom gaat de API tijdens een back-up even uit.

Deze handleiding is geschreven vóór de eerste echte installatie. Kom je iets
tegen wat hier niet klopt, werk hem dan bij op het punt waar je vastliep — dat
is precies waar de volgende persoon ook vastloopt.
