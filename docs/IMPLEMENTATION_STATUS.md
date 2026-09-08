# Implementatiestatus — Studio

## Aanvulling 8 september 2026 — fase 6, offerteconcepten en finalisatie

Toegevoegd: offerteformulier met klant-/adresgegevens, datum/geldigheid, voorwaarden, maximaal 200 posten, handmatige prijzen en materiaalkeuzebronnen. EUR-bedragen gebruiken decimal.js met geïsoleerde precisie 40: hoeveelheid × eenheidsprijs × (1 − korting/100), netto per regel op centen ROUND_HALF_UP, daarna belasting over de som per categorie op centen. Negatieve eenheidsprijzen zijn correcties, hoeveelheden zijn niet-negatief. Belastingtarieven zijn per categorie instelbaar. Lege concepten zijn toegestaan, lege finalisatie niet.

Migration 0010_quotes bewaart immutable concept-/definitieve snapshots onder FORCE RLS. Elke write vereist owner/admin/finance, projectcontext, baseVersion en een herhaalbaar requestId. Finalisatie en jaar-/organisatienummering zijn één transactie; definitieve versies weigeren wijzigingen. Materialen bewaren entry-/version-ID, onbekende/vreemde bronnen worden afgewezen, dubbele materiaalbronnen geweigerd. Verschillen zijn opvraagbaar; verouderde bronnen blokkeren finalisatie. Finalisatie neemt dezelfde materiaal-publicatielock zodat een wijziging niet tussen controle en commit kan vallen. Er wordt geen verzending of klantacceptatie gefingeerd.

Lokale verificatie op Windows, 8 september:
- TypeScript strict geslaagd; Vite-productiebuild met `--configLoader runner` geslaagd (9,49 s). Bekende grote chunks blijven bestaan.
- Vier nieuwe rekentests geslaagd; bredere run: 31 geslaagd, één bestaande opslagtest faalde bij het aanmaken van een symlink (Windows EPERM). Geen geslaagde volledige suite geclaimd.
- Vier nieuwe echte PostgreSQL/API-tests en een browserroute toegevoegd. Lokale database-start blokkeert vóór de tests door `uv_os_get_passwd returned ENOMEM` in embedded-postgres. Deze integratie- en E2E-tests zijn dus nog niet geslaagd.
- Afzonderlijke Chrome-schermproef met expliciet gemockte API geslaagd: komma-invoer, totaal 54,44 EUR, concept bewaren, desktop 1440×1000 en mobiel 390×844 zonder horizontale overflow of page errors. Screenshots daadwerkelijk bekeken: velden en acties leesbaar, formulier scrollt binnen het venster. Dit is UI-bewijs met fictieve data, geen bewijs van echte opslag/finalisatie.
- De normale configbundler kreeg een Windows-maptoegangsfout; Vite/Vitest runner-configloader werkt. Tijdelijke PostgreSQL-map gebruikt nu os.tmpdir(); Unix-socketflags worden op Windows weggelaten. De gepinde Windows-PostgreSQL-build is toegevoegd aan de bestaande allowBuilds-lijst. Geen dependencyversies gewijzigd.

Fase 6 is niet afgerond. Eerstvolgend: PostgreSQL/API- en echte browsertests op Linux-CI uitvoeren en eventuele fouten oplossen. Daarna offerte-PDF vanuit dezelfde snapshot/rekenuitvoer, immutable presentatiebijlagen (afhankelijk van fase 5), vervolgversies, expliciete statusovergangen, ontwerpbronnen en catalogusprijsversies. Deze stap kent alleen concept en definitief; geen verzonden/acceptatieclaim. Geen productie-uitrol.

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

CI, gepind release-manifest en inventaris van 36 directe package-licenties aanwezig. CI nog niet extern uitgevoerd; native/transitieve licentie-inventaris nog niet compleet. Ontwikkelsnelstart in README. De Linux-container is alleen een renderproef.

Open: account recovery/password reset, expliciete projectmembership, volledige rechtenmatrix, productie-Compose/installatie, assetroutes/S3, operationele back-up/restore. Geen productiegeschiktheidsclaim.

## Fase 2 — gedeeltelijke proef, niet afgerond

Muren/openingen/items/commands aanwezig. Nog geen robuuste muurjoins of netto ruimteoppervlakken, groepen/multi-select, onderleggers, lokale opt-in IndexedDB recovery of conflictvariantduplicatie. Schrijflease hervat na herladen direct via sessionStorage + Web Locks. Een gedupliceerde tab met gekopieerde sessionStorage krijgt geen schrijfrechten. Zonder Web Locks blijft de veilige terugval met maximaal 45 s wachttijd bestaan. RestoreContent is een interne proefcommand en moet naar expliciete revisie-/undo-semantiek voor release.

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
