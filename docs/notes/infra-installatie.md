# Installatie- en beheerfundament
## Correctie 11 september 2026 — twee dingen die de stack niet hadden laten starten

Twee fouten die pas op een echte Docker-host aan het licht zouden komen, en die
hier zijn gevonden zonder er een te hebben.

### Caddy stuurde elke API-aanroep naar de SPA

De eerste versie zette `root`, `try_files` en `file_server` los in het siteblok,
met daarnaast een `handle /api/*`. Caddy ordent losse directives niet op
volgorde van het bestand maar op zijn eigen vaste lijst, en `try_files` staat
daarin vóór `handle`.

Dat is te zien door de configuratie te compileren met dezelfde Caddy als in de
image (2.10.2, `caddy adapt`). In de gecompileerde routes stond de herschrijving
op plaats 1 en het `/api/*`-blok op plaats 3. Elk verzoek dat geen bestaand
bestand is — dus élke API-aanroep — werd eerst herschreven naar `/index.html`,
waarna de matcher op `/api/*` niet meer aansloeg. De app zou geladen zijn en
daarna niets hebben gedaan: elke aanroep kreeg HTML terug.

Nu staan beide in een `handle`. Die sluiten elkaar uit en worden wél op volgorde
afgehandeld; de gecompileerde routes tonen `/api/*` vóór de SPA-terugval.

### `cap_drop: [ALL]` liet drie containers niet opstarten

De API-ingang draait kort als root: hij zet de eigenaar van het gegevensvolume
goed en stapt daarna met gosu over naar `node`. De officiële PostgreSQL-image
doet hetzelfde richting `postgres`. Chown vraagt CHOWN, de overstap vraagt
SETUID en SETGID — precies de rechten die `cap_drop: [ALL]` weghaalt. Met
`set -eu` in de ingang stopt de container dan bij zijn eerste regel, en omdat de
migrator dezelfde image gebruikt zou de API eeuwig wachten op een migratierun
die nooit slaagt.

Elke dienst krijgt nu de rechten terug die hij aantoonbaar nodig heeft, en niet
meer dan dat. Caddy houdt alleen NET_BIND_SERVICE.

### Niet geverifieerd in deze omgeving

De Caddy-correctie is bewezen: de configuratie is gecompileerd en de routes zijn
nagelopen. **De capabilities zijn dat niet.** Er is hier geen Docker-daemon, dus
dat de containers met deze rechten daadwerkelijk starten is beredeneerd uit de
ingangsscripts en de bekende werking van gosu, niet gezien. Wie deze stack voor
het eerst opzet, ziet het binnen een minuut: start de migrator en meldt
`doctor.sh` een geslaagde healthcheck, dan klopt het.

### Opgemerkt, niet aangeraakt

De API-image installeert alle devDependencies, waaronder `embedded-postgres` —
dat een volledige PostgreSQL in de productie-image trekt — en start met
`pnpm dev:api`. Dat werkt, maar een eigen startscript en een uitgeklede
installatie horen bij de volgende infrastap.

Deze wijziging levert het eerste herhaalbare productiepad voor de huidige
applicatie. Het is gericht op een Debian 13-host met Docker Compose v2, lokale
SSD-opslag en één API-instantie.

## Gebouwd

- `.env.example` beschrijft alle productievariabelen zonder echte credentials.
  De vijf geheimen zijn gescheiden: PostgreSQL-beheer, migratie, runtime,
  identity en sessies. Het installatiescript accepteert alleen voldoende lange,
  URL-veilige geheimen en overschrijft bestaande waarden nooit.
- `compose.production.yaml` start Caddy, API, PostgreSQL en een migrator. Alleen
  Caddy publiceert HTTP en HTTPS. PostgreSQL staat uitsluitend op het interne
  netwerk; de API heeft geen gepubliceerde poort. De migrator gebruikt de
  afzonderlijke rol `studio_migrator` en eindigt na een idempotente migratierun.
- De PostgreSQL-initialisatie maakt `studio_migrator` met `CREATEROLE`, maar
  zonder superuser-, database-creatie- of RLS-bypassrechten. Die beperking is
  nodig omdat de bestaande eerste migration de twee runtime-rollen aanmaakt.
  Runtime en identity krijgen elk hun eigen login en bereiken de database niet
  via de migratieverbinding.
- Alle productieservices hebben een healthcheck of afhankelijkheid daarop,
  `unless-stopped` waar passend, CPU- en geheugenlimieten, lokale logrotatie,
  read-only root filesystem, expliciete tijdelijke opslag en minimale Linux
  capabilities. De API draait na de korte volume-permissieoverdracht als de
  niet-bevoorrechte `node`-gebruiker. De bestaande Chromium-seccomp-policy
  blijft actief; Chromium-sandboxing wordt niet uitgezet.
- De frontend wordt statisch gebouwd in de Caddy-image. Caddy levert de SPA en
  proxyt uitsluitend `/api/*` naar de interne API, zonder het pad te wijzigen.
- `apps/api/src/config.ts` valideert bij opstarten de vereiste URL's, secretlengte,
  poort en productie-HTTPS. `PUBLIC_BASE_URL` blijft de enige toegestane browser
  origin, passend bij de bestaande API-origincontrole. De huidige server heeft
  bewust `trustProxy: false`; omdat de API alleen via het Docker-netwerk
  bereikbaar is, wordt een client-IP uit Caddy niet vertrouwd of doorgestuurd.
- `scripts/preflight.sh`, `install.sh`, `doctor.sh` en `upgrade.sh` melden host,
  versie, gegevensmappen en migratiegevolg. Ze falen vroeg bij onvoldoende
  schijfruimte, ontbrekende Docker/Compose, bezette poorten, ongeldige secrets,
  onschrijfbare opslag of niet-resolverend DNS. Ze installeren geen pakketten,
  downloaden geen scripts met `curl | sh` en verwijderen niets.
- `compose.yaml` bevat alleen een expliciet `development`-profiel met een
  loopback-gebonden ontwikkel-PostgreSQL. Het is geen productiestartpad.

## Gebruik

Kopieer eerst `.env.example` naar `.env`, kies een domein dat naar de host
resolveert en voer vervolgens uit:

```sh
scripts/install.sh
scripts/doctor.sh
```

`install.sh` vraagt ontbrekende geheimen verborgen op, zet `.env` op modus 0600
en hergebruikt daarna de bestaande waarden. Voor een update vanuit een al
bijgewerkte checkout draait `scripts/upgrade.sh`; de expliciete migrator voert
alleen nieuwe migrations uit. Dit is nog geen rollbackmechanisme: een nieuw
databaseschema kan een oudere app-versie ongeschikt maken.

Voor een interne of VPN-installatie moet `CADDY_SITE_ADDRESS` alsnog een
bereikbare DNS-naam krijgen. Gebruik een door de organisatie vertrouwde
certificaatroute voor die naam; er wordt geen router-portforwarding ingesteld.
Openbare shares vragen bewust om publiek DNS, een geldige TLS-route en de twee
publieke proxy-poorten.

## Niet geverifieerd in deze omgeving

- Er is geen daadwerkelijke productiehost, Docker-engine, openbare DNS-record
  of TLS-certificaat beschikbaar geweest. Daarom is alleen de Compose-configuratie
  syntactisch gecontroleerd wanneer Docker lokaal beschikbaar is; netwerk- en
  firewallgedrag vanaf een externe host moet vóór ingebruikname worden getest.
- `bash -n` controleerde alle nieuwe shellscripts. ShellCheck is niet in deze
  werkruimte geïnstalleerd. `pnpm build` en de gerichte runtimeconfiguratietest
  slagen. De volledige `pnpm test` faalt hier buiten deze wijziging doordat de
  sandbox geen lokale TCP-listener of PostgreSQL shared-memorysegmenten toestaat;
  de fout treedt op bij bestaande embedded-PostgreSQL- en fake-S3-tests.
- Debian 13 op de beoogde Hyper-V-host, autostart, graceful shutdown en herstel
  na hostreboot zijn nog niet gemeten. De preflight eist geen GPU.
- De startschatting blijft 4 vCPU, 8–16 GiB RAM en 100–200 GiB lokale SSD,
  met één zware export tegelijk. De ingestelde containergrenzen zijn een
  verdeling binnen die startschatting, geen gemeten capaciteitsclaim.
- Back-up, restore en backupverificatie staan nu in
  [backup-herstel.md](backup-herstel.md). Projectimport/-export,
  storagemigratie en een aparte workercontainer vallen daar niet onder.
  Exports draaien in de huidige applicatie nog in proces; de aanwezige
  `pg-boss`-dependency wordt hiervoor niet gestart.
