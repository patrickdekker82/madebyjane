# ADR 0001 — Voorgeschreven modulaire monoliet

2026-09-05. Geaccepteerd voor de ontwikkelbasis.

Lege werkmap, geen bestaande repository/instructies. Gebruikersspecificatie in MASTERPROMPT.md is leidend. React 19 / R3F 9, Konva 19, Fastify 5, PostgreSQL, Drizzle en Better Auth blijven behouden. Geen Sites/Cloudflare alternatief: dat past niet bij de expliciete self-hostingarchitectuur.

Fase 0 bouwt een verticale proef; volgende modules blijven zichtbaar open. Geen productiepublicatie. De aanwezige Docker CLI heeft geen draaiende daemon. Een optionele embedded **echte PostgreSQL-server** wordt uitsluitend voor lokale integratietests ingezet; geen SQLite/PGlite-vervanging en geen productieafhankelijkheid. Linux/Hyper-V/Chromium-container, NAS en tweede-hostrestore blijven afzonderlijke exitcriteria.

Canoniek: scene v1, gehele mm, plan X rechts/Y naar beneden; 3D (x/1000, hoogte/1000, y/1000). Positieve planrotatie is visueel met de klok mee; Three Y-rotatie is negatief. Front van meubel is lokale +Z. Tolerantie 0,001 mm voor afgeleide geometrie, afronden bij commands. Maximaal ±100.000 mm coördinaten, 1.000 muren, 2.000 items en 500 openingen. Schermzoom is uitsluitend UI-staat.

Auth heeft afzonderlijke identity-tabellen/verbinding. Domeinqueries gebruiken een niet-eigenaar-runtime-role zonder BYPASSRLS, transaction-local organisatiecontext plus expliciete membership/autorisatie. Geen productie-signup; eerste eigenaar alleen via eenmalige CLI-setup. Multi-org toegang kan nooit worden afgeleid uit een door de client gekozen organisatie-ID zonder membership.

Bronnen (geraadpleegd 2026-09-05):
- https://r3f.docs.pmnd.rs/getting-started/installation (React 19 / Fiber 9)
- https://github.com/nodejs/Release (ondersteunde LTS)
- https://fastify.dev/docs/latest/Reference/LTS/
- https://www.better-auth.com/docs/integrations/fastify
- https://www.better-auth.com/docs/adapters/drizzle
- https://www.postgresql.org/docs/current/ddl-rowsecurity.html

Exacte geïnstalleerde versies en audits worden apart vastgelegd; documentatie alleen geldt niet als compatibiliteitsbewijs.
