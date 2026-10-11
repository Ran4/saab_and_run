# Oves gång, löpning och hopp

## Önskemålet

Oves gång- och springanimation ser fula ut - de behöver se mycket mer realistiska ut.
Hans hopp är lite för snabbt också - han borde kännas lite mer gubbig, typ att han behöver ta i lite
och kanske stönar lite när han hoppar upp.

## Vad som blev gjort (2026-10-11)

Farterna är kvar: gång 3,2 m/s och Shift 5,5 m/s (ditt val). 3,2 m/s är ingen vanlig promenad,
människor byter till löpning vid ungefär 2 m/s. Därför är gången nu en bestämd, rask Ove-marsch och
Shift ett hårt gubbspring.

**Gång och löpning** (`locomotion()` i `src/actors/models.js`, gäller alla som går):

- Fötterna hamnar på varsin linje i stället för på en lina. Förut gled den nedsatta foten ungefär
  13 cm i sidled per steg, eftersom benen följde med när höfterna vred sig. Nu har han en riktig
  stegbredd (ca 11 cm) och tårna lite utåt (9°).
- Höfterna vrider sig, sjunker på svingsidan och vaggar över stödfoten. Axlarna vrider sig mot
  höfterna. Bäckenets höjd följer en jämn kurva i stället för att rycka.
- Fötterna står kvar där de sattes ned: glidningen är nu 0,04–0,18 m/s, förut 0,37–0,95 m/s. Ingen
  fot går ned i marken. Hälen bromsar in och landar på sin punkt i stället för att skrapa fram.
  Bakre benet böjer knät i frånskjutet.
- Armarna pendlar från axeln, och armbågarna böjs mer ju fortare han går. Förut stod underarmarna
  stelt rakt fram. När han springer går armbågarna bakåt och händerna upp mot bröstet.
- Löpningen är en tyngre gubbes: hälarna sparkas inte upp mot baken som hos en sprinter, armbågarna
  går lite utåt och munnen står lite öppen.
- Gång och löpning byter med hysteres i stället för att blandas. En halvlöpning vid 4,3 m/s blev
  varken eller, och grannar som hinner ikapp Ove i 4,6 m/s springer nu.
- Ove har stilen `old: 0.6`: lite framåtlutad, bredare och mer vaggande, stelare knän.

**Hoppet** (`Character.jump` och `JUMP` i `src/actors/character.js`, `src/main.js`):

- Först tar han sats i 0,22 s (0,1 s i farten): knäna böjs, överkroppen fälls fram, armarna går
  bakåt, han kniper ihop ögonen och biter ihop.
- Sedan skjuter han ifrån med ett ansträngt "hnngh" (`audio.grunt`) och svävar ungefär 0,56 s i
  stället för 0,45 s. Hopphöjden är 0,52–0,55 m, så allt som gick att hoppa upp på går fortfarande.
- I luften sträcker han på sig. Står han still drar han upp knäna lite och har armarna ut för
  balansen. I farten blir det ett kliv med vänster ben först.
- Landningen tar han med knäna, och sju gånger av tio säger han "uff" (`audio.oof`). Det kommer lite
  snö upp och han är segare i ungefär 0,4 s. Fortfarande inga dubbelhopp.
- Ljuden är syntetiska röster med formanter och knarr, som resten av spelets ljud. Vill du ha riktiga
  röstinspelningar hör det ihop med förslaget i `features/a_fully_voiced_game.md` (ElevenLabs).

**Verktyg**: `tools/gait.mjs` + `tools/gait.html` filmar Ove bild för bild från sidan eller bakifrån
(`walk run jump clip ...`), mäter gången (`metrics`) och renderar hoppets ljud (`sound`). Mer om det
står i `notes/people.md`, avsnittet *Gait*.

**Kontroller**: `metrics`, people-sidans `slip`/`perf`, `walk`, `pplanim`, `talk`, `story`, `m4cat`
och `lotwalk`. Animationen kostar ungefär 1 µs mer per person och bildruta.
