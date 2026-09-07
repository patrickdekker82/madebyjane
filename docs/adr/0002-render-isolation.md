# ADR 0002 — Linux Chromium-proef en maatvastheid

6 september 2026. Getoetste fase-0-route, nog geen productie-exportworker.

De officiële Playwright 1.62.1 Noble-image is gepind op sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e. Node in deze testimage: 24.18.1. Chromium: 151.0.7922.34. Ubuntu-userspace in container vereist geen Ubuntu-host; het doel blijft Debian 13 op Hyper-V, waarvoor een afzonderlijke hostproef nodig is.

Geslaagd op Colima Linux arm64 (4 CPU / 4 GiB VM), met containerlimiet 1 CPU / 1 GiB, non-root UID 501, netwerk `none`, read-only rootfs, `cap_drop ALL`, `no-new-privileges`, `/tmp` tmpfs en uitsluitend output-/meetdirectory als schrijfbare mounts. Geen Docker-socket in container, geen GPU, geen host-IPC.

Chromium-sandboxing blijft expliciet **aan**. Docker-defaultseccomp blokkeerde user namespaces. Het officiële Playwright-profiel lost dat op; bij cap_drop ALL blokkeerde het daarna `chroot` binnen Chromiums eigen user namespace. Het ingecheckte profiel voegt uitsluitend een onvoorwaardelijke syscall-allow voor chroot toe. Dit verleent de non-root-container geen hostcapability. Geen SYS_ADMIN, privileged of unconfined. Deze afwijking vereist opnieuw een gerichte review voor de echte exportworker.

Bron profiel: https://raw.githubusercontent.com/microsoft/playwright/v1.62.1/utils/docker/seccomp_profile.json (Apache-2.0, Microsoft Playwright).
Documentatie: https://playwright.dev/docs/docker (geraadpleegd 6 september 2026).

Input is uitsluitend ons eigen gecontroleerde SVG/HTML. Playwright blokkeert alle requests en Docker heeft geen netwerk. Dit is geen veilige algemene URL-renderer. De production worker moet immutable snapshots, private assetresolutie, jobautorisatie, begrensde retries en outputpublicatie toevoegen.

Meetresultaat: één A4-vectorplan-PDF, 67 ms pagina/PDF-stap na browserstart. Browserstart/containerbuild vallen buiten dit cijfer. Geen claim over 10-pagina-presentaties of referentielaptop-FPS.

Maatbeleid: scene in mm; SVG viewBox in papier-mm; schaal 1:50 is exact 0,02. De 5000-mm-vectorreferentie meet in de PDF 99,9983 mm; tolerantie 0,01 mm. Chromium kwantiseert de papierbox: 297,0107 × 209,8887 mm; daarvoor afzonderlijk 0,2 mm tolerantie. Er wordt niet stil geschakeld naar een andere schaal. SVG weigert niet-passende ontwerpen. Een toekomstige printerroute kan de PDF MediaBox normaliseren zonder inhoud te schalen; niet nodig voor deze geslaagde geometrieproef.

Planweergave is een horizontale doorsnede op 1200 mm; ramen boven/onder dat vlak vragen later expliciete bovenaanzichtsymboliek. Muurjoins zijn nog niet de definitieve geometrie-engine.
