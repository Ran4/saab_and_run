// Cars: arcade physics with weight (realistic accelerations, grip limit, body roll / pitch /
// squat / dive on a soft suspension), realistic shared models (carmodels.js), lights, Swedish
// licence plates, an optional trailer (trailer.js). See notes/cars.md for the API.

import { THREE, realMesh, surfaceMaterial, MAT, camera, scene, renderer as gfxRenderer, composer, LIGHTING } from '../gfx.js';
import { queryBlocks, obbVsBlock, obbVsObb, groundAt, groundInfo, topAt, hillSlope, RAMP, HILL } from '../world/collision.js';
import { isRoad } from '../world/layout.js';
import { clamp, damp, pick, angleDiff } from '../util.js';
import { fx as FX } from '../game/fx.js';
import { carModel, snowCapGeometry, trackWheels, lightMaterial, glowMaterial, randomPlate, claimPlate, releasePlate, allocPlate, freePlate, plateGeometry, setWheelMaterials, CH, carsChanged, addRenderHook, makeWheelPools, MODEL_KEYS } from './carmodels.js';
import { Trailer } from './trailer.js';

// Physics/spec per type. Speeds in m/s, accelerations in m/s². maxSpeed/accel are what AI and
// parked-then-driven cars get; the player's car gets PLAYER.speed x / PLAYER.accel x on top
// (the Saab: 31 m/s x 1.25 = 139 km/h). bodyH is kept so that wheelR * 0.95 + bodyH = seat
// height (the formula old main.js uses to seat people); use car.seatLocal() instead.
// drive: the driven wheels ('fwd', 'rwd', 'awd'), which decide what the throttle does to a slide.
const S = (o) => ({ brake: 8.5, grip: 9.2, steer: 0.56, revMax: 4.5, tall: false, drive: 'fwd', ...o });
export const CAR_TYPES = {
  saab900: S({ name: 'Saab 900', model: 'saab900', maxSpeed: 31, accel: 5.2, grip: 9.6, steer: 0.58, mass: 1250, hp: 110, color: 0x1d2c4a }),
  volvo240: S({ name: 'Volvo 240', model: 'volvo240', maxSpeed: 29, accel: 4.6, grip: 9.0, steer: 0.55, mass: 1330, hp: 125, solid: true, drive: 'rwd' }),
  volvo740: S({ name: 'Volvo 740 kombi', model: 'volvo740', maxSpeed: 30, accel: 4.8, grip: 9.0, steer: 0.54, mass: 1400, hp: 125, drive: 'rwd' }),
  audi: S({ name: 'Audi A6', model: 'audi', maxSpeed: 35, accel: 6.2, grip: 10.2, steer: 0.55, mass: 1650, hp: 115, color: 0x2a2c30, drive: 'awd' }),
  bmw: S({ name: 'BMW 5-serie', model: 'bmw', maxSpeed: 34, accel: 5.8, grip: 9.8, steer: 0.56, mass: 1500, hp: 115, drive: 'rwd' }),
  skoda: S({ name: 'Škoda Octavia kombi', model: 'skoda', maxSpeed: 32, accel: 5.4, grip: 9.6, steer: 0.56, mass: 1400, hp: 110, color: 0xd2d2d0, solid: true }),
  golf: S({ name: 'Volkswagen Golf', model: 'golf', maxSpeed: 31, accel: 5.4, grip: 10.0, steer: 0.6, mass: 1200, hp: 100 }),
  kombi: S({ name: 'Kombi', model: 'kombi', maxSpeed: 30, accel: 4.9, grip: 9.2, steer: 0.55, mass: 1450, hp: 110 }),
  taxi: S({ name: 'Taxi', model: 'taxi', maxSpeed: 32, accel: 5.2, grip: 9.4, steer: 0.56, mass: 1550, hp: 120, color: 0x18191b }),
  van: S({ name: 'Skåpbil', model: 'van', maxSpeed: 27, accel: 4.0, brake: 7.5, grip: 8.2, steer: 0.52, mass: 2300, hp: 150, tall: true, color: 0xd0d0cc, solid: true, drive: 'rwd' }),
  bus: S({ name: 'Stadsbuss', model: 'bus', maxSpeed: 20, accel: 2.2, brake: 6.0, grip: 7.6, steer: 0.5, mass: 11000, hp: 400, tall: true, color: 0x861410, solid: true, drive: 'rwd' }),
  garbage: S({ name: 'Sopbil', model: 'garbage', maxSpeed: 19, accel: 2.0, brake: 6.0, grip: 7.4, steer: 0.48, mass: 15000, hp: 400, tall: true, color: 0xd2d2cc, solid: true, drive: 'rwd' }),
};
// Old keys from the cel-shaded game keep working.
export const CAR_ALIASES = { sedan: 'volvo240', hatch: 'golf', wagon: 'kombi', pickup: 'van', hearse: 'skoda', muscle: 'bmw', icecream: 'van' };
for (const [k, v] of Object.entries(CAR_ALIASES)) CAR_TYPES[k] = CAR_TYPES[v];
// accel 0.88: the Saab does 0-100 km/h in ~7.5 s (a real 900 needs ~10 s; this is arcade).
// aLat 9.5 m/s² (~0.97 g): a heavy old car on damp winter asphalt, not sports-car grip; reversing
// tops out at revMax (4.5 m/s, 16 km/h).
export const PLAYER = { speed: 1.25, accel: 0.88, brake: 1.15, aLat: 9.5 };
const AI_ACCEL = 1.15; // AI drivers are not shy with the pedal
// Snow hills (feature snöhög, world/snowhill.js: collision.js HILL floors). On one the car follows the
// surface and feels its slope (`slope` m/s², gravity along it: a hill slows the climb, a stopped car
// rolls back unless held), until the surface falls away faster than a thrown stone would (the
// kicking edge of the hoppbacke, a crest at speed): then it flies (car.flight) under `grav` (gentler
// than the 22 of a car going off a ledge: the air time is the point) and lands on what is under it.
// A landing is judged by the speed into the surface (along its normal: the landing face of the hill
// takes a car coming down the way it slopes), and `carry` of what goes along the slope is kept.
// The nose follows the flight path (`nose` of its angle), so the car meets the landing face with it.
// Sideways the tyres hold a slope up to `hold` m/s² of gravity (packed snow): a car standing across a
// flank stays put, on a steeper one it slips down.
export const HOPP = { grav: 15, slope: 9.8, carry: 1, nose: 0.85, hold: 3.5 };
const _sl = { gx: 0, gz: 0 };
// Winter roads at speed (the player's car, not towing; feature fixa_bilen): from hs0 (32 km/h) to
// hs1 (79 km/h) the rear lets go before the front. Asked for more than the tyres give, the car turns
// harder than its path instead of understeering: its yaw reaches `ov` x the grip limit (by drivetrain,
// [on the throttle, off it]: the throttle swings a rear-driven tail out, lifting off lightens a
// front-driven car's rear; a full brake locks the wheels - no ABS in these cars - and the car slides
// along its path: `brake` [0] instead, and in a slide it pulls the car straight at [1] per rad of
// slip, so stamping on the brake always calms it down; `kRamp`: how fast the old understeer gives way
// with hs), while the tyres hold the path to aLat x `grip` ([at hs0, at hs1], plus `pull` x the
// throttle x (1 - hs): driven front wheels pull a car along its path at moderate speed), so the tail
// steps out. Past `enter` rad of slip ([at hs0, at hs1]: not the slip of an ordinary tight corner at
// 40 km/h; slipping the way the car turns and the driver steers, so a knock never starts one) the
// slide (SLIDE below) takes over at `take` /s (car.loose), and the car wants to come round until it
// is caught; in such a slide the tyres give `slideA` m/s² sideways instead of SLIDE.a, so it stays
// sideways and scrubs speed but follows the road. `lock`: what the player's full lock asks for at
// speed (x the grip limit; 1.35 below hs0). A steer against the turn of the last ~0.5 s (the
// Scandinavian flick) adds `flick` to `ov` and takes `flickGrip` of the grip for as long as the key is
// held (fading in ~0.7 s): the tail swings out the other way.
export const WINTER = { hs0: 9, hs1: 22, ov: { fwd: [1.2, 1.6], awd: [1.45, 1.55], rwd: [1.8, 1.55] }, grip: [1.12, 0.85], pull: { fwd: 0.4, awd: 0.2, rwd: 0 }, kRamp: 1, slideA: 8.5, brake: [1.05, 1.5], flick: 1, flickGrip: 0.5, enter: [0.24, 0.14], take: 6, lock: 2.1 };
// The slide (car.drift 0..1). The handbrake (above 2 m/s forwards, not towing) lets the rear go, and
// the slide holds after it is let go: a sliding tyre gives a steady `a` m/s² sideways (x 0.62 on
// snow) instead of a grip that grows with the slip, so the slip angle stays where it is unless
// something changes it. The steering does (rad/s of slip angle: into the slide `in` up to `hold`
// rad, `past` beyond it, the counter-steer `counter`, with the handbrake held `hb`), and the throttle
// does, by drivetrain (`push`: d|slip|/dt per rad of slip, up to `pushMax` rad, at full throttle /
// coasting - a rear-driven car's throttle swings the tail further out, a front-driven one's pulls the
// nose straight; lifting off leaves either sliding). The slide is over when the car is straight again
// (under `straight` rad), slows to a crawl, or has spun past `spun` rad. `wK`: how fast the yaw follows.
// Handbrake + throttle + steering below `pivotV` m/s: a donut (`pivot`: the yaw rate at full lock;
// a rear-driven car swings round its front axle, a front-driven one round its rear, 4x4 its middle).
export const SLIDE = {
  a: 5.2, in: 1.15, past: -0.2, hold: 0.95, counter: 1.3, hb: 2.4, wK: 11, straight: 0.07, spun: 2.3,
  push: { rwd: [0.15, -0.6], fwd: [-1.8, -0.45], awd: [-1.0, -0.55] }, pushMax: 0.8,
  pivotV: 5, pivot: { rwd: 1.75, fwd: 1.3, awd: 1.2 },
};
const smooth01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// Everyday Swedish car colours (sRGB): silver, white, black, greys, dark blue, wine red, green,
// beige, a few metallic blues. `solid` types draw from SOLID.
const COLORS = [0x8f9397, 0x9da1a4, 0xcfcfcb, 0x1a1b1d, 0x55595d, 0x3c4045, 0x1f2c48, 0x5b1a1e, 0x253a2c, 0xb6a98e, 0x6e8294, 0x8c9093, 0x2f3d55, 0x7a1c18, 0x424f3e];
const SOLID = [0xd0d0cc, 0xc4c0b4, 0x9a1c18, 0x1f2a44, 0x2a4a34, 0xc8b48a, 0x1a1a1a, 0x6c7a82, 0xb33a1a];
const SOLID_TYPES = new Set(['bus', 'garbage']);
const NEAT = { saab: 0.35, andersAudi: 0.3, adrianSaab: 0.5 };
const TAXI = [0x18191b, 0x18191b, 0xcfcfcb, 0x8f9397, 0x3c4045];

// Car materials. The lofted bodies have real curved panels, so the paint's fake curvature
// (TRI_CURVE, meant for box cars) is switched off: stacked on the real normals it tilted every
// panel towards the sky and washed the colour out; the sky-reflection boosts come back to ~1 for
// the same reason. Every car material is wrapped by carShade():
//  - a lower cap on the sun's direct specular: three's minimum roughness spreads a mirror's sun
//    glint over a whole flat pane or panel, and at the default cap (3, above the bloom threshold) a
//    side window facing the sun became a white sheet;
//  - the road under the car instead of the HDRI's snowfield: the environment's lower hemisphere is
//    the photo's bright field, so every sill, door bottom and bumper mirrored snow and dark cars read
//    two-tone. Reflections (and most of the diffuse sky light) arriving from below the horizon are
//    swapped for damp asphalt, as a car standing on a plowed street would see, and the band just
//    above the horizon is dimmed to the street's houses and trees (ROAD_GLSL);
//  - cabin occlusion (seats, dash, steering wheel, headliner - all 'fabric'): the roof and pillars
//    hide most of the sky and the sun comes in through glass, so an interior is not lit like the
//    street outside.
// CAR_GROUND = the road's radiance as a fraction of the environment's (snow) ground radiance:
// asphalt ~0.12 albedo against snow ~0.8, and partly in the car's own shadow.
const CAR_GROUND = 0.16;
const uCarGround = { value: new THREE.Vector3(0.05, 0.05, 0.055) };
let groundSet = false;
function setCarGround() {
  if (groundSet || !LIGHTING?.ground) return;
  const g = LIGHTING.ground;
  if (g.r + g.g + g.b <= 0) return;   // the sky isn't processed yet
  uCarGround.value.set(g.r * CAR_GROUND, g.g * CAR_GROUND, g.b * CAR_GROUND * 1.04);
  groundSet = true;
}
// Reflections by elevation: below the horizon the road; up to ~40° above it the street's houses,
// trees, snow banks and parked cars (two storeys 10 m away reach ~30°, birches and the lamellhus
// higher) rather than the photo's bright haze - a vertical door or sill reflects exactly that band and read brighter than the door's upper
// half, which sees the sky; above that the sky.
const ROAD_GLSL = `
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
{
  vec3 gRw = inverseTransformDirection( reflect( - geometryViewDir, geometryNormal ), viewMatrix );
  radiance *= mix( 0.36, 1.0, smoothstep( 0.0, 0.75, gRw.y ) );
  // the photo's halo round the (clamped) sun is a lens glare, far brighter than the sky a panel would
  // mirror there: whole panels turned between the sun and the camera lit up silver
  radiance *= 1.0 - 0.45 * smoothstep( 0.8, 0.96, dot( gRw, uCarSun ) );
  radiance = mix( radiance, uCarGround, smoothstep( 0.0, -0.32, gRw.y ) );
  #ifdef USE_CLEARCOAT
    vec3 gRc = inverseTransformDirection( reflect( - geometryViewDir, geometryClearcoatNormal ), viewMatrix );
    clearcoatRadiance *= mix( 0.36, 1.0, smoothstep( 0.0, 0.75, gRc.y ) );
    clearcoatRadiance *= 1.0 - 0.45 * smoothstep( 0.8, 0.96, dot( gRc, uCarSun ) );
    clearcoatRadiance = mix( clearcoatRadiance, uCarGround, smoothstep( 0.0, -0.32, gRc.y ) );
  #endif
  // the diffuse sky light: the lower hemisphere's share of the irradiance comes mostly from the road
  // (a quarter from the snow banks beside it: a shade side must not go black in a snowy suburb)
  float gNy = inverseTransformDirection( geometryNormal, viewMatrix ).y;
  iblIrradiance = max( vec3( 0.0 ), iblIrradiance - 0.75 * PI * max( vec3( 0.0 ), uCarGroundEnv - uCarGround ) * clamp( 0.5 - 0.5 * gNy, 0.0, 1.0 ) );
}
#endif
`;
const uCarGroundEnv = { value: new THREE.Vector3() };
const LOD_GLASS_LIN = new THREE.Color(0x14181d);
const uCarSun = { value: LIGHTING?.sunDir || new THREE.Vector3(0.5, 0.22, -0.6).normalize() };   // carmodels.js: the LOD body's opaque glass colour
// Road grime (round 3): a Swedish November road is salted and wet, so every car that drives carries a
// film of dried salt and road spray - heaviest on the sills, behind the wheels, round the arches and
// on the rear panel, a pale grey-beige film on dark paint and a darker grey on light paint, matte,
// with the clear coat gone where it lies. Where it can lie is a per-vertex mask baked into the body
// geometry (carmodels.js `cgrime`: exposure to spray); how much a car carries is the material's
// uCarGrime (traffic 0.5-1, parked old cars more, Ove's Saab ~0.35), quantised into GRIME_LV so cars
// of one colour share a handful of materials. gP is the part-local position (the car's own frame for
// the lofted body): the noise is spray streaks along the car and droplet speckle.
export const GRIME_LV = [0, 0.35, 0.6, 0.85, 1.1];
export function grimeLevel(a) { let best = 0; for (let i = 1; i < GRIME_LV.length; i++) if (Math.abs(GRIME_LV[i] - a) < Math.abs(GRIME_LV[best] - a)) best = i; return best; }
const GRIME_VERT_PARS = 'attribute float cgrime;\nvarying float vCarGrime;';
const GRIME_FRAG = `
float gCarGrime = 0.0;
{
  // phase 4 round 2: road spray, not blotches. The film follows the baked exposure mask (vCarGrime) x
  // the car's amount (CAR_GRIME_AMT), broken up by streaks that run back along the car on the sides
  // (long along z, a few cm tall) and by soft drip runs on the front / rear faces, and it ends in a
  // crisp, ragged spray line where the exposure falls below a threshold (higher up on a dirtier car;
  // the mask rises round and behind every arch, so the line does too). Fine noise fades out when it
  // gets finer than a couple of pixels (far cars). Derivatives are taken before the branch; a noise is
  // only evaluated where it has weight (no more lookups per pixel than round 3's three).
  float ge = vCarGrime, gAmt = CAR_GRIME_AMT;
  float gm = ge * gAmt;
  float kF = 1.0 - smoothstep( 0.003, 0.008, length( fwidth( gP ) ) );
  float gFwE = fwidth( ge );
  if ( gm > 0.002 ) {
    vec3 q = gP;
    float kS = 1.0 - smoothstep( 0.35, 0.75, abs( gTN.z ) );                     // 1 on the sides, 0 on the front / rear faces
    float n3 = 0.5, nF = 0.5, n2 = 0.5;
    if ( kS > 0.0 ) n3 = gNoise( vec3( q.x * 1.5, q.y * 40.0, q.z * 1.5 ) + 7.7 );      // spray streaks along the car
    if ( kS < 1.0 ) n3 = mix( 0.5 + ( gNoise( vec3( q.x * 24.0, q.y * 3.0, q.z * 24.0 ) + 4.1 ) - 0.5 ) * 0.6, n3, kS );   // drip runs
    if ( kF * kS > 0.0 ) nF = gNoise( vec3( q.x * 8.0, q.y * 105.0, q.z * 3.2 ) + 1.3 );   // finer streaks
    // droplet speckle: a fine lattice turned 37 deg in the side plane (an axis-aligned value-noise
    // lattice read as square pixels on a door)
    if ( kF > 0.0 ) n2 = gNoise( vec3( q.x * 61.0, ( 0.8 * q.y + 0.6 * q.z ) * 61.0, ( 0.8 * q.z - 0.6 * q.y ) * 61.0 ) + 3.1 );
    float g = gm * ( 0.8 + 0.42 * ( n3 - 0.5 ) + 0.18 * kF * kS * ( nF - 0.5 ) ) + ( n2 - 0.5 ) * 0.16 * kF * min( gm, 0.6 );
    g = smoothstep( 0.1, 0.95, g );
    float th = mix( 0.42, 0.2, clamp( gAmt, 0.0, 1.0 ) );
    float ee = ge + 0.22 * ( n3 - 0.5 ) + 0.1 * kF * kS * ( nF - 0.5 );
    float ew = mix( 0.1, 0.022, kS ) + gFwE * 1.5;
    g *= smoothstep( th - ew, th + ew, ee );
    // dried salt (pale grey-beige) higher up, the wet road film (dark grey-brown) at the very bottom
    vec3 salt = vec3( 0.2, 0.19, 0.17 ), wet = vec3( 0.055, 0.05, 0.044 );
    vec3 gc = mix( wet, salt, clamp( smoothstep( 0.16, 0.48, q.y ) * 0.75 + ( n3 - 0.5 ) * 0.35 + ( n2 - 0.5 ) * 0.2 * kF, 0.0, 1.0 ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, gc, g * CAR_GRIME_K );
    roughnessFactor = mix( roughnessFactor, 0.82, g );
    metalnessFactor = mix( metalnessFactor, 0.0, g );
    gCarGrime = g;
  }
}
`;
// carShade options: spec (cap on the sun's direct specular, clear coat included), baseSpec (a lower
// cap on the base layer only: paint whose clear coat carries the sharp glint), env (sky reflection
// multiplier, replaces the surface's), road, cabin, grime (GRIME_LV index; 0 = none), grimeK (how far
// the grime colour replaces the surface colour), glass (Fresnel opacity for the see-through glass).
// inst ('paint' | true): the material of an instanced far-body batch (round 4): the paint colour
// (paint only), the road grime and metallic-or-solid come per instance (attributes cari = paint
// rgb + grime, carm = 1 metallic / 0 solid) instead of per material.
function carShade(m, { spec = null, baseSpec = null, f90 = null, road = true, cabin = null, grime = 0, grimeK = 0.85, glass = false, lodGlass = false, inst = false } = {}, tag = '') {
  const compile = m.onBeforeCompile, key = m.customProgramCacheKey;
  const uG = { value: inst ? 1 : GRIME_LV[grime] || 0 };
  m.userData.carGrime = uG;
  m.onBeforeCompile = function (shader, r) {
    compile.call(this, shader, r);
    setCarGround();
    if (LIGHTING?.ground) uCarGroundEnv.value.set(LIGHTING.ground.r, LIGHTING.ground.g, LIGHTING.ground.b);
    let f = shader.fragmentShader;
    if (spec !== null) f = f.replace('float gSpecMax = 3.0;', `float gSpecMax = ${spec.toFixed(2)};`);
    if (road || cabin) f = f.replace('#include <common>', '#include <common>\nuniform vec3 uCarGround;\nuniform vec3 uCarGroundEnv;\nuniform vec3 uCarSun;');
    if (road) f = f.replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n' + ROAD_GLSL);
    if (baseSpec !== null) f = f.replace('#include <aomap_fragment>', `#include <aomap_fragment>\nreflectedLight.directSpecular = min( reflectedLight.directSpecular, vec3( ${baseSpec.toFixed(2)} ) );`);
    // the base layer of clear-coated paint sits under the coat, which takes the grazing (Fresnel)
    // reflection: no Fresnel rise of its own (a rough base lobe at a glance lit whole bonnets white
    // against the low sun)
    if (f90 !== null) f = f.replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\nmaterial.specularF90 = ${f90[0].toFixed(3)};\nmaterial.specularColor *= ${f90[1].toFixed(3)};\nmaterial.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );`);
    if (inst) {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 cari;\nattribute float carm;\nvarying float vCarM;')
        .replace('#include <color_vertex>', '#include <color_vertex>\nvCarM = carm;' + (inst === 'paint' ? '\nvColor.rgb *= cari.rgb;' : ''));
      f = f.replace('#include <common>', '#include <common>\nvarying float vCarM;');
      // solid paint: no metal, a slightly smoother base (paintMat: metalness 0.3 / 0, roughness 0.45 / 0.4)
      if (inst === 'paint') f = f.replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= vCarM;\nroughnessFactor = mix( 0.4, roughnessFactor, vCarM );');
    }
    if (grime) {
      // the amount: the material's uCarGrime, or per instance (cari.w) on an instanced far-body batch
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + GRIME_VERT_PARS + (inst ? '\nvarying float vCarAmt;' : '')).replace('#include <begin_vertex>', '#include <begin_vertex>\nvCarGrime = cgrime;' + (inst ? ' vCarAmt = cari.w;' : ''));
      f = f.replace('#include <common>', '#include <common>\nvarying float vCarGrime;\nuniform float uCarGrime;\n#define CAR_GRIME_K ' + grimeK.toFixed(3) + (inst ? '\nvarying float vCarAmt;\n#define CAR_GRIME_AMT vCarAmt' : '\n#define CAR_GRIME_AMT uCarGrime'))
        .replace('#include <clearcoat_normal_fragment_begin>', GRIME_FRAG + '#include <clearcoat_normal_fragment_begin>')
        .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\n material.clearcoat *= 1.0 - gCarGrime * 0.9;\n#endif');
      shader.uniforms.uCarGrime = uG;
    }
    if (lodGlass) {
      // the LOD body's glass is opaque 'plastic' in its own colour (carmodels LOD_GLASS): make it read as
      // tinted glass - glossy, the sky in it like the near glass, a dark cabin - not a slate panel
      const c = LOD_GLASS_LIN;
      f = f.replace('#include <clearcoat_normal_fragment_begin>', `float gLodGl = step( abs( vColor.r - ${c.r.toFixed(5)} ) + abs( vColor.b - ${c.b.toFixed(5)} ), 0.0012 );
        if ( gLodGl > 0.5 ) { roughnessFactor = 0.07; metalnessFactor = 0.0; gSpecMax = 0.8; diffuseColor.rgb = vec3( 0.012, 0.014, 0.017 ); }
        #include <clearcoat_normal_fragment_begin>`)
        .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nif ( gLodGl > 0.5 ) reflectedLight.indirectSpecular *= 8.0;');
    }
    if (glass) {
      // see-through glass: more opaque at a glance (Fresnel): from behind and from the side at the
      // chase camera's angle a hatch or a rear window reads as a pane reflecting the sky, not an
      // empty frame onto a lit cabin
      f = f.replace('float a = diffuseColor.a + ( 1.0 - diffuseColor.a ) * ( 0.04 + 0.96 * gF ) * 0.8;',
        `float gNVg = saturate( dot( normal, normalize( vViewPosition ) ) );
         float a = mix( diffuseColor.a, ${glass[1].toFixed(3)}, smoothstep( 0.9, 0.3, gNVg ) );
         a = a + ( 1.0 - a ) * ( 0.04 + 0.96 * gF ) * 0.6;`);
    }
    if (cabin) {
      f = f.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.indirectDiffuse *= ${cabin[0].toFixed(3)};
        reflectedLight.indirectSpecular *= ${cabin[0].toFixed(3)};
        reflectedLight.directDiffuse *= ${cabin[1].toFixed(3)};
        reflectedLight.directSpecular *= ${cabin[1].toFixed(3)};`);
    }
    shader.uniforms.uCarGround = uCarGround;
    shader.uniforms.uCarGroundEnv = uCarGroundEnv;
    shader.uniforms.uCarSun = uCarSun;
    shader.fragmentShader = f;
  };
  m.customProgramCacheKey = () => key.call(m) + '|car3' + tag + (spec ?? '') + '|' + (baseSpec ?? '') + (road ? 'r' : '') + (cabin ? 'c' + cabin.join(',') : '') + (grime ? 'g' + grimeK : '') + (glass ? 'f' + glass[1] : '') + (f90 !== null ? 'F' + f90.join(',') : '') + (lodGlass ? 'L' : '') + (inst ? 'I' + inst : '');
  return m;
}
// Paint: a rougher, less metallic base layer (a broad dim sheen, capped low) under the mirror clear
// coat, which carries the small sharp sun glint (capped just under the bloom threshold) and the sky.
// Round 2's base (metalness 0.32, roughness 0.3, cap 1.9) lit whole panels facing between the sun and
// the camera as uniform silver sheets with hard edges.
const paintCache = new Map();
function paintMat(surf, color, snow, grime = 0) {
  const k = surf + '|' + color + '|' + snow + '|' + grime;
  let m = paintCache.get(k);
  if (!m) {
    m = surfaceMaterial(surf, { snow, unique: true });
    m.color.set(color);
    delete m.defines.TRI_CURVE;
    const u = m.userData.uniforms;
    u.uEnvCC.value = 0.72;
    u.uEnvSpec.value = 0.6;
    // the base: metallic flakes give a broad, dim sheen in the paint's own colour (no Fresnel rise:
    // f90; a weak dielectric part: x 0.4); solid paint a plain rough base
    if (surf === 'paint') { m.metalness = 0.3; m.roughness = 0.45; }
    else { m.metalness = 0; m.roughness = 0.4; }
    carShade(m, { spec: 2.2, baseSpec: 0.2, f90: [0.06, 0.12], grime }, 'paint');
    paintCache.set(k, m);
  }
  return m;
}
// Other car surfaces: own copies (shared by all cars) with the car shading; interiors ('fabric':
// seats, dash, steering wheel, headliner) get the cabin occlusion [indirect, direct] instead of the
// road ('leather' too, should a model use it). Exterior black trim ('plastic': bumpers, mirror
// housings, seals, lamp surrounds) is matte textured plastic now - glossy, it mirrored the bright sky
// at a glance and read pale grey (L160-180) instead of black.
const surfCache = new Map();
const CAR_SURF = {
  chrome: { spec: 1.2 }, plastic: { spec: 0.035, f90: [0.3, 0.6], rough: 0.6, env: 0.25, grime: true, grimeK: 0.45, lodGlass: true }, rubber: { spec: 0.15, f90: [0.4, 1], env: 0.6 },
  metal: { spec: 1.0, grime: true }, painted: { spec: 1.2, grime: true },
  fabric: { road: false, cabin: [0.3, 0.62] }, leather: { road: false, cabin: [0.3, 0.62] },
};
function carSurface(s, snow, grime = 0) {
  const d = CAR_SURF[s];
  if (!d) return surfaceMaterial(s, { snow });
  const lv = d.grime ? grime : 0;
  const k = s + '|' + snow + '|' + lv;
  let m = surfCache.get(k);
  if (!m) {
    m = surfaceMaterial(s, { snow, unique: true });
    if (d.rough !== undefined) m.roughness = d.rough;
    if (d.env !== undefined) m.userData.uniforms.uEnvSpec.value = d.env;
    carShade(m, { spec: d.spec ?? null, f90: d.f90 ?? null, road: d.road ?? true, cabin: d.cabin ?? null, grime: lv, grimeK: d.grimeK ?? 0.85, lodGlass: !!d.lodGlass }, s);
    surfCache.set(k, m);
  }
  return m;
}
// Wheel materials (instanced pools in carmodels.js): own copies with the road in the reflections;
// the rims a darker, rougher cast metal (a sunlit spoke face read as a flat white plastic disc), with
// brake dust (a dull brown-grey film, heavier towards the hub); per car, carmodels' wheel pools tint
// the instance colour with the car's road grime.
export function carWheelMaterials(geo) {
  return geo.userData.surfaces.map((s) => {
    const m = carShade(surfaceMaterial(s, { snow: false, unique: true }), { spec: s === 'rubber' ? 0.2 : s === 'plastic' ? 0.25 : 0.24 }, 'wheel' + s);
    if (s === 'metal') {
      const u = m.userData.uniforms.uTexA.value; u.z = 0.5; u.w = 0.42;
      m.userData.uniforms.uEnvSpec.value = 0.55;
      m.color.setRGB(0.64, 0.61, 0.57);   // darker cast alloy, brake dust
    }
    if (s === 'chrome') { m.roughness = 0.32; m.color.setRGB(0.8, 0.78, 0.75); }
    if (s === 'rubber') m.userData.uniforms.uEnvSpec.value = 0.5;
    return m;
  });
}
setWheelMaterials(carWheelMaterials);
// See-through car glass: 'tinted' with a grazing sky reflection and the sun glint capped below the
// bloom threshold; Fresnel opacity (0.66 face on, ~0.84 at a glance). `clear`: lighter (the bus's and
// the sopbil's windscreens, the bus doors).
const glassCache = new Map();
export function carGlassMaterial(clear = false) {
  let m = glassCache.get(clear);
  if (!m) {
    m = surfaceMaterial('tinted', { snow: false, unique: true });
    m.userData.uniforms.uEnvSpec.value = clear ? 1.2 : 1.9;
    m.opacity = clear ? 0.34 : 0.66;
    carShade(m, { spec: 0.8, glass: clear ? [0, 0.5] : [0, 0.84] }, 'glass');
    glassCache.set(clear, m);
  }
  return m;
}
// The glass mesh's materials: 'glass' groups are the clear panes (bus and sopbil windscreens, bus doors), the
// rest the tinted car glass.
function glassMaterials(geo) {
  const s = geo.userData.surfaces || ['tinted'];
  const list = s.map((x) => carGlassMaterial(x === 'glass'));
  return list.length === 1 ? list[0] : list;
}
// The car materials for any car-like geometry (the trailer): car shading, matte trim, road grime.
export function carMaterials(geo, grime = 0) {
  const lv = grimeLevel(grime);
  const m = geo.userData.surfaces.map((s) => (s === 'paint' || s === 'paintsolid') ? paintMat(s, 0xffffff, false, lv) : carSurface(s, false, lv));
  return m.length === 1 ? m[0] : m;
}
function bodyMesh(geo, color, snow, solid, grime = 0) {
  const surfs = geo.userData.surfaces;
  const mats = surfs.map((s) => (s === 'paint' || s === 'paintsolid') ? paintMat(solid && s === 'paint' ? 'paintsolid' : s, color, snow, grime) : carSurface(s, snow, grime));
  const mesh = new THREE.Mesh(geo, mats.length === 1 ? mats[0] : mats);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.userData.surfaceMats = {};
  surfs.forEach((s, i) => { mesh.userData.surfaceMats[s] = mats[i]; });
  return mesh;
}

// ---------------------------------------------------------------------------------------------
// Round 4 (perf): far bodies drawn instanced. Every car beyond the LOD distance (parked or driving,
// not wrecked) is one instance of an InstancedMesh per model and snow state ('carlod:<kind>|<snow>'),
// with its snow cap in a second one; paint colour, road grime and metallic/solid come per instance
// (carShade inst). Instances are rewritten in the scene's render hook (carmodels addRenderHook: only
// when the view or a car changed), culled per car against the camera (inflated so shadows cast from
// just off-screen stay), the shadow casters (< SHADOW_DIST) first: the shadow pass draws only those
// (onBeforeShadow trims the count). CAR_PERF.instLod = false draws them one by one as before;
// CAR_PERF.sleep = false keeps every car awake (both for A/B tests).
export const CAR_PERF = { instLod: true, sleep: true, autoWarm: true };
const instMatCache = new Map();
function instMaterial(s, snow) {
  const k = s + '|' + snow;
  let m = instMatCache.get(k);
  if (m) return m;
  if (s === 'paint' || s === 'paintsolid') {
    m = surfaceMaterial('paint', { snow, unique: true });
    m.color.set(0xffffff);
    delete m.defines.TRI_CURVE;
    m.userData.uniforms.uEnvCC.value = 0.72;
    m.userData.uniforms.uEnvSpec.value = 0.6;
    m.metalness = 0.3; m.roughness = 0.45;
    carShade(m, { spec: 2.2, baseSpec: 0.2, f90: [0.06, 0.12], grime: 1, inst: 'paint' }, 'paint');
  } else if (CAR_SURF[s]) {
    const d = CAR_SURF[s];
    m = surfaceMaterial(s, { snow, unique: true });
    if (d.rough !== undefined) m.roughness = d.rough;
    if (d.env !== undefined) m.userData.uniforms.uEnvSpec.value = d.env;
    carShade(m, { spec: d.spec ?? null, f90: d.f90 ?? null, road: d.road ?? true, cabin: d.cabin ?? null, grime: d.grime ? 1 : 0, grimeK: d.grimeK ?? 0.85, lodGlass: !!d.lodGlass, inst: true }, s);
  } else m = surfaceMaterial(s, { snow });
  instMatCache.set(k, m);
  return m;
}
const lodBatches = new Map();
const lodCars = new Set();
function lodBatch(kind, snow) {
  const key = kind + '|' + (snow ? 1 : 0);
  let b = lodBatches.get(key);
  if (b) return b;
  const src = carModel(kind).lod;
  // the LOD geometry's buffers, shared (same attribute objects = same GPU buffers), plus the
  // per-instance attributes
  const geo = new THREE.BufferGeometry();
  for (const [n, a] of Object.entries(src.attributes)) geo.setAttribute(n, a);
  geo.setIndex(src.index);
  for (const gr of src.groups) geo.addGroup(gr.start, gr.count, gr.materialIndex);
  geo.userData = { surfaces: src.userData.surfaces };
  const capGeo = snow ? snowCapGeometry(src, null) : null;
  b = { key, geo, mats: src.userData.surfaces.map((s) => instMaterial(s, snow)), capGeo, capMat: capGeo ? surfaceMaterial('snow') : null, cap: 0, mesh: null, capMesh: null, list: [] };
  growBatch(b, 48);
  lodBatches.set(key, b);
  return b;
}
function growBatch(b, need) {
  const cap = Math.max(need, b.cap * 2);
  b.geo.setAttribute('cari', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4));
  b.geo.setAttribute('carm', new THREE.InstancedBufferAttribute(new Float32Array(cap), 1));
  const mk = (geo, mat, name, cast) => {
    const m = new THREE.InstancedMesh(geo, mat, cap);
    m.name = name; m.frustumCulled = false; m.castShadow = cast; m.receiveShadow = true;
    m.count = 0; m.visible = false;
    m.userData.n = 0; m.userData.nCast = 0;
    if (cast) {
      // the near cascade (~30 m round the camera) gets none: no far car's shadow reaches it, except
      // the bus's and the sopbil's (13-15 m long in the low sun)
      const tall = b.key.startsWith('bus') || b.key.startsWith('garbage');
      m.onBeforeShadow = function (r, o, cam, sc) { this.count = !tall && sc.right - sc.left < 160 ? 0 : this.userData.nCast; };
      m.onAfterShadow = function () { this.count = this.userData.n; };
    }
    scene.add(m);
    return m;
  };
  if (b.mesh) { scene.remove(b.mesh); b.mesh.dispose(); }
  if (b.capMesh) { scene.remove(b.capMesh); b.capMesh.dispose(); }
  b.mesh = mk(b.geo, b.mats, 'carlod:' + b.key, true);
  if (b.capGeo) b.capMesh = mk(b.capGeo, b.capMat, 'carlod:cap:' + b.key, false);
  b.cap = cap;
}
const _sph = new THREE.Sphere();
function writeLodBatches(cam, frustum) {
  if (!scene) return;
  for (const b of lodBatches.values()) b.list.length = 0;
  const cx = cam.position.x, cz = cam.position.z;
  for (const c of lodCars) {
    if (!c._inst || !c.root.visible || !c.root.parent) continue;
    const dx = c.x - cx, dz = c.z - cz;
    c._camD2 = dx * dx + dz * dz;
    _sph.center.set(c.x, c.y + c.height * 0.5, c.z);
    _sph.radius = c.radius + 7;     // + a long low-sun shadow from a car just off-screen
    if (!frustum.intersectsSphere(_sph)) continue;
    (c._batch ||= lodBatch(c.kind, c.snowy)).list.push(c);
  }
  for (const b of lodBatches.values()) {
    const n = b.list.length;
    if (n > b.cap) growBatch(b, n);
    const M = b.mesh.instanceMatrix.array, C = b.geo.attributes.cari.array, K = b.geo.attributes.carm.array;
    const CM = b.capMesh?.instanceMatrix.array;
    let i = 0, nCast = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (const c of b.list) {
        if ((c._camD2 < SHADOW_DIST * SHADOW_DIST) !== (pass === 0)) continue;
        const e = c._im.elements;
        for (let k = 0; k < 16; k++) M[i * 16 + k] = e[k];
        if (CM) for (let k = 0; k < 16; k++) CM[i * 16 + k] = e[k];
        const p = c._paintLin;
        C[i * 4] = p.r; C[i * 4 + 1] = p.g; C[i * 4 + 2] = p.b; C[i * 4 + 3] = GRIME_LV[c.grimeLv];
        K[i] = c.solid ? 0 : 1;
        i++;
        if (pass === 0) nCast++;
      }
    }
    const m = b.mesh;
    m.count = m.userData.n = n; m.userData.nCast = nCast; m.visible = n > 0; m.castShadow = nCast > 0;
    if (n) { m.instanceMatrix.needsUpdate = true; b.geo.attributes.cari.needsUpdate = true; b.geo.attributes.carm.needsUpdate = true; }
    if (b.capMesh) {
      b.capMesh.count = b.capMesh.userData.n = n; b.capMesh.visible = n > 0;
      if (n) b.capMesh.instanceMatrix.needsUpdate = true;
    }
  }
}
addRenderHook(writeLodBatches);
// Test numbers: how many far bodies are instanced in how many batches right now, and the cost of one
// instance rewrite (bench: `n` rewrites against the current camera).
const _bf = new THREE.Frustum(), _bm = new THREE.Matrix4();
export function carStats(n = 0) {
  let inst = 0, batches = 0;
  for (const b of lodBatches.values()) if (b.mesh?.count) { inst += b.mesh.count; batches++; }
  let ms = null;
  if (n && camera) {
    _bf.setFromProjectionMatrix(_bm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const t = performance.now();
    for (let k = 0; k < n; k++) writeLodBatches(camera, _bf);
    ms = +((performance.now() - t) / n).toFixed(4);
  }
  return { instanced: inst, batches, cars: lodCars.size, asleep: [...lodCars].filter((c) => c.asleep).length, writeMs: ms, warm: warmDone };
}

const _m4 = new THREE.Matrix4(), _m4b = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

let nextId = 1;
export class Car {
  constructor(type, opts = {}) {
    const base = CAR_TYPES[type] || CAR_TYPES.volvo240;
    const model = carModel(base.model);
    const spec = (this.spec = {
      ...base, len: model.len, wid: model.wid, height: model.height, wheelR: model.wr, wb: model.wb,
      ...(opts.spec || {}),
    });
    spec.bodyH ??= model.seat[1] - model.wr * 0.95;
    spec.cabinH ??= model.height - model.seat[1];
    this.type = type;              // the key it was made with (may be an old alias)
    this.kind = base.model;        // the real model key
    this.model = model;
    this.id = nextId++;
    this.name = opts.name || null;
    // Paint: opts.color, else the type's own livery (bus, sopbil), else an everyday colour. Older
    // types are often solid (non-metallic) paint.
    this.solid = opts.solid ?? (SOLID_TYPES.has(this.kind) || (!!spec.solid && opts.color === undefined && Math.random() < 0.6));
    this.color = opts.color ?? (SOLID_TYPES.has(this.kind) ? spec.color : this.kind === 'taxi' ? pick(TAXI) : this.solid ? pick(SOLID) : pick(COLORS));
    this.root = new THREE.Group();
    this.root.userData.isCar = true;
    this.tilt = new THREE.Group();
    this.root.add(this.tilt);
    // round 4: the root's and the tilt's matrices are written by sync() (matrixAutoUpdate off: a
    // sleeping car's subtree costs nothing in updateMatrixWorld); the meshes in the tilt frame never
    // move (identity, static)
    this.root.matrixAutoUpdate = this.tilt.matrixAutoUpdate = false;
    const snow = opts.snow ?? false;
    this.snowy = !!snow;
    // road grime: opts.grime (0..1.1), else by type and state - a parked car under snow has stood
    // since the last salted drive (more), the bus and the sopbil work all day, everyday traffic 0.5-1
    // (Ove washes his Saab; Anders' Audi is new)
    this.grime = opts.grime ?? (NEAT[this.name] ?? (SOLID_TYPES.has(this.kind) ? 0.85 + Math.random() * 0.25 : snow ? 0.7 + Math.random() * 0.4 : 0.45 + Math.random() * 0.55));
    this.grimeLv = grimeLevel(this.grime);
    this.body = bodyMesh(model.body, this.color, snow, this.solid, this.grimeLv);
    this.body.userData.baseMaterial = this.body.material;
    this.tilt.add(this.body);
    // far away: a coarse body (opaque dark glass, no interior); see sync()
    this.bodyLod = bodyMesh(model.lod, this.color, snow, this.solid, this.grimeLv);
    this.bodyLod.userData.baseMaterial = this.bodyLod.material;
    this.bodyLod.visible = false;
    this.body.name = 'car:body'; this.bodyLod.name = 'car:bodyLod';
    this.tilt.add(this.bodyLod);
    // parked cars under the first snow: a real snow cap on the roof, bonnet and boot (the paint's
    // own snow mask alone reads as grey frost)
    if (snow) {
      for (const [k, geo] of [['snowCap', model.body], ['snowCapLod', model.lod]]) {
        const cg = snowCapGeometry(geo, k === 'snowCap' ? model.glass : null);
        if (!cg) continue;
        this[k] = realMesh(cg, { cast: false });
        this[k].name = 'car:' + k;
        this[k].visible = k === 'snowCap';
        this.tilt.add(this[k]);
      }
    }
    this.lod = false;
    this._inst = false;             // drawn by the instanced far-body batch (round 4)
    if (model.glass) {
      const gm = realMesh(model.glass, { snow: false, cast: false, material: glassMaterials(model.glass) });
      gm.renderOrder = 2;
      gm.userData.noAO = true;
      gm.name = 'car:glass';
      this.tilt.add(gm);
      this.glass = gm;
    }
    if (model.lights) {
      this.lightMat = lightMaterial();
      this.lights = new THREE.Mesh(model.lights, this.lightMat);
      this.lights.castShadow = false;
      this.lights.userData.noAO = true;
      this.lights.name = 'car:lights';
      this.tilt.add(this.lights);
      if (model.glows) {
        this.glow = new THREE.Mesh(model.glows, glowMaterial(this.lightMat.userData.ch));
        this.glow.castShadow = false;
        this.glow.userData.noAO = true;
        this.glow.renderOrder = 3;
        this.glow.name = 'car:glow';
        this.glow.visible = false;   // only while a brake / indicator / reversing lamp is lit
        this.tilt.add(this.glow);
      }
    }
    // licence plate (Ove's Saab keeps one plate from session to session, unless main.js gives it one)
    this.plate = opts.plate ? claimPlate(opts.plate) : this.name === 'saab' ? claimPlate('ORV 455') : randomPlate();
    this.plateQuads = [...model.plates, ...(model.badges || []).map((b) => ({ ...b, badge: b.text }))];
    this.plateMesh = null;
    this.root.addEventListener('added', () => { this.showPlate(true); lodCars.add(this); carsChanged(); });
    this.root.addEventListener('removed', () => { this.showPlate(false); lodCars.delete(this); carsChanged(); });
    // wheels (drawn instanced by carmodels.js)
    this.wheelSpin = 0;
    this.wheels = model.wheels.map((w) => ({ ...w, steer: 0 }));
    trackWheels(this);

    this.x = opts.x || 0; this.z = opts.z || 0; this.y = 0.15; this.yaw = opts.yaw || 0;
    this.vx = 0; this.vz = 0; this.vy = 0; this.w = 0;
    this.steerAngle = 0;
    this.steerShow = 0;     // the front wheels' drawn angle (counter-steer in a slide)
    this.drift = 0;         // the slide (SLIDE): 0 = the tyres grip, 1 = sliding
    this.slip = 0;          // the slip angle in a slide (rad; + = moving to the right of the nose: a slide in a left turn)
    this.pivot = 0;         // a donut (handbrake + throttle + steering at a crawl), 0..1
    this.swing = 0;         // the yaw rate of the last ~0.5 s on winter roads at speed (WINTER.flick)
    this.flick = 0;         // a steer against that swing, 0..1 (the Scandinavian flick)
    this.loose = false;     // the slide was started by the tail at speed, not by the handbrake (WINTER)
    this.hp = spec.hp;
    this.dead = false;
    this.air = false;
    this.hill = null;        // the snow hill (collision HILL) it is driving on, if any
    this.flight = null;      // a flight off a hill: { t, x0, z0, y0, apex, v0, vy0, hill, dist }
    this.landed = null;      // the last flight's end: { ...flight, impact, onHill, x, z }
    this.mass = spec.mass;
    this.inertia = (spec.mass * (spec.len * spec.len + spec.wid * spec.wid)) / 12;
    this.ctrl = { throttle: 0, brake: 0, steer: 0, handbrake: false, park: true };
    this.obb = { x: 0, z: 0, fx: 0, fz: 1, hx: spec.wid / 2, hz: spec.len / 2 };
    this.radius = Math.hypot(spec.wid, spec.len) / 2;
    this.height = model.height;
    this.driver = null;      // Character at the wheel
    this.passengers = [];    // extra seated characters
    this.ai = null;          // controller object with update(dt, game)
    this.bump = 0;
    this.pitch = 0; this.roll = 0;          // body attitude on the suspension (rad)
    this.groundPitch = 0;                   // the road's slope under the car
    this.groundRoll = 0;                    // ... and sideways (off the grid only: the hills)
    this.heave = 0;
    this._sus = { p: 0, pv: 0, r: 0, rv: 0, h: 0, hv: 0 };
    this.accelF = 0; this.accelL = 0;       // smoothed longitudinal / lateral acceleration
    this.smokeT = 0;
    this.skidAmt = 0;
    this.lastHit = 0;
    this.revs = 0;
    this.gear = 1;
    this.headlights = opts.headlights ?? true;   // low beams whenever the engine runs (Swedish law)
    this.engineOn = opts.engineOn ?? null;        // null = running whenever driven
    this.hazard = false;
    this.indicator = 0;                           // -1 left, 0 off, +1 right
    this.reversing = false;
    this.braking = 0;
    this.exhaustT = Math.random() * 0.5;
    this.trailer = null;
    this.onSnow = false;
    // round 4: sleeping (see step / wake) and the instanced far body (see sync / setLod)
    this.asleep = false;
    this._still = 0;
    this._quiet = false;
    this._cast = true;
    this._im = new THREE.Matrix4();          // root x tilt: the far body's instance matrix
    this._paintLin = new THREE.Color(this.color);
    this.updateObb();
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.y = this.yaw;
    this.root.updateMatrix();
    this.tilt.updateMatrix();
    this.tilt.traverse((o) => { if (o !== this.tilt) { o.matrixAutoUpdate = false; o.updateMatrix(); } });
    if (opts.trailer) this.attachTrailer(typeof opts.trailer === 'object' ? opts.trailer : {});
  }

  get speed() { return Math.hypot(this.vx, this.vz); }
  get forwardSpeed() { return this.vx * Math.sin(this.yaw) + this.vz * Math.cos(this.yaw); }
  get running() { return !this.dead && (this.engineOn ?? !!(this.driver || this.ai || this.driverBust)); }

  updateObb() {
    const o = this.obb;
    o.x = this.x; o.z = this.z; o.fx = Math.sin(this.yaw); o.fz = Math.cos(this.yaw);
  }

  // Seat positions in the car's tilt frame: side +1 = driver (left), -1 = front passenger,
  // rear: +2 / -2. The point is the hip on the cushion (where a bust's root goes).
  seatLocal(side = 1, out = new THREE.Vector3()) {
    const m = this.model, s = m.seat;
    if (Math.abs(side) >= 2 && m.rear) return out.set(Math.sign(side) * m.rear[0], m.rear[1], m.rear[2]);
    return out.set(Math.sign(side) * s[0], s[1], s[2]);
  }
  seatWorld(side = 1, out = new THREE.Vector3()) {
    this.seatLocal(side, out);
    this.tilt.updateWorldMatrix(true, false);
    return out.applyMatrix4(this.tilt.matrixWorld);
  }
  // World position of the front or rear plate's centre.
  platePos(side = 'rear', out = new THREE.Vector3()) {
    const q = this.model.plates.find((p) => p.side === side) || this.model.plates[0];
    out.set(q.pos[0], q.pos[1], q.pos[2]);
    this.tilt.updateWorldMatrix(true, false);
    return out.applyMatrix4(this.tilt.matrixWorld);
  }
  setHeadlights(on) { this.headlights = !!on; }

  showPlate(on) {
    if (on && !this.plateMesh && !this._noPlate) {
      this.plateH = allocPlate(this.plate, this.kind === 'taxi', this.grime * 0.8);
      this.plateMesh = new THREE.Mesh(plateGeometry(this.plateQuads, this.plateH.slot), this.plateH.page.material);
      this.plateMesh.castShadow = false;
      this.plateMesh.userData.noAO = true;
      this.plateMesh.matrixAutoUpdate = false;
      this.plateMesh.name = 'car:plate';
      this.tilt.add(this.plateMesh);
      if (this.trailer) this.trailer.showPlate(true);
    } else if (!on && this.plateMesh) {
      freePlate(this.plateH);
      this.plateMesh.geometry.dispose();
      this.tilt.remove(this.plateMesh);
      this.plateMesh = null;
      if (this.trailer) this.trailer.showPlate(false);
    }
  }
  // Change the plate text (opts.plate does it at construction).
  setPlate(text) {
    releasePlate(this.plate);
    this.plate = claimPlate(text);
    if (this.plateMesh) { this.showPlate(false); this.showPlate(true); }
  }

  attachTrailer(opts = {}) {
    if (this.trailer) return this.trailer;
    this.trailer = new Trailer(this, opts);
    // galvanised steel that has towed things through salted slush, with the car's shading
    this.trailer.body.material = carMaterials(this.trailer.body.geometry, Math.max(0.6, this.grime));
    return this.trailer;
  }
  detachTrailer() {
    const t = this.trailer;
    if (!t) return null;
    t.detach();
    this.trailer = null;
    return t;
  }

  place(x, z, yaw) {
    this.wake();
    this.x = x; this.z = z; this.yaw = yaw; this.vx = this.vz = this.vy = this.w = 0;
    this.y = groundAt(x, z, 0.2, 0.6);
    this.air = false; this.flight = null; this.hill = null;
    this.steerAngle = this.steerShow = 0;
    this.drift = this.slip = this.pivot = this.swing = this.flick = 0;
    this.loose = false;
    this.updateObb();
    if (this.trailer) this.trailer.reset();
  }

  // Sleeping (round 4): a car nobody drives that has come to rest (no speed, no spin, the suspension
  // settled, on the ground, not smoking or burning) stops stepping after half a second: no physics,
  // no ground or solid queries. It wakes when it is hit (collideCars, a trailer shoving it), placed,
  // damaged, given a driver or an AI, or when anything else moves it or gives it a speed - or a push
  // on its springs (`_sus.pv / rv / hv`: a kicked tyre rocks a parked car again, phase 4 round 2).
  // A car towing a trailer never sleeps: its trailer collides with other cars only inside the car's
  // step (a sleeping Patrick's trailer let the Saab drive straight into it).
  // `car.asleep` is public (read-only for others): collideCars skips pairs where both sleep, and a
  // broadphase may leave sleeping cars out. Wake one with car.wake().
  wake() {
    if (!this.asleep) return;
    this.asleep = false;
    this._still = 0;
    this._quiet = false;
  }
  sleepCheck(game) {
    const sus = this._sus;
    const rest = CAR_PERF.sleep && !this.driver && !this.ai && !this.trailer && !this.air && !(game && game.playerCar === this) &&
      !(this.dead && this.burn > 0) && (this.dead || this.hp >= 35) &&
      Math.abs(this.vx) < 0.02 && Math.abs(this.vz) < 0.02 && Math.abs(this.w) < 0.004 && Math.abs(this.vy) < 0.05 &&
      Math.abs(sus.pv) < 0.004 && Math.abs(sus.rv) < 0.004 && Math.abs(sus.hv) < 0.004 &&
      Math.abs(sus.p) < 0.002 && Math.abs(sus.r) < 0.002 && Math.abs(sus.h) < 0.002;
    if (!rest) { this._still = 0; return; }
    if (++this._still < 30) return;
    this.asleep = true;
    this.vx = this.vz = this.vy = this.w = 0;
    sus.pv = sus.rv = sus.hv = 0;   // so that any push on the springs (a kick) wakes it, see step
    this.skidAmt = 0; this.braking = 0; this.reversing = false;
    this._sx = this.x; this._sz = this.z; this._sy = this.y; this._syaw = this.yaw;
  }

  step(dt, game) {
    if (this.asleep) {
      const sus = this._sus;
      if (!CAR_PERF.sleep || this.driver || this.ai || this.trailer || this.vx || this.vz || this.vy || this.w || sus.pv || sus.rv || sus.hv || this.air || (game && game.playerCar === this) ||
        this.x !== this._sx || this.z !== this._sz || this.y !== this._sy || this.yaw !== this._syaw || (this.dead && this.burn > 0) || (!this.dead && this.hp < 35)) this.wake();
      else return;
    }
    const s = this.spec, c = this.ctrl;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = -fz, rz = fx;
    let vf = this.vx * fx + this.vz * fz;
    let vr = this.vx * rx + this.vz * rz;
    const vf0 = vf;
    const driven = !this.dead && (this.driver || this.ai);
    const player = !!(game && game.playerCar === this);
    // Ground: plowed asphalt, or snow (sidewalks, lawns, the car-free paths) with less grip.
    this.onSnow = FX.surfaceAt ? FX.surfaceAt(this.x, this.z) === 'snow' : !isRoad(this.x, this.z);
    const gLat = this.onSnow ? 0.62 : 1, gLong = this.onSnow ? 0.6 : 1;
    const maxSpeed = s.maxSpeed * (player ? PLAYER.speed : 1);
    const accel = s.accel * (player ? PLAYER.accel : AI_ACCEL) * (this.onSnow ? 0.72 : 1);
    const brakeA = s.brake * (player ? PLAYER.brake : 1) * gLong;
    this.skidAmt = 0;
    this.braking = 0;
    this.reversing = false;
    if (!this.air) {
      // on a snow hill: gravity along its slope, forwards, and sideways what the tyres don't hold
      if (this.hill) {
        hillSlope(this.hill, this.x, this.z, _sl);
        const L = Math.hypot(1, _sl.gx, _sl.gz), g = HOPP.slope / L, side = g * (_sl.gx * rx + _sl.gz * rz);
        vf -= g * (_sl.gx * fx + _sl.gz * fz) * dt;
        vr -= Math.sign(side) * Math.max(0, Math.abs(side) - HOPP.hold) * dt;
      }
      if (driven && !c.park) {
        const thr = c.throttle, brk = c.brake;
        if (thr > 0) {
          if (vf < -0.4) vf = Math.min(0, vf + brakeA * thr * dt);  // rolling backwards: W brakes
          else {
            const t = 1 - (Math.max(0, vf) / maxSpeed) ** 2;
            vf += accel * thr * (t > 0 ? Math.max(0.03, t) : 0) * dt;   // nothing past the top speed
            if (vf < 4 && thr > 0.9 && c.handbrake) this.skidAmt = 1;               // burnout
            if (this.onSnow && vf < 6 && thr > 0.9) this.skidAmt = Math.max(this.skidAmt, 0.25); // spinning on snow
          }
        }
        if (brk > 0) {
          if (vf > 0.4) { vf = Math.max(0, vf - brakeA * brk * dt); this.braking = brk; }
          else vf = Math.max(vf - accel * 0.55 * brk * dt, -(this.trailer ? Math.min(s.revMax, 2.2) : s.revMax));  // a släpkärra is backed at walking pace
        }
        if (!thr && !brk) vf -= Math.sign(vf) * Math.min(Math.abs(vf), (0.9 + Math.abs(vf) * 0.012) * dt);
        if (c.handbrake) { vf -= Math.sign(vf) * Math.min(Math.abs(vf), 4.5 * dt); this.braking = Math.max(this.braking, 0.3); }
        if (!thr && !brk && Math.abs(vf) < 0.3 && this.ai) this.braking = 0.6;          // holding the brake at a stop
        // from intent (no flicker at the limit); not while the car is held (main.js freezes the player's car
        // in dialogues and at a race start with the brake and the handbrake on)
        this.reversing = brk > 0 && thr <= 0 && vf < 0.25 && !c.handbrake && !c.park;
      } else {
        vf -= Math.sign(vf) * Math.min(Math.abs(vf), (this.dead ? 6 : 8) * dt);
      }
      if (!(driven && c.throttle > 0)) vf -= vf * Math.abs(vf) * 0.0004 * dt;           // air
      // Lateral: the tyres kill sideways velocity; the handbrake lets the rear go, and a slide it
      // starts holds after it is let go (this.drift, SLIDE above).
      const hb = c.handbrake && driven;
      const thr = driven ? c.throttle : 0, drive = s.drive || 'fwd';
      const vr0 = vr;
      const grip = (hb ? 1.6 : s.grip) * gLat;
      // Grip limit: the tyres give at most aLat sideways (the yaw is held to it below).
      const aLat = (player ? PLAYER.aLat : 9) * gLat * (s.tall ? 0.8 : 1);
      // Winter roads at speed (the player): the tail lets go first (WINTER above).
      const hs = player && driven && !this.trailer ? smooth01((Math.hypot(vf, vr) - WINTER.hs0) / (WINTER.hs1 - WINTER.hs0)) : 0;
      const wLim = aLat / Math.max(2, Math.abs(vf));
      // a steer the other way than the last ~0.5 s's turn (the Scandinavian flick): the tail swings,
      // for as long as the key is held (fading in ~0.7 s)
      const flick = this.flick = c.steer && hs > 0 ? Math.max(clamp((c.steer * this.swing) / (0.6 * wLim), 0, 1), this.flick - 1.5 * dt) : 0;
      if (Math.abs(vr) > 2.2) this.skidAmt = Math.max(this.skidAmt, Math.min(1, (Math.abs(vr) - 2.2) / 5));
      if (hs > 0) {
        // the tyres hold the path to aLat x WINTER.grip (x1.12 at the bottom of the range, where the
        // yaw is held to ~1.05x), more on a front-driven car's throttle (WINTER.pull)
        const dv = vr * (1 - Math.exp(-grip * dt)), lim = aLat * (WINTER.grip[0] + (WINTER.grip[1] - WINTER.grip[0]) * hs + WINTER.pull[drive] * thr * (1 - hs)) * (1 - WINTER.flickGrip * flick) * dt;
        vr -= Math.sign(dv) * Math.min(Math.abs(dv), lim);
      } else vr *= Math.exp(-grip * dt);
      // A donut: handbrake, throttle and steering at a crawl (the burnout above, turned).
      const pivotOn = hb && thr > 0.5 && Math.abs(c.steer) > 0.3 && Math.abs(vf) < SLIDE.pivotV && !this.trailer;
      const P = this.pivot = pivotOn ? Math.min(1, this.pivot + 4 * dt) : Math.max(0, this.pivot - 6 * dt);
      let D = this.drift;
      if ((hb && vf > 2 && !this.trailer) || P > 0) { D = Math.max(P, Math.min(1, D + 8 * dt)); this.loose = false; }
      else if (hs > 0 && vf > 0) {
        // at speed a tail that has stepped out (slipping the way the car turns, and the way the driver
        // steers: a knock from another car doesn't start one) starts a slide by itself
        const sl = Math.atan2(vr, vf);
        if (Math.abs(sl) > WINTER.enter[0] + (WINTER.enter[1] - WINTER.enter[0]) * hs && sl * this.w > 0 && c.steer * sl < 0) { if (!D) this.loose = true; D = Math.min(1, D + WINTER.take * dt); }
      }
      let slip = 0, wDrift = 0;
      if (D > 0) {
        // a sliding tyre: a steady force sideways, not a grip that grows with the slip (in a slide the
        // tail started by itself at speed nearly the grip's, WINTER.slideA: it follows the road)
        vr += (vr0 - Math.sign(vr0) * Math.min(Math.abs(vr0), (this.loose ? WINTER.slideA : SLIDE.a) * gLat * dt) - vr) * D;
        const v = Math.hypot(vf, vr), b0 = Math.atan2(vr0, vf0);
        slip = v > 0.5 ? Math.atan2(vr, vf) : 0;
        const ab = Math.abs(slip);
        // over when straight again, spun round, slow (the tyres find grip at a crawl) or towing
        if (!P) D = Math.max(0, D - ((v < 2.5 ? 3 : 0) + (hb ? 0 : (ab < SLIDE.straight ? 5 : 0) + (ab > SLIDE.spun ? 4 : 0) + clamp((5.5 - v) * 0.6, 0, 3) + (this.trailer ? 10 : 0))) * dt);
        // the yaw that keeps the slip angle where it is (the velocity's own turn this step) ...
        const wVel = v > 1 ? -angleDiff(b0, slip) / dt : 0;
        // ... and how the steering and the throttle change it (rate: d|slip|/dt)
        const sg = ab > 0.03 ? Math.sign(slip) : c.steer ? -Math.sign(c.steer) : Math.sign(this.w) || 1;
        const into = driven ? -c.steer * sg : 0;
        const spF = clamp((v - 1) / 4, 0, 1);   // a car at a crawl is not swung round by the wheel
        let rate;
        if (hb) rate = (into * SLIDE.hb + 0.2 * ab) * spF;
        else {
          rate = (into > 0 ? into * (ab < SLIDE.hold ? SLIDE.in : SLIDE.past) : into * SLIDE.counter) * spF;
          const push = SLIDE.push[drive];
          rate += Math.min(ab, SLIDE.pushMax) * (push[1] + (push[0] - push[1]) * thr - (driven && vf > 0 ? c.brake * WINTER.brake[1] : 0));
        }
        wDrift = wVel + sg * rate;
        if (v > 3) this.skidAmt = Math.max(this.skidAmt, D * clamp((ab - 0.08) * 2.2, 0, 1) * Math.min(1, v / 8));
      }
      this.drift = D; this.slip = slip;
      if (!D) this.loose = false;
      let maxSteer = s.steer / (1 + Math.abs(vf) / 15);
      // keyboard steering is all or nothing: for the player, full lock at speed asks for ~1.35x
      // what the tyres give, so an ordinary junction turn understeers a touch instead of squealing
      // (on winter roads at speed more: WINTER.lock, so that the tail can come round)
      if (player && !c.handbrake) maxSteer = Math.min(maxSteer, Math.atan(((1.35 + (WINTER.lock - 1.35) * hs) * PLAYER.aLat * gLat * s.wb) / Math.max(1, vf * vf)));
      const wantSteer = driven ? c.steer * maxSteer : 0;
      this.steerAngle = damp(this.steerAngle, wantSteer, player ? 7 : 9, dt);
      let targetW = (-vf * Math.tan(this.steerAngle)) / s.wb;
      // Asking for more than the grip limit understeers (and squeals); on winter roads at speed the
      // player's car turns harder than its path instead (WINTER.ov), and the tail steps out.
      if (hb) targetW *= 1.55;
      else if (Math.abs(targetW) > wLim) {
        const over = Math.abs(targetW) / wLim;
        let cap = 1.12, k = 0.15;
        if (hs > 0) {
          const o = WINTER.ov[drive], brk = driven ? c.brake : 0;
          const ov = (o[1] + (o[0] - o[1]) * thr + WINTER.flick * flick) * (1 - brk) + WINTER.brake[0] * brk;
          cap += (ov - cap) * hs; k += (1 - k) * Math.min(1, WINTER.kRamp * hs);
        }
        targetW = Math.sign(targetW) * wLim * Math.min(cap, 1 + (over - 1) * k);
        if (Math.abs(vf) > 6) this.skidAmt = Math.max(this.skidAmt, clamp((over - 1.6) * 0.75, 0, 0.8) * (1 - hs));
        // understeer scrubs a little speed
        vf -= Math.sign(vf) * Math.min(Math.abs(vf), (over - 1) * 1.2 * (1 - D) * (1 - 0.6 * hs) * dt);
      }
      if (hb && Math.abs(vf) > 5) this.skidAmt = Math.max(this.skidAmt, 0.55);
      let wK = hb ? 4 : 7;
      if (D > 0) { targetW += (wDrift - targetW) * D; wK += (SLIDE.wK - wK) * D; }
      if (P > 0) {
        // the donut: the yaw from the steering, the car swinging round one axle (its point at
        // `d` along the car stands still: vr = d * w), creeping forwards on the spinning wheels
        const piv = SLIDE.pivot[drive], d = drive === 'rwd' ? s.wb / 2 : drive === 'fwd' ? -s.wb / 2 : 0;
        targetW += (-c.steer * piv - targetW) * P; wK += (5 - wK) * P;
        vr += (d * this.w - vr) * Math.min(1, P * 12 * dt);
        vf = damp(vf, 0.6, 3 * P, dt);
        this.skidAmt = Math.max(this.skidAmt, P);
      }
      this.w = damp(this.w, targetW, wK, dt);
      this.swing = hs > 0 ? damp(this.swing, this.w, 2, dt) : 0;
      // the front wheels in a slide point where the car is going (the counter-steer you see)
      this.steerShow = D > 0 ? this.steerAngle + (clamp(slip * 0.9 + c.steer * 0.15, -0.62, 0.62) - this.steerAngle) * D * (1 - P) : this.steerAngle;
    } else {
      this.w *= Math.exp(-0.6 * dt);
    }
    this.vx = fx * vf + rx * vr;
    this.vz = fz * vf + rz * vr;
    this.yaw += this.w * dt;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.wheelSpin += (vf * dt) / s.wheelR;
    // Accelerations for the suspension (smoothed): forward, and sideways (centripetal).
    this.accelF = damp(this.accelF, (vf - vf0) / dt, 10, dt);
    this.accelL = damp(this.accelL, this.w * vf, 8, dt);
    this.stepEngine(dt, vf, maxSpeed, driven);

    const gh = groundAt(this.x, this.z, this.y, 0.6);
    const gb = groundInfo.block, onHill = !!gb && gb.shape === HILL;
    const sus = this._sus;
    if (this.air) {
      const F = this.flight;
      this.vy -= (F ? HOPP.grav : 22) * dt;
      this.y += this.vy * dt;
      if (F) { F.t += dt; if (this.y > F.apex) F.apex = this.y; }
      if (this.y <= gh) {
        let impact = -this.vy, vyOn = 0;
        if (onHill) {
          // into the slope (along its normal); what goes along it carries on
          hillSlope(gb, this.x, this.z, _sl);
          const L = Math.hypot(1, _sl.gx, _sl.gz), vn = (this.vy - _sl.gx * this.vx - _sl.gz * this.vz) / L;
          impact = Math.max(0, -vn);
          if (vn < 0) { this.vx -= vn * (-_sl.gx / L) * HOPP.carry; this.vz -= vn * (-_sl.gz / L) * HOPP.carry; }
          vyOn = _sl.gx * this.vx + _sl.gz * this.vz;
        }
        this.y = gh; this.vy = vyOn; this.air = false;
        if (impact > 4) {
          this.bump = Math.min(0.35, impact * 0.03);
          sus.hv -= Math.min(2.5, impact * 0.12);
          if (F) sus.pv += clamp(impact * 0.012, 0, 0.12) * (Math.random() < 0.5 ? 1 : -1);   // (it rocks)
          game?.onCarLanded(this, impact);
          if (impact > 13) this.damage((impact - 13) * 2.5, game);
        } else if (F && impact > 1.5) sus.hv -= impact * 0.1;
        if (F) {
          F.dist = Math.hypot(this.x - F.x0, this.z - F.z0);
          this.landed = { ...F, impact, onHill, x: this.x, z: this.z };
          this.flight = null;
          game?.onCarFlight?.(this, this.landed);
        }
      }
    } else if (onHill || this.hill) {
      // On a hill: follow the snow until it falls away faster than the car would fall (4 mm a step
      // = 29 m/s² more than gravity: off the kicking edge's rounding from ~6 m/s; the snow is smooth
      // where cars drive, its lumps are only drawn).
      const pred = this.y + this.vy * dt - 0.5 * HOPP.grav * dt * dt;
      if (gh < pred - 0.004) {
        this.air = true;
        this.flight = { t: 0, x0: this.x, z0: this.z, y0: this.y, apex: pred, v0: Math.hypot(vf, vr), vy0: this.vy, hill: this.hill || gb, dist: 0 };
        this.y = pred; this.vy -= HOPP.grav * dt;
        game?.onCarTakeoff?.(this);
      } else {
        const vy = clamp((gh - this.y) / dt, -20, 20);
        sus.hv -= (vy - this.vy) * 0.035;   // the springs take the changes of slope
        this.vy = vy; this.y = gh;
      }
    } else if (gh < this.y - 0.35) {
      this.air = true;
    } else {
      const dy = gh - this.y;
      if (Math.abs(dy) > 0.04) { sus.hv -= dy * 2.2; sus.pv += dy * 3 * Math.sign(vf || 1); } // kerbs
      this.vy = clamp(dy / dt, -6, 12);
      this.y = gh;
    }
    this.hill = onHill && !this.air ? gb : null;
    this.stepSuspension(dt);

    this.updateObb();
    this.collideStatic(game);
    if (this.trailer) this.trailer.step(dt, game);
    if (!this.dead && this.hp < 35) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = this.hp < 15 ? 0.05 : 0.12;
        const hx = this.x + fx * s.len * 0.38, hz = this.z + fz * s.len * 0.38;
        FX.smoke(hx, this.y + this.height * 0.7, hz, this.hp < 15);
      }
    }
    if (this.dead) {
      this.smokeT -= dt;
      if (this.smokeT <= 0 && this.burn > 0) {
        this.smokeT = 0.06;
        FX.fire(this.x, this.y + 1.0, this.z);
        if (Math.random() < 0.4) FX.smoke(this.x, this.y + 1.6, this.z, true);
      }
      this.burn -= dt;
    }
    this.sleepCheck(game);
  }

  // A four/five-speed gearbox for the engine note: revs climb through each gear and drop at shifts.
  stepEngine(dt, vf, maxSpeed, driven) {
    const v = Math.abs(vf);
    const tops = [0, 0.2, 0.38, 0.58, 0.8, 1.02];
    const lo = (g) => (g <= 1 ? 0 : tops[g - 1] * 0.62);
    let g = this.gear;
    const frac = v / maxSpeed;
    if (frac > tops[g] * 0.97 && g < 5) g++;
    else if (g > 1 && frac < lo(g) + 0.03) g--;
    this.gear = g;
    const span = tops[g] - lo(g);
    const inGear = clamp((frac - lo(g)) / span, 0, 1);
    const load = driven ? this.ctrl.throttle : 0;
    const target = driven ? (vf < -0.3 ? 0.25 + Math.min(0.5, v / 10) : 0.14 + inGear * 0.74 + load * 0.08) : 0;
    this.revs = damp(this.revs, target, 7, dt);
  }

  // Body attitude: damped springs towards what the accelerations ask for (squat under power,
  // dive under braking, roll out of corners), so the body bobs a little when they change.
  stepSuspension(dt) {
    const sus = this._sus, s = this.spec;
    const soft = s.tall ? 1.4 : 1;
    const tp = clamp(-this.accelF * 0.0036 * soft, -0.04, 0.036);
    const tr = clamp(this.accelL * 0.0048 * soft, -0.075, 0.075);
    const k = s.tall ? 48 : 70, c = s.tall ? 6.5 : 8.5;
    sus.pv += (-k * (sus.p - tp) - c * sus.pv) * dt; sus.p += sus.pv * dt;
    sus.rv += (-k * (sus.r - tr) - c * sus.rv) * dt; sus.r += sus.rv * dt;
    sus.hv += (-90 * sus.h - 9 * sus.hv) * dt; sus.h += sus.hv * dt;
    sus.p = clamp(sus.p, -0.08, 0.08); sus.r = clamp(sus.r, -0.1, 0.1); sus.h = clamp(sus.h, -0.12, 0.08);
  }

  collideStatic(game) {
    const o = this.obb, r = this.radius;
    const list = queryBlocks(this.x - r, this.z - r, this.x + r, this.z + r, _blocks);
    for (const b of list) {
      const top = b.shape === RAMP ? topAt(b, this.x, this.z) : b.top;
      if (top <= this.y + 0.6) continue;
      if (b.kind === 'prop') {
        if (!obbVsBlock(o, b, _hit)) continue;
        const sp = this.speed;
        if (sp > (b.ref.def.minSpeed ?? 3) && game) {
          game.breakProp(b.ref, this.vx, this.vz, this);
          this.vx *= 0.92; this.vz *= 0.92;
          continue;
        }
        this.resolveStatic(_hit, game, b);
        continue;
      }
      if (!obbVsBlock(o, b, _hit)) continue;
      this.resolveStatic(_hit, game, b);
    }
  }

  resolveStatic(h, game, b) {
    const d = Math.min(h.depth, 1.5);
    this.x += h.nx * d; this.z += h.nz * d;
    const rxc = h.cx - this.x, rzc = h.cz - this.z;
    const pvx = this.vx + this.w * rzc, pvz = this.vz - this.w * rxc;
    const vn = pvx * h.nx + pvz * h.nz;
    if (vn < 0) {
      const rn = (rzc * h.nx - rxc * h.nz) * 0.7;
      const invM = 1 / this.mass, invI = 1 / this.inertia;
      const j = (-(1 + 0.22) * vn) / (invM + rn * rn * invI);
      this.vx += j * h.nx * invM; this.vz += j * h.nz * invM;
      this.w += j * rn * invI;
      const tx = -h.nz, tz = h.nx, vt = this.vx * tx + this.vz * tz;
      this.vx -= tx * vt * 0.12; this.vz -= tz * vt * 0.12;
      const impact = -vn;
      if (impact > 2.5) {
        // the body rocks with the hit
        const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
        this._sus.pv += (h.nx * fx + h.nz * fz) * impact * 0.04;
        this._sus.rv += (h.nx * fz - h.nz * fx) * impact * 0.04;
        if (game) game.onCarImpact(this, null, impact, h.cx, h.cz, b);
      }
      if (impact > 5) this.damage((impact - 5) * 2.0, game);
    }
    this.updateObb();
  }

  damage(amount, game) {
    if (this.dead || amount <= 0) return;
    if (this.invulnerable) return;
    this.wake();
    this.hp -= amount * (this.damageScale ?? 1);
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.burn = 6;
      this.body.material = MAT.burnt;
      this.bodyLod.material = MAT.burnt;
      if (this.glass) this.glass.visible = false;
      if (this.snowCap) this.snowCap.visible = this.snowCapLod.visible = false;
      FX.explosion(this.x, this.y + 0.5, this.z);
      this.vy = 6; this.air = true;
      this.w += (Math.random() - 0.5) * 3;
      this.hazard = false; this.indicator = 0;
      this.setLod(this.lod);   // a wreck far away is drawn on its own (burnt), not instanced
      game?.onCarDestroyed(this);
    }
  }

  repair() {
    this.hp = this.spec.hp;
    this.dead = false;
    this.burn = 0;
    this.body.material = this.body.userData.baseMaterial;
    this.bodyLod.material = this.bodyLod.userData.baseMaterial;
    this.wake();
    this.setLod(this.lod);
  }

  // Lamp intensities per channel (see carmodels CH). Red and amber stay under the tone mapper's
  // shoulder (ACES turns a strong pure red into peach and amber into cream): a lit tail lamp ~0.2, a
  // brake lamp ~0.62 (hue <= 8°), an indicator ~0.85 (hue ~30°); the glow quads carry the 'on' read.
  // Headlamps and reversing lamps are white and may bloom.
  updateLights(t) {
    const ch = this.lightMat?.userData.ch;
    if (!ch) return;
    const on = this.running && this.headlights;
    const blink = (t % 0.76) < 0.42;
    const brake = this.running && (this.braking > 0.05 || (this.ctrl.brake > 0.05 && Math.abs(this.forwardSpeed) < 0.5 && !this.ctrl.park));
    ch[CH.head] = this.dead ? 0 : on ? 2.0 : 0;
    ch[CH.tail] = this.dead ? 0 : (on ? 0.2 : 0) + (brake ? 0.42 : 0);
    const L = !this.dead && (this.hazard || this.indicator < 0) && blink, R = !this.dead && (this.hazard || this.indicator > 0) && blink;
    ch[CH.indL] = L ? 0.85 : 0;
    ch[CH.indR] = R ? 0.85 : 0;
    ch[CH.rev] = this.running && this.reversing ? 1.6 : 0;
    ch[CH.brake] = brake ? 0.7 : 0;
    ch[CH.sign] = this.running ? 1.6 : 0.15;
    // the sopbil's amber beacons turn while it works (engine running): two flashes per turn
    const bt = (t * 1.6 + this.id * 0.37) % 1;
    ch[CH.beacon] = this.running && this.kind === 'garbage' && !this.dead ? (bt < 0.12 || (bt > 0.5 && bt < 0.62) ? 1.3 : 0.08) : 0;
    if (this.glow) this.glow.visible = brake || L || R || ch[CH.rev] > 0 || ch[CH.beacon] > 0.5;
  }

  sync(dt) {
    // round 4: a sleeping car with nothing lit or blinking has nothing to update but what depends on
    // the camera (LOD, plate, shadow); its pose, lamps and instance matrix stay as they are
    if (this._quiet && this.asleep && !this.running && !this.hazard && !this.indicator) { this.syncView(); return; }
    const s = this.spec;
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.y = this.yaw;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    if (this.air) this.groundPitch = damp(this.groundPitch, -Math.atan2(this.vy, Math.max(4, Math.abs(this.forwardSpeed))) * (this.flight ? HOPP.nose : 0.6), this.flight ? 4 : 6, dt);
    else {
      const wb = s.wb / 2;
      const hF = groundAt(this.x + fx * wb, this.z + fz * wb, this.y + 0.3, 0.6), hR = groundAt(this.x - fx * wb, this.z - fz * wb, this.y + 0.3, 0.6);
      this.groundPitch = damp(this.groundPitch, -Math.atan2(hF - hR, wb * 2), 12, dt);
    }
    // Out on the hills beyond the town (features/avgrunden.md) the ground slopes sideways as well; in
    // town nothing does, and nothing changes there.
    const off = Math.abs(this.x) > 320 || Math.abs(this.z) > 320 || !!this.hill;
    if (off || this.groundRoll) {
      let roll = 0;
      if (off && !this.air) {
        const hw = s.wid * 0.42, lx = fz * hw, lz = -fx * hw;
        roll = Math.atan2(groundAt(this.x + lx, this.z + lz, this.y + 0.3, 0.6) - groundAt(this.x - lx, this.z - lz, this.y + 0.3, 0.6), hw * 2);
      }
      this.groundRoll = damp(this.groundRoll, roll, 10, dt);
      if (!off && Math.abs(this.groundRoll) < 1e-4) this.groundRoll = 0;
    }
    const sus = this._sus;
    this.bump = Math.max(0, this.bump - dt * 1.5);
    this.pitch = sus.p; this.roll = sus.r; this.heave = sus.h;
    this.tilt.rotation.set(this.groundPitch + sus.p, 0, sus.r + this.groundRoll);
    this.tilt.position.y = sus.h;
    this.root.updateMatrix();
    this.tilt.updateMatrix();
    this._im.multiplyMatrices(this.root.matrix, this.tilt.matrix);
    carsChanged();
    for (const w of this.wheels) w.steer = w.front ? -this.steerShow : 0;
    this.syncView();
    const t = performance.now() / 1000;
    this.updateLights(t);
    if (this.trailer) this.trailer.sync(dt, t);
    // cold-morning exhaust vapour from running cars near the camera (round 4, the art review: faint
    // puffs every 0.45-0.6 s at idle and while creeping off - round 3's 0.3 s piled up into cotton
    // balls behind the chase camera - none above ~3 m/s, where cold vapour is shredded at once, and
    // none when the camera is within 9 m behind the tailpipe (the chase camera, a car ahead at a
    // junction: the puff would hang right in front of the lens) or within 3 m from any side)
    if (this.running && camera) {
      const dx = this.x - camera.position.x, dz = this.z - camera.position.z, v = this.speed;
      if (dx * dx + dz * dz < 40 * 40 && v < 3) {
        this.exhaustT -= dt;
        if (this.exhaustT <= 0) {
          this.exhaustT = (0.45 + Math.random() * 0.15) * (v < 1.2 ? 1 : 1 + (v - 1.2) * 0.9);
          const e = this.model.exhaust;
          _v.set(e[0], e[1], e[2]).applyMatrix4(this._im);
          const cx = camera.position.x - _v.x, cz = camera.position.z - _v.z, d2 = cx * cx + cz * cz + (camera.position.y - _v.y) ** 2;
          const behind = cx * fx + cz * fz < 0;
          if (d2 > 9 && !(behind && d2 < 81)) FX.exhaust(_v.x, _v.y, _v.z, this.vx * 0.6 - fx * 1.4, this.vz * 0.6 - fz * 1.4, EXHAUST);
        }
      }
    }
    this._quiet = this.asleep && !this.running && !this.hazard && !this.indicator;
  }

  // What depends on the camera only: level of detail by distance (with a little hysteresis), the
  // plate's range, shadow casting, the lamp mesh of a far car.
  syncView() {
    if (camera) {
      const dx = this.x - camera.position.x, dz = this.z - camera.position.z, d2 = dx * dx + dz * dz;
      const lod = this.lod ? d2 > LOD_IN * LOD_IN : d2 > LOD_OUT * LOD_OUT;
      if (lod !== this.lod) this.setLod(lod);
      // the plate (in the same draw call as the badges) stays on out to ~70 m: it vanished with the
      // switch at 46 m, a visible pop on a car ahead in the chase camera
      if (this.plateMesh) this.plateMesh.visible = d2 < PLATE_DIST * PLATE_DIST;
      const cast = d2 < SHADOW_DIST * SHADOW_DIST;
      if (cast !== this._cast) { this._cast = cast; this.body.castShadow = this.bodyLod.castShadow = cast; }
    }
    // a parked far car's lenses are baked into its LOD body: no lamp mesh (one draw call per far car)
    if (this.lights) this.lights.visible = !this.lod || this.running;
    // a far car's glass is opaque: whoever sits in it can't be seen (main.js's busts: 2 calls each)
    if (this.driverBust?.isObject3D) this.driverBust.visible = !this.lod;
  }

  setLod(on) {
    this.lod = on;
    const inst = on && !this.dead && CAR_PERF.instLod;
    this._inst = inst;
    this.body.visible = !on;
    this.bodyLod.visible = on && !inst;
    if (this.snowCap) this.snowCap.visible = !on && !this.dead;
    if (this.snowCapLod) this.snowCapLod.visible = on && !this.dead && !inst;
    if (this.glass) this.glass.visible = !on && !this.dead;
    carsChanged();
  }

  // Release what is this car's own (round 4; main.js's removeCar calls it after taking the car out
  // of the scene): its plate's atlas slot and plate geometry, the plate string, its lamp and glow
  // materials, its trailer's, and the seated bust's geometry (main.js's addBust: people's buildBust
  // bakes one geometry per bust; its materials are shared). Model geometries, snow caps and the paint
  // / surface materials are shared per type and colour and stay. Seated characters are unseated by
  // removeCar and are not touched. A disposed car must not be added to the scene again.
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.root.parent) this.root.parent.remove(this.root);
    this.showPlate(false);
    releasePlate(this.plate);
    lodCars.delete(this);
    this._wheelsOff?.();
    if (this.trailer) { this.trailer.dispose(); this.trailer = null; }
    this.lightMat?.dispose();
    this.glow?.material.dispose();
    if (this.driverBust?.isObject3D) { this.driverBust.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); this.driverBust = null; }
    carsChanged();
  }

  // Called by the wheel system before rendering: one matrix per wheel (on the ground, following
  // the road's slope, steering, rolling; not the body's roll).
  writeWheels(sink) {
    const m = this.model, r = m.wr;
    _m4.compose(_v.set(this.x, this.y, this.z), _q.setFromEuler(_e.set(this.groundPitch, this.yaw, this.groundRoll, 'YXZ')), _s.set(1, 1, 1));
    for (const w of this.wheels) {
      const spin = w.side > 0 ? this.wheelSpin : -this.wheelSpin;
      _e.set(spin, w.steer + (w.side > 0 ? 0 : Math.PI), 0, 'YXZ');
      _m4b.compose(_v.set(w.x, r, w.z), _q.setFromEuler(_e), _s.set(m.ww, r, r));
      _m4b.premultiply(_m4);
      sink.put(this.lod ? 'lod' : m.wheelStyle, _m4b, this.dead, this.grime);
    }
  }
}

const _blocks = [];
const _hit = {};
const LOD_OUT = 46, LOD_IN = 40, SHADOW_DIST = 95, PLATE_DIST = 72;
// fx.exhaust's optional look (the rendering area's puff: alpha and size multipliers; older fx.js
// ignores the argument)
const EXHAUST = { alpha: 0.6, size: 0.8 };

const _ch = {};
// Two sleeping cars can't be in contact (they were resolved before they fell asleep, and placing or
// moving one wakes it): skipped. Any contact wakes both.
export function collideCars(a, b, game) {
  if (a.asleep && b.asleep) return;
  const rr = a.radius + b.radius;
  const dx = a.x - b.x, dz = a.z - b.z;
  if (dx * dx + dz * dz > rr * rr) return;
  if (a.y > b.y + b.height - 0.3 || b.y > a.y + a.height - 0.3) return;
  if (!obbVsObb(a.obb, b.obb, _ch)) return;
  a.wake(); b.wake();
  const ma = a.mass, mb = b.mass;
  const d = Math.min(_ch.depth, 1.2);
  a.x += _ch.nx * d * mb / (ma + mb); a.z += _ch.nz * d * mb / (ma + mb);
  b.x -= _ch.nx * d * ma / (ma + mb); b.z -= _ch.nz * d * ma / (ma + mb);
  const rax = _ch.cx - a.x, raz = _ch.cz - a.z, rbx = _ch.cx - b.x, rbz = _ch.cz - b.z;
  const vax = a.vx + a.w * raz, vaz = a.vz - a.w * rax;
  const vbx = b.vx + b.w * rbz, vbz = b.vz - b.w * rbx;
  const vn = (vax - vbx) * _ch.nx + (vaz - vbz) * _ch.nz;
  if (vn < 0) {
    const rna = (raz * _ch.nx - rax * _ch.nz) * 0.7, rnb = (rbz * _ch.nx - rbx * _ch.nz) * 0.7;
    const j = (-(1 + 0.3) * vn) / (1 / ma + 1 / mb + (rna * rna) / a.inertia + (rnb * rnb) / b.inertia);
    a.vx += (j * _ch.nx) / ma; a.vz += (j * _ch.nz) / ma; a.w += (j * rna) / a.inertia;
    b.vx -= (j * _ch.nx) / mb; b.vz -= (j * _ch.nz) / mb; b.w -= (j * rnb) / b.inertia;
    const impact = -vn;
    if (impact > 2) {
      for (const [c, sgn] of [[a, 1], [b, -1]]) {
        const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
        c._sus.pv += sgn * (_ch.nx * fx + _ch.nz * fz) * impact * 0.03;
        c._sus.rv += sgn * (_ch.nx * fz - _ch.nz * fx) * impact * 0.03;
      }
      game?.onCarImpact(a, b, impact, _ch.cx, _ch.cz);
      if (impact > 4) {
        a.damage((impact - 4) * 1.6 * (mb / (ma + mb)) * 2, game);
        b.damage((impact - 4) * 1.6 * (ma / (ma + mb)) * 2, game);
      }
    }
  }
  a.updateObb(); b.updateObb();
}

// ---------------------------------------------------------------------------------------------
// Round 4: the warm-up at load. Without it, the first time a car type (or a snow / LOD / wreck
// variant of it) comes near, its shaders compile and its geometry uploads in that frame (Ove's first
// entry into the Saab from the start: a 42 ms frame, 23 car meshes and a program). warmCars builds one
// of every model with and without snow (near body, glass, lamps, glow, plate, snow caps, far body, a
// wreck, the trailer), makes every instanced far-body batch and wheel pool, compiles all their
// materials against the real scene's lights / fog / environment (compileAsync when there is one,
// rendering into a target like the composer's so the program variants match) and then draws the
// meshes once into a 1x1 target with a plain material, which uploads every car geometry. It frees
// what it made (the batches and the wheel pools stay: the game uses them). main.js: call it once
// after the town and the cars exist, e.g. `await warmCars(renderer, scene, camera)` during loading.
// Resolves with { programs, ms }; a second call returns the first one's promise. If nobody calls it,
// the cars do it themselves 2 s after the first frame (CAR_PERF.autoWarm; on the title screen in the
// game): the shaders compile in the background, the geometry upload is one ~1-frame hitch then.
let warmP = null, autoWarmT = null, warmDone = null;
export function warmCars(renderer, scn = scene, cam = camera) {
  if (autoWarmT) { clearTimeout(autoWarmT); autoWarmT = null; }
  return (warmP ||= doWarm(renderer, scn, cam));
}
addRenderHook(() => {
  if (warmP || autoWarmT || !CAR_PERF.autoWarm || !gfxRenderer) return;
  autoWarmT = setTimeout(() => { autoWarmT = null; if (!warmP && scene && camera) warmCars(gfxRenderer, scene, camera).catch((e) => console.warn('warmCars', e)); }, 2000);
});
async function doWarm(renderer, scn, cam) {
  const t0 = performance.now(), p0 = renderer.info.programs?.length ?? 0;
  const group = new THREE.Group();
  group.name = 'carWarmup';
  group.position.set(cam.position.x, -50, cam.position.z);   // out of sight, should a frame draw it
  const cars = [];
  for (const kind of MODEL_KEYS) for (const snow of [false, true]) {
    const c = new Car(kind, { snow, solid: snow, engineOn: true, trailer: kind === 'volvo740' && !snow });
    c._noPlate = cars.length > 0;   // one plate is enough (one plate material); no new atlas page
    group.add(c.root);
    cars.push(c);
  }
  scn.add(group);
  const wreck = new THREE.Mesh(carModel('volvo240').body, MAT.burnt);
  wreck.castShadow = wreck.receiveShadow = true;
  group.add(wreck);
  // nothing of it is drawn by the game's frames while the shaders compile (compile ignores visibility;
  // the wheel system skips hidden roots)
  const hide = (on) => { for (const o of group.children) o.visible = !on; };
  hide(true);
  const extra = [];
  for (const kind of MODEL_KEYS) for (const snow of [false, true]) { const b = lodBatch(kind, snow); extra.push(b.mesh); if (b.capMesh) extra.push(b.capMesh); }
  extra.push(...makeWheelPools());
  for (const c of cars) {
    c.body.visible = c.bodyLod.visible = true;
    for (const o of [c.glass, c.lights, c.glow, c.snowCap, c.snowCapLod, c.plateMesh]) if (o) o.visible = true;
  }
  // compile (the render target decides tone mapping / output colour space in the program variants:
  // the main pass draws into the composer's scene target, so compile with exactly that one bound -
  // phase 4: as gfx's precompile() does)
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const prevRT = renderer.getRenderTarget();
  renderer.setRenderTarget(composer?.renderTarget1 || rt);
  const roots = [group, ...extra];
  const t1 = performance.now();
  let waits = [];
  try {
    waits = roots.map((o) => (renderer.compileAsync ? renderer.compileAsync(o, cam, scn) : (renderer.compile(o, cam, scn), null)));
  } finally { renderer.setRenderTarget(prevRT); }
  const t2 = performance.now();
  await Promise.all(waits.filter(Boolean));
  const t3 = performance.now();
  // upload every geometry: one draw of each mesh with a plain material into the 1x1 target
  hide(false);
  for (const m of extra) if (m.geometry) group.add(new THREE.Mesh(m.geometry));
  const plain = new THREE.MeshBasicMaterial(), swapped = [];
  group.traverse((o) => { if (o.isMesh) { swapped.push(o, o.material, o.frustumCulled, o.visible); o.material = plain; o.frustumCulled = false; o.visible = true; } });
  renderer.setRenderTarget(rt);
  try { renderer.render(group, cam); } finally { renderer.setRenderTarget(prevRT); }
  for (let i = 0; i < swapped.length; i += 4) { const o = swapped[i]; o.material = swapped[i + 1]; o.frustumCulled = swapped[i + 2]; o.visible = swapped[i + 3]; }
  for (const c of cars) if (c.plateH) renderer.initTexture?.(c.plateH.page.tex);
  scn.remove(group);
  for (const c of cars) c.dispose();
  plain.dispose();
  rt.dispose();
  carsChanged();
  const t4 = performance.now();
  return (warmDone = { programs: (renderer.info.programs?.length ?? 0) - p0, ms: +(t4 - t0).toFixed(0), buildMs: +(t1 - t0).toFixed(0), compileMs: +(t2 - t1).toFixed(0), waitMs: +(t3 - t2).toFixed(0), uploadMs: +(t4 - t3).toFixed(0) });
}

// A/B switches for tests (round 4): setCarPerf({ instLod: false }) draws far bodies one by one,
// setCarPerf({ sleep: false }) wakes every car and keeps them awake.
export function setCarPerf(o) {
  Object.assign(CAR_PERF, o);
  for (const c of lodCars) { if (!CAR_PERF.sleep) c.wake(); c.setLod(c.lod); }
  carsChanged();
}
