// Tracks in the snow (feature snöspår): footprints where people walk and ruts where wheels roll on
// snow (the lawns, the park, the snow hills, the fields and tracks beyond the town). Nothing on
// asphalt, paving, gravel or ice (surface.js says what the ground is), nothing on a bench
// or a car roof.
//
//   Footprints: one decal per step, stamped where the foot bone stands as it is planted (STAMP_U into
//   the leg's stride, early in its stance, flat on the ground: models.js locomotion), both feet on a
//   landing (a jump, getting out of a car). Their
//   size, width and sole come from the person (adults ~4 cm deep, children shallower; winter boots
//   leave lugs, sneakers fine waves, shoes a separate heel).
//   Ruts: a ribbon per wheel (cars, the trailer, Rune's wheelchair and its casters), a segment every
//   SEG m with mitred joints, the open segment following the wheel; a tyre sliding sideways smears a
//   wider band. Front and rear wheels both leave theirs (in a turn the rear ones run inside).
//
// Both are drawn with the 'snow' surface's own shader (gfx.js, a unique copy: the same snow texture,
// drifts and sparkle as the ground under them), plus a relief from a height function per fragment: its
// slope bends the normal, and a short march towards the sun shades whatever the wall between it and
// the low sun hides (13°: a 4 cm deep print is mostly in its own shade). The sky lights it on a normal
// bent most of the way back up (a wall sees the opposite wall, not the bright horizon), a little
// dimmer in the bottom.
// Alpha-blended over the ground, so the pushed-up rim fades into the snow round it.
//
// Rings: Ove's prints and the ruts of the car he drives are kept apart from everybody else's (each a
// ring buffer, the oldest fading out before they are overwritten): ~560 m of Ove walking, ~500 m of
// driving on snow. A new day (missions.js, the dawn) clears them all: tracks.clear(). Out in the
// blizzard (game/cold.js, fx.blowAmount) new tracks fill in with blown snow within ~40 s.
//
//   tracks.init(scene)      builds the two meshes (main.js, after fx.init)
//   tracks.update(game, dt) per frame after syncAll: stamps and extends
//   tracks.clear()          everything gone (a new day)
//   tracks.on               false (&notracks): nothing is made
//   tracks.stats()          { feet, ruts (alive per ring), made, gen } for tests; feetList(ring),
//                           rutList(ring), meshes(), debugFill(x, z, r) (snospar.mjs)

import { THREE, surfaceMaterial, camera } from '../gfx.js';
import { groundAt, groundInfo, HILL } from '../world/collision.js';
import { surfaceAt, surfaceHit } from '../world/surface.js';
import { fx } from './fx.js';

const TAU = Math.PI * 2;
const FEET = [720, 720];          // prints: Ove's, everybody else's
const SEGS = [4800, 2400];        // rut segments: the car Ove drives (and its trailer), everything else
const SEG = 0.45;                 // m per rut segment
const NEAR_PPL = 70, NEAR_CAR = 100;   // m from the camera: further away nothing new is made
const LIFT = 0.004;               // over the snow (the decals also pull forward in depth)
const BERM = 0.065;               // a rut's ribbon reaches this far past the tyre (the pushed-up snow)
const STAMP_U = 0.22;             // where in a leg's stride its print is made (its stance: 0 .. ~0.6)
const OFF_TOWN = 320;             // beyond this the ground follows the hills (layout.terrain)

// ---------------------------------------------------------------------------------------------
// Shaders: added to the 'snow' surface material's own (gfx.js surfaceCompile).

const VERT_PARS = `
uniform vec4 uTrk;     // the rings' heads (elements made so far) and sizes
uniform float uTrkT;   // seconds, for the fill-in
varying vec4 vTrkA;    // u across (m; a left foot's mirrored), v along (m), the along direction (x, z)
varying vec4 vTrkB;    // print: length, width, depth, side | rut: half width, depth, smear, 1
varying vec4 vTrkC;    // fade, fill, style, kind (0 print, 1 rut)
#ifdef TRK_FOOT
  attribute vec4 iP;   // x, y, z, yaw
  attribute vec4 iS;   // length, width, depth, side
  attribute vec4 iQ;   // ground slope x, z, style, -
  attribute vec4 iR;   // serial, ring, birth, fill rate
#else
  attribute vec4 aA;   // u, v, along x, z
  attribute vec4 aB;   // half width, depth, smear, style
  attribute vec4 aC;   // serial, ring, birth, fill rate
#endif
float trkFade( vec4 r, out float fill ) {
  float head = r.y < 0.5 ? uTrk.x : uTrk.y, cap = r.y < 0.5 ? uTrk.z : uTrk.w;
  fill = clamp( ( uTrkT - r.z ) * r.w, 0.0, 1.0 );
  return 1.0 - smoothstep( cap * 0.75, cap, head - r.x );
}
`;
const VERT_NORMAL = `
#ifdef TRK_FOOT
  objectNormal = normalize( vec3( - iQ.x, 1.0, - iQ.y ) );
#endif
`;
const VERT_BEGIN = `
{
  float fill;
  #ifdef TRK_FOOT
    float M = 0.045;   // the rim round the print
    vec2 loc = position.xz * vec2( iS.y + 2.0 * M, iS.x + 2.0 * M );
    float c = cos( iP.w ), s = sin( iP.w );
    vec2 al = vec2( s, c ), ac = vec2( c, - s );
    vec2 w = ac * loc.x + al * loc.y;
    transformed = vec3( iP.x + w.x, iP.y + iQ.x * w.x + iQ.y * w.y, iP.z + w.y );
    if ( iS.x <= 0.0 ) transformed = vec3( 0.0, - 1000.0, 0.0 );
    vTrkA = vec4( loc.x * iS.w, loc.y, al );
    vTrkB = iS;
    vTrkC = vec4( trkFade( iR, fill ), 0.0, iQ.z, 0.0 );
  #else
    vTrkA = aA;
    vTrkB = vec4( aB.xyz, 1.0 );
    vTrkC = vec4( trkFade( aC, fill ), 0.0, aB.w, 1.0 );
  #endif
  vTrkC.y = fill;
}
`;
// (after the surface's own: its triplanar coordinates are the world's, like the ground's)
const VERT_TRI = `
vTri = vec4( transformed, 0.0 );
vTriN = objectNormal;
`;
const FRAG_PARS = `
varying vec4 vTrkA;
varying vec4 vTrkB;
varying vec4 vTrkC;
float gTrkSh = 1.0;    // the relief's own shadow on the sun (RE_Direct_Trk)
float gTrkAO = 1.0;    // ... and its walls on the skylight
vec3 gTrkBent = vec3( 0.0, 0.0, 1.0 );   // the normal the sky and its reflection are seen by (view)
// A sole's outline: signed distance (m, < 0 inside), heel at v = -L/2, toe at +L/2. Heel and forefoot
// are ellipses joined at the waist; a shoe's (style 2) heel stands apart.
float trkSole( vec2 p, float L, float W, float style ) {
  bool shoe = style > 1.5;
  vec2 rh = vec2( 0.37 * W, 0.2 * L ), rf = vec2( 0.5 * W, shoe ? 0.3 * L : 0.36 * L );
  vec2 ch = vec2( 0.0, - 0.3 * L ), cf = vec2( 0.04 * W, shoe ? 0.2 * L : 0.14 * L );
  float dh = ( length( ( p - ch ) / rh ) - 1.0 ) * min( rh.x, rh.y );
  float df = ( length( ( p - cf ) / rf ) - 1.0 ) * min( rf.x, rf.y );
  float k = shoe ? 0.003 : 0.03;
  float t = clamp( 0.5 + 0.5 * ( df - dh ) / k, 0.0, 1.0 );
  return mix( df, dh, t ) - k * t * ( 1.0 - t );
}
// The sole's pattern pressed into the bottom (-0.5 .. 0.5).
float trkSoleTread( vec2 p, float L, float style ) {
  float t = p.y / L;
  if ( style < 0.5 ) {
    // boots: chevron lugs across the forefoot, square blocks under the heel
    float c = fract( ( p.y - abs( p.x ) * 0.7 ) / 0.018 );
    float lug = smoothstep( 0.1, 0.25, c ) * ( 1.0 - smoothstep( 0.6, 0.75, c ) );
    vec2 q = fract( p / vec2( 0.021, 0.019 ) );
    vec2 bq = smoothstep( vec2( 0.12 ), vec2( 0.25 ), q ) * ( 1.0 - smoothstep( vec2( 0.75 ), vec2( 0.88 ), q ) );
    return ( t < - 0.13 ? bq.x * bq.y : lug ) - 0.5;
  }
  if ( style < 1.5 ) {
    // sneakers: fine waves across
    float c = fract( ( p.y + sin( p.x * 90.0 ) * 0.004 ) / 0.009 );
    return smoothstep( 0.3, 0.5, c ) * ( 1.0 - smoothstep( 0.7, 0.9, c ) ) - 0.5;
  }
  // shoes: a few ribs across the forefoot, a plain heel
  float c = fract( p.y / 0.012 );
  return t < - 0.12 ? 0.0 : smoothstep( 0.35, 0.5, c ) * ( 1.0 - smoothstep( 0.6, 0.75, c ) ) - 0.3;
}
// A print's height (m, 0 = the snow round it): the bottom (deepest under the heel and the ball,
// shallower at the toe), steep crumbly walls, a little snow pushed up round it. d = the outline's
// distance (alpha). detail = 0: no noise, no pattern (the shadow march).
float trkFootH( vec2 p, float L, float W, float D, float style, float fine, float detail, out float d ) {
  d = trkSole( p, L, W, style );
  if ( detail > 0.0 ) d += ( gNoise( vec3( p * 40.0, 3.7 ) ) - 0.5 ) * 0.007;
  float in1 = 1.0 - smoothstep( - 0.016, 0.0, d );
  float t = p.y / L;
  float prof = 0.84 + 0.2 * exp( - pow( ( t + 0.3 ) / 0.14, 2.0 ) ) + 0.12 * exp( - pow( ( t - 0.15 ) / 0.15, 2.0 ) ) - 0.22 * smoothstep( 0.3, 0.5, t );
  float h = - D * in1 * prof;
  float rim = exp( - max( d, 0.0 ) / 0.028 ) * smoothstep( - 0.008, 0.006, d );
  h += D * 0.14 * rim * ( detail > 0.0 ? 0.3 + 1.2 * gNoise( vec3( p * 13.0, 1.3 ) ) : 1.0 );
  if ( detail > 0.0 ) {
    // crumbs in the bottom, and the sole's pattern only partly pressed in
    h += D * 0.1 * ( gNoise( vec3( p * 45.0, 6.1 ) ) - 0.5 ) * in1;
    if ( fine > 0.0 ) h += fine * D * 0.07 * trkSoleTread( p, L, style ) * in1 * smoothstep( 0.25, 0.7, gNoise( vec3( p * 22.0, 8.3 ) ) );
  }
  return h;
}
// A tyre's pattern (-0.5 .. 0.5): style 0 a winter tyre (staggered blocks in four columns, sipes),
// 1 smooth (a wheelchair), 2 a tractor's big chevron lugs.
float trkTyre( vec2 p, float hw, float style ) {
  if ( style > 1.5 ) {
    float c = fract( ( p.y + abs( p.x ) * 1.1 ) / 0.11 );
    return smoothstep( 0.05, 0.15, c ) * ( 1.0 - smoothstep( 0.4, 0.5, c ) ) - 0.5;
  }
  if ( style > 0.5 ) return 0.0;
  float cu = p.x / max( hw, 0.02 ) * 2.0 + 2.0;
  float col = floor( cu ), fc = fract( cu );
  float r = ( p.y + col * 0.013 ) / 0.034;
  float fr = fract( r );
  float blk = smoothstep( 0.08, 0.2, fr ) * ( 1.0 - smoothstep( 0.8, 0.92, fr ) ) * smoothstep( 0.05, 0.16, fc ) * ( 1.0 - smoothstep( 0.84, 0.95, fc ) );
  float sipe = smoothstep( 0.0, 0.15, abs( fract( r * 3.0 + fc * 0.5 ) - 0.5 ) );
  return blk * mix( 0.7, 1.0, sipe ) - 0.5;
}
// A rut's height: the tyre's flat bottom with rounded shoulders, a berm either side. a = how far
// past the tyre's edge (alpha).
float trkRutH( vec2 p, float hw, float D, float style, float fine, float detail, out float a ) {
  float u = abs( p.x );
  if ( detail > 0.0 ) u += ( gNoise( vec3( p * vec2( 34.0, 11.0 ), 2.1 ) ) - 0.5 ) * 0.01;
  a = u - hw;
  float sh = min( 0.025, hw * 0.35 );
  float in1 = 1.0 - smoothstep( hw - sh, hw + 0.004, u );
  float h = - D * in1;
  float b = exp( - max( u - hw, 0.0 ) / 0.03 ) * smoothstep( hw - 0.012, hw + 0.008, u );
  h += D * 0.2 * b * ( detail > 0.0 ? 0.35 + 1.1 * gNoise( vec3( p * vec2( 10.0, 3.5 ), 5.3 ) ) : 1.0 );
  if ( detail > 0.0 ) {
    // a lumpy bottom, the tread pressed in clearly here and hardly there
    h += D * 0.08 * ( gNoise( vec3( p * vec2( 40.0, 25.0 ), 6.1 ) ) - 0.5 ) * in1;
    if ( fine > 0.0 ) h += fine * D * 0.08 * trkTyre( p, hw, style ) * in1 * smoothstep( 0.2, 0.65, gNoise( vec3( p * vec2( 9.0, 2.2 ), 8.3 ) ) );
  }
  return h;
}
float trkH( vec2 p, float fine, float detail, out float d ) {
  float D = ( vTrkC.w < 0.5 ? vTrkB.z : vTrkB.y ) * ( 1.0 - vTrkC.y );
  if ( vTrkC.w < 0.5 ) return trkFootH( p, vTrkB.x, vTrkB.y, D, vTrkC.z, fine, detail, d );
  return trkRutH( p, vTrkB.x, D, vTrkC.z, fine * ( 1.0 - vTrkB.z ), detail, d );
}
`;
// Before <clearcoat_normal_fragment_begin>, i.e. right after the surface's own normal, albedo and
// snow: the relief, its shadow, the alpha.
const FRAG_MAIN = `
{
  vec2 p = vTrkA.xy;
  float side = vTrkB.w, rut = vTrkC.w;
  float fw = max( length( fwidth( p ) ), 1e-5 );        // metres per pixel
  float fine = 1.0 - smoothstep( 0.0018, 0.006, fw );   // the sole's or the tyre's pattern
  float D = ( rut < 0.5 ? vTrkB.z : vTrkB.y ) * ( 1.0 - vTrkC.y ) + 1e-4;
  float d, dd;
  float e = 0.004;
  float h0 = trkH( p, fine, 1.0, d );
  float hx = trkH( p + vec2( e, 0.0 ), fine, 1.0, dd );
  float hy = trkH( p + vec2( 0.0, e ), fine, 1.0, dd );
  // (far away a wall is under a pixel: its slope averages out over the pixel)
  vec2 dh = vec2( hx - h0, hy - h0 ) / e * mix( 1.0, 0.3, smoothstep( 0.004, 0.025, fw ) );
  vec3 al = normalize( vec3( vTrkA.z, 0.0, vTrkA.w ) ), ac = vec3( al.z, 0.0, - al.x );
  vec3 nW0 = inverseTransformDirection( gGeoN, viewMatrix );
  vec3 nW = normalize( nW0 - ac * ( dh.x * side ) - al * dh.y );
  vec3 nFlat = normal;
  normal = normalize( normal + ( viewMatrix * vec4( nW - nW0, 0.0 ) ).xyz );
  // (the sky lights a hollow mostly from above: a wall facing the bright horizon sees the opposite
  // wall, not the horizon - the sun alone picks out the relief, the sky only a little)
  gTrkBent = normalize( mix( normal, nFlat, 0.6 ) );
  // the low sun: does the wall between here and the sun hide it? (a march along the sun's way)
  vec3 sW = normalize( uSunW );
  float sl = max( length( sW.xz ), 1e-3 );
  vec2 sd = vec2( dot( sW.xz, ac.xz ) * side, dot( sW.xz, al.xz ) ) / sl;
  float tanE = max( sW.y / sl, 0.05 );
  float hc = trkH( p, 0.0, 0.0, dd );
  float reach = clamp( D * 1.45 / tanE, 0.03, 0.45 );
  float occ = - 1.0;
  for ( int k = 1; k <= 7; k ++ ) {
    float t = reach * float( k ) / 7.0;
    occ = max( occ, trkH( p + sd * t, 0.0, 0.0, dd ) - hc - t * tanE );
  }
  float sh = 1.0 - smoothstep( - 0.0015, 0.004, occ );
  // (a print a few pixels big: its shade as a tone, not a flickering pattern)
  float deep = clamp( - hc / D, 0.0, 1.0 );
  sh = mix( sh, 1.0 - 0.45 * deep, smoothstep( 0.012, 0.035, fw ) );
  gTrkSh = sh;
  gTrkAO = 1.0 - 0.15 * deep;   // (the sunlit walls light the shaded bottom: snow is white)
  // the bottom is pressed snow: a touch greyer and smoother
  float floorK = clamp( - h0 / D, 0.0, 1.0 );
  diffuseColor.rgb *= 1.0 - 0.05 * floorK;
  roughnessFactor = clamp( roughnessFactor * ( 1.0 - 0.25 * floorK ), 0.05, 1.0 );
  float edgeA = rut < 0.5 ? 1.0 - smoothstep( 0.0, 0.034, d ) : 1.0 - smoothstep( 0.008, ${BERM.toFixed(3)}, d );
  float fill = vTrkC.y;
  diffuseColor.a = edgeA * vTrkC.x * ( 1.0 - fill * fill ) * ( 1.0 - smoothstep( 90.0, 140.0, gDist ) );
  if ( diffuseColor.a < 0.004 ) discard;
}
`;
const FRAG_DIRECT = `
void RE_Direct_Trk( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  IncidentLight l = directLight;
  l.color *= gTrkSh;
  RE_Direct_Game( l, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
}
#undef RE_Direct
#define RE_Direct RE_Direct_Trk
`;

const U = { uTrk: { value: new THREE.Vector4(0, 0, FEET[0], FEET[1]) }, uTrkT: { value: 0 } };
const UR = { uTrk: { value: new THREE.Vector4(0, 0, SEGS[0], SEGS[1]) }, uTrkT: U.uTrkT };

function trackMaterial(foot) {
  const m = surfaceMaterial('snow', { unique: true });
  const base = m.onBeforeCompile, baseKey = m.customProgramCacheKey;
  m.vertexColors = false;
  m.color.set(0xf3f4f5);           // the 'snow' surface's own colour
  m.transparent = true;
  m.depthWrite = false;
  m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -4;
  m.defines = { ...m.defines, [foot ? 'TRK_FOOT' : 'TRK_RUT']: 1 };
  const uni = foot ? U : UR;
  const swap = (s, a, b) => { if (!s.includes(a)) console.error('tracks: shader chunk not found', a); return s.replace(a, b); };
  m.onBeforeCompile = function (shader) {
    base.call(this, shader);
    shader.uniforms.uTrk = uni.uTrk; shader.uniforms.uTrkT = uni.uTrkT;
    let v = shader.vertexShader;
    v = swap(v, '#include <common>', '#include <common>\n' + VERT_PARS);
    v = swap(v, '#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + VERT_NORMAL);
    v = swap(v, '#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BEGIN);
    v = swap(v, '#include <project_vertex>', VERT_TRI + '#include <project_vertex>');
    shader.vertexShader = v;
    let f = shader.fragmentShader;
    f = swap(f, '#define GAME_SURF 1', '#define GAME_SURF 1\n' + FRAG_PARS);
    f = swap(f, '#include <clearcoat_normal_fragment_begin>', FRAG_MAIN + '#include <clearcoat_normal_fragment_begin>');
    f = swap(f, '#define RE_Direct RE_Direct_Game\n#endif', '#define RE_Direct RE_Direct_Game\n#endif\n' + FRAG_DIRECT);
    f = swap(f, '#include <lights_fragment_maps>', 'geometryNormal = gTrkBent;\n#include <lights_fragment_maps>');
    f = swap(f, '#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= gTrkAO;');
    shader.fragmentShader = f;
  };
  m.customProgramCacheKey = () => 'trk1' + (foot ? 'f' : 'r') + baseKey();
  m.name = foot ? 'tracks:feet' : 'tracks:ruts';
  return m;
}

// ---------------------------------------------------------------------------------------------
// Rings and buffers

class Ring {
  constructor(start, n) { this.start = start; this.n = n; this.made = 0; }
  take() { return this.start + (this.made++ % this.n); }
  alive(serial) { return serial >= 0 && this.made - serial <= this.n; }
}

// Dirty element ranges, uploaded once per frame (merged).
class Dirty {
  constructor() { this.set = new Set(); }
  add(i) { this.set.add(i); }
  flush(attrs, per) {
    if (!this.set.size) return;
    const ids = [...this.set].sort((a, b) => a - b);
    this.set.clear();
    for (const a of attrs) a.clearUpdateRanges();
    let s = ids[0], e = s;
    const push = () => { for (const a of attrs) a.addUpdateRange(s * per * a.itemSize, (e - s + 1) * per * a.itemSize); };
    for (let k = 1; k < ids.length; k++) {
      if (ids[k] <= e + 1) { e = ids[k]; continue; }
      push(); s = e = ids[k];
    }
    push();
    for (const a of attrs) a.needsUpdate = true;
  }
}

let feetMesh = null, rutMesh = null;
let FA = null, RA = null;          // attribute arrays
const footRings = [new Ring(0, FEET[0]), new Ring(FEET[0], FEET[1])];
const rutRings = [new Ring(0, SEGS[0]), new Ring(SEGS[0], SEGS[1])];
const footDirty = new Dirty(), rutDirty = new Dirty();
let gen = 1;                       // bumped by clear(): every trail starts afresh

// ---------------------------------------------------------------------------------------------
// The ground

const _snow = { y: 0, flat: true, nx: 0, ny: 1, nz: 0 };
// The visible snow under (x, z) for someone or something at height y: its height (out.y), whether it
// is the town's flat ground (out.flat) and its normal; false where it is not snow, or where y stands
// on something else (a bench, a step, a car roof).
function snowAt(x, z, y, out = _snow, slope = true) {
  // (ice counts as snow for the tyres' grip, not here)
  if (surfaceAt(x, z) !== 'snow' || surfaceHit.raw === 'ice') return false;
  const sy = surfaceHit.y;
  const g = groundAt(x, z, y + 0.3, 0.5);
  const b = groundInfo.block;
  if (b && b.shape !== HILL) return false;
  if (y > g + 0.6) return false;
  // (a lawn's quad lies a centimetre or two over the collision ground; a snow hill rises out of it,
  // and a snow bank registers at 1 m: then the collision ground is the snow under the feet)
  const flat = !b && Math.abs(x) < OFF_TOWN && Math.abs(z) < OFF_TOWN;
  out.flat = flat;
  out.y = (sy !== null && sy >= g - 0.01 && sy < g + 0.06 ? sy : g) + (b ? 0.012 : LIFT);
  out.nx = 0; out.ny = 1; out.nz = 0;
  if (!flat && slope) {
    const e = 0.25;
    const hx0 = groundAt(x - e, z, out.y + 0.5, 0.6), hx1 = groundAt(x + e, z, out.y + 0.5, 0.6);
    const hz0 = groundAt(x, z - e, out.y + 0.5, 0.6), hz1 = groundAt(x, z + e, out.y + 0.5, 0.6);
    const sx = (hx1 - hx0) / (2 * e), sz = (hz1 - hz0) / (2 * e), l = Math.hypot(sx, 1, sz);
    out.nx = -sx / l; out.ny = 1 / l; out.nz = -sz / l;
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// Footprints

const SHOE = { winter: [1.08, 1.14, 0], boots: [1.03, 1.02, 0], tall: [1.03, 1.02, 0], sneakers: [1, 1.06, 1], shoes: [1, 1, 2] };
const _v = new THREE.Vector3(), _d = new THREE.Vector3();
const _g = { y: 0, flat: true, nx: 0, ny: 1, nz: 0 };

function print(x, z, y, yaw, L, W, depth, side, style, ring) {
  if (!snowAt(x, z, y, _g)) return false;
  const R = footRings[ring];
  const i = R.take(), serial = R.made - 1;
  const ny = Math.max(_g.ny, 0.3), sx = -_g.nx / ny, sz = -_g.nz / ny;
  FA.iP.array.set([x, _g.y + (_g.flat ? 0 : 0.008), z, yaw], i * 4);
  FA.iS.array.set([L, W, depth, side], i * 4);
  FA.iQ.array.set([sx, sz, style, 0], i * 4);
  FA.iR.array.set([serial, ring, U.uTrkT.value, fillRate()], i * 4);
  footDirty.add(i);
  return true;
}

// The blizzard out in the cold fills new tracks in within ~40 s; the finale's snowfall in ~7 min.
function fillRate() { return (fx.blowAmount || 0) / 40 + (fx.snowAmount || 0) / 420; }

// One foot of a person, where its bone stands now (models.js: the foot bone sits at the ankle, the
// sole runs from 0.24 L behind it to 0.76 L ahead, turned out 0.1 rad).
function stampFoot(ch, i, ring) {
  const m = ch.model, f = m.feet?.[i], D = m.D;
  if (!f || !D) return;
  const sh = SHOE[m.d?.shoes?.type] || SHOE.shoes;
  const L = D.footLen * sh[0] + 0.012, k = L / 0.27;
  const W = 2 * (0.0483 * k * sh[1] + 0.003) + 0.006;
  const side = i ? 1 : -1, a = side * 0.1;
  f.updateWorldMatrix(true, false);
  _v.set(Math.sin(a) * 0.26 * L, -D.ankleY, Math.cos(a) * 0.26 * L).applyMatrix4(f.matrixWorld);
  _d.set(Math.sin(a), 0, Math.cos(a)).transformDirection(f.matrixWorld);
  const yaw = Math.atan2(_d.x, _d.z);
  const depth = 0.022 * (D.H || 1.7) * (ch.speed > 4 ? 1.15 : 1);
  print(_v.x, _v.z, ch.y, yaw, L, W, depth, side, sh[2], ring);
}

// A person's steps: a print as each leg's phase passes STAMP_U, both feet on a landing.
function walker(ch, ring) {
  const m = ch.model;
  const st = ch._trk || (ch._trk = { ph: m.phase || 0, ground: ch.onGround });
  const ph = m.phase || 0, a = st.ph / TAU, b = ph / TAU;
  st.ph = ph;
  const ok = ch.state === 'normal' && !ch.offstage && !ch.floats;
  const landed = ch.onGround && !st.ground;
  st.ground = ch.onGround;
  if (!ok || !ch.onGround) return;
  if (landed) { stampFoot(ch, 0, ring); stampFoot(ch, 1, ring); return; }
  if (!(b > a) || b - a > 1 || ch.speed < 0.2) return;
  for (let i = 0; i < 2; i++) {
    const c = STAMP_U - 0.5 * i;
    if (Math.floor(b - c) > Math.floor(a - c)) stampFoot(ch, i, ring);
  }
}

// ---------------------------------------------------------------------------------------------
// Ruts

// A wheel's trail: its last committed point p0, the open segment (stretched to the wheel every frame
// until it is SEG long), the last committed segment (its end edge is mitred to the next one).
class Trail {
  constructor() { this.p0 = null; this.seg = -1; this.serial = -1; this.prev = null; this.ring = 0; this.gen = gen; }
  end() { this.p0 = null; this.seg = -1; this.prev = null; }
}
const pt = (x, z, g, v, hw, smear) => ({ x, z, y: g.y, flat: g.flat, nx: g.nx, ny: g.ny, nz: g.nz, v, hw, smear });

// The two vertices of one end of segment k (end 0: its start, 1: its end) at point P, across the
// direction (jx, jz) stretched by js (a mitred joint).
const _e = { y: 0, flat: true, nx: 0, ny: 1, nz: 0 };
function rutEnd(k, end, P, jx, jz, js, tr, serial, birth, rate) {
  const ax = jz, az = -jx, R = P.hw + BERM, ring = tr.ring;
  for (let s = 0; s < 2; s++) {
    const sg = s ? -1 : 1, vi = k * 4 + end * 2 + s;
    const ex = P.x + ax * R * js * sg, ez = P.z + az * R * js * sg;
    let ey = P.y;
    if (!P.flat && snowAt(ex, ez, P.y, _e, false)) ey = _e.y;
    RA.pos.array.set([ex, ey, ez], vi * 3);
    RA.nrm.array.set([P.nx, P.ny, P.nz], vi * 3);
    RA.aA.array.set([sg * R, P.v, jx, jz], vi * 4);
    RA.aB.array.set([P.hw, tr.depth, P.smear, tr.style], vi * 4);
    RA.aC.array.set([serial, ring, birth, rate], vi * 4);
  }
  rutDirty.add(k);
}

// The wheel of a trail is at (x, z) (y: the height it rolls at); hw its half width, heading its yaw
// (for the smear of a tyre sliding sideways; null: it rolls where it points, like a caster).
function roll(tr, x, z, y, hw, heading, ring) {
  if (tr.gen !== gen || tr.ring !== ring) { tr.end(); tr.gen = gen; tr.ring = ring; }
  if (!snowAt(x, z, y, _g)) { tr.end(); return; }
  const p0 = tr.p0;
  if (!p0) { tr.p0 = pt(x, z, _g, 0, hw, 0); return; }
  const dx = x - p0.x, dz = z - p0.z, d = Math.hypot(dx, dz);
  if (d > 3) { tr.end(); tr.p0 = pt(x, z, _g, 0, hw, 0); return; }   // a jump (placed elsewhere)
  if (d < 0.015) return;
  const ux = dx / d, uz = dz / d;
  // a tyre sliding sideways smears a band as wide as its contact patch is long across the way it goes
  let smear = 0, hwe = hw;
  if (heading !== null) {
    const s = Math.abs(Math.sin(heading) * uz - Math.cos(heading) * ux);
    smear = Math.min(1, s * 2.5);
    hwe = Math.max(hw, hw * Math.sqrt(1 - s * s) + 0.1 * s);
  }
  const R = rutRings[ring];
  if (tr.seg < 0 || !R.alive(tr.serial)) { tr.seg = R.take(); tr.serial = R.made - 1; tr.birth = U.uTrkT.value; tr.rate = fillRate(); }
  // the joint at p0: mitred between the last segment's way and this one's
  let jx = ux, jz = uz, js = 1;
  const pv = tr.prev;
  if (pv && R.alive(pv.serial)) {
    const mx = pv.ux + ux, mz = pv.uz + uz, ml = Math.hypot(mx, mz);
    if (ml > 0.6) {
      jx = mx / ml; jz = mz / ml; js = 1 / Math.max(0.6, jx * ux + jz * uz);
      rutEnd(pv.k, 1, p0, jx, jz, js, tr, pv.serial, pv.birth, pv.rate);
    }
  }
  const P1 = pt(x, z, _g, p0.v + d, hwe, smear);
  rutEnd(tr.seg, 0, p0, jx, jz, js, tr, tr.serial, tr.birth, tr.rate);
  rutEnd(tr.seg, 1, P1, ux, uz, 1, tr, tr.serial, tr.birth, tr.rate);
  // committed once it is long enough, or sooner in a tight turn
  const turned = pv ? 1 - (pv.ux * ux + pv.uz * uz) : 0;
  if (d >= SEG || (d > 0.15 && turned > 0.008)) {
    tr.prev = { k: tr.seg, serial: tr.serial, birth: tr.birth, rate: tr.rate, ux, uz };
    tr.p0 = P1;
    tr.seg = -1; tr.serial = -1;
  }
}

const trailsOf = (o, n) => {
  let t = o._trkW;
  if (!t || t.length !== n) { t = o._trkW = []; for (let i = 0; i < n; i++) t.push(new Trail()); }
  return t;
};
const endAll = (o) => { if (o._trkW) for (const t of o._trkW) t.end(); };

const TRAILER_W = { x: 0.83, w: 0.155 };
function car(c, ring) {
  const m = c.model, ws = c.wheels;
  if (!m || !ws?.length) return;
  const tr = trailsOf(c, ws.length);
  if (c.air || c.flight) { for (const t of tr) t.end(); if (c.trailer) endAll(c.trailer); return; }
  const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
  const tractor = c.kind === 'tractor';
  const style = tractor ? 2 : 0, depth = tractor ? 0.07 : 0.055;
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i], t = tr[i];
    t.style = style; t.depth = depth;
    const x = c.x + w.x * cs + w.z * sn, z = c.z - w.x * sn + w.z * cs;
    const hw = (w.ww ?? m.ww ?? 0.19) / 2;
    roll(t, x, z, c.y, hw, c.yaw + (w.front ? -(c.steerShow || 0) : 0), ring);
  }
  const T = c.trailer;
  if (T) {
    const tt = trailsOf(T, 2);
    if (T.air) { for (const t of tt) t.end(); return; }
    const tc = Math.cos(T.yaw), ts = Math.sin(T.yaw);
    for (let i = 0; i < 2; i++) {
      const t = tt[i], s = i ? 1 : -1;
      t.style = 0; t.depth = 0.045;
      roll(t, T.x + s * TRAILER_W.x * tc, T.z - s * TRAILER_W.x * ts, T.y ?? c.y, TRAILER_W.w / 2, T.yaw, ring);
    }
  }
}

// Rune's wheelchair: the big wheels behind (models.js: x ±0.3, z -0.07) and the casters in front.
const CHAIR = [[-0.3, -0.07, 0.017, true], [0.3, -0.07, 0.017, true], [-0.21, 0.32, 0.014, false], [0.21, 0.32, 0.014, false]];
function chair(ch, ring) {
  const tr = trailsOf(ch, 4);
  if (ch.state !== 'normal' && ch.state !== 'frozen' || ch.topple || ch.offstage || !ch.onGround) { for (const t of tr) t.end(); return; }
  const cs = Math.cos(ch.yaw), sn = Math.sin(ch.yaw);
  for (let i = 0; i < 4; i++) {
    const [lx, lz, hw, big] = CHAIR[i], t = tr[i];
    t.style = 1; t.depth = big ? 0.03 : 0.02;
    roll(t, ch.x + lx * cs + lz * sn, ch.z - lx * sn + lz * cs, ch.y, hw, big ? ch.yaw : null, ring);
  }
}

// ---------------------------------------------------------------------------------------------

export const tracks = {
  on: true,
  init(scene) {
    if (typeof location !== 'undefined' && /[?&]notracks\b/.test(location.search)) this.on = false;
    // footprints: one quad per print (InstancedBufferGeometry on a plain mesh, like fx.js' puffs)
    const NF = FEET[0] + FEET[1];
    const fg = new THREE.InstancedBufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0.5, 0, -0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5]), 3));
    fg.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
    fg.setIndex([0, 1, 2, 1, 3, 2]);
    FA = {};
    for (const k of ['iP', 'iS', 'iQ', 'iR']) {
      FA[k] = new THREE.InstancedBufferAttribute(new Float32Array(NF * 4), 4).setUsage(THREE.DynamicDrawUsage);
      fg.setAttribute(k, FA[k]);
    }
    fg.instanceCount = NF;
    fg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    feetMesh = new THREE.Mesh(fg, trackMaterial(true));
    // ruts: four vertices per segment, two triangles, in ring order
    const NS = SEGS[0] + SEGS[1], NV = NS * 4;
    const rg = new THREE.BufferGeometry();
    RA = {
      pos: new THREE.BufferAttribute(new Float32Array(NV * 3), 3), nrm: new THREE.BufferAttribute(new Float32Array(NV * 3), 3),
      aA: new THREE.BufferAttribute(new Float32Array(NV * 4), 4), aB: new THREE.BufferAttribute(new Float32Array(NV * 4), 4), aC: new THREE.BufferAttribute(new Float32Array(NV * 4), 4),
    };
    for (const a of Object.values(RA)) a.setUsage(THREE.DynamicDrawUsage);
    rg.setAttribute('position', RA.pos); rg.setAttribute('normal', RA.nrm);
    rg.setAttribute('aA', RA.aA); rg.setAttribute('aB', RA.aB); rg.setAttribute('aC', RA.aC);
    const idx = new Uint32Array(NS * 6);
    for (let k = 0; k < NS; k++) idx.set([k * 4, k * 4 + 1, k * 4 + 2, k * 4 + 1, k * 4 + 3, k * 4 + 2], k * 6);
    rg.setIndex(new THREE.BufferAttribute(idx, 1));
    rg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    rutMesh = new THREE.Mesh(rg, trackMaterial(false));
    for (const [mesh, order] of [[rutMesh, 1.05], [feetMesh, 1.1]]) {
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.renderOrder = order;           // after the ground, with the skid marks, before glass and puffs
      mesh.userData.noAO = true;          // no shadow, no AO pre-pass
      mesh.matrixAutoUpdate = false;
      mesh.name = order > 1.07 ? 'tracks:feet' : 'tracks:ruts';
      scene.add(mesh);
    }
    this.clear();
  },

  // Everything gone: a new day.
  clear() {
    if (!FA) return;
    FA.iS.array.fill(0);
    for (const a of Object.values(FA)) { a.clearUpdateRanges(); a.needsUpdate = true; }
    RA.pos.array.fill(0);
    for (const a of Object.values(RA)) { a.clearUpdateRanges(); a.needsUpdate = true; }
    footDirty.set.clear(); rutDirty.set.clear();
    for (const r of [...footRings, ...rutRings]) r.made = 0;
    gen++;
    this.sync();
  },

  sync() {
    U.uTrk.value.set(footRings[0].made, footRings[1].made, FEET[0], FEET[1]);
    UR.uTrk.value.set(rutRings[0].made, rutRings[1].made, SEGS[0], SEGS[1]);
  },

  update(g, dt) {
    if (!this.on || !FA) return;
    U.uTrkT.value += dt;
    const cp = camera.position, cx = cp.x, cz = cp.z;
    const near = (x, z, r) => (x - cx) * (x - cx) + (z - cz) * (z - cz) < r * r;
    // people
    const p = g.player;
    if (p && !g.playerCar) walker(p, 0);
    else if (p?._trk) p._trk.ground = false;
    const person = (ch) => {
      if (!near(ch.x, ch.z, NEAR_PPL)) { if (ch._trk) ch._trk.ph = ch.model.phase || 0; if (ch._trkW) endAll(ch); return; }
      if (ch.wheelchair) chair(ch, 1);
      else walker(ch, 1);
    };
    for (const ped of g.peds || []) person(ped.char);
    for (const k in g.npcs || {}) person(g.npcs[k]);
    // wheels
    for (const c of g.cars || []) {
      const own = c === g.playerCar;
      if (!own && (c.asleep || !near(c.x, c.z, NEAR_CAR))) { if (c._trkW && !c.asleep) { endAll(c); if (c.trailer) endAll(c.trailer); } continue; }
      // (nothing to do for a car standing still)
      const lx = c._trkX, lz = c._trkZ;
      if (lx !== undefined && Math.abs(c.x - lx) + Math.abs(c.z - lz) < 0.005 && !(c.trailer && !c.trailer.air && c._trkTY !== c.trailer.yaw)) continue;
      c._trkX = c.x; c._trkZ = c.z; c._trkTY = c.trailer?.yaw;
      car(c, own ? 0 : 1);
    }
    footDirty.flush(Object.values(FA), 1);
    rutDirty.flush(Object.values(RA), 4);
    this.sync();
  },

  // For tests: how many prints and segments are alive, and the trails being drawn.
  stats() {
    const live = (r) => Math.min(r.made, r.n);
    return { feet: footRings.map(live), ruts: rutRings.map(live), made: { feet: footRings.map((r) => r.made), ruts: rutRings.map((r) => r.made) }, gen };
  },
  // The prints of a ring (0: Ove's), oldest first: [{ x, y, z, yaw, L, W, depth, side, style, rate }].
  feetList(ring = 0) {
    const R = footRings[ring], out = [];
    const n = Math.min(R.made, R.n);
    for (let s = R.made - n; s < R.made; s++) {
      const i = R.start + (s % R.n), P = FA.iP.array, S = FA.iS.array, Q = FA.iQ.array, Rr = FA.iR.array;
      if (S[i * 4] <= 0) continue;
      out.push({ x: P[i * 4], y: P[i * 4 + 1], z: P[i * 4 + 2], yaw: P[i * 4 + 3], L: S[i * 4], W: S[i * 4 + 1], depth: S[i * 4 + 2], side: S[i * 4 + 3], style: Q[i * 4 + 2], rate: Rr[i * 4 + 3] });
    }
    return out;
  },
  // The rut segments of a ring: their centres' start and end points [{ x0, z0, x1, z1, y, hw }].
  rutList(ring = 0) {
    const R = rutRings[ring], out = [], P = RA.pos.array, B = RA.aB.array;
    const n = Math.min(R.made, R.n);
    for (let s = R.made - n; s < R.made; s++) {
      const k = R.start + (s % R.n), v = k * 4;
      const x0 = (P[v * 3] + P[v * 3 + 3]) / 2, z0 = (P[v * 3 + 2] + P[v * 3 + 5]) / 2;
      const x1 = (P[v * 3 + 6] + P[v * 3 + 9]) / 2, z1 = (P[v * 3 + 8] + P[v * 3 + 11]) / 2;
      out.push({ x0, z0, x1, z1, y: P[v * 3 + 1], hw: B[v * 4] });
    }
    return out;
  },
  meshes() { return { feet: feetMesh, ruts: rutMesh }; },
  // For tests (snospar.mjs sposperf): every ring filled with tracks on the snow within r m of (x, z),
  // prints scattered, ruts in long gentle curves.
  debugFill(x, z, r = 40) {
    let made = 0;
    for (let ring = 0; ring < 2; ring++) {
      for (let k = 0, tries = 0; k < FEET[ring] && tries < FEET[ring] * 20; tries++) {
        const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * r;
        if (print(x + Math.cos(a) * d, z + Math.sin(a) * d, 0.3, Math.random() * TAU, 0.29, 0.12, 0.04, k & 1 ? 1 : -1, k % 3, ring)) k++;
      }
      const R = rutRings[ring], m0 = R.made;
      for (let tries = 0; R.made - m0 < SEGS[ring] && tries < 400; tries++) {
        const t = new Trail();
        t.style = tries % 3 === 2 ? 2 : 0; t.depth = 0.055;
        let a = Math.random() * TAU, d = Math.sqrt(Math.random()) * r;
        let px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, h = Math.random() * TAU;
        const turn = (Math.random() - 0.5) * 0.08;
        for (let s = 0; s < 120 && R.made - m0 < SEGS[ring]; s++) {
          h += turn; px += Math.sin(h) * 0.46; pz += Math.cos(h) * 0.46;
          roll(t, px, pz, 0.3, 0.1, h, ring);
        }
      }
      made += R.made - m0;
    }
    footDirty.flush(Object.values(FA), 1);
    rutDirty.flush(Object.values(RA), 4);
    this.sync();
    return this.stats();
  },
};
