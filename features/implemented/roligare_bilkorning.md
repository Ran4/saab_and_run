# Roligare bilkörning

## Önskemålet

Bilkörningen är OK men inte grejt.

1. vid högre hastighet överstyr de liite för mycket. Minska det något, och speciellt för bakhjulsdrivna bilar.
   Det är halt ute liksom!

   (Felskrivet: det skulle vara tvärtom. Bilarna understyrde och var för stabila i fart. Rättat i
   [fixa_bilen.md](fixa_bilen.md).)
2. Handbromsning är kul, men när man släpper så får bilen fäste direkt igen, går inte riktigt att sladda.
   En 240 man inte kan sladda? kom igen!

## Vad som blev gjort (2026-10-11)

Bilarna har fått en drivlina: **bakhjulsdrivna** är Volvo 240 och 740, BMW:n, skåpbilen, bussen och
sopbilen. Audin har **fyrhjulsdrift**. Resten är **framhjulsdrivna**: Saaben, Golfen, Škodan, kombin
och taxin. Drivlinan avgör hur bilen beter sig i hög fart och vad gasen gör i en sladd.

### 1. Mindre överstyrning i hög fart (borttaget, gick åt fel håll)

Det som gjordes här är borttaget i [fixa_bilen.md](fixa_bilen.md), eftersom önskemålet var
felskrivet. I hög fart gav däcken upp till 18 % mindre i sidled (28 % i bakhjulsdrivna), och
ratten tog mjukare: ett kort tryck i 100 km/h vred bilen 3,8° i stället för 6,5°.

Nu gäller det omvända. I fart släpper bakvagnen före fronten, ratten tar skarpt (8–10° för samma
tryck) och bilen sladdar av sig själv, mest de bakhjulsdrivna. Konstanten heter fortfarande
`WINTER`. Datorns förare kör fortfarande precis som förut.

### 2. Sladd som håller i sig

**Handbromsen** (Mellanslag, handkontrollens A) i över 7 km/h framåt släpper bakvagnen, och sladden
fortsätter efter att man släppt handbromsen. (Sedan `fixa_bilen` kan en sladd i fart också börja av
sig själv, utan handbroms. Den följer samma regler, men däcken greppar hårdare i sidled.) I en sladd tar däcken en jämn kraft i sidled i stället
för att gripa tag, så bilen står kvar lika snett tills föraren gör något:

- **Ratten** bestämmer vinkeln. Styr man åt samma håll som svängen ökar vinkeln, men bara upp till
  ungefär 55°. Styr man åt andra hållet (motstyrning) rätar bilen upp sig.
- **Gasen** beror på drivlinan:
  - **Bakhjulsdriven** (en 240!): gasen håller sladden vid liv. Bilen står kvar snett, och vinkeln
    växer sakta, så man får motstyra sig ur den. Släpper man gasen tar däcken fäste igen.
  - **Framhjulsdriven** (Saaben): gasen drar bilen rak. Vill man sladda längre släpper man gasen.
  - **Fyrhjulsdriven** (Audin): mittemellan.
- Sladden är över när bilen är rak igen, när den nästan har stannat, eller när den har snurrat runt
  (mer än 130° snett). Med släpkärra blir det ingen kvarhängande sladd: handbromsen fungerar som förut.
- Framhjulen pekar dit bilen faktiskt åker, så man ser motstyrningen. Däckspåren, tjutet och sprejet
  bakom bakhjulen följer med: puder på snö, en saltig dimma på asfalt.
- **Snurra på stället:** handbroms, gas och fullt rattutslag när bilen nästan står still (under
  18 km/h). En bakhjulsdriven bil svänger runt kring framaxeln, ungefär ett varv på fyra sekunder,
  och ritar en ring av däckspår. Saaben svänger kring bakaxeln, Audin kring mitten. Släpper man
  handbromsen kör bilen iväg.
- **Ove har en åsikt.** Efter en sladd på minst 1,6 s, eller två sekunder av snurrande, säger han
  något, högst var 40:e sekund:
  - i Saaben: "Framhjulsdrift. Saaben vet vart den ska."
  - i en Volvo: "Volvo. Den kan inte ens köra rakt."
  - annars: "Det där såg ingen.", "Kommunen har inte sandat här." eller "Det var meningen."
  - efter snurrandet: "Kollar bara mönsterdjupet."

  Det är sex nya repliker för Ove. De behöver röster i `a_fully_voiced_game`.
- **Mätt** (50 km/h, handbroms och ratt i 0,4 s; förut tog däcken fäste 0,1 s efter att man släppt
  handbromsen, och vinkeln var då 14°):
  - Vinkeln är 36° när man släpper handbromsen.
  - Utan gas glider bilen vidare snett i drygt 2 s.
  - Med gas och utan ratt står en 240 snett i 4 s. Saaben rätar upp sig på 0,85 s.
  - En motstyrande förare (med tangentbordet: fullt utslag eller inget) håller en 240 i 34° i 4 s,
    en hel U-sväng i 44 km/h.
  - Med gas och ratt in i svängen i 1,2 s och sedan bara gas klarar Saaben en 90°-korsning av sig
    själv. En 240 står då 57° snett och vill bli motstyrd. Med motstyrning är den rak efter 0,85 s,
    har svängt 79° och kör ut i 48 km/h.
  - En kort ryckning i handbromsen i 100 km/h ger 23° och ingen snurr.

**Hur det är byggt**: `src/actors/car.js`. Specen har `drive`. `WINTER` styr vinterväglaget,
`SLIDE` sladden och snurrandet. Bilen har `car.drift`, `car.slip`, `car.pivot` och `car.steerShow`
(hjulens ritade vinkel). Ove och sprejet ligger i `src/main.js` (`slideTalk`, `SLID`). Mer finns i
`notes/cars.md` (Physics: *Winter roads at speed*, *Slides*) och `notes/integration.md`.
Kontrolltabellen i spelet och README:n beskriver sladden.

**Kontroller**: i `tools/scenarios/cars.mjs` finns tre nya scenarier.
- `handling` ger siffrorna för hög fart per bil.
- `drift` ger siffrorna för sladdarna per bil (`DSNOW=1` på snö).
- `driftshot` kör med riktiga knapptryck. En 240 (`TYPE=` för en annan bil) sladdar genom
  korsningen vid (40, -40) och snurrar sedan på stället där. Scenariot kontrollerar:
  - att sladden håller minst 0,6 s efter att Mellanslag släppts (den höll 2,3 s, max 58°)
  - att bilen kör ut på tvärgatan
  - att snurrandet går runt (0,86 varv på 3 s)
  - att Ove säger något efter båda

  Bilder finns i `out/driftshot_*.png`. Saaben, Golfen, Audin och BMW:n klarar det också.

Dessutom gick dessa igenom utan fel (med den här featurens version av punkt 1; efter `fixa_bilen`
finns nya siffror där):
- `story`: alla sju dagarna, slutar på `#7 idle` och `no errors`.
- `m1`: släpkärran backas in med riktiga knapptryck.
- `m5race`: vunnet på 26,6 s, Anders 58 m efter (förut 26,9 s och 76 m). Med `RACE_VMAX=22` på
  27,0 s, Anders 56 m efter (förut 59 m).
- `m7chase`: under 40 m efter 10,9 s, som förut.
- `drive`, `cruise`, `physics` och `trailer` (släpets siffror är oförändrade).
