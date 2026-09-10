# ADR 0004 — Onderlegger als raster, niet als PDF

Status: aanvaard, 10 september 2026.

## Context

Fase 2 vraagt om "import van rasteronderlegger en geselecteerde PDF-pagina met kalibratie via twee punten". Een onderlegger is een foto of scan van een bestaande plattegrond waar de gebruiker overheen tekent.

## Besluit

Deze stap ondersteunt **PNG en JPEG**. PDF-pagina's zijn nog niet ondersteund.

De server leest alleen de bestandskop om type en maten te bepalen en slaat de bytes ongewijzigd op. Er komt geen beeldbibliotheek aan te pas.

De schaal wordt niet opgeslagen. Wat vastligt zijn twee punten in afbeeldingspixels en de werkelijke afstand daartussen; de millimeters per pixel volgen daaruit.

## Waarom

Een PDF renderen vraagt een volwaardige PDF-engine in de browser. Dat is een grote nieuwe afhankelijkheid met een eigen aanvalsoppervlak, precies op de plek waar een bestand van buiten binnenkomt. De opdracht waarschuwt daar expliciet voor: geen actieve PDF- of SVG-inhoud rechtstreeks in de DOM. Een raster levert het grootste deel van de waarde — natekenen op maat — zonder die afhankelijkheid.

Geen decoder op de server betekent dat een misvormd bestand hooguit strandt op onze eigen kopparser van enkele tientallen regels, in plaats van op een bibliotheek die met volledige rechten pixels uitpakt. De browser decodeert wel, maar doet dat voor elke afbeelding op internet en is daarop gehard.

De schaal afleiden in plaats van opslaan houdt de kalibratie navolgbaar: je ziet altijd welke twee punten en welke maat iemand heeft opgegeven. Een opgeslagen schaal zou een getal zijn dat nergens meer op te herleiden is.

## Gevolgen

- Een gebruiker met alleen een PDF moet die eerst zelf naar afbeelding omzetten. De interface zegt dat PDF niet wordt geaccepteerd, in plaats van het bestand stil te weigeren.
- **EXIF-metadata blijft staan.** Een JPEG uit een telefoon kan locatiegegevens bevatten en die worden nu niet verwijderd; dat vraagt om opnieuw encoderen en dus om een beeldbibliotheek. Dit staat als open punt in de implementatiestatus.
- De aangenomen schaal van 10 mm per pixel voor een niet-gekalibreerde onderlegger is een werkwaarde, geen meting. De interface benoemt dat.

## Later

PDF-pagina-import kan later als aparte stap, met een gepinde renderer in een geïsoleerde worker die alleen een raster teruggeeft. Dan verandert er niets aan het opslag- en kalibratiemodel: er komt een raster uit, en dat gaat door dezelfde pijplijn.
