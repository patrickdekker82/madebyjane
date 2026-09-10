# ADR 0005 — Lokaal herstel is opt-in en heet geen back-up

Status: aanvaard, 10 september 2026.

## Context

Fase 2 vraagt om "IndexedDB voor opt-in lokaal herstel per gebruiker/organisatie/project en commandobuffer bij onderbroken verbinding", met zichtbaar verschil tussen lokaal bewaard, synchroniseren, server opgeslagen en conflict, en een waarschuwing met herstel-export bij het afmelden. De opdracht sluit expliciet uit dat de eerste versie volledig offline bewerken belooft.

De editor kende dit al binnen één venster: bij een mislukte opdracht bleef het werk in het geheugen staan, met een knop om opnieuw op te slaan of een herstelbestand te downloaden. Eén herlaadbeurt maakte dat werk stuk.

## Besluit

Er staat hoogstens **één klad** in IndexedDB, onder de sleutel `gebruiker:organisatie:variant`. Dat klad bevat de niet-bevestigde opdracht en het document zoals dit venster het zag.

De opslag is **opt-in** per gebruiker en per apparaat; de keuze staat in `localStorage` en gaat niet mee naar de server.

Het woord back-up komt in geen enkele tekst voor. De statusbalk toont precies één van zes toestanden: leesmodus, synchroniseren, alleen in dit venster, lokaal bewaard op dit apparaat, server opgeslagen, conflict.

Een klad wordt alleen aangeboden om opnieuw te versturen wanneer het exact op de huidige serverrevisie voortbouwt. Staat de server verder, dan kan het alleen nog worden gedownload of weggegooid.

Bij het afmelden worden de kladden van de betreffende gebruiker getoond, kan een herstelbestand worden gedownload, en worden ze daarna verwijderd. Kladden van andere gebruikers op dezelfde computer blijven staan.

## Waarom

Eén klad, niet een reeks: zolang een opdracht niet bevestigd is, neemt de editor geen nieuwe opdrachten aan. Er kan er dus nooit meer dan één openstaan. Een wachtrij zou een offline-belofte suggereren die er niet is.

Opt-in, omdat het ontwerp van een klant op een apparaat achterlaten een keuze van de gebruiker hoort te zijn en niet van ons. Op een gedeelde computer is dat het verschil tussen een handigheidje en een lek.

Alleen terugsturen bij een gelijke revisie is geen voorzichtigheid maar een sluitende redenering: elke aangekomen opdracht verhoogt de revisie. Staat de server nog op de basisrevisie van het klad, dan is de opdracht dus nooit aangekomen en is opnieuw versturen veilig. Staat de server verder, dan is er intussen iets veranderd en zou terugsturen dat overschrijven.

De opdracht krijgt bij het terughalen een **nieuwe opdracht-ID en de lease van dit venster**. De server berekent de idempotentiesleutel over de hele opdracht, inclusief de lease; een oude lease uit een vorige sessie zou als "dezelfde ID, andere inhoud" worden afgewezen. De revisiecontrole hierboven maakt de idempotentiesleutel op dit pad overbodig.

## Gevolgen

- Zolang de opdracht openstaat kan er niet verder worden gewerkt. Dat is geen offline modus en wordt ook niet zo genoemd.
- Het klad staat onversleuteld in het browserprofiel, leesbaar voor wie toegang heeft tot dat profiel op dat apparaat. Daarom staat het uit tenzij de gebruiker het aanzet, en wordt het bij afmelden verwijderd.
- In een privévenster of bij geweigerde opslag mislukt het schrijven. De editor meldt dat en blijft de toestand "alleen in dit venster" tonen in plaats van te doen alsof er iets bewaard is.
- Een klad ouder dan zeven dagen wordt niet meer aangeboden en opgeruimd: de kans dat het nog op de huidige revisie past is dan verwaarloosbaar.

## Later

Een echte commandobuffer met meerdere opdrachten hoort bij werkelijk offline bewerken. Dat vraagt om samenvoegen bij terugkomst en dus om een conflictmodel dat verder gaat dan "de server heeft een nieuwere versie". Zolang dat er niet is, blijft één klad de eerlijke vorm.
