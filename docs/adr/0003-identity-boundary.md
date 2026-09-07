# ADR 0003 — Identity, uitnodigingen en MFA

6 september 2026. Foundation.

Domein-runtime-role heeft geen SELECT op identity. Alle domeintabellen hebben RLS; de server controleert daarnaast membership vóór transaction-local tenantcontext. Identity gebruikt een eigen niet-superuser-verbinding en een expliciete vertrouwensgrens: deze verbinding kan auth-tabellen beheren en membership invoegen voor geautoriseerde uitnodigingen. Zij is niet geschikt voor algemene projectqueries. Nieuwe tabellen/grants worden via opeenvolgende migrations toegevoegd; bestaande migrations blijven ongewijzigd.

Eerste eigenaar: alleen offline CLI; exclusieve advisory transaction lock, gebruikersaanmaak, organisatie en membership in één transactie. Geen HTTP-bootstraproute of standaardwachtwoord. Test: een geforceerde fout rolt accountaanmaak terug; twee concurrente starts leveren één eigenaar; herstart bewaart projectdata.

Uitnodigingen: 256-bit random token, alleen SHA-256 in DB, 48 uur geldig, één consumptie onder row lock. De link gebruikt een URL-fragment, zodat het token niet in HTTP-request-URLs of referrers terechtkomt. Geen e-mailverzending. De beheerder deelt de link zelf. Role is beperkt tot admin/designer/finance/viewer; geen owner via uitnodiging. Uitnodiger moet bij acceptatie nog beheerrechten hebben. Een bestaand account moet eerst als de juiste gebruiker inloggen; de uitnodiging verandert geen bestaand wachtwoord. Herhaald accepteren faalt; bestaande memberships worden niet overschreven.

MFA gebruikt Better Auth 1.7.2 twoFactor-plugin, TOTP + eenmalige backupcodes. Server-side secret-/backupcodebescherming blijft bij de library. Plugin-schema is gecontroleerd tegen de geïnstalleerde versie, inclusief verified/failedVerificationCount/lockedUntil. Codeverificatie is vereist voordat MFA actief wordt. Login krijgt pas een sessie na tweede factor. HTTPS-projecttoegang vereist MFA voor elke rol; lokale loopbackontwikkeling laat enrollment toe zonder verplichting. In productie moet PUBLIC_BASE_URL verplicht een HTTPS-origin zijn.

De server schrijft het client-IP voor Better Auth zelf vanuit Fastify request.ip naar een eigen header. Een inkomende gelijknamige header wordt overschreven. trustProxy=false; echte Caddy-configuratie moet later expliciet de proxyvertrouwensketen afbakenen. Rate limits bij loopbackdevelopment kunnen gedeeld worden door de Vite-proxy.

Open: projectgebonden membership/rolcombinaties, beheer van bestaande memberships, SMTP/password-reset, device/sessionbeheer-UI, verplichte MFA-flow bij account recovery en complete securityreview. De gebruiker kan MFA loskoppelen met huidig wachtwoord; bij externe toegang blokkeert het project vervolgens tot nieuwe enrollment. Backupcodes zijn getest als herstelpad, geen vervanging voor de nog te bouwen volledige beheerprocedure.

Bron: https://better-auth.com/docs/plugins/2fa (geraadpleegd 6 september 2026), plus lokaal geïnstalleerde schema-/adaptercode. API- en databaseproeven leveren het compatibiliteitsbewijs.
