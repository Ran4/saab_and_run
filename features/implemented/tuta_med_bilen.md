# Tuta med bilen

## Önskemålet

Alltid kul att kunna tuta med bilen... trycka "t" för att tuta?

Obs: bör ha påverkan på omvärlden, inte bara vara
ett ljud som hörs. Folk borde bli skrämda om du tutar mitt framför dem osv.

## Vad som blev gjort (2026-10-11)

Förut gick det att tuta med **H**, men det var bara ett ljud. Nu tutar **T** (och fortfarande
**H**), på handkontrollen **L3** eller **RB**, i vilken bil Ove än kör. Varje bilmärke har sin egen
tuta: Saaben låter som förut, Volvo 240:n säger ett trött "mööp", Golfen piper, Audin och BMW:n tutar
i en skarp dur-ters, Škodan i en sur halvton, och bussen och sopbilen har lufttuta. Lånar Ove en Golf
piper han alltså. Och stan reagerar:

- **Den som står framför bilen** blir skrämd. Händerna åker upp framför ansiktet, hen skriker till
  ("ah!") och tar ett skutt åt sidan, ut ur bilens väg (åt det håll hen redan står). Sedan vänder hen
  sig om mot bilen och säger vad hen tycker, ofta med knytnäven i luften: "Jösses!", "Jag går ju
  här!", "Jag fick nästan hjärtstopp!". Står bilen själv på trottoaren eller i det bilfria området
  säger de det: "Det här är en trottoar!", "Det är bilfritt här!". Efteråt går de tillbaka till
  trottoaren.
  - **Pensionärer** hoppar inte. De skyndar åt sidan så fort det går och har en åsikt om ungdomen
    (Ove är 59): "Ungdomen nu för tiden!", "Jag har gått här sedan 1962!".
  - **Tonåringar**: "Okej, boomer.", "Chilla!".
  - **Barn** hoppar undan också, men vänder sig om och jublar: "Igen!", "Tuta igen!". Ove: "Tutan är
    ingen leksak."
- **Den som står nära** (15 m, 24 m om man håller inne tutan) rycker till, kanske med ett litet hopp,
  vänder sig om och säger något: "Det är en bostadsgata!", "Vad är det som brinner?".
- **Grannarna** svarar som de är:
  - Patrick hoppar undan även när han inte står i vägen: "Oj! Förlåt! Står jag i vägen?"
  - Parvaneh kliver undan (hon är gravid) och skakar näven: "Ove! Jag är gravid, inte döv!". Efter
    dag 7: "Ove! Pojken sover!".
  - Sara och Nasanin jublar: "Tuta igen, Ove!", "Tut tut!".
  - Jimmy och Adrian vinkar: "Tjena Ove! Tut tut!", "Är det originaltutan?". Adrian efter dag 5: "Min
    Saab har exakt samma tuta!".
  - Anders citerar reglerna: "Ove! Det är en bostadsgata!".
  - Vita skjortan: "Det där noteras."
  - **Rune**, som nästan aldrig säger något, känner igen bilen på tutan: "...Saab." (eller
    "...Volvo.", "...BMW."). Står Anita bredvid förklarar hon: "Han känner igen tutan, Ove."
- **Bilisterna** tutar tillbaka med sin egen tuta och säger något, i en pratbubbla över bilen: "Lugna
  dig, farbror!", "Själv då!", "Pensionärer!". Hur ofta beror på märket (en BMW nästan alltid, en
  Volvo 240 sällan). Busschauffören: "Bussen har företräde!". Bilen framför som kör åt samma håll gasar
  på en stund. En bil som har stått och tutat bakom Ove lutar sig på tutan om han tutar tillbaka:
  "Flytta på dig då!".
- **En annan Saab** hälsar med två korta tut när Ove kör Saab: "Tjena, Saab!". Ove: "Saab-folk. Vi
  hälsar."
- **Smitare.** En smitare som fortfarande sitter i sin felparkerade bil blir skrämd och drar: jakten
  börjar. Under en jakt blir smitaren nervös av tutan (bilen vinglar till) och ger upp fortare: varje
  tut tar 5 av motståndet, och att hålla inne tutan tar 3 per sekund. "Sluta tuta!"
- **Ove har åsikter** om det han tutar på (högst var 8:e sekund): på en fotgängare i gatan
  "Trottoaren. Den finns där av en anledning.", på en bil "Blinkers! Har du hört talas om blinkers?",
  "Körkort på internet, va?", på märket "Volvoförare.", "Kommunen. Typiskt.", på en tom felparkerad
  bil "Ingen hemma. Typiskt.", på ingenting alls "Tutan fungerar.". **Passagerarna** har sina:
  Parvaneh "Ove! Inte i mitt öra!", Adrian "Får jag också tuta?".
- **Onödig tutning kostar.** Tutar Ove på ingenting (ingen framför bilen, ingen bil framför) eller
  håller inne tutan läge räknas det. Efter ungefär fem sådana tut blir det **Onödig tutning · −2
  Ordning**. Är Anders inom 70 m ropar han lagen ("Ove! Ljudsignal får bara användas för att avvärja
  fara!"), annars ropar någon från ett fönster ("Tyst därute!", "Vi har ett spädbarn här!"). Ove: "Det
  var fara." Ett långt tut (2 s) bland husen ger ett fönsterrop av sig självt. Att tuta på folk i
  vägen, på bilar och på smitare är aldrig onödigt.
- **Upphämtning.** Den som väntar på Oves bil (Jimmy vid busshållplatsen, Nasanin på förskolan,
  Adrian på parkeringen, Parvaneh på parkeringen när hon har kommit fram) kommer ut till bilen om Ove
  stannar inom 25 m och tutar: "Jag kommer!". De kliver in från 13 m.
- **Katten** vid Oves dörr (efter dag 4) skuttar rakt upp, vänder sig halvt om och fräser. Ove ber om
  ursäkt. Till katten: "Förlåt, katten."
- **Shave and a haircut.** Tutar man rytmen (fem korta tut: långt, kort, kort, långt) svarar den
  närmaste bilisten med två tut. Ove: "Hmpf." Det räknas inte som onödig tutning.
- Inget av det här händer i en scen (dialog eller filmklipp). Första gången Ove sätter sig bakom en
  ratt (varje gång spelet startas) kommer en notis: "T tutar. Folk märker det."

**Hur det är byggt**: `src/game/horn.js` (`Horn`, `game.horn`). Ett tut ser sig omkring: folk i en
kon framför stötfångaren (16–34 m beroende på farten) och alla inom 15 m, och sedan bilarna. Varje
persons reaktion spelas upp av `horn.drive()`, som fotgängarna (`peds.js`) och grannarna
(`main.js stepNpcs`) frågar först. Två nya poser i `src/actors/models.js`: `fright` (händerna upp,
håller i sig genom hoppet) och `fist` (knytnäven). Ljuden i `src/audio.js`: en tuta per märke
(`HORNS`), `yelp` (skriket) och `hiss` (katten). Trafikens AI fick `hurryT` (bilen framför gasar på).
Upphämtningen i `src/game/stages.js` (`pickup`). Allt finns beskrivet i `notes/integration.md`
(*Feature tuta_med_bilen*) och i DESIGN.md 4.7.

## Nya repliker (till a_fully_voiced_game)

104 nya repliker (talare + text), ungefär 1 900 tecken. De ligger som tabeller överst i
`src/game/horn.js`, som de andra delade tabellerna (`OUCH`, `PANIC`, `FLEE_LINES` ...), och tre i
`src/game/stages.js` (`COMING`). Alla är fasta strängar. Förslag på `del` i `script.js`: `horn`.

**Statister** (`horn.js`; röst ur personens eget frö, se 4.3 i röstfeaturen):

| Tabell | Vem | Repliker |
|---|---|---|
| `HONK_SCARED` | vuxen som hoppat undan | Jösses! · Men herregud! · Jag går ju här! · Jag fick nästan hjärtstopp! · Vad tutar du för?! · Hallå, jag har också rätt att vara här! |
| `HONK_SIDEWALK` | vuxen (bilen på trottoaren) | Det här är en trottoar! · Kör på gatan! |
| `HONK_CARFREE` | vuxen (bilen i bilfritt område) | Det är bilfritt här! |
| `HONK_HEARD` | vuxen som stod nära | Lugna ner dig! · Det är en bostadsgata! · Ja, ja, vi hör dig! · Vad är det som brinner? |
| `HONK_OLD` | pensionär (65+) | Ungdomen nu för tiden! · Jag har gått här sedan 1962! · Mitt hjärta! · Jag är inte döv! |
| `HONK_TEEN` | tonåring (13–18) | Okej, boomer. · Lugna dig, gubbe! · Chilla! |
| `HONK_KID` | barn | Igen! · Tuta igen! · Tut tut! · Häftigt! |
| `HONK_WINDOW` | någon i ett fönster (vuxen) | Tyst därute! · Folk sover! · Vi har ett spädbarn här! · Lägg av med tutandet! |
| `HONK_BACK.default` | bilist (bubblan på bilen) | Lugna dig, farbror! · Själv då! · Vad är problemet? · Pensionärer! |
| `HONK_BACK.ahead` | bilisten framför, åt samma håll | Kör om då! |
| `HONK_BACK.blocked` | bilist som stått och tutat bakom Ove | Flytta på dig då! · Det är du som står i vägen! |
| `HONK_BACK.bus` | busschauffören | Bussen har företräde! · Jag har en tidtabell! |
| `HONK_BACK.taxi` | taxichauffören | Jag har en körning! |
| `HONK_BACK.garbage` | sopbilen | Vi jobbar här! |
| `SAAB_GREET` | Saab-förare | Tjena, Saab! |
| `HONK_SMITARE` | smitaren under jakten | Sluta tuta! · Jag hör dig, jag hör dig! · Lägg av med tutan! |

**Grannarna** (`horn.js`):

| Vem | Tabell | Repliker |
|---|---|---|
| Parvaneh | `HONK_NEIGHBOUR` | Ove! Jag är gravid, inte döv! *(dag 1–7)* · Ove! Pojken sover! *(efter dag 7)* · Hallå! Vi har precis flyttat in! *(före dag 1)* |
| Parvaneh | `HONK_PASSENGER` | Ove! Inte i mitt öra! · Måste du, Ove? |
| Patrick | `HONK_NEIGHBOUR` | Oj! Förlåt! Står jag i vägen? · Jag flyttar på mig! Jag flyttar på mig! · Akta armen, Ove! *(från dag 2)* |
| Patrick | `HONK_PASSENGER` | Oj! Jag hoppade till. |
| Sara | `HONK_NEIGHBOUR`, `HONK_PASSENGER` | Tuta igen, Ove! *(från dag 1)* · Igen! Igen! · Igen! |
| Nasanin | `HONK_NEIGHBOUR`, `HONK_PASSENGER` | Tut tut! · Igen! |
| Jimmy | `HONK_NEIGHBOUR`, `HONK_PASSENGER` | Tjena Ove! Tut tut! · Ove! Mannen! Tutar på mig! · Tuta igen, Ove! |
| Adrian | `HONK_NEIGHBOUR`, `HONK_PASSENGER` | Fet tuta, Ove! · Är det originaltutan? · Min Saab har exakt samma tuta! *(från dag 5)* · Får jag också tuta? |
| Anita | `HONK_NEIGHBOUR`, `HONK_PASSENGER`, `ANITA_RUNE` | Ove, Rune sover. · Inte så högt, Ove. · Ove, Rune blir rädd. · Han känner igen tutan, Ove. |
| Rune | `RUNE_HORN` | ...Saab. · ...Volvo. · ...BMW. · ...Hm. |
| Anders | `HONK_NEIGHBOUR`, `ANDERS_LAW`, `HONK_PASSENGER` | Ove! Det är en bostadsgata! · Jag tar upp det på årsmötet, Ove! · Ove! Ljudsignal får bara användas för att avvärja fara! · Onödig tutning, Ove! Det tar jag upp på årsmötet! · Onödig tutning, Ove. |
| Vita skjortan | `HONK_NEIGHBOUR`, `HONK_PASSENGER` | Det där noteras. · Vi har en blankett för sådant. |
| den som hämtas (Nasanin, Jimmy, Parvaneh, Adrian) | `COMING` i `stages.js` | Jag kommer! · Ja, ja, jag kommer! · En sekund bara! |

**Ove** (`OVE_HONK` i `horn.js`): 20 nya repliker. "Tyskt krafs." och "BMW. Hmpf." finns redan i
`TYRE`, och "Hmpf." (efter rytmen) i `OVE_REPLY`.

| När | Repliker |
|---|---|
| en fotgängare i gatan | Trottoaren. Den finns där av en anledning. · Det är en gata. För bilar. · Gå på trottoaren! |
| en bil framför | Blinkers! Har du hört talas om blinkers? · Körkort på internet, va? · Gasen sitter till höger. |
| märket | Volvoförare. · Kommunen. Typiskt. *(Škoda)* |
| en annan Saab | Saab-folk. Vi hälsar. |
| ingenting | Tutan fungerar. · Kontrollerar tutan. |
| en bilist tutade tillbaka | Själv då. · Lär dig köra. |
| barnen jublar | Tutan är ingen leksak. |
| Anders klagar | Det var fara. |
| ett fönster klagar | Det var för att avvärja fara. |
| katten | Förlåt, katten. |
| smitaren under jakten | Stanna! · Stanna, sa jag! |
| en tom felparkerad bil | Ingen hemma. Typiskt. |

Notiserna ("T tutar. Folk märker det.", "Onödig tutning · −2 Ordning") röstas inte.

## Kontroller

`PORT=88xx node tools/shot.mjs horn` (i `tools/scenarios/gameplay.mjs`): 19 kontroller med riktiga
tryck på T (och ett på H). En vuxen, ett barn och en pensionär framför bilen, en BMW som tutar
tillbaka och gasar på, en mötande Saab som hälsar, en smitare som skräms iväg och sedan tappar
motstånd, onödig tutning (−2 Ordning, ett klagomål och Oves svar), shave and a haircut, Jimmy som
kommer ut till bilen vid busshållplatsen, Rune och Anita, Parvaneh som passagerare, H, ingen tuta i en
scen, och katten efter dag 4. `hornlook` tar närbilder med fast kamera (`WHO=adult|kid|old|patrick`).
Bilder i `out/horn_*.png` och `out/hornlook_*.png`.
