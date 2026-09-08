# Studio — interieurontwerp

Een lokale ontwikkelbasis voor een professionele ontwerpstudio. Projecten en geometrie worden in PostgreSQL bewaard. De proef bevat 2D-tekenen, maatvaste meubels, undo, revisies, een 3D-geometrieweergave en een schaalplanblad. Uitnodigingen en tweestapsverificatie zijn beschikbaar. Dit is **geen productieversie**; offertes, materialen, presentatie, imports en AI zijn nog niet geïmplementeerd.

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

## Versies bewaren en terugzetten

Klik **Revisie bewaren** om het opgeslagen ontwerp vast te leggen. Open **Versiegeschiedenis**, kies een bewaarde revisie en bevestig **Deze versie herstellen**. De huidige versie wordt automatisch bewaard als **Voor herstel**; je kunt die later ook terugzetten. Herstel maakt een nieuwe revisie en vereist bewerktoegang. De lijst toont de laatste 100 bewaarde versies.

## Ruimtes en alternatieven

De linkerzijbalk toont automatisch gesloten kamers en hun oppervlakte tot de muurhartlijnen. Dit is geen netto vloeroppervlak of bestelhoeveelheid. Verbind muurpunten expliciet: kruisingen of los rakende muren worden gemeld. De 3D-vloer volgt de herkende contour.

Open **Ontwerpvarianten** om een opgeslagen ontwerp als zelfstandig alternatief te kopiëren. Geef het alternatief een naam en klik **Variant maken**. Wijzigingen raken het basisontwerp niet. Via dezelfde lijst wissel je terug; de huidige naam staat boven in het ontwerp. Er kunnen maximaal 100 varianten per project bestaan. De oorspronkelijke geschiedenis blijft bij de bronvariant.

## Eigen meubelbibliotheek

Open **Eigen bibliotheek** in het ontwerp. Kies **Bibliotheekitem maken**, vul naam, type, maten in millimeters en kleur in, en bewaar de versie. Met **Plaats …** voeg je de nieuwste versie toe aan het ontwerp. Een **Nieuwe versie van …** wijzigt alleen toekomstige plaatsingen: een bank van 2400 mm blijft in je bestaande ontwerp 2400 mm als de nieuwe bibliotheekversie 3000 mm breed is. In de eigenschappen zie je welke versie geplaatst is. Maatwerk moet je expliciet toestaan om van de bibliotheekmaten af te wijken.

Vul optioneel categorie, leverancier, artikelnummer, omschrijving en maximaal 20 zoektermen in. **Zoeken in bibliotheek** doorzoekt de nieuwste versies op deze gegevens en naam, zonder onderscheid tussen hoofd- en kleine letters. Het categoriefilter gebruikt de volledige categorienaam; laat beide velden leeg om alles te tonen. **Meer items laden** behoudt de filters. Geplaatste meubels bewaren hun productgegevens; deze staan in het eigenschappenpaneel.

Bij het maken van een bibliotheekversie kun je onder **Eigen 2D-symbool** rechthoeken, ellipsen en lijnen toevoegen. Selecteer een vorm in het voorbeeld of de lijst, stel positie, maat en kleuren in, en klik **Vorm toepassen**. De vormmaten zijn percentages van de meubelbreedte en -diepte; het voorbeeld volgt de fysieke verhouding. Bewaar daarna de bibliotheekversie. Maximaal 32 vormen per symbool. De plattegrond en SVG-export gebruiken dezelfde vormen.

Open in de bibliotheek **3D-model controleren (GLB)** om een lokaal bestand te inspecteren. De controle ondersteunt statische driehoekmodellen zonder textures, animaties, compressie of externe bronnen, tot 10 MiB en 100.000 driehoeken. Je ziet de berekende breedte, diepte, hoogte en een draaibare preview in een neutrale kleur. Controleer de maten en oriëntatie en vink de bevestiging aan. Klik **Model bewaren en meubel maken**: de server controleert het bestand opnieuw en bewaart de geometrie. Geef het meubel een naam en bewaar de bibliotheekversie. Na plaatsen verschijnt het model ook na herladen in 3D; de geometrie volgt de meubelmaten. De oorspronkelijke GLB en materialen worden niet bewaard. Er geldt een limiet van 100 modellen en een opslagbudget van 200 MiB per werkruimte. De 3D-weergave toont maximaal 500.000 modeldriehoeken; bij ontbrekende of te zware modellen verschijnt een blokvorm met melding.

## Materiaalkeuzes

Open **Materiaalkeuzes** in het ontwerp. De lijst hoort bij het project en wordt gedeeld door alle varianten. Leg categorie (ook vrije invoer), ruimte/oppervlak, leverancier, collectie, artikelnummer en kleurcode vast. Kies een eenheid; een lege hoeveelheid betekent onbekend. Voor een handmatig aantal is een onderbouwing verplicht. Deze hoeveelheden worden niet automatisch uit de plattegrond berekend of bijgewerkt.

De keuzestatus loopt van **Nog te kiezen** via voorstel/monster/gekozen naar eventueel **Door klant bevestigd** of **Vervangen**. Klantbevestiging vereist een datum en bron; dit is een handmatige registratie, geen digitaal akkoord van de klant. Iedere wijziging maakt een nieuwe vaste versie met auteur en tijdstip. Bij gelijktijdige wijzigingen vraagt de app om de nieuwste versie te openen. Maximaal 200 materiaalkeuzes per project; gebruikers met alleen leestoegang kunnen de lijst bekijken.

## Offerteconcepten — eerste deel van fase 6

Eigenaar, beheerder en finance openen **Offertes** in het ontwerp. Maak een concept, vul klantgegevens en geldigheid in en voeg handmatige posten of materiaalkeuzes toe. Controleer hoeveelheid, eenheidsprijs, korting, belastingcategorie, tarief en prijsbron. Komma-invoer wordt genormaliseerd. Een materiaal zonder hoeveelheid vereist expliciete invoer. Prijzen zijn exclusief belasting; negatieve eenheidsprijzen zijn correcties.

**Concept bewaren** legt een vaste versie vast. **Materiaalverschillen controleren** toont wijzigingen sinds de gekozen bronversie. Overnemen wijzigt de materiaalgegevens; de handmatige prijs blijft staan en moet opnieuw worden beoordeeld. Een materiaalkeuze kan maar eenmaal in dezelfde offerte voorkomen. **Definitief maken** bevriest klantgegevens, voorwaarden, posten en berekende bedragen en kent transactioneel een nummer per organisatie/offertejaar toe. Deze actie verstuurt niets. Designer en viewer hebben geen toegang tot de offertetools of -API.

Dit is een eerste implementatie, geen volledige fase 6: PDF-export, presentatiebijlagen, vervolgrevisies van definitieve offertes, verdere statussen, ontwerpmeubelbronnen en catalogusprijsversies ontbreken nog. De nieuwe database- en browsercontroles moeten op een ondersteunde testomgeving slagen; zie de implementatiestatus.

## Verifiëren

```sh
pnpm build
pnpm test
PLAYWRIGHT_BROWSERS_PATH="$PWD/work/browsers" pnpm exec playwright install chromium
pnpm test:e2e
pnpm probe:pdf
node scripts/release-manifest.mjs
```

Browser- en integratietests gebruiken afzonderlijke lokale databases en fictieve accounts. Playwright bewaart screenshots in `outputs/qa`, overige testdata in `work`. `scripts/verify-pdf.py` vereist Python met pdfplumber en controleert de uiteindelijke PDF-vectoren. Linux-renderproef: `bash scripts/probe-linux.sh` met een actieve Docker-engine. Deze bouwt een lokaal image en voert één geïsoleerde, netwerkloze render uit; geen productie-installatie.

## Grenzen en vervolg

Met Web Locks hervat dezelfde tab de schrijflease direct na herladen; een gedupliceerde tab blijft in leesmodus. Zonder Web Locks valt de editor veilig terug op een nieuwe lease en kan herladen maximaal 45 seconden wachttijd geven. De 3D-proef gebruikt blokvormige meubels en vloeren volgens herkende kamercontouren; muurverbindingen en netto ruimtegeometrie zijn nog in ontwikkeling. PDF is een renderproef, nog geen productie-exportqueue. Nog geen productie-Compose, back-up/herstelprocedure of Hyper-V-validatie.

De precieze voortgang, testresultaten en eerstvolgende stappen staan in `docs/IMPLEMENTATION_STATUS.md`. Alle oorspronkelijke eisen staan in `docs/MASTERPROMPT.md` en `docs/ACCEPTANCE_MATRIX.md`. Gepinde dependencies en migrations staan in `release-manifest.json`. `docs/DEPENDENCY_LICENSES.json` inventariseert de licenties van 36 directe packages; transitieve en native licentiebijlagen zijn nog niet compleet. CI is ingecheckt, maar nog niet op een externe runner uitgevoerd.

## GitHub en volgende updates

De vaste projectrepository is [patrickdekker82/madebyjane](https://github.com/patrickdekker82/madebyjane). De gebruiker heeft op 7 september 2026 gevraagd de bestaande code hierheen te pushen en deze repository bij volgende updates te blijven gebruiken. Leg afgeronde, gecontroleerde wijzigingen vast in Git en push ze naar deze repository. Controleer vooraf de remote-status; overschrijf geen afwijkende remote-geschiedenis met een force-push. Lokale credentials, testdatabases en gegenereerde bestanden blijven uitgesloten via `.gitignore`.
