// HUD-like world markers, realistic but readable:
//   Bang       - mission giver: a small floating amber diamond with a soft glow.
// All of them are self-lit amber (0xffb347) that dims what is behind them, with a Fresnel rim that
// blooms a little, so they read as a light hologram rather than a lit object.
//   Beacon     - objective: a soft light column, a ground ring and a small chevron above it.
//   GuideArrow - a slim chevron hovering above the player, pointing along the route.
// Same API as before: new Bang(scene, color).set(x, y, z, t) / .show(v); new Beacon(scene, color)
// .set(x, y, z, t, radius) / .hide(); new GuideArrow(scene).set(x, y, z, yaw, t) / .hide().

import { THREE } from '../gfx.js';

const AMBER = 0xffb347;
// Old callers pass the cartoon yellow; map it to the amber used everywhere now.
const tone = (c) => (c === undefined || c === 0xffd23f ? AMBER : c);

function glowTexture() {
  if (glowTexture.t) return glowTexture.t;
  const S = 128, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const x = cv.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  glowTexture.t = new THREE.CanvasTexture(cv);
  return glowTexture.t;
}

// Glowing amber marker material: self-lit (not shaded by the sun, so never reads as cream
// cardboard), mid-bright so it stays amber through the tone mapping, and a Fresnel rim that gets
// over the bloom threshold at grazing angles.
function gemMaterial(color, k = 1.6, opacity = 0.8) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uK: { value: k }, uOpacity: { value: opacity } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main() { vec4 mv = modelViewMatrix * vec4( position, 1.0 ); vN = normalize( normalMatrix * normal ); vV = normalize( - mv.xyz ); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uK; uniform float uOpacity; varying vec3 vN; varying vec3 vV;
      void main() {
        float f = pow( 1.0 - abs( dot( normalize( vN ), normalize( vV ) ) ), 2.0 );
        vec3 c = uColor * vec3( 1.0, 0.8, 0.55 ) * uK * ( 0.45 + 1.6 * f ); // deeper than the hex: tone mapping yellows it
        gl_FragColor = vec4( c * uOpacity, uOpacity );
      }`,
    // premultiplied: dims what is behind a little and adds the glow, so it stays amber over bright snow/sky
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
}
function glowSprite(color, size, opacity = 0.55) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(size);
  s.userData.noAO = true;
  s.renderOrder = 8;
  return s;
}
function noShadows(o) { o.traverse((c) => { c.castShadow = false; c.receiveShadow = false; c.userData.noAO = true; }); return o; }

// Additive soft beam: brightest where we look straight through its middle, fading upwards.
function beamMaterial(color, opacity, fadeH) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uFadeH: { value: fadeH }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vH;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vH = position.y; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; uniform float uFadeH; uniform float uTime; varying vec3 vN; varying vec3 vV; varying float vH;
      void main() {
        float core = pow( abs( dot( normalize( vN ), normalize( vV ) ) ), 2.0 );
        float h = clamp( vH / uFadeH, 0.0, 1.0 );
        float fade = ( 1.0 - h ) * ( 1.0 - h ) * smoothstep( 0.0, 0.6, vH );
        float a = core * fade * uOpacity * ( 0.85 + 0.15 * sin( uTime * 2.0 - vH * 0.4 ) );
        gl_FragColor = vec4( uColor * a, a );
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
}
// Ground ring: soft band with a faint fill, lying on the ground.
function ringMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uTime; varying vec2 vP;
      void main() {
        float r = length( vP );
        float band = smoothstep( 0.80, 0.93, r ) * smoothstep( 1.0, 0.95, r );
        float fill = smoothstep( 1.0, 0.0, r ) * 0.08;
        float pulse = smoothstep( 0.06, 0.0, abs( r - fract( uTime * 0.45 ) ) ) * ( 1.0 - r ) * 0.6;
        float a = ( band * 0.9 + fill + pulse );
        gl_FragColor = vec4( uColor * a * 1.6, a );
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
}
function chevronGeometry(w, l, t, thick) {
  // A flat V pointing along +Z, centred on the origin.
  const s = new THREE.Shape();
  s.moveTo(0, l / 2);
  s.lineTo(w / 2, -l / 2);
  s.lineTo(w / 2 - t, -l / 2);
  s.lineTo(0, l / 2 - t * 1.3);
  s.lineTo(-w / 2 + t, -l / 2);
  s.lineTo(-w / 2, -l / 2);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.3, bevelSize: thick * 0.3, bevelSegments: 2 });
  g.translate(0, 0, -thick / 2);
  g.rotateX(-Math.PI / 2); // shape's +Y becomes -Z... flip so it points +Z
  g.rotateY(Math.PI);
  g.computeVertexNormals();
  return g;
}

export class Bang {
  constructor(scene, color) {
    color = tone(color);
    this.root = new THREE.Group();
    this.gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), gemMaterial(color));
    this.gem.renderOrder = 8;
    this.gem.scale.set(1, 1.45, 1);
    this.root.add(this.gem);
    this.root.add(glowSprite(color, 1.3, 0.5));
    // A faint thread of light down towards the person, so it reads from a distance.
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 30, 8, 1, true), beamMaterial(color, 0.35, 30));
    beam.position.y = 0.5;
    beam.geometry.translate(0, 15, 0);
    this.beam = beam;
    this.root.add(beam);
    noShadows(this.root);
    scene.add(this.root);
    this.visible = true;
  }
  set(x, y, z, t) {
    this.root.position.set(x, y - 0.35 + Math.sin(t * 2.2) * 0.06, z);
    this.gem.rotation.y = t * 1.2;
    this.beam.material.uniforms.uTime.value = t;
  }
  show(v) { this.root.visible = v; this.visible = v; }
}

export class Beacon {
  constructor(scene, color) {
    color = tone(color);
    this.root = new THREE.Group();
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 40, 24, 1, true), beamMaterial(color, 0.38, 40));
    col.geometry.translate(0, 20, 0);
    this.col = col;
    this.root.add(col);
    const ring = new THREE.Mesh(new THREE.CircleGeometry(1, 64), ringMaterial(color));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    this.ring = ring;
    this.root.add(ring);
    this.arrow = new THREE.Group();
    const chev = new THREE.Mesh(chevronGeometry(0.72, 0.56, 0.16, 0.06), gemMaterial(color));
    chev.renderOrder = 8;
    chev.rotation.x = Math.PI / 2; // point down
    this.arrow.add(chev);
    this.arrow.add(glowSprite(color, 1.6, 0.35));
    this.root.add(this.arrow);
    noShadows(this.root);
    scene.add(this.root);
    this.root.visible = false;
  }
  set(x, y, z, t, radius = 3.2) {
    this.root.visible = true;
    this.root.position.set(x, y, z);
    this.ring.scale.set(radius, radius, radius);
    this.col.scale.set(radius * 0.55, 1, radius * 0.55);
    this.ring.material.uniforms.uTime.value = t;
    this.col.material.uniforms.uTime.value = t;
    this.arrow.position.y = 3.4 + Math.sin(t * 2.4) * 0.15;
    this.arrow.rotation.y = t * 0.8;
  }
  hide() { this.root.visible = false; }
}

// The guide chevron that floats above the player.
export class GuideArrow {
  constructor(scene) {
    this.mesh = new THREE.Mesh(chevronGeometry(0.5, 0.4, 0.1, 0.04), gemMaterial(AMBER));
    this.mesh.rotation.order = 'YXZ';
    this.mesh.renderOrder = 5;
    noShadows(this.mesh);
    scene.add(this.mesh);
    this.mesh.visible = false;
    this.yaw = 0;
  }
  set(x, y, z, yaw, t) {
    this.mesh.visible = true;
    let d = yaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * 0.2;
    this.mesh.position.set(x, y - 0.2 + Math.sin(t * 2.5) * 0.05, z);
    // Tilted up towards the chase camera so it never shows edge-on.
    this.mesh.rotation.set(-0.75, this.yaw, 0);
  }
  hide() { this.mesh.visible = false; }
}
