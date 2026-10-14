// Particles: soft, lit, camera-facing sprites (smoke, exhaust, steam, snow powder), additive fire
// and sparks with motion streaks, star-shaped glints, tyre tracks, and snowfall around the camera
// (small flakes with a short motion streak, denser close to the camera).
// Same API as the old cartoon puffs: spawn/smoke/fire/explosion/dust/sparkle/sparks/shame/splash/
// skid/tick, plus snowfall(on, intensity) and exhaust(x, y, z, vx, vz).

import { THREE, LIGHTING, SUN_DIR, FOG_GLSL, sceneDepthTexture, sceneDepthRange, camera as gameCamera, renderer as gameRenderer } from '../gfx.js';

const MAX = 900;          // alpha-blended puffs
const MAXA = 500;         // additive (fire, sparks, glints)
const SKIDS = 1400;
const FLAKES = 22000;     // snowfall, in a 40 m box round the camera...
const FLAKES_NEAR = 18000;// ...plus a 14 m box (several times the density close to the camera)

// Shared uniforms for all particle shaders.
const U = {
  uSunDir: { value: SUN_DIR },
  uSunCol: { value: LIGHTING.sunColor },
  uSky: { value: LIGHTING.sky },
  uGround: { value: LIGHTING.ground },
  uFog: { value: LIGHTING.fog },
  uFogDensity: { value: LIGHTING.fogExp2 },
  tDepth: { value: null },
  uSoft: { value: 0 },
  uNearFar: { value: new THREE.Vector2(0.25, 1800) },
  uRes: { value: new THREE.Vector2(1, 1) },
  uTime: { value: 0 },
};

// Puffs are procedural (no sprite texture): a soft ball whose edge is eaten away by a per-particle
// noise field that drifts and erodes with age, so smoke and powder billow and fray instead of being
// smooth discs. Three modes (iMisc.w): 0 lit puff (smoke, steam, snow powder: lit by the sun and the
// sky like a translucent ball, brighter on the sun side of its own billows), 1 flat glow (sparks:
// colour = emission), 2 fire (colour from a temperature ramp, hottest in the core of each flame and
// cooling with age: white-yellow -> orange -> dark red; the core is far above the bloom threshold so
// flames read in daylight), 3 glint (a tiny hot core with a thin four-point star that twinkles).
const PUFF_VERT = `
attribute vec4 iPos;    // xyz, size
attribute vec4 iCol;    // rgb (linear albedo, emission or fire tint), alpha
attribute vec4 iMisc;   // rotation, seed, stretch, mode (0 lit, 1 glow, 2 fire)
attribute vec4 iAux;    // age 0..1, heat (fire), erosion, -
attribute vec3 iVel;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSky;
uniform vec3 uGround;
varying vec2 vQ;
varying vec4 vCol;
varying vec3 vLight;
varying vec3 vSunLit;
varying float vDepth;
varying float vSize;
varying vec4 vMisc;
varying vec4 vAux;
varying vec3 vWorld;
varying vec2 vSunS;
void main() {
  vec4 mv = viewMatrix * vec4( iPos.xyz, 1.0 );
  float c = cos( iMisc.x ), s = sin( iMisc.x );
  vec2 p = position.xy;
  vec2 off;
  if ( iMisc.z > 0.0 ) {
    vec2 v = ( viewMatrix * vec4( iVel, 0.0 ) ).xy;
    float l = length( v );
    vec2 dir = l > 1e-4 ? v / l : vec2( 1.0, 0.0 );
    vec2 nrm = vec2( -dir.y, dir.x );
    off = dir * p.x * ( iPos.w + l * iMisc.z ) + nrm * p.y * iPos.w;
  } else {
    off = vec2( c * p.x - s * p.y, s * p.x + c * p.y ) * iPos.w;
  }
  mv.xy += off;
  gl_Position = projectionMatrix * mv;
  vQ = position.xy * 2.0;
  // the noise field turns with the sprite, so neighbouring puffs never look alike
  vQ = vec2( c * vQ.x + s * vQ.y, - s * vQ.x + c * vQ.y );
  vCol = iCol;
  vMisc = iMisc;
  vAux = iAux;
  vDepth = -mv.z;
  vSize = iPos.w;
  vWorld = iPos.xyz;
  // sun direction on screen, in the rotated noise frame (lit side of the billows)
  vec2 ss = ( viewMatrix * vec4( uSunDir, 0.0 ) ).xy;
  ss = length( ss ) > 1e-4 ? normalize( ss ) : vec2( 0.0, 1.0 );
  vSunS = vec2( c * ss.x + s * ss.y, - s * ss.x + c * ss.y );
  // a translucent ball: the sun wraps round it (no hard lit side), sky from above, snow-bright ground below
  vec3 n = normalize( vec3( position.xy * 0.8, 0.8 ) );
  vec3 nW = ( vec4( n, 0.0 ) * viewMatrix ).xyz;
  vSunLit = uSunCol * ( 0.5 + 0.5 * dot( nW, uSunDir ) ) * 0.32;
  vLight = mix( uGround, uSky, nW.y * 0.5 + 0.5 ) * 1.1;
}
`;
const PUFF_FRAG = `
uniform sampler2D tDepth;
uniform float uSoft;
uniform vec2 uNearFar;
uniform vec2 uRes;
uniform vec3 uFog;
uniform float uFogDensity;
${FOG_GLSL}
varying vec2 vQ;
varying vec4 vCol;
varying vec3 vLight;
varying vec3 vSunLit;
varying float vDepth;
varying float vSize;
varying vec4 vMisc;
varying vec4 vAux;
varying vec3 vWorld;
varying vec2 vSunS;
float linDepth( float d ) { float z = d * 2.0 - 1.0; return ( 2.0 * uNearFar.x * uNearFar.y ) / ( uNearFar.y + uNearFar.x - z * ( uNearFar.y - uNearFar.x ) ); }
float pHash( vec2 p ) { p = fract( p * vec2( 0.1031, 0.1030 ) ); p += dot( p, p.yx + 33.33 ); return fract( ( p.x + p.y ) * p.x ); }
float pNoise( vec2 x ) {
  vec2 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( pHash( i ), pHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( pHash( i + vec2( 0.0, 1.0 ) ), pHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
float pFbm( vec2 p ) { return pNoise( p ) * 0.55 + pNoise( p * 2.07 + 5.3 ) * 0.3 + pNoise( p * 4.3 + 9.1 ) * 0.15; }
vec3 fireRamp( float h ) {
  vec3 c = mix( vec3( 0.22, 0.025, 0.004 ), vec3( 1.0, 0.22, 0.02 ), smoothstep( 0.0, 0.35, h ) );
  c = mix( c, vec3( 1.0, 0.55, 0.12 ), smoothstep( 0.3, 0.65, h ) );
  c = mix( c, vec3( 1.0, 0.88, 0.62 ), smoothstep( 0.65, 1.0, h ) );
  return c * ( 0.5 + 15.0 * h * h );
}
void main() {
  float r = length( vQ );
  if ( r > 1.0 ) discard;
  float age = vAux.x, mode = vMisc.w;
  vec2 o = vec2( vMisc.y * 37.0, vMisc.y * 91.0 );
  float dens, a;
  vec3 col;
  if ( mode > 2.5 ) {
    // glint: a pinpoint and a thin four-point star (turning with the sprite), twinkling
    float tw = 0.55 + 0.45 * sin( age * 38.0 + vMisc.y * 40.0 );
    float core = exp( - r * r * 40.0 );
    float star = max( exp( - abs( vQ.x ) * 26.0 ) * ( 1.0 - abs( vQ.y ) ), exp( - abs( vQ.y ) * 26.0 ) * ( 1.0 - abs( vQ.x ) ) );
    a = ( core + star * 0.6 * tw ) * vCol.a * ( 0.7 + 0.3 * tw );
    col = vCol.rgb;
  } else if ( mode > 1.5 ) {
    // fire: a flame tongue / fireball blob with a noisy, licking edge; hotter in the core
    float n = pFbm( vQ * 1.7 + o + vec2( 0.0, - age * 2.2 ) );
    dens = ( 1.0 - r ) * 1.5 + ( n - 0.5 ) * 1.3 - age * 0.45;
    a = smoothstep( 0.0, 0.25, dens ) * vCol.a;
    float h = clamp( dens * 0.9, 0.0, 1.0 ) * vAux.y;
    col = fireRamp( h ) * vCol.rgb;
  } else if ( mode > 0.5 ) {
    a = smoothstep( 1.0, 0.25, r ) * vCol.a;
    col = vCol.rgb;
  } else {
    // smoke / steam / powder: billows, eroding into wisps as the puff ages
    float n = pFbm( vQ * 1.6 + o + vec2( 0.0, - age * 0.7 ) );
    float erode = vAux.z * ( 0.25 + age * 0.75 );
    dens = ( 1.0 - r * r ) * 1.25 + ( n - 0.5 ) * 1.1 - erode;
    a = smoothstep( 0.0, 0.45, dens ) * vCol.a;
    // self-shading: the side of each billow facing the sun is brighter
    float n2 = pFbm( vQ * 1.6 + o + vec2( 0.0, - age * 0.7 ) + vSunS * 0.22 );
    float lit = clamp( 0.65 + ( n - n2 ) * 3.0 + dot( vQ, vSunS ) * 0.2, 0.25, 1.15 );
    col = vCol.rgb * ( vLight + vSunLit * lit );
  }
  // soft contact with the scene: the puff is a ball of this size, so it fades out as the geometry
  // cuts through its depth (no straight edge where it meets a kerb or a wall)
  if ( uSoft > 0.5 ) {
    // (the depth pre-pass only holds geometry within its far plane: a cleared texel = nothing there)
    float dz = texture2D( tDepth, gl_FragCoord.xy / uRes ).x;
    float scene = dz >= 0.99999 ? 1e6 : linDepth( dz );
    float th = max( vSize * 0.5 * sqrt( max( 1.0 - r * r, 0.0 ) ), 0.05 );
    a *= clamp( ( scene - ( vDepth - th ) ) / ( 2.0 * th ), 0.0, 1.0 );
  }
  a *= clamp( ( vDepth - 0.4 ) / 1.2, 0.0, 1.0 );
  if ( a < 0.002 ) discard;
  float f = gameFogAmount( cameraPosition, vWorld - cameraPosition, uFogDensity );
  #ifdef ADDITIVE
    col *= 1.0 - f;
    gl_FragColor = vec4( col * a, a );
  #else
    col = mix( col, uFog, f );
    gl_FragColor = vec4( col * a, a );
  #endif
}
`;

class PuffSystem {
  constructor(scene, max, additive) {
    this.max = max;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aAux = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iCol', this.aCol); g.setAttribute('iMisc', this.aMisc); g.setAttribute('iAux', this.aAux); g.setAttribute('iVel', this.aVel);
    g.instanceCount = 0;
    const m = new THREE.ShaderMaterial({
      uniforms: U, vertexShader: PUFF_VERT, fragmentShader: PUFF_FRAG,
      transparent: true, depthWrite: false, premultipliedAlpha: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      defines: additive ? { ADDITIVE: 1 } : {},
    });
    if (!additive) { m.blending = THREE.CustomBlending; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor; }
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 6 : 5;
    this.mesh.userData.noAO = true;
    scene.add(this.mesh);
    this.P = [];
    for (let i = 0; i < max; i++) this.P.push({ life: 0 });
    this.next = 0;
  }
  spawn(o) {
    let i = this.next;
    for (let k = 0; k < 8 && this.P[i].life > 0; k++) i = (i + 1) % this.max;
    this.next = (i + 1) % this.max;
    const p = this.P[i];
    Object.assign(p, o);
    p.max = p.life;
    p.seed = Math.random();
    return p;
  }
  tick(dt) {
    let n = 0;
    const pos = this.aPos.array, col = this.aCol.array, misc = this.aMisc.array, aux = this.aAux.array, vel = this.aVel.array;
    for (const p of this.P) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) continue;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vz *= k; p.vy = p.vy * k - p.grav * dt + (p.buoy || 0) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.floor !== undefined && p.y < p.floor) { p.y = p.floor; p.vy = Math.abs(p.vy) * 0.25; p.vx *= 0.6; p.vz *= 0.6; }
      p.rot += p.spin * dt;
      const t = 1 - p.life / p.max;
      const s = p.s0 + (p.s1 - p.s0) * (1 - (1 - t) * (1 - t));
      const a = p.a * Math.min(1, t * p.fadeIn) * Math.pow(1 - t, p.fadeOut);
      let r = p.r, g = p.g, b = p.b;
      if (p.ramp) { const c = p.ramp(t); r = c[0]; g = c[1]; b = c[2]; }
      pos[n * 4] = p.x; pos[n * 4 + 1] = p.y; pos[n * 4 + 2] = p.z; pos[n * 4 + 3] = s;
      col[n * 4] = r; col[n * 4 + 1] = g; col[n * 4 + 2] = b; col[n * 4 + 3] = a;
      misc[n * 4] = p.rot; misc[n * 4 + 1] = p.seed; misc[n * 4 + 2] = p.stretch || 0; misc[n * 4 + 3] = p.mode || 0;
      aux[n * 4] = t; aux[n * 4 + 1] = p.heat === undefined ? 1 : p.heat * (1 - t * (p.cool ?? 0.85)); aux[n * 4 + 2] = p.erode ?? 0.5; aux[n * 4 + 3] = 0;
      vel[n * 3] = p.vx; vel[n * 3 + 1] = p.vy; vel[n * 3 + 2] = p.vz;
      n++;
    }
    this.mesh.geometry.instanceCount = n;
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aMisc.needsUpdate = this.aAux.needsUpdate = this.aVel.needsUpdate = true;
    for (const [at, sz] of [[this.aPos, 4], [this.aCol, 4], [this.aMisc, 4], [this.aAux, 4], [this.aVel, 3]]) { at.clearUpdateRanges(); at.addUpdateRange(0, n * sz); }
  }
}

const SKID_VERT = `
attribute vec4 iData; // x: alpha, y: kind (0 asphalt, 1 snow), z: phase
varying vec2 vUv;
varying vec4 vData;
varying float vDepth;
void main() {
  vUv = uv;
  vData = iData;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const SKID_FRAG = `
varying vec2 vUv;
varying vec4 vData;
varying float vDepth;
void main() {
  float edge = smoothstep( 0.0, 0.3, vUv.x ) * smoothstep( 1.0, 0.7, vUv.x );
  float tread = 0.8 + 0.2 * step( 0.5, fract( vUv.y * 5.0 + vData.z ) );
  float grain = 0.75 + 0.25 * fract( sin( dot( floor( vUv * vec2( 6.0, 9.0 ) ) + vData.z * 7.0, vec2( 12.99, 78.23 ) ) ) * 43758.55 );
  float a = vData.x * edge * tread * grain * smoothstep( 90.0, 30.0, vDepth );
  vec3 mark = vData.y > 0.5 ? vec3( 0.8, 0.82, 0.86 ) : vec3( 0.42, 0.41, 0.4 );
  gl_FragColor = vec4( mix( vec3( 1.0 ), mark, a ), 1.0 );
}`;

// ---------------------------------------------------------------------------------------------
// Snowfall: GPU-wrapped flakes in two boxes that travel with the camera (40 m, and 14 m for the
// density close by). Each flake is a camera-facing streak quad: ~1 cm wide (at least a pixel; a
// flake smaller than that fades instead of shrinking, so nothing shimmers) and stretched along its
// projected fall over ~1/45 s, so close flakes read as short streaks and far ones as specks.

const SNOW_VERT = `
attribute vec4 seed;    // xyz: position in the box (0..1), w: index (0..1) against the snow amount
attribute float box;    // box size (m)
uniform float uTime;
uniform vec3 uCam;
uniform float uCount;
uniform vec3 uSunCol;
uniform vec3 uSky;
uniform vec2 uRes;
uniform float uPx;      // radians per pixel (vertical)
uniform vec2 uWind;     // a blizzard's wind (m/s, xz) and how far it has carried the flakes so far
uniform vec2 uWindOff;
varying float vA;
varying vec3 vCol;
varying vec2 vQ;
void main() {
  float fall = 0.8 + fract( seed.x * 13.17 + seed.z * 7.3 ) * 0.7;
  float ph = seed.w * 20.0 + seed.y * 7.0;
  vec3 p = seed.xyz * box;
  p.y -= uTime * fall;
  p.x += uTime * 0.35 + sin( uTime * 0.7 + ph ) * 0.4;
  p.z += sin( uTime * 0.5 + seed.x * 30.0 ) * 0.4;
  p.xz += uWindOff;
  vec3 rel = mod( p - uCam + box * 0.5, box ) - box * 0.5;
  vec3 w = uCam + rel;
  vec3 vel = vec3( 0.35 + cos( uTime * 0.7 + ph ) * 0.28, - fall, cos( uTime * 0.5 + seed.x * 30.0 ) * 0.2 );
  vel.xz += uWind * ( 0.85 + 0.3 * fract( seed.z * 5.31 ) );
  vec4 mv = viewMatrix * vec4( w, 1.0 );
  vec4 c0 = projectionMatrix * mv;
  vec4 c1 = projectionMatrix * viewMatrix * vec4( w - vel * 0.022, 1.0 );
  float dist = - mv.z;
  vA = 0.0; vQ = vec2( 0.0 ); vCol = vec3( 0.0 );
  if ( dist < 0.25 || c1.w < 0.05 ) { gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); return; }
  vec2 s0 = c0.xy / c0.w * 0.5 * uRes, s1 = c1.xy / c1.w * 0.5 * uRes;
  vec2 d = s1 - s0; float len = length( d );
  vec2 dir = len > 1e-3 ? d / len : vec2( 0.0, - 1.0 ), nrm = vec2( - dir.y, dir.x );
  float size = 0.007 + fract( seed.y * 7.13 ) * 0.006;           // flake diameter (m)
  float px = size / ( dist * uPx );
  float wPx = max( px, 1.15 ), lPx = max( len, wPx );
  vec2 sp = s0 + dir * ( position.y * lPx ) + nrm * ( position.x * wPx );
  gl_Position = vec4( sp / ( 0.5 * uRes ) * c0.w, c0.z, c0.w );
  vQ = vec2( position.x * 2.0, position.y );
  // sub-pixel flakes fade instead of shrinking; long streaks spread the same light thinner
  float cover = min( 1.0, px / 1.15 ) * clamp( wPx * 2.0 / ( lPx + wPx ), 0.35, 1.0 );
  vA = step( seed.w, uCount ) * cover * smoothstep( 0.3, 1.2, dist ) * smoothstep( box * 0.5, box * 0.3, length( rel ) ) * 0.9;
  vCol = uSky * 1.4 + uSunCol * 0.18;
}`;
const SNOW_FRAG = `
varying float vA;
varying vec3 vCol;
varying vec2 vQ;
void main() {
  float a = ( 1.0 - smoothstep( 0.35, 1.0, abs( vQ.x ) ) ) * ( 1.0 - 0.55 * vQ.y ) * vA;
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( vCol * a, a );
}`;

// ---------------------------------------------------------------------------------------------

let alpha, add, skidMesh, skidData, skidNext = 0, snow;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const _c = new THREE.Color();
const rnd = (a = 1) => (Math.random() - 0.5) * 2 * a;
const lin = (hex) => { _c.set(hex); return [_c.r, _c.g, _c.b]; };

function puff(x, y, z, rgb, o = {}) {
  return alpha.spawn({
    x, y, z, vx: o.vx ?? 0, vy: o.vy ?? 0, vz: o.vz ?? 0, r: rgb[0], g: rgb[1], b: rgb[2], a: o.a ?? 0.6,
    s0: o.s0 ?? 0.4, s1: o.s1 ?? 1.6, life: o.life ?? 1.5, drag: o.drag ?? 1.2, grav: o.grav ?? 0, buoy: o.buoy ?? 0,
    rot: Math.random() * 6.28, spin: rnd(0.5), fadeIn: o.fadeIn ?? 6, fadeOut: o.fadeOut ?? 1.4, mode: 0, ramp: null, stretch: 0, floor: o.floor, erode: o.erode ?? 0.5,
  });
}
function glow(x, y, z, rgb, o = {}) {
  return add.spawn({
    x, y, z, vx: o.vx ?? 0, vy: o.vy ?? 0, vz: o.vz ?? 0, r: rgb[0], g: rgb[1], b: rgb[2], a: o.a ?? 1,
    s0: o.s0 ?? 0.3, s1: o.s1 ?? 0.1, life: o.life ?? 0.5, drag: o.drag ?? 1, grav: o.grav ?? 0, buoy: o.buoy ?? 0,
    rot: Math.random() * 6.28, spin: o.spin ?? rnd(2), fadeIn: o.fadeIn ?? 30, fadeOut: o.fadeOut ?? 1, mode: o.mode ?? 1, ramp: o.ramp || null, stretch: o.stretch || 0, floor: o.floor,
  });
}
// A flame tongue or fireball blob: colour from the temperature ramp in the shader. heat 0..1 at birth,
// cooling with age (cool = share of the heat lost by the end of its life); tint multiplies the ramp.
function flame(x, y, z, o = {}) {
  // additive for explosions (light added on top of everything); 'alpha' for steady fires, so twenty
  // overlapping tongues converge on the flame colour instead of summing to a white blob
  return (o.blend === 'alpha' ? alpha : add).spawn({
    x, y, z, vx: o.vx ?? 0, vy: o.vy ?? 0, vz: o.vz ?? 0, r: o.tint?.[0] ?? 1, g: o.tint?.[1] ?? 1, b: o.tint?.[2] ?? 1, a: o.a ?? 1,
    s0: o.s0 ?? 0.8, s1: o.s1 ?? 0.3, life: o.life ?? 0.6, drag: o.drag ?? 1.5, grav: 0, buoy: o.buoy ?? 1.2,
    rot: Math.random() * 6.28, spin: rnd(1.2), fadeIn: o.fadeIn ?? 12, fadeOut: o.fadeOut ?? 0.8, mode: 2, ramp: null, stretch: o.stretch ?? 0, heat: o.heat ?? 1, cool: o.cool ?? 0.85,
  });
}
const sparkRamp = (t) => [9 * (1 - t) + 1, 4.5 * (1 - t) * (1 - t) + 0.3, 1.2 * (1 - t) * (1 - t) * (1 - t)];

export const fx = {
  // Optional hook from the world: (x, z) => 'snow' | 'asphalt' | ... for tyre tracks and powder.
  surfaceAt: null,

  init(scene) {
    alpha = new PuffSystem(scene, MAX, false);
    add = new PuffSystem(scene, MAXA, true);

    const sg = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    skidData = new THREE.InstancedBufferAttribute(new Float32Array(SKIDS * 4), 4).setUsage(THREE.DynamicDrawUsage);
    sg.setAttribute('iData', skidData);
    const sm = new THREE.ShaderMaterial({
      vertexShader: SKID_VERT, fragmentShader: SKID_FRAG, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    skidMesh = new THREE.InstancedMesh(sg, sm, SKIDS);
    skidMesh.frustumCulled = false;
    skidMesh.renderOrder = 1;
    skidMesh.userData.noAO = true;
    for (let i = 0; i < SKIDS; i++) skidMesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    scene.add(skidMesh);

    const NF = FLAKES + FLAKES_NEAR;
    const seeds = new Float32Array(NF * 4), boxes = new Float32Array(NF);
    for (let i = 0; i < NF; i++) {
      const near = i >= FLAKES, k = near ? (i - FLAKES) / FLAKES_NEAR : i / FLAKES;
      seeds[i * 4] = Math.random(); seeds[i * 4 + 1] = Math.random(); seeds[i * 4 + 2] = Math.random(); seeds[i * 4 + 3] = k;
      boxes[i] = near ? 14 : 40;
    }
    const fg = new THREE.InstancedBufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3));
    fg.setIndex([0, 1, 2, 0, 2, 3]);
    fg.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 4));
    fg.setAttribute('box', new THREE.InstancedBufferAttribute(boxes, 1));
    fg.instanceCount = NF;
    const fm = new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uCam: { value: new THREE.Vector3() }, uCount: { value: 0 }, uSunCol: U.uSunCol, uSky: U.uSky, uRes: U.uRes, uPx: { value: 0.0015 }, uWind: { value: new THREE.Vector2() }, uWindOff: { value: new THREE.Vector2() } },
      vertexShader: SNOW_VERT, fragmentShader: SNOW_FRAG, transparent: true, depthWrite: false, premultipliedAlpha: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      side: THREE.DoubleSide,   // the streak quads are built in screen space, either winding
    });
    snow = new THREE.Mesh(fg, fm);
    snow.frustumCulled = false;
    snow.visible = false;
    snow.renderOrder = 7;
    snow.userData.noAO = true;
    scene.add(snow);
    this.snowAmount = 0;
    this.snowTarget = 0;
    this.blowAmount = 0; this.blowTarget = 0; this.windX = 0; this.windZ = 0;
  },

  // Generic puff (old API). Bright saturated colours become glowing (additive) particles, the rest
  // soft lit smoke in that colour.
  spawn(x, y, z, color, { vx = 0, vy = 0, vz = 0, s0 = 0.5, s1 = 1.5, life = 1, drag = 1.5, grav = 0 } = {}) {
    const rgb = lin(color);
    const hot = Math.max(rgb[0], rgb[1], rgb[2]) > 0.75 && Math.min(rgb[0], rgb[1], rgb[2]) < 0.35;
    if (hot) return glow(x, y, z, rgb.map((v) => v * 3), { vx, vy, vz, s0: s0 * 0.5, s1: s1 * 0.5, life, drag, grav });
    return puff(x, y, z, rgb, { vx, vy, vz, s0, s1: s1 * 1.3, life: life * 1.4, drag, grav });
  },

  // Smoke from a damaged engine (dark) or a light puff of steam/exhaust.
  smoke(x, y, z, dark = false) {
    const c = dark ? 0.04 + Math.random() * 0.03 : 0.62 + Math.random() * 0.1;
    puff(x + rnd(0.25), y, z + rnd(0.25), [c, c, c * 1.02], {
      vy: 1.0 + Math.random() * 0.8, vx: rnd(0.4), vz: rnd(0.4), s0: 0.5, s1: dark ? 3.6 : 2.6,
      life: dark ? 3.2 : 2.0, a: dark ? 0.62 : 0.34, drag: 1.4, buoy: dark ? 0.6 : 0.2, fadeOut: 1.3, fadeIn: 3, erode: dark ? 0.45 : 0.6,
    });
  },
  // Cold-morning exhaust: thin pale vapour from the tailpipe that spreads, rises a little and frays
  // away (faint enough that overlapping puffs never pile up into a ball). opts: { alpha, size }
  // multiply the opacity and the size (cars pass fainter / smaller puffs, e.g. at idle).
  exhaust(x, y, z, vx = 0, vz = 0, opts = {}) {
    const ka = opts.alpha ?? 1, ks = opts.size ?? 1;
    puff(x + rnd(0.04), y, z + rnd(0.04), [0.86, 0.89, 0.93], {
      vx: vx * 0.3 + rnd(0.45), vy: 0.2 + Math.random() * 0.3, vz: vz * 0.3 + rnd(0.45), s0: 0.08 * ks, s1: 1.6 * ks,
      life: 1.8, a: 0.1 * ka, drag: 2.0, buoy: 0.3, erode: 0.85, fadeIn: 5, fadeOut: 1.2,
    });
  },
  // A burning wreck (called every ~0.06 s): flame tongues licking upwards, now and then a thick dark puff.
  fire(x, y, z) {
    for (let k = 0; k < 2; k++) {
      flame(x + rnd(0.6), y - 0.15 + Math.random() * 0.2, z + rnd(0.6), {
        blend: 'alpha', tint: [0.42, 0.4, 0.38], vy: 1.3 + Math.random() * 1.3, vx: rnd(0.3), vz: rnd(0.3), s0: 0.55 + Math.random() * 0.4, s1: 0.15,
        life: 0.45 + Math.random() * 0.35, heat: 0.65 + Math.random() * 0.35, cool: 0.9, buoy: 1.8, stretch: 0.32, a: 0.9, fadeIn: 14, fadeOut: 0.7,
      });
    }
    if (Math.random() < 0.35) puff(x + rnd(0.4), y + 1.0, z + rnd(0.4), [0.035, 0.033, 0.03], { vy: 1.6, s0: 0.8, s1: 3.4, life: 3.0, a: 0.55, buoy: 0.8, fadeIn: 2.5, erode: 0.5 });
  },
  explosion(x, y, z) {
    // flash: a white-hot ball for a few frames
    flame(x, y + 0.9, z, { s0: 3.0, s1: 5.2, life: 0.17, heat: 1, cool: 0.35, fadeIn: 80, fadeOut: 1.6, buoy: 0, drag: 0 });
    // fireball: hot lumps thrown out and up, cooling from yellow-white through orange to dark red
    for (let k = 0; k < 18; k++) {
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 5;
      flame(x + rnd(0.8), y + 0.4 + Math.random() * 1.2, z + rnd(0.8), {
        vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 1.5 + Math.random() * 4, s0: 1.0 + Math.random() * 0.8, s1: 2.0 + Math.random() * 1.2,
        life: 0.55 + Math.random() * 0.55, drag: 3.0, buoy: 2.5, heat: 0.85 + Math.random() * 0.15, cool: 0.95, fadeIn: 40, fadeOut: 0.8,
      });
    }
    // glowing streaks for shape
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * Math.PI * 2, sp = 9 + Math.random() * 8;
      glow(x, y + 0.7, z, [12, 5, 1.4], { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 2 + Math.random() * 6, s0: 0.3, s1: 0.12, life: 0.28, drag: 4, stretch: 0.06, fadeOut: 1.5, a: 0.9 });
    }
    // dark smoke rolling up behind the fireball
    for (let k = 0; k < 18; k++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3;
      const c = 0.03 + Math.random() * 0.035;
      puff(x + rnd(0.6), y + 0.8 + Math.random() * 0.8, z + rnd(0.6), [c, c * 0.97, c * 0.94], { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 2 + Math.random() * 3, s0: 1.4, s1: 6.5, life: 4.5, a: 0.62, drag: 1.3, buoy: 0.7, fadeIn: 6, fadeOut: 1.2, erode: 0.45 });
    }
    this.sparks(x, y + 0.6, z, 18);
  },
  // Footstep/landing powder: snow kicked up (the old 'dust').
  dust(x, z, n = 3, y = 0.3) {
    for (let k = 0; k < n; k++) puff(x + rnd(0.4), y, z + rnd(0.4), [0.9, 0.92, 0.95], { vy: 0.4 + Math.random() * 0.7, vx: rnd(1.2), vz: rnd(1.2), s0: 0.25, s1: 1.3, life: 1.1, a: 0.16, drag: 2.6, grav: 0.5, fadeIn: 5, fadeOut: 1.6, erode: 0.9 });
  },
  // Fine snow thrown off (feature snöhög: a car leaving or landing on the snow hill, a trailer
  // bouncing): a spray from (x, y, z) at about (vx, vy, vz), spreading, falling and drifting away.
  // k scales its size and spread.
  powder(x, y, z, vx = 0, vy = 1.5, vz = 0, n = 8, k = 1) {
    // (many small wisps thrown out all round and slowed fast: a few big ones read as cotton balls)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, sp = (0.7 + Math.random() * 1.8) * k;
      puff(x + rnd(0.25), y + Math.random() * 0.15, z + rnd(0.25), [0.93, 0.95, 0.98], {
        vx: vx + Math.cos(a) * sp, vy: vy * (0.4 + Math.random() * 0.9), vz: vz + Math.sin(a) * sp, s0: 0.1 * k, s1: (0.4 + Math.random() * 0.55) * k,
        life: 0.55 + Math.random() * 0.5, a: 0.2, drag: 2.8, grav: 4, fadeIn: 14, fadeOut: 1.1, erode: 0.9,
      });
    }
  },
  // Snow blown off a moving car (feature sno_pa_bilar, actors/carsnow.js): one wisp from (x, y, z) at
  // about (vx, vy, vz) - most of the car's speed, which the air takes off it at once, so it streams
  // back from where it left and spreads thin, sinking. k scales it.
  blown(x, y, z, vx = 0, vy = 0.5, vz = 0, k = 1) {
    // (a streak while it is fast - fine spray, not a row of cotton balls - slowing into a faint mist)
    const p = puff(x + rnd(0.12), y + Math.random() * 0.06, z + rnd(0.12), [0.95, 0.96, 0.99], {
      vx: vx + rnd(0.6), vy: vy + Math.random() * 0.5, vz: vz + rnd(0.6), s0: 0.06 * k, s1: (0.32 + Math.random() * 0.3) * k,
      life: 0.45 + Math.random() * 0.45, a: 0.2, drag: 3.6, grav: 1.0, fadeIn: 14, fadeOut: 1.3, erode: 0.92,
    });
    p.stretch = 0.035;
  },
  // Little glints (pickups): pinpoints of light with a thin four-point star, tinted by the colour,
  // thrown up softly and twinkling as they sink (additive, small: no confetti).
  sparkle(x, y, z, color = 0xffd23f, n = 10) {
    const c = lin(color), rgb = c.map((v) => v * 3.2 + 0.8);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 1.6;
      glow(x + rnd(0.12), y + rnd(0.12), z + rnd(0.12), rgb, {
        vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 0.8 + Math.random() * 1.6, s0: 0.1 + Math.random() * 0.06, s1: 0.04,
        life: 0.55 + Math.random() * 0.45, drag: 2.6, grav: 2.2, mode: 3, spin: rnd(1.5), fadeIn: 25, fadeOut: 1.3,
      });
    }
  },
  // Metal-on-metal sparks: hot streaks that fall and bounce.
  sparks(x, y, z, n = 8) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 6;
      glow(x, y, z, [1, 1, 1], { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 1.5 + Math.random() * 4, s0: 0.035, s1: 0.02, life: 0.35 + Math.random() * 0.35, drag: 1.2, grav: 16, stretch: 0.045, ramp: sparkRamp, floor: 0.17 });
    }
  },
  // Was a purple shame cloud; now a neutral puff of breath/steam.
  shame(x, y, z, n = 12) {
    for (let k = 0; k < Math.min(n, 18); k++) {
      const a = Math.random() * Math.PI * 2;
      puff(x + Math.cos(a) * 0.5, y + Math.random() * 1.2, z + Math.sin(a) * 0.5, [0.8, 0.81, 0.84], { vy: 0.6, vx: Math.cos(a) * 0.8, vz: Math.sin(a) * 0.8, s0: 0.4, s1: 1.6, life: 1.5, a: 0.28 });
    }
  },
  // Slush / water thrown up.
  splash(x, z) {
    for (let k = 0; k < 18; k++) {
      const a = Math.random() * Math.PI * 2;
      puff(x, 0.35, z, [0.72, 0.76, 0.8], { vx: Math.cos(a) * 2.5, vz: Math.sin(a) * 2.5, vy: 3 + Math.random() * 3, s0: 0.15, s1: 0.5, life: 0.8, a: 0.55, drag: 0.8, grav: 12, floor: 0.2 });
    }
  },

  // Tyre track segment at (x, z) along yaw. kind: 'snow' for compressed-snow ruts.
  skid(x, z, yaw, w = 0.28, kind) {
    const k = kind ?? (this.surfaceAt ? this.surfaceAt(x, z) : 'asphalt');
    const i = skidNext++ % SKIDS;
    _m.compose(_v.set(x, k === 'snow' ? 0.17 : 0.03, z), _q.setFromEuler(_e.set(0, yaw, 0)), _s.set(w * 0.8, 1, 0.6));
    skidMesh.setMatrixAt(i, _m);
    skidMesh.instanceMatrix.needsUpdate = true;
    skidData.array.set([0.6, k === 'snow' ? 1 : 0, Math.random(), 0], i * 4);
    skidData.needsUpdate = true;
  },

  // Gentle falling snow around the camera. intensity 0..1 (1 = steady snowfall).
  snowfall(on, intensity = 0.6) {
    this.snowTarget = on ? Math.max(0, Math.min(1, intensity)) : 0;
  },
  // Snow blown sideways out in the cold (game/cold.js): amount 0..1 (as many flakes as a snowfall of
  // that intensity, whichever is more) on a wind of (wx, wz) m/s. now: at once, not eased.
  blizzard(amount, wx = 0, wz = 0, now = false) {
    this.blowTarget = Math.max(0, Math.min(1, amount));
    this.windX = wx; this.windZ = wz;
    if (now) this.blowAmount = this.blowTarget;
  },

  tick(dt) {
    U.uTime.value += dt;
    const dtex = sceneDepthTexture();
    U.tDepth.value = dtex; U.uSoft.value = dtex ? 1 : 0;
    const cam = gameCamera;
    U.uNearFar.value.copy(sceneDepthRange());
    if (gameRenderer) gameRenderer.getDrawingBufferSize(U.uRes.value);
    alpha.tick(dt);
    add.tick(dt);
    // Tracks fade out over a couple of minutes.
    const d = skidData.array;
    let dirty = false;
    for (let i = 0; i < SKIDS; i++) if (d[i * 4] > 0) { d[i * 4] = Math.max(0, d[i * 4] - dt * 0.004); dirty = true; }
    if (dirty) skidData.needsUpdate = true;
    this.snowAmount += (this.snowTarget - this.snowAmount) * Math.min(1, dt * 0.5);
    this.blowAmount += (this.blowTarget - this.blowAmount) * Math.min(1, dt * 0.8);
    const amount = Math.max(this.snowAmount, this.blowAmount);
    snow.visible = amount > 0.01;
    if (snow.visible && cam) {
      const u = snow.material.uniforms;
      u.uCam.value.copy(cam.position);
      u.uCount.value = amount;
      const b = this.blowAmount;
      u.uWind.value.set(this.windX * b, this.windZ * b);
      // (carried along by the wind so far: wrapped, the flakes' boxes are 40 and 14 m)
      u.uWindOff.value.x = (u.uWindOff.value.x + this.windX * b * dt) % 560;
      u.uWindOff.value.y = (u.uWindOff.value.y + this.windZ * b * dt) % 560;
      u.uPx.value = 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) / Math.max(1, U.uRes.value.y);
    }
  },
};
