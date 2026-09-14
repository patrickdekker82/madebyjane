# Studio — werkinstructie

Professionele interieurontwerp-app voor één studio met twee gebruikers.
Self-hosted. Zie `README.md` voor wat de app kan.

## Lees dit eerst, in deze volgorde

1. **`docs/MASTERPROMPT-V2.md`** — geldende opdracht, volgorde van werken,
   vastgestelde defecten (D1-D9) en nieuwe eisen (N1-N7). Gaat vóór bij
   tegenstrijdigheid.
2. **`docs/MASTERPROMPT.md`** — v1.0, de volledige eisenbasis. Onverkort
   geldig; niets erin is ingetrokken.
3. **`docs/IMPLEMENTATION_STATUS.md`** — wat werkelijk werkt, wat getest is en
   wat niet. Nieuwste aanvullingen staan bovenaan en zijn leidend.
4. **`docs/ACCEPTANCE_MATRIX.md`** — een rij per eis met testbewijs.

Begin geen werk zonder 1 en 3. Herhaal geen afgeronde fase zonder aanleiding.

## Taal

Nederlands in alles wat een mens leest: UI, documentatie, commit messages,
statusrapportages. Engels in technische identifiers, code en tests.

## Werkafspraken

- **Claim geen test die je niet hebt gedraaid.** Schrijf expliciet op wat je
  níét hebt geverifieerd — dit project doet dat consequent goed ("er is geen
  gekleurd beeld gezien") en dat moet zo blijven.
- **Markeer geen fase als afgerond** zolang er een exitcriterium open staat.
- **Werk `docs/IMPLEMENTATION_STATUS.md` bij** na elk afgerond deel: werkende
  functionaliteit, exact uitgevoerde tests, open problemen, volgende stap.
  Geef elke nieuwe eis een rij in `docs/ACCEPTANCE_MATRIX.md`.
- **Infrastructuurwijzigingen horen op `main`** vóór een installatie ze nodig
  heeft. Dit is D3 in v2.0 en heeft een productie-installatie een dag gekost.
- **Een workaround op een host is geen oplossing.** Noteer hem, verhelp het
  defect, haal de workaround weg.
- Geen productknoppen die doen alsof ze iets uitvoeren terwijl de implementatie
  ontbreekt.

## Commando's

```sh
pnpm install --frozen-lockfile
pnpm dev            # web op 4310, api op 4311, embedded postgres op 55432
pnpm setup          # eerste eigenaar, alleen lokaal
pnpm build          # typecheck + frontendbuild
pnpm test           # vitest
pnpm test:e2e       # playwright, vereist chromium
```

Node 22.22+ of 24 LTS, pnpm 11.19.0. Zes vitest-tests vragen Chromium en
falen in containers zonder browser; dat is bekend en geen regressie.

## Productieomgeving

Draait sinds 13 september 2026 op een VPS (6 vCPU, 12 GB, 200 GB, **Ubuntu
24.04.5 LTS**) achter WireGuard, op `studio.ruimtebyjane.nl`, met een eigen CA
van Caddy. Niet Debian en niet Hyper-V — oudere documentatie gaat daar nog van
uit. Installatie: `docs/manuals/installatie-checklist.md`.

Open en blokkerend: back-up is nog niet ingericht (D9), PDF-generatie faalt op
de host (D8). Zie deel III van v2.0 voor de volgorde.
