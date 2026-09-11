# Studio — interieurontwerp

Een lokale ontwikkelbasis voor een professionele ontwerpstudio. Projecten en geometrie worden in PostgreSQL bewaard. De proef bevat 2D-tekenen, maatvaste meubels, undo, revisies, een 3D-geometrieweergave en een schaalplanblad. Uitnodigingen en tweestapsverificatie zijn beschikbaar. Dit is **geen productieversie**; materiaalkeuzes en offertes zijn beschikbaar; de volledige presentatiemodule, productie-infrastructuur en AI staan nog open.

## Lokaal starten

Benodigd: Node 22.22+ of 24 LTS, pnpm 11.19.0 en vrije poorten 4310, 4311 en 55432. Gebruik een lokale schijf voor de database. Embedded PostgreSQL wordt alleen voor ontwikkeling gebruikt.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Laat dit proces draaien. Maak in een tweede interactieve terminal één eigenaar aan:

```sh
pnpm setup
```

De setup vraagt naam, e-mail en een verborgen wachtwoord van 12–128 tekens. Er bestaat geen standaardaccount. Open http://127.0.0.1:4310 en log in. Maak een project en kies desgewenst de fictieve woonkamer. Via **Toegang** maak je een eenmalige uitnodigingslink; deze wordt niet automatisch verstuurd. Via **Beveiliging** stel je een authenticator in en bewaar je de eenmalige herstelcodes.

Selecteer een muur, deur of raam in de objectlijst om de maatvelden te openen. Alle maten zijn in millimeters. Bij een muur kun je beide eindpunten, dikte en hoogte aanpassen; gedeelde eindpunten verplaatsen ook aansluitende muren. Een raam krijgt daarnaast een borstweringshoogte. Klik **Maten toepassen** om op te slaan. Een opening buiten de muur wordt geweigerd; **Ongedaan maken** herstelt de vorige geldige wijziging.

`work/local-db` bevat ontwikkeldata en lokaal gegenereerde secrets. Verwijder deze map niet als je projecten wilt behouden. Stop `pnpm dev` met Ctrl+C; opnieuw starten hergebruikt de database. Bewaar deze directory buiten gedeelde of automatisch opgeschoonde opslag. Het huidige setup-script is alleen voor deze lokale ontwikkelomgeving.

## Precies plaatsen

De onderbalk heeft twee schakelaars. **Raster snap** rondt af op 100 mm. **Vangen aan objecten** laat een punt aansluiten op een bestaand muurpunt, op een muurhartlijn of uitlijnen op een ander meubel; tijdens het slepen zie je gestreepte hulplijnen. De vangafstand is twaalf schermpixels, omgerekend naar millimeters, dus bij elke zoomstand even ver. Een muurpunt wint van een muur, een muur van een object en een object van het raster.

Selecteer meerdere meubels met shift, ctrl of cmd, in de plattegrond of in de objectlijst. Het eigenschappenpaneel toont dan zes uitlijningen en twee verdelingen. Uitlijnen gebruikt de omhullende van elk meubel inclusief draaiing; verdelen maakt de tussenruimten gelijk en laat de buitenste meubels staan. De hele actie is één stap terug.

## Onderlegger

Leg een foto of scan van een bestaande plattegrond onder je tekening: kies links onder **Onderlegger** een PNG of JPEG van maximaal 16 MiB. SVG en PDF worden geweigerd, omdat dat actieve inhoud kan bevatten; zet een PDF eerst zelf om naar een afbeelding.

Een verse onderlegger staat op **nog niet gekalibreerd** en gebruikt een aangenomen schaal. Klik **Inmeten**, wijs twee punten aan waarvan je de echte afstand kent en vul die in. De schaal wordt niet als getal bewaard maar uit die twee punten en die maat afgeleid, zodat altijd te zien is waar hij vandaan komt. Doorzichtigheid stel je in met de schuifregelaar.

## Meten en maatlijnen

Het gereedschap **Maat** meet en legt vast in één handeling: klik het eerste punt, lees de maat mee terwijl je beweegt en klik het tweede punt om de maatlijn te bewaren. Escape breekt af als je alleen wilde meten. Het vangen werkt hier net als bij tekenen, dus meten tussen twee muurpunten geeft exact de muurlengte. De lengte wordt niet opgeslagen maar uit de twee punten berekend; een maatlijn kan dus nooit iets anders beweren dan de tekening. Maatlijnen komen ook op het planblad.

Een bewaarde maatlijn kun je selecteren in de plattegrond of in de objectlijst (**Maat 1**, **Maat 2**, …). Het eigenschappenpaneel toont de gemeten lengte — die is afgeleid en niet los te wijzigen — en laat je de afstand tot de gemeten lijn instellen of de maatlijn naar de andere kant klappen.

Met het gereedschap **Selecteren** trek je op leeg vlak een kader om meerdere meubels tegelijk te pakken; alles wat het kader raakt komt in de selectie. Een klik zonder slepen heft de selectie op.

Selecteer twee of meer meubels en klik **Groeperen**; daarna pakt één aanwijzen de hele groep en bewegen ze samen, als één stap terug. **Groep opheffen** maakt ze weer los. Een groep is alleen een gedeelde verwijzing op de meubels zelf: blijft er nog maar één over, dan verdwijnt de groep vanzelf.

Sneltoetsen: `v` selecteren, `m` muur, `d` deur, `r` raam, `t` maat. Escape gaat terug naar selecteren, Delete verwijdert de selectie, Ctrl of Cmd met `z` is een stap terug en met shift erbij opnieuw. In invoervelden blijven de toetsen gewoon typen.

## Notities en het tekenblad

Met het gereedschap **Notitie** zet je een tekst op het plan; het gereedschap springt daarna terug naar Selecteren zodat je de tekst meteen kunt aanpassen. Notities komen ook op het geëxporteerde planblad.

Het planblad heeft een legenda die per laag meldt hoeveel objecten getoond en hoeveel verborgen zijn, zodat een onvolledig blad zichzelf verraadt.

## Lagen

Elk meubel hoort bij een laag: inrichting, afwerking, elektra, verlichting of technische presentatie. Het lagenpaneel links toont per laag hoeveel objecten erin zitten, met een oog om de laag te verbergen en een slot om hem te vergrendelen. Een verborgen object verdwijnt uit het plan en doet niet mee aan het vangen, maar blijft in de objectlijst staan. Een vergrendeld object is niet te verplaatsen of te verwijderen; die controle zit in de server, niet alleen in de interface. Met een selectie kun je de laag wijzigen en objecten naar voren of naar achteren halen. De knoppen onder **Blad tonen** zetten in één keer één laag aan en de rest uit — handig voor een elektra- of verlichtingsblad. Dat is één stap terug, en wat je op het scherm ziet komt zo ook op de export.

## Versies bewaren en terugzetten

Klik **Revisie bewaren** om het opgeslagen ontwerp vast te leggen. Open **Versiegeschiedenis**, kies een bewaarde revisie en bevestig **Deze versie herstellen**. De huidige versie wordt automatisch bewaard als **Voor herstel**; je kunt die later ook terugzetten. Herstel maakt een nieuwe revisie en vereist bewerktoegang. De lijst toont de laatste 100 bewaarde versies.

## Ruimtes en alternatieven

De linkerzijbalk toont automatisch gesloten kamers en hun oppervlakte tot de muurhartlijnen. Dit is geen netto vloeroppervlak of bestelhoeveelheid. Verbind muurpunten expliciet: kruisingen of los rakende muren worden gemeld. De 3D-vloer volgt de herkende contour.

Open **Ontwerpvarianten** om een opgeslagen ontwerp als zelfstandig alternatief te kopiëren. Geef het alternatief een naam en klik **Variant maken**. Wijzigingen raken het basisontwerp niet. Via dezelfde lijst wissel je terug; de huidige naam staat boven in het ontwerp. Er kunnen maximaal 100 varianten per project bestaan. De oorspronkelijke geschiedenis blijft bij de bronvariant.

## Eigen meubelbibliotheek

Open **Eigen bibliotheek** in het ontwerp. Kies **Bibliotheekitem maken**, vul naam, type, maten in millimeters en kleur in, en bewaar de versie. Met **Plaats …** voeg je de nieuwste versie toe aan het ontwerp. Een **Nieuwe versie van …** wijzigt alleen toekomstige plaatsingen: een bank van 2400 mm blijft in je bestaande ontwerp 2400 mm als de nieuwe bibliotheekversie 3000 mm breed is. In de eigenschappen zie je welke versie geplaatst is. Maatwerk moet je expliciet toestaan om van de bibliotheekmaten af te wijken.

Kies bij **Anker bij plaatsen** welk punt van het meubel je aanwijst: standaard het midden, maar met **Achterzijde** komt een kast met zijn rug op het punt waarop je klikt in plaats van met zijn hart. Het anker draait mee met het meubel. Bij **Schalen** leg je vast hoeveel vrijheid de maten hebben: vrij, alleen gelijkmatig (breedte en diepte houden hun verhouding) of een vaste handelsmaat, die ook met maatwerk niet te rekken is. Bestaande plaatsingen veranderen hier niet van; die houden de regel van hun eigen versie.

Onder **Prijs** noteer je de inkoop- of lijstprijs van het item. Vul je een bedrag in, dan zijn ook de prijsbron en de prijsdatum verplicht: een bedrag zonder herkomst is later niet meer te controleren. Wat de klant betaalt blijft een aparte keuze per project. Onder **Rechten** leg je licentie, rechthebbende en een eventuele verplichte vermelding vast. Zet je **Leveranciersgegevens mogen mee in presentaties en exports** uit, dan blijft het meubel gewoon in tekening en productlijst staan, maar gaan leverancier en artikelnummer niet mee in de PDF of PowerPoint; het document meldt dan hoeveel producten dat betrof. Een verplichte vermelding wordt juist wel afgedrukt.

Vul optioneel categorie, leverancier, artikelnummer, omschrijving en maximaal 20 zoektermen in. **Zoeken in bibliotheek** doorzoekt de nieuwste versies op deze gegevens en naam, zonder onderscheid tussen hoofd- en kleine letters. Het categoriefilter gebruikt de volledige categorienaam; laat beide velden leeg om alles te tonen. **Meer items laden** behoudt de filters. Geplaatste meubels bewaren hun productgegevens; deze staan in het eigenschappenpaneel.

Bij het maken van een bibliotheekversie kun je onder **Eigen 2D-symbool** rechthoeken, ellipsen en lijnen toevoegen. Selecteer een vorm in het voorbeeld of de lijst, stel positie, maat en kleuren in, en klik **Vorm toepassen**. De vormmaten zijn percentages van de meubelbreedte en -diepte; het voorbeeld volgt de fysieke verhouding. Bewaar daarna de bibliotheekversie. Maximaal 32 vormen per symbool. De plattegrond en SVG-export gebruiken dezelfde vormen.

Open in de bibliotheek **3D-model controleren (GLB)** om een lokaal bestand te inspecteren. De controle ondersteunt statische driehoekmodellen zonder textures, animaties, compressie of externe bronnen, tot 10 MiB en 100.000 driehoeken. Je ziet de berekende breedte, diepte, hoogte en een draaibare preview in een neutrale kleur. Controleer de maten en oriëntatie en vink de bevestiging aan. Klik **Model bewaren en meubel maken**: de server controleert het bestand opnieuw en bewaart de geometrie. Geef het meubel een naam en bewaar de bibliotheekversie. Na plaatsen verschijnt het model ook na herladen in 3D; de geometrie volgt de meubelmaten. De oorspronkelijke GLB en materialen worden niet bewaard. Er geldt een limiet van 100 modellen en een opslagbudget van 200 MiB per werkruimte. De 3D-weergave toont maximaal 500.000 modeldriehoeken; bij ontbrekende of te zware modellen verschijnt een blokvorm met melding.

## Materiaalkeuzes

Open **Materiaalkeuzes** in het ontwerp. De lijst hoort bij het project en wordt gedeeld door alle varianten. Leg categorie (ook vrije invoer), ruimte/oppervlak, leverancier, collectie, artikelnummer en kleurcode vast. Kies een eenheid; een lege hoeveelheid betekent onbekend. Voor een handmatig aantal is een onderbouwing verplicht.

Zet **Bereken uit de ontwerpgeometrie** aan om de hoeveelheid uit het ontwerp te halen. Kies een herkende ruimte, een bronmaat (netto vloeroppervlak, netto wandoppervlak, netto omtrek of plintlengte), een snijverliespercentage en eventueel een bestelstap. Netto contouren liggen een halve muurdikte binnen de hartlijn; de plintlengte trekt deurbreedtes af en het wandoppervlak trekt alle openingen af. De server rekent bij het bewaren zelf opnieuw en legt bronrevisie, formule-inputs, netto, snijverlies, bruto en bestelhoeveelheid onveranderlijk vast. Wijzigt het ontwerp, dan meldt de lijst **Verouderd** met de oude en nieuwe waarde; **Herbereken** maakt daar een nieuwe materiaalversie van. Een afwijkende hoeveelheid invullen blijft mogelijk en vereist een onderbouwing; die wordt dan niet automatisch herberekend.

Leg per keuze een **prijsbron**, prijsdatum en eenheidsprijs vast. Een prijs zonder bron en datum wordt geweigerd; de lijst toont dan hoeveelheid maal eenheidsprijs als indicatiebedrag. Dat is geen offerteregel: er zit geen korting, belasting of prijsbevriezing in. De **monsterstatus** staat los van de keuzestatus en vraagt een eigen datum.

Onder **Alternatieven** leg je maximaal tien productvoorstellen vast met hun eigen leverancier, artikelnummer en prijs. Kiezen doe je in de lijst met **Kies …**: het alternatief schuift naar de hoofdplek, het eerder gekozen product schuift terug naar de alternatieven en de nieuwe versie vermeldt uit welk alternatief de keuze komt. De server controleert die herkomst, dus kies een alternatief eerst ongewijzigd en pas het daarna in een volgende versie aan.

De keuzestatus loopt van **Nog te kiezen** via voorstel/monster/gekozen naar eventueel **Door klant bevestigd** of **Vervangen**. Klantbevestiging vereist een datum en bron; dit is een handmatige registratie, geen digitaal akkoord van de klant. Iedere wijziging maakt een nieuwe vaste versie met auteur en tijdstip. Bij gelijktijdige wijzigingen vraagt de app om de nieuwste versie te openen. Maximaal 200 materiaalkeuzes per project; gebruikers met alleen leestoegang kunnen de lijst bekijken.

## Offertes — fase 6

Eigenaar, beheerder en finance openen **Offertes** in het ontwerp. Maak een concept, vul bedrijfs- en klantgegevens, datum, geldigheid en voorwaarden in. Voeg handmatige posten, materiaalkeuzes of objecten uit een bewaarde ontwerprevisie toe. Controleer hoeveelheden, prijzen, korting en belastingcategorieën. Negatieve eenheidsprijzen zijn correcties. De server berekent met decimalen; netto per regel op centen, daarna belasting per categorie met halve centen van nul af.

Onder **Prijsbronnen en presentatiebijlagen** bewaar en selecteer je catalogusprijsversies, tekstblokken, materiaalbladen en schaalplanbladen. Iedere bijlage bewaart haar eigen bronversies. Een gekoppeld ontwerpobject telt precies eenmaal. Dezelfde materiaalkeuze kan eenmaal voorkomen; hetzelfde leverancierartikel via materiaal én ontwerp vereist een onderbouwing van afzonderlijke leveringen. De indicatieve materiaalprijs is afzonderlijk van de commerciële offerteprijs: controleer die expliciet.

**Concept bewaren** legt een versie vast. **Materiaalverschillen controleren** toont materiaal-, prijs- en ontwerpwijzigingen. Materiaal- en prijswijzigingen vereisen een expliciete keuze voordat finalisatie kan slagen. Een oudere, onderling consistente ontwerpset mag worden gebruikt. Berekende materiaalhoeveelheden en planbijlagen moeten bij dezelfde ontwerprevisie horen.

**Definitief maken** bevriest afzender, klantgegevens, voorwaarden, bedragen en bijlagen en kent transactioneel een uniek nummer per organisatie/offertejaar toe. **Offerte-PDF downloaden** levert een bewaarde PDF van precies deze versie. **Deellink maken** geeft zeven dagen toegang tot uitsluitend die PDF; **Link intrekken** trekt deze toegang direct in. Kopieer en verstuur de link zelf. Wie de link heeft, kan de PDF lezen; de ontvanger moet de server kunnen bereiken.

Via **Versies bekijken** open je oude versies. **Vervolgconcept maken** maakt een bewerkbare opvolger. Bij definitief maken krijgt die een nieuw offertenummer en wordt de voorganger als vervangen geregistreerd. Oude inhoud, PDF en eerder vastgelegde reacties blijven intact. Bestaande links blijven naar de oude PDF wijzen totdat ze verlopen of worden ingetrokken.

**Verzending of klantreactie registreren** bewaart een handmatige registratie met actor, datum, onderbouwing en offertehash. Downloaden en delen zetten de status nooit automatisch op verzonden. Er is geen e-mailverzending of gekwalificeerde elektronische handtekening ingebouwd. Designer en viewer hebben geen toegang tot offertes of commerciële prijsbronnen. Inkoop- en margevelden zijn niet aanwezig.

## Verifiëren

```sh
PLAYWRIGHT_BROWSERS_PATH="$PWD/work/browsers" pnpm exec playwright install chromium
pnpm build
pnpm test
pnpm test:e2e
pnpm probe:pdf
pnpm probe:quote
python scripts/verify-quote-pdf.py
node scripts/release-manifest.mjs
```

Offerte-integratietests hebben ook Chromium nodig. Gebruik `QUOTE_CHROMIUM_PATH` voor een expliciet browserpad bij de offerte-renderer (ook op Windows). De PDF-verificaties vereisen Python met pdfplumber.

Heb je al een Chromium van Playwright op de machine staan, dan kun je de download overslaan met `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/pad/naar/chrome pnpm test:e2e`. Draai je de tests als root, dan start de ingebouwde PostgreSQL onder de bestaande `postgres`-systeemgebruiker; `scripts/local-db.ts` regelt de benodigde rechten op de tijdelijke datadirectory zelf.

Browser- en integratietests gebruiken afzonderlijke lokale databases en fictieve accounts. Playwright bewaart screenshots in `outputs/qa`, overige testdata in `work`. `scripts/verify-pdf.py` vereist Python met pdfplumber en controleert de uiteindelijke PDF-vectoren. Linux-renderproef: `bash scripts/probe-linux.sh` met een actieve Docker-engine. Deze bouwt een lokaal image en voert één geïsoleerde, netwerkloze render uit; geen productie-installatie.

## Grenzen en vervolg

Met Web Locks hervat dezelfde tab de schrijflease direct na herladen; een gedupliceerde tab blijft in leesmodus. Zonder Web Locks valt de editor veilig terug op een nieuwe lease en kan herladen maximaal 45 seconden wachttijd geven. De 3D-proef gebruikt blokvormige meubels en vloeren volgens herkende kamercontouren; muurverbindingen zijn nog in ontwikkeling. Netto hoeveelheden worden berekend, maar een ruimte wordt nog herkend aan haar muurpunten: verwijder of splits je een muur, dan vraagt de app om de bron opnieuw te kiezen. Offerte-PDF werkt met vaste snapshots en een begrensde lokale Chromium-renderer; een productie-exportqueue staat nog open. Nog geen productie-Compose, back-up/herstelprocedure of Hyper-V-validatie.

De precieze voortgang, testresultaten en eerstvolgende stappen staan in `docs/IMPLEMENTATION_STATUS.md`. Alle oorspronkelijke eisen staan in `docs/MASTERPROMPT.md` en `docs/ACCEPTANCE_MATRIX.md`. Gepinde dependencies en migrations staan in `release-manifest.json`. `docs/DEPENDENCY_LICENSES.json` inventariseert de licenties van 36 directe packages; transitieve en native licentiebijlagen zijn nog niet compleet. CI draait op GitHub Actions (ubuntu-24.04) en voert build, tests, browsertests en `pnpm audit` uit.

## GitHub en volgende updates

De vaste projectrepository is [patrickdekker82/madebyjane](https://github.com/patrickdekker82/madebyjane). De gebruiker heeft op 7 september 2026 gevraagd de bestaande code hierheen te pushen en deze repository bij volgende updates te blijven gebruiken. Leg afgeronde, gecontroleerde wijzigingen vast in Git en push ze naar deze repository. Controleer vooraf de remote-status; overschrijf geen afwijkende remote-geschiedenis met een force-push. Lokale credentials, testdatabases en gegenereerde bestanden blijven uitgesloten via `.gitignore`.
