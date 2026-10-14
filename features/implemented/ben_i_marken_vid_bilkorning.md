# Ben i marken vid bilkörning

## Definitionen

Se features/implemented/ben_i_marken.png
När man kör en bil så syns benen under bilen...

Överdelen av kroppen sitter bra till, så enklast är kanske att bara gömma nederdelen av kroppen
när man är i bilar.

## Felet

Den som sitter i en bil sitter med höfterna 0,12 m över sätets dyna, och bilarnas säten ligger lågt
(dynan 0,33–0,39 m över vägen i personbilarna). Sittposen har låren nästan vågräta och underbenen
rakt ner, så fötterna hamnade 0,4–0,5 m under dynan: genom bilens golv (bilarna är skal utan
fotutrymme) och ner i vägen. Därför syntes skor och byxben under tröskeln.

Det gällde de riktiga karaktärerna: Ove när han kör och grannarna som åker med eller sitter vid
ratten. Trafikens förare är **byster** (`buildBust`) som redan var byggda utan underben (byxorna
slutar strax under knät, inga skor), så de var aldrig fel.

## Vad som gjordes

Som definitionen föreslog: underbenen göms när man sitter i en bil, överkroppen och låren är som
förut.

- `animateCharacter` (src/actors/models.js): när `st.seated` är satt skalas skenbensbenen
  (`m.shins`) till 1e-4, så att underben och fötter viks in i knäna, samma knep som rekvisitan
  (telefonen, pennan) och Runes rullstol redan använder. Inget mjukt övergångsläge: man sätter sig
  och kliver ur med ett klipp, så benen kommer och går med det. `m.shinsIn` minns vad den senaste
  posen gjorde.
- `Character.sync` (src/actors/character.js): animationens detaljnivå poserar folk långt bort bara
  var 2:a eller 4:e bildruta. Den som kliver ur en bil 150 m bort hade då kunnat gå ett par bildrutor
  utan underben. Nu poseras man direkt den bildruta man sätter sig eller kliver ur
  (`shinsIn !== seated`), oavsett detaljnivå.
- Byster påverkas knappt: de bakas med samma pose, så de få centimetrarna byxben under knät viks
  också in (de syns aldrig inifrån bilen).

Skillnad mot definitionen: bara underbenen (knä och nedåt) göms, inte hela nederdelen. Låren ligger
på dynan i höjd med sätet, bakom dörrarna, och syns genom vindrutan och sidorutorna som ett knä.
Utan dem skulle den som sitter se ut att sakna knä när man tittar in snett uppifrån.

## Verifiering

`PORT=88xx node tools/shot.mjs seatlegs` (tools/scenarios/people.mjs): varje bilmodell (Volvo 240 och
740, Audi, BMW, Škoda, Golf, kombi, taxi, skåpbil, buss, sopbil, Saab) i tur och ordning på samma tomma
gata, med en byst eller en granne vid ratten och grannar bredvid och bak (Rune i rullstol, barnen
Sara och Nasanin, Jimmy, Anita, Adrian, Ove vid ratten i Saaben). Sex låga vyer per bil
(`ppl_seat_<modell>_<vy>.png`: L/R = förarens och passagerarens sida i knähöjd, Lg/Rg nere vid vägen
under trösklarna, FL/RR = hörnen fram och bak). Kontroller (fel blir console errors):

- ingen punkt på någon som sitter, under sätets dyna, syns från någon av vyerna (en stråle från
  kameran till punkten träffar bilens kaross; hjulen räknas inte, de ritas för sig). Före ändringen:
  22 fel, alla riktiga karaktärer i personbilarna och Parvaneh i bussen (i skåpbilen och sopbilen
  sitter man högt nog), fötterna 0,4–0,5 m under dynan. Efter: inga fel, den lägsta punkten högst
  3 cm under dynan (knät);
- underbenen är tillbaka redan bildrutan efter att man klivit ur, för Ove, för Parvaneh och för
  Anita som kliver ur 150 m från kameran (poserad var 4:e bildruta). Utan ändringen i
  `Character.sync` misslyckas den sista.

Dessutom körda utan fel: `peopledrive` (Ove genom vindrutan), `pplanim`, `drive`, `companion` och
`story` (alla sju dagarna).
