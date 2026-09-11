# Accountherstel

Voor de situatie dat iemand niet meer kan inloggen: wachtwoord vergeten, of een
account waarvan je vermoedt dat een ander erbij kan.

Er is **geen e-mailkoppeling** in deze app. Er wordt dus ook geen herstelmail
verstuurd en er staat nergens "check je inbox". Een beheerder maakt een
eenmalige link en geeft die persoonlijk door, net als bij een uitnodiging.

## Wat je nodig hebt

Een eigenaar of beheerder die kan inloggen. Een ontwerper, financiële rol of
kijker kan geen herstel starten, ook niet voor zichzelf.

## Procedure

1. Log in als eigenaar of beheerder en open **Toegang** in de bovenbalk.
2. Zoek de collega onder **Accountherstel** en klik op **Herstellink maken**.
3. Geef de link persoonlijk door: in de kamer, per telefoon, of via een kanaal
   dat jullie allebei vertrouwen. Bewaar hem verder niet.
4. De collega opent de link, kiest een nieuw wachtwoord van minimaal 12 tekens
   en logt daarna opnieuw in.

## Wat er gebeurt

- De link vervalt na **twee uur** en werkt **één keer**.
- Een nieuwe link maken maakt de vorige meteen ongeldig. Er kan dus nooit meer
  dan één herstellink tegelijk openstaan voor dezelfde persoon.
- Het instellen van een nieuw wachtwoord **logt die collega op alle apparaten
  uit**. Dat is opzet: bij een vermoeden van misbruik wil je dat een indringer
  er ook uit ligt.
- Elke stap komt in de registratie te staan: wie de link maakte, voor wie, en
  wanneer hij gebruikt of ingetrokken werd.

## Een link intrekken

Ging er iets mis, of is de link bij de verkeerde persoon terechtgekomen? Maak
een nieuwe link (de oude vervalt dan), of trek het herstel in zonder een nieuwe
te maken. Zolang niemand de link heeft gebruikt, verandert er niets aan het
account.

## Grenzen die je moet kennen

**Een beheerder kan geen eigenaar herstellen.** Alleen een eigenaar kan het
herstel van een andere eigenaar starten. Zonder die regel zou een beheerder het
eigenaarsaccount kunnen overnemen door er een wachtwoord voor in te stellen.

**Zijn alle eigenaren tegelijk buitengesloten, dan helpt dit scherm niet.** Er
is bewust geen achterdeur: geen standaardwachtwoord, geen noodaccount, geen
verborgen bootstraproute. Herstel loopt dan via de installatieprocedure op de
server, met toegang tot de database. Houd daarom minstens twee eigenaren met
werkende toegang, of bewaar de servertoegang ergens waar je er zeker bij kunt.

**Inloggen is begrensd.** Na drie pogingen binnen tien seconden weigert de
server tijdelijk. Dat geldt ook direct na een herstel; wacht dan even en probeer
opnieuw.

## Voor beheerders: waar het vandaan komt

Token, vervaltijd, eenmalig gebruik, wachtwoordsterkte en het intrekken van
sessies komen uit Better Auth. De app voegt daar alleen aan toe wie het mag
doen, de registratie, en het ongeldig maken van oudere links. Herstelverzoeken
via de API zijn begrensd op tien per minuut.
