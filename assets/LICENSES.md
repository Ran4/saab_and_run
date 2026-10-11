# Third-party assets

Every file in `assets/` is derived from **CC0 1.0 (public domain)** sources. No attribution is
required; it is given here anyway. Textures were downloaded at 1K and repacked by
`tools/textures.py` into two JPGs per surface:

- `tex/<key>_a.jpg` – albedo *detail*: the photo's colour divided by its mean colour (x0.5, sRGB),
  with very low frequencies flattened and ambient occlusion baked in. The shader multiplies it by
  the vertex colour, so content code chooses the colour and the texture adds the variation.
- `tex/<key>_n.jpg` – R,G = OpenGL tangent-space normal X/Y, B = roughness.

| file(s) | source asset | site / author | licence | URL |
|---|---|---|---|---|
| `tex/wood_*` (vertical board panel) | White Planks Clean | Poly Haven / Rob Tuytel | CC0 | https://polyhaven.com/a/white_planks_clean |
| `tex/brick_*` | Bricks 101 | ambientCG | CC0 | https://ambientcg.com/view?id=Bricks101 |
| `tex/rooftile_*` (wavy concrete pantiles) | Roofing Tiles 006 | ambientCG | CC0 | https://ambientcg.com/view?id=RoofingTiles006 |
| `tex/metalroof_*` (sheet-metal roof) | Box Profile Metal Sheet | Poly Haven / Amal Kumar | CC0 | https://polyhaven.com/a/box_profile_metal_sheet |
| `tex/asphalt_*` (also road markings) | Asphalt Floor | Poly Haven / eye-candy.xyz | CC0 | https://polyhaven.com/a/asphalt_floor |
| `tex/concrete_*` | Concrete 034 | ambientCG | CC0 | https://ambientcg.com/view?id=Concrete034 |
| `tex/plaster_*` (plain / plaster) | White Stucco | Poly Haven / Amal Kumar | CC0 | https://polyhaven.com/a/white_stucco |
| `tex/paving_*` (concrete slabs) | Concrete Pavement | Poly Haven / Charlotte Baglioni | CC0 | https://polyhaven.com/a/concrete_pavement |
| `tex/snow_*` | Snow 010 A | ambientCG | CC0 | https://ambientcg.com/view?id=Snow010A |
| `tex/grass_*` (dry winter grass) | Sparse Grass | Poly Haven / Amal Kumar | CC0 | https://polyhaven.com/a/sparse_grass |
| `tex/gravel_*` | Gravel Floor | Poly Haven / Jenelle van Heerden, Matterfield | CC0 | https://polyhaven.com/a/gravel_floor |
| `tex/bark_*` | Pine Bark | Poly Haven / Dimitrios Savva | CC0 | https://polyhaven.com/a/pine_bark |
| `tex/fabric_*` (wool coat cloth) | Caban | Poly Haven / colormass, Rico Cilliers | CC0 | https://polyhaven.com/a/caban |
| `tex/leather_*` | Brown Leather | Poly Haven / Rob Tuytel | CC0 | https://polyhaven.com/a/brown_leather |
| `tex/metal_*` (brushed / galvanised) | Metal 009 | ambientCG | CC0 | https://ambientcg.com/view?id=Metal009 |
| `sky/passendorf_snow_2k.hdr` (default sky + IBL) | Passendorf Snow | Poly Haven / Grzegorz Wronkowski | CC0 | https://polyhaven.com/a/passendorf_snow |
| `sky/winter_river_2k.hdr` (alternative, hazier: `?hdri=winter_river_2k`) | Winter River | Poly Haven / Sergej Majboroda | CC0 | https://polyhaven.com/a/winter_river |

Licence texts: Poly Haven – https://polyhaven.com/license ; ambientCG – https://docs.ambientcg.com/license/
(both CC0 1.0 Universal, https://creativecommons.org/publicdomain/zero/1.0/).

`sfx/` (Ove's jump grunts and landings) is made with ElevenLabs (text to speech in Ove's voice) by
`tools/sfx/grunts.mjs`, as `voice/` and `music/` are (features/implemented/a_fully_voiced_game.md).

Procedural (no texture files): foliage, skin, hair, car paint, chrome, painted surfaces, rubber,
plastic, glass, lights, water, ice, particles, markers.
