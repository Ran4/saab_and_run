// Rendering foundation: a physically based, realistic winter-morning look.
//
//  - WebGLRenderer -> EffectComposer (HalfFloat, 4x MSAA) -> bloom -> OutputPass (ACES Filmic, a
//    small saturation/S-curve grade, sRGB).
//  - Lighting: a low warm SunLight (two cascaded shadow maps) + image-based light from a CC0 winter
//    HDRI (sun clamped out of it, the SunLight provides that), drawn as the sky with the HDRI's sun
//    warped onto the SunLight's direction. Height fog (+ a thin far haze) tinted warm towards the sun.
//  - Screen-space AO (GTAO) computed in a pre-pass and applied to *indirect* light only, inside every
//    MeshStandard/MeshPhysical material, so sunlit faces are not greyed out.
//  - SURFACES: GeoBuilder parts say what they are made of (g.use('wood').box(...)). Each surface is a
//    PBR material sampling real CC0 textures triplanar in part-local space, tinted by the vertex
//    colour, with automatic snow cover on upward faces, wet patches on asphalt, sparkle on snow.
// See DESIGN.md section 10 for the contract other modules rely on.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SunLight } from 'three/addons/lights/SunLight.js';
import { SunLightShadow } from 'three/addons/lights/SunLightShadow.js';

export { THREE };
export let renderer, scene, camera, sun, hemi, composer;
export const MAT = {};

const PARAMS = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const ASSETS = new URL('../assets/', import.meta.url).href;

// ---------------------------------------------------------------------------------------------
// Sun & sky constants. The sky HDRI's own sun is warped onto this direction.

const SKY = {
  hdri: PARAMS.get('hdri') || 'passendorf_snow_2k',
  sunElev: THREE.MathUtils.degToRad(+(PARAMS.get('sunelev') || 13)),
  sunAz: THREE.MathUtils.degToRad(+(PARAMS.get('sunaz') || 143)), // world azimuth: dir = (sin az, ., cos az)
  exposure: +(PARAMS.get('exposure') || 1.45),
  sunIntensity: +(PARAMS.get('sunint') || 6.0),
  // Low-sun colour (linear RGB). The HDRI's own sun is too neutral for a 13-degree November sun.
  sunColor: (PARAMS.get('suncol') || '1.0,0.80,0.58').split(',').map(Number),
  envIntensity: +(PARAMS.get('envint') || 0.62),
  envSaturation: +(PARAMS.get('envsat') || 0.55),
  // The HDRI's skylight is slightly lilac and its sky is blue already: only a hint of extra cold, so
  // shade reads blue-grey rather than violet (the warm sun does the rest of the contrast).
  envTint: (PARAMS.get('envtint') || '0.97,1.0,1.02').split(',').map(Number),
  fogDensity: +(PARAMS.get('fog') || 0.0012),       // plain exp2 term (far haze)
  hfogDensity: +(PARAMS.get('hfog') || 0.0016),     // height fog: density at the ground (was 0.0022: a milky floor on everything 10-30 m away)...
  hfogHeight: +(PARAMS.get('hfogh') || 35),         // ...falling off by 1/e every this many metres
  saturation: +(PARAMS.get('sat') || 1.0),         // display grade after tone mapping
  contrast: +(PARAMS.get('contrast') ?? 0.22),      // S-curve strength (0 = none), upper half only
  toe: +(PARAMS.get('toe') || 0.86),                // toe lift: display-linear ^ toe (1 = plain ACES)
  black: +(PARAMS.get('black') ?? 0.03),            // soft black point: x^2 / (x + black), rescaled (deep blacks)
  shadowSat: +(PARAMS.get('sdesat') ?? 0.65),       // saturation of the darkest tones (x saturation)
};
export const SUN_DIR = new THREE.Vector3(Math.sin(SKY.sunAz) * Math.cos(SKY.sunElev), Math.sin(SKY.sunElev), Math.cos(SKY.sunAz) * Math.cos(SKY.sunElev)).normalize();

// Fog amount for a view ray: height fog of density HFOG_D at y <= 0, falling off as exp(-y / HFOG_H),
// integrated analytically from the camera to the point, plus a thin exp2 haze (exp2Density) that
// also thins with the ray's mean altitude (scale height 250 m), so aerial views stay clear.
// rel = point - camera (world). Custom shaders (particles) include this string.
export const FOG_GLSL = `
float gameFogAmount( vec3 camPos, vec3 rel, float exp2Density ) {
  float dist = length( rel );
  float cy = max( camPos.y, 0.0 ), py = max( camPos.y + rel.y, 0.0 ), dy = py - cy;
  float eC = exp( - cy / ${SKY.hfogHeight.toFixed(3)} ), eP = exp( - py / ${SKY.hfogHeight.toFixed(3)} );
  float od = abs( dy ) > 0.05 ? ${(SKY.hfogDensity * SKY.hfogHeight).toFixed(6)} * dist * ( eC - eP ) / dy : ${SKY.hfogDensity.toFixed(6)} * dist * eC;
  float e2 = exp2Density * dist * exp( - ( cy + py ) * 0.5 / 250.0 ); // the far haze thins with altitude too
  return 1.0 - exp( - od - e2 * e2 );
}`;

// Shared uniforms (same objects referenced by every surface material).
const G = {
  uSnow: { value: 1.0 },                 // global snow amount 0..1 (setSnow)
  uWet: { value: 0.6 },                  // global wetness of asphalt (setWetness)
  // Street grid for wheel tracks / damp kerbs on asphalt (setRoadGrid): pitch, centre-line offset,
  // asphalt half-width, lane-centre offset; and the extent of the grid. Matches world/layout.js.
  uRoad: { value: new THREE.Vector4(80, 40, 5.5, 2.75) },
  uRoadExt: { value: 285.5 },
  uTime: { value: 0 },
  uSunW: { value: SUN_DIR.clone() },
  tSnowA: { value: null }, tSnowN: { value: null },
  tSSAO: { value: null }, uSSAO: { value: new THREE.Vector3(1, 1, 0) }, // xy = 1/size, z = strength (0 outside the main pass)
  uShadowLow: { value: 0 },              // 1 = 4-tap shadow PCF (low quality)
};
// Lighting summary for custom shaders (particles, markers): updated once the sky is loaded.
export const LIGHTING = {
  sunDir: SUN_DIR, sunColor: new THREE.Color(...SKY.sunColor).multiplyScalar(SKY.sunIntensity),
  sky: new THREE.Color(0.55, 0.62, 0.72), ground: new THREE.Color(0.6, 0.6, 0.62), fog: new THREE.Color(0.62, 0.62, 0.64),
  fogExp2: SKY.fogDensity, // the exp2 haze density to pass to gameFogAmount() (FOG_GLSL)
};

// ---------------------------------------------------------------------------------------------
// Quality. setQuality('auto' | 'high' | 'low'), getQuality() -> the setting, qualityInfo() -> what
// actually runs (tier, render scale, GPU). Two tiers:
//  high: GTAO (its normal/depth pre-pass only within AO_FAR), bloom, 4x MSAA, 2048 shadow maps with
//        16-tap PCF, the far cascade re-rendered every 2nd frame.
//  low:  no AO and no bloom (a shadow-only pre-pass), no MSAA, 1024 shadow maps with 4-tap PCF, the
//        far cascade every 3rd frame.
// 'auto' (the default outside tests) picks low on integrated GPUs and drops to low when frames stay
// over 20 ms in the first seconds; 'auto' and 'low' also scale the render resolution (0.6-1.0 of the
// pixel ratio, which is capped at 1 device pixel per CSS pixel; `&pr=1.5` raises the cap) with the
// frame time. 'high' is always full resolution. Tests (?test) default to 'high' without the
// dynamic scale (deterministic shots); `&q=auto|high|low`, `?lowgfx` (= low), `&dynscale` override.

const QSET = {
  high: { ao: true, bloom: true, msaa: 4, shadow: 2048, pcfLow: 0, farEvery: 2, scaleMin: 0.7 },
  low: { ao: false, bloom: false, msaa: 0, shadow: 1024, pcfLow: 1, farEvery: 3, scaleMin: 0.6 },
};
const TEST = PARAMS.has('test');
const QSETTINGS = ['auto', 'high', 'low'];
const QUALITY = {
  setting: QSETTINGS.includes(PARAMS.get('q')) ? PARAMS.get('q') : PARAMS.has('lowgfx') ? 'low' : TEST ? 'high' : 'auto',
  autoTier: 'high',   // what 'auto' runs: low on integrated GPUs or after the slow-start check
  tier: 'high',       // what runs now
  scale: 1,           // render scale (x the capped pixel ratio)
  prCap: 1,          // device pixels per CSS pixel at most (`&pr=x` forces x, for tests)
  dyn: !TEST || PARAMS.has('dynscale'),
  gpu: '', integrated: false, reason: 'default',
};
const tierOf = () => (QUALITY.setting === 'auto' ? QUALITY.autoTier : QUALITY.setting);
export function getQuality() { return QUALITY.setting; }
export function qualityInfo() {
  return { setting: QUALITY.setting, tier: QUALITY.tier, scale: QUALITY.scale, pixelRatio: renderer ? +renderer.getPixelRatio().toFixed(3) : 0, gpu: QUALITY.gpu, integrated: QUALITY.integrated, reason: QUALITY.reason };
}

// ---------------------------------------------------------------------------------------------
// Cascaded sun shadow with fixed splits: a crisp near cascade around the player, a coarse far one.

// `nearOnly` (set by the shadow pre-pass on most frames): only the near cascade is fitted and
// re-rendered; the far one keeps its map and matrix from the last full update (the sun does not move,
// the far cascade covers 30-210 m, so moving things there update at 30 or 20 Hz).
class GameSunShadow extends SunLightShadow {
  constructor() { super(); this.split = 30; this.far = 210; this.nearOnly = false; }
  getViewportCount() { return this.nearOnly ? 1 : this._viewportCount; }
}
// Same fitting maths as SunLightShadow.updateMatrices, but with fixed split distances.
const _lo = new THREE.Matrix4(), _v2l = new THREE.Matrix4(), _ld = new THREE.Vector3(), _up = new THREE.Vector3(), _c = new THREE.Vector3();
const _nc = [0, 1, 2, 3].map(() => new THREE.Vector3()), _fc = [0, 1, 2, 3].map(() => new THREE.Vector3()), _cc = [0, 1, 2, 3, 4, 5, 6, 7].map(() => new THREE.Vector3());
GameSunShadow.prototype.updateMatrices = function (light, viewCamera) {
  if (viewCamera === undefined) return;
  const N = 2, FADE = 0.12;
  const insetX = Math.min(0.25, (Math.ceil(this.radius) + 1) / this.mapSize.x), insetY = Math.min(0.25, (Math.ceil(this.radius) + 1) / this.mapSize.y);
  for (let i = 0; i < N; i++) this._viewports[i].set(i + insetX, insetY, 1 - 2 * insetX, 1 - 2 * insetY);
  const resX = this.mapSize.x * (1 - 2 * insetX), resY = this.mapSize.y * (1 - 2 * insetY), res = Math.min(resX, resY);
  const near = viewCamera.near, far = Math.max(near + 1e-3, Math.min(this.far, viewCamera.far));
  const splits = this._cascadeSplits;
  splits[0] = near; splits[1] = Math.min(this.split, far * 0.5); splits[2] = far;
  _ld.setFromMatrixPosition(light.matrixWorld).negate().normalize();
  _up.set(0, 1, 0);
  if (Math.abs(_up.dot(_ld)) > 0.99) _up.set(0, 0, 1);
  _lo.lookAt(_c.set(0, 0, 0), _ld, _up);
  _v2l.copy(_lo).transpose().multiply(viewCamera.matrixWorld);
  const inv = viewCamera.projectionMatrixInverse;
  let maxZ = -Infinity;
  for (let i = 0; i < 4; i++) {
    const x = i === 0 || i === 1 ? 1 : -1, y = i === 0 || i === 3 ? 1 : -1;
    const nc = _nc[i].set(x, y, -1).applyMatrix4(inv);
    _fc[i].copy(nc).multiplyScalar(far / near);
    nc.applyMatrix4(_v2l); _fc[i].applyMatrix4(_v2l);
    maxZ = Math.max(maxZ, nc.z, _fc[i].z);
  }
  maxZ += far;
  const sNear = this.camera.near;
  const NU = this.nearOnly ? 1 : N;
  for (let i = 0; i < NU; i++) {
    const cNear = i === 0 ? splits[0] : this._cascadeData[i - 1].z;
    const cFar = splits[i + 1];
    const fadeStart = cFar - FADE * (cFar - splits[i]);
    this._cascadeData[i].set(i === 0 ? -1e10 : cNear, cFar, fadeStart, 0);
    const a0 = (cNear - near) / (far - near), a1 = (cFar - near) / (far - near);
    _c.set(0, 0, 0);
    for (let j = 0; j < 4; j++) {
      _cc[j * 2].lerpVectors(_nc[j], _fc[j], a0);
      _cc[j * 2 + 1].lerpVectors(_nc[j], _fc[j], a1);
      _c.add(_cc[j * 2]).add(_cc[j * 2 + 1]);
    }
    _c.multiplyScalar(1 / 8);
    let r2 = 0, minZ = Infinity;
    for (let j = 0; j < 8; j++) { r2 = Math.max(r2, _cc[j].distanceToSquared(_c)); minZ = Math.min(minZ, _cc[j].z); }
    let radius = Math.sqrt(r2);
    // Round the radius up to a coarse step so the texel size (and the snapping grid) stays stable
    // while the FOV breathes with speed.
    radius = Math.ceil(radius / 4) * 4;
    radius /= 1 - 1 / res;
    const tx = (2 * radius) / resX, ty = (2 * radius) / resY;
    _c.x = Math.round(_c.x / tx) * tx;
    _c.y = Math.round(_c.y / ty) * ty;
    _c.z = maxZ + sNear;
    _c.applyMatrix4(_lo);
    const cc = this._cameras[i];
    cc.position.copy(_c);
    cc.quaternion.setFromRotationMatrix(_lo);
    cc.left = -radius; cc.right = radius; cc.top = radius; cc.bottom = -radius;
    cc.near = sNear; cc.far = maxZ - minZ + 2 * sNear;
    cc.coordinateSystem = this.camera.coordinateSystem;
    cc._reversedDepth = this.camera.reversedDepth;
    cc.updateProjectionMatrix();
    cc.updateMatrixWorld();
    this._updateMatrix(cc, this._matrices[i], this._frustums[i], this._viewports[i]);
  }
};

// ---------------------------------------------------------------------------------------------
// Global shader chunk patches: soft, noise-free PCF; fog tinted towards the sun.

function patchChunks() {
  const C = THREE.ShaderChunk;
  // 1) Replace the 5-tap Vogel-disk PCF (noisy without TAA) with a 4x4 grid of hardware-filtered taps.
  {
    const src = C.shadowmap_pars_fragment;
    const head = 'float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {';
    const i0 = src.indexOf(head);
    if (i0 >= 0) {
      let depth = 0, i = src.indexOf('{', i0), end = -1;
      for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } } }
      if (end > 0) {
        const body = `uniform float uShadowLow;
        ${head}
          float shadow = 1.0;
          shadowCoord.xyz /= shadowCoord.w;
          shadowCoord.z += shadowBias;
          bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
          if ( inFrustum && shadowCoord.z <= 1.0 ) {
            vec2 texel = vec2( 1.0 ) / shadowMapSize;
            float r = max( shadowRadius, 1.0 ) * 0.5;
            float s = 0.0;
            if ( uShadowLow > 0.5 ) {
              // low quality: 2x2 hardware-filtered taps
              for ( int i = 0; i < 2; i ++ ) for ( int j = 0; j < 2; j ++ ) {
                vec2 o = ( vec2( float( i ), float( j ) ) - 0.5 ) * texel * r * 1.5;
                s += texture( shadowMap, vec3( shadowCoord.xy + o, shadowCoord.z ) );
              }
              shadow = s * 0.25;
            } else {
              for ( int i = 0; i < 4; i ++ ) for ( int j = 0; j < 4; j ++ ) {
                vec2 o = ( vec2( float( i ), float( j ) ) - 1.5 ) * texel * r;
                s += texture( shadowMap, vec3( shadowCoord.xy + o, shadowCoord.z ) );
              }
              shadow = s * 0.0625;
            }
          }
          return mix( 1.0, shadow, shadowIntensity );
        }`;
        C.shadowmap_pars_fragment = src.slice(0, i0) + body + src.slice(end);
      }
    }
  }
  // 2) Fog: height fog (dense in the valley, thinning with altitude, integrated along the view ray)
  //    plus a thin exponential-squared far haze; warmer towards the sun.
  const v3 = (v) => `vec3(${v.x.toFixed(5)}, ${v.y.toFixed(5)}, ${v.z.toFixed(5)})`;
  C.fog_pars_vertex = '#ifdef USE_FOG\n varying float vFogDepth;\n varying vec3 vFogWorld;\n#endif\n';
  C.fog_vertex = '#ifdef USE_FOG\n vFogDepth = - mvPosition.z;\n vFogWorld = ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).xyz;\n#endif\n';
  C.fog_pars_fragment = `#ifdef USE_FOG
    uniform vec3 fogColor;
    varying float vFogDepth;
    varying vec3 vFogWorld;
    #ifdef FOG_EXP2
      uniform float fogDensity;
    #else
      uniform float fogNear;
      uniform float fogFar;
    #endif
    ${FOG_GLSL}
    vec3 gameFogColor( vec3 dirW ) {
      float s = pow( max( dot( dirW, ${v3(SUN_DIR)} ), 0.0 ), 5.0 );
      return fogColor * mix( vec3( 1.0 ), FOG_SUN_TINT, s );
    }
  #endif
  `;
  C.fog_fragment = `#ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = gameFogAmount( cameraPosition, vFogWorld, fogDensity );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    vec3 fogCol = gameFogColor( normalize( vFogWorld ) );
    #ifdef TRI_GLASSALPHA
      fogCol *= gl_FragColor.a;
    #endif
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, fogFactor );
  #endif
  `;
}
let FOG_SUN_TINT = new THREE.Vector3(1.35, 1.12, 0.85);
function fogTintDefine() { return `vec3(${FOG_SUN_TINT.x.toFixed(4)}, ${FOG_SUN_TINT.y.toFixed(4)}, ${FOG_SUN_TINT.z.toFixed(4)})`; }

// ---------------------------------------------------------------------------------------------
// SSAO injection into every MeshStandard/MeshPhysical material (indirect light only).

const SSAO_GLSL = `
#ifdef STANDARD
{
  // uSSAO.z is the AO exponent (0 outside the main pass -> no AO).
  float gAO = pow( max( texture2D( tSSAO, gl_FragCoord.xy * uSSAO.xy ).r, 1e-3 ), uSSAO.z );
  #if defined( GAME_SURF ) && ( defined( TRI_SNOW ) || defined( TRI_SNOWSURF ) )
    vec3 gD0 = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
  #endif
  #ifdef TRI_SKIN
    // skin scatters: its shade takes a little of its own warmth back from the cold skylight
    reflectedLight.indirectDiffuse *= vec3( 1.07, 0.985, 0.95 );
  #endif
  reflectedLight.indirectDiffuse *= gAO;
  float gNV = saturate( dot( geometryNormal, geometryViewDir ) );
  reflectedLight.indirectSpecular *= computeSpecularOcclusion( gNV, gAO, material.roughness );
  // Contact cue: a little of the AO also darkens direct light on upward-facing receivers (the
  // ground under a car, at the foot of a wall), so objects sit on the ground instead of floating.
  float gUpN = saturate( inverseTransformDirection( geometryNormal, viewMatrix ).y );
  reflectedLight.directDiffuse *= mix( 1.0, gAO, 0.25 * gUpN );
  #if defined( GAME_SURF ) && ( defined( TRI_SNOW ) || defined( TRI_SNOWSURF ) )
  { // AO takes the blue skylight and leaves the warm sun: on sunlit snow that reads as a coffee stain
    // (dirt), not shade. On snow it darkens neutrally instead, with a hint of cold in the deepest part.
    vec3 gD1 = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
    float gL0 = dot( gD0, vec3( 0.2126, 0.7152, 0.0722 ) ), gL1 = dot( gD1, vec3( 0.2126, 0.7152, 0.0722 ) );
    float gOcc = clamp( ( gL0 - gL1 ) / max( gL0, 1e-5 ) * 3.0, 0.0, 1.0 );
    vec3 gN = gD0 * ( gL1 / max( gL0, 1e-5 ) ) * mix( vec3( 1.0 ), vec3( 0.97, 0.99, 1.04 ), gOcc );
    vec3 gF = mix( vec3( 1.0 ), gN / max( gD1, vec3( 1e-5 ) ), gSnowCov * 0.85 );
    reflectedLight.directDiffuse *= gF; reflectedLight.indirectDiffuse *= gF;
  }
  #endif
  float gSM = 3.0;   // sun glints: bright, but no white smears through the bloom
  #ifdef GAME_SURF
    gSM = gSpecMax;
    reflectedLight.indirectSpecular *= uEnvSpec * gEnvMul;
    #ifdef TRI_SPECDESAT
      // damp asphalt: the reflected blue sky would tint the whole street navy; keep it greyer
      reflectedLight.indirectSpecular = mix( reflectedLight.indirectSpecular, vec3( dot( reflectedLight.indirectSpecular, vec3( 0.2126, 0.7152, 0.0722 ) ) ), TRI_SPECDESAT );
    #endif
  #endif
  reflectedLight.directSpecular = min( reflectedLight.directSpecular, vec3( gSM ) );
  #ifdef USE_CLEARCOAT
    clearcoatSpecularIndirect *= mix( 1.0, gAO, 0.4 );
    #ifdef GAME_SURF
      clearcoatSpecularIndirect *= uEnvCC * gEnvMul;
    #endif
    clearcoatSpecularDirect = min( clearcoatSpecularDirect, vec3( gSM ) );
  #endif
  #ifdef AO_VIEW
    reflectedLight.directDiffuse = vec3( 0.0 ); reflectedLight.directSpecular = vec3( 0.0 ); reflectedLight.indirectSpecular = vec3( 0.0 );
    reflectedLight.indirectDiffuse = vec3( gAO * gAO * 0.5 ); // readable through the tone mapping
  #endif
  #ifdef GAME_DBG
  { // look-dev: &dbg=1 albedo, 2 indirect diffuse, 3 indirect specular, 4 direct (use with &tm=none&contrast=0&exposure=1)
    vec3 v = GAME_DBG == 1 ? diffuseColor.rgb : GAME_DBG == 2 ? reflectedLight.indirectDiffuse : GAME_DBG == 3 ? reflectedLight.indirectSpecular : reflectedLight.directDiffuse + reflectedLight.directSpecular;
    reflectedLight.directDiffuse = vec3( 0.0 ); reflectedLight.directSpecular = vec3( 0.0 ); reflectedLight.indirectSpecular = vec3( 0.0 );
    reflectedLight.indirectDiffuse = v;
  }
  #endif
}
#endif
`;
export function injectSceneShading(shader) { injectCommon(shader); }
function injectCommon(shader) {
  shader.uniforms.tSSAO = G.tSSAO;
  shader.uniforms.uSSAO = G.uSSAO;
  shader.uniforms.uShadowLow = G.uShadowLow;
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform sampler2D tSSAO;\nuniform vec3 uSSAO;\n#define FOG_SUN_TINT ' + fogTintDefine() + (PARAMS.has('aoview') ? '\n#define AO_VIEW 1' : '') + (PARAMS.has('dbg') ? '\n#define GAME_DBG ' + (+PARAMS.get('dbg') | 0) : '') + (PARAMS.has('glintdbg') ? '\n#define GLINT_DBG 1' : ''))
    .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n' + SSAO_GLSL);
}
// Materials created anywhere (signs, other modules) still get SSAO + the fog tint through the
// prototype hook; materials with their own onBeforeCompile must call injectCommon themselves.
THREE.MeshStandardMaterial.prototype.onBeforeCompile = function (shader) { injectCommon(shader); };
THREE.MeshStandardMaterial.prototype.customProgramCacheKey = function () { return 'gameStd1' + fogTintDefine(); };
// Non-PBR materials that use fog need the FOG_SUN_TINT define too.
for (const M of [THREE.MeshBasicMaterial, THREE.MeshLambertMaterial, THREE.MeshPhongMaterial, THREE.MeshToonMaterial, THREE.SpriteMaterial, THREE.PointsMaterial, THREE.LineBasicMaterial, THREE.MeshMatcapMaterial, THREE.ShadowMaterial]) {
  M.prototype.onBeforeCompile = function (shader) { shader.uniforms.uShadowLow = G.uShadowLow; shader.fragmentShader = '#define FOG_SUN_TINT ' + fogTintDefine() + '\n' + shader.fragmentShader; };
  M.prototype.customProgramCacheKey = function () { return 'gameFog1' + fogTintDefine(); };
}

// ---------------------------------------------------------------------------------------------
// Textures

const TEX = {};
const TEX_KEYS = ['wood', 'brick', 'rooftile', 'metalroof', 'asphalt', 'concrete', 'plaster', 'paving', 'snow', 'grass', 'gravel', 'bark', 'fabric', 'leather', 'metal'];
const texLoader = new THREE.TextureLoader();
const pending = [];
function loadTex(url, srgb) {
  const t = new THREE.Texture();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  pending.push(new Promise((res) => {
    texLoader.load(url, (tex) => { t.image = tex.image; t.needsUpdate = true; res(); }, undefined, () => { console.warn('texture failed', url); res(); });
  }));
  return t;
}
function initTextures() {
  for (const k of TEX_KEYS) TEX[k] = { a: loadTex(`${ASSETS}tex/${k}_a.jpg`, true), n: loadTex(`${ASSETS}tex/${k}_n.jpg`, false) };
  G.tSnowA.value = TEX.snow.a; G.tSnowN.value = TEX.snow.n;
  const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  white.needsUpdate = true;
  G.tSSAO.value = white;
  MAT._white = white;
}

// ---------------------------------------------------------------------------------------------
// SURFACES. Each entry: tex (packed texture set), scale (metres per tile), nrm (normal strength),
// rough [mul, add] applied to the texture roughness, metal, macro (large-scale tint variation),
// seedVar (per-part brightness variation), snow (susceptibility 0..1), base (default colour when a
// part's colour is null), plus special flags.

export const SURFACES = {
  plain: { tex: 'plaster', scale: 2.4, nrm: 0.5, rough: [0.4, 0.55], macro: 0.18, seedVar: 0.05, snow: 1, grime: true, base: 0xd6d2ca },
  plaster: { tex: 'plaster', scale: 2.0, nrm: 0.8, rough: [0.4, 0.55], macro: 0.25, seedVar: 0.04, snow: 1, grime: true, base: 0xd6d2ca },
  wood: { tex: 'wood', scale: 1.8, nrm: 1.3, rough: [0.7, 0.3], macro: 0.15, seedVar: 0.05, snow: 1, grime: true, boards: true, base: 0x8a2a1e },
  brick: { tex: 'brick', scale: 1.8, nrm: 1.0, rough: [0.6, 0.35], macro: 0.12, seedVar: 0.04, snow: 1, grime: true, base: 0xa0735e },
  tile: { tex: 'rooftile', scale: 2.9, nrm: 1.2, rough: [0.8, 0.25], macro: 0.2, seedVar: 0.05, snow: 1, base: 0x303034, sharp: 6, roofSnow: 1 },
  metalroof: { tex: 'metalroof', scale: 2.0, nrm: 1.0, rough: [0.6, 0.12], metal: 0.55, macro: 0.08, seedVar: 0.03, snow: 1, base: 0x3a3c3e, sharp: 6, roofSnow: 2 },
  asphalt: { tex: 'asphalt', scale: 3.0, nrm: 1.0, rough: [0.3, 0.6], macro: 0.3, seedVar: 0.0, snow: 0, wet: true, detail2: 0.4, env: 0.75, specDesat: 0.5, base: 0x6a6866 },
  marking: { tex: 'asphalt', scale: 2.1, nrm: 0.6, rough: [0.4, 0.5], macro: 0.15, seedVar: 0.0, snow: 0, base: 0xd8d8d2, flatAlb: 0.75, decal: true },
  concrete: { tex: 'concrete', scale: 1.1, nrm: 0.7, rough: [0.6, 0.35], macro: 0.25, seedVar: 0.05, snow: 1, grime: true, base: 0xa8a8a4 },
  paving: { tex: 'paving', scale: 1.25, nrm: 1.0, rough: [0.6, 0.35], macro: 0.35, seedVar: 0.0, snow: 0.2, grime: true, base: 0x9e9c98 },
  snow: { tex: 'snow', scale: 2.0, nrm: 0.7, rough: [0.5, 0.35], macro: 0.06, seedVar: 0.0, snow: 0, snowSurf: true, base: 0xf3f4f5 },
  hillside: { tex: 'snow', scale: 2.0, nrm: 0.7, rough: [0.5, 0.35], macro: 0.06, seedVar: 0.0, snow: 0, snowSurf: true, hill: true, base: 0xf3f4f5 },
  grass: { tex: 'grass', scale: 2.0, nrm: 0.8, rough: [0.3, 0.68], macro: 0.3, seedVar: 0.0, snow: 0.86, base: 0x6b6440 },
  gravel: { tex: 'gravel', scale: 2.25, nrm: 1.0, rough: [0.5, 0.45], macro: 0.25, seedVar: 0.0, snow: 0.7, base: 0x8a8070 },
  birch: { proc: 6, r: 0.6, snow: 0.6, base: 0xdcd8cc },
  bark: { tex: 'bark', scale: 1.4, nrm: 1.3, rough: [0.4, 0.55], macro: 0.15, seedVar: 0.1, snow: 0.6, base: 0x5a4a3c },
  foliage: { proc: 1, r: 0.9, snow: 1, specK: 0.25, wrap: 0.4, base: 0x41543a },
  spruce: { proc: 1, r: 0.9, snow: 1, specK: 0.25, wrap: 0.4, tiers: true, base: 0x34472f },
  fabric: { tex: 'fabric', scale: 0.3, nrm: 0.8, rough: [0.3, 0.68], macro: 0.0, seedVar: 0.0, snow: 0, base: 0x3a4250 },
  leather: { tex: 'leather', scale: 0.4, nrm: 0.8, rough: [0.6, 0.15], macro: 0.0, seedVar: 0.0, snow: 0, base: 0x3a2618 },
  skin: { proc: 3, r: 0.52, snow: 0, base: 0xd8a888, procAmp: 0.04, skinWrap: [0.42, 0.22, 0.15] },
  hair: { proc: 2, r: 0.48, snow: 0, base: 0x4a3a2a },
  paint: { physical: true, r: 0.22, metal: 0.45, clearcoat: 1.0, ccr: 0.015, env: 1.3, envCC: 2.0, curve: true, snow: 1, base: 0x2a3a5a },
  paintsolid: { physical: true, r: 0.18, metal: 0.0, clearcoat: 1.0, ccr: 0.015, env: 1.3, envCC: 2.0, curve: true, snow: 1, base: 0xc8c8c4 },
  chrome: { r: 0.07, metal: 1.0, env: 1.4, snow: 0, base: 0xd8dade },
  metal: { tex: 'metal', scale: 1.0, nrm: 0.4, rough: [0.5, 0.15], metal: 0.95, macro: 0.05, seedVar: 0.03, snow: 0.5, base: 0x9a9da0 },
  painted: { proc: 3, r: 0.45, snow: 1, base: 0xe8e6e0, procAmp: 0.02 },
  rubber: { proc: 3, r: 0.86, snow: 0, base: 0x1c1c1e, procAmp: 0.03 },
  plastic: { proc: 3, r: 0.42, snow: 0.5, base: 0x5a6a5a, procAmp: 0.02 },
  glass: { physical: true, ior: 1.52, clearcoat: 0, r: 0.03, glass: true, env: 1.8, snow: 0, base: 0x8a9298 },
  lamp: { physical: true, ior: 1.6, clearcoat: 0.6, ccr: 0.02, r: 0.12, snow: 0, base: 0xd8d8d0, procAmp: 0.01 },
  tinted: { r: 0.03, tinted: true, opacity: 0.6, env: 1.6, snow: 0, base: 0x2a3036 },
  light: { r: 0.35, emit: 4.0, snow: 0, base: 0xfff2d6 },
  water: { proc: 4, r: 0.04, snow: 0, base: 0x0e1a1e },
  ice: { proc: 5, r: 0.12, snow: 0.4, base: 0xb8c8d0 },
};
SURFACES.panel = SURFACES.wood;     // aliases
SURFACES.roof = SURFACES.tile;
SURFACES.hedge = SURFACES.foliage;

// ---------------------------------------------------------------------------------------------
// The surface shader (MeshStandard/MeshPhysical + onBeforeCompile).

const SURF_VERT_PARS = `
attribute vec4 tri;
attribute vec3 trin;
varying vec4 vTri;
varying vec3 vTriN;
varying vec3 vTriOff;
#ifdef TRI_WET
  varying vec3 vGW;
#endif
#ifdef TRI_GLASS
  flat varying float vTriWf;
#endif
#ifdef TRI_CURVE
  varying vec3 vCurv;
#endif
`;
const SURF_VERT = `
vTri = tri;
vTriN = trin;
vTriOff = vec3( 0.0 );
#ifdef USE_INSTANCING
  vTriOff = instanceMatrix[ 3 ].xyz;
#endif
#ifdef USE_BATCHING
  vTriOff += batchingMatrix[ 3 ].xyz;
#endif
#ifdef TRI_GLASS
  vTriWf = tri.w;
#endif
#ifdef TRI_CURVE
  // car paint: a fake body curvature (the box panels of a car bulge outwards from its centre, so the
  // sky and the horizon slide across them instead of each panel reflecting one flat direction)
  vCurv = normalMatrix * clamp( vec3( position.x / 0.9, ( position.y - 0.85 ) / 0.6, position.z / 2.2 ), -1.2, 1.2 );
#endif
#ifdef TRI_WET
  {
    vec4 gw = vec4( transformed, 1.0 );
    #ifdef USE_BATCHING
      gw = batchingMatrix * gw;
    #endif
    #ifdef USE_INSTANCING
      gw = instanceMatrix * gw;
    #endif
    vGW = ( modelMatrix * gw ).xyz;
  }
#endif
`;
const SURF_FRAG_PARS = `
varying vec4 vTri;
varying vec3 vTriN;
varying vec3 vTriOff;
uniform vec4 uTexA;   // 1/scale, normal strength, rough mul, rough add
uniform vec4 uTexB;   // triplanar sharpness, macro variation, per-part variation, flat albedo mix
uniform float uSurfSnow;
uniform float uSnow;
uniform float uWet;
uniform float uTime;
uniform float uEmit;
uniform float uProcAmp;
uniform vec3 uSunW;
#ifdef TRI_GLASS
  flat varying float vTriWf;
#endif
#ifdef TRI_WET
  varying vec3 vGW;
  uniform vec4 uRoad;     // street grid: pitch, centre-line offset, asphalt half-width, lane offset
  uniform float uRoadExt; // the grid covers |x|, |z| <= this
#endif
#ifdef TRI_TEX
  uniform sampler2D tAlb;
  uniform sampler2D tNrm;
#endif
#if defined( TRI_SNOW ) || defined( TRI_SNOWSURF )
  uniform sampler2D tSnowA;
  uniform sampler2D tSnowN;
#endif
float gHash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float gNoise( vec3 x ) {
  vec3 i = floor( x ); vec3 f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( gHash( i ), gHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( gHash( i + vec3( 0, 1, 0 ) ), gHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( gHash( i + vec3( 0, 0, 1 ) ), gHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( gHash( i + vec3( 0, 1, 1 ) ), gHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
float gFbm( vec3 p ) { return 0.5 * gNoise( p ) + 0.3 * gNoise( p * 2.03 + 1.7 ) + 0.2 * gNoise( p * 4.1 + 3.1 ); }
mat3 gFrame( vec3 vx, vec3 vy, vec2 ux, vec2 uy, vec3 N ) {
  vec3 q1p = cross( vy, N ); vec3 q0p = cross( N, vx );
  vec3 T = q1p * ux.x + q0p * uy.x;
  vec3 B = q1p * ux.y + q0p * uy.y;
  float det = max( dot( T, T ), dot( B, B ) );
  float s = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
  return mat3( T * s, B * s, N );
}
vec3 gUnpack( vec2 xy, float k ) { vec2 n = xy * 2.0 - 1.0; float z = sqrt( max( 0.0, 1.0 - dot( n, n ) ) ); return normalize( vec3( n * k, z ) ); }
vec3 gBump( vec3 vx, vec3 vy, vec3 N, vec2 dH ) {
  vec3 sx = normalize( vx ), sy = normalize( vy );
  vec3 R1 = cross( sy, N ), R2 = cross( N, sx );
  float det = dot( sx, R1 );
  vec3 grad = sign( det ) * ( dH.x * R1 + dH.y * R2 );
  return normalize( abs( det ) * N - grad );
}
float gSnowCov = 0.0;
float gTexH = 0.5;
float gTexHb = 0.5;      // roofs: blurred texture height, tile id, tiles-below-a-pixel fade (TRI_ROOFSNOW)
vec2 gTile = vec2( 0.0 );
float gTileFar = 0.0;
float gClump = -1.0;  // foliage clump value (snow sits on the clump tops), -1 elsewhere    // texture 'height' proxy (albedo detail luminance, ~0.5 = average)
float gSpecMax = 3.0;
float gGlintW = 0.0;     // snow sparkle: weight of this fragment's crystal and its facet normal (view space)
vec3 gGlintN = vec3( 0.0, 0.0, 1.0 );
float gEnvMul = 1.0;  // per-fragment multiplier on reflected skylight
uniform float uEnvSpec;
uniform float uEnvCC;   // the clear coat's own sky-reflection boost (car paint)
#ifdef TRI_CURVE
  varying vec3 vCurv;
  vec3 gCCN = vec3( 0.0, 0.0, 1.0 );
#endif
#define GAME_SURF 1
`;
// Runs in place of <normal_fragment_maps>: albedo, roughness, metalness, normal, snow, wetness.
const SURF_FRAG_MAIN = `
vec3 gGeoN = normal;
float gLvl = floor( vTri.w * 0.5 );
float gSeed = vTri.w - gLvl * 2.0;
vec3 gP = vTri.xyz;
vec3 gPw = gP + vTriOff;
vec3 gVx = dFdx( - vViewPosition ), gVy = dFdy( - vViewPosition );
vec3 gTN = normalize( vTriN + 1e-5 );
float gDist = length( vViewPosition );
#ifdef TRI_TEX
{
  vec3 q = gP * uTexA.x + gSeed * 17.31 * uTexB.w;
  vec3 qx = dFdx( q ), qy = dFdy( q );
  vec3 w = pow( abs( gTN ), vec3( uTexB.x ) ); w /= dot( w, vec3( 1.0 ) );
  vec3 alb = vec3( 0.0 ), nn = vec3( 0.0 ); float rr = 0.0; gTexH = 0.0;
  #ifdef TRI_DETAIL2
    // A second, larger sample breaks the tiling of big flat surfaces (multiplied in, mean kept).
    #define GSAMPLE( UV, DX, DY, W ) { vec3 a = textureGrad( tAlb, UV, DX, DY ).rgb; vec3 t = textureGrad( tNrm, UV, DX, DY ).rgb; \
      vec3 a2 = textureGrad( tAlb, UV * 0.37 + 0.31, DX * 0.37, DY * 0.37 ).rgb; vec3 t2 = textureGrad( tNrm, UV * 0.37 + 0.31, DX * 0.37, DY * 0.37 ).rgb; \
      a *= mix( vec3( 1.0 ), a2 * 2.0, TRI_DETAIL2 ); t = mix( t, t2, TRI_DETAIL2 * 0.6 ); \
      alb += a * W; rr += t.b * W; nn += W * ( gFrame( gVx, gVy, DX, DY, gGeoN ) * gUnpack( t.rg, uTexA.y ) ); gTexH += dot( a, vec3( 0.333 ) ) * W; }
  #else
    #define GSAMPLE( UV, DX, DY, W ) { vec3 a = textureGrad( tAlb, UV, DX, DY ).rgb; vec3 t = textureGrad( tNrm, UV, DX, DY ).rgb; \
      alb += a * W; rr += t.b * W; nn += W * ( gFrame( gVx, gVy, DX, DY, gGeoN ) * gUnpack( t.rg, uTexA.y ) ); gTexH += dot( a, vec3( 0.333 ) ) * W; }
  #endif
  if ( w.x > 0.02 ) GSAMPLE( q.zy, qx.zy, qy.zy, w.x )
  if ( w.y > 0.02 ) GSAMPLE( q.xz, qx.xz, qy.xz, w.y )
  if ( w.z > 0.02 ) GSAMPLE( q.xy, qx.xy, qy.xy, w.z )
  float ws = w.x * step( 0.02, w.x ) + w.y * step( 0.02, w.y ) + w.z * step( 0.02, w.z );
  alb *= 2.0 / ws; rr /= ws; gTexH /= ws;
  #ifdef TRI_ROOFSNOW
  { // for the snow line on roofs (top projection): the height blurred (~6 cm on tiles, so the crests run
    // on continuously down the slope instead of outlining every tile; sharp on ribbed sheet metal), the
    // tile/rib each fragment is on, and how far below a pixel the tiles have shrunk
    #if TRI_ROOFSNOW == 1
      float bl = 24.0, per = 8.0;
    #else
      float bl = 1.0, per = 10.0;
    #endif
    gTexHb = dot( textureGrad( tAlb, q.xz, qx.xz * bl, qy.xz * bl ).rgb, vec3( 0.333 ) );
    gTile = floor( q.xz * per );
    gTileFar = smoothstep( 0.2, 0.6, length( fwidth( q.xz * per ) ) );
  }
  #endif
  #ifdef TRI_FLATALB
    alb = mix( alb, vec3( 1.0 ), TRI_FLATALB );
  #endif
  diffuseColor.rgb *= alb;
  roughnessFactor = clamp( rr * uTexA.z + uTexA.w, 0.03, 1.0 );
  normal = normalize( nn + gGeoN * 1e-4 );
  #ifdef TRI_BOARDS
  { // board panel: every board slightly different in tone and sheen, joints a shade darker. The wood
    // texture has 21 boards per tile, joints at u = 0.005 + k / 21 (see tools/textures.py).
    float side = 1.0 - w.y;
    float bu = ( ( w.x > w.z ? q.z : q.x ) - 0.005 ) * 21.0;
    float bfw = fwidth( bu );
    float bA = ( 1.0 - smoothstep( 0.25, 0.6, bfw ) ) * side;
    float bi = floor( bu );
    float hb = gHash( vec3( bi, gSeed * 13.0, 1.0 ) ), hr = gHash( vec3( bi, gSeed * 7.0, 5.0 ) );
    float jl = min( fract( bu ), 1.0 - fract( bu ) );
    float joint = 1.0 - smoothstep( 0.0, 0.07 + bfw, jl );
    diffuseColor.rgb *= 1.0 + bA * ( ( hb - 0.5 ) * 0.09 - 0.16 * joint );
    roughnessFactor = clamp( roughnessFactor + bA * ( hr - 0.5 ) * 0.1, 0.03, 1.0 );
  }
  #endif
}
#endif
#if TRI_PROC == 1
{ // foliage: clumps of needles/leaves with shadowed (not black) gaps and lighter tips. Band-limited:
  // each octave fades out before it gets finer than a few pixels, so nothing aliases into pixel noise.
  float fw = length( fwidth( gPw ) ) + 1e-5;       // metres per pixel
  float a1 = 1.0 - smoothstep( 0.18, 0.55, fw * 3.5 );
  float a2 = 1.0 - smoothstep( 0.18, 0.55, fw * 7.3 );
  float a3 = 1.0 - smoothstep( 0.18, 0.55, fw * 15.0 );
  a3 *= smoothstep( 8.0, 4.0, gDist );
  vec3 fp = gPw + gSeed * 9.0;
  float h1 = 0.5 + ( gNoise( fp * 3.5 ) - 0.5 ) * 0.62 * a1 + ( gNoise( fp * 7.3 + 1.7 ) - 0.5 ) * 0.34 * a2 + ( gNoise( fp * 15.0 + 3.1 ) - 0.5 ) * 0.22 * a3;
  float h2 = gNoise( gPw * 1.6 + 3.0 );
  float ew = 0.17 + 0.25 * ( 1.0 - a1 );
  float clump = smoothstep( 0.5 - ew, 0.5 + ew, h1 );
  float clump0 = clump;
  // snow-holding value: the tops of the clumps, finer-grained than the clumps themselves
  gClump = clump * 0.45 + mix( 0.5, gNoise( fp * 9.0 + 4.0 ), a2 ) * 0.55;
  #ifdef TRI_TIERS
  { // spruce whorls on the sloped faces of the cones, every ~0.42 m, wobbling around the tree. Going up
    // the face: the tip edge of a whorl (bright top above it, shadowed gap below), then its upper side
    // darkening towards the overhang of the next whorl. The profile is continuous across the period
    // (a short ramp instead of a jump), so its screen derivatives never spike into seam lines.
    float side = 1.0 - abs( inverseTransformDirection( gGeoN, viewMatrix ).y );
    float tA = ( 1.0 - smoothstep( 0.15, 0.5, fw * 2.5 ) ) * smoothstep( 0.04, 0.25, side );
    float tx = gPw.y / 0.42 + ( gNoise( gPw * 1.3 + 5.0 ) - 0.5 ) * 0.9 + ( gNoise( gPw * 3.1 + 2.0 ) - 0.5 ) * 0.3 * a1 + gSeed * 3.0;
    float tf = fract( tx );
    float tier = smoothstep( 0.0, 0.12, tf ) * ( 1.0 - smoothstep( 0.3, 1.0, tf ) );
    clump = mix( clump, clump * ( 0.45 + 0.75 * tier ), tA );
    // snow lies as broken clumps along the upper side of each whorl, just above the tip edge; some
    // whorls hold more than others
    float band = smoothstep( 0.03, 0.1, tf ) * ( 1.0 - smoothstep( 0.22, 0.5, tf ) );
    float wh = gHash( vec3( floor( tx ), gSeed * 31.0, 3.0 ) );
    float fine = mix( 0.5, gNoise( gPw * 4.7 + 7.0 ) * 0.65 + gNoise( gPw * 11.0 + 2.0 ) * 0.35 * a2 + 0.175 * ( 1.0 - a2 ), a1 );
    gClump = mix( clump0 * 0.6, band * ( fine * 1.25 - 0.05 + ( wh - 0.5 ) * 0.4 ), tA );
  }
  #endif
  diffuseColor.rgb *= mix( 0.42, 1.05, clump ) * ( 0.85 + 0.3 * h2 );
  diffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 1.1, 1.08, 0.85 ), clump * 0.5 );
  // bump from the clumps only (not the tier profile), clamped
  float hh = clump0 * 0.8 + h2 * 0.2;
  vec2 dH = clamp( vec2( dFdx( hh ), dFdy( hh ) ) * 2.2, -0.15, 0.15 );
  normal = gBump( gVx, gVy, gGeoN, dH * smoothstep( 40.0, 8.0, gDist ) * a1 );
  roughnessFactor = clamp( 0.88 + ( 1.0 - clump ) * 0.1, 0.88, 1.0 );
}
#elif TRI_PROC == 6
{ // birch bark: chalk-white with dark horizontal lenticels, black fissured patches low down
  float ang = atan( gTN.z, gTN.x );
  vec3 bp = vec3( cos( ang ) * 0.17, gP.y, sin( ang ) * 0.17 ); // a ~1 m circumference
  float len = gNoise( vec3( bp.x * 26.0, gP.y * 75.0, bp.z * 26.0 ) + gSeed * 13.0 );
  float dash = smoothstep( 0.64, 0.72, len ) * ( 0.75 + 0.25 * gNoise( gP * 9.0 ) );
  float low = smoothstep( 1.6, 0.2, gP.y - floor( gP.y / 40.0 ) * 40.0 - 0.15 );
  float patchN = gFbm( vec3( bp.x * 12.0, gP.y * 2.6, bp.z * 12.0 ) + gSeed * 3.0 );
  float blk = smoothstep( 0.63 - low * 0.22, 0.68 - low * 0.22, patchN );
  float dark = max( dash, blk );
  diffuseColor.rgb = mix( diffuseColor.rgb * ( 0.92 + 0.12 * gNoise( gP * 30.0 ) ), vec3( 0.035, 0.03, 0.028 ), dark );
  float h = dark * 0.6 + gNoise( gP * 40.0 ) * 0.15;
  normal = gBump( gVx, gVy, gGeoN, vec2( dFdx( h ), dFdy( h ) ) * 0.8 * smoothstep( 20.0, 3.0, gDist ) );
  roughnessFactor = mix( 0.6, 0.9, dark );
}
#elif TRI_PROC == 2
{ // hair strands
  float h = gNoise( vec3( gP.x * 70.0, gP.y * 5.0, gP.z * 70.0 ) ) * 0.7 + gNoise( vec3( gP.x * 160.0, gP.y * 9.0, gP.z * 160.0 ) ) * 0.3;
  diffuseColor.rgb *= 0.7 + 0.6 * h;
  vec2 dH = vec2( dFdx( h ), dFdy( h ) ) * 0.8;
  normal = gBump( gVx, gVy, gGeoN, dH * smoothstep( 12.0, 2.0, gDist ) );
}
#elif TRI_PROC == 3
{ // fine surface noise (skin, paint, rubber, plastic)
  float h = gNoise( gP * 90.0 + gSeed * 5.0 ) * 0.6 + gNoise( gP * 13.0 ) * 0.4;
  diffuseColor.rgb *= 1.0 + ( h - 0.5 ) * uProcAmp * 3.0;
  vec2 dH = vec2( dFdx( h ), dFdy( h ) ) * uProcAmp * 4.0;
  normal = gBump( gVx, gVy, gGeoN, dH * smoothstep( 15.0, 3.0, gDist ) );
  roughnessFactor = clamp( roughness + ( h - 0.5 ) * 0.08, 0.03, 1.0 );
}
#elif TRI_PROC == 4
{ // water: slow ripples
  float h = gNoise( vec3( gPw.xz * 1.3, uTime * 0.35 ) ) * 0.6 + gNoise( vec3( gPw.xz * 4.1, uTime * 0.8 ) ) * 0.4;
  vec2 dH = vec2( dFdx( h ), dFdy( h ) ) * 0.6;
  normal = gBump( gVx, gVy, gGeoN, dH );
}
#elif TRI_PROC == 5
{ // ice: clear-ish ice with milky patches, trapped-bubble speckle, and thin pale cracks along the
  // edges of two Voronoi cell layers (~0.8 m plates split into ~0.25 m pieces near the camera);
  // the lines are a few mm wide, filtered by their screen size (thinner than a pixel = fainter)
  vec2 w = gPw.xz;
  float h = gFbm( gPw * 1.7 );
  float ck = 0.0;
  for ( int o = 0; o < 2; o ++ ) {
    float cs = o == 0 ? 1.3 : 0.35;
    vec2 p = w / cs + ( o == 0 ? vec2( 0.0 ) : vec2( 17.3, 5.1 ) );
    vec2 ip = floor( p ), fp = fract( p );
    float d1 = 8.0, d2 = 8.0;
    vec2 c1 = vec2( 0.0 ), c2 = vec2( 0.0 );
    for ( int y = -1; y <= 1; y ++ ) for ( int x = -1; x <= 1; x ++ ) {
      vec2 g = vec2( float( x ), float( y ) );
      vec2 r = g + vec2( gHash( vec3( ip + g, 1.0 + float( o ) ) ), gHash( vec3( ip + g, 7.0 + float( o ) ) ) ) - fp;
      float d = dot( r, r );
      if ( d < d1 ) { d2 = d1; c2 = c1; d1 = d; c1 = ip + g; } else if ( d < d2 ) { d2 = d; c2 = ip + g; }
    }
    float e = ( sqrt( d2 ) - sqrt( d1 ) ) * 0.5 * cs;          // ~ metres to the nearest cell edge
    // only some cell borders are cracks (the ice is not crazy paving): one coin flip per pair of cells
    float on = step( o == 0 ? 0.45 : 0.65, gHash( vec3( c1 + c2, dot( c1, c2 ) * 0.01 + 3.0 ) ) );
    float fw = fwidth( e ) + 1e-5;
    float wd = o == 0 ? 0.003 : 0.002;
    float line = ( 1.0 - smoothstep( wd, wd + fw * 1.5, e ) ) * min( 1.0, wd * 2.0 / fw );
    ck = max( ck, on * line * ( o == 0 ? 1.0 : 0.6 * smoothstep( 14.0, 5.0, gDist ) ) );
  }
  float bub = smoothstep( 0.62, 0.8, gFbm( gPw * 9.0 + 3.0 ) ) * smoothstep( 20.0, 6.0, gDist );
  diffuseColor.rgb *= 0.78 + 0.35 * h;
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.86, 0.9, 0.93 ), clamp( ck * 0.45 + bub * 0.25, 0.0, 1.0 ) );
  roughnessFactor = clamp( roughness + h * 0.2 + ck * 0.35 + bub * 0.1, 0.03, 1.0 );
}
#endif
#ifdef TRI_GRIME
{ // dirt and damp at the foot of walls: darker within ~0.6 m of the ground on vertical faces
  float vert = 1.0 - abs( gTN.y );
  float g = ( 1.0 - smoothstep( 0.15, 0.8 + gNoise( gPw * 1.7 ) * 0.4, gP.y ) ) * vert;
  diffuseColor.rgb *= 1.0 - g * 0.28;
  roughnessFactor = min( 1.0, roughnessFactor + g * 0.1 );
}
#endif
#ifdef TRI_SEEDVAR
  diffuseColor.rgb *= 1.0 + ( gSeed - 0.5 ) * TRI_SEEDVAR;
#endif
#ifdef TRI_MACRO
  diffuseColor.rgb *= 1.0 + ( gNoise( gPw * 0.13 ) * 0.65 + gNoise( gPw * 0.41 + 7.0 ) * 0.35 - 0.5 ) * TRI_MACRO;
#endif
#ifdef TRI_GLASS
{ // a window pane: a dim room behind it, and per pane: side curtains, a sheer curtain, blinds, or a lamp
  // on. GeoBuilder gives glass parts pane-centred coordinates and packs the pane's half-width and
  // half-height (cm) into tri.w, so the pattern fits each pane.
  // (flat varying: the packed value is too large to survive interpolation exactly)
  float lvl = floor( vTriWf * 0.5 );
  float gs = vTriWf - lvl * 2.0;
  float hw = floor( lvl / 1024.0 ) * 0.01, hh = mod( lvl, 1024.0 ) * 0.01;
  bool known = hw > 0.05 && hh > 0.05;
  float k = gHash( vec3( floor( gs * 997.0 ) ) );
  float k2 = gHash( vec3( floor( gs * 631.0 ) + 3.0 ) );
  float k3 = gHash( vec3( floor( gs * 421.0 ) + 7.0 ) );
  float wc = abs( gTN.x ) > abs( gTN.z ) ? gP.z : gP.x;
  vec2 pv = known ? vec2( wc / hw, gP.y / hh ) : vec2( 0.0, fract( gP.y * 0.7 + gs ) * 2.0 - 1.0 );
  float yy = pv.y * 0.5 + 0.5;
  vec3 room = mix( vec3( 0.2, 0.19, 0.18 ), vec3( 0.42, 0.37, 0.3 ), k * k ) * ( 0.75 + 0.5 * smoothstep( 0.2, 0.9, yy ) );
  vec3 fab = k < 0.3 ? vec3( 0.86, 0.84, 0.8 ) : k < 0.5 ? vec3( 0.78, 0.72, 0.62 ) : k < 0.65 ? vec3( 0.62, 0.64, 0.62 ) : k < 0.8 ? vec3( 0.55, 0.3, 0.26 ) : vec3( 0.42, 0.5, 0.42 );
  float fwU = fwidth( pv.x ) + 1e-4, fwV = fwidth( gP.y ) + 1e-4;
  float folds = 0.82 + 0.18 * sin( wc * 42.0 + k * 9.0 ) * ( 1.0 - smoothstep( 0.01, 0.03, fwidth( wc ) ) );
  vec3 c = room;
  if ( known && k3 < 0.5 ) {
    // side curtains (both sides, or one), gathered: brighter folds, a little open in the middle
    float cw = 0.28 + 0.25 * k2;
    float side = k3 < 0.3 ? abs( pv.x ) : ( k > 0.5 ? pv.x : - pv.x );
    float m = smoothstep( 1.0 - cw - fwU, 1.0 - cw + fwU, side );
    c = mix( c, fab * folds, m );
  } else if ( known && k3 < 0.66 ) {
    // venetian blinds lowered part way: light slats every 4 cm
    float bot = mix( -0.9, 0.6, k2 );
    float m = smoothstep( bot - 0.02, bot + 0.02, pv.y );
    float sw = fwV / 0.04, sf = fract( gP.y / 0.04 );
    float slat = smoothstep( 0.12 - sw, 0.12 + sw, sf ) * ( 1.0 - smoothstep( 0.88 - sw, 0.88 + sw, sf ) );
    slat = mix( slat, 0.74, smoothstep( 0.12, 0.3, sw ) );
    c = mix( c, mix( vec3( 0.5, 0.49, 0.46 ), vec3( 0.82, 0.8, 0.76 ), slat ), m );
  } else if ( k3 < 0.78 ) {
    // a sheer curtain over the whole pane
    c = mix( c, vec3( 0.78, 0.77, 0.74 ) * folds, 0.55 );
  }
  diffuseColor.rgb *= c;
  if ( k2 > 0.9 ) {
    // a lamp on somewhere in the room: warm, brighter towards the top
    float glow = ( 0.5 + 0.5 * smoothstep( 0.1, 0.9, yy ) ) * ( 0.7 + 0.3 * gNoise( gP * 3.0 ) );
    totalEmissiveRadiance += vec3( 1.0, 0.62, 0.3 ) * ( 0.35 + 0.4 * k ) * glow;
    diffuseColor.rgb *= 0.5;
  }
  roughnessFactor = roughness;
  // big shop windows: the infinitely distant sky reflection gives itself away, so soften it
  if ( hw > 1.5 ) { roughnessFactor = max( roughnessFactor, 0.06 ); gEnvMul = 0.8; }
  normal = gGeoN;
}
#endif
#ifdef TRI_WET
{ // plowed asphalt: wheel tracks, patch repairs, sparse cracks, damp patches and damp edges
  vec2 W = vGW.xz;
  float ext = step( abs( W.x ), uRoadExt ) * step( abs( W.y ), uRoadExt );
  vec2 rq = mod( W - uRoad.y, uRoad.x );
  vec2 rs = rq - uRoad.x * step( uRoad.x * 0.5, rq );          // signed offset from the nearest centre lines
  float onZ = step( abs( rs.x ), uRoad.z ) * ext;               // on a road running along z
  float onX = step( abs( rs.y ), uRoad.z ) * ext;               // ... along x
  float inter = onZ * onX;
  float road = max( onZ, onX );
  // road-aligned frame: across (signed offset), along
  float across = onZ > 0.5 ? rs.x : rs.y;
  float along = onZ > 0.5 ? W.y : W.x;
  float aa = abs( across ) + ( gNoise( vec3( along * 0.045, 1.0, across > 0.0 ? 3.0 : 7.0 ) ) - 0.5 ) * 0.5;
  // wheel tracks at lane +/- 0.78 m: darker and polished
  float tr = exp( - pow( ( aa - ( uRoad.w - 0.78 ) ) / 0.38, 2.0 ) ) + exp( - pow( ( aa - ( uRoad.w + 0.78 ) ) / 0.38, 2.0 ) );
  tr *= road * ( 1.0 - inter ) * ( 0.75 + 0.25 * gNoise( vec3( along * 0.3, across, 2.0 ) ) );
  // damp, grimy band along the kerbs (meltwater from the snow banks)
  float edge = road * ( 1.0 - inter ) * smoothstep( uRoad.z - 1.3, uRoad.z - 0.15, abs( across ) + ( gNoise( vec3( along * 0.2, 5.0, across ) ) - 0.5 ) * 0.6 );
  diffuseColor.rgb *= ( 1.0 + 0.16 * clamp( tr, 0.0, 1.0 ) ) * ( 1.0 - 0.12 * edge );
  roughnessFactor = clamp( roughnessFactor - 0.05 * tr, 0.03, 1.0 );
  // patch repairs: sparse road-aligned rectangles with a dark sealed seam
  {
    vec2 pc = road > 0.5 ? vec2( across, along ) : W;
    vec2 cs = vec2( 2.6, 3.7 );
    vec2 cell = floor( pc / cs );
    float h = gHash( vec3( cell, 17.0 ) );
    vec2 f = fract( pc / cs ) * cs;
    vec2 lo = vec2( gHash( vec3( cell, 3.0 ) ), gHash( vec3( cell, 5.0 ) ) ) * cs * 0.3;
    vec2 hi = cs - vec2( gHash( vec3( cell, 7.0 ) ), gHash( vec3( cell, 9.0 ) ) ) * cs * 0.3;
    vec2 fw = fwidth( pc ) * 1.5 + 1e-4;
    vec2 inside = smoothstep( lo - fw, lo + fw, f ) * smoothstep( hi + fw, hi - fw, f );
    float pa = step( 0.94, h ) * inside.x * inside.y * ( 1.0 - inter );
    vec2 dEdge = min( abs( f - lo ), abs( f - hi ) );
    float seam = step( 0.94, h ) * ( 1.0 - inter ) * max( inside.y * ( 1.0 - smoothstep( 0.0, 0.03 + fw.x, dEdge.x ) ) * step( lo.x - 0.05, f.x ) * step( f.x, hi.x + 0.05 ),
                                                        inside.x * ( 1.0 - smoothstep( 0.0, 0.03 + fw.y, dEdge.y ) ) * step( lo.y - 0.05, f.y ) * step( f.y, hi.y + 0.05 ) );
    diffuseColor.rgb *= ( 1.0 + pa * ( gHash( vec3( cell, 11.0 ) ) > 0.5 ? 0.08 : -0.08 ) ) * ( 1.0 - 0.45 * seam * smoothstep( 40.0, 10.0, gDist ) );
    roughnessFactor = clamp( roughnessFactor + pa * 0.04 - seam * 0.2, 0.03, 1.0 );
  }
  // cracks: transverse thermal cracks across the streets every 8-30 m, a wandering joint crack along
  // the centre line, and a few jagged noise cracks on lots; thin (fwidth-limited), faded with distance
  {
    float ck = 0.0;
    float near = smoothstep( 50.0, 12.0, gDist );
    if ( near > 0.0 ) {
      float jag = ( gNoise( vec3( W * 3.1, 1.0 ) ) - 0.5 ) * 0.07 + ( gNoise( vec3( W * 9.7, 2.0 ) ) - 0.5 ) * 0.025;
      if ( road > 0.5 && inter < 0.5 ) {
        float cl = floor( along / 14.0 );
        float pos = ( cl + 0.2 + 0.6 * gHash( vec3( cl, across > 0.0 ? 1.0 : 2.0, 21.0 ) ) ) * 14.0;
        float wob = ( gNoise( vec3( across * 0.9, cl, 3.0 ) ) - 0.5 ) * 0.6 + jag;
        float d = abs( along - pos - wob );
        float span = step( 0.45, gHash( vec3( cl, 4.0, 22.0 ) ) ) * smoothstep( 0.25, 0.4, gNoise( vec3( across * 0.5, cl * 3.0, 5.0 ) ) );
        ck = max( ck, span * ( 1.0 - smoothstep( 0.0, 0.007 + fwidth( along ) * 1.2, d ) ) );
        float dl = abs( across - ( gNoise( vec3( along * 0.35, 6.0, 0.0 ) ) - 0.5 ) * 0.25 - jag );
        float lspan = smoothstep( 0.5, 0.62, gNoise( vec3( along * 0.04, 7.0, 0.0 ) ) );
        ck = max( ck, lspan * ( 1.0 - smoothstep( 0.0, 0.006 + fwidth( across ) * 1.2, dl ) ) );
      } else if ( road < 0.5 ) {
        float n = gNoise( vec3( W * 0.45, 0.0 ) ) + jag * 0.6;
        float fwN = fwidth( n );
        ck = ( 1.0 - smoothstep( 0.0, 0.004 + fwN * 1.2, abs( n - 0.5 ) ) ) * smoothstep( 0.68, 0.78, gNoise( vec3( W * 0.05, 9.0 ) ) );
      }
      ck *= near;
    }
    diffuseColor.rgb *= 1.0 - 0.45 * ck;
    roughnessFactor = min( 1.0, roughnessFactor + 0.1 * ck );
  }
  // damp: the plowed street is slightly damp all over except in the wheel tracks (traffic dries them
  // to two paler bands per lane), wetter along the kerbs, with darker damp patches here and there
  float wn = gFbm( vec3( W.x, 0.0, W.y ) * 0.07 ) * 0.8 + gNoise( vec3( W.x, 0.0, W.y ) * 0.6 ) * 0.2;
  float wet = smoothstep( 0.60, 0.70, wn + 0.10 * edge );
  wet = max( wet, max( edge * 0.95, road * 0.5 ) ) * ( 1.0 - 0.9 * clamp( tr, 0.0, 1.0 ) ) * uWet;
  diffuseColor.rgb *= mix( 1.0, 0.72, wet );
  roughnessFactor = mix( roughnessFactor, 0.42, wet );
  normal = normalize( mix( normal, gGeoN, wet * 0.15 ) );
}
#endif
#if defined( TRI_SNOW ) || defined( TRI_SNOWSURF )
  vec3 gWN = inverseTransformDirection( gGeoN, viewMatrix );
  vec2 gSuv = gPw.xz * 0.5;
  vec2 gSdx = dFdx( gSuv ), gSdy = dFdy( gSuv );
#endif
#ifdef TRI_SNOW
{ // snow settles on upward faces; patchy where the susceptibility is low
  float sk = ( gLvl / 15.0 ) * uSnow * uSurfSnow;
  vec3 wNp = inverseTransformDirection( normal, viewMatrix );
  float up = mix( gWN.y, wNp.y, 0.4 );
  float n1 = gFbm( gPw * 0.8 + 5.0 );
  float n2 = gNoise( gPw * 4.3 + 11.0 );
  // coverage edges are widened by the screen-space rate of change of their argument (no aliasing)
  float ca = up + ( n2 - 0.5 ) * 0.18;
  float ce = fwidth( ca ) * 1.5;
  float cov = smoothstep( 0.52 - ce, 0.8 + ce, ca );
  if ( gClump >= 0.0 ) {
    // foliage: snow sits on the clump tops of upward faces and (spruce) in thin bands on the upper side
    // of each whorl; never a full white coat on the sides
    #ifdef TRI_TIERS
      ca = gClump + ( gWN.y - 0.6 ) * 0.5;
    #else
      ca = gClump + ( gWN.y - 0.72 ) * 1.1;   // hedges: a cap on top with a ragged edge
    #endif
    ce = fwidth( ca ) * 1.5;
    cov = smoothstep( 0.45 - ce, 0.72 + ce, ca ) * mix( 0.6, 0.9, smoothstep( 0.7, 0.95, gWN.y ) );
  }
  float cb = n1 * 0.85 + n2 * 0.15 + 0.08;
  float cbe = fwidth( cb ) * 1.5;
  float gPack = 0.0;   // 1 = compacted remnant snow (hard ground), not fresh
  #ifdef TRI_TEX
  if ( uSurfSnow < 0.5 ) {
    // hard ground that people walk on and plough (paving): the snow is gone from the slabs and stays in
    // the joints and hollows of the texture (dark = low), thicker where the large-scale drift noise
    // says so; compacted and a little grey, with crisp edges
    float jh = ( 0.47 - gTexH ) * 4.0 + ( n1 - 0.5 ) * 0.9 + ( sk - 0.2 ) * 1.5;
    float je = fwidth( jh ) * 0.5;
    cov *= smoothstep( 0.15 - je, 0.3 + je, jh );
    gPack = 1.0;
  } else
  #endif
  cov *= smoothstep( 1.0 - sk - 0.08 - cbe, 1.0 - sk + 0.12 + cbe, cb );
  #ifdef TRI_ROOFSNOW
  { // thin snow on tiles / sheet metal: the crests of the tile waves and the ribs poke through as dark
    // lines down the slope, the troughs fill first. The threshold drifts from tile to tile (smoothly,
    // plus a little per-tile jitter) and over each roof (wind: some areas fully covered, others barer),
    // so the texture's 2.9 m repeat never shows as a grid; below a pixel the expected average takes over.
    float big = gNoise( gPw * 0.15 + 3.0 );
    float lvl = ( n1 - 0.5 ) * 0.5 + ( big - 0.5 ) * 0.55 - ( sk - 1.0 ) * 0.25;
    float jit = ( gNoise( vec3( gTile * 0.45, gSeed * 17.0 + 1.0 ) ) - 0.5 ) * 0.14 + ( gHash( vec3( gTile, gSeed * 17.0 + 1.0 ) ) - 0.5 ) * 0.05;
    float rv = smoothstep( 0.52, 0.68, gTexHb + lvl + jit );
    rv = mix( rv, smoothstep( -0.25, 0.3, lvl ) * 0.7, gTileFar );
    cov *= 1.0 - rv * 0.45;
  }
  #endif
  if ( cov > 0.002 ) {
    vec3 sa = textureGrad( tSnowA, gSuv, gSdx, gSdy ).rgb * 2.0;
    vec3 st = textureGrad( tSnowN, gSuv, gSdx, gSdy ).rgb;
    vec3 sn = gFrame( gVx, gVy, gSdx, gSdy, gGeoN ) * gUnpack( st.rg, 0.6 );
    float edge = smoothstep( 0.0, 0.5, cov );
    float mv = gNoise( gPw * 0.35 + 2.0 );
    vec3 snowAlb = vec3( 0.9, 0.91, 0.92 ) * sa * mix( 0.78, 1.0, edge ) * ( 0.94 + 0.08 * mv ) * mix( 1.0, 0.86, gPack );
    diffuseColor.rgb = mix( diffuseColor.rgb, snowAlb, cov );
    roughnessFactor = mix( roughnessFactor, clamp( st.b * 0.5 + 0.38, 0.2, 1.0 ), cov );
    metalnessFactor = mix( metalnessFactor, 0.0, cov );
    float dh = gFbm( gPw * 0.6 ) * 0.7 + n2 * 0.3;
    vec3 sd = gBump( gVx, gVy, sn, vec2( dFdx( dh ), dFdy( dh ) ) * 0.3 );
    normal = normalize( mix( normal, sd, cov ) );
  }
  gSnowCov = cov;
}
#endif
#ifdef TRI_SNOWSURF
  gSnowCov = 1.0;
  { // drifts on snow surfaces: small ones near, and large wind-blown swells and crusty sastrugi that
    // keep big snowfields and hills from reading as smooth plaster (slopes in world units, so the
    // low sun rakes them at any distance)
    float h = gFbm( gPw * 0.3 ) * 0.7 + gNoise( gPw * 1.1 ) * 0.3;
    vec2 dH = vec2( dFdx( h ), dFdy( h ) ) * 0.35;
    float fw = length( fwidth( gPw ) ) + 1e-5;
    float m1 = gNoise( gPw * 0.02 + 3.0 ), m2 = gNoise( gPw * 0.061 + 8.0 );
    // sastrugi: wind ridges on the ground plane, so only on gentle slopes (on a steep face the same
    // pattern would run down it as vertical streaks)
    float sa = gNoise( vec3( gPw.x * 0.16, 0.0, gPw.z * 0.55 ) + 2.0 );
    float saA = ( 1.0 - smoothstep( 0.15, 0.45, fw * 0.55 ) ) * smoothstep( 0.5, 0.85, gWN.y );
    float hm = ( m1 - 0.5 ) * 7.0 + ( m2 - 0.5 ) * 2.4 + ( sa - 0.5 ) * 0.35 * saA;
    float il = 1.0 / max( length( gVx ), 1e-4 ), jl = 1.0 / max( length( gVy ), 1e-4 );
    // gentle on lawns near the camera, stronger on the far fields and hills
    vec2 dM = vec2( dFdx( hm ) * il, dFdy( hm ) * jl ) * mix( 0.25, 0.8, smoothstep( 30.0, 220.0, gDist ) );
    normal = gBump( gVx, gVy, normal, dH + clamp( dM, -0.5, 0.5 ) );
    diffuseColor.rgb *= 1.0 + ( m2 - 0.5 ) * 0.12 + ( m1 - 0.5 ) * 0.06;
    #ifdef TRI_HILL
    { // distant hillside: stands of spruce (dark crowns with snow between them, more on the flanks)
      // and bare, wind-blown or sun-melted patches on steep faces turned to the sun, so the hills
      // read as land rather than smooth white clay. Isotropic 3D noise: no streaks on the flanks.
      // stands of spruce: a large-scale mask with frayed edges; inside it a fine, soft grain of dark
      // crowns and snow (a forest seen from a few hundred metres is a dark, grainy tone, not blobs),
      // fading to its average once the grain is below a pixel
      float cr = gNoise( gPw * 0.9 + 1.0 ) * 0.55 + gNoise( gPw * 2.3 + 4.0 ) * 0.45;
      float crA = 1.0 - smoothstep( 0.5, 1.2, fw * 1.4 );
      float st = gFbm( gPw * 0.011 + 7.0 ) + ( 0.85 - gWN.y ) * 0.1 + ( gNoise( gPw * 0.09 ) - 0.5 ) * 0.12;
      float forest = smoothstep( 0.47, 0.53, st );   // stands with fairly crisp (frayed) edges: forest or open field
      float trees = forest * mix( 0.85, 0.5 + 0.5 * smoothstep( 0.25, 0.55, cr + forest * 0.15 ), crA );
      vec3 fc = vec3( 0.04, 0.05, 0.04 ) * ( 0.8 + 0.4 * cr );
      vec2 sxz = normalize( uSunW.xz );
      float sunF = dot( gWN.xz, sxz ) / max( length( gWN.xz ), 1e-3 );
      float bare = ( 1.0 - smoothstep( 0.35, 0.72, gWN.y ) ) * smoothstep( -0.1, 0.6, sunF ) * smoothstep( 0.5, 0.66, gFbm( gPw * 0.035 + 2.0 ) );
      diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.16, 0.14, 0.1 ), bare * 0.75 );
      diffuseColor.rgb = mix( diffuseColor.rgb, fc, trees * 0.96 );
      roughnessFactor = mix( roughnessFactor, 0.95, max( trees, bare ) );
      gSnowCov = 1.0 - max( trees, bare );
    }
    #endif
  }
#endif
#if defined( TRI_SNOW ) || defined( TRI_SNOWSURF )
{ // sparkle: a few ice crystals per cell act as tiny tilted mirrors. Each is a round spot around a
  // jittered point, at least about a pixel wide (a glint reads as a point of light at any distance),
  // with its own facet normal; the glint is added to the sun's specular only (RE_Direct_Game), so it
  // vanishes in shade and never darkens the diffuse. Two cell sizes (1.4 cm near, 4.5 cm further), each
  // fading out once its cells get smaller than ~2.5 pixels, so nothing aliases into a pixel grid.
  float px = length( fwidth( gPw ) ) + 1e-6;
  float base = smoothstep( 0.7, 0.9, gSnowCov ) * smoothstep( 0.5, 0.7, gWN.y ) * smoothstep( 60.0, 25.0, gDist );
  for ( int o = 0; o < 2; o ++ ) {
    float k = o == 0 ? 70.0 : 22.0;
    float fade = base * ( 1.0 - smoothstep( 0.3, 0.45, px * k ) );
    if ( fade <= 0.0 ) continue;
    vec3 cell = floor( gPw * k ) + float( o ) * 57.0;
    if ( gHash( cell ) < 0.85 ) continue;
    vec3 j = vec3( gHash( cell + 1.7 ), gHash( cell + 4.1 ), gHash( cell + 8.3 ) );
    vec3 cp = ( floor( gPw * k ) + 0.2 + 0.6 * j ) / k;
    float r = max( 0.25 / k, px * 0.6 );
    float spot = ( 1.0 - smoothstep( r * 0.6, r, length( gPw - cp ) ) ) * fade;
    if ( spot > gGlintW ) {
      gGlintW = spot;
      gGlintN = normalize( ( viewMatrix * vec4( normalize( vec3( j.x - 0.5, 0.6, j.z - 0.5 ) ), 0.0 ) ).xyz );
    }
  }
  if ( gGlintW > 0.0 ) gSpecMax = 14.0;   // crystals may glint through the bloom
}
#endif
#ifdef TRI_CURVE
{ // car paint: fake curvature for both layers, and a faint orange peel on the clear coat so its
  // reflections are not CG-perfect (no curvature where snow lies on the panel)
  #ifdef TRI_SNOW
    float gC = 1.0 - gSnowCov;
  #else
    float gC = 1.0;
  #endif
  vec3 cv = vCurv * gC;
  normal = normalize( normal + cv * 0.1 );
  float op = gNoise( gP * 38.0 ) * 0.6 + gNoise( gP * 83.0 + 3.0 ) * 0.4;
  vec3 ccn = gBump( gVx, gVy, gGeoN, vec2( dFdx( op ), dFdy( op ) ) * 0.012 * smoothstep( 12.0, 2.0, gDist ) );
  gCCN = normalize( ccn + cv * 0.16 );
}
#endif
`;
// Emissive for 'light' surfaces: colour = vertex colour.
const SURF_EMISSIVE = `
#ifdef TRI_EMIT
  totalEmissiveRadiance = vColor.rgb * uEmit;
#else
  #include <emissivemap_fragment>
#endif
`;
const SURF_OPAQUE = `
#ifdef TRI_GLASSALPHA
  {
    float gF = pow( 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) ), 5.0 );
    float a = diffuseColor.a + ( 1.0 - diffuseColor.a ) * ( 0.04 + 0.96 * gF ) * 0.8;
    gl_FragColor = vec4( totalDiffuse * diffuseColor.a * 0.3 + totalSpecular + totalEmissiveRadiance, a );
  }
#else
  #include <opaque_fragment>
#endif
`;

// After <lights_physical_fragment>: per-surface specular scale (foliage: a volume of needles has
// almost no coherent specular and no Fresnel rim).
const SURF_SPEC = `
#ifdef TRI_SPECK
  material.specularColor *= TRI_SPECK;
  material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
  material.specularF90 *= TRI_SPECK;
#endif
`;
// After <lights_physical_pars_fragment>: the sun's direct light with extras - snow-crystal glints
// (specular only, shadowed like the sun) and, for foliage, light wrapping round the terminator and a
// little shining through (a volume of needles is not an opaque shell).
const SURF_DIRECT = `
#if defined( TRI_SNOW ) || defined( TRI_SNOWSURF ) || defined( TRI_WRAP ) || defined( TRI_SKIN )
void RE_Direct_Game( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  #if defined( TRI_SNOW ) || defined( TRI_SNOWSURF )
    if ( gGlintW > 0.0 ) {
      float g = pow( max( dot( reflect( - geometryViewDir, gGlintN ), directLight.direction ), 0.0 ), 50.0 );
      reflectedLight.directSpecular += directLight.color * ( g * gGlintW * 2.5 );
      #ifdef GLINT_DBG
      reflectedLight.directSpecular = vec3( 0.0, 3.0 * gGlintW, 0.0 ) + vec3( 30.0 * g * gGlintW, 0.0, 0.0 );
      #endif
    }
  #endif
  #ifdef TRI_WRAP
  {
    float nl = dot( geometryNormal, directLight.direction );
    float extra = max( nl + TRI_WRAP, 0.0 ) / ( 1.0 + TRI_WRAP ) - max( nl, 0.0 ) + 0.2 * max( - nl, 0.0 );
    reflectedLight.directDiffuse += directLight.color * BRDF_Lambert( material.diffuseContribution ) * max( extra, 0.0 );
  }
  #endif
  #ifdef TRI_SKIN
  { // skin: light scattered under the surface wraps round the terminator, red travelling furthest
    // (a warm, soft edge to the shade instead of a grey-beige cut)
    float nl = dot( geometryNormal, directLight.direction );
    vec3 w = TRI_SKIN;
    vec3 extra = max( ( vec3( nl ) + w ) / ( 1.0 + w ), 0.0 ) / ( 1.0 + w ) - vec3( max( nl, 0.0 ) );
    reflectedLight.directDiffuse += directLight.color * BRDF_Lambert( material.diffuseContribution ) * max( extra, vec3( 0.0 ) );
  }
  #endif
}
#undef RE_Direct
#define RE_Direct RE_Direct_Game
#endif
`;
function surfaceCompile(shader) {
  const u = this.userData.uniforms;
  Object.assign(shader.uniforms, u);
  shader.uniforms.uSnow = G.uSnow; shader.uniforms.uWet = G.uWet; shader.uniforms.uTime = G.uTime; shader.uniforms.uSunW = G.uSunW;
  shader.uniforms.tSnowA = G.tSnowA; shader.uniforms.tSnowN = G.tSnowN;
  shader.uniforms.uRoad = G.uRoad; shader.uniforms.uRoadExt = G.uRoadExt;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + SURF_VERT_PARS)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + SURF_VERT);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + SURF_FRAG_PARS)
    .replace('#include <normal_fragment_maps>', SURF_FRAG_MAIN)
    .replace('#include <lights_physical_pars_fragment>', '#include <lights_physical_pars_fragment>\n' + SURF_DIRECT)
    .replace('#include <clearcoat_normal_fragment_maps>', '#include <clearcoat_normal_fragment_maps>\n#ifdef TRI_CURVE\n  clearcoatNormal = gCCN;\n#endif')
    .replace('#include <emissivemap_fragment>', SURF_EMISSIVE)
    .replace('#include <opaque_fragment>', SURF_OPAQUE)
    .replace('#include <premultiplied_alpha_fragment>', '#ifndef TRI_GLASSALPHA\n#include <premultiplied_alpha_fragment>\n#endif')
    .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#if defined( USE_CLEARCOAT ) && defined( TRI_SNOW )\n material.clearcoat *= 1.0 - gSnowCov;\n#endif\n' + SURF_SPEC);
  injectCommon(shader);
}

const matCache = new Map();
function makeSurfaceMaterial(name, snow, extra = {}) {
  const d = SURFACES[name] || SURFACES.plain;
  const p = { vertexColors: true, roughness: d.r ?? 0.8, metalness: d.metal ?? 0, envMapIntensity: 1 };
  let m;
  if (d.physical) m = new THREE.MeshPhysicalMaterial({ ...p, clearcoat: d.clearcoat ?? 1, clearcoatRoughness: d.ccr ?? 0.04, ior: d.ior ?? 1.5 });
  else m = new THREE.MeshStandardMaterial(p);
  const defs = {};
  if (d.tex) defs.TRI_TEX = 1;
  if (d.proc) defs.TRI_PROC = d.proc;
  if (snow && (d.snow ?? 0) > 0) defs.TRI_SNOW = 1;
  if (d.snowSurf) defs.TRI_SNOWSURF = 1;
  if (d.hill) defs.TRI_HILL = 1;
  if (d.wet) defs.TRI_WET = 1;
  if (d.detail2) defs.TRI_DETAIL2 = d.detail2.toFixed(3);
  if (d.boards) defs.TRI_BOARDS = 1;
  if (d.roofSnow && defs.TRI_SNOW) defs.TRI_ROOFSNOW = d.roofSnow;
  if (d.glass) defs.TRI_GLASS = 1;
  if (d.emit !== undefined) defs.TRI_EMIT = 1;
  if (d.macro) defs.TRI_MACRO = d.macro.toFixed(3);
  if (d.seedVar) defs.TRI_SEEDVAR = d.seedVar.toFixed(3);
  if (d.flatAlb) defs.TRI_FLATALB = d.flatAlb.toFixed(3);
  if (d.grime) defs.TRI_GRIME = 1;
  if (d.specDesat) defs.TRI_SPECDESAT = d.specDesat.toFixed(3);
  if (d.specK !== undefined) defs.TRI_SPECK = d.specK.toFixed(3);
  if (d.tiers) defs.TRI_TIERS = 1;
  if (d.wrap) defs.TRI_WRAP = d.wrap.toFixed(3);
  if (d.curve) defs.TRI_CURVE = 1;
  if (d.skinWrap) defs.TRI_SKIN = `vec3( ${d.skinWrap.map((v) => v.toFixed(3)).join(', ')} )`;
  // paint lying a centimetre over the asphalt: far away that is below the depth precision, so it is
  // pulled forward a little and always wins
  if (d.decal) { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -2; }
  if (d.tinted) {
    defs.TRI_GLASSALPHA = 1;
    m.transparent = true; m.opacity = d.opacity ?? 0.4; m.depthWrite = false; m.premultipliedAlpha = true;
  }
  if (!defs.TRI_PROC) defs.TRI_PROC = 0;
  m.defines = defs;
  const t = d.tex ? TEX[d.tex] : null;
  const rough = d.rough || [1, 0];
  m.userData.uniforms = {
    tAlb: { value: t ? t.a : null }, tNrm: { value: t ? t.n : null },
    uTexA: { value: new THREE.Vector4(1 / (d.scale || 1), d.nrm ?? 1, rough[0], rough[1]) },
    uTexB: { value: new THREE.Vector4(d.sharp ?? 4, 0, 0, d.offset ?? 0) },
    uSurfSnow: { value: d.snow ?? 0 },
    uEmit: { value: extra.intensity ?? d.emit ?? 0 },
    uEnvSpec: { value: d.env ?? 1.2 },
    uEnvCC: { value: d.envCC ?? d.env ?? 1.2 },
    uProcAmp: { value: d.procAmp ?? 0.03 },
  };
  if (!t) { delete m.userData.uniforms.tAlb; delete m.userData.uniforms.tNrm; }
  m.userData.surface = name;
  m.onBeforeCompile = surfaceCompile;
  m.customProgramCacheKey = () => 'surf5' + fogTintDefine();
  m.name = 'surface:' + name + (snow ? '' : ':nosnow');
  return m;
}

// The (shared) material for a surface. opts: { snow = true, unique = false, intensity, kind }.
// Shared materials come in one instance per object kind ('mesh', 'inst', 'skin', 'batch'): three.js
// re-evaluates the program every time one material switches between a Mesh, an InstancedMesh and a
// SkinnedMesh, so instanced/skinned/batched users get their own copy (same shader, same programs).
// The renderer swaps them in by itself (kindSweep), so callers never need to pass `kind`.
const matInfo = new WeakMap();   // shared material -> [surface, snow]
export function surfaceMaterial(name, opts = {}) {
  const snow = opts.snow !== false;
  if (opts.unique || opts.intensity !== undefined) return makeSurfaceMaterial(name, snow, opts);
  const kind = opts.kind && opts.kind !== 'mesh' ? opts.kind : '';
  const key = name + (snow ? '' : '|n') + (kind ? '|' + kind : '');
  let m = matCache.get(key);
  if (!m) { m = makeSurfaceMaterial(name, snow); matCache.set(key, m); matInfo.set(m, [name, snow]); }
  return m;
}

// Create the `kind` copies of every shared surface material that exists, in the order the shared
// ones were made. Opaque draws are sorted by material id, which decides coplanar overlaps (road
// markings on asphalt): copies made in the same order keep the same winners. (batch.js)
export function prepareKind(kind) {
  const base = [...matCache.entries()].filter(([k]) => !/\|(inst|skin|batch)$/.test(k)).map(([, m]) => m).sort((a, b) => a.id - b.id);
  for (const m of base) { const inf = matInfo.get(m); if (inf) surfaceMaterial(inf[0], { snow: inf[1], kind }); }
}

// Material (array) for a GeoBuilder geometry. opts as realMesh.
export function realMaterials(geo, opts = {}) {
  const surfs = geo.userData?.surfaces || [opts.surface || 'plain'];
  const unique = opts.unique === true ? null : new Set(Array.isArray(opts.unique) ? opts.unique : []);
  const list = surfs.map((s) => {
    const tint = opts.tint ? opts.tint[s] : undefined;
    const own = opts.unique === true || unique?.has(s) || (tint !== undefined && tint !== null);
    const m = surfaceMaterial(s, { snow: opts.snow, unique: own });
    if (tint !== undefined && tint !== null) m.color.set(tint);
    return m;
  });
  return list.length === 1 ? list[0] : list;
}

// Build a Mesh for a GeoBuilder geometry with the right material per surface.
//   opts: cast/receive (shadows, default true), snow (default true; false for characters, the
//   player's car, signs, lights), unique (true or ['light', ...]: own material instances so they
//   can be changed per mesh), tint ({ paint: 0x335577 } per-surface colour multiplier, implies
//   unique), material (force one material for everything; legacy MAT.* values).
export function realMesh(geo, opts = {}) {
  ensureSurfaceAttributes(geo);
  let material = opts.material;
  if (material === MAT.toon) material = null;
  const mats = material || realMaterials(geo, opts);
  const mesh = new THREE.Mesh(geo, mats);
  mesh.castShadow = opts.cast ?? true;
  mesh.receiveShadow = opts.receive ?? true;
  const surfs = geo.userData?.surfaces || ['plain'];
  mesh.userData.surfaceMats = {};
  surfs.forEach((s, i) => { mesh.userData.surfaceMats[s] = Array.isArray(mats) ? mats[i] : mats; });
  return mesh;
}
// Compatibility: old code calls toonMesh(geo, { outline, cast, receive, material }).
export function toonMesh(geo, opts = {}) { return realMesh(geo, opts); }

// Turn the 'light' parts of a mesh on/off or dim them (mesh built with unique: ['light']).
export function setLight(mesh, intensity) {
  const m = mesh.userData.surfaceMats?.light;
  if (!m?.userData.uniforms) return;
  // A shared material would switch every lamp in town at once.
  for (const c of matCache.values()) if (c === m) { console.warn("setLight: build the mesh with realMesh(geo, { unique: ['light'] })"); return; }
  m.userData.uniforms.uEmit.value = intensity;
}

// Geometries not made by GeoBuilder (PlaneGeometry, BoxGeometry...) get the attributes the surface
// shader needs: white vertex colours and object-space triplanar coordinates.
export function ensureSurfaceAttributes(geo) {
  const n = geo.attributes.position.count;
  if (!geo.attributes.color) geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (!geo.attributes.tri) {
    const t = new Float32Array(n * 4), p = geo.attributes.position;
    for (let i = 0; i < n; i++) { t[i * 4] = p.getX(i); t[i * 4 + 1] = p.getY(i); t[i * 4 + 2] = p.getZ(i); t[i * 4 + 3] = 30.5; }
    geo.setAttribute('tri', new THREE.BufferAttribute(t, 4));
  }
  if (!geo.attributes.trin) geo.setAttribute('trin', geo.attributes.normal.clone());
  return geo;
}

// ---------------------------------------------------------------------------------------------
// Legacy material names, as PBR equivalents.

function initMaterials() {
  MAT.toon = surfaceMaterial('plain');
  MAT.burnt = makeSurfaceMaterial('plain', false);
  MAT.burnt.color.set(0x2a2522);
  MAT.burnt.roughness = 1;
  MAT.burnt.userData.uniforms.uTexA.value.set(1 / 2.4, 1.0, 0.0, 0.95);
  MAT.ghost = makeSurfaceMaterial('plain', false);
  MAT.ghost.transparent = true; MAT.ghost.opacity = 0.55; MAT.ghost.depthWrite = false;
  MAT.glass = surfaceMaterial('tinted');
  MAT.cloud = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, fog: false });
  MAT.water = surfaceMaterial('water');
  MAT.white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  MAT.mouth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  MAT.beam = new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
}

// Outlines are gone; these stay so old imports keep working.
let gradient;
export function toonGradient() {
  if (gradient) return gradient;
  gradient = new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.RedFormat);
  gradient.needsUpdate = true;
  return gradient;
}
export function outlineMat() { return MAT._noOutline ??= new THREE.MeshBasicMaterial({ visible: false }); }
export function outlineGeometry(geo) { return geo; }

// ---------------------------------------------------------------------------------------------
// Init

const pmremCache = {};
let sky, gtao, bloom, renderPass, outputPass, msaaTarget, aoSize = new THREE.Vector2();
export let gfxReady = Promise.resolve();

export function initGfx(container) {
  patchChunks();
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false, stencil: false });
  // Shader error checks query every program's status and log: on for tests and ?debug only.
  renderer.debug.checkShaderErrors = TEST || PARAMS.has('debug');
  // Debug: ?nomultidraw hides WEBGL_multi_draw, so three.js draws each range of a BatchedMesh on its
  // own (the world's StaticBatch merges neighbouring ranges: a handful of draws per surface).
  if (PARAMS.has('nomultidraw')) {
    const ex = renderer.extensions, has0 = ex.has.bind(ex), get0 = ex.get.bind(ex);
    ex.has = (n) => n !== 'WEBGL_multi_draw' && has0(n);
    ex.get = (n) => (n === 'WEBGL_multi_draw' ? null : get0(n));
  }
  detectGpu();
  QUALITY.tier = tierOf();
  const Q = QSET[QUALITY.tier];
  renderer.setPixelRatio(basePixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const tm = PARAMS.get('tm') || 'aces';
  renderer.toneMapping = tm === 'agx' ? THREE.AgXToneMapping : tm === 'neutral' ? THREE.NeutralToneMapping : tm === 'none' ? THREE.LinearToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = SKY.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.info.autoReset = false;
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  // One matrix update per frame, at the start of renderFrame (not one per pass).
  scene.matrixWorldAutoUpdate = false;
  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.25, 1800);

  initTextures();
  initMaterials();

  sun = new SunLight(new THREE.Color(...SKY.sunColor), SKY.sunIntensity);
  sun.position.copy(SUN_DIR).multiplyScalar(100);
  sun.castShadow = true;
  sun.shadow = new GameSunShadow();
  sun.shadow.mapSize.set(Q.shadow, Q.shadow);
  sun.shadow.camera.near = 1;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 2.5;
  scene.add(sun);
  hemi = new THREE.HemisphereLight(0xbfd2e6, 0x6a6a6a, 0); // not added: the HDRI lights the scene

  scene.fog = new THREE.FogExp2(0xa8b0b8, SKY.fogDensity);
  // (the surface textures are uploaded, mipmaps and all, while loading - not in the first frame)
  gfxReady = Promise.all([loadSky(), ...pending]).then(() => { for (const t of Object.values(TEX)) { renderer.initTexture(t.a); renderer.initTexture(t.n); } });

  // Post-processing chain. Only the scene pass is multisampled: bloom and the output read its
  // resolved texture (the composer's second target is never drawn into; keep it plain).
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  msaaTarget = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: Q.msaa });
  composer = new EffectComposer(renderer, msaaTarget);
  composer.renderTarget2.samples = 0;
  composer.swapBuffers();   // the scene pass draws into readBuffer: make that the multisampled one
  renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.14, 0.42, 2.6);
  composer.addPass(bloom);
  outputPass = new OutputPass();
  // It draws to the screen: no buffer swap after it, or every other frame the scene pass would land
  // in the composer's second target (which is not multisampled).
  outputPass.needsSwap = false;
  gradeOutput(outputPass);
  composer.addPass(outputPass);
  gtao = new GTAOPass(scene, camera, size.x, size.y);
  // Small radius and thin assumed thickness: contact occlusion (under cars, wall feet, corners), not
  // metre-wide dark clouds on a wall behind anything that stands in front of it.
  gtao.updateGtaoMaterial({ radius: +(PARAMS.get('aorad') || 0.9), distanceExponent: +(PARAMS.get('aoexp') || 1.6), thickness: +(PARAMS.get('aothick') || 0.5), scale: +(PARAMS.get('aoscale') || 1.0), samples: 12, distanceFallOff: +(PARAMS.get('aofall') || 1.0) });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  initPrepass();
  applyQuality();
  onResize();
  window.addEventListener('resize', onResize);
}

// Which GPU: integrated ones (and software renderers) start on the low tier under 'auto'.
function detectGpu() {
  let s = '';
  try {
    const gl = renderer.getContext();
    const e = gl.getExtension('WEBGL_debug_renderer_info');
    s = String((e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '');
  } catch (e) { /* no info */ }
  const discrete = /nvidia|geforce|quadro|rtx|gtx|radeon\s*(rx|pro|r9|r7|vii|hd\s*[5-9]\d{3})|radeon\s*\(tm\)\s*(rx|pro)|arc\s*(\(tm\))?\s*[ab]\d|apple m\d+\s*(pro|max|ultra)/i.test(s);
  const integrated = !discrete && /intel|iris|uhd|hd graphics|radeon(\(tm\))?\s*(graphics|\d{3}m)|radeon vega|vega \d+|apple|mali|adreno|powervr|swiftshader|llvmpipe|softpipe|lavapipe|microsoft basic/i.test(s);
  QUALITY.gpu = s.replace(/^ANGLE \((.*)\)$/, '$1').slice(0, 120);
  QUALITY.integrated = integrated;
  if (integrated && QUALITY.setting === 'auto') { QUALITY.autoTier = 'low'; QUALITY.reason = 'integrated GPU'; }
}

// Display grade inside the OutputPass, after tone mapping: a toe lift (ACES' own toe has a log-log
// slope of ~1.6 below mid grey, which crushes everything in shade - dark asphalt, spruces, windows -
// into navy-black; a power < 1 on the display-linear value brings it back towards a photographic
// response), saturation, and a gentle S-curve on the upper half only (crisp snow without crushing
// the shade), plus a touch of dither against banding.
function gradeOutput(pass) {
  const m = pass.material;
  pass.uniforms.uSat = m.uniforms.uSat = { value: SKY.saturation };
  pass.uniforms.uContrast = m.uniforms.uContrast = { value: SKY.contrast };
  pass.uniforms.uToe = m.uniforms.uToe = { value: SKY.toe };
  pass.uniforms.uBlack = m.uniforms.uBlack = { value: SKY.black };
  m.fragmentShader = m.fragmentShader
    .replace('varying vec2 vUv;', 'varying vec2 vUv;\nuniform float uSat;\nuniform float uContrast;\nuniform float uToe;\nuniform float uBlack;')
    .replace(/\}\s*$/, `
      {
        vec3 c = clamp( gl_FragColor.rgb, 0.0, 1.0 );
        #ifdef SRGB_TRANSFER
          vec3 lin = pow( c, vec3( 2.2 ) );
          lin = pow( lin, vec3( uToe ) );
          // soft black point: the deepest tones go down towards black (the toe lift alone left the
          // darkest pixels at a milky ~15 % grey), mid tones barely move, nothing is clipped
          lin = lin * lin / ( lin + uBlack ) * ( 1.0 + uBlack );
          float L = dot( lin, vec3( 0.2126, 0.7152, 0.0722 ) );
          // deep shade loses a little colour (as on film), so dark blue-lit surfaces stay grey, not navy
          lin = max( vec3( 0.0 ), mix( vec3( L ), lin, uSat * mix( ${SKY.shadowSat.toFixed(3)}, 1.0, smoothstep( 0.02, 0.2, L ) ) ) );
          c = pow( lin, vec3( 1.0 / 2.2 ) );
        #endif
        c = mix( c, c * c * ( 3.0 - 2.0 * c ), uContrast * smoothstep( 0.2, 0.6, c ) );
        float dn = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ) - 0.5;
        gl_FragColor.rgb = c + dn / 255.0;
      }
    }`);
  m.needsUpdate = true;
}

function basePixelRatio() { return PARAMS.has('pr') ? +PARAMS.get('pr') : Math.min(window.devicePixelRatio || 1, QUALITY.prCap); }
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(basePixelRatio() * QUALITY.scale);
  renderer.setSize(w, h);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  const s = renderer.getDrawingBufferSize(new THREE.Vector2());
  // AO (and its normal/depth pre-pass) at half resolution: it is soft and denoised anyway, and this
  // quarters the cost of the pre-pass fragments. tSSAO is sampled with full-resolution UVs.
  aoSize.set(Math.ceil(s.x / 2), Math.ceil(s.y / 2));
  gtao.setSize(aoSize.x, aoSize.y);
  G.uSSAO.value.x = 1 / s.x; G.uSSAO.value.y = 1 / s.y;
}

function applyQuality() {
  QUALITY.tier = tierOf();
  const Q = QSET[QUALITY.tier];
  bloom.enabled = Q.bloom;
  G.uShadowLow.value = Q.pcfLow;
  if (sun.shadow.mapSize.x !== Q.shadow) {
    sun.shadow.mapSize.set(Q.shadow, Q.shadow);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  if (composer.renderTarget1.samples !== Q.msaa) {
    composer.renderTarget1.samples = Q.msaa;
    composer.renderTarget1.dispose();
  }
  if (!(QUALITY.dyn && QUALITY.setting !== 'high')) QUALITY.scale = 1;
  QUALITY.scale = Math.max(Q.scaleMin, QUALITY.scale);
  if (Math.abs(renderer.getPixelRatio() - basePixelRatio() * QUALITY.scale) > 1e-3) onResize();
  AQ.skip = 30;
}
// 'auto' (default), 'high' or 'low'; see the Quality section at the top. Returns qualityInfo().
export function setQuality(level) {
  QUALITY.setting = QSETTINGS.includes(level) ? level : 'auto';
  if (QUALITY.setting !== 'auto') QUALITY.reason = 'chosen';
  else if (QUALITY.reason === 'chosen') QUALITY.reason = QUALITY.integrated ? 'integrated GPU' : 'default';
  if (renderer) applyQuality();
  return qualityInfo();
}

// Automatic quality, fed with the frame interval once per renderFrame. Windows of ~0.7 s:
//  - 'auto' on the high tier: if the frames of the first ~5 s of rendering (after the first-frame
//    hitches) average over 20 ms, or the render scale is at its minimum and frames stay over 24 ms,
//    drop to the low tier (once; reason 'slow').
//  - 'auto'/'low': render scale 0.6/0.7..1.0 in steps of 0.1. Down when a window averages over
//    18.5 ms (under ~54 fps); if a step down did not make frames >= 5 % faster the game is CPU-bound,
//    so the step is undone and held for 20 s. Up (a probe) after 5 windows at full rate; a probe that
//    makes frames slow again is undone and held off for 10 s, doubling each time.
const AQ = { n: 0, sum: 0, skip: 45, wins: [], trial: null, good: 0, slow: 0, cpuHold: 0, upHold: 0, backoff: 10000, decided: false, last: 0 };
function autoQuality(now) {
  const dt = AQ.last ? now - AQ.last : 0;
  AQ.last = now;
  if (QUALITY.setting === 'high' || dt <= 0) return;
  if (AQ.skip > 0) { AQ.skip--; AQ.n = AQ.sum = 0; return; }
  if (dt > 100 || document.hidden) return;   // hitches, tab switches
  AQ.sum += dt; AQ.n++;
  if (AQ.sum < 700 || AQ.n < 8) return;
  const T = AQ.sum / AQ.n;
  AQ.n = AQ.sum = 0;
  const Q = QSET[QUALITY.tier];
  if (QUALITY.setting === 'auto' && QUALITY.tier === 'high') {
    if (!AQ.decided) {
      AQ.wins.push(T);
      if (AQ.wins.length >= 6) {
        AQ.decided = true;
        const s = [...AQ.wins].sort((a, b) => a - b), med = s[s.length >> 1];
        if (med > 20) { QUALITY.autoTier = 'low'; QUALITY.reason = `slow (${med.toFixed(1)} ms)`; applyQuality(); return; }
      }
    }
    if (QUALITY.scale <= Q.scaleMin + 1e-3 && T > 24) {
      if (++AQ.slow >= 8) { QUALITY.autoTier = 'low'; QUALITY.reason = `slow (${T.toFixed(1)} ms)`; applyQuality(); return; }
    } else AQ.slow = 0;
  }
  if (!QUALITY.dyn) return;
  const setScale = (s) => { QUALITY.scale = Math.round(Math.max(Q.scaleMin, Math.min(1, s)) * 10) / 10; onResize(); AQ.skip = 12; };
  if (AQ.trial) {
    const tr = AQ.trial;
    AQ.trial = null;
    if (tr.dir < 0 && T > tr.T * 0.95) { setScale(tr.prev); AQ.cpuHold = now + 20000; }
    else if (tr.dir > 0 && T > 18.5) { setScale(tr.prev); AQ.upHold = now + AQ.backoff; AQ.backoff = Math.min(AQ.backoff * 2, 160000); }
    else if (tr.dir > 0) AQ.backoff = 10000;
    return;
  }
  if (T > 18.5) {
    AQ.good = 0;
    if (QUALITY.scale > Q.scaleMin + 1e-3 && now > AQ.cpuHold) { AQ.trial = { dir: -1, T, prev: QUALITY.scale }; setScale(QUALITY.scale - 0.1); }
  } else if (T < 17.4) {
    if (++AQ.good >= 5 && QUALITY.scale < 1 && now > AQ.upHold) { AQ.good = 0; AQ.trial = { dir: 1, T, prev: QUALITY.scale }; setScale(QUALITY.scale + 0.1); }
  } else AQ.good = 0;
}

// Snow cover on upward faces, 0..1 (1 = the default first-snow look).
export function setSnow(amount) { G.uSnow.value = Math.max(0, Math.min(1.5, amount)); }
export function getSnow() { return G.uSnow.value; }
export function setWetness(amount) { G.uWet.value = Math.max(0, Math.min(1, amount)); }
// Where the streets are, so asphalt can show wheel tracks and damp kerbs. Road centre lines run
// along x and z at (offset + k * pitch); halfWidth = asphalt half-width; lane = lane-centre offset;
// extent = the grid covers |x|, |z| <= extent. Defaults match world/layout.js (P 80, RHW 5.5).
export function setRoadGrid({ pitch = 80, offset = 40, halfWidth = 5.5, lane = 2.75, extent = 285.5 } = {}) {
  G.uRoad.value.set(pitch, offset, halfWidth, lane); G.uRoadExt.value = extent;
}

// ---------------------------------------------------------------------------------------------
// Sky: the HDRI drawn as the background (its sun warped onto SUN_DIR), and a sun-clamped copy of
// it PMREM'd into scene.environment.

async function loadSky() {
  const tex = await new HDRLoader().setDataType(THREE.FloatType).loadAsync(`${ASSETS}sky/${SKY.hdri}.hdr`);
  const W = tex.image.width, H = tex.image.height, D = tex.image.data;
  // Find the HDRI's sun (brightest texel) and some colour statistics.
  let best = 0, bi = 0;
  for (let i = 0, n = W * H; i < n; i++) { const l = D[i * 4] * 0.2126 + D[i * 4 + 1] * 0.7152 + D[i * 4 + 2] * 0.0722; if (l > best) { best = l; bi = i; } }
  const sx = bi % W, sy = (bi / W) | 0;
  const u = (sx + 0.5) / W, v = 1 - (sy + 0.5) / H; // texture is uploaded with flipY: row 0 = top
  const phi = (u - 0.5) * Math.PI * 2, elev = (v - 0.5) * Math.PI;
  const hdrSun = new THREE.Vector3(Math.cos(phi) * Math.cos(elev), Math.sin(elev), Math.sin(phi) * Math.cos(elev));
  // Rotation about Y taking the HDRI sun azimuth onto ours (environmentRotation semantics).
  const rot = Math.atan2(SUN_DIR.x, SUN_DIR.z) - Math.atan2(hdrSun.x, hdrSun.z);
  const warp = (elev - SKY.sunElev) / Math.sin(2 * SKY.sunElev);
  // Low-sky colours (elevation 6..14 degrees, above any treeline in the photo): away from the sun ->
  // fog colour; towards it -> the warm fog tint.
  const cold = new THREE.Color(0, 0, 0), warm = new THREE.Color(0, 0, 0), up = new THREE.Color(0, 0, 0), down = new THREE.Color(0, 0, 0);
  let nc = 0, nw = 0, nu = 0, nd = 0;
  const r0 = Math.floor(H * (0.5 - 14 / 180)), r1 = Math.floor(H * (0.5 - 6 / 180));
  for (let y = 0; y < H; y++) {
    const ev = (0.5 - (y + 0.5) / H) * Math.PI;
    for (let x = 0; x < W; x += 2) {
      const i = (y * W + x) * 4;
      const ph = ((x + 0.5) / W - 0.5) * Math.PI * 2;
      const d = Math.cos(ph) * hdrSun.x + Math.sin(ph) * hdrSun.z;
      const l = D[i] * 0.2126 + D[i + 1] * 0.7152 + D[i + 2] * 0.0722;
      if (y >= r0 && y <= r1) {
        if (d < -0.3) { cold.r += D[i]; cold.g += D[i + 1]; cold.b += D[i + 2]; nc++; }
        if (d > 0.92 && l < best * 0.05) { warm.r += D[i]; warm.g += D[i + 1]; warm.b += D[i + 2]; nw++; }
      }
      if (ev > 0.6 && l < best * 0.05) { up.r += D[i]; up.g += D[i + 1]; up.b += D[i + 2]; nu++; }
      if (ev < -0.3) { down.r += D[i]; down.g += D[i + 1]; down.b += D[i + 2]; nd++; }
    }
  }
  cold.multiplyScalar(1 / Math.max(1, nc)); warm.multiplyScalar(1 / Math.max(1, nw)); up.multiplyScalar(1 / Math.max(1, nu)); down.multiplyScalar(1 / Math.max(1, nd));
  // A touch of extra haze: the fog is a little brighter and greyer than the clean horizon.
  const fog = cold.clone().lerp(new THREE.Color(cold.r + cold.g + cold.b).multiplyScalar(1 / 3), 0.25);
  scene.fog.color.copy(fog);
  FOG_SUN_TINT.set(Math.min(2.5, warm.r / Math.max(1e-3, fog.r)), Math.min(2.5, warm.g / Math.max(1e-3, fog.g)), Math.min(2.5, warm.b / Math.max(1e-3, fog.b)));
  LIGHTING.fog.copy(fog); LIGHTING.sky.copy(up); LIGHTING.ground.copy(down);

  // Environment: the same sky with the sun clamped away (the SunLight provides it).
  const EW = 1024, EH = 512, E = new Float32Array(EW * EH * 4);
  const fx = W / EW, fy = H / EH, CLAMP = 6;
  for (let y = 0; y < EH; y++) for (let x = 0; x < EW; x++) {
    let r = 0, g = 0, b = 0;
    for (let yy = 0; yy < fy; yy++) for (let xx = 0; xx < fx; xx++) {
      const i = ((y * fy + yy) * W + (x * fx + xx)) * 4;
      r += D[i]; g += D[i + 1]; b += D[i + 2];
    }
    const k = 1 / (fx * fy); r *= k; g *= k; b *= k;
    // Below the horizon the photo's own ground (a field with dark patches) has nothing to do with our
    // town, and car paint / glass mirror it: fade it to its mean colour (snow), so reflections show a
    // bright, even ground under the horizon line.
    const ev = (0.5 - (y + 0.5) / EH) * Math.PI;
    if (ev < 0) {
      const t = Math.min(1, -ev / 0.17), w = t * t * (3 - 2 * t) * 0.9;
      r += (down.r - r) * w; g += (down.g - g) * w; b += (down.b - b) * w;
    }
    const l = r * 0.2126 + g * 0.7152 + b * 0.0722;
    if (l > CLAMP) {
      const s = CLAMP / l;
      r *= s; g *= s; b *= s;
    }
    const o = (y * EW + x) * 4, L = r * 0.2126 + g * 0.7152 + b * 0.0722, S = SKY.envSaturation, T = SKY.envTint;
    E[o] = (L + (r - L) * S) * T[0]; E[o + 1] = (L + (g - L) * S) * T[1]; E[o + 2] = (L + (b - L) * S) * T[2]; E[o + 3] = 1;
  }
  const envTex = new THREE.DataTexture(E, EW, EH, THREE.RGBAFormat, THREE.FloatType);
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  envTex.flipY = true;
  envTex.magFilter = envTex.minFilter = THREE.LinearFilter;
  envTex.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(envTex).texture;
  scene.environmentIntensity = SKY.envIntensity;
  scene.environmentRotation.set(0, rot, 0);
  pmremCache.env = scene.environment;
  envTex.dispose();
  pmrem.dispose();
  // The sun keeps SKY.sunColor (the HDRI's clamped-out sun is nearly white). Particles and custom
  // shaders get the skylight as the materials see it: desaturated, tinted, x envIntensity.
  LIGHTING.sunColor.copy(sun.color).multiplyScalar(sun.intensity);
  for (const c of [LIGHTING.sky, LIGHTING.ground]) {
    const L = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722, S = SKY.envSaturation, T = SKY.envTint;
    c.setRGB((L + (c.r - L) * S) * T[0] * SKY.envIntensity, (L + (c.g - L) * S) * T[1] * SKY.envIntensity, (L + (c.b - L) * S) * T[2] * SKY.envIntensity);
  }

  // Background: smooth the photo's RGBE quantisation steps away (a blur that grows with elevation,
  // so the horizon and the hills stay sharp while the open sky gets perfectly smooth gradients).
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  const skyRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, generateMipmaps: false });
  skyRT.texture.wrapS = THREE.RepeatWrapping;
  {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: tex }, uTexel: { value: new THREE.Vector2(1 / W, 1 / H) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
        void main() {
          float elev = ( vUv.y - 0.5 ) * 180.0;
          float r = clamp( ( elev - 7.0 ) / 12.0, 0.0, 1.0 ) * 7.0 + 0.5;
          vec3 c = vec3( 0.0 ); float wsum = 0.0;
          for ( int i = -4; i <= 4; i ++ ) for ( int j = -4; j <= 4; j ++ ) {
            vec2 o = vec2( float( i ), float( j ) ) * 0.25 * r;
            float w = exp( - dot( o, o ) / ( r * r * 0.5 + 1e-3 ) );
            c += texture2D( tSrc, vUv + o * uTexel * vec2( 1.0 / max( cos( radians( elev ) ), 0.2 ), 1.0 ) ).rgb * w;
            wsum += w;
          }
          gl_FragColor = vec4( c / wsum, 1.0 );
        }`,
      depthTest: false, depthWrite: false,
    }));
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    renderer.setRenderTarget(skyRT);
    renderer.render(q, cam);
    renderer.setRenderTarget(null);
    q.geometry.dispose(); q.material.dispose();
  }
  const v3 = (v) => `vec3(${v.x.toFixed(5)}, ${v.y.toFixed(5)}, ${v.z.toFixed(5)})`;
  const mat = new THREE.ShaderMaterial({
    uniforms: { tSky: { value: skyRT.texture }, uRot: { value: rot }, uWarp: { value: warp }, uFog: { value: fog }, uGain: { value: 1.0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform sampler2D tSky; uniform float uRot; uniform float uWarp; uniform vec3 uFog; uniform float uGain; varying vec3 vDir;
      #define PI 3.141592653589793
      void main(){
        vec3 d = normalize( vDir );
        float c = cos( uRot ), s = sin( uRot );
        vec3 r = vec3( c * d.x - s * d.z, d.y, s * d.x + c * d.z );
        float e = asin( clamp( r.y, -1.0, 1.0 ) );
        float e2 = e > 0.0 ? e + uWarp * sin( 2.0 * e ) : e;
        vec2 uv = vec2( atan( r.z, r.x ) / ( 2.0 * PI ) + 0.5, e2 / PI + 0.5 );
        vec3 col = texture2D( tSky, uv ).rgb * uGain;
        float sl = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
        col *= min( 1.0, 9.0 / max( sl, 1e-4 ) );
        float sunAmt = pow( max( dot( d, ${v3(SUN_DIR)} ), 0.0 ), 5.0 );
        vec3 fogCol = uFog * mix( vec3( 1.0 ), ${fogTintDefine()}, sunAmt );
        // The photo's own ground and treeline never show: the fade is measured in the *photo's*
        // elevation (e2, after the sun warp - a low photo sun stretches its treeline upwards), fully fog
        // below ~2.5 deg of it and up to ~4 deg of ours, so the 3D hills are the horizon. Near the horizon
        // nothing may be darker than the haze (a dark smear there reads as smoke). Above, a thin share of
        // the same height fog the scene gets (the photo already has its own haze).
        float cy = max( cameraPosition.y, 0.0 );
        float od = ${(SKY.hfogDensity * SKY.hfogHeight).toFixed(6)} * exp( - cy / ${SKY.hfogHeight.toFixed(3)} ) / max( d.y, 0.03 );
        float low = 1.0 - smoothstep( radians( 6.0 ), radians( 14.0 ), e2 );
        float fl = dot( fogCol, vec3( 0.2126, 0.7152, 0.0722 ) ) * 0.95;
        col = mix( col, col * max( 1.0, fl / max( sl, 1e-4 ) ), low );
        col = mix( col, fogCol * dot( col, vec3( 0.2126, 0.7152, 0.0722 ) ) / max( dot( fogCol, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-4 ), low * 0.6 );
        float hz = max( 1.0 - exp( - od * 0.35 ), max( 1.0 - smoothstep( radians( 2.5 ), radians( 7.0 ), e2 ), 1.0 - smoothstep( 0.035, 0.1, d.y ) ) );
        col = mix( col, fogCol, hz );
        // interleaved-gradient-noise dither (structure-free at screen scale)
        float dn = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ) - 0.5;
        col *= 1.0 + dn * 0.012;
        gl_FragColor = vec4( col, 1.0 );
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
  });
  sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  sky.userData.noAO = true;
  sky.castShadow = sky.receiveShadow = false;
  sky.onBeforeRender = (r, s, cam) => { sky.position.copy(cam.position); sky.updateMatrixWorld(); };
  scene.add(sky);
  MAT._sky = sky;
  // Recompile anything compiled before the fog tint was known.
  scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
  for (const m of matCache.values()) m.needsUpdate = true;
}

// Kept for main.js: the cascades follow the camera on their own.
export function followSun() {}
export function tickSky(t) { G.uTime.value = t; }

// ---------------------------------------------------------------------------------------------
// Frame
//
// renderFrame(): one scene matrix update, then
//  1. the shadow pre-pass: the sun's cascades only, rendered from inside a 1-triangle scene (three.js
//     needs a render state to draw shadow maps; nothing else is drawn). The near cascade every frame,
//     the far one every QSET.farEvery frames, and at once when the camera jumped or turned.
//  2. (high) the GTAO normal/depth pre-pass, through a camera whose far plane is AO_FAR: the AO is a
//     0.9 m contact term at half resolution, invisible further away, so nothing beyond is drawn.
//  3. the main pass (composer: scene -> bloom -> output grade).
// In 1 and 2 every multi-surface mesh is drawn as ONE call (its material array swapped for a single
// material - shadows and normals don't care about surfaces), and every object kind (mesh, instanced,
// skinned, batched) has its own depth / normal material, so three.js never re-evaluates programs
// between kinds. Particles, sky, markers, cards (userData.noAO), see-through things, points, lines and
// sprites are left out of both (no shadow, no AO normals). The object lists are rebuilt every 20
// frames; anything added in between joins at the next rebuild.
const AO_STRENGTH = +(PARAMS.get('aostr') || 1.3); // exponent on the AO term
const AO_FAR = +(PARAMS.get('aofar') || 80);
const FAR_EVERY = +(PARAMS.get('farevery') || 0);   // look-dev: re-render the far cascade every n frames
const KIND_NAMES = ['mesh', 'inst', 'skin', 'batch'];
const kindOf = (o) => (o.isBatchedMesh ? 3 : o.isInstancedMesh ? 1 : o.isSkinnedMesh ? 2 : 0);
const PRE = KIND_NAMES.map((k) => { const m = new THREE.MeshBasicMaterial(); m.name = 'pre:' + k; return m; });
const DEPTH = KIND_NAMES.map((k) => { const m = new THREE.MeshDepthMaterial(); m.name = 'depth:' + k; return m; });
let NORMAL = null, shScene = null, tinyRT = null, aoCam = null, frameNo = 0, lastFull = -99, lastMap = null;
const shLights = [];
const lastFullPos = new THREE.Vector3(1e9, 0, 0), lastFullDir = new THREE.Vector3(), _dir = new THREE.Vector3(), _clearCol = new THREE.Color();
const depthRange = new THREE.Vector2(0.25, AO_FAR);
const PL = { at: -1e9, hide: [], hideVis: [], multi: [], multiK: [], all: [], allK: [], saved: [] };

function initPrepass() {
  NORMAL = KIND_NAMES.map((k) => { const m = gtao.normalMaterial.clone(); m.name = 'aonormal:' + k; return m; });
  tinyRT = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  shScene = new THREE.Scene();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  const d = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }));
  d.frustumCulled = false;
  d.onBeforeRender = () => {
    const sm = renderer.shadowMap;
    sm.needsUpdate = true;
    sm.render(shLights, scene, camera);
    sm.needsUpdate = false;
  };
  shScene.add(d);
  shLights.push(sun);
  aoCam = new THREE.PerspectiveCamera();
  // A near-only shadow update must not wipe the far cascade: clear just the near tile of the atlas.
  const clear = renderer.clear.bind(renderer), sc = new THREE.Vector4();
  renderer.clear = function (color = true, depth = true, stencil = true) {
    const sh = sun.shadow;
    if (sh.nearOnly && sh.map && renderer.getRenderTarget() === sh.map) {
      const st = renderer.state;
      st.setScissorTest(true);
      st.scissor(sc.set(0, 0, sh.mapSize.x, sh.mapSize.y));
      clear(color, depth, stencil);
      st.setScissorTest(false);
      return;
    }
    clear(color, depth, stencil);
  };
}

const plain1 = (m) => !m || (!((m.map || m.alphaMap) && m.alphaTest > 0) && !m.alphaToCoverage && !m.displacementMap && !m.clippingPlanes?.length);
// Shared surface materials on instanced / skinned / batched objects -> that kind's own copy.
function kindSweep(o, k) {
  const m = o.material, kind = KIND_NAMES[k];
  if (Array.isArray(m)) {
    let out = null;
    for (let i = 0; i < m.length; i++) {
      const inf = matInfo.get(m[i]);
      if (!inf) continue;
      const v = surfaceMaterial(inf[0], { snow: inf[1], kind });
      if (v !== m[i]) { out ??= m.slice(); out[i] = v; }
    }
    if (out) o.material = out;
  } else {
    const inf = matInfo.get(m);
    if (inf) o.material = surfaceMaterial(inf[0], { snow: inf[1], kind });
  }
}
function rebuildLists() {
  PL.hide.length = PL.multi.length = PL.multiK.length = PL.all.length = PL.allK.length = 0;
  scene.traverse((o) => {
    if (o === scene) return;
    if (o.userData.noAO || o.isPoints || o.isLine || o.isSprite) { PL.hide.push(o); return; }
    if (!o.isMesh || !o.material) return;
    const arr = Array.isArray(o.material);
    if (!arr && o.material.transparent) { PL.hide.push(o); return; }
    const k = kindOf(o);
    if (k) kindSweep(o, k);
    PL.all.push(o); PL.allK.push(k);
    if (arr) { PL.multi.push(o); PL.multiK.push(k); }
    // (castShadow may be switched on later - people's LOD does - so every plain caster-to-be gets it)
    if (o.customDepthMaterial === undefined && (arr ? o.material.every(plain1) : plain1(o.material))) o.customDepthMaterial = DEPTH[k];
  });
  PL.at = frameNo;
}
function prepass(Q) {
  if (frameNo - PL.at >= 20) rebuildLists();
  const H = PL.hide, HV = PL.hideVis, A = PL.all, S = PL.saved, M = PL.multi, MK = PL.multiK;
  for (let i = 0; i < H.length; i++) { HV[i] = H[i].visible; H[i].visible = false; }
  for (let i = 0; i < A.length; i++) S[i] = A[i].material;
  for (let i = 0; i < M.length; i++) M[i].material = PRE[MK[i]];
  renderShadows(Q);
  if (Q.ao) {
    const AK = PL.allK;
    for (let i = 0; i < A.length; i++) if (S[i].visible !== false) A[i].material = NORMAL[AK[i]];
    renderNormals();
  }
  for (let i = 0; i < A.length; i++) A[i].material = S[i];
  for (let i = 0; i < H.length; i++) H[i].visible = HV[i];
  S.length = 0;
}
function renderShadows(Q) {
  const sh = sun.shadow, cp = camera.position;
  camera.getWorldDirection(_dir);
  const full = !sh.map || sh.map !== lastMap || frameNo - lastFull >= (FAR_EVERY || Q.farEvery) || cp.distanceToSquared(lastFullPos) > 36 || _dir.dot(lastFullDir) < 0.985;
  sh.nearOnly = !full;
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(tinyRT);
  renderer.render(shScene, camera);
  renderer.setRenderTarget(prev);
  sh.nearOnly = false;
  if (full) { lastFull = frameNo; lastMap = sh.map; lastFullPos.copy(cp); lastFullDir.copy(_dir); }
}
function renderNormals() {
  // (field by field: Object3D.copy would also JSON-clone userData every frame)
  aoCam.fov = camera.fov; aoCam.aspect = camera.aspect; aoCam.near = camera.near; aoCam.zoom = camera.zoom;
  aoCam.filmGauge = camera.filmGauge; aoCam.filmOffset = camera.filmOffset; aoCam.view = camera.view;
  aoCam.layers.mask = camera.layers.mask;
  aoCam.far = Math.min(camera.far, AO_FAR);
  aoCam.updateProjectionMatrix();
  camera.matrixWorld.decompose(aoCam.position, aoCam.quaternion, aoCam.scale);
  aoCam.updateMatrixWorld(true);
  depthRange.set(aoCam.near, aoCam.far);
  const r = renderer, prevRT = r.getRenderTarget(), prevAuto = r.autoClear, prevA = r.getClearAlpha();
  r.getClearColor(_clearCol);
  r.autoClear = false;
  r.setRenderTarget(gtao.normalRenderTarget);
  r.setClearColor(0x7777ff, 1);
  r.clear();
  r.render(scene, aoCam);
  r.autoClear = prevAuto;
  r.setClearColor(_clearCol, prevA);
  r.setRenderTarget(prevRT);
}
function renderAO() {
  const gm = gtao.gtaoMaterial;
  gm.uniforms.cameraNear.value = aoCam.near;
  gm.uniforms.cameraFar.value = aoCam.far;
  gm.uniforms.cameraProjectionMatrix.value.copy(aoCam.projectionMatrix);
  gm.uniforms.cameraProjectionMatrixInverse.value.copy(aoCam.projectionMatrixInverse);
  gm.uniforms.cameraWorldMatrix.value.copy(aoCam.matrixWorld);
  gtao._renderPass(renderer, gm, gtao.gtaoRenderTarget, 0xffffff, 1.0);
  gtao.pdMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(aoCam.projectionMatrixInverse);
  gtao._renderPass(renderer, gtao.pdMaterial, gtao.pdRenderTarget, 0xffffff, 1.0);
  G.tSSAO.value = gtao.pdRenderTarget.texture;
}

// Depth of the AO pre-pass (for soft particles), or null when AO is off. It only holds geometry
// within AO_FAR: sceneDepthRange() is its (near, far); a cleared texel (1.0) means "nothing near".
export function sceneDepthTexture() { return QSET[QUALITY.tier].ao && gtao ? gtao.depthTexture : null; }
export function sceneDepthRange() { return depthRange; }

// Compile every program the scene needs without blocking (KHR_parallel_shader_compile): call it
// during loading once the scene is populated (main.js: before the portraits), and await it before the
// first frame if possible. Hidden objects are included (three compiles the whole graph); materials
// are compiled as the composer's scene pass sees them (linear HDR target, no tone mapping).
export function precompile(root = scene) {
  if (!renderer || !composer) return Promise.resolve();
  rebuildLists();   // per-kind materials first, so the variants are what gets compiled
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(composer.renderTarget1);
  let p;
  try { p = renderer.compileAsync(root, camera, scene); } catch (e) { console.warn('precompile', e); p = Promise.resolve(); }
  renderer.setRenderTarget(prev);
  return p;
}

// Upload the vertex buffers of everything under `root` now (one draw of each into a 1x1 target, no
// colour, no depth), instead of in the first frame. With makeStatic that also frees the CPU arrays.
const UPLOAD_MAT = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false });
export function uploadGeometry(root = scene) {
  if (!renderer || !tinyRT) return;
  const tmp = new THREE.Scene(), culled = [];
  tmp.matrixWorldAutoUpdate = false;
  root.traverse((o) => { if (o.frustumCulled && (o.isMesh || o.isPoints || o.isLine)) { o.frustumCulled = false; culled.push(o); } });
  const kids = root === scene ? [...scene.children] : [root];
  for (const k of kids) tmp.children.push(k);   // borrowed, not re-parented
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(tinyRT);
  tmp.overrideMaterial = UPLOAD_MAT;
  try { renderer.render(tmp, camera); } catch (e) { console.warn('uploadGeometry', e); }
  renderer.setRenderTarget(prev);
  tmp.children.length = 0;
  for (const o of culled) o.frustumCulled = true;
}

// Static meshes: their matrices never change after this (one updateMatrix now), and their CPU-side
// vertex arrays are dropped once uploaded to the GPU (bounds are computed first). Positions and the
// index stay (so line-of-sight raycasts still hit it) unless the mesh is `userData.noAO` (cards,
// haze, far hills: not solid) or says `userData.raycastable = false`; those are no longer raycastable
// (raycast() is a no-op - looping over a dropped index would only produce NaNs, slowly).
// Used by the world for everything buildTown makes.
const EMPTY = new Map();
function dropArray() { this.array = EMPTY.get(this.array.constructor) || EMPTY.set(this.array.constructor, new this.array.constructor(0)).get(this.array.constructor); }
const noRaycast = () => {};
export function makeStatic(root, { freeArrays = true } = {}) {
  root.traverse((o) => {
    o.matrixAutoUpdate = false;
    o.updateMatrix();
    o.matrixWorldNeedsUpdate = true;
    const g = o.geometry;
    if (!freeArrays || !g || g.userData.keepArrays) return;
    if (!g.boundingSphere) g.computeBoundingSphere();
    if (!g.boundingBox) g.computeBoundingBox();
    if (o.isBatchedMesh) { o.computeBoundingSphere(); o.computeBoundingBox(); }
    const keep = o.userData.raycastable ?? !o.userData.noAO;
    for (const [k, a] of Object.entries(g.attributes)) if (!(keep && k === 'position') && a.isBufferAttribute && !a.isInterleavedBufferAttribute && a.array?.length) a.onUpload(dropArray);
    if (!keep) {
      if (g.index?.array?.length) g.index.onUpload(dropArray);
      o.raycast = noRaycast;
    }
  });
}

// Per-frame numbers for __stats(): CPU time of renderFrame (ms, smoothed), draw calls / triangles
// of the pre-passes (aoCalls = shadows + AO normals) vs everything, per pass in `pass` ([calls, tris]
// for shadow, ao, main), the GPU time of a frame with `&gputime` (gpuMs), the first frame (ms,
// programs) and the frame count.
export const gfxStats = { ms: 0, aoCalls: 0, calls: 0, tris: 0, pass: { shadow: [0, 0], ao: [0, 0], main: [0, 0] }, cpu: { matrices: 0, pre: 0, main: 0 }, gpuMs: 0, first: null, frames: 0 };
const _sh = { calls: 0, tris: 0 };
let gpuT = null;
function statsInit() {
  const smr = renderer.shadowMap.render;
  renderer.shadowMap.render = function (l, s, c) {
    const i = renderer.info.render, c0 = i.calls, t0 = i.triangles;
    smr.call(this, l, s, c);
    _sh.calls += i.calls - c0; _sh.tris += i.triangles - t0;
  };
  if (PARAMS.has('gputime')) {
    const gl = renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (ext) gpuT = { gl, ext, pending: [], q: null };
  }
}
function gpuBegin() {
  if (!gpuT) return;
  const { gl, ext } = gpuT;
  for (let k = gpuT.pending.length - 1; k >= 0; k--) {
    const q = gpuT.pending[k];
    if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) { const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6; gfxStats.gpuMs = ms; (gfxStats.gpuHist ??= []).push(ms); if (gfxStats.gpuHist.length > 2000) gfxStats.gpuHist.shift(); }
      gl.deleteQuery(q); gpuT.pending.splice(k, 1);
    }
  }
  gpuT.q = gl.createQuery();
  gl.beginQuery(ext.TIME_ELAPSED_EXT, gpuT.q);
}
function gpuEnd() {
  if (!gpuT || !gpuT.q) return;
  gpuT.gl.endQuery(gpuT.ext.TIME_ELAPSED_EXT);
  gpuT.pending.push(gpuT.q); gpuT.q = null;
}

export function renderFrame() {
  const t0 = performance.now();
  if (!gfxStats.frames) {
    statsInit();
    // Issue every program the scene needs at once before the first draw, so the driver can build
    // them in parallel instead of one blocking compile per new material.
    precompile();
  }
  autoQuality(document.timeline?.currentTime ?? t0);
  renderer.info.reset();
  _sh.calls = _sh.tris = 0;
  gpuBegin();
  scene.updateMatrixWorld();
  camera.updateMatrixWorld();
  const t1 = performance.now();
  const Q = QSET[QUALITY.tier];
  prepass(Q);
  if (Q.ao) renderAO();
  const t2 = performance.now();
  gfxStats.aoCalls = renderer.info.render.calls;
  const preTris = renderer.info.render.triangles;
  G.uSSAO.value.z = Q.ao ? AO_STRENGTH : 0.0;
  composer.render();
  G.uSSAO.value.z = 0;
  gpuEnd();
  const t3 = performance.now(), CP = gfxStats.cpu;
  CP.matrices += (t1 - t0 - CP.matrices) * 0.05; CP.pre += (t2 - t1 - CP.pre) * 0.05; CP.main += (t3 - t2 - CP.main) * 0.05;
  frameNo++;
  gfxStats.calls = renderer.info.render.calls;
  gfxStats.tris = renderer.info.render.triangles;
  const P = gfxStats.pass;
  P.shadow[0] = _sh.calls; P.shadow[1] = _sh.tris;
  P.ao[0] = gfxStats.aoCalls - _sh.calls; P.ao[1] = preTris - _sh.tris;
  P.main[0] = gfxStats.calls - gfxStats.aoCalls; P.main[1] = gfxStats.tris - preTris;
  const dt = performance.now() - t0;
  if (!gfxStats.frames) gfxStats.first = { ms: +dt.toFixed(1), matrices: +(t1 - t0).toFixed(1), pre: +(t2 - t1).toFixed(1), main: +(t3 - t2).toFixed(1), programs: renderer.info.programs?.length, at: +performance.now().toFixed(0) };
  gfxStats.frames++;
  gfxStats.ms += (dt - gfxStats.ms) * 0.05;
  gfxStats.last = dt;
}

// ---------------------------------------------------------------------------------------------
// Geometry helpers

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
export function mat(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));
}

const prim = {};
export const PRIM = {
  box: () => (prim.box ??= new THREE.BoxGeometry(1, 1, 1)),
  sphere: (w = 14, h = 10) => (prim['s' + w + '_' + h] ??= new THREE.SphereGeometry(0.5, w, h)),
  dome: () => (prim.dome ??= new THREE.SphereGeometry(0.5, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2)),
  cyl: (n = 12) => (prim['c' + n] ??= new THREE.CylinderGeometry(0.5, 0.5, 1, n)),
  cone: (n = 12) => (prim['k' + n] ??= new THREE.ConeGeometry(0.5, 1, n)),
  ico: (d = 1) => (prim['i' + d] ??= new THREE.IcosahedronGeometry(0.5, d)),
  torus: () => (prim.torus ??= new THREE.TorusGeometry(0.5, 0.12, 6, 16)),
  capsule: () => (prim.capsule ??= new THREE.CapsuleGeometry(0.5, 1, 4, 10)),
  prism: () => (prim.prism ??= makePrism()),
};

function makePrism() {
  const v = [];
  const A = [-0.5, 0, -0.5], B = [0.5, 0, -0.5], C = [0.5, 0, 0.5], D = [-0.5, 0, 0.5];
  const E = [-0.5, 1, 0], F = [0.5, 1, 0];
  const tri = (a, b, c) => v.push(...a, ...b, ...c);
  tri(A, E, F); tri(A, F, B); // north slope
  tri(D, C, F); tri(D, F, E); // south slope
  tri(A, D, E); // west gable
  tri(B, F, C); // east gable
  tri(A, B, C); tri(A, C, D); // bottom
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex([...Array(v.length / 3).keys()]);
  g.computeVertexNormals();
  return g;
}

export function makeWedge() {
  if (prim.wedge) return prim.wedge;
  const v = [];
  const A = [-0.5, 0, -0.5], B = [0.5, 0, -0.5], C = [0.5, 0, 0.5], D = [-0.5, 0, 0.5];
  const E = [-0.5, 1, 0.5], F = [0.5, 1, 0.5];
  const tri = (a, b, c) => v.push(...a, ...b, ...c);
  tri(A, E, F); tri(A, F, B);
  tri(D, C, F); tri(D, F, E);
  tri(A, D, E); tri(B, F, C);
  tri(A, B, C); tri(A, C, D);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex([...Array(v.length / 3).keys()]);
  g.computeVertexNormals();
  fixOutward(g);
  return (prim.wedge = g);
}

function fixOutward(g) {
  const p = g.attributes.position.array;
  let cx = 0, cy = 0, cz = 0;
  const n = p.length / 3;
  for (let i = 0; i < n; i++) { cx += p[i * 3]; cy += p[i * 3 + 1]; cz += p[i * 3 + 2]; }
  cx /= n; cy /= n; cz /= n;
  for (let t = 0; t < n; t += 3) {
    const a = t * 3, b = a + 3, c = a + 6;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (p[a] + p[b] + p[c]) / 3 - cx, my = (p[a + 1] + p[b + 1] + p[c + 1]) / 3 - cy, mz = (p[a + 2] + p[b + 2] + p[c + 2]) / 3 - cz;
    if (nx * mx + ny * my + nz * mz < 0) {
      for (let k = 0; k < 3; k++) { const tmp = p[b + k]; p[b + k] = p[c + k]; p[c + k] = tmp; }
    }
  }
  g.computeVertexNormals();
}
fixOutward(PRIM.prism());

// ---------------------------------------------------------------------------------------------
// GeoBuilder: merges coloured primitives into one geometry, now with surfaces.
//   g.use('wood').box(0xa33a2a, ...)   - following parts are painted wood panel
//   g.use('tile', { snow: 0.5 })       - per-part snow susceptibility 0..1 (default 1)
//   g.box(null, ...)                   - null colour = the surface's natural colour
// build() returns a geometry with one group per surface (geo.userData.surfaces lists them in
// group order); realMesh(geo) turns it into a Mesh with the right materials.

const _col = new THREE.Color(), _iq = new THREE.Quaternion(), _v = new THREE.Vector3(), _ms = new THREE.Vector3(), _mp = new THREE.Vector3();
let partCounter = 0;
export class GeoBuilder {
  constructor() { this.parts = []; this.surface = 'plain'; this.snowLvl = 15; }
  use(surface = 'plain', opts = {}) {
    this.surface = surface;
    this.snowLvl = Math.round(Math.max(0, Math.min(1, opts.snow ?? 1)) * 15);
    return this;
  }
  add(geo, color, m) {
    const g = new THREE.BufferGeometry();
    const pos = geo.attributes.position.clone(), nrm = geo.attributes.normal.clone();
    g.setAttribute('position', pos);
    g.setAttribute('normal', nrm);
    g.setIndex(geo.index ? geo.index.clone() : [...Array(geo.attributes.position.count).keys()]);
    _iq.identity();
    if (m) { g.applyMatrix4(m); m.decompose(_mp, _iq, _ms); _iq.invert(); }
    const surf = SURFACES[this.surface] ? this.surface : 'plain';
    _col.set(color === null || color === undefined ? SURFACES[surf].base : color);
    const n = pos.count;
    const c = new Float32Array(n * 3), t = new Float32Array(n * 4), tn = new Float32Array(n * 3);
    const seed = fract(Math.sin(++partCounter * 12.9898) * 43758.5453) * 0.999;
    let w = this.snowLvl * 2 + seed;
    // Window panes: coordinates relative to the pane centre, and the pane's half-width / half-height
    // in cm packed where the snow level goes (glass has no snow) - the shader fits curtains to it.
    let ox = 0, oy = 0, oz = 0;
    if (surf === 'glass') {
      if (!geo.boundingBox) geo.computeBoundingBox();
      const bb = geo.boundingBox, sc = m ? _ms : _v.set(1, 1, 1);
      const ex = (bb.max.x - bb.min.x) * Math.abs(sc.x) / 2, ey = (bb.max.y - bb.min.y) * Math.abs(sc.y) / 2, ez = (bb.max.z - bb.min.z) * Math.abs(sc.z) / 2;
      const cm = (v) => Math.max(0, Math.min(1023, Math.round(v * 100)));
      w = 2 * (cm(Math.max(ex, ez)) * 1024 + cm(ey)) + seed;
      if (m) { _mp.applyQuaternion(_iq); ox = _mp.x; oy = _mp.y; oz = _mp.z; }
    }
    for (let i = 0; i < n; i++) {
      c[i * 3] = _col.r; c[i * 3 + 1] = _col.g; c[i * 3 + 2] = _col.b;
      _v.fromBufferAttribute(pos, i).applyQuaternion(_iq);
      t[i * 4] = _v.x - ox; t[i * 4 + 1] = _v.y - oy; t[i * 4 + 2] = _v.z - oz; t[i * 4 + 3] = w;
      _v.fromBufferAttribute(nrm, i).applyQuaternion(_iq);
      tn[i * 3] = _v.x; tn[i * 3 + 1] = _v.y; tn[i * 3 + 2] = _v.z;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.setAttribute('tri', new THREE.BufferAttribute(t, 4));
    g.setAttribute('trin', new THREE.BufferAttribute(tn, 3));
    g._surface = surf;
    this.parts.push(g);
    return this;
  }
  box(color, x, y, z, w, h, d, ry = 0, rx = 0, rz = 0) { return this.add(PRIM.box(), color, mat(x, y, z, rx, ry, rz, w, h, d)); }
  boxB(color, x, y0, z, w, h, d, ry = 0) { return this.box(color, x, y0 + h / 2, z, w, h, d, ry); }
  sphere(color, x, y, z, sx, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0, seg) {
    return this.add(seg ? PRIM.sphere(seg, Math.max(6, (seg * 0.7) | 0)) : PRIM.sphere(), color, mat(x, y, z, rx, ry, rz, sx, sy, sz));
  }
  cyl(color, x, y, z, r, h, n = 12, rx = 0, ry = 0, rz = 0) { return this.add(PRIM.cyl(n), color, mat(x, y, z, rx, ry, rz, r * 2, h, r * 2)); }
  cone(color, x, y, z, r, h, n = 12, rx = 0, ry = 0, rz = 0) { return this.add(PRIM.cone(n), color, mat(x, y, z, rx, ry, rz, r * 2, h, r * 2)); }
  ico(color, x, y, z, s, d = 1, ry = 0) { return this.add(PRIM.ico(d), color, mat(x, y, z, 0, ry, 0, s, s, s)); }
  // Append another builder's parts (optionally transformed). Textures stay glued to the parts.
  merge(other, m) {
    for (const p of other.parts) { const g = p.clone(); g._surface = p._surface; if (m) g.applyMatrix4(m); this.parts.push(g); }
    return this;
  }
  build() {
    if (!this.parts.length) return null;
    const by = new Map();
    for (const p of this.parts) {
      ensurePartAttributes(p);
      const list = p.userData?.surfaces && p.userData.surfaces.length > 1 && p.groups.length ? splitBySurface(p) : [[p._surface || p.userData?.surfaces?.[0] || 'plain', p]];
      for (const [s, g] of list) { if (!by.has(s)) by.set(s, []); by.get(s).push(g); }
    }
    const surfaces = [...by.keys()];
    const merged = surfaces.map((s) => { const l = by.get(s); return l.length === 1 ? stripGeo(l[0]) : mergeGeometries(l.map(stripGeo), false); });
    const g = merged.length === 1 ? merged[0] : mergeGeometries(merged, true);
    g.userData = { surfaces };
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
  get empty() { return this.parts.length === 0; }
}
function fract(x) { return x - Math.floor(x); }
function stripGeo(g) {
  if (!g.userData || !Object.keys(g.userData).length) return g;
  const c = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color', 'tri', 'trin']) c.setAttribute(k, g.attributes[k]);
  c.setIndex(g.index);
  return c;
}
function ensurePartAttributes(p) {
  // Parts pushed straight into .parts (not via add) may lack our attributes.
  if (!p.index) p.setIndex([...Array(p.attributes.position.count).keys()]);
  ensureSurfaceAttributes(p);
  for (const k of Object.keys(p.attributes)) if (!['position', 'normal', 'color', 'tri', 'trin'].includes(k)) p.deleteAttribute(k);
}
function splitBySurface(geo) {
  const out = [];
  const idx = geo.index.array;
  for (const grp of geo.groups) {
    const s = geo.userData.surfaces[grp.materialIndex] || 'plain';
    const map = new Map(), ids = [];
    for (let i = grp.start; i < grp.start + grp.count; i++) { const v = idx[i]; if (!map.has(v)) { map.set(v, map.size); ids.push(v); } }
    const g = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'color', 'tri', 'trin']) {
      const a = geo.attributes[k], sz = a.itemSize, arr = new Float32Array(ids.length * sz);
      ids.forEach((v, j) => { for (let c = 0; c < sz; c++) arr[j * sz + c] = a.array[v * sz + c]; });
      g.setAttribute(k, new THREE.BufferAttribute(arr, sz));
    }
    const ni = new Uint32Array(grp.count);
    for (let i = 0; i < grp.count; i++) ni[i] = map.get(idx[grp.start + i]);
    g.setIndex(new THREE.BufferAttribute(ni, 1));
    out.push([s, g]);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Printed signs

export function textCanvas(text, w, h, { bg = '#f4f1ea', fg = '#1d2026', border = '#1d2026', font = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif', scale = 0.62, ppm = 96, stroke = null, borderW = 0.05, weight = '600' } = {}) {
  const cw = Math.min(2048, Math.round(w * ppm)), ch = Math.max(16, Math.round(cw * h / w));
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const x = cv.getContext('2d');
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, cw, ch); }
  if (border) { x.strokeStyle = border; x.lineWidth = ch * borderW; x.strokeRect(0, 0, cw, ch); }
  const lines = String(text).split('\n');
  let size = (ch * scale) / lines.length;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = `${weight} ${size}px ${font}`;
  const widest = Math.max(...lines.map((l) => x.measureText(l).width));
  if (widest > cw * 0.9) { size *= (cw * 0.9) / widest; x.font = `${weight} ${size}px ${font}`; }
  lines.forEach((l, i) => {
    const y = ch / 2 + (i - (lines.length - 1) / 2) * size * 1.08 + size * 0.06;
    if (stroke) { x.strokeStyle = stroke; x.lineWidth = size * 0.12; x.strokeText(l, cw / 2, y); }
    x.fillStyle = fg;
    x.fillText(l, cw / 2, y);
  });
  return cv;
}

// A printed sign under the scene lighting (semi-matte plastic/painted metal), not an unlit sticker.
// opts: textCanvas options + double (two-sided), glow (0..1 faint self-illumination, e.g. lit signs).
export function signMesh(text, w, h, opts = {}) {
  const tex = new THREE.CanvasTexture(textCanvas(text, w, h, opts));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.55, metalness: 0, transparent: !opts.bg, alphaTest: opts.bg ? 0 : 0.02,
    side: opts.double ? THREE.DoubleSide : THREE.FrontSide,
    emissive: opts.glow ? 0xffffff : 0x000000, emissiveMap: opts.glow ? tex : null, emissiveIntensity: opts.glow || 0,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }));
  m.castShadow = false;
  m.receiveShadow = true;
  return m;
}
