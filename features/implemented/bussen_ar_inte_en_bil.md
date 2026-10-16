När man är bredvid en buss så står det typ "låna bilen". Borde stå "Låna bussen".
Och det borde vara passagerare i bussen (inte så att de går av osv., men bara allmänt,
passagerare i bussen).

Om man kör på något med passagerar i bussen, så ska passagerare kommentera på det.

De ska även säga saker som "Jag ska av här!" (sägs av en tant) då och då.

---

## Implementerat (2026-10-17)

### "Låna bussen"

Prompten tar fordonets namn i bestämd form: **E Låna bussen**, *Låna sopbilen*, *Låna taxin*,
*Låna skåpbilen* (traktorn har ingen förare: *Kliv in*), annars *Låna bilen* som förut. Utöver
definitionen gäller samma sak allt annat som sa "bilen" om fordonet Ove sitter i: uppdragens
"Kliv ur bussen.", "Stanna bussen.", "Kliv ur traktorn först", "Det finns ingen plats i bussen." och
KVADDAD-skylten "Bussen är förstörd". (`spec.the` / `car.the` i car.js.)

Chauffören som kliver ut när Ove lånar bussen sa förut "Hallå! Min bil!". Nu är det alltid en vuxen
(19+), och hen säger "Hallå! Min buss!" eller "Jag har en tidtabell!".

### Passagerarna

Stadsbussen i trafiken har **5–9 passagerare**, och **en av dem är alltid en tant** (en kvinna över
65). De andra är vuxna och tonåringar (inga barn: barnrösterna har inga av replikerna). De sitter
framåtvända på bussens säten med ryggen mot ryggstödet och händerna i knät, några tittar ut genom
fönstret. Ingen kliver av eller på, vem som än kör bussen, och de sitter kvar när Ove lånar den.

- De är samma sorts byster som förarna i trafikbilarna (bakade, ingen skelettanimation), men alla i
  en buss är **en enda mesh: två ritanrop** för hela busslasten, och de kastar ingen egen skugga
  (bussens kaross skuggar dem redan). De döljs på avstånd precis som förarna (bortre LOD:ens glas är
  ogenomskinligt).
- En byst tar 4–6 ms att bygga, så en ny buss får sina passagerare **en per bildruta** (5–9 bildrutor;
  bussen dyker ändå upp minst 120 m bort). Vid laddningen byggs de direkt.
- Sätena: 18 platser i bussmodellen (`benches`), inte raden bakom föraren och inte vid mittdörren. De
  två platser där en granne som åker med sätter sig lämnas fria.
- En kvaddad buss har inga passagerare kvar (glaset är borta, de har tagit sig ut).

### Vad de säger

Bara när Ove kör en buss med folk i. Bubblan syns ovanför taket där personen sitter, och rösten är
personens egen ur poolen (efter kön, ålder och personens frö, som för fotgängarna), hörd som en
passagerare i bilen.

- **När Ove tar bussen** (första gången): "Var är chauffören?" / "Är du vikarie?". Ove: "Det är jag
  nu. Sitt still."
- **När han kör på något** (högst var fjärde sekund):
  - en bil: "Du körde på en bil!", "Vad håller du på med?!" och det allmänna nedan;
  - en vägg, en lyktstolpe eller annan rekvisita: "Mitt kaffe!", "Det är en buss, inte en radiobil!",
    "Vem har gett dig körkort?", "Aj!", "Är du inte klok?!", "Kör som folk!", "Men herregud!",
    "Galning!";
  - en fotgängare: "Du körde på någon!", "Jag ringer polisen!" (då säger Ove ingenting);
  - landar efter ett hopp (hoppbacken): "Bussar ska inte flyga!", "Men herregud!";
  - någon som fick hoppa undan eller knuffades åt sidan: "Se upp!", "Sakta ner!" (40 %);
  - en äldre passagerare ibland: "Min höft!", "Mitt hjärta!".
  En hård smäll (9 m/s) får två av dem att säga något. Efter en bil eller en vägg säger Ove ibland
  "Den stod i vägen.", och på "Mitt kaffe!" svarar han "Man dricker inte kaffe på bussen."
- **Då och då** (var 18:e–34:e sekund): tanten **"Jag ska av här!"**, en äldre "Förr hälsade
  chauffören.", eller någon "Varför kör vi den här vägen?", "Det här är inte linje tre." (skylten säger
  3 CENTRUM; Ove: "Nej. Det här är linje Ove.") eller "Kan du sätta på värmen?" (Ove: "Nej.").
- **Vid busshållplatserna**: när bussen kommer inom 30 m från en hållplats säger tanten "Jag ska av
  här!" (Ove: "Det här är ingen linjetrafik."). Kör han förbi utan att stanna där säger hon "Du körde
  förbi min hållplats!". Stannar han kliver hon ändå inte av.

Ove svarar på det som har ett svar ungefär varannan gång. Samma replik kommer inte igen förrän fyra
andra har sagts (om det går).

### Röster

16 nya repliker: 11 för alla vuxna poolröster (12 röster), 3 bara för de gamla (4 röster), "Hallå!
Min buss!" för förarnas röster och 5 för Ove. Replikerna som redan fanns (ur OUCH, PANIC, HONK_OLD,
HONK_BACK, Oves "Nej.") har kvar sina klipp. Det blev 161 nya klipp, 3 439 tecken och ungefär 3 439
credits, plus fyra omtagningar (cirka 100 credits): taligenkänningen hör "Förr hälsade chauffören."
som "För hälsade …" (orden låter likadant), så två röster (`ped_f_old_2`, `ped_m_old_1`) togs om två
gånger och ligger på granskningslistan (`make voice-review`). Någon behöver lyssna på dem. Manuset är
nu 627 repliker och 19 118 tecken (med poolen 1 629 repliker, 1 628 klipp); `make voice-check` går
igenom.

### Hur man verifierar

```
PORT=88xx node tools/shot.mjs buss busslook
```

- `buss`: 37 kontroller med riktiga tangenttryck. Prompten bredvid bussen, en Volvo och sopbilen. E
  tar bussen (en vuxen chaufför ut med en bussreplik) och uppdragstexten "Kliv ur bussen.". Frågan om
  chauffören, sagd med talarens egen poolröst, och Oves svar. En parkerad bil påkörd med W (två
  röster), en vägg, en fotgängare påkörd. Deras egna repliker. Solrosvägens hållplats: förbi utan att
  stanna, sedan med stopp. Ingen har klivit av. E ut och in igen (ingen ny fråga om chauffören),
  bubblan, bakningen en i taget, en borttagen buss (geometrin frigjord) och en kvaddad.
  Skärmbilder: `buss_prompt`, `buss_aboard`, `buss_hit`, `buss_stop`, `buss_bubble`.
- `busslook`: närbilder genom fönstren och inifrån (`buss_*.png`), ritanropen med och utan
  passagerarna, och att de döljs med bortre LOD:en.
- `QUERY='&voice' ... buss`: samma sak med rösterna på. Alla deras repliker och Oves svar sägs som
  klipp (21 i körningen), inget klipps av, inget sägs som inte finns i script.js. Lägena är 'car'
  (passagerarna) och 'dialog' (Ove).
- Regressioner som kördes (alla `no errors`): `story` (`#7 idle`), `vpool`, `horn`, `carcycle`,
  `seatlegs`, `smalltalk`; `make voice-check`.
