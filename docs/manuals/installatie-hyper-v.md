# Installatie op een eigen server via Hyper-V

Van een leeg Hyper-V-hostsysteem naar een draaiende Studio achter HTTPS, met een
eerste eigenaar en een nachtelijke versleutelde back-up.

Deze handleiding is de Hyper-V-specifieke voorkant van
[installatie.md](installatie.md). Deel A en B (de VM en Debian) staan hier
volledig; deel C verwijst voor de app naar de bestaande stappen en vult alleen
aan wat op een Hyper-V-gast anders is.

**Lees dit eerst.** Net als de basishandleiding is deze procedure opgeschreven
vanaf de scripts en de configuratie in de repository. Debian 13 op Hyper-V,
autostart en herstel na een hostreboot zijn in deze omgeving **niet gemeten**
(zie `docs/notes/infra-installatie.md`). Reken op één of twee ruwe randen bij de
eerste poging.

## Overzicht

| Deel | Wat je doet | Ongeveer |
|---|---|---|
| A | Hyper-V-VM aanmaken en instellen | 20 min |
| B | Debian 13 installeren en de host klaarmaken | 30 min + installatietijd |
| C | De repository installeren en starten | 15 min + buildtijd |
| D | Eerste eigenaar, controle en back-up | 30 min |

---

# Deel A — De virtuele machine

## A1. Wat de VM moet hebben

De startschatting uit de basishandleiding, toegepast op Hyper-V:

| Instelling | Waarde | Waarom |
|---|---|---|
| Generatie | **2** (UEFI) | Generatie 1 werkt ook, maar 2 is de moderne route. |
| vCPU | 4 | Twee containers mogen elk 2 CPU gebruiken. |
| RAM | 8 GB (16 GB bij meerdere gelijktijdige exports) | |
| Dynamic Memory | **uit** | PostgreSQL en Chromium gaan slecht samen met een krimpend geheugen. |
| VHDX | 200 GB, dynamisch uitbreidend | De preflight **weigert** te starten bij minder dan 100 GiB vrij. |
| VHDX-locatie | **lokale SSD van de host** | Geen SMB/NFS/iSCSI voor de PostgreSQL-map. |
| Netwerk | **externe** virtuele switch | De VM moet een eigen adres op je LAN krijgen. |
| Checkpoints | **uit** | |
| Secure Boot | template **Microsoft UEFI Certificate Authority** | Anders boot Debian niet. |

Twee daarvan zijn de klassieke struikelblokken, en ze verdienen een woord.

**De externe switch.** De "Default Switch" van Hyper-V is NAT achter een subnet
dat na een hostreboot kan veranderen. Caddy moet op poort 80 en 443 bereikbaar
zijn en een certificaat aanvragen; dat wil je niet door een wisselende NAT heen.
Maak in **Hyper-V Manager → Virtual Switch Manager** een switch van het type
**External**, gekoppeld aan de fysieke netwerkkaart van de host.

**Checkpoints uit.** Een checkpoint van een draaiende database geeft een
momentopname die tijdens het schrijven is genomen. Terugzetten daarvan levert
een half-geschreven PostgreSQL op. De back-up in deel D is de juiste route:
die stopt de API, maakt een consistente dump en versleutelt hem. Zet op
Windows 10/11 ook de **automatische** checkpoints uit — die staan daar standaard
aan.

## A2. Aanmaken (PowerShell, als administrator)

Pas de paden en de switchnaam aan op je host.

```powershell
$Naam   = "interieurstudio"
$Pad    = "D:\Hyper-V"                      # lokale SSD
$Switch = "LAN"                             # je externe switch
$Iso    = "D:\iso\debian-13-amd64-netinst.iso"

New-VM -Name $Naam -Generation 2 -MemoryStartupBytes 8GB `
  -NewVHDPath "$Pad\$Naam\$Naam.vhdx" -NewVHDSizeBytes 200GB `
  -SwitchName $Switch -Path $Pad

Set-VM -Name $Naam -ProcessorCount 4 -StaticMemory `
  -AutomaticStartAction Start -AutomaticStartDelay 60 `
  -AutomaticStopAction Shutdown -AutomaticCheckpointsEnabled $false

# Debian's bootloader wordt niet door de Windows-template vertrouwd.
Set-VMFirmware -VMName $Naam -SecureBootTemplate MicrosoftUEFICertificateAuthority

Add-VMDvdDrive -VMName $Naam -Path $Iso
Set-VMFirmware -VMName $Naam -FirstBootDevice (Get-VMDvdDrive -VMName $Naam)

# De klok laten we aan Debian; twee tijdbronnen die elkaar corrigeren is er een te veel.
Disable-VMIntegrationService -VMName $Naam -Name "Time Synchronization"

Start-VM -Name $Naam
```

`-AutomaticStartAction Start` met een minuut vertraging is wat de VM na een
hostreboot weer laat opkomen; de containers hebben zelf `restart: unless-stopped`
en komen daarna vanzelf mee.

Over die laatste regel: Hyper-V synchroniseert standaard de gastklok vanaf de
host. De preflight wil zien dat de klok **NTP-gesynchroniseerd** is, en
certificaataanvragen zijn gevoelig voor een verkeerde tijd. Eén duidelijke
eigenaar van de klok is simpeler; in deel B zetten we NTP in de gast aan. Laat je
de Hyper-V-tijdsynchronisatie liever aan, dan kan dat — verwacht dan alleen de
waarschuwing van de preflight over de klokstatus.

## A3. Reserveer een adres

Geef de VM een vast IP-adres, of maak een DHCP-reservering op het MAC-adres:

```powershell
Get-VMNetworkAdapter -VMName $Naam | Select-Object MacAddress
```

Het domein uit `PUBLIC_BASE_URL` moet later naar dít adres wijzen.

---

# Deel B — Debian 13 op de gast

## B1. Installeren

Download de **netinst** ISO van Debian 13 (trixie) voor amd64 en verbind hem met
de VM (deel A doet dat al). Loop de installer door en let op drie dingen:

- **Partitionering:** kies *Guided – use entire disk* en daarbinnen **"All files
  in one partition"**. Met de standaard-opzet die `/home`, `/var` en `/tmp`
  splitst, kan `/srv` te klein uitvallen en faalt de preflight op de 100 GiB.
- **Software selection:** vink **alles uit** behalve **SSH server** en
  **standard system utilities**. Geen desktopomgeving.
- Maak een gewone gebruiker aan (bijvoorbeeld `studio`). Je installeert straks
  niet als root.

Verwijder na de installatie de DVD uit de VM:

```powershell
Remove-VMDvdDrive -VMName "interieurstudio" -ControllerNumber 0 -ControllerLocation 1
```

## B2. Basis op orde

Log in via SSH en werk als je gewone gebruiker met `sudo`.

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y ca-certificates curl git restic openssl \
  hyperv-daemons systemd-timesyncd
```

`hyperv-daemons` levert de integratiediensten voor de gast (onder andere een
nette shutdown vanaf de host en het doorgeven van het IP-adres aan Hyper-V
Manager). Debian's kernel heeft de Hyper-V-drivers zelf al ingebouwd.

Zet de klok en controleer hem:

```bash
sudo timedatectl set-ntp true
sudo timedatectl set-timezone Europe/Amsterdam
timedatectl        # verwacht: "System clock synchronized: yes", "NTP service: active"
```

Die eerste regel is precies wat de preflight opvraagt. Blijft hij `no`, dan
controleer je eerst of uitgaand UDP 123 open is.

Zet ook een hostnaam die je terugziet in de logs van de scripts:

```bash
sudo hostnamectl set-hostname studio
```

## B3. Docker Engine en Compose v2

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

Krijg je bij `apt update` een 404 op de trixie-map, dan heeft Docker die release
nog niet gepubliceerd: vervang dan in `/etc/apt/sources.list.d/docker.list` de
codenaam door `bookworm` en probeer het opnieuw.

Geef je gebruiker toegang tot de daemon en controleer dat het werkt:

```bash
sudo usermod -aG docker "$USER"
newgrp docker           # of log uit en weer in
docker info >/dev/null && docker compose version
```

Beide moeten slagen zonder `sudo` — de preflight eist dat expliciet.

## B4. Poorten en DNS

De app wordt ontsloten door Caddy op 80 en 443. Debian minimaal heeft geen
firewall aanstaan; installeer je er een, laat dan beide poorten door.

Dan de vraag die bepaalt hoe de rest verloopt: **is dit domein publiek?**

**Publiek bereikbaar** (aanbevolen, en de enige route die de repository kant en
klaar ondersteunt). Zet een A-record voor je domein naar het publieke adres van
je verbinding, en stuur poort 80 en 443 op je router door naar het IP-adres van
de VM. Caddy vraagt dan zelf een Let's Encrypt-certificaat aan en vernieuwt het.
Controleer vóór je verder gaat:

```bash
getent ahosts studio.voorbeeld.nl
```

Resolveert dit niet vanaf de VM, dan stopt de preflight — en terecht, want dan
mislukt ook de certificaataanvraag.

**Alleen intern.** Dan werkt de automatische certificaataanvraag niet: die
vereist dat Let's Encrypt je poort 80 of 443 van buiten kan bereiken. Je hebt
twee uitwegen, en geen van beide staat in de standaardconfiguratie:

1. Een certificaat van een CA die je organisatie vertrouwt, met een eigen
   `tls`-regel in `infra/docker/Caddyfile` en de bestanden in de image.
2. Caddy's eigen lokale CA, door in `infra/docker/Caddyfile` binnen het siteblok
   `tls internal` toe te voegen. Elke browser die de app gebruikt moet dan de
   root van die CA vertrouwen, anders krijg je een waarschuwing.

In beide gevallen heb je nog steeds een **DNS-naam** nodig die vanaf de VM
resolveert (een intern A-record volstaat), want `PUBLIC_BASE_URL` moet exact
`https://` + `CADDY_SITE_ADDRESS` zijn en de app accepteert geen andere origin.
Een IP-adres invullen werkt niet. Deze twee routes zijn niet getest en vallen
buiten de basishandleiding.

---

# Deel C — De applicatie

Vanaf hier volg je [installatie.md](installatie.md); hieronder staat dezelfde
route compact, met de Hyper-V-aandachtspunten erbij.

## C1. De code op de host

```bash
sudo mkdir -p /opt/interieurstudio
sudo chown "$USER" /opt/interieurstudio
git clone <repository-url> /opt/interieurstudio
cd /opt/interieurstudio
```

Houd deze map aan: de systemd-unit voor de back-up in deel D verwijst ernaar.

Node.js, pnpm en PostgreSQL hoef je **niet** op de host te installeren. Alles
wordt in de containers gebouwd en gedraaid.

## C2. Configuratie

```bash
cp .env.example .env
chmod 600 .env
$EDITOR .env
```

Vul in: `PUBLIC_BASE_URL`, `CADDY_SITE_ADDRESS`, `STUDIO_DATA_DIR`
(bijvoorbeeld `/srv/interieurstudio`) en de twee `BACKUP_*`-repositories.
`PUBLIC_BASE_URL` moet letterlijk `https://` + `CADDY_SITE_ADDRESS` zijn.

De vijf geheimen mag je laten staan: `install.sh` vraagt er in C4 om met
verborgen invoer. Zie de tabel in [installatie.md](installatie.md#2-configuratie-invullen)
voor alle velden.

Maak de datamap aan op de lokale schijf en geef hem aan jezelf:

```bash
sudo install -d -o "$USER" -g "$USER" /srv/interieurstudio
df -h /srv/interieurstudio      # moet ≥ 100 GiB vrij tonen
```

**Bewaar `.env` en het restic-wachtwoord ook buiten deze VM.** Een VHDX die
wegvalt neemt anders de sleutel tot je back-ups mee.

## C3. Restic-repositories

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

Kies twee verschillende plekken, en geen van beide op de Hyper-V-host zelf —
anders verlies je bij één storing de app én de back-up.

`install.sh` heeft deze repositories niet nodig; `backup.sh` en dus ook
`upgrade.sh` weigeren zonder.

## C4. Installeren

```bash
./scripts/install.sh
```

Dit vraagt om de ontbrekende geheimen, maakt de datamappen aan, draait de
preflight en start de stack. De eerste keer duurt het een paar minuten: er worden
twee images gebouwd. De migrator draait eenmalig en legt het schema aan; pas als
hij klaar is, start de API.

Blijft het hangen op `--wait`, dan wordt een container niet gezond. Kijk in deze
volgorde:

```bash
docker compose --env-file .env -f compose.production.yaml ps
docker compose --env-file .env -f compose.production.yaml logs postgres
docker compose --env-file .env -f compose.production.yaml logs migrator
docker compose --env-file .env -f compose.production.yaml logs api
```

---

# Deel D — In gebruik nemen

## D1. De eerste eigenaar

```bash
./scripts/setup-owner.sh
```

Vraagt om naam, e-mailadres, naam van de werkruimte en een wachtwoord van
minstens 12 tekens. Dit kan maar één keer: zodra er een gebruiker bestaat, is
deze ingang gesloten. Log daarna in op je domein en zet meteen **MFA** aan onder
Beveiliging.

## D2. Controleren

```bash
./scripts/doctor.sh
```

En zelf in een browser: HTTPS met geldig certificaat, inloggen, een nieuw project
dat na herladen blijft staan, en een **offerte-PDF downloaden**. Die laatste is
de zwaarste route — daar start Chromium in de container — en dus de moeite waard
om meteen te doen.

## D3. Nachtelijke back-up

De meegeleverde unit draait als gebruiker `interieurstudio` vanuit
`/opt/interieurstudio`. Maak die gebruiker aan, of pas de unit aan op je eigen
gebruiker:

```bash
sudo useradd --system --home /opt/interieurstudio --shell /usr/sbin/nologin interieurstudio
sudo usermod -aG docker interieurstudio
sudo chown -R interieurstudio /opt/interieurstudio
sudo setfacl -m u:interieurstudio:r /etc/interieurstudio/restic-password 2>/dev/null \
  || sudo chown interieurstudio /etc/interieurstudio/restic-password

sudo cp infra/systemd/interieurstudio-backup.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now interieurstudio-backup.timer
```

Die gebruiker heeft toegang tot Docker en tot het restic-wachtwoord nodig;
zonder beide faalt de timer stil in de nacht.

Draai de eerste back-up met de hand en kijk of hij doorkomt:

```bash
./scripts/backup.sh
```

Let op: **de API gaat tijdens de back-up even uit.** Dat is het onderhoudsvenster
dat de dump consistent maakt. Hij gaat daarna vanzelf weer aan, ook als de
back-up mislukt.

## D4. De back-up verifiëren

Een geslaagde upload is nog geen geslaagde herstelbaarheid:

```bash
./scripts/verify-backup.sh --from synology --target /srv/hersteltest
./scripts/verify-backup.sh --from external --target /srv/hersteltest-extern
```

Herhaal dit periodiek. Zie [backup-herstel.md](../notes/backup-herstel.md).

## D5. Een hostreboot proeven

Dit is het stuk dat in deze omgeving niet gemeten is, en het kost je vijf
minuten. Herstart de Hyper-V-host (of `Restart-VM`), en controleer daarna:

```bash
docker compose --env-file /opt/interieurstudio/.env \
  -f /opt/interieurstudio/compose.production.yaml ps
/opt/interieurstudio/scripts/doctor.sh
systemctl list-timers interieurstudio-backup.timer
```

Alle services draaien, de healthcheck slaagt, en de timer staat op de volgende
nacht. Zo niet, dan weet je het nu en niet over drie weken.

## Bijwerken

```bash
cd /opt/interieurstudio
git pull
./scripts/upgrade.sh
```

`upgrade.sh` draait eerst de preflight, dan een volledige back-up, en pas daarna
de nieuwe images en migrations. Zijn je restic-bestemmingen niet bereikbaar, dan
stopt de upgrade — met opzet: geen schemawijziging zonder terugweg.

---

## Hyper-V-specifieke valkuilen

**De VM boot niet na de installatie.** Secure Boot met de Windows-template
vertrouwt Debian's shim niet. `Set-VMFirmware -SecureBootTemplate
MicrosoftUEFICertificateAuthority`, of Secure Boot uit.

**De preflight klaagt over schijfruimte terwijl de VHDX 200 GB is.** Een
dynamisch uitbreidende VHDX groeit mee, maar `df` in de gast toont de
partitiegrootte. Splitste de installer `/srv` of `/var` af in een kleine
partitie, dan is dat het probleem en niet de VHDX.

**DNS resolveert niet vanaf de VM.** Met een externe switch krijgt de VM zijn
DNS van je LAN. Een intern domein dat alleen op je Windows-host bekend is,
bestaat voor de gast niet.

**De klokstatus blijft `no`.** Als je de Hyper-V-tijdsynchronisatie aan hebt
gelaten, kan `timedatectl` de klok wel gelijk hebben maar niet als
NTP-gesynchroniseerd melden. Dat is een waarschuwing, geen blokkade. Wil je hem
kwijt: schakel de integratiedienst uit en gebruik `systemd-timesyncd` (deel A2 en
B2).

**Na een checkpoint-restore start PostgreSQL niet.** Daarom staan checkpoints uit
in deel A. Herstel via `scripts/restore.sh` en een restic-snapshot; die weigert
overigens naar de productiedatamap te schrijven en naar een niet-lege map.

Voor alles wat niet Hyper-V-specifiek is — rechten van de containers, de
routering van Caddy, Chromium-fouten bij een PDF, niet meer kunnen inloggen —
zie [Als het misgaat](installatie.md#als-het-misgaat).
