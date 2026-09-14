# Masterprompt v2.0 — Studio, na de eerste productie-installatie

Versie 2.0 — 14 september 2026. Opvolger van [MASTERPROMPT.md](MASTERPROMPT.md) (v1.0, 5 september 2026).

## Hoe je dit document gebruikt

Lees eerst v1.0. Dat document blijft **onverkort geldig** als eisenbasis: de
acceptatiematrix verwijst er per bronalinea naar, en niets daarin is
ingetrokken. Dit document doet drie dingen die v1.0 niet kon doen, omdat het
geschreven is vóór de eerste echte installatie en vóór het
concurrentieonderzoek:

1. het legt vast wat er op een echte host is misgegaan en waarom;
2. het voegt eisen toe die uit onderzoek naar bestaande vakapplicaties komen;
3. het stelt de volgorde van werken opnieuw vast.

**Bij tegenstrijdigheid gaat dit document vóór.** Waar v1.0 zwijgt, geldt v1.0
niet als toestemming — dan geldt de eis hieronder.

Nieuwe eisen zijn genummerd (N1, N2, …) zodat de acceptatiematrix er rijen voor
kan krijgen. Vastgestelde defecten zijn genummerd (D1, D2, …) zodat ernaar
verwezen kan worden in commits en tests.

De manier van werken uit v1.0 §1 verandert niet: lever werkende
functionaliteit, houd `docs/IMPLEMENTATION_STATUS.md` en
`docs/ACCEPTANCE_MATRIX.md` bij, claim geen tests die je niet hebt gedraaid, en
markeer geen onvoltooide fase als afgerond.

---

# Deel I — Wat de eerste installatie heeft geleerd

Op 13 september 2026 is Studio geïnstalleerd op een VPS (6 vCPU, 12 GB RAM,
200 GB SSD, Ubuntu 24.04.5 LTS) achter WireGuard. De app draait en is in
gebruik genomen op het eigen subdomein van de studio. Dat is het goede nieuws
en het bewijs dat de architectuur draagt.

Deze repository is openbaar. Noem er geen adressen, hostnamen of andere
gegevens van de productie-installatie in; dit document beschrijft defecten van
een draaiende host en is daarmee precies het soort tekst waar zulke gegevens
niet in horen. De werkelijke waarden staan in `.env` op de host.

De installatie kostte echter een hele dag en vroeg negen handmatige ingrepen
die niet in enige handleiding staan. Elk daarvan is een defect, geen
bedieningsfout. Ze staan hieronder met de vastgestelde oorzaak. Ingrepen die
op de host zijn gedaan om verder te kunnen, zijn **workarounds** en moeten
verdwijnen zodra het defect is verholpen.

## D1 — De runtime haalt pnpm van het internet bij het starten

`infra/docker/Dockerfile.api` draait `corepack enable && corepack prepare
pnpm@11.19.0 --activate` tijdens de build, **als root**. Corepack legt het
resultaat in de `COREPACK_HOME` van root. De entrypoint stapt met `gosu` over
naar `node`, en díé heeft een lege `COREPACK_HOME` in `/home/node/.cache`.
Gevolg: `CMD ["pnpm", "start:api"]` en `command: ["pnpm", "db:migrate"]` laten
corepack bij elke containerstart opnieuw pnpm downloaden van
`registry.npmjs.org`.

Dat faalt op twee manieren tegelijk. Met `read_only: true` is er niets
beschrijfbaars (`ENOENT … mkdir '/home/node/.cache/node/corepack/v1'`), en op
het interne netwerk is de registry onbereikbaar (`EAI_AGAIN
registry.npmjs.org`).

**Eis:** een productiecontainer bereikt bij het starten geen enkele externe
registry. Bak de vastgezette pnpm zo in de image dat elke runtime-gebruiker hem
kan lezen — een gedeelde `COREPACK_HOME` die vóór `corepack prepare` wordt
gezet en wereld-leesbaar is, of een globaal geïnstalleerde pinned pnpm, of
roep de entrypoints rechtstreeks met `node` aan in plaats van via
pnpm-scripts. Kies één route en motiveer die in een ADR.

**Workaround die weg moet:** op de host is `migrator` aan het `edge`-netwerk
toegevoegd zodat hij de registry kón bereiken. Dat doorbreekt v1.0 §17
("database alleen op intern containernetwerk") en verzwakt de isolatie van de
migrator. Zet `networks: [private]` terug zodra D1 verholpen is, en leg in een
test vast dat de migrator slaagt zonder uitgaand internet.

## D2 — Twee tegenstrijdige poortvalidaties, met een publiek bereikbare app als gevolg

`scripts/preflight.sh` bevat op de geïnstalleerde boom twee controles op
`HTTP_PORT`/`HTTPS_PORT`. `check_publish()` accepteert `poort` én `adres:poort`
en controleert bovendien of het adres op de host bestaat — precies zoals
`.env.example` het beschrijft. Daarnaast staat er een oudere regel die alles
weigert wat niet uitsluitend cijfers is:

```sh
[[ "$HTTP_PORT" =~ ^[0-9]+$ ]] && [[ "$HTTPS_PORT" =~ ^[0-9]+$ ]] || fail "HTTP_PORT en HTTPS_PORT moeten poortnummers zijn."
```

De installatie loopt daarop vast bij de enige configuratie die de app van het
publieke internet af houdt. De operator wordt zo naar `HTTP_PORT=80` geduwd,
Docker publiceert op alle interfaces, en de app is vanaf het internet
bereikbaar op 443. Dat is tijdens deze installatie ook werkelijk gebeurd en is
pas opgemerkt bij de externe curl-test uit de checklist.

**Eis:** verwijder de oudere controle. `check_publish()` is de enige
validatie. Voeg een regressietest toe die vastlegt dat `10.8.0.1:443` wordt
geaccepteerd en dat een adres dat niet op de host bestaat wordt geweigerd. De
externe bereikbaarheidstest uit de checklist is geen optionele stap maar een
exitcriterium.

## D3 — Infrastructuurfixes stonden op een branch, de installatie kwam van `main`

De host is geïnstalleerd van `main` op `bf37d07`. In die boom ontbreekt
`{$CADDY_TLS}` in `infra/docker/Caddyfile`. Caddy viel daardoor altijd terug op
automatische publieke ACME, bleef Let's Encrypt proberen voor een naam die naar
`10.8.0.1` wijst, en genereerde nooit een eigen CA. De werkbranch bevat de
juiste Caddyfile én de juiste preflight.

**Eis:** infrastructuur- en installatiewijzigingen horen op `main` vóór een
installatie ze nodig heeft. Laat CI de installatieroute op `main` draaien, niet
alleen de unit- en browsertests. Een release-tag die geïnstalleerd mag worden,
is een tag waarop `scripts/install.sh` in CI is geslaagd.

## D4 — Datamappen worden aangemaakt met rechten die de containers buitensluiten

`$STUDIO_DATA_DIR/{assets,caddy,caddy-config}` ontstaan als `0700` van de
operator. De containers draaien als andere gebruikers: Caddy als UID 1001, de
API als `node`. Gevolg: `mkdir /data/caddy: permission denied` bij Caddy — die
daardoor ook geen certificaat kan wegschrijven — en `chown: cannot read
directory '/app/work/assets': Permission denied` bij de API.

Op de host is dit met `chmod 755` en `chmod 777` opgelost. **777 mag niet
blijven staan.**

**Eis:** `install.sh` maakt de datamappen aan met de eigenaar en modus die de
containers werkelijk nodig hebben, of de opzet gebruikt benoemde volumes en
laat Docker het regelen. `preflight.sh` controleert beschrijfbaarheid **als de
container-UID**, niet als de operator; de huidige `touch .write-check` als
operator bewijst het verkeerde.

## D5 — De hostaanname is Debian, de host is Ubuntu

De preflight waarschuwt bij niet-Debian, en de installatiedocumentatie geeft de
Docker-apt-route voor `download.docker.com/linux/debian`. Op Ubuntu 24.04
(noble) is dat pad `download.docker.com/linux/ubuntu` en levert de Debian-route
een 404 — ook met de gedocumenteerde terugval naar `bookworm`.

**Eis:** Debian 13 en Ubuntu 24.04 LTS zijn beide geteste doelen. Leid de
repository-URL en codenaam af uit `/etc/os-release` in plaats van ze vast te
leggen, en laat de preflight beide zonder waarschuwing toe. Noem in de
handleiding expliciet welke distributies getest zijn.

## D6 — Een ontbrekende sleutel in `.env` valt stil terug op onveilig gedrag

De checklist zet `CADDY_TLS` met `sed -i 's/^CADDY_TLS=.*/…/'`. Stond de
sleutel niet in `.env`, dan doet die `sed` niets, meldt niets, en start Caddy
met publieke ACME. Hetzelfde risico geldt voor elke andere sleutel die met
`sed` wordt gezet.

**Eis:** configuratie schrijven en configuratie controleren zijn twee
handelingen. Elke `sed` in de handleiding wordt gevolgd door een `grep` die de
uitkomst toont. `install.sh` faalt op een ontbrekende verplichte sleutel in
plaats van een default te kiezen; een stille default die de app publiek
exposeert of een certificaatroute wijzigt is geen default maar een defect.

## D7 — Een vastgezette digest die niet te halen is, blokkeert de hele installatie

`postgres:17.5-bookworm@sha256:0145b29…` gaf `not found` bij Docker Hub. Het
pinnen zelf is goed en blijft (v1.0 §3 verbiedt `latest`), maar een digest die
niet resolvet maakt installeren onmogelijk.

**Eis:** CI verifieert elke vastgezette digest in `release-manifest.json` met
`docker manifest inspect`. Een release met een niet-resolvende digest slaagt
niet. Blijf tag én digest noteren.

## D8 — PDF-generatie werkt niet op de productiehost

Gemeld door de gebruiker, **nog niet gediagnosticeerd.** De image installeert
Chromium uit apt en zet `QUOTE_CHROMIUM_PATH=/usr/bin/chromium`; de container
draait `read_only` met `tmpfs: [/tmp]`, `cap_drop: [ALL]` en een eigen
seccomp-profiel.

Kandidaten, in volgorde van waarschijnlijkheid: Chromium heeft een
beschrijfbare home-/cachemap nodig die er door `read_only` niet is (dezelfde
klasse als D1); het seccomp-profiel of de weggehaalde capabilities blokkeren
de sandbox; of het ontbreekt aan gedeeld geheugen (`/dev/shm`).

**Eis:** stel de oorzaak vast uit werkelijke containerlogs voordat je iets
wijzigt. Verzin geen oorzaak. Het bewijs van de oplossing is een offerte-PDF
die op de productiehost is gegenereerd en met `scripts/verify-quote-pdf.py` is
gecontroleerd — niet een test die lokaal slaagt.

## D9 — Er is geen back-up, en de gewenste bestemming zit achter de tunnel

Deel 3 van de installatiechecklist is niet uitgevoerd. Er is dus geen
terugweg, en `upgrade.sh` weigert terecht te draaien.

Nieuw gegeven: de gebruiker wil de eerste bestemming op de **eigen NAS in het
thuisnetwerk**. Die NAS is vanaf de VPS niet bereikbaar — het verkeer moet door
de WireGuard-tunnel die de VPS zelf aanbiedt. Dat vraagt een ontwerpkeuze die
v1.0 §19 niet kent: de thuislocatie wordt een **peer** met een `AllowedIPs` die
het NAS-subnet dekt, de VPS krijgt een route daarheen, en restic schrijft over
SFTP naar de NAS.

**Eis:** houd v1.0 §19 aan — twee versleutelde bestemmingen, op twee
verschillende plekken, geen van beide op deze VPS. De NAS is de eerste. De
tweede is objectopslag buiten het huis, juist omdat één brand beide
thuisbestemmingen tegelijk treft. Zorg waar mogelijk voor een kopie die de
apphost niet kan wissen. Een geslaagde upload telt niet; `verify-backup.sh`
naar een geïsoleerd doel telt wel.

---

# Deel II — Wat het concurrentieonderzoek oplevert

Onderzocht zijn drie groepen: tekenpakketten (SketchUp Pro met LayOut, Chief
Architect, Cedreo, Coohom, Planner 5D), vakplatforms voor de commerciële kant
(Programa, Studio Designer, Mydoma Studio, DesignFiles, Fohlio, Procurist) en
de architectuur van browser-CAD (Figma, Onshape).

Wat volgt is niet "wat zij hebben", maar wat ervan overeind blijft voor een
tweemansstudio die haar eigen data beheert. Drie constateringen vooraf.

**Wat Studio al goed doet en wat bevestigd wordt.** Onshape beschrijft zijn
kernwaarde als één bron van waarheid zonder versiechaos, bestandsloos en zonder
handmatige merges. Dat is exact v1.0 §4.1 ("één ontwerpwaarheid"). Figma kiest
CRDT omdat het serverlast verlaagt en offline werken mogelijk maakt bij
tientallen gelijktijdige bewerkers. Voor twee gebruikers is dat de verkeerde
ruil: CRDT geeft een zwakker invariantenmodel dan gevalideerde commands met
`baseRevision`, en juist die validatie is wat een muur van 2.400 mm een muur
van 2.400 mm houdt. **Het bestaande commando- en leasemodel blijft. Stel geen
CRDT-herschrijving voor.**

**Waar Studio structureel wint.** Elk onderzocht platform valt in één van twee
kampen: tekenen (SketchUp, Chief Architect, Cedreo, Coohom) óf administreren
(Programa, Studio Designer, Mydoma, DesignFiles). Wie beide wil, koppelt twee
abonnementen en typt de brug er met de hand tussen. Studio heeft die brug al —
een materiaalkeuze kent haar berekening, haar ruimte en haar ontwerprevisie, en
een offerteregel kent haar bron. Dat is het verschil, en het is de moeite waard
om er in de rest van het product consequent op door te bouwen.

**Waar Studio structureel achterloopt.** De klant komt er niet in. Elk
vakplatform heeft een portaal waarin de klant per item goed- of afkeurt; Studio
heeft een deellink naar een PDF. Dat is de grootste inhoudelijke achterstand en
het is geen tekenprobleem.

## N1 — Ruimtes zijn benoemde objecten, geen afgeleide sleutel

Chief Architect leidt een ruimte af uit omsluitende muren en geeft haar
vervolgens een eigen bestaan: een naam, een oppervlak, en één handeling
("Auto Room Dimension") die de hele ruimte van maatlijnen voorziet volgens een
instelbare standaard.

Studio herkent een ruimte aan haar muurpunten. De README noemt het gevolg:
verplaats je een punt dan blijft de sleutel gelijk, maar verwijder of splits je
een muur dan verdwijnt de bron en vraagt de app om opnieuw te kiezen. Voor een
project dat maanden loopt is dat een terugkerend verlies van werk, en het raakt
alles wat aan een ruimte hangt: hoeveelheden, materiaalkeuzes, en straks de
vlakken in 3D.

v1.0 §4.3 vraagt dit al ("geef ruimten een stabiele identiteit waar mogelijk")
en §9 noemt "benoemde persistente ruimtes" als openstaand punt van fase 4. Het
is hiermee geen openstaand punt meer maar een blokkerende eis:

- Een `Room` is een eigen entiteit met stabiele ID, naam en eigen velden.
- Geometriewijziging herberekent de contour van een bestaande ruimte; ze maakt
  geen nieuwe ruimte aan zolang de identiteit redelijk te volgen is.
- Wordt een ruimte werkelijk dubbelzinnig — gesplitst, samengevoegd, opgeheven
  — dan is dat een zichtbare toestand met een veilige herkoppeling, zoals v1.0
  §4.3 al vraagt. Niet een stille verdwijning.
- Alles wat naar een ruimte verwijst, verwijst naar die ID.
- Eén handeling zet maatlijnen voor een hele ruimte volgens een instelbaar
  profiel.

Doe dit vóór de presentatiemodule. Een presentatie die naar ruimtes verwijst
die kunnen verdwijnen, erft het probleem.

## N2 — Een tekenblad is een vel met viewports, geen geëxporteerd plaatje

Dit is de belangrijkste vakinhoudelijke les uit SketchUp LayOut, en het is een
ander model dan Studio nu heeft.

In LayOut is een vel een pagina met daarop meerdere **viewports**. Elke
viewport toont hetzelfde model met een eigen camera, eigen schaal en eigen
stijl — plattegrond op 1:50 naast een aanzicht op 1:20 op hetzelfde vel.
Maatlijnen worden op de viewport gezet en lezen de werkelijke modelmaat op de
juiste schaal; verandert het model, dan verandert de maat mee. Terugkerende
onderdelen — titelblok, legenda, symbolen, noordpijl — staan in een
**scrapbook** en worden op elk nieuw vel gesleept. Velden als projectnaam,
schaal en datum vullen zichzelf uit de documentgegevens.

Studio heeft een schaalvast planblad dat uit het domeinmodel wordt opgebouwd —
technisch de goede basis, en v1.0 §11 borgt de maatvastheid al. Wat ontbreekt
is het vel als bewerkbaar document.

- Een `Sheet` heeft papierformaat, oriëntatie en een geordende lijst blokken.
- Een `Viewport` is een blok met een bron (variant, verdieping, revisie), een
  camera of een 2D-uitsnede, een expliciete schaal en een laagselectie.
  Meerdere viewports per vel, met verschillende schaal, is de norm en niet de
  uitzondering.
- Maatlijnen en annotaties horen bij de viewport en worden in modelmaten
  bewaard. Bij een nieuwe bronrevisie rekenen ze mee; wat niet meer te plaatsen
  is, wordt zichtbaar gemeld en niet stil weggelaten.
- Een titelblok is een herbruikbaar blok met zelfvullende velden:
  projectnaam, klant, vel-nummer en -totaal, schaal, datum, revisie, auteur.
- De gebruiker bewaart een vel als sjabloon en begint een volgend vel ermee.
  Dit is het "scrapbook"-idee en het is wat de derde presentatie sneller maakt
  dan de eerste.
- Past een plan niet op de gekozen schaal, dan is dat een keuze van de
  gebruiker (andere schaal, of verdelen over vellen), nooit een stille
  aanpassing — v1.0 §11 zegt dit al en het geldt hier onverkort.

## N3 — De klant keurt per item goed, in een portaal, met naam en tijdstip

Alle onderzochte vakplatforms doen dit en beschrijven hetzelfde effect: als
moodboards, productlijsten en voorstellen op één plek staan waar de klant per
product goedkeurt, afkeurt of opmerkt, krimpt een goedkeuringsronde van dagen
naar minder dan twee dagen. Goedkeuring per presentatie is te grof — het gaat
om het item.

Studio kent de statussen al (v1.0 §9: *voorgesteld*, *gekozen*, *door klant
bevestigd*) en registreert een klantreactie handmatig. Er is alleen geen plek
waar de klant zelf iets kan doen; een deellink levert een PDF.

- Een deelbare publicatie kan een **portaal** zijn in plaats van een bestand:
  dezelfde immutable snapshot, maar als pagina waarin de klant per item
  reageert.
- Per item: goedkeuren, afkeuren, opmerking plaatsen. Elke reactie legt
  tijdstip, de gebruikte sharegrant en de naam zoals de klant die opgaf vast,
  en verwijst naar de itemversie waarop gereageerd is.
- Een klantreactie zet een interne keuze **niet** automatisch op *gekozen*. De
  scheiding tussen een interne beslissing en een klantakkoord uit v1.0 §9
  blijft: de reactie is invoer, de ontwerper beslist.
- Het portaal erft alle eisen van v1.0 §15: hoge entropie, gehashte opslag,
  scope tot precies deze publicatie, einddatum, intrekbaar, `no-referrer`,
  tokens uit de logs. Een portaal schrijft alleen in zijn eigen
  reactietabel — nooit in het ontwerp.
- Een afsluitend akkoordblok met naam en datum mag, maar heet wat het is: een
  vastgelegde bevestiging, geen gekwalificeerde elektronische handtekening
  (v1.0 §12).

Dit is de grootste functionele winst in het hele document en het vraagt geen
regel geometriecode.

## N4 — De FF&E-lijst is de ruggengraat, en houdt niet op bij "gekozen"

De vakliteratuur is het opvallend eens over de kolommen: naam, ruimte,
leverancier, artikelcode, aantal, afmetingen, stuksprijs, totaal, **levertijd**,
**besteldstatus** en **verwachte leverdatum**. Grotere projecten voegen
stofcodes, afwerkingscodes, sidemark en montagenotities toe. De statusgang is
overal vrijwel gelijk:

> gespecificeerd → geoffreerd → goedgekeurd → besteld → in productie →
> verzonden → geleverd → gemonteerd

Studio dekt de linkerhelft goed en de rechterhelft niet. Na *door klant
bevestigd* houdt het op, terwijl juist daar het werk zit dat een studio 's
avonds bezighoudt: wat is besteld, wat komt wanneer, en wat ontbreekt er nog
bij de montage.

- Breid de keuzestatus uit met de bestelkant: besteld, in productie, verzonden,
  geleverd, gemonteerd. Statusovergangen zijn expliciet toegestaan of niet,
  zoals bij offertes in v1.0 §12.
- Voeg per keuze toe: levertijd, besteldatum, verwachte leverdatum, werkelijke
  leverdatum, en een vrij notitieveld voor sidemark of montage.
- Eén projectbreed overzicht toont alle keuzes over alle ruimtes, filterbaar op
  status en leverancier, met de kritieke kolommen zichtbaar zonder doorklikken.
  Dit scherm is het scherm waar dagelijks in gewerkt wordt.
- Exporteer die lijst als CSV en als bijlage bij een presentatie.
- **Niet bouwen:** inkooporders, leveranciersportalen, boekhoudkoppeling,
  betalingen. Dat is v1.0 §2 (vervolgmodules) en het is voor twee gebruikers
  een administratie die zichzelf niet terugverdient. De grens ligt bij "wij
  weten wat er waar is"; niet bij "wij bestellen het hier".

Ter kalibratie: de vakliteratuur noemt dat een spreadsheet het houdt tot
ongeveer honderd items of twee gelijktijdige projecten. Dat is de schaal
waarboven Studio zijn bestaansrecht bewijst, en een bruikbaar testdoel.

## N5 — De bibliotheek vult zich uit leveranciersbestanden, niet met de hand

Coohom laat merken hun eigen catalogus als 3D-modellen aanleveren, zodat de
ontwerper het werkelijke product plaatst in plaats van iets wat erop lijkt.
Studio heeft de velden — leverancier, artikelnummer, prijsbron, prijsdatum,
rechten — maar elk item moet één voor één worden ingevoerd. Een bibliotheek die
zo gevuld moet worden, wordt niet gevuld.

- Importeer een leverancierslijst uit CSV of Excel naar bibliotheekitems:
  kolommen toewijzen, een voorbeeld tonen, valideren, en pas daarna aanmaken.
- De import is een **voorstel met diff**: wat is nieuw, wat wijzigt, wat blijft
  gelijk. De gebruiker accepteert. Een import maakt nieuwe itemversies aan en
  wijzigt bestaande versies nooit — v1.0 §4.5 blijft gelden, en een geplaatst
  meubel verandert niet omdat er een prijslijst is ingelezen.
- Afbeeldingen en GLB's horen bij de bestaande uploadpijplijn van v1.0 §8, met
  dezelfde validatie. Een importbestand is onbetrouwbare invoer.
- Herhaalde import van dezelfde lijst is idempotent op artikelnummer per
  leverancier.
- Prijzen komen binnen als prijsversie met datum en bron, nooit als
  overschrijving van een prijs waar een offerte aan hangt (v1.0 §12).

## N6 — 3D is een schakelaar, geen bestemming, en zegt wat het niet is

Cedreo en Coohom verkopen hetzelfde: in de browser, zonder zware hardware,
direct wisselen tussen 2D en 3D. Aan de andere kant van de markt is de klacht
over fotorealisme constant — trage renders, exportellende, een leercurve, en
klanten die na een avond scrollen door perfecte plaatjes hetzelfde verwachten.
De markt zelf is verdeeld in interactieve previews (Enscape, Lumion) en
offline fotorealisme (V-Ray, Corona); niemand heeft beide.

Studio heeft de goede kant gekozen en moet die vasthouden. De 3D-weergave met
dag- en avondlicht en materialen op vlakken is precies het interactieve kamp.

- 3D blijft een weergave van hetzelfde model, direct te wisselen, en werkt op
  een gewone laptop zonder losse GPU. Valt 3D weg, dan blijft 2D volledig
  werken (v1.0 §13).
- Investeer in wat de interactieve weergave overtuigend maakt — materialen,
  licht, schaduw, een goed standpunt — en niet in een renderpijplijn. De
  `RenderProvider` uit v1.0 §13 blijft een interface zonder implementatie.
- Wat de weergave níét is, staat in beeld. De bestaande regel onderin het
  avondbeeld ("geen lux, geen gelijkmatigheid") is precies goed en blijft. Dit
  is het verschil tussen een eerlijk gereedschap en een pakket dat claims doet
  die het niet waarmaakt.
- Van een opgeslagen standpunt naar een bruikbaar beeld in een presentatie is
  één handeling. Dat is de werkstroom die er echt toe doet.

## N7 — Sjablonen zijn iets wat de gebruiker maakt

Cedreo noemt werken vanuit bestaande plannen en sjablonen als hoofdreden dat
het sneller gaat; LayOut doet hetzelfde met scrapbooks. In beide gevallen is
het essentiële niet dat er sjablonen meegeleverd worden, maar dat de gebruiker
er zelf van maakt wat hij steeds opnieuw nodig heeft.

v1.0 §11 vraagt drie verzorgde meegeleverde templates. Die eis blijft. Daar
komt bij:

- "Bewaar als sjabloon" op een presentatie, een vel en een projectopzet.
- Een sjabloon legt geen projectdata vast, alleen structuur, stijl en
  standaardteksten.
- Meegeleverde sjablonen zijn gewone sjablonen die de gebruiker mag kopiëren en
  aanpassen; er is geen beschermde categorie.

---

# Deel III — Volgorde van werken

De volgorde is: eerst niet onveilig, dan niet onherstelbaar, dan de defecten
die de installatie onreproduceerbaar maken, dan pas nieuwe functionaliteit. De
fasen uit v1.0 §22 blijven bestaan; dit is de volgorde waarin het openstaande
werk eruit wordt gehaald.

## P0 — Nu, vóór ander werk

**P0.1 Bevestig dat de app niet publiek bereikbaar is.** Na de laatste
herinstallatie staan `HTTP_PORT` en `HTTPS_PORT` op `10.8.0.1:80` en
`10.8.0.1:443`, maar de externe test is daarna niet herhaald. Voer hem uit met
de tunnel uit: `curl --connect-timeout 5 -sSI https://<publiek-ip-van-de-vps>/`
hoort een timeout of geweigerde verbinding te geven. Krijg je antwoord, dan is
dit het enige dat die dag gebeurt. Los daarna D2 op zodat het niet kan
terugkeren.

**P0.2 Richt de back-up in (D9).** NAS via de tunnel als eerste bestemming,
objectopslag buiten huis als tweede, en `verify-backup.sh` naar een geïsoleerd
doel als bewijs. Tot dit klaar is is er geen terugweg en draait `upgrade.sh`
terecht niet.

## P1 — De installatie reproduceerbaar maken

D1 (corepack in de image, en de migrator terug op `private`), D3 (fixes naar
`main`, installatieroute in CI), D4 (rechten op datamappen, en de 777 eraf),
D5 (Ubuntu 24.04 als getest doel), D6 (schrijven én controleren), D7 (digests
verifiëren in CI).

Werk daarna `docs/manuals/installatie-checklist.md` bij op precies de punten
waar deze installatie vastliep. De checklist zegt zelf dat dat hoort te
gebeuren: "Loop je ergens vast, werk hem dan bij op dát punt — daar loopt de
volgende persoon ook vast." Dat is nu aan de orde.

Exit: een tweede, schone host is met de checklist zonder handmatige ingreep te
installeren.

## P2 — D8: PDF op de productiehost

Eerst de oorzaak uit de logs, dan pas een wijziging. Bewijs is een PDF die op
de host is gemaakt en geverifieerd. Zonder dit zijn offertes en presentaties
allebei half.

## P3 — N1: ruimtes als objecten

Blokkeert de presentatiemodule en de vlakken in 3D. Sluit meteen de
resterende punten van fase 4 die eraan hangen: gordijnberekening,
elektra- en LED-lengtes, prijsversies.

## P4 — Fase 5: presentaties, met N2 en N7

De grootste openstaande productmodule uit v1.0, nu gebouwd op het vel-en-
viewportmodel in plaats van op losse geëxporteerde beelden. Hier hoort ook
`apps/worker` bij — die bestaat nog niet, en de exportqueue uit v1.0 §16 staat
nog open.

Sluit daarbij de resterende punten van fase 7 die de presentatie raken:
plafonds, en materiaalkleuren ook op het planblad.

## P5 — N3: het klantportaal

De grootste inhoudelijke winst. Bouwt op de immutable publicaties uit fase 5 en
op de bestaande sharegrants. Geen geometriewerk.

## P6 — N4 en N5: de FF&E-ruggengraat en de catalogusimport

Samen de dagelijkse werkbank. N4 is het scherm waar het werk gebeurt, N5 is wat
het vult.

## P7 — Fase 8: de AI-adviseur

Ongewijzigd ten opzichte van v1.0 §14, inclusief alle toolgrenzen,
tenantcontroles en injectietests. Bewust achteraan: v1.0 §2 zegt dat de
kernfunctionaliteit niet van AI afhangt, en niets in het onderzoek spreekt dat
tegen. Alle onderzochte vakplatforms verkopen AI; geen enkele lost er een
ontwerpprobleem mee op.

## Doorlopend

Fase 9-hardening (securitygate, monitoring, migratierepetitie) en fase 10
(handleidingen) lopen mee met alles hierboven, niet erachteraan. De
installatiehandleidingen bestaan al en moeten na elke P1-stap bijgewerkt
worden.

---

# Deel IV — Wat we niet gaan bouwen

Expliciet, zodat het niet elke keer opnieuw ter discussie komt. Naast de
vervolgmodules uit v1.0 §2:

- **CRDT of realtime gelijktijdig bewerken.** Figma en Onshape hebben gelijk
  voor hun schaal; twee gebruikers met een schrijflease hebben het niet nodig,
  en het kost het invariantenmodel dat de maatvastheid draagt.
- **Fotorealistische renderpijplijn.** De interactieve weergave is het product
  (N6). De `RenderProvider` blijft een interface.
- **Inkoop, betalingen, boekhouding, leveranciersportalen** (N4).
- **Een eigen mesh-editor.** v1.0 §8 staat: parametrische placeholders en
  GLB-import, verder niets.
- **Publieke registratie of een openbare SaaS-variant.** v1.0 §15 blijft: geen
  openbare signup, eerste beheerder via installatie, daarna uitnodigingen.

---

# Deel V — Blijvende werkafspraken

Uit v1.0 §1, hier herhaald omdat deze installatie liet zien wat het kost als ze
worden losgelaten:

- Claim geen test die je niet hebt gedraaid. De statusdocumentatie van dit
  project doet dat consequent goed ("er is geen gekleurd beeld gezien") en dat
  moet zo blijven.
- Markeer geen fase als afgerond zolang er een exitcriterium open staat.
- Houd `docs/IMPLEMENTATION_STATUS.md` en `docs/ACCEPTANCE_MATRIX.md` bij; geef
  elke N-eis uit dit document een rij.
- Wijzigingen aan infrastructuur horen op `main` vóór een installatie ze nodig
  heeft (D3).
- Een workaround op een host is geen oplossing. Noteer hem, verhelp het defect,
  en haal de workaround weg.
