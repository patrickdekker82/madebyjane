# Back-up, herstel en verificatie

Deze fase levert versleutelde restic-back-ups met twee verplichte bestemmingen:
een Synology-bestemming en een afzonderlijke extern beheerde bestemming. Het
script installeert geen pakket en maakt geen netwerk- of routerwijzigingen.

## Back-up uitvoeren

Zet op de productiehost in `.env` een ondersteunde restic-URL voor beide
bestemmingen en zet `BACKUP_RESTIC_PASSWORD_FILE` op een bestand met modus 0600.
Het wachtwoordbestand en de originele `.env` met `AUTH_SECRET` horen in een
afzonderlijke, gecontroleerde herstelroute thuis. Zij worden bewust niet in de
back-up gekopieerd. De back-up bevat wel een geredigeerde configuratie,
`.env.example`, Compose-configuratie en release-manifest.

```sh
scripts/backup.sh
```

Het script stopt de API gedurende het onderhoudsvenster. Daardoor zijn mutaties
geblokkeerd; de huidige release heeft geen aparte worker om te drain-en en
exports draaien in het API-proces. Daarna maakt het een PostgreSQL custom dump,
een dump van globale rollen en een SHA-256-manifest van alle assets. Beide
restic-bestemmingen moeten slagen voordat de status `success` wordt geregistreerd.
De `EXIT`-handler start de API ook na een fout opnieuw; een mislukte herstart
wordt nadrukkelijk als fout gemeld.

Restic behoudt standaard 14 dagelijkse, 8 wekelijkse en 12 maandelijkse
snapshots. De waarden zijn instelbaar via de drie `BACKUP_KEEP_*`-variabelen.
De status staat lokaal in `STUDIO_DATA_DIR/backups/status.json` en verschijnt in
`scripts/doctor.sh`. Een geslaagde upload is nog geen hersteltest.

De meegeleverde systemd-unit en timer zijn een voorbeeld voor de beoogde host.
Pas gebruiker en checkoutpad aan, kopieer beide naar `/etc/systemd/system/` en
activeer ze pas na een handmatige geslaagde backup. `Persistent=true` vangt een
gemiste run na herstart op; de geplande start blijft 03:15 met maximaal 15
minuten spreiding. Dit is een RPO-startdoel van 24 uur, geen al gemeten garantie.

## Herstel en verificatie

Een restore kan nooit naar `STUDIO_DATA_DIR` en vereist een absoluut, leeg doel:

```sh
scripts/restore.sh --from synology --target /srv/interieurstudio-recovery --confirm-empty-target
scripts/verify-backup.sh --from external --target /srv/interieurstudio-verify
```

`verify-backup.sh` voert bovendien de database-dump terug in een tijdelijke,
netwerkloze PostgreSQL-container zonder gepubliceerde poorten. Hij controleert
de assethashes en de kernschema's voor accounts, projecten, presentaties en
offertes. De container wordt daarna verwijderd; de herstelde artefacten blijven
in de opgegeven controlemap voor inspectie.

Een volledige hersteloefening op een tweede host vraagt daarnaast de apart
bewaarde originele secrets: plaats die alleen op die geïsoleerde host, start de
recovery-stack met andere DNS/poorten en voer een login, project-, presentatie-
en offerte-smoketest uit. Er mag nooit tegelijk een tweede productie-writer
draaien. De omschakeling is pas veilig na controle van TLS, storage-manifest,
schema-compatibiliteit en gebruikersstroom.

## Grenzen en vervolg

Deze omgeving heeft geen actieve Docker-daemon, restic-bestemming, Synology of
tweede Linux-host. De scripts zijn syntactisch gecontroleerd; de echte
versleutelde upload, restore en migratierepetitie moeten op die doelomgeving
worden vastgelegd voordat RPO/RTO als behaald mag gelden. Een pg_dump is geen
PITR/WAL-voorziening; wanneer een strenger RPO nodig is, volgen PostgreSQL base
backups en WAL-archivering. VM-checkpoints zijn hoogstens aanvullend en geen
vervanging voor deze applicatieback-up.

Na nieuwe writes is terugrollen geen eenvoudige image- of DNS-wissel: een
ouder schema kan onverenigbaar zijn met de data. Herstel daarom voorwaarts of
uit een aantoonbaar geschikte snapshot.
