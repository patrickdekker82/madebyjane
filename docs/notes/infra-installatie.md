# Installatie- en beheerfundament

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
- Deze taak omvat geen back-up, restore, backupverificatie, projectimport of
  -export, storagemigratie of aparte workercontainer. Exports draaien in de
  huidige applicatie nog in proces; de aanwezige `pg-boss`-dependency wordt
  hiervoor niet gestart.
