# Implementatiestatus — Studio

## Aanvulling 10 september 2026 — afronding offerteworkflow fase 6

Deze aanvulling is leidend voor fase 6; de oudere rapportages hieronder blijven als historische testregistraties staan. De wijzigingen zijn samengevoegd met main cb03021, inclusief de materiaalberekeningen en nieuwe editor-/browsertests. Het eerste offertedeel uit PR #2 staat al in main; de afronding krijgt een afzonderlijke pull request.

Beschikbaar: decimale rekenkern en jaar-/organisatienummering, ontwerp- en materiaalbronnen, bronverschillen, aparte commerciële catalogusprijsversies, dubbele-broncontrole, vaste bedrijfs-/klantgegevens, voorwaarden, tekst-/materiaal-/planbijlagen, PDF-download, vervolgconcepten, versiegeschiedenis, expliciete statusovergangen en intrekbare PDF-deellinks. Migration 0011 voegt immutable prijzen, bijlagen, gebeurtenissen en PDF-bytes toe; FORCE RLS en servercontrole beperken interne toegang tot owner/admin/finance. Deellinks zijn beperkt tot één exacte PDF, gehasht opgeslagen, maximaal 30 dagen via API (7 in UI), intrekbaar en zonder verdere projecttoegang.

Finalisatie bewaart inhoudshash en snapshots. De eerste PDF wordt opgeslagen met templateversie en PDF-hash; volgende downloads gebruiken dezelfde bytes. Een nieuwe definitieve versie krijgt een nieuw nummer en een expliciete vervangen-gebeurtenis bij de vorige versie. Een statusregistratie bevat actor, gebeurtenisdatum, registratie-tijdstip, onderbouwing en inhoudshash. PDF/download/deellink maken verzendt geen e-mail en simuleert geen klantacceptatie.

Bronconsistentie: dezelfde ontwerprevisie per variant; materiaalbladen en posten gebruiken dezelfde materiaalversie. Berekende materiaalhoeveelheden worden ook aan de ontwerprevisies getoetst. Cataloguswijzigingen kunnen een definitieve offerte niet aanpassen. Indicatieve prijzen bij materiaalkeuzes blijven afzonderlijk van de commerciële catalogusprijs; de gebruiker kiest die expliciet. Inkoop/marge worden niet opgeslagen of uitgeleverd.

Verificatie vóór samenvoegen met de nieuwste main: 11 offertests geslaagd met echte PostgreSQL en Chrome; alle 6 browserroutes geslaagd (1,3 min), inclusief PDF, delen/intrekken, statusregistratie en het ongewijzigd openen van oudere versies. De PDF-proef met 40 posten heeft 7 visueel gecontroleerde pagina's, totaal 3508,09 EUR, alle posten precies eenmaal en een 5-meterreferentie die bij 1:50 100 mm meet. De volledige suite na samenvoegen en Linux-CI worden hieronder aangevuld wanneer voltooid. Een bestaande Windows-symlinktest vereist rechten die op deze machine ontbreken; deze test blijft actief voor Linux-CI.

Na samenvoegen met main: TypeScript strict geslaagd; productiebuild geslaagd (14,61 s); alle 10 browserroutes geslaagd (1,3 min). De volledige Vitest-run telde 96 geslaagde tests, één nieuwe fixturefout en de bestaande Windows-symlinkbeperking. Na correctie van het veld keywords zijn alle 8 offerte-integratietests opnieuw geslaagd (15,74 s), inclusief de nieuwe gecombineerde broncontrole. Linux-CI moet de volledige 98-test-suite bevestigen. De Windows-browsertest stopt PostgreSQL nu vóór Playwright de procesboom beëindigt; de vorige force-stop kon een IO-worker achterlaten. De echte API-PDF (3 pagina's) is aanvullend visueel gecontroleerd.

Grenzen buiten deze fase: volledige fase-5-presentatiebouwer/PPTX/beeldimport, productie-exportqueue en opslagadapter, installatie/back-up/herstel en fase-9-hardening. De huidige bijlagen zijn vaste tekst-, materiaal- en planblokken; willekeurige geüploade PDF's en renderbeelden zijn geen ondersteunde bijlagebron. Maximaal 200 posten, 12 bijlagen, 500 versies per offerte, 20 MB per PDF en één actieve render per serverproces. Geen productie-uitrol.

## Aanvulling 8 september 2026 — fase 6, offerteconcepten en finalisatie

Toegevoegd: offerteformulier met klant-/adresgegevens, datum/geldigheid, voorwaarden, maximaal 200 posten, handmatige prijzen en materiaalkeuzebronnen. EUR-bedragen gebruiken decimal.js met geïsoleerde precisie 40: hoeveelheid × eenheidsprijs × (1 − korting/100), netto per regel op centen ROUND_HALF_UP, daarna belasting over de som per categorie op centen. Negatieve eenheidsprijzen zijn correcties, hoeveelheden zijn niet-negatief. Belastingtarieven zijn per categorie instelbaar. Lege concepten zijn toegestaan, lege finalisatie niet.

Migration 0010_quotes bewaart immutable concept-/definitieve snapshots onder FORCE RLS. Elke write vereist owner/admin/finance, projectcontext, baseVersion en een herhaalbaar requestId. Finalisatie en jaar-/organisatienummering zijn één transactie; definitieve versies weigeren wijzigingen. Materialen bewaren entry-/version-ID, onbekende/vreemde bronnen worden afgewezen, dubbele materiaalbronnen geweigerd. Verschillen zijn opvraagbaar; verouderde bronnen blokkeren finalisatie. Finalisatie neemt dezelfde materiaal-publicatielock zodat een wijziging niet tussen controle en commit kan vallen. Er wordt geen verzending of klantacceptatie gefingeerd.

Lokale verificatie op Windows, 8 september:
- TypeScript strict geslaagd; Vite-productiebuild met `--configLoader runner` geslaagd (9,49 s). Bekende grote chunks blijven bestaan.
- Vier nieuwe rekentests geslaagd; bredere run: 31 geslaagd, één bestaande opslagtest faalde bij het aanmaken van een symlink (Windows EPERM). Geen geslaagde volledige suite geclaimd.
- Vier nieuwe echte PostgreSQL/API-tests en een browserroute toegevoegd. Lokale database-start blokkeert vóór de tests door `uv_os_get_passwd returned ENOMEM` in embedded-postgres. Deze integratie- en E2E-tests zijn dus nog niet geslaagd.
- Afzonderlijke Chrome-schermproef met expliciet gemockte API geslaagd: komma-invoer, totaal 54,44 EUR, concept bewaren, desktop 1440×1000 en mobiel 390×844 zonder horizontale overflow of page errors. Screenshots daadwerkelijk bekeken: velden en acties leesbaar, formulier scrollt binnen het venster. Dit is UI-bewijs met fictieve data, geen bewijs van echte opslag/finalisatie.
- De normale configbundler kreeg een Windows-maptoegangsfout; Vite/Vitest runner-configloader werkt. Tijdelijke PostgreSQL-map gebruikt nu os.tmpdir(); Unix-socketflags worden op Windows weggelaten. De gepinde Windows-PostgreSQL-build is toegevoegd aan de bestaande allowBuilds-lijst. Geen dependencyversies gewijzigd.

Linux-CI op commit a27a69b: build geslaagd (6,40 s); **57 tests / 12 bestanden geslaagd (15,62 s)**, inclusief de vier nieuwe echte PostgreSQL/API-tests. De offertebrowserroute is geslaagd (3,3 s), vijf van zes browserroutes slagen. De bestaande uitnodigingsroute faalt bij de gastlogin na de extra offertelogin. De offertest is daarom verplaatst naar de bestaande suite en hergebruikt de eigenaarsessie; geen productie-loginlimiet aangepast. Herhaling van de volledige browsersuite staat nog open. De dependency-audit is in deze CI-run overgeslagen na de browserfout.

Fase 6 is niet afgerond. Eerstvolgend: volledige browsersuite na sessiehergebruik bevestigen. Daarna offerte-PDF vanuit dezelfde snapshot/rekenuitvoer, immutable presentatiebijlagen (afhankelijk van fase 5), vervolgversies, expliciete statusovergangen, ontwerpbronnen en catalogusprijsversies. Deze stap kent alleen concept en definitief; geen verzonden/acceptatieclaim. Geen productie-uitrol.

Bijgewerkt: 6 september 2026. Release 0.0.1 is een ontwikkelbasis, geen productieversie.

## Fase 0 — verticale basis en risicoproeven getoetst

Werkend en getoetst:
- React/Vite-ontwerpstudio met login, projectoverzicht, nieuw project, opt-in fictieve woonkamer, Konva-plan, objectlijst, numerieke meubeltransforms, undo/redo en SVG-download.
- Canoniek scene-schema v1 met gehele mm, 2D/3D-assenconversie, schuine muren en aan muren gekoppelde openingen. Pure commandobatches valideren het eindresultaat.
- Fastify /api/v1, Better Auth met Drizzle, PostgreSQL 18.4, afzonderlijke runtime-/identity-roles. SQL-migrations met hashcontrole en advisory lock.
- Werkruimtegebonden projecten, schrijflease met heartbeat, transactionele revisiecontrole, command receipts, onveranderlijke benoemde revisies en auditbasis.
- Private lokale opslagadapter met opaque IDs, groottecontrole, atomisch schrijven, symlink-/traversalafwijzing.

Uitgevoerde verificatie op 6 september 2026, macOS arm64, Node 22.23.1:
- TypeScript strict en Vite-productiebuild geslaagd om 08:51. Vite meldt grote chunks (~804 kB hoofdscherm, ~910 kB lazy 3D, ongecomprimeerd); verdere splitsing blijft open. Typecheck na de database-startcontrole opnieuw geslaagd.
- Volledige Vitest-run: **24 tests / 6 bestanden geslaagd**, 6,06 s om 08:51. Daarna database-startcontrole toegevoegd: **9 integratietests geslaagd**, 1,67 s om 08:53, inclusief ontbrekende/gewijzigde/nieuwere migrations. Samen 25 bestaande en nieuwe getoetste tests; geen volledige 25-test-run geclaimd.
- Browserrun: **3 tests geslaagd**, 8,9 s. Login → project → 2400 mm bank → draaien → undo → verplaatsen → herladen → SVG → zichtbare 3D; telefoon/tablet zonder horizontale overflow; uitnodiging → nieuw account → viewer-rechten; belastingproef met 500 objecten en 100 muren.
- Belastingproef: 81 samples, mediaan 16,7 ms, p95 17,1 ms, max 17,6 ms in Chromium 151.0.7922.34 tijdens 25 afzonderlijke panacties. De oorspronkelijke proef faalde: per-object vervaagde schaduwen veroorzaakten ~3 s per panactie. Schaduwen verwijderd en muisupdates beperkt tot een actieve muurpreview. Proef nu 1,9 s. Geen doorlopende drag-inputlatency, geen referentielaptop- of universele 30-fps-certificering.
- Linux Chromium-proef geslaagd op arm64 onder Colima: één PDF-pagina in 67 ms, 1 CPU / 1 GiB, non-root, read-only rootfs, netwerkloos, capabilities verwijderd, sandbox aan en gecontroleerd seccompprofiel. Image met digest gepind in Dockerfile en release-manifest. Geen GPU vereist.
- PDF-vectorcontrole opnieuw geslaagd: 5 m-lijn bij 1:50 meet 99,9983 mm. A4-box 297,0107 × 209,8887 mm; lijntolerantie 0,01 mm, afzonderlijke papierbox-tolerantie 0,2 mm wegens Chromium-kwantisatie. Geen 10-pagina-exportbenchmark.
- Telefoonscreenshot, werkelijke 3D-render en PDF-pagina visueel geïnspecteerd: geen lege render of horizontale telefoonoverflow. 3D-vloer en meubels blijven geometrische placeholders; schuine muurjoins zijn niet af.
- Eerdere dependency-audit 5 september: 0 gerapporteerde kwetsbaarheden. Geen nieuwe audit geclaimd na toevoeging Prettier. Geen volledige securityrelease-gate.

Omgeving:
- De eerste sandbox verbood PostgreSQL shared memory en Chromium Mach ports. Daarna zijn expliciet toegestane escalaties gebruikt voor de testprocessen.
- Colima-start op 5 september werd automatisch afgewezen vanwege gebruikslimiet. Op 6 september na hervatting opnieuw toegestaan en succesvol gestart. Bestaande Colima VM: 4 CPU, 4 GiB, arm64. Geen Hyper-V-test gedaan.

## Fase 1 — gedeeltelijk, niet afgerond

Projectbeheer/auth/RLS/audit/private adapter zijn aanwezig. Eerste-eigenaarsetup is transactioneel en tegen concurrente setup beschermd; echte PostgreSQL-restart behoudt data. Uitnodigingen zijn eenmalig, gehasht, 48 uur geldig en intrekbaar. Beheerdersrechten en identiteit worden opnieuw gecontroleerd. MFA heeft TOTP en eenmalige herstelcodes; HTTPS-domeinroutes vereisen MFA. Database-startcontrole weigert ontbrekende, gewijzigde en nieuwere migrationhistorie zonder zelf migrations uit te voeren.

CI, gepind release-manifest en inventaris van 36 directe package-licenties aanwezig. CI is op 7 september voor het eerst extern uitgevoerd op ubuntu-24.04 en volledig geslaagd (zie de aanvulling onderaan); de native/transitieve licentie-inventaris is nog niet compleet. Ontwikkelsnelstart in README. De Linux-container is alleen een renderproef.

Open: account recovery/password reset, expliciete projectmembership, volledige rechtenmatrix, productie-Compose/installatie, assetroutes/S3, operationele back-up/restore. Geen productiegeschiktheidsclaim.

## Fase 2 — gedeeltelijke proef, niet afgerond

Muren/openingen/items/commands aanwezig. **Deze alinea is bijgewerkt op 10 september 2026;** de aanvullingen onderaan dit document zijn leidend voor wat er sindsdien bij is gekomen. Inmiddels wel aanwezig en getoetst: versneden muurhoeken, netto ruimteoppervlakken, meervoudige selectie met sleepkader, groeperen, lagen met vergrendelen/verbergen/volgorde, maatlijnen en notities, een ingemeten onderlegger die te verplaatsen en te draaien is, en opt-in lokaal herstel via IndexedDB. Nog open in fase 2: **PDF-pagina als onderlegger**, **EXIF-metadata verwijderen** en **veilig dupliceren naar een variant bij een conflict** — bij een conflict blijft het lokale werk behouden en kan het worden geexporteerd of weggegooid, maar er is nog geen knop die er een aparte variant van maakt. Schrijflease hervat na herladen direct via sessionStorage + Web Locks. Een gedupliceerde tab met gekopieerde sessionStorage krijgt geen schrijfrechten. Zonder Web Locks blijft de veilige terugval met maximaal 45 s wachttijd bestaan. RestoreContent is een interne proefcommand en moet naar expliciete revisie-/undo-semantiek voor release.

## Fasen 3–10 — niet afgerond

Volledige symbolenbibliotheek/GLB-import, keuzes/hoeveelheden/LED, presentatie/PPTX/queue/shares, offertes, volledige 3D, AI, beheer/backup/restore/migratie en definitieve handleidingen ontbreken. Lege moduledirectories betekenen geen implementatie. Frontend toont geen fictief werkende knoppen voor deze modules.

## Eerstvolgende stap

1. Werk foundation af met productiecontainers, configuratievalidatie, projectrechten en geteste installatie/herstelprocedure; laat de ontbrekende queue niet als werkende worker zien.
2. Breid leaseherstel uit met tests voor overname na tabsluiting en browsers zonder Web Locks; synchroniseer de nieuwste scene vóór bewerken na overname.
3. Bouw geometrie fase 2 verder: joins en ruimte-extractie, daarna lokale recovery en uitgebreid revisiebeheer. Numerieke muur-/openingmaten zijn nu beschikbaar.

Gebruik deze code en resultaten bij hervatten; herhaal geslaagde controles alleen na relevante wijzigingen. De oorspronkelijke eisen blijven leidend. Fasen 1–10 zijn niet afgerond.

## Aanvulling — lease hervatten na herladen

De editor bewaart per organisatie/variant een lease-ID in sessionStorage, uitsluitend wanneer Web Locks beschikbaar zijn. De browserlock voorkomt dat een gedupliceerde tab dezelfde serverlease gebruikt. De server blijft gebruiker, organisatie, expiry en revisie controleren. Zonder browserlock wordt geen opgeslagen lease hergebruikt. Een aparte leasemelding verdwijnt na succesvol verkrijgen, zonder fouten van mislukte commands weg te wissen.

Uitgevoerd: drie browserroutes geslaagd in 10,6 s, inclusief direct transformeren en opslaan na herladen, window.open met gekopieerde sessionStorage in leesmodus en undo in de oorspronkelijke tab. Geen wijzigingen aan databasecontract of migrations. Overname na sluiting van de oorspronkelijke tab blijft een afzonderlijk open testscenario.

Laatste controle na afzonderlijke leasemelding: editorbrowserroute geslaagd (3,0 s; run 6,6 s). TypeScript strict en Vite-productiebuild daarna geslaagd. Bestaande chunkgroottewaarschuwing blijft open.

## Aanvulling — numerieke muur- en openingeditor

Muren hebben maatvelden voor beide eindpunten, dikte en hoogte. De actuele lengte wordt getoond. Gedeelde eindpunten blijven gedeeld; het paneel legt uit dat aansluitende muren meebewegen. Deuren en ramen hebben breedte, hoogte en afstand langs de muur; ramen bovendien borstwering. Het commandocontract voegt ResizeWall en ResizeOpening toe, met begrensde gehele millimeters en bestaande eindvalidatie van de volledige transactie. Undo en serverrevisies gebruiken dezelfde route als meubelwijzigingen. De draairichting van deuren is nog geen instelling in dit paneel.

Verificatie 6 september 09:03–09:04: TypeScript strict geslaagd. Volledige Vitest-run 26 tests / 6 bestanden geslaagd (6,27 s); daarna aanvullende gedeelde-knooptest plus alle geometrietests geslaagd (10 tests, 241 ms). Nieuwe browserroute geslaagd (1,5 s; run 7,7 s): muur aanpassen, raam aanpassen, ongeldige opening afwijzen, undo, herladen en bewaarde muurmaten controleren. Screenshot outputs/qa/muurmaten.png daadwerkelijk geïnspecteerd: maatvelden en actie zichtbaar zonder overlap op 1440×1000. Nog geen volledige fase-2-exit: joins, ruimtes, lagen en revisieherstel ontbreken.

Vite-productiebuild na de maatpaneeluitbreiding geslaagd in 2,22 s; bestaande chunkgroottewaarschuwing blijft open.

## Aanvulling — versiegeschiedenis en veilig revisieherstel

De editor toont de laatste 100 bewaarde revisies met datum en revisienummer. Herstel vraagt een concrete bevestiging in de app. De nieuwe RestoreRevision-opdracht verwijst naar een serverrevisie van dezelfde organisatie en ontwerpvariant. De server bewaart de huidige scene als onveranderlijke voorganger in dezelfde transactie, herstelt alleen de inhoud en verhoogt de actuele revisie. Lease-, rol-, conflict- en command-ID-controles blijven gelden; een retry maakt geen tweede voorganger. Fouten rollen ook de voorganger en auditregel terug. De client gebruikt de bestaande pending/retry/herstelbestand-route, zonder zelf een serverrevisie als waarheid aan te leveren.

Verificatie 6 september 09:08: TypeScript strict geslaagd; 10 integratietests geslaagd in 1,89 s, inclusief herstel, voorganger, retry, conflict, viewer-afwijzing en andere-organisatie-afwijzing. Uitgebreide browserroute geslaagd (2,0 s; run 7,5 s): versie bewaren, muur wijzigen, gekozen versie herstellen en automatische voorganger bekijken. Dialogscreenshot outputs/qa/versiegeschiedenis.png daadwerkelijk geïnspecteerd: naam, uitleg en bevestiging leesbaar en zonder overlap.

Beperkingen: geschiedenis toont maximaal 100 recente snapshots; nog geen paginering, visuele vergelijking of eigen revisienaam in de UI. De bestaande RestoreContent voor lokale undo blijft een afzonderlijk te verfijnen contract. Volledige fase 2 is niet afgerond.

De volledige browserrun signaleerde eerst HTTP 429 door vier snelle aanmeldingen vanaf één test-IP. De aanvullende ontwerptest hergebruikt nu de eerder via de UI verkregen eigenaarsessie; de app-rate-limit is ongewijzigd. Een volgende run liep vast op de door macOS uitgeladen apps/web/vite.config.ts (compressed,dataless). Exacte HEAD-versie hersteld, oude placeholder bewaard onder work/cloud-placeholders. Typecheck daarna geslaagd. Productiebuild vóór deze testaanpassing geslaagd in 2,32 s.

Laatste volledige browserrun na bestandsherstel: **4 tests geslaagd, 53,5 s**, inclusief versieherstel en automatische voorganger. Eerste route duurde 21,6 s tijdens lokale bestandsvertraging; overige routes 1,1 / 1,7 / 1,6 s. Geen functionele browserfouten overgebleven in deze run.

## Aanvulling — ruimtes, 3D-vloeren en ontwerpvarianten

Ruimteherkenning detecteert begrensde vlakken in het muurpuntnetwerk. Open vertakkingen tellen niet als kamer. Aangrenzende kamers worden afzonderlijk herkend; geneste contouren hebben gaten zodat oppervlak niet dubbel telt. Kruisende, overlappende of los rakende muren leveren een zichtbare melding en geen berekende kamers. De bewaarde geometrie wordt niet automatisch gesplitst of gewijzigd. De getoonde m² lopen tot de muurhartlijn, uitdrukkelijk geen netto vloer- of bestelhoeveelheid. 3D-vloeren worden vanuit dezelfde contouren getrianguleerd; de oude vaste rechthoek is verwijderd. Demokamer: 29,04 m².

Ontwerpvarianten kunnen worden bekeken, gekopieerd en geopend binnen één project. Kopieën krijgen nieuwe node-/wall-/opening-/item-/floor-IDs en revisie 0; oorspronkelijke revisiegeschiedenis wordt niet gekopieerd. Copy controleert rol, organisatie en actuele bronrevisie. Migration 0006_variant_copies bewaart herhaalmetadata onder FORCE RLS. Gelijktijdige identieke verzoeken leveren één kopie; gewijzigd verzoek met hetzelfde ID wordt geweigerd. Projectoverzicht toont één kaart met voorkeur voor de oorspronkelijke variant. Per project maximaal 100 varianten. De editor remount bij variantwissel zodat lease, selectie en lokale geschiedenis gescheiden blijven. De breadcrumb toont de huidige variantnaam.

Verificatie 6 september 09:25–09:31:
- Vijf nieuwe ruimtetests slagen, inclusief 500 gegenereerde rechthoeken/translaties, schuine kamer, aangrenzende kamers, open vertakkingen, geneste contouren en ongeldige kruisingen/overlap.
- Volledige Vitest-run **34 tests / 7 bestanden geslaagd, 6,47 s**. Inclusief gelijktijdige kopieverzoeken, herhaalveiligheid, tenant-/viewerafwijzing, nieuwe referenties en onafhankelijke kopiegeometrie.
- Volledige browserrun **4 geslaagd, 11,6 s**. Inclusief 29,04 m², zichtbare 3D, variant maken, maat wijzigen, terugwisselen en ongewijzigde basismuur controleren.
- De eerste browserrun vond een ontwikkelserver-reload bij eerste 3D-import. Explicit optimizeDeps voor Three/R3F/OrbitControls voorkomt die reload; volledige herhaling daarna geslaagd. De bijbehorende extra loginlimietfout verdween eveneens toen de eerste route niet meer faalde en sessiehergebruik behouden bleef.
- 3D-screenshot visueel geïnspecteerd: vloer volgt de schuine contour; geen uitstekende rechthoek. Objecten blijven parametrische blokken, muurjoins hebben nog naden.

Open bij deze modules: netto contour-offsets, muurjoins, automatisch splitsen bij T-/kruispunten, benoemde persistente ruimtes, variant hernoemen/archiveren/vergelijken en kopie van lokale conflictdata. Deze toevoegingen ronden fase 2 of de complete app niet af. Productie-installatie, volledige bibliotheek/materialen/licht/offertes/presentatie/AI/backup blijven open conform masterprompt.

Laatste afwerking: TypeScript strict en Vite-productiebuild geslaagd (2,19 s). Extra browsercontrole van de huidige variantnaam geslaagd (2,5 s; run 5,9 s). Grote JS-chunks blijven een bekende optimalisatie; geen nieuwe production-readinessclaim. Release-manifest bijgewerkt naar zes migrations.

## Aanvulling — eigen meubelbibliotheek met immutable versies

Eigen banken, tafels, kasten en lichtpunten zijn te bewaren met naam, kleur en vaste breedte/diepte/hoogte. De lijst toont de nieuwste versie per item en heeft paginering per 50. Een nieuwe versie behoudt de eerdere versies. Plaatsen gebruikt een serveropdracht PlaceLibraryItem; de server haalt de geautoriseerde immutable versie op en kopieert de maten en versieherkomst in de scene. Bestaande plaatsingen veranderen niet bij een nieuwe publicatie. Gekoppelde referenties worden bij commands opnieuw gecontroleerd; van bibliotheekmaten afwijken vereist maatwerk. Onbekende of andere-organisatie-versies worden geweigerd.

Migration 0007_library_versions voegt de immutable tabel met FORCE RLS en alleen SELECT/INSERT voor runtime toe. Publicatie vereist een schrijvende rol, vergelijkt baseVersion, serialiseert gelijktijdige publicaties en herkent identieke retries. Bibliotheekinhoud wordt niet publiek aangeboden. Scene v1 krijgt een optionele libraryRef; bestaande scenes zonder verwijzing blijven geldig binnen deze ontwikkelrelease.

Verificatie 6 september 09:42: **35 tests / 7 bestanden geslaagd, 7,20 s**. **4 browserroutes geslaagd, 14,0 s**. Getoetst: item maken, versie 1 van 2400 mm plaatsen, versie 2 van 3000 mm bewaren en na herladen de bestaande plaatsing op 2400 mm / versie 1 aantreffen. Daarnaast echte DB-tests op immutable permissions, tenantisolatie, viewer-afwijzing, concurrente retries, versieconflict en afwijzing van een vreemde bibliotheekverwijzing. Bibliotheekscreenshot outputs/qa/meubelbibliotheek.png visueel geïnspecteerd: naam, maten, versie en acties leesbaar zonder clipping.

Nog open voor fase 3: symbol builder, categorieën/zoeken, leverancier-/SKU-/licentiegegevens, afgeleide custom-symbolen, GLB-import en uploadvalidatie, thumbnails, archiveren en upgrade-preview van geplaatste versies. Huidige items zijn parametrische placeholders; er wordt geen modelimport gesimuleerd. Productie-installatie en fasen 4–10 blijven open.

Afwerking bibliotheek: ongeldige maat 0 mm in de browser afgewezen en daarna gecorrigeerd naar 2400 mm zonder formulierverlies; aanvullende route geslaagd (3,5 s; run 6,9 s). Laatste typecheck en productiebuild geslaagd (2,23 s), bekende chunkgroottewaarschuwing blijft open. Release-manifest bevat nu zeven migrations.

## Aanvulling — eigen 2D-symbolen

Eigen bibliotheekitems kunnen nu uit maximaal 32 rechthoeken, ellipsen en lijnen worden opgebouwd. De editor gebruikt begrensde percentages binnen het meubel; een gedeelde omzetting naar lokale millimeters voedt Konva en SVG-export. Oude items zonder symbol blijven geldig. Symboolvormen worden als snapshot in bibliotheekversies en plaatsingen bewaard; 3D blijft een parametrische blokvorm.

Verificatie 6 september: **38 tests / 8 bestanden geslaagd (6,58 s)**. **4 browserroutes geslaagd (13,4 s)**. TypeScript strict en productiebuild geslaagd (2,48 s). De visuele controle ontdekte dat vormvelden niet betrouwbaar initialiseerden; dit is hersteld met direct van de geselecteerde vorm afgeleide veldwaarden. De browsertest controleert nu expliciet de toegepaste rechthoekbreedte van 1680 mm, ellipsstraal van 360 mm, versiebehoud na herladen en dezelfde exacte SVG-vectorafmetingen. Screenshot outputs/qa/symboleneditor.png visueel gecontroleerd: preview toont de aangepaste rechthoek en kleinere ellips.

Omgeving: iCloud had bronbestanden en dependencies uitgeladen. De projectmap staat op Bewaar download; de broncode is veiliggesteld. Verificatie is afgerond in een tijdelijke kopie buiten iCloud met dezelfde lockfile en bronbestanden; alle 282 dependencies kwamen uit de lokale pnpm-cache. Algemene iCloud-instellingen zijn niet gewijzigd. Geen productie-uitrol uitgevoerd.

Nog open: polyline/boog/paden, symbolische papiermaat voor elektra, vrije manipulatie van vormen, GLB-import, materiaal- en lichtbibliotheek en de overige fase-3-eisen. Dit rondt de complete app of fase 3 niet af. Bekende grote JavaScript-chunks blijven een optimalisatiepunt.

## Aanvulling — bibliotheek zoeken en productgegevens

Eigen items hebben optionele categorie, omschrijving, maximaal 20 zoektermen, leverancier en artikelnummer. Deze begrensde gegevens worden in iedere immutable bibliotheekversie en plaatsing bewaard. Het eigenschappenpaneel toont de opgeslagen gegevens. Oudere items zonder catalog blijven geldig; er is geen nieuwe database-migration nodig.

Zoeken gebeurt op de server binnen de organisatie, hoofdletterongevoelig en als letterlijke deeltekst. Het categoriefilter vergelijkt de volledige naam. De selectie van de nieuwste versies gebeurt vóór filtering en paginering (50 per pagina), zodat oude artikelgegevens niet als actueel zoekresultaat terugkomen. Nieuwe zoekopdrachten starten op pagina 1; vervolgpaginering behoudt de filters.

Verificatie: **39 tests / 8 bestanden geslaagd (6,76 s)**, inclusief 51-item paginering, een unieke zoekterm op item 51, letterlijke procent-/underscoretekens, tenantisolatie, te lange zoekopdrachten en oorspronkelijk artikelnummer na nieuwe publicatie. **Vier browserroutes geslaagd (13,8 s)**: lege resultaten, zoeken via zoekterm/categorie, gegevens opnieuw bewerken en opgeslagen productinformatie na herladen. TypeScript strict en productiebuild geslaagd (2,56 s). Screenshot outputs/qa/bibliotheek-zoeken.png visueel gecontroleerd: zoekvelden, categorie, productgegevens en acties zijn leesbaar.

Open: prijsbron, rechtenmetadata/exportrechten, anker en schaalmodi, archiveren, GLB/uploadpipeline en overige fase-3-eisen. De volledige fase is nog niet afgerond. Testkopie buiten iCloud gebruikt; geen productie-uitrol.

Laatste controle: terugkeren uit de item-editor behoudt zoekterm en categorie; aanvullende browserroute geslaagd (4,6 s; run 8,2 s).

## Aanvulling — lokale GLB-controle en preview

De eigen bibliotheek heeft een lokale GLB-inspectie met draaibare preview en geometrisch berekende breedte/diepte/hoogte. De worker leest een beperkt GLB 2.0-profiel zelf en geeft alleen numerieke driehoeken door aan de renderer; geen raw-documentloader, URI-resolutie, materiaal- of afbeeldingsdecoders. Ondersteund: TRIANGLES, FLOAT VEC3-posities, unsigned indices, strides, nodehiërarchie en affine matrix/TRS-transformaties. Geometrie wordt gecentreerd en op y=0 geplaatst voor de preview; maten zijn in mm uit glTF-meters.

Limieten: 10 MiB bestand, 1 MiB JSON, 50.000 JSON-elementen, diepte 32, maximaal 256 nodes, 128 meshes/primitives per mesh en 100.000 uitgeklapte driehoeken. Buffer- en accessorbereiken, uitlijning, indexgrenzen, eindige coördinaten, sceneverwijzingen en cycli worden gecontroleerd. Een browserworker wordt na 15 s beëindigd; een nieuw bestand of sluiten beëindigt de eerdere controle. Onbekende/niet-ondersteunde textures, animaties, morphs, sparse accessors, extensies en URI's worden afgewezen. Materiaalkleuren worden bewust niet overgenomen; de interface vermeldt dit. Dit is geen algemene conformiteitsvalidator en geen server-side uploadbeveiliging.

Verificatie: **45 tests / 9 bestanden geslaagd (7,04 s)**; eigen tetraëderfixture, getransformeerde maten, indexbuffer, afgeknotte/corrupte chunks, niet-eindige waarden, rangefouten, externe bronnen, compressie, cycli en geometrie-expansie. **Vier browserroutes geslaagd (15,3 s)**, aanvullende GLB-route met echt render-frame geslaagd (5,4 s; run 8,9 s). TypeScript strict en productiebuild geslaagd (2,63 s). Bekende grote chunks blijven open. Specificatie geraadpleegd: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html . Testgeometrie is eigen werk zonder externe assets.

**Nog open voor echte modelimport:** geauthenticeerde upload met quota, tijdelijke serveropslag/quarantaine, begrensde serverworker en hercontrole, hash/status, assetrechten, bevestigen van werkelijke maat/oriëntatie, koppeling aan immutable bibliotheekversies en persistent renderen in project-3D. De huidige preview wordt niet opgeslagen; dit staat expliciet in de interface. Fase 3 is niet afgerond.

Visuele afwerking: camerakadering vergroot, screenshot outputs/qa/glb-controle.png geïnspecteerd; eigen geometrie en maatrapport zichtbaar. Laatste browserroute geslaagd (5,2 s; run 8,6 s).

## Aanvulling — modelopslag en blijvende 3D-plaatsingen

De GLB-preview heeft nu de actie Model bewaren en meubel maken na expliciete controle van maten en oriëntatie. De server autoriseert vóór het lezen van de upload, begrenst de body tot 10 MiB en controleert opnieuw in een aparte Node-worker (15 s, V8-heaplimiet 128 MiB, maximaal twee gelijktijdig per proces). Input blijft tijdelijk in privégeheugen; alleen goedgekeurde numerieke geometrie komt in de database. De oorspronkelijke GLB, URIs en materialen worden niet opgeslagen. Dit is een begrensde synchrone geometriepipeline, geen algemene upload-/texturedecoder of OS-sandbox.

Migration 0008_model_assets voegt een immutable tabel toe met FORCE RLS, SELECT/INSERT voor runtime, hash, bronbudget, geometrie en afmetingen. Uploads zijn idempotent per UUID en inhoudshash. Per werkruimte geldt een geserialiseerd budget van 100 modellen en 200 MiB (bronbudget plus geometrie); een conservatieve maximale uitvoerreservering voorkomt overschrijding. Afwijzingen laten geen asset achter. De downloadroute geeft uitsluitend goedgekeurde little-endian Float32-driehoeken aan geauthenticeerde leden van dezelfde werkruimte, met no-store/nosniff. Publicatie en scenecommands controleren modelverwijzingen en bijbehorende maten server-side.

Bibliotheekversies bewaren een vaste assetverwijzing. Geplaatste items behouden deze snapshot; project-3D haalt de geometrie op en schaalt de echte bounding box naar de opgeslagen meubelmaten. Maximaal 500.000 unieke én geplaatste modeldriehoeken worden getoond. Ontbrekende/nog ladende/te zware modellen krijgen een expliciet gemelde blokvorm. Geometrie wordt gedeeld per asset en opgeruimd wanneer de viewer sluit of de assetset verandert. Neutrale meubelkleur, geen originele GLB-materialen.

Verificatie: **46 tests / 9 bestanden geslaagd (7,60 s)**. Echte serverworker en PostgreSQL getoetst op upload, idempotentie, gewijzigd bestand onder dezelfde ID, externe bronafwijzing, viewerrechten, tenantisolatie, metadatafraude, immutable permissions en quota. **Vier browserroutes geslaagd (16,4 s)**, inclusief bevestigen/uploaden, bibliotheekitem bewaren, plaatsen, herladen en geïmporteerde geometrie in project-3D. Screenshot outputs/qa/glb-opgeslagen-3d.png visueel gecontroleerd: eigen tetraëder is zichtbaar in de ruimte. TypeScript strict en productiebuild geslaagd (3,17 s); release-manifest bevat acht migrations. Geen productie-uitrol uitgevoerd.

Open: textures/materialen/compressie, assetlicenties/exportrechten, modelvervanging in bestaande bibliotheekitems, archiveren/opruimen van ongebruikte uploads, opslag via Local/S3-provider, duurzame asynchrone quarantainestatus en geïsoleerde productieworkers. Deze ontwikkelstap bewaart kleine modellen rechtstreeks in PostgreSQL en vereist de huidige tsx-runtime. De volledige fase 3 en productie-installatie blijven open.

Aanvullende browsercontrole: GLB-bibliotheekversie wijzigen van 2000 naar 2200 mm behoudt de eerdere plaatsing op 2000 mm na herladen. Geslaagd (7,7 s; run 11,1 s).

## Aanvulling — materiaalkeuzes per project

Een project heeft nu een materiaalkeuzelijst, gedeeld over ontwerpvarianten. Velden: naam, vrije categorie met suggesties, ruimte/oppervlak, leverancier, collectie, SKU, kleurcode, eenheid, optionele handmatige hoeveelheid met verplichte onderbouwing, keuzestatus en notities. Lege hoeveelheid blijft onbekend; nul wordt niet stilzwijgend ingevuld. Decimale hoeveelheden blijven begrensde decimaalstrings zonder floating-pointafronding. Er is geen automatische hoeveelheidsberekening of geometriekoppeling in deze stap.

Alle zes keuzestatussen zijn beschikbaar. Door klant bevestigd vereist een geldige kalenderdatum en expliciete bronnotitie. De interface noemt dit handmatige registratie en onderscheidt interne keuze van klantakkoord. Andere statussen bevatten geen actuele akkoordvelden; eerdere versies blijven ongewijzigd bewaard.

Migration 0009_material_versions bewaart immutable projectgebonden versies met auteur/tijdstip, inputhash en audit-event. FORCE RLS, projectcontrole, schrijfrechten, idempotente retries, optimistische versiecontrole en maximaal 200 keuzes per project zijn aangesloten. De lijst toont alleen de nieuwste versie per keuze; de volledige geschiedenis wordt nog niet in een aparte UI ontsloten. De editor kan niet met Escape of een klik buiten het venster gesloten worden; bewaren of Annuleren en terug is expliciet.

Verificatie 7 september: **49 tests / 10 bestanden geslaagd (8,74 s)**; onbekend versus onderbouwd aantal, decimale grenzen, kalenderdatums, klantakkoord, tenant-/projectisolatie, viewerrechten, auteursregistratie, concurrente retries, versieconflict en immutable permissions. **Vijf browserroutes geslaagd (21,0 s)**, inclusief materiaal invoeren, validatiemelding, gekozen versus klantbevestigd, bron/datum vastleggen, zoeken en herladen. Screenshot outputs/qa/materiaalkeuzes.png visueel gecontroleerd. TypeScript strict en productiebuild geslaagd (2,76 s), release-manifest bevat negen migrations. De eerdere tijdelijke testkopie was verdwenen; alle controles draaiden nu succesvol rechtstreeks in de projectmap.

Open voor de volledige materialenmodule: alternatieven en gekozen alternatief, prijsbron/-datum, texturen, afzonderlijke monsterstatus, formule-inputs/netto/snijverlies/bestelmaat, bronrevisie en verouderingsmelding, gordijnberekeningen, koppeling naar offertes/2D/3D/presentaties en geschiedenis-UI. De overige open fases blijven ongewijzigd; dit is geen complete fase-4-oplevering.

## Kleine aanvulling — collectie en kleurcode

Collectie en kleurcode zijn nu zichtbaar in de materiaalkeuzelijst en worden hoofdletterongevoelig meegenomen bij zoeken. Lege velden blijven verborgen. TypeScript strict en de gerichte materiaal-browsertest geslaagd (1,7 s; run 5,2 s), inclusief bewaren/herladen en zoeken op beide velden. Geen database- of afhankelijkheidswijzigingen.

## Aanvulling — hoeveelheden berekenen uit de ontwerpgeometrie

Een materiaalkeuze kan zijn hoeveelheid uit het ontwerp halen. De gebruiker kiest een herkende ruimte, een bronmaat (netto vloeroppervlak, netto wandoppervlak, netto omtrek of plintlengte), een snijverliespercentage en een optionele bestelstap. Het formulier toont direct netto, snijverlies, bruto en bestelhoeveelheid met de gebruikte ontwerpversie; de invoervelden houden Nederlandse decimalen vast.

De server rekent bij het bewaren zelf opnieuw. De client stuurt uitsluitend een rekenopdracht; een meegestuurde uitkomst wordt door het contract geweigerd. De server haalt het ontwerpdocument op via een join op `design_variants`, zodat een variant uit een ander project of een andere werkruimte niet bereikbaar is, en legt bronrevisie, tijdstip, alle formule-inputs in millimeters, netto, snijverlies, bruto en bestelhoeveelheid onveranderlijk bij de materiaalversie vast. De eenheid volgt de bronmaat en niet de invoer van de client. Een handmatige afwijking van de berekende bestelhoeveelheid blijft mogelijk maar vereist een onderbouwing; de berekening blijft er naast staan.

De lijst vergelijkt iedere berekende keuze met het huidige ontwerp. Wijkt de uitkomst af, dan verschijnt "Verouderd" met de oude en de nieuwe waarde en de actuele ontwerpversie. Voor een niet-overschreven keuze staat er een knop Herberekenen die een nieuwe materiaalversie publiceert; een overschreven keuze wordt bewust niet automatisch teruggezet. Is de bronruimte verdwenen of niet meer meetbaar, dan zegt de melding dat en vraagt om een nieuwe bronkeuze. Oude materiaalversies wijzigen nooit mee.

Nieuwe rekenregels, expliciet gedocumenteerd in `packages/geometry/src/quantities.ts`, omdat ze in offertes doorwerken: de netto contour ligt per muur een halve muurdikte naar binnen; ingesloten ruimtes worden juist een halve muurdikte vergroot en afgetrokken; de netto omtrek telt de buitencontour plus de omtrek van ingesloten ruimtes; de plintlengte is de netto omtrek min de deurbreedtes, ramen onderbreken de plint niet; het wandoppervlak telt per muur netto lengte maal muurhoogte en trekt elke opening volledig af, ook bij een scheidingsmuur. Uitkomsten worden op hele millimeters afgerond; de afrondingstolerantie is maximaal 1 mm per contourpunt. Een contour waarin een rand na het verschuiven omklapt levert geen getal maar een leesbare melding: het oppervlak blijft in dat geval positief, dus die richtingscontrole is de enige betrouwbare. Het afrondingsbeleid van het decimalrekenwerk staat in `packages/domain/src/quantities.ts`: netto en snijverlies op drie decimalen half naar boven, bruto exact opgeteld, bestelhoeveelheid naar boven op de bestelstap.

Daarnaast: iedere `pg`-pool krijgt nu een error-listener (`guardPool`). Zonder die listener beëindigt Node het API-proces zodra PostgreSQL een inactieve verbinding sluit, bijvoorbeeld bij een herstart.

Verificatie 7 september, Linux x64, Node 22.22.2, PostgreSQL 18.4 (embedded):
- **Volledige Vitest-run: 61 tests / 11 bestanden geslaagd, 14,3 s.** Nieuw: 8 geometrie- en decimaaltests en 2 contracttests, plus 2 integratietests tegen echte PostgreSQL.
- De geometrietests dekken netto vloer/omtrek/plint/wandoppervlak, deur versus raam, een ingesloten ruimte, te dikke muren, een open contour, onafhankelijkheid van muurrichting en 200 gegenereerde verschuivingen. Het netto oppervlak van de demoruimte (27.154.275 mm²) en de netto omtrek (20.608 mm) zijn los nagerekend met A(d) = A − P·d + d²·Σcot(hoek/2) bij d = 90 mm; beide komen exact overeen.
- De integratietest toetst tegen echte PostgreSQL: serverberekening en opgeslagen bronrevisie, eenheid uit de bronmaat in plaats van uit de client, onbekende ruimte (409), variant van een ander project (404), variant van een andere werkruimte (404), viewer-afwijzing (403), hoeveelheid zonder onderbouwing (400), onderbouwde afwijking naast de berekening, en na een `ResizeWall` een lagere netto maat met bronrevisie 1.
- Een tweede nieuwe integratietest beëindigt de inactieve runtime- en auth-verbindingen met `pg_terminate_backend` en controleert dat de API blijft werken. Zonder `guardPool` levert dezelfde run 4 onafgevangen fouten op; dat is expliciet nagemeten door de listener tijdelijk te verwijderen.
- **Volledige browserrun: 6 routes geslaagd, 44,1 s**, inclusief de nieuwe route: berekende hoeveelheid vastleggen (netto 27,154 m² + 2,715 m² snijverlies = 29,869 m², bestelstap 0,5 m² → 30 m², ontwerpversie 0), muurdikte naar 400 mm wijzigen, "Verouderd" zien, herberekenen naar ontwerpversie 1 en dat na herladen terugvinden.
- TypeScript strict en Vite-productiebuild geslaagd (7,9 s). De bekende chunkgroottewaarschuwing (879 kB hoofdscherm, 908 kB OrbitControls) blijft open.
- Screenshots `outputs/qa/hoeveelheid-berekenen.png` en `outputs/qa/berekende-hoeveelheden.png` daadwerkelijk geïnspecteerd op 1440×1000. De eerste inspectie liet twee fouten zien: het selectievakje stond los van zijn tekst en een ingetypte "0,5" werd als "0.5" teruggetoond. Beide zijn hersteld en opnieuw visueel gecontroleerd.

Omgeving (afwijkend van eerdere runs op macOS): deze sessie draait als root in een Linux-container. `scripts/local-db.ts` maakt de tijdelijke data- en socketdirectory nu toegankelijk voor de bestaande `postgres`-systeemgebruiker, omdat PostgreSQL niet als root start; `credentials.json` blijft 0600. Op een niet-root ontwikkelmachine verandert die functie niets. De vastgepinde Playwright-versie verwacht een Chromium-build die hier niet staat; `playwright.config.ts` accepteert daarom een expliciete `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Zonder die variabele blijft het gedrag ongewijzigd en downloadt CI zijn eigen browser.

Geen databasemigration nodig: de berekening staat in de bestaande `definition`-JSONB van `material_versions`. Materiaalversies van vóór deze wijziging blijven geldig en worden als handmatig getoond. Het release-manifest blijft op negen migrations.

Open voor de rest van fase 4: alternatieven en gekozen alternatief, prijsbron en prijsdatum, monsterstatus als apart veld, gordijnberekening met railbreedte/plooi/stofbreedte/banen/rapport, benoemde persistente ruimtes in plaats van afgeleide sleutels, hoeveelheden over meerdere ruimtes tegelijk, elektra/LED-lengtes, koppeling naar 2D/3D/presentaties/offertes en een geschiedenis-UI per keuze. De ruimtesleutel is afgeleid van de muurpunten: verplaats je een punt dan blijft de sleutel gelijk, verwijder of splits je een muur dan verdwijnt de bron en vraagt de app om een nieuwe keuze. Fase 4 is hiermee niet afgerond en de overige fasen blijven ongewijzigd open.

### CI voor het eerst extern gedraaid

Op 7 september 19:03–19:05 UTC draaide de workflow *Foundation verification* voor het eerst op een GitHub-runner (ubuntu-24.04, Node 24.18.1, pnpm 11.19.0), op commit `deabc13`. Alle stappen slaagden: `pnpm install --frozen-lockfile`, `playwright install --with-deps chromium`, `pnpm build`, `pnpm test`, `pnpm test:e2e` (42 s) en `pnpm audit --audit-level high`. Daarmee is de eerdere aantekening "CI nog niet extern uitgevoerd" achterhaald. De runner installeert zijn eigen Chromium, dus de nieuwe `PLAYWRIGHT_CHROMIUM_EXECUTABLE`-optie is daar niet actief. Er is nog geen securityscan van containers of secrets; de securityrelease-gate uit fase 9 blijft open.

### Eerstvolgende stap na deze aanvulling

1. Alternatieven per materiaalkeuze met gekozen alternatief, prijsbron en prijsdatum; daarna de gordijnberekening met eigen invoervelden.
2. Benoemde, persistente ruimtes zodat een hoeveelheidsbron een muurwijziging overleeft, inclusief een veilige herkoppeling.
3. Daarna pas fase 5 (presentaties) aanvatten; foundation-onderdelen uit fase 1 (productie-Compose, back-up/herstel) blijven daarvoor nog steeds open.

## Aanvulling — alternatieven, prijsbron en monsterstatus

Een materiaalkeuze heeft nu een prijsbron, een prijsdatum en een eenheidsprijs, een monsterstatus met eigen datum, en een lijst alternatieven. Een alternatief is een volwaardig productvoorstel met eigen naam, leverancier, collectie, artikelnummer, kleurcode, prijsbron, prijsdatum, eenheidsprijs en notitie; maximaal tien per keuze.

Prijsregels zijn bewust streng: een eenheidsprijs zonder bron én datum wordt geweigerd, en een prijsdatum zonder bron ook. Dat geldt voor de gekozen optie en voor elk alternatief. Zo komt er geen bedrag in het systeem waarvan niemand meer weet waar het vandaan komt. De lijst toont een indicatiebedrag (hoeveelheid × eenheidsprijs, `packages/domain/src/pricing.ts`, decimalrekenwerk, half naar boven op hele centen) met daarboven één zin dat dit geen offerteregel is: geen korting, belasting of prijsbevriezing. Het bedrag wordt nergens opgeslagen; het is afgeleid.

Monsterstatus staat los van de keuzestatus, zoals de opdracht vraagt. Elke andere status dan "Geen monster" vereist een datum, en de keuzestatus "Monster aangevraagd" mag niet samengaan met monsterstatus "Geen monster" — dat zou een tegenstrijdige registratie zijn.

Kiezen doe je in de lijst met de knop **Kies <naam>**. Het gekozen alternatief schuift naar de hoofdplek, het eerder gekozen product schuift terug naar de alternatieven, en de nieuwe versie legt vast uit welk alternatief de keuze komt. Auteur en tijdstip van dat besluit staan al in de materiaalversie zelf. **De server controleert die herkomst**: het alternatief moet in de vorige versie hebben gestaan én de gekozen productgegevens moeten daar exact mee overeenkomen. Anders kan een client elke willekeurige herkomst claimen. Gevolg voor de gebruiker: eerst kiezen, daarna aanpassen in een volgende versie; de foutmelding zegt dat ook.

Geen databasemigration: alles staat in de bestaande `definition`-JSONB. Materiaalversies van vóór deze wijziging missen de nieuwe sleutels; `withDefaults` vult die bij het lezen aan zonder de bewaarde versie te wijzigen of te valideren. Zo blijft een oude versie precies zoals hij is opgeslagen.

Verificatie 7 september, Linux x64, Node 22.22.2, PostgreSQL 18.4 (embedded):
- **Volledige Vitest-run: 67 tests / 11 bestanden geslaagd, 14,5 s** (was 61). Nieuw: vijf contracttests over prijsregels, monsterregels, alternatieven, `withDefaults` op een oude definitie en het indicatiebedrag, plus één integratietest tegen echte PostgreSQL.
- Die integratietest toetst: alternatief met prijs bewaren en teruglezen, kiezen op versie 0 geweigerd (409), verzonnen herkomst geweigerd (409), tegelijk de prijs aanpassen geweigerd (409), een andere naam claimen geweigerd (409), geldige promotie geaccepteerd, de omgekeerde alternatievenlijst na promotie, de ongewijzigde versie 1 in de database, en prijs- en monsterregels die het contract afwijst (400).
- **Volledige browserrun: 7 routes geslaagd, 46,3 s**, inclusief de nieuwe route: prijs zonder bron geweigerd, prijsbron/datum/monster invullen, alternatief toevoegen, bewaren, indicatiebedrag € 2.248,50 bij 30 m², alternatief kiezen, herkomst en omgedraaide lijst zien, en na herladen versie 2 terugvinden.
- TypeScript strict en Vite-productiebuild geslaagd (7,2 s). Bekende chunkgroottewaarschuwing blijft open.
- Screenshots `outputs/qa/alternatief-invoeren.png` en `outputs/qa/alternatieven.png` daadwerkelijk geïnspecteerd. De eerste inspectie liet zien dat de foutmelding onder de bewaarknop buiten beeld viel: je drukt op Bewaren en ziet niets gebeuren. De melding staat nu boven de knoppen en is opnieuw visueel gecontroleerd.
- Playwright draait nu met `locale: "nl-NL"` en `timezoneId: "Europe/Amsterdam"`. Geprobeerd en verworpen: `--lang=nl-NL` op Chromium verandert de weergave van `<input type="date">` in deze container niet, dus die vlag is niet blijven staan. Op screenshots uit deze omgeving staat daardoor mm/dd/jjjj waar een Nederlandse browser dd-mm-jjjj toont; dat verschil zit in de testomgeving, niet in de app. Dit is niet op een Nederlandse desktopbrowser nagemeten.

Open voor de rest van fase 4: textuurafbeeldingen bij een materiaal, prijsgeschiedenis en prijsversies (een offerte moet later een prijs bevriezen; nu bewaart elke materiaalversie alleen de prijs van dat moment), de gordijnberekening met railbreedte/plooi/stofbreedte/banen/zoom/rapport, benoemde persistente ruimtes, elektra- en LED-lengtes, en de koppeling naar 2D/3D/presentaties/offertes. Een geschiedenis-UI per keuze ontbreekt nog: de opeenvolgende versies staan wel in de database, maar de lijst toont alleen de nieuwste. Fase 4 is niet afgerond.

### Eerstvolgende stap na deze aanvulling

1. Benoemde, persistente ruimtes zodat een hoeveelheidsbron een muurwijziging overleeft, met een veilige herkoppeling wanneer de contour verandert.
2. Daarna de gordijnberekening met eigen invoervelden en een geschiedenis-UI per materiaalkeuze.
3. Fase 5 (presentaties) blijft daarna aan de beurt; de openstaande fase-1-onderdelen (productie-Compose, back-up/herstel) blijven ongewijzigd open.

## Aanvulling 10 september 2026 — fase 4 en 6 samengevoegd, fase 2 uitgebreid

De offertemodule stond op een tak vanaf `main` en de hoeveelheden- en alternatievenmodule op een andere; beide kenden elkaars werk niet. Ze zijn samengevoegd op één tak. Twee conflicten opgelost: het ontwerpscherm toont nu zowel Materiaalkeuzes met `variantId` als de offerteknop voor owner/admin/finance, en beide sets browserroutes blijven staan. `scripts/local-db.ts` kwam automatisch samen: de Windows-tmpdir en het weglaten van Unix-socketflags blijven naast het draaien onder de postgres-systeemgebruiker als root en de pool-error-listener. Daarmee is ook de openstaande vraag uit de fase 6-notitie beantwoord: de volledige browsersuite slaagt met een hergebruikte eigenaarsessie.

### Vangen aan raster, muurpunten, muren en meubels

De editor kende alleen rasterafronding op 100 mm. `packages/geometry/src/snapping.ts` is een pure functie met een vaste volgorde van voorkeur: muurpunt, muur, object, raster. Muurpunt en muur leggen beide assen vast; object en raster werken per as, zodat de x van een meubel kan komen en de y van het raster. De tolerantie komt binnen in wereldmillimeters — de editor rekent twaalf schermpixels om met de zoomfactor — zodat vangen bij elke zoomstand even ver aanvoelt zonder dat een fysieke maat ooit met de schermzoom vermenigvuldigd wordt. Uitkomsten zijn hele millimeters. Een muur vangt alleen binnen zijn eigen segment; daarbuiten hoort het punt bij het muurpunt. Het gesleepte meubel vangt niet aan zichzelf. Tijdens het slepen tonen gestreepte hulplijnen waarop uitgelijnd wordt. De onderbalk heeft een schakelaar **Vangen aan objecten**, los van het raster.

Daarbij opgelost: de canvasknop **Passend** had een eigen fit-berekening die negatieve coördinaten negeerde, waardoor een plan links of boven de oorsprong buiten beeld bleef. Beide plekken gebruiken nu dezelfde berekening.

### Meervoudige selectie, uitlijnen en gelijk verdelen

`selected` is van één ID naar een lijst gegaan. Shift-, ctrl- of cmd-klikken in de plattegrond of de objectlijst voegt toe of haalt weg. Bij twee of meer meubels verschijnt een paneel met zes uitlijningen en twee verdelingen. `packages/geometry/src/arrange.ts` rekent met de asgerichte omhullende van een gedraaid meubel, dus een bank die 30 graden staat lijnt uit op wat je op het plan ziet. Verdelen maakt de tussenruimten tussen de omhullenden gelijk en laat het eerste en laatste meubel staan; passen ze niet, dan worden de tussenruimten negatief en overlappen ze zichtbaar. Alle verplaatsingen gaan als één batch naar de server en zijn dus één stap terug.

Verificatie 10 september, Linux x64, Node 22.22.2, PostgreSQL 18.4 (embedded):
- **94 tests / 15 bestanden geslaagd, 23,1 s** (was 75 na de merge). Nieuw: elf vangtests en acht uitlijn-/verdeeltests, met 300 respectievelijk 200 gegenereerde gevallen die bewijzen dat de uitkomst altijd hele millimeters is.
- **10 browserroutes geslaagd, 1,2 min.** Twee nieuwe. De vangroute kalibreert zichzelf: zij meet eerst de schaal met een sleep van 120 px en drukt daarna alles in schermpixels uit, zodat zij niet op de fit-formule van de editor leunt. Rasterslepen levert hele honderdtallen, uitlijnen op een ander meubel levert exact hetzelfde hart, en met vangen uit blijft het meubel staan waar het losgelaten wordt. De uitlijnroute controleert gelijke linkerranden, een ongemoeide y-as, één stap terug voor drie meubels tegelijk en gelijke tussenruimten na verdelen.
- TypeScript strict en productiebuild geslaagd (9,7 s). Bekende chunkgroottewaarschuwing blijft open.
- Screenshots `outputs/qa/vangen.png`, `outputs/qa/vanghulplijn.png` en `outputs/qa/uitlijnen.png` daadwerkelijk geïnspecteerd. Twee correcties na inspectie: een sleep van 2 px startte nooit omdat Konva pas vanaf 3 px sleept — de test drukt de afstanden nu in pixels uit; en de zes uitlijnknoppen braken af als 5+1, nu een raster van drie kolommen.

Nog open in fase 2: maatlijnen, annotaties, legenda en meetgereedschap; vergrendelen, laagvolgorde en zichtbaarheid; laagpresets voor inrichting, afwerking, elektra en verlichting; import van rasteronderlegger en PDF-pagina met kalibratie via twee punten; rubberband-selectie op het canvas; groeperen; opt-in lokaal herstel via IndexedDB; toetsenbordsnelkoppelingen. Muurjoins blijven ook open. Fase 2 is daarmee niet afgerond.

## Aanvulling 10 september 2026 — PR's samengevoegd, lagen in de 2D-editor

Beide openstaande PR's zijn afgehandeld. PR #1 is met een merge-commit in `main` gezet (`cb03021`), zodat de commits van `codex/phase-6-quotes` met hun oorspronkelijke auteurschap in de geschiedenis blijven. PR #2 kon daarna niet meer gemerged worden — zijn head is een voorouder van `main` geworden — en is gesloten met uitleg. `main` bevat nu fase 4, fase 6 en de editoruitbreidingen.

### Lagen, vergrendelen, zichtbaarheid en volgorde

Objecten krijgen drie optionele velden: `layer`, `locked` en `hidden`. Optioneel, dus scenes van vóór deze wijziging blijven geldig zonder scene-migratie; ontbreekt de laag, dan telt het object als inrichting. De lagen zijn inrichting, afwerking, elektra, verlichting en technische presentatie — dezelfde indeling die fase 4 nodig heeft voor elektra en licht.

Twee nieuwe opdrachten: `SetItemDisplay` zet laag, vergrendeling of zichtbaarheid voor een groep objecten tegelijk, waarbij alleen meegegeven velden veranderen; `ReorderItems` verschuift de tekenvolgorde. `packages/domain/src/order.ts` is de pure functie daarachter. Bij een meervoudige selectie blijft de onderlinge volgorde intact en schuift de selectie als geheel over precies één niet-geselecteerd object. Bij een onderbroken selectie telt de bovenste respectievelijk onderste, en komt de hele selectie bij elkaar te liggen; dat is voorspelbaarder dan elk object apart verschuiven.

Vergrendeling wordt afgedwongen in `applyOperations`, dus ook wanneer een opdracht niet uit de editor komt: `TransformItem` en `DeleteSelection` op een vergrendeld object leveren een leesbare fout. Ontgrendelen mag altijd. Verborgen objecten worden niet getekend en doen ook niet mee aan het vangen, maar blijven in de objectlijst staan met een oog- en slotpictogram.

Verificatie 10 september, Linux x64, Node 22.22.2, PostgreSQL 18.4 (embedded):
- **104 tests / 17 bestanden geslaagd, 26,5 s** (was 94). Nieuw: zeven volgordetests en drie commandotests voor lagen, vergrendeling en volgorde.
- **11 browserroutes geslaagd, 1,5 min.** De nieuwe route wisselt een meubel van laag, verbergt de laag en controleert dat het object uit beeld is maar in de lijst blijft, vergrendelt de laag, ziet verwijderen afgewezen worden met de servermelding, ontgrendelt, verandert de volgorde en vindt alles terug na herladen.
- TypeScript strict en productiebuild geslaagd (9,8 s). Bekende chunkgroottewaarschuwing blijft open.
- Screenshot `outputs/qa/lagen.png` geïnspecteerd: de laaglijst toont Inrichting 3 en Verlichting 1, het oog van Verlichting is doorgestreept en de salontafel is inderdaad uit het plan verdwenen. De testverwachting moest eerst aangescherpt: "Verlichting" kwam zowel in de laaglijst als in de keuzelijst voor.

Nog open in fase 2: maatlijnen, annotaties, legenda en meetgereedschap; import van rasteronderlegger en PDF-pagina met kalibratie via twee punten; rubberband-selectie op het canvas; groeperen; opt-in lokaal herstel via IndexedDB; toetsenbordsnelkoppelingen; muurjoins. Laagpresets bestaan nu als indeling, maar er is nog geen presetknop die een set lagen in één keer toont of verbergt voor een tekenblad. Fase 2 is niet afgerond.

## Aanvulling 10 september 2026 — meten, maatlijnen en sneltoetsen

### Maatlijnen als eigen objecten

De scene krijgt `annotations`, een lijst met een standaardwaarde van een lege array, zodat bestaande scenes geldig blijven zonder scene-migratie. Voorlopig is er één soort annotatie: een maatlijn met twee punten en een loodrechte verschuiving. **De lengte wordt niet opgeslagen** — die komt uit `packages/geometry/src/dimension.ts` en is dus altijd wat de geometrie zegt; een maatlijn kan nooit iets anders beweren. Een bewaarde maatlijn ligt 400 mm naast de gemeten lijn, aan de linkerzijde van de tekenrichting, met hulplijnen naar de meetpunten. Het label draait mee maar staat nooit op zijn kop.

Het gereedschap **Maat** meet en legt vast in één handeling: na de eerste klik loopt een gestreepte lijn mee met een live afleesbare maat, de tweede klik bewaart de maatlijn. Wil je alleen meten, dan breek je af met Escape. Het vangen werkt hier net zo goed als bij het tekenen, dus meten tussen twee muurpunten geeft exact de muurlengte.

Maatlijnen staan ook op het geëxporteerde planblad; lijndikte en tekstgrootte volgen de schaal en de bladomvang houdt rekening met de verschoven lijn.

Daarbij opgelost: het canvas gaf een klik alleen door wanneer die op leeg vlak viel. Beginnen op een bestaand muurpunt was daardoor onmogelijk — precies wat je wil doen bij meten en bij het aansluiten van een nieuwe muur. Meten en muren tekenen krijgen de klik nu altijd; selecteren blijft aan het gereedschap Selecteren voorbehouden.

### Toetsenbordbediening

`v` selecteren, `m` muur, `d` deur, `r` raam, `t` maat. Escape gaat terug naar selecteren en heft de selectie op, Delete of Backspace verwijdert de selectie, Ctrl/Cmd+Z is een stap terug en met Shift erbij opnieuw. De afhandeling slaat invoervelden over, zodat typen in een maatveld nooit van gereedschap wisselt of iets verwijdert.

Verificatie 10 september, Linux x64, Node 22.22.2, PostgreSQL 18.4 (embedded):
- **111 tests / 18 bestanden geslaagd, 25,1 s** (was 104). Zeven nieuwe maatlijntests, waaronder 300 gegenereerde gevallen die aantonen dat het label nooit op zijn kop staat en de lengte altijd heel is.
- **12 browserroutes geslaagd, 1,5 min.** De nieuwe route kiest het maatgereedschap met een sneltoets, meet tussen twee muurpunten, controleert dat het geëxporteerde planblad **6.200 mm** bevat — de muurlengte uit de geometrie, niet uit de muispositie — verwijdert de maatlijn met Delete en zet dat terug met Ctrl+Z.
- TypeScript strict en productiebuild geslaagd (9,5 s).
- Screenshots `outputs/qa/meten.png` en `outputs/qa/maatlijn.png` geïnspecteerd, plus `outputs/qa/maatblad.png`: het geëxporteerde blad zelf is naar afbeelding gerenderd en bekeken, met hulplijnen en label op de juiste plek. De eerste versie legde de maatlijn precies op de muur; daarom nu de vaste verschuiving van 400 mm.

Onderweg gevonden en hersteld: de nieuwe knop **Maat** maakte de gereedschapsbalk breder dan een tablet van 1024 px, waardoor de hele pagina horizontaal ging schuiven. De balk schuift nu zelf zijwaarts. Die ene fout liet ook twee andere browserroutes omvallen met een verloren sessie; na het herstel slaagt de volledige suite weer in 1,5 minuut. Het precieze mechanisme van die gevolgschade is niet uitgezocht — alleen vastgesteld dat het met de herstelde eerste route verdwijnt.

Nog open in fase 2: annotatieteksten en een legenda naast maatlijnen; het verplaatsen of omklappen van een bestaande maatlijn; import van rasteronderlegger en PDF-pagina met kalibratie via twee punten; rubberband-selectie; groeperen; opt-in lokaal herstel via IndexedDB; laagpresets per tekenblad; muurjoins. Fase 2 is niet afgerond.

## Aanvulling 10 september 2026 — sleepkader en bewerkbare maatlijnen

### Sleepkader

Met het gereedschap Selecteren trek je op leeg vlak een kader; alles wat het kader raakt komt in de selectie. `itemsInRect` in `packages/geometry/src/arrange.ts` werkt op de asgerichte omhullende, dus een gedraaid meubel wordt geraakt op wat je op het plan ziet. Aanraken is genoeg — een object hoeft niet helemaal binnen het kader te liggen — en het kader mag in elke richting getrokken worden. Verborgen objecten doen niet mee. Een klik zonder sleep (minder dan vijf schermpixels) heft de selectie op, zoals eerst. Het kader vangt bewust niet aan raster of objecten; het is een aanwijsactie, geen maat.

### Maatlijnen bijstellen

Een geselecteerde maatlijn krijgt een eigen eigenschappenpaneel met de gemeten lengte, een veld voor de afstand tot de gemeten lijn en een knop **Naar de andere kant**. De lengte staat er alleen ter informatie: die is afgeleid en niet los te bewerken. De nieuwe opdracht `SetAnnotationOffset` verzet alleen de verschuiving.

Twee dingen die daarbij opvielen en zijn hersteld:
- Maatlijnen stonden niet in de objectlijst, terwijl die lijst juist het toegankelijke alternatief voor aanwijzen op het canvas hoort te zijn. Ze staan er nu als **Maat 1**, **Maat 2** enzovoort, en tellen mee in het objectaantal.
- **Passend** keek alleen naar muurpunten. Een maatlijn die buiten de muren ligt — na omklappen bijvoorbeeld — viel daardoor buiten beeld en was niet meer aan te klikken. De berekening neemt nu ook de maatlijnen mee.

Verificatie 10 september, Linux x64, Node 22.22.2, PostgreSQL 18.4 (embedded):
- **113 tests / 18 bestanden geslaagd, 18,6 s** (was 111). Twee nieuwe kadertests, inclusief precies op de rand raken, een kader dat van rechtsonder naar linksboven loopt en een gedraaid meubel.
- **13 browserroutes geslaagd, 1,1 min.** De nieuwe route trekt een kader over de linkerhelft en krijgt twee van de vier meubels, controleert dat een klik zonder sleep de selectie opheft, tekent een maatlijn, verzet die naar 900 mm, klapt hem om naar -900 mm en vindt dat na herladen terug.
- TypeScript strict en productiebuild geslaagd (7,1 s).
- Screenshots `outputs/qa/sleepkader-actief.png`, `outputs/qa/sleepkader.png` en `outputs/qa/maatlijn-omgeklapt.png` geïnspecteerd. De eerste is bewust middenin de sleep gemaakt: zonder die opname zou de test slagen ook als het kader helemaal niet getekend werd, want de selectie komt uit de staat en niet uit de weergave.

Nog open in fase 2: annotatieteksten en een legenda; import van rasteronderlegger en PDF-pagina met kalibratie via twee punten; groeperen; opt-in lokaal herstel via IndexedDB; laagpresets per tekenblad; muurjoins. Fase 2 is niet afgerond.

## Aanvulling 10 september 2026 — onderlegger met tweepuntskalibratie

Een verdieping kan nu een onderlegger hebben: een foto of scan van een bestaande plattegrond om overheen te tekenen. Migration `0011_underlay_assets` bewaart de afbeeldingen per werkruimte onder FORCE RLS met alleen SELECT en INSERT voor de runtime-rol, met een quotum van 50 afbeeldingen of 200 MiB.

**Alleen PNG en JPEG.** SVG en PDF worden geweigerd: dat is actieve inhoud die scripts en externe verwijzingen kan bevatten. De server leest alleen de bestandskop — een eigen parser van enkele tientallen regels in `packages/image-import` — en slaat de bytes ongewijzigd op. Er komt geen beeldbibliotheek aan te pas; de browser decodeert, en die is daarop gehard. Uitleveren gebeurt met een vast content-type dat uit die gelezen kop komt en nooit uit de invoer van de client, met `nosniff` en een restrictieve `Content-Security-Policy`. De afbeelding wordt in de editor met `fetch` opgehaald in plaats van via een `img src`, omdat een `img` geen werkruimte-header kan meesturen; de autorisatie op de route blijft daardoor gelijk aan die van alle andere gegevens. De blob-URL wordt weer vrijgegeven zodra de onderlegger wisselt.

**De schaal wordt niet opgeslagen.** Vastgelegd zijn twee punten in afbeeldingspixels en de werkelijke afstand daartussen; de millimeters per pixel volgen daaruit. Zo blijft de kalibratie navolgbaar. Zonder kalibratie geldt een aangenomen 10 mm per pixel en toont het paneel **nog niet gekalibreerd** met de vraag een bekende maat in te meten — er staat dus nooit een schaal die nergens op stoelt. Doorzichtigheid is instelbaar; de onderlegger ligt in een eigen laag onder de tekening en vangt geen muisacties af.

De keuze voor raster in plaats van PDF staat in `docs/adr/0004-underlay-images.md`, met de gevolgen: wie alleen een PDF heeft moet die zelf omzetten, en EXIF-metadata blijft staan omdat verwijderen opnieuw encoderen vraagt.

Daarbij opgelost: **Passend** keek niet naar de onderlegger, net zoals het eerder niet naar maatlijnen keek. Een onderlegger die groter is dan het plan viel daardoor buiten beeld. Dat kwam aan het licht doordat de browsertest een schaal van 20,8 mm per pixel kreeg in plaats van 12,5: mijn omrekening van scherm naar wereld klopte niet, omdat de app anders inzoomde dan de test aannam.

Verificatie 10 september, Linux x64, Node 22.22.2, PostgreSQL 18.4 (embedded):
- **124 tests / 21 bestanden geslaagd, 19,2 s** (was 113). Vijf kopleestests met een in de test zelf gemaakt geldig PNG en JPEG, inclusief afgekapte en misvormde bestanden, SVG, PDF, GIF en onmogelijke maten. Vijf kalibratietests met 200 gegenereerde gevallen voor heen-en-terug rekenen.
- Eén nieuwe integratietest tegen echte PostgreSQL: type- en maatcontrole, herhaling met dezelfde ID, een ander bestand onder dezelfde ID (409), geweigerde SVG/PDF/GIF/afgekapt bestand (422) zonder dat er een rij achterblijft, vast content-type met nosniff, andere werkruimte krijgt 404, alleen-lezen mag niet uploaden maar wel bekijken, geen UPDATE-recht voor de runtime-rol, en het quotum.
- **14 browserroutes geslaagd, 1,3 min.** De nieuwe route weigert eerst een SVG, uploadt dan een echt PNG van 1000 × 800, meet twee punten in op 5.000 mm en controleert de schaal.
- TypeScript strict en productiebuild geslaagd (6,8 s). Release-manifest bijgewerkt naar elf migrations.
- Screenshots `outputs/qa/onderlegger.png` en `outputs/qa/onderlegger-gekalibreerd.png` geïnspecteerd: de afbeelding ligt zichtbaar onder het plan en schaalt mee. De testafbeelding is bewust middengrijs gemaakt, want een lichte afbeelding op 45% doorzichtigheid is op een schermopname niet van de achtergrond te onderscheiden — de test zou dan slagen zonder dat iemand ziet of er iets getekend wordt.

De browsertest controleert de schaal met een marge tussen 12,3 en 12,7 mm per pixel in plaats van exact 12,5. Een muisklik landt op een hele schermpixel, hier ongeveer 0,65 afbeeldingspixel; de kalibratie gebruikt wat de gebruiker werkelijk heeft aangewezen en niet wat de test bedoelde. Dat is geen onnauwkeurigheid in de berekening.

Nog open in fase 2: PDF-pagina als onderlegger; EXIF verwijderen; de onderlegger verslepen en draaien; annotatieteksten en een legenda; groeperen; opt-in lokaal herstel via IndexedDB; laagpresets per tekenblad; muurjoins. Fase 2 is niet afgerond.

## Aanvulling 10 september 2026 — muurhoeken versneden

Muren werden getekend als dikke lijnen met stompe uiteinden. Op elke hoek liet dat aan de buitenzijde een hap open — zichtbaar op iedere schermopname in dit document, en het duidelijkst bij de schuine hoek van de demoruimte. Dit stond sinds fase 0 als openstaand punt genoteerd.

`packages/geometry/src/walls.ts` levert nu per muur een gesloten contour waarvan de uiteinden versneden zijn tegen de aansluitende muur. Vanaf een gedeeld punt wijzen beide muren weg; de plus-zijde van de een sluit daarom aan op de min-zijde van de ander. Muren van verschillende dikte sluiten net zo goed aan.

Bewuste beperkingen, met reden:
- **Versnijden gebeurt alleen wanneer op een punt precies één andere muur uitkomt.** Op een T-aansluiting of kruising is er geen enkele juiste versnijding. Daar eindigt de muur stomp op het punt zelf; dat valt niet op omdat de doorgaande muur het uiteinde bedekt.
- **Bij zeer scherpe hoeken vervalt de versnijding.** Voorbij zes keer de muurdikte zou er een lange punt uitsteken; dan is een stomp uiteinde beter.

Zowel het canvas als het geëxporteerde planblad gebruiken dezelfde contouren. Op het planblad worden de muurvlakken eerst allemaal getekend en pas daarna de doorsnede op 1.200 mm uit de openingen gewit, zodat een aangrenzende muur nooit een opening dichttekent die vlak bij een hoek ligt.

Verificatie 10 september, Linux x64, Node 22.22.2:
- **132 tests / 22 bestanden geslaagd, 19,9 s** (was 124). Acht contourtests: los uiteinde, rechte hoek, verschillende diktes, T-aansluiting, zeer scherpe hoek, collineaire muren, en 200 gegenereerde gevallen die aantonen dat elke contour vier eindige punten houdt.
- **14 browserroutes geslaagd, 1,2 min.** TypeScript strict en productiebuild geslaagd (7,5 s).
- Zowel het canvas als het geëxporteerde planblad naar afbeelding gerenderd en bekeken: de hoeken zijn dicht, ook de schuine hoek, en de openingen blijven schone gaten.

Twee dingen die het testen opleverde:
- Mijn eerste testverwachting was dat versnijden oppervlak toevoegt. Dat klopt niet: bij een rechte hoek verplaatst het materiaal — wat de buitenhoek erbij krijgt, verliest de binnenhoek. De test controleert nu waar het werkelijk om gaat, namelijk dat een punt vlak buiten de hoek gedekt is.
- De gevulde contour verving een lijn met een gegarandeerde trefzone van twintig pixels. Zonder die zone is een dunne muur bij uitzoomen niet meer aan te wijzen. De trefzone is teruggezet en een browserroute controleert nu dat een muur op het canvas aanklikbaar blijft.

Nog open in fase 2: annotatieteksten en een legenda; groeperen; opt-in lokaal herstel via IndexedDB; laagpresets per tekenblad; de onderlegger verslepen; PDF-pagina als onderlegger; EXIF verwijderen. In 3D zijn de muren nog losse blokken zonder versneden hoeken; dat hoort bij fase 7. Fase 2 is niet afgerond.

## Aanvulling 10 september 2026 — notities, laagpresets en legenda

### Tekstnotities

Annotaties zijn een discriminated union geworden: naast een maatlijn bestaat er nu een notitie met een punt en een tekst van maximaal 300 tekens. Het gereedschap **Notitie** plaatst er een en springt meteen terug naar Selecteren, zodat de tekst direct in het eigenschappenpaneel te wijzigen is. Notities staan in de objectlijst, doorgenummerd per soort, en komen op het geëxporteerde planblad.

### Laagpresets

Het lagenpaneel heeft knoppen **Alles** en één per aanwezige laag. Een preset toont die ene laag en verbergt de rest, als één opdracht en dus als één stap terug. Zichtbaarheid hoort bij de objecten zelf, dus een preset is een gewone wijziging die in de export doorwerkt — wat je op het scherm ziet is wat er op het blad komt.

### Legenda

Het tekenblad heeft een legenda die per laag meldt hoeveel objecten getoond en hoeveel verborgen zijn. Zo is aan het blad zelf te zien dat er iets ontbreekt, in plaats van dat een lezer een onvolledige tekening voor compleet aanziet.

**Daarbij een echte fout gevonden.** De legenda meldde "Inrichting: 0 getoond, 3 verborgen" terwijl het blad die drie meubels gewoon tekende: het exportpad filterde verborgen objecten niet. Dat is precies de fout die de legenda hoort te voorkomen. Verborgen objecten tellen nu ook niet meer mee voor de bladomvang. De browsertest controleert sindsdien niet alleen de legendatekst maar ook dat de verborgen namen werkelijk niet in de SVG staan; die tweede controle ontbrak eerst, en daardoor zag alleen de visuele inspectie het.

Verificatie 10 september, Linux x64, Node 22.22.2:
- **132 tests / 22 bestanden geslaagd, 22,0 s** en **15 browserroutes geslaagd, 1,5 min.** TypeScript strict en productiebuild geslaagd (7,7 s).
- De nieuwe browserroute plaatst een notitie, wijzigt de tekst, controleert die op het planblad, zet een meubel op de laag Verlichting, past de preset toe en controleert dat legenda en tekening hetzelfde zeggen — beide kanten op.
- Het geëxporteerde blad is naar afbeelding gerenderd en bekeken, vóór en na de correctie.

Nog open in fase 2: groeperen; opt-in lokaal herstel via IndexedDB; de onderlegger verslepen en draaien; PDF-pagina als onderlegger; EXIF verwijderen. De legenda somt lagen en aantallen op, nog geen symbolen; dat wordt pas zinvol met de elektra- en lichtsymbolen uit fase 4. Fase 2 is niet afgerond.

## Aanvulling 10 september 2026 — groeperen

Objecten met dezelfde `groupId` horen bij elkaar. **Er is bewust geen aparte groepenlijst**: een groep is niet meer dan een gedeelde verwijzing op de objecten zelf. Dat scheelt een tweede administratie die uit de pas kan lopen met de objecten, en een groep verdwijnt vanzelf zodra er te weinig leden over zijn. `applyOperations` maakt na elke opdracht een groepsverwijzing los die nog maar één object heeft, zodat er nooit een groep achterblijft die niets groepeert. De opdracht `SetItemGroup` groepeert of heft op en weigert een groep van één.

Eén lid aanwijzen pakt de hele groep — op het canvas, met het sleepkader en in de objectlijst. Die laatste is het gelijkwaardige alternatief voor aanwijzen op het canvas en moest zich dus hetzelfde gedragen; dat was eerst niet zo en is hersteld toen de browsertest erop viel.

Slepen verplaatst alle leden met dezelfde verschuiving, als één batch en dus één stap terug. Konva verplaatst alleen het aangewezen object; de groepsgenoten krijgen tijdens de sleep dezelfde verschuiving mee, anders valt de groep visueel uit elkaar tot de opdracht landt. Een vergrendeld lid laat de hele verplaatsing afwijzen — dat is dezelfde transactionele regel als elders, met een leesbare melding.

Verificatie 10 september, Linux x64, Node 22.22.2:
- **139 tests / 23 bestanden geslaagd, 28,2 s** (was 132). Zeven groepstests: selectie uitbreiden, losse objecten met rust laten, twee groepen tegelijk, groeperen en opheffen via opdrachten, de weigering van een groep van één, en het opruimen van een groepsverwijzing nadat leden verwijderd zijn.
- **16 browserroutes geslaagd, 1,9 min.** De nieuwe route groepeert twee meubels, controleert dat één aanwijzen de groep pakt, sleept ze samen, controleert dat de derde niet meebeweegt, zet het met één stap terug en heft de groep weer op.
- Schermopname midden in de sleep bekeken: beide leden schuiven mee, de eettafel blijft staan.

De browsertest leest de posities uit het geëxporteerde planblad in plaats van uit het eigenschappenpaneel. Een gegroepeerd meubel aanwijzen toont namelijk het groepspaneel zonder losse coördinaten — dat is juist gedrag, maar de test moest zich eraan aanpassen. Uit het blad lezen toetst meteen de echte uitvoer.

Nog open in fase 2: opt-in lokaal herstel via IndexedDB; de onderlegger verslepen en draaien; PDF-pagina als onderlegger; EXIF verwijderen. Fase 2 is niet afgerond.

## Aanvulling 10 september 2026 — opt-in lokaal herstel

### Wat er nu gebeurt

De editor kan niet-opgeslagen werk als **klad** in IndexedDB zetten, onder de sleutel `gebruiker:organisatie:variant`. Het staat standaard uit; de statusbalk heeft een schakelaar **Lokaal herstel**. De keuze staat per gebruiker in `localStorage` en gaat niet naar de server.

Er staat hoogstens één klad per ontwerp, want zolang een opdracht niet bevestigd is neemt de editor geen nieuwe opdrachten aan. Het klad bevat de opdracht, het document zoals dit venster het zag, het tijdstip en de naam van de variant.

De statusbalk toont precies één van zes toestanden, uit de pure functie `saveState`: leesmodus, synchroniseren, **niet opgeslagen · alleen in dit venster**, **lokaal bewaard op dit apparaat · nog niet op de server**, server opgeslagen, en **conflict · de server heeft een nieuwere versie**. Het woord back-up komt in geen enkele tekst voor; een test controleert dat op alle labels.

Bij het openen zoekt de editor naar een klad van een eerdere sessie en zet niets automatisch terug. Wat er ligt wordt gemeld, met de keuze om terug te halen, te downloaden of weg te gooien.

**Terughalen kan alleen wanneer het klad exact op de huidige serverrevisie voortbouwt.** Dat is geen voorzichtigheid maar een sluitende redenering: elke aangekomen opdracht verhoogt de revisie, dus een gelijke revisie betekent dat de opdracht nooit is aangekomen. Staat de server verder, dan meldt de balk dat terugsturen niet meer kan en blijven alleen downloaden en weggooien over. Zie ADR 0005 voor het volledige besluit, inclusief waarom de teruggehaalde opdracht een nieuwe opdracht-ID en de lease van dit venster krijgt.

Bij het afmelden worden de kladden van de betreffende gebruiker getoond met naam, revisie en tijdstip, kan er eerst een herstelbestand worden gedownload, en worden ze daarna verwijderd. Kladden van andere gebruikers op dezelfde computer blijven staan: afmelden mag het onopgeslagen werk van een collega niet weggooien.

Zolang er een klad is, blokkeert de editor het verlaten van de pagina niet meer — het werk staat er na terugkomst weer. Zonder klad blijft de bestaande waarschuwing staan.

### Wat er onderweg is gerepareerd

- **Netwerkfouten waren geen `ApiError`.** Een afgebroken verbinding leverde de ruwe `TypeError: Failed to fetch` in de meldingsbalk. `api()` vertaalt dat nu naar een `ApiError` met code `NETWORK` en een Nederlandse melding, zodat elke oproeper netwerk- en serverfouten hetzelfde behandelt.
- **De eerste geldigheidscontrole op een klad was fout.** Die eiste dat het bewaarde document op de basisrevisie stond, maar de editor past de opdracht meteen lokaal toe, dus het document staat één revisie verder. Elk klad werd daardoor als onbruikbaar weggegooid en de browsertest viel er direct op. De controle laat nu precies nul of één stap toe en legt uit waarom die twee.
- **De statusbalk kon overlopen** door de extra schakelaar. `.statusbar` schuift nu horizontaal in plaats van de pagina breder te maken; de bestaande tabletcontrole op 1024 px dekt dat af.

### Verificatie 10 september, Linux x64, Node 22.22.2, PostgreSQL 18.4 (embedded)

- **151 tests / 22 bestanden geslaagd, 26,8 s** (was 139). Twaalf nieuwe tests op de pure laag: sleutelvorming, de vier uitkomsten van `draftVerdict` inclusief verlopen en zelftegensprekende kladden, alle zes toestanden van `saveState` met de voorrang van conflict, welke toestanden bij weggaan waarschuwen, dat geen enkel label back-up zegt, en dat er zonder IndexedDB geen lokale opslag wordt voorgewend.
- **17 browserroutes geslaagd, 2,1 min.** De nieuwe route zet lokaal herstel aan, breekt het opslaan af op netwerkniveau, controleert de toestand "lokaal bewaard", herlaadt, vindt het klad terug, controleert dat de server de wijziging niet heeft, haalt het werk terug, ziet het opgeslagen worden en het klad verdwijnen. Daarna een **echt conflict**: een tweede schrijver landt een opdracht op de server, waarna opnieuw opslaan de servermelding `REVISION_CONFLICT` oplevert en de balk op conflict springt. Na herladen biedt de melding geen terughaalknop meer. Tot slot waarschuwt het afmelden, levert het herstelbestand de opdracht en het document op, en verdwijnt het klad.
- TypeScript strict en productiebuild geslaagd (9,9 s). Bekende chunkgroottewaarschuwing blijft open.
- Screenshots `outputs/qa/herstel-gevonden.png`, `herstel-conflict.png` en `herstel-afmelden.png` daadwerkelijk bekeken: de melding is leesbaar zonder overlap, de conflicttoestand staat in de balk, en de afmelddialoog noemt het ontwerp bij naam.

### Beperkingen

- Dit is geen offline bewerken en wordt ook niet zo genoemd. Er past één opdracht in het klad; een echte commandobuffer met samenvoegen bij terugkomst hoort bij een later conflictmodel.
- Het klad staat onversleuteld in het browserprofiel. Daarom staat het uit tenzij de gebruiker het aanzet en verdwijnt het bij afmelden.
- Mislukt het schrijven — privévenster, geweigerde opslag — dan meldt de editor dat en blijft de toestand "alleen in dit venster". Die mislukking is in de browserroute niet nagespeeld; de node-test dekt alleen het geval zonder IndexedDB.
- Het conflict in de browserroute wordt gemaakt door een tweede schrijver die dezelfde bewerktoegang hergebruikt. De bewerktoegang is exclusief, dus overname door een tweede echte sessie is een apart scenario dat hier niet is getest.

Nog open in fase 2: de onderlegger verslepen en draaien; PDF-pagina als onderlegger; EXIF verwijderen. Fase 2 is niet afgerond.

## Aanvulling 10 september 2026 — de onderlegger verplaatsen en draaien

De onderlegger heeft een hoek gekregen, als veld met standaardwaarde in `underlaySchema`; bestaande scenes blijven geldig zonder scene-migratie. Het draaipunt in het model is de linkerbovenhoek, precies zoals de tekenlaag een afbeelding om haar eigen oorsprong draait — zo kunnen model en tekening niet uit elkaar lopen. Wat de gebruiker doet is iets anders: een hoek intikken of een kwartslag maken draait **om het midden**, en de verschuiving die daarbij hoort wordt meteen verrekend in `rotateUnderlay`. Anders zwaait de afbeelding onder je cursor vandaan.

De kalibratie blijft in afbeeldingspixels bewaard en draait dus niet mee: verplaatsen en draaien laten de schaal met rust. `underlayToWorld` en `worldToUnderlay` rekenen de draaiing wel mee, zodat een inmeting na het draaien nog steeds op de juiste plek belandt.

Verplaatsen gaat met een eigen gereedschap, aan te zetten in het onderleggerpaneel. Alleen dan luistert de onderleggerlaag mee en is de afbeelding versleepbaar; in alle andere standen ligt de onderlegger onder alles en vangt hij geen klikken van muren of meubels af. Slepen landt op het raster wanneer rastervangen aan staat. Daarnaast zijn X, Y en de hoek in te tikken.

`fitToProject` gebruikt nu alle vier de hoeken van de onderlegger: een gedraaide afbeelding is geen rechthoek meer en zou anders half buiten beeld vallen.

Onderweg gecorrigeerd: de eerste normalisatie van de kwartslagknop leverde −180 in plaats van 180 graden — dezelfde hoek, maar een verwarrend getal in het veld. De knop houdt nu, net als bij meubels, 0 tot 359 graden aan.

Verificatie 10 september, Linux x64, Node 22.22.2:
- **156 tests / 22 bestanden geslaagd, 28,7 s** (was 151). Vijf nieuwe onderleggertests: omrekenen om de hoek bij 90 graden, de draaiing in de plaatsing, de vier hoeken van een gedraaide afbeelding, draaien dat het midden op zijn plaats houdt in hele millimeters, en draaien naar dezelfde hoek dat niets verplaatst. De bestaande eigenschapstest met 200 gevallen draait nu ook over willekeurige hoeken van −360 tot 360.
- **17 browserroutes geslaagd, 2,1 min.** De onderleggerroute plaatst de afbeelding numeriek, draait hem 90 graden, controleert dat de hoek daarbij verschuift, maakt vier kwartslagen en komt binnen 3 mm terug op het beginpunt, sleept de afbeelding over het canvas en controleert dat de plaatsing op hele honderden millimeters landt, en vindt plaats en hoek terug na herladen.
- TypeScript strict en productiebuild geslaagd (10,4 s).
- Screenshots `outputs/qa/onderlegger-gedraaid.png` en `onderlegger-verplaatst.png` bekeken: de afbeelding staat na een kwartslag rechtop in plaats van liggend, met het midden op dezelfde plek, en na het slepen op de ingevulde coördinaten.

Beperkingen: draaien gaat via het paneel, niet met een greep op het canvas. De draaiing werkt niet door in het planblad of de 3D-weergave, want de onderlegger komt daar bewust niet in voor — het is een natekenhulp, geen tekeninhoud.

Daarmee zijn de openstaande punten van fase 2 afgewerkt. Nog steeds bewust buiten deze fase gelaten: **PDF-pagina als onderlegger** (zie ADR 0004; vraagt een PDF-engine in de browser) en **EXIF-metadata verwijderen** (vraagt opnieuw encoderen en dus een beeldbibliotheek op de server). Beide staan als open punt genoteerd en zijn geen stille weglating. De symbolenlegenda op het planblad wacht op de elektra- en lichtsymbolen uit fase 4.

## Aanvulling 10 september 2026 — fase 6 van Codex samengevoegd, met twee correcties

`codex/phase-6-completion` ([PR #3](https://github.com/patrickdekker82/madebyjane/pull/3)) is met een merge-commit in deze tak gezet, zodat de commits van Codex met hun oorspronkelijke auteurschap in de geschiedenis blijven. De tak vertrok van `main` en wist niets van het fase-2-werk dat daarna is gemaakt. Wat er binnenkomt: offerte-PDF met vaste bijlagen, prijsbronnen, statusovergangen, intrekbare deellinks, vervolgconcepten en een Windows-afsluitpad voor de testdatabase.

### Wat er bij het samenvoegen is opgelost

- **Twee migrations met nummer 0011.** Deze tak had `0011_underlay_assets.sql`, Codex `0011_quote_workflow.sql`. Git ziet dat niet als conflict — de bestandsnamen verschillen — maar de nummering zou stilzwijgend dubbel zijn. Die van Codex is `0012_quote_workflow.sql` geworden; de inhoud en dus de hash zijn ongewijzigd en het release-manifest noemt nu beide.
- **Twee namen voor hetzelfde Chromium-pad** in `playwright.config.ts` (`PLAYWRIGHT_EXECUTABLE_PATH` van Codex, `PLAYWRIGHT_CHROMIUM_EXECUTABLE` van hier), waarvan er één stil werd overschreven. Beide worden nu geaccepteerd, met één regel die zegt welke voorgaat.
- Het offertepaneel kreeg een nieuwe eigenschap `organizationName`; die is meegenomen in de samengevoegde editor.

### De offerte-PDF klopte niet

De bouwstraat van PR #3 was rood en bleef dat om een reden die niets met de merge te maken had: `pnpm probe:quote` kan Chromium niet met sandbox starten op ubuntu-24.04, omdat die versie onbevoorrechte gebruikersnamespaces via AppArmor verbiedt. De sandbox uitzetten om de bouwstraat tevreden te stellen is geen optie; CI zet daarom nu `kernel.apparmor_restrict_unprivileged_userns=0`, precies de oplossing die Chromium zelf aanwijst.

Toen de PDF eenmaal gemaakt kon worden, bleek **de bijgeleverde plattegrond niet op schaal te staan**. Codex' eigen controlescript `scripts/verify-quote-pdf.py` viel er meteen op om, maar het stond nergens in de bouwstraat en was dus nooit gedraaid.

Het planblad is A4 liggend van rand tot rand en heeft daarvoor een eigen paginastijl zonder marges. Het omhullende blok had echter zelf `width:297mm;height:210mm;overflow:hidden` gekregen, en daardoor negeerde Chromium die paginastijl: het blad belandde op een gewone pagina met marges van 17 mm, waarna Chromium het **hele document naar 88,6% kromp**. De schaalbalk die 100 mm hoort te zijn mat 88,6 mm; de plattegrond in de offerte was geen 1:50 maar ongeveer 1:56. Bovendien liep het blad over en kwam er een lege pagina achteraan.

De maten op het omhullende blok zijn weg; de tekening zelf houdt haar eigen maat. Nagemeten in de gemaakte PDF: planblad 296,995 × 209,996 mm op één pagina, schaalbalk 99,998 mm, zeven pagina's zonder lege. Het controlescript draait nu in de bouwstraat, met een gepinde `pdfplumber`, zodat een lay-outfout het planblad niet nog eens ongemerkt kan verkleinen.

Dat een verkeerde maat in een document dat naar een klant gaat als "geverifieerd" kon passeren, komt doordat de controle wel geschreven maar niet uitgevoerd was. Dat is precies het soort claim dat het masterprompt verbiedt.

### Verificatie 10 september, Linux x64, Node 22.22.2, PostgreSQL 18.4 (embedded)

- **160 tests / 22 bestanden geslaagd, 33,6 s.** Inclusief de acht offerte-integratietests van Codex, met echte PDF-uitvoer.
- **17 browserroutes geslaagd, 2,3 min.** De offerteroute downloadt nu een echte PDF, maakt een deellink, trekt die in en controleert dat de ingetrokken link 404 geeft.
- `pnpm probe:quote` gevolgd door `scripts/verify-quote-pdf.py`: 7 pagina's, 40 unieke posten, exact totaal en een schaalbalk van 100 mm.
- TypeScript strict en productiebuild geslaagd (10,9 s).
- Pagina 1 en het planblad van `outputs/qa/offerte-demo.pdf` naar afbeelding gerenderd en bekeken: marges kloppen, het planblad staat compleet op één pagina met tekening, titelblok, legenda en schaalbalk.

**Deze verificatie is niet als root gedraaid.** Chromium weigert te sandboxen als root, dus de testronde is uitgevoerd onder een gewone gebruiker in dezelfde container. Als root falen twee offertetests op het starten van de browser; dat is een eigenschap van deze omgeving, niet van de code. Of de sysctl-instelling op de GitHub-runner het beoogde effect heeft, is hier niet na te bootsen en moet uit de bouwstraat zelf blijken.

## Aanvulling 10 september 2026 — intrekken van offertelinks vastleggen

De actuele GitHub-versie tot en met `ccdd674` is lokaal samengevoegd. Het overlappende lokale offerteconcept-prototype is apart bewaard en niet over de bestaande offerte-MVP gezet.

Het intrekken van een offertelink schrijft nu een `quote.share_revoked`-auditregel met organisatie, gebruiker, link-ID en tijdstip. Intrekking en audit gebeuren in dezelfde databasetransactie. Alleen de eerste intrekking schrijft een regel; gelijktijdige verzoeken en latere retries blijven succesvol zonder dubbele regels. Onbekende links en links uit een andere organisatie blijven 404; viewers blijven uitgesloten.

Verificatie op macOS arm64, Node 22.23.1: **160 tests / 22 bestanden geslaagd (27,35 s)**, inclusief echte offerte-PDF en de uitgebreide integratieproef voor gelijktijdige intrekking, herhalen, actor en tenantisolatie. TypeScript strict en productiebuild geslaagd (2,80 s); bestaande chunkgroottewaarschuwing blijft. De eerste testronde miste het Chromium-pad; de geslaagde ronde gebruikte `PLAYWRIGHT_BROWSERS_PATH="$PWD/work/browsers"` vooraf in de omgeving. Browserroutes zijn voor deze serverwijziging niet opnieuw uitgevoerd. Dit voegt registratie toe; er is nog geen apart auditoverzicht in de gebruikersinterface.

## Aanvulling 10 september 2026 — interne inkoop en marge

Een offerteregel kan nu naast de verkoopprijs een niet-negatieve inkoopprijs en verplichte inkoopbron/datum bevatten. De server rekent per regel met `Decimal`, rondt de inkoop op centen af en bepaalt de marge exclusief belasting ten opzichte van de netto verkoop. De marge verschijnt alleen wanneer elke regel een inkoopprijs heeft; nul moet expliciet worden ingevuld. Bij ontbrekende inkoop toont de app het bekende inkoopbedrag en meldt zij de marge als onvolledig.

Inkoop en marge zijn onderdeel van de immutable offerteversie en de inhoudshash. Alleen owner, admin en finance kunnen de offerte-API gebruiken; designer en viewer krijgen server-side 403. De klant-PDF en openbare deellink bevatten uitsluitend verkoopposten en klanttotalen. De interne calculatie vermeldt dat expliciet in het scherm.

Verificatie op macOS arm64, Node 22.23.1:

- **161 tests / 22 bestanden geslaagd (15,21 s)**, inclusief echte offerte-PDF. Nieuwe dekking: decimale inkoop, correctieregel met nulinkoop, margepercentage, onvolledige calculatie, verplichte inkoopherkomst, serverberekende totalen en controle dat inkoopgegevens niet in de klant-HTML terechtkomen.
- TypeScript strict en productiebuild geslaagd (2,74 s). De bestaande waarschuwing over grote chunks blijft open.
- De zelfstandige offerte-browsertest is geslaagd (5,5 s testtijd; 9,7 s totaal): invoer, marge, definitief maken, herladen, PDF-download, deellink, intrekken en vervolgconcept. Screenshot `outputs/qa/offerte-definitief.png` bekeken; interne totalen zijn leesbaar en duidelijk van de klanttotalen gescheiden.

De eerste losse browserpoging bereikte het projectoverzicht niet, omdat de route alleen cookies uit een eerder uitgevoerde test gebruikte. De route logt nu zelf in wanneer die cookies ontbreken en is daarmee afzonderlijk uitvoerbaar. Nog open binnen de verdere afwerking van fase 6: een auditoverzicht in de interface en aantoonbare PDF-proeven met meerdere planbladen. De productiequeue valt onder de bredere export- en beheerfasen.
## Aanvulling 10 september 2026 — fase 4: LED-paden

Fase 4 had de materiaalkant al (catalogus, keuzestatussen, alternatieven, hoeveelheden). Dit is de eerste helft van het lichtplan: **LED-strips als bewerkbare polyline**.

### Het model

`ledPaths` is een nieuwe verzameling in de scene, met een standaardwaarde, dus bestaande scenes blijven geldig zonder scene-migratie. Een strip heeft hoekpunten, montagehoogte, profiel, richting, kleur, kleurtemperatuur, vermogen per meter, aansluiting en notitie — precies de velden die het masterprompt noemt.

**De lengte staat er niet in.** Die volgt uit de hoekpunten, net zoals de lengte van een maatlijn uit haar twee punten volgt. Een strip kan daardoor nooit een andere lengte beweren dan hij op de tekening heeft, ook niet nadat iemand een hoekpunt heeft verschoven. Wat er wél in staat is de **bestel- of kniplengte**: dat is een besluit van de gebruiker en geen meting, en het verschil tussen die twee is juist wat iemand wil zien voordat hij bestelt. Te kort besteld staat als fout in beeld, niet stilzwijgend aangevuld.

Vermogen is een expliciete vermenigvuldiging: lengte in meters maal vermogen per meter. Er wordt niets omgerekend tussen watt, lumen, candela en lux; dat zijn verschillende grootheden en de app doet niet alsof ze uit elkaar volgen. Afronding volgt hetzelfde beleid als de vloer- en plinthoeveelheden: meters op drie decimalen, half naar boven, omdat het in dezelfde offerte terechtkomt.

Hoeken tellen alleen mee wanneer de strip er werkelijk buigt. Een extra sleeppunt midden op een rechte lijn buigt niets en zet dus geen hoekprofiel op de stuklijst; terugvouwen over dezelfde lijn telt wel als hoek.

Twee opdrachten: `AddLedPath` en `UpdateLedPath` (die laatste staat met die naam in het masterprompt). `DeleteSelection` ruimt strips mee op, net als annotaties.

### De bediening

Gereedschap **LED-strip**: hoekpunten aanklikken, twee keer op hetzelfde punt klikken rondt af, of de knop **Strip afronden** in de balk erboven. Tijdens het tekenen loopt de lopende lengte mee. Een afgeronde strip is aanwijsbaar; als hij geselecteerd is, zijn de hoekpunten los te verslepen. Een hoekpunt op zijn buurman leggen zou de strip ongeldig maken en wordt geweigerd: het punt springt terug.

Op het planblad staat de strip als doorlopende lijn in zijn eigen kleur met de gemeten lengte erbij, en de legenda meldt hoeveel strips, hoeveel meter en hoeveel hoeken erop staan.

### Twee fouten onderweg

- **Punten in plaats van komma's.** Het LED-paneel toonde `37.200 W` waar de rest van de app `37,200 W` schrijft. De browsertest viel erop. Nu gebruikt het paneel dezelfde `decimals`-hulp als het materialenpaneel.
- **Een blijvende vanghulplijn.** Dit bleek een bestaande fout, die pas bij het bekijken van een schermafbeelding opviel: `world()` zet de vangdoelen, maar alleen het slepen van een meubel maakte ze weer leeg. Na een muur, een maatlijn of een notitie bleef er dus een streepjeslijn naar een meubel op het canvas staan tot de volgende sleep. Die wordt nu opgeruimd zodra een handeling af is en bij het wisselen van gereedschap. Dit is met het oog vastgesteld, niet met een geautomatiseerde controle; de bestaande vangtest bewaakt wel dat de hulplijnen tijdens het slepen nog verschijnen.

### Verificatie 10 september, Linux x64, Node 22.22.2

- **173 tests / 23 bestanden geslaagd, 32,5 s** (was 160). Dertien nieuwe LED-tests: lengte uit de punten, segmenten, alleen echte knikken als hoek, het omhullende vierkant, meters en watt, de bestellengte in beide richtingen, afronding op drie decimalen, totalen, opdrachten voor plaatsen/bijwerken/verwijderen, dubbele identiteit en samenvallende punten weigeren, en dat scenes van voor deze stap geldig blijven. Plus een eigenschapstest met 200 gevallen: de lengte is nooit negatief en verandert niet als je de punten omdraait.
- **18 browserroutes geslaagd, 2,4 min.** De nieuwe route tekent een strip met een hoek, rondt hem af, vergelijkt wat het paneel zegt met de polyline op het geëxporteerde planblad, controleert de legenda, vult een te ruime en een te krappe bestellengte in, wijzigt naam en vermogen en vindt alles terug na herladen.
- TypeScript strict en productiebuild geslaagd (11,4 s).
- Schermafbeelding van het canvas en het naar afbeelding gerenderde planblad daadwerkelijk bekeken, voor en na de correctie van de hulplijn en van de labelplaatsing.

De browsertest vergelijkt de lengte in het paneel met de lengte die uit het planblad terugkomt. Dat toetst de hele keten — canvas, server, export — op dezelfde meting, in plaats van de rekenformule tegen zichzelf.

### Nog open in fase 4

**Elektra- en lichtsymbolen** (wandcontactdozen, schakelaars, lichtpunten, spots, wandarmaturen) met hoogte, oriëntatie, label en groep; **armatuurvelden** (bundelhoek, kleurtemperatuur, dimniveau, fabrikantwaarden als losse grootheden); **circuits en lichtscènes**; en de **2D-uitstraling** met sectoren en legenda. Fase 4 is daarmee niet afgerond. De symbolenlegenda op het planblad wacht nog steeds op die symbolen.

## Aanvulling 10 september 2026 — fase 4: elektra, armaturen en lichtbundels

De tweede helft van het lichtplan. Zes soorten punten zijn te plaatsen: wandcontactdoos, schakelaar, lichtpunt plafond, inbouwspot, wandarmatuur en hanglamp. Elektra komt op de laag Elektra, verlichting op de laag Verlichting.

### Papier en werkelijkheid uit elkaar

Het masterprompt vraagt expliciet om verschil tussen de symbolische grootte op papier en de fysieke maat van een armatuur. Een armatuur heeft daarom **twee maten die niets met elkaar te maken hebben**: `width`/`depth` blijven de echte inbouwmaat (een spot is 90 mm), en `symbolSizeMm` is de maat waarop het teken op de plattegrond staat (300 mm). Zonder dat onderscheid zou een spot op 1:50 minder dan twee tienden millimeter groot zijn. Het eigenschappenpaneel toont beide naast elkaar en zegt erbij dat het symbool een tekenafspraak is en geen maatvoering.

De symbolen zelf gebruiken dezelfde veilige primitieven als de symbooleditor uit fase 3 — rechthoek, ellips en lijn in een genormaliseerd vierkant — dus er komt geen JavaScript of losse HTML aan te pas. Een test controleert dat elk vast symbool door hetzelfde schema komt als een zelfgemaakt symbool.

### Lichtbundels als benadering, en niet meer dan dat

De 2D-uitstraling is schakelbaar met **Lichtbundels** in de statusbalk. Een plafondpunt, spot of hanglamp levert een cirkel, een wandarmatuur een sector rond zijn eigen richting. De straal volgt uit één formule die nergens verstopt zit:

    straal = (montagehoogte − werkvlak) × tan(bundelhoek / 2)

Het paneel toont die formule bij de uitkomst. Er komt **geen lux uit, geen luxkaart en geen UGR-waarde**; het blad zegt dat er ook bij zodra bundels getoond worden. Lichtstroom (lumen) en opgenomen vermogen (watt) staan als losse fabrikantwaarden naast elkaar en worden niet uit elkaar afgeleid — dat zijn verschillende grootheden.

Het planblad volgt wat er in de editor aan staat: de exportknop stuurt de keuze mee. Wat je op het scherm ziet, komt op papier.

### De symbolenlegenda die sinds fase 2 openstond

Het tekenblad heeft nu een tweede legendakolom **SYMBOLEN** met het teken zelf naast de naam en het aantal. Die stond open sinds fase 2 en kon pas met deze symbolen gemaakt worden. Het titelblok is daarvoor opnieuw ingedeeld in drie kolommen — titel met schaalbalk links, lagenlegenda in het midden, symbolen rechts — omdat de nieuwe kolom anders over de schaalbalk heen viel.

### Drie fouten onderweg

- **Streepdikte buiten het schema.** De vaste symbolen gebruikten dikten tot 60 waar het symboolschema er hoogstens 30 toestaat. De eerste test viel er meteen op; de symbolen zijn nu binnen de grenzen die ook voor zelfgemaakte symbolen gelden.
- **"L I C H T" onder elk armatuur.** Elk object krijgt op het canvas een woord in het midden. In een tekstvak van 90 mm breed brak "LICHT" af tot losse letters onder de spot. Een armatuur draagt nu geen woord meer in de tekening: het symbool is het label en de naam staat in de objectlijst. Op het blad gold hetzelfde.
- **Punten die op elkaar stapelden.** Elk nieuw punt kwam op dezelfde plek, zodat het tweede onzichtbaar onder het eerste lag. Ze komen nu trapsgewijs naast elkaar.

De eerste twee zijn gevonden door een schermafbeelding te bekijken, niet door een test.

### Verificatie 10 september, Linux x64, Node 22.22.2

- **187 tests / 24 bestanden geslaagd, 34,5 s** (was 173). Veertien nieuwe tests: elk vast symbool geldig volgens het symboolschema, de cirkel van een spot met narekenbare straal, de sector van een wandarmatuur rond zijn richting, elektra dat niet straalt, geen bundel zonder hoek of onder het werkvlak, een hoger werkvlak dat de bundel evenredig verkleint, de omhullende doos, een eigenschapstest met 200 gevallen dat de straal met hoogte én hoek groeit, de juiste laag en het onderscheid tussen papier- en fysieke maat, `SetFixture` dat alleen op een punt werkt en niet op een meubel of een vergrendeld object, bundels die alleen op het blad staan als erom gevraagd is, en de symbolenlegenda die precies noemt wat er getoond wordt.
- **19 browserroutes geslaagd, 2,5 min.** De nieuwe route plaatst een spot, controleert dat papiermaat en fysieke maat allebei benoemd staan, rekent de bundeldoorsnede na (2 × 2700 × tan 18° = 1755 mm), hangt hem hoger en ziet 1950 mm, plaatst een wandcontactdoos en controleert dat elektra geen bundelvelden heeft, haalt het blad op zonder en met bundels, en meet de straal van de cirkel op het blad na.
- TypeScript strict en productiebuild geslaagd (12,0 s).
- Canvas en het naar afbeelding gerenderde planblad bekeken, drie keer: bij het vinden van de letterfout, na het opschonen, en na het herindelen van het titelblok.

Een bestaande test op het planblad prikte op de exacte x-positie van de schaalreferentie. Die controleert nu de **lengte** van de lijn — 100 mm bij 1:50 — want dat is wat er moet kloppen; waar hij in het titelblok staat mag veranderen.

### Nog open in fase 4

Circuits en lichtscènes zijn nu vrije tekstvelden per punt; er is nog geen overzicht dat een groep of scène als geheel toont of schakelt. De 3D-uitstraling (lichtbronnen, schaduwen, emissieve stripmaterialen) hoort bij fase 7. Fase 4 is daarmee dicht bij afronding maar niet afgerond.

## Aanvulling 10 september 2026 — fase 4 afgerond: groepen en lichtscènes

Het laatste openstaande punt van fase 4. Groep en lichtscène waren al velden per punt; er was alleen geen overzicht dat een groep of scène als geheel toonde.

Het paneel **Elektra en licht** somt de groepen en de lichtscènes op met hun aantallen. Een scène is met één knop alleen te tonen: dat zet de zichtbaarheid van de armaturen zelf in één opdracht, precies zoals de laagpresets, dus het werkt door in de export en is met één stap terug ongedaan te maken.

**Het opgetelde vermogen is de som van wat iemand zelf heeft ingevuld, en dat staat er ook bij.** Een groep waarin drie van de vijf armaturen een vermogen hebben, toont "3 van 5 opgegeven"; een groep zonder enkele opgave toont "geen vermogen opgegeven" in plaats van 0 W. Er wordt geen groepsbelasting, zekeringmaat of lux uit afgeleid, en het paneel zegt dat in één zin. Armaturen en LED-strips staan apart in het totaal: het vermogen van een strip komt uit lengte maal vermogen per meter en is van een andere orde dan een opgegeven armatuurvermogen.

Punten zonder groep of scène vallen onder **Niet toegewezen**, onderaan de lijst. Juist die wil je zien voordat een lichtplan naar een installateur gaat; ze stilzwijgend weglaten zou het overzicht compleet laten lijken terwijl het dat niet is.

Onderweg gecorrigeerd: in het smalle paneel brak "Niet toegewezen" af tot drie regels van vier letters, doordat de telling ernaast niet mocht afbreken. Naam en telling staan nu onder elkaar in plaats van naast elkaar. Gevonden door de schermafbeelding te bekijken.

### Verificatie 10 september, Linux x64, Node 22.22.2

- **196 tests / 25 bestanden geslaagd, 34,3 s** (was 187). Negen nieuwe tests: groepen die alle punten tellen inclusief elektra, een deels ingevulde groep die laat zien hoeveel er is opgegeven, punten zonder groep die een eigen kop krijgen, lichtscènes die alleen tellen wat licht geeft, sortering met de restpost onderaan, het totaal dat armaturen en LED-strips uit elkaar houdt, een leeg ontwerp, de ids die bij een scène horen, en spaties rond een naam die geen tweede groep maken.
- **19 browserroutes geslaagd, 2,6 min.** De elektraroute maakt nu ook twee lichtscènes, controleert het overzicht inclusief de meldingen over wat niet is ingevuld, toont één scène en haalt het planblad op: de andere armatuur staat er dan werkelijk niet meer op. Daarna weer alles tonen, en na herladen staan groep en scène nog op de server.
- TypeScript strict en productiebuild geslaagd (10,8 s).
- Het paneel bekeken, voor en na de correctie van de regelafbreking.

### Fase 4 is hiermee afgerond

Materiaalcatalogus, ruimte- en oppervlakkoppeling, keuzestatussen, alternatieven en hoeveelheidberekening stonden er al; daar zijn nu elektra, LED-paden en 2D-uitstraling bij gekomen.

De exitcriteria: het demoproject levert uitlegbare vloer-, plint- en LED-hoeveelheden; wijzigingen tonen veroudering; handmatige overrides blijven begrijpelijk met hun onderbouwing; en lichtbundels zijn visueel en gelabeld — met de formule erbij en zonder luxclaim.

Bewust buiten deze fase gelaten en als zodanig genoteerd: de **3D-uitstraling** (lichtbronnen, schaduwen, emissieve stripmaterialen) hoort bij fase 7, en een **gecertificeerde lux- of elektraberekening** is in het masterprompt een expliciete vervolgmodule.

## Aanvulling 10 september 2026 — fase 5, eerste deel: documentmodel, sjablonen en schaalvaste PDF

Fase 5 stond nog op nul. Dit is de eerste helft: het documentmodel, drie sjablonen, de PDF en de maatvastheid. Opslaan, publiceren, deellinks, PPTX en de exportworker volgen hierna.

### Twee gescheiden dingen

Een presentatie bestaat uit een **definitie** die de gebruiker instelt en een **inhoud** die bij het publiceren uit het ontwerp wordt gehaald. Een blok zegt dus welk planblad op welke schaal en welk papier getoond wordt; wát er op dat blad stond op het moment van publiceren zit in de bevroren inhoud, mét de bronrevisie. Daardoor kan een gedeelde presentatie nooit vanzelf meeveranderen met het ontwerp, en is achteraf vast te stellen welke revisie de klant heeft gezien.

Negen bloktypen: omslag, tekst, planblad, moodboard, materiaalstaat, lichtplan, productlijst, prijsblok en afsluiting. **Het 3D-camerablok is er bewust niet**: er is nog geen 3D-render om in te zetten, en een blok dat een leeg kader oplevert doet alsof er iets werkt. Dat komt bij fase 7.

Drie sjablonen die niet alleen anders ogen maar ook andere blokken tonen: een compact voorstel is een korte pitch, een uitgebreid interieurplan neemt de klant mee door het hele ontwerp, en een technisch planpakket is voor de uitvoerder — planbladen, lichtplan, productlijst en een colofon met bronrevisies, zonder verkooptekst.

### Het planblad kan nu op elk papier

`planSvg` rekende alles uit in vaste getallen voor A4 liggend. Papiermaat en richting zijn nu instelbaar (A4/A3, staand/liggend) en het hele titelblok rekent in millimeters van het gekozen blad. De datum staat erbij, zoals het masterprompt vraagt.

**Past een tekening niet, dan gaat de presentatie gewoon door en staat de reden in het document.** Kleiner tekenen met hetzelfde schaallabel eronder zou een onjuiste maat naar een klant sturen; dat is precies wat het masterprompt verbiedt. De melding noemt het papier en de schaal: "Ontwerp past niet op A4 liggend bij 1:20. Kies een kleinere schaal of een groter blad."

### Twee vondsten in de PDF-opmaak

- **Een benoemde pagina blijft plakken.** Chromium houdt de paginastijl van een planblad vast tot een volgend blok er zélf een kiest; `page:auto` zet hem niet terug. De materiaalstaat kwam daardoor op A4 liggend te staan. Tekstpagina's noemen nu hun eigen pagina.
- **Een inline SVG is een regel tekst, geen blok.** Zelfs mét een eigen paginanaam bleef het blok ná een planblad diens papiermaat erven — maar alleen bij een `<svg>`, niet bij een `<div>` met dezelfde afmetingen. Met `display:block` op de SVG klopt zowel de paginamaat als de schaal. Dit is de tweede keer dat een inline SVG de paginaopmaak van Chromium van slag brengt; de eerste was de gekrompen offerte-PDF, met een andere oorzaak en een andere oplossing.

Beide zijn gevonden door de gemaakte PDF na te meten, niet door de code te lezen.

Verder aangepast: het titelblok houdt nu de onderste 11 mm vrij, want daar zet de PDF-renderer het paginanummer neer. Zonder die marge liep het nummer door de legenda.

### Verificatie 10 september, Linux x64, Node 22.22.2

- **213 tests / 26 bestanden geslaagd, 37,7 s** (was 197). Zestien nieuwe tests: papiermaten per richting, wat elk sjabloon toont, geldigheid van alle drie de sjablonen, weigering van een tweede omslag, het planblad met bronrevisie en maat, een blok zonder gegevens dat niets verzint, filteren op ruimte in de materiaalstaat, de productlijst zonder armaturen en verborgen objecten, het lichtplan met groepen en LED, de inhoudshash die op ontwerp én inhoud reageert, één benoemde pagina per papiermaat, het colofon alleen in het technische pakket, het planblad op A3 staand met dezelfde exacte schaalbalk, de foutmelding bij een te krap blad, de datum in het titelblok, en een presentatie die doorgaat wanneer een blad niet past.
- **`pnpm probe:presentation` gevolgd door `scripts/verify-presentation-pdf.py`**: 8 pagina's, staande tekstpagina's en één liggend planblad, geen lege pagina's, geen tekst buiten de pagina, en een schaalreferentie van **99,998 mm** waar 100 mm hoort. Beide stappen draaien nu in de bouwstraat.
- TypeScript strict geslaagd.
- Omslag, materiaalstaat en planblad naar afbeelding gerenderd en bekeken, na elke correctie opnieuw.

### Nog open in fase 5

Opslaan en bewerken van presentaties in de app, **publiceren als onveranderlijke momentopname** met inhoudshash en vastgelegde assets, intrekbare deellinks met een webviewer, de **PPTX-uitvoer** via PptxGenJS, en de **exportworker** die idempotent en herstartbaar is. Fase 5 is dus bepaald niet afgerond; wat er nu ligt is het document en de PDF eronder.

## Aanvulling 10 september 2026 — fase 5, tweede deel: opslaan, publiceren en delen

Het documentmodel uit het vorige deel is nu een werkende module: presentaties bewaren, bewerken, publiceren en delen.

### Publiceren is onomkeerbaar en dat is het punt

Een presentatie heeft één bewerkbaar concept en daarnaast een reeks gepubliceerde versies die nooit meer veranderen. Publiceren haalt de inhoud op uit het ontwerp zoals het op dat moment is, bevriest die bij de versie — planbladen als vector, moodboardbeelden als data-URI, materiaal- en lichtgegevens als rijen — en legt een inhoudshash vast waarin ook de sjabloonversie zit.

Een deellink wijst altijd naar één versie. Het ontwerp mag daarna verder; de klant ziet wat er stond. Verandert het ontwerp wel, dan meldt het paneel **"Er zijn nieuwe ontwerpwijzigingen beschikbaar (revisie 3 → 4)"** met de knop om opnieuw te publiceren. Het publiceert nooit vanzelf.

**Twee keer publiceren met hetzelfde verzoek-ID levert dezelfde versie op.** Dat is precies de eis uit het masterprompt dat een mislukte poging geen dubbele publicatie maakt. De PDF wordt bij de versie bewaard en is daarna byte-identiek; een deellink wordt pas gemaakt nadat de PDF er is, zodat een gedeelde link nooit naar een half bestand wijst.

Migration `0013_presentations.sql` volgt hetzelfde patroon als de offertes: RLS met `FORCE ROW LEVEL SECURITY`, `tenant_isolation`-policies, en het runtime-account krijgt alleen SELECT en INSERT. Er is één uitzondering, expliciet toegekend: het concept mag worden bijgewerkt en een deellink mag worden ingetrokken. Gepubliceerde versies en exports kunnen niet worden gewijzigd, ook niet door de applicatie zelf.

### Twee echte fouten in het paneel

Beide kwamen aan het licht doordat de browserroute struikelde, en beide zouden een gebruiker echt hebben geraakt:

- **Een wijziging verdween zodra er twee in dezelfde tel gebeurden.** Het verlaten van een tekstveld en het klikken op een pijltje horen bij één handeling; beide handlers gingen uit van de definitie zoals die bij het renderen in de closure zat, dus de tweede overschreef de eerste. Elke wijziging loopt nu via één functie die van de laatst bekende definitie uitgaat, en de verzoeken gaan achter elkaar naar de server zodat die ze in dezelfde volgorde ziet.
- **De app slikte de klik in.** De knoppen om blokken te verschuiven stonden uit zolang er werd opgeslagen. Klikken vlak na het typen zette met het verlaten van het veld precies die knop uit, vóórdat de klik aankwam. Die knoppen blijven nu bruikbaar; het opslaan loopt toch op de achtergrond.

Verder: het paneel haalt een geopende presentatie opnieuw op bij het openen. Anders meldde het dat er geen ontwerpwijzigingen waren terwijl er sinds het sluiten van alles gebeurd kon zijn.

### Verificatie 10 september, Linux x64, Node 22.22.2, PostgreSQL 18.4 (embedded)

- **219 tests / 27 bestanden geslaagd, 42,4 s** (was 213). Zes nieuwe integratietests tegen een echte database: maken, bewerken en publiceren; hetzelfde verzoek dat geen tweede publicatie maakt; een gepubliceerde versie die niet meeverandert terwijl het concept de wijziging meldt; PDF die byte-identiek terugkomt plus deellink openen en intrekken; viewers die lezen maar niet schrijven en een andere organisatie die niets ziet; en een presentatie in een onbekend project.
- **20 browserroutes geslaagd, 2,7 min.** De nieuwe route stelt een presentatie samen, bewerkt kop en tekst, verschuift een blok, publiceert, haalt de PDF op, maakt een deellink en controleert dat die na intrekken 404 geeft, wijzigt daarna het ontwerp en ziet de melding over nieuwe wijzigingen terwijl versie 1 blijft staan.
- TypeScript strict en productiebuild geslaagd (11,5 s).
- Het paneel bekeken op de schermafbeelding.

**Eén testronde is anders afgelopen dan de andere.** Om 19:27 viel er één testbestand om met vier overgeslagen tests; drie ronden daarna waren schoon. Ik heb het niet kunnen herhalen en de oorzaak dus niet vastgesteld; het vermoeden is dat de ingebedde PostgreSQL op dat moment niet opstartte, vlak nadat de werkmap was opgeschoond. Dat is een vermoeden, geen conclusie.

### Nog open in fase 5

De **PPTX-uitvoer** via PptxGenJS en de **exportworker** die idempotent en herstartbaar is met taakstatus, retries en resulthash. De publicatie is nu synchroon: bij het publiceren wordt de PDF pas gemaakt zodra iemand hem opvraagt, en er is geen wachtrij die zware exports van lichte scheidt. Ook open: een webviewer die de presentatie in de browser toont in plaats van een PDF te downloaden, en het moodboard vullen vanuit de app (de beelden komen nu uit de bestaande afbeeldingsopslag, die nog "onderlegger" heet).

## Aanvulling 10 september 2026 — fase 5, derde deel: PowerPoint en de exportwerker

### PowerPoint uit hetzelfde documentmodel

`PptxGenJS` 4.0.1 maakt van dezelfde presentatie een PowerPoint. Teksten en tabellen worden **echte tekstvakken en tabellen**, dus in PowerPoint gewoon te bewerken.

Een planblad kan dat niet: PowerPoint kent geen vectorblad dat op ware schaal blijft. Het gaat daarom als afbeelding mee, en **dat staat op de dia zelf**: "Afbeelding van het planblad 1:50. Alleen de PDF is maatvast; print die op 100%." Een afbeelding van een plattegrond is geen maatvaste tekening en de app doet niet alsof.

Er worden maar twee lettertypen gebruikt, dezelfde als in de PDF, omdat een ontbrekend lettertype de opmaak stilzwijgend verandert op de computer van de klant. De bouwstraat controleert dat: `verify-presentation-pptx.py` keurt het diaformaat (10 × 5,625 inch), het aantal dia's, dat elke dia tekst heeft, dat er echte tabellen in zitten en dat er geen ander lettertype in het bestand staat.

**Wat niet op een dia past, wordt gemeld in plaats van afgekapt.** `pptxWarnings` geeft terug welke kop te lang is, welke tekst niet op één dia past en welke tabel meer regels heeft dan er passen — met de mededeling dat de rest wel in de PDF staat. De grenzen zijn nagemeten op het gekozen diaformaat en bewust aan de veilige kant. Uitgebreide PPTX-QA op echte klantdata schuift door naar fase 9; dat staat als concrete taak genoteerd.

### De exportwerker

Een exporttaak verwijst naar een **gepubliceerde versie en niet naar een bestand**. Dezelfde versie in hetzelfde formaat is altijd dezelfde taak: twee keer vragen levert geen twee exports en geen tweede publicatie op. De taak bewaart de invoerrevisie (de inhoudshash van die versie), het aantal pogingen en de hash van het resultaat.

Herstartbaar: een taak die halverwege afbreekt blijft op `running` staan met zijn starttijd. Loopt hij langer dan vijf minuten, dan gaat hij terug in de wachtrij met een poging erbij. Boven drie pogingen stopt het en blijft de fout staan, zichtbaar in de takenlijst, in plaats van eindeloos opnieuw te proberen. `FOR UPDATE SKIP LOCKED` zorgt dat twee werkers nooit dezelfde taak pakken.

**Een half bestand is nooit te downloaden.** Het bestand en de statuswissel naar `done` gaan in dezelfde transactie. Bestond het bestand al, dan wordt díe hash als resultaat vastgelegd — het resultaat verwijst naar wat er werkelijk ligt, niet naar wat er net gemaakt is. Een PowerPoint die nog niet gemaakt is, geeft 409 met een leesbare melding en geen knop die een leeg bestand oplevert.

De werker draait in hetzelfde proces als de API. Dat is genoeg voor twee gebruikers en houdt de installatie eenvoudig, maar de taken staan wél al in de database met status, pogingen en resultaat, zodat een losse werker ze later zonder wijziging kan oppakken. **pg-boss is nog steeds niet in gebruik**; dat blijft een open punt voor de beheerfase, samen met het scheiden van zware en lichte concurrency.

### Verificatie 10 september, Linux x64, Node 22.22.2, PostgreSQL 18.4 (embedded)

- **225 tests / 27 bestanden geslaagd, 43,3 s** (was 219). Zes nieuwe: drie over wat er niet op een dia past en het diaformaat, en drie integratietests over exporttaken — dezelfde taak bij herhaald vragen, een echte PPTX die als zip begint met de hash uit de taak, geen tweede bestand bij nog eens exporteren, een niet-gemaakte PowerPoint die 409 geeft, en exporteren van een ongepubliceerde versie dat wordt geweigerd.
- **20 browserroutes geslaagd, 2,8 min.**
- `pnpm probe:presentation` gevolgd door beide controlescripts: 8 pagina's met een schaalreferentie van exact 100 mm, en 9 dia's van 10 × 5,625 inch met 3 bewerkbare tabellen en alleen Georgia als lettertype. Beide staan in de bouwstraat.
- TypeScript strict en productiebuild geslaagd (11,2 s).

**De eerder gemelde onverklaarde testronde is deels opgehelderd.** De browserroutes vielen één keer om op `EACCES` bij `node_modules/.vite/deps`: de productiebuild draaide hier als root en liet een cachemap achter die de gewone gebruiker waarmee de tests draaien niet mocht opruimen. Dat is een eigenschap van deze werkwijze, niet van de code. Of dat ook de eerdere overgeslagen tests in de unitronde verklaart, weet ik niet; dat is niet vastgesteld.

### Nog open in fase 5

Een **webviewer** die de presentatie in de browser toont in plaats van een PDF te downloaden, het **moodboard vullen** vanuit de app, en **pg-boss** als echte queue met gescheiden concurrency. Uitgebreide PPTX-QA schuift naar fase 9.

## Aanvulling 10 september 2026 — fase 5, vierde deel: webviewer en moodboard

### De presentatie lezen in plaats van downloaden

Een deellink leverde tot nu toe een PDF-bestand af. Dat is voor een klant een omweg: eerst downloaden, dan een lezer openen. Dezelfde link opent nu de presentatie **in de browser**, met de maatvaste PDF als knop in de balk erboven.

De viewer is geen tweede opmaak. `presentationHtml` krijgt er één optie bij; die zet een schermstijl in `@media screen` en een balk vóór het document. De PDF wordt zonder die optie gemaakt, dus het papier verandert er niet van. Een test controleert dat letterlijk: de body van de PDF-uitvoer komt onveranderd terug in de viewer, en de PDF-uitvoer bevat geen schermstijl en geen knoppen.

**Op het scherm is de tekening geen maat meer.** Een planblad van 420 mm past niet in een venster van 1030 pixels, dus de SVG wordt naar de breedte geschaald. Dat mag niet stilzwijgend gebeuren bij een tekening waar iemand maten uit zou kunnen halen: de balk zegt "Schermweergave. Alleen de PDF is maatvast; print die op 100%." Dezelfde zin die ook op de PowerPoint-dia met het planblad staat.

De pagina laadt niets van buiten. De eigen `Content-Security-Policy` stond al in het document; dezelfde regel gaat nu ook als kopregel mee, samen met `nosniff`, zodat een browser die de meta negeert er evenmin iets bij haalt. In de app draait dezelfde pagina in een afgeschermd venster (`sandbox`) zonder scripts.

De controle op de link is niet veranderd en wordt niet omzeild: `publicView` doet dezelfde query als `publicPdf`, met dezelfde tenant-instelling, dus de rijbeveiliging van de database geldt onverkort. Een ingetrokken of verlopen link geeft 404, en de link van de ene werkruimte werkt niet in de andere — beide staan als test.

### Het moodboard vullen

Het moodboardblok bestond al in het documentmodel, maar er was geen manier om er beelden in te krijgen. Nu wel: uploaden vanuit het presentatiepaneel, of kiezen uit de **beeldbank** van de werkruimte. Onderleggers en moodboardbeelden staan in dezelfde opslag — wat je onder een tekening kunt leggen, kun je ook op een moodboard zetten — en `GET /api/v1/images` geeft die lijst zonder de bytes; die worden per afbeelding opgehaald.

Per beeld een onderschrift, en volgorde en verwijderen met knoppen. Het onderschrift hoort bij het blok en niet bij de afbeelding, zodat hetzelfde beeld in twee presentaties anders benoemd kan worden. De grens van twaalf beelden staat op één plek in het schema en het paneel gebruikt diezelfde constante.

De uploadcode stond dubbel; onderlegger en moodboard delen nu één functie.

### Twee dingen die alleen bij kijken opvielen

- **`.viewer` was al bezet.** Het 3D-venster gebruikt die klassenaam met `position: relative`, dus het voorbeeldvenster kwam niet gecentreerd in beeld maar 933 pixels naar beneden, half buiten het scherm. Gemeten met `getComputedStyle` in de browser, niet geraden. De dialoog heet nu `presentation-viewer`.
- **`.block-list li` selecteerde te veel.** Het moodboard heeft zelf een lijst, dus de blokkenlijst pakte de beelden erbij — zowel in de opmaak als in de browsertest. Beide kijken nu alleen naar directe kinderen.

Verder bleek de browsertest afhankelijk van wat er toevallig al in de beeldbank stond: alleen gedraaid was die leeg, in de volledige suite niet. De route uploadt nu een beeld, haalt het van het moodboard af en kiest het daarna opnieuw uit de bank — dat werkt in beide gevallen en toetst bovendien precies wat het moet toetsen.

### Verificatie 10 september, Linux x64, Node 22.22.2, PostgreSQL 18.4 (embedded)

- **230 tests / 27 bestanden geslaagd, 43,8 s** (was 225). Vijf nieuwe: de viewer die hetzelfde document toont als de PDF, de PDF die geen schermstijl krijgt, de viewer die niets van buiten laadt, de beeldbank die een moodboard vult met een beeld dat daarna in de pagina staat, en een deellink die in de browser opent en na intrekken 404 geeft — ook voor een andere werkruimte.
- **20 browserroutes geslaagd, 2,7 min.** De presentatieroute is uitgebreid: een echte PNG uploaden, weghalen, opnieuw uit de beeldbank kiezen, de viewer openen en daarin het planblad nameten (het past binnen het venster en is niet tot een postzegel gekrompen), en de deellink die nu naar de viewer wijst terwijl de PDF eraan vast blijft zitten.
- `pnpm probe:presentation` met beide controlescripts: 8 pagina's met een schaalreferentie van exact 100 mm, en 9 dia's van 10 × 5,625 inch met 3 bewerkbare tabellen en alleen Georgia. De offerteproef en `verify-quote-pdf.py` ook opnieuw gedraaid: 7 pagina's, 40 unieke posten, exact totaal, schaallijn 100 mm.
- TypeScript strict en productiebuild geslaagd (11,4 s). Bekende chunkgroottewaarschuwing blijft open.
- Schermafbeeldingen `outputs/qa/presentatie-webviewer.png` en `presentatie-webviewer-plan.png` daadwerkelijk bekeken: donkere balk met titel, versie en de melding over maatvastheid, witte bladen op een grijze ondergrond, de moodboardafbeelding op zijn plek en het planblad passend in beeld.

### Nog open in fase 5

**pg-boss** als echte wachtrij met gescheiden concurrency voor zware en lichte taken; de werker draait nog in het API-proces. Uitgebreide PPTX-QA op echte klantdata schuift naar fase 9. Verder is het 3D-camerablok afhankelijk van fase 7.
