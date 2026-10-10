// Printed signs, plates and painted ground symbols for the whole town, batched: every face is
// drawn once into a shared canvas atlas, and every placed sign is a quad in one merged mesh per
// atlas page (a few draw calls for hundreds of signs). Swedish road-sign pictograms are drawn
// procedurally (no images, no brands).
//
//   const f = picto('pforbud');                 // cached face
//   const t = textFace('Gästparkering\nmax 24 tim', 0.6, 0.3, { bg: '#fff', fg: '#111' });
//   addSign(f, x, y, z, 0.6, 0.6, yaw);         // vertical quad facing yaw
//   addDecal(f, x, y, z, w, d, yaw);            // flat on the ground, image top towards yaw
//   finalizeSigns(scene);                       // once, after the town is built

import { THREE, injectSceneShading, SUN_DIR, LIGHTING } from '../gfx.js';

const SIZE = 2048, PAD = 6;
const FONT = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif';

// (phase 4 r2) A page is drawn on a full 2048 x 2048 work canvas while the town is built; finalizeSigns
// copies its used rows (texH: rounded up to 256, so the first eight mip levels are the same as the
// full page's) into the texture's own canvas and releases both canvases once uploaded. Ten full pages
// held 213 MB of VRAM (more than half of it empty) plus 160 MB of canvases. A page drawn into after
// that (a face added later: look-dev) gets its work canvas back with every face repainted (work()).
class Page {
  constructor(kind) {
    this.kind = kind;
    this.x = 0; this.y = 0; this.rowH = 0;
    this.faces = [];
    this.quads = [];
    this.released = true;
    work(this);
  }
  alloc(w, h) {
    const W = w + PAD * 2, H = h + PAD * 2;
    if (this.x + W > SIZE) { this.x = 0; this.y += this.rowH; this.rowH = 0; }
    if (this.y + H > SIZE || W > SIZE) return null;
    const r = { px: this.x + PAD, py: this.y + PAD, pw: w, ph: h };
    this.x += W; this.rowH = Math.max(this.rowH, H);
    return r;
  }
}

const pages = { plain: [], glow: [], cutout: [], decal: [], twig: [], leaf: [], conifer: [], crown: [] };
// See-through card pages (cardMaterial): twig = near twigs, hedges, fences (alpha to coverage,
// crisp, writes depth); leaf = clipped evergreen hedges (round 5: the same, but lit as foliage:
// green, not desaturated, the card's own normal); conifer = spruce branches; crown = whole crowns'
// twig haze (both blended).
const CARD = { twig: 1, leaf: 1, conifer: 1, crown: 1 };
const FAR_FADE = /^twig:(birchhang|limespray):/;
const cache = new Map();

const clearKind = (kind) => kind === 'decal' || kind === 'cutout' || !!CARD[kind];
// A canvas W x H with the page's background (transparent on see-through pages, the plates' grey on
// the others) and, with faces = true, every face of the page painted on it.
function pageCanvas(page, H, faces) {
  const cv = document.createElement('canvas');
  cv.width = SIZE; cv.height = H;
  const ctx = cv.getContext('2d');
  if (clearKind(page.kind)) ctx.clearRect(0, 0, SIZE, H);
  else { ctx.fillStyle = '#8a8c8e'; ctx.fillRect(0, 0, SIZE, H); }
  if (faces) for (const f of page.faces) paint(f, ctx);
  return cv;
}
// The page's full-size work canvas (back, repainted, if it was released).
function work(page) {
  if (!page.released) return page;
  page.canvas = pageCanvas(page, SIZE, true);
  page.ctx = page.canvas.getContext('2d');
  page.released = false;
  return page;
}
function release(page) {
  if (page.released) return;
  page.canvas.width = page.canvas.height = 1;
  page.ctx = null;
  page.released = true;
}

function pageFor(kind, w, h) {
  const list = pages[kind];
  for (const p of list) { const r = p.alloc(w, h); if (r) return [p, r]; }
  const p = new Page(kind);
  list.push(p);
  return [p, p.alloc(w, h)];
}

// A face: draw(ctx, w, h) paints a w x h pixel cell (origin at its top-left).
export function face(key, wPx, hPx, draw, kind = 'plain') {
  const k = kind + '|' + key;
  if (cache.has(k)) return cache.get(k);
  wPx = Math.max(8, Math.min(SIZE - PAD * 2, Math.round(wPx)));
  hPx = Math.max(8, Math.min(SIZE - PAD * 2, Math.round(hPx)));
  const [page, r] = pageFor(kind, wPx, hPx);
  const f = { page, ...r, draw, key };
  work(page);
  paint(f);
  page.faces.push(f);
  cache.set(k, f);
  return f;
}

function paint(f, c = f.page.ctx) {
  c.save();
  // Bleed: paint the face a few pixels larger first (clipped to the padded cell) so mipmaps
  // don't pull in the neighbour's colours, then the face itself.
  c.beginPath(); c.rect(f.px - PAD, f.py - PAD, f.pw + PAD * 2, f.ph + PAD * 2); c.clip();
  const clear = clearKind(f.page.kind);
  if (clear) c.clearRect(f.px - PAD, f.py - PAD, f.pw + PAD * 2, f.ph + PAD * 2);
  c.translate(f.px - PAD, f.py - PAD);
  c.scale((f.pw + PAD * 2) / f.pw, (f.ph + PAD * 2) / f.ph);
  f.draw(c, f.pw, f.ph);
  c.restore();
  c.save();
  c.beginPath(); c.rect(f.px, f.py, f.pw, f.ph); c.clip();
  if (clear) c.clearRect(f.px, f.py, f.pw, f.ph);
  c.translate(f.px, f.py);
  f.draw(c, f.pw, f.ph);
  c.restore();
}

// ---------------------------------------------------------------------------------------------
// Placing

// Vertical sign quad centred at (x, y, z), facing yaw (normal (sin yaw, 0, cos yaw)).
export function addSign(f, x, y, z, w, h, yaw = 0) {
  const nx = Math.sin(yaw), nz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  f.page.quads.push({ f, c: [x, y, z], r: [rx * w / 2, 0, rz * w / 2], u: [0, h / 2, 0], n: [nx, 0, nz] });
}
// Flat ground decal (painted symbol), image top pointing along yaw.
// (down = true: the same quad facing down, for the underside of a horizontal card)
export function addDecal(f, x, y, z, w, d, yaw = 0, down = false) {
  const ux = Math.sin(yaw), uz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw), k = down ? -1 : 1;
  f.page.quads.push({ f, c: [x, y, z], r: [k * rx * w / 2, 0, k * rz * w / 2], u: [ux * d / 2, 0, uz * d / 2], n: [0, k, 0] });
}

// A see-through card (twig haze in a tree crown, the frayed twigs of a bare hedge): two quads
// back to back, centred at (x, y, z), w x h, facing yaw. Their normals lean up by `up` (0..1), so a
// card is lit like a mass of thin twigs (mostly by the sky) rather than like a flat board.
export function addCard(f, x, y, z, w, h, yaw = 0, up = 0.7) {
  const nx = Math.sin(yaw), nz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const k = Math.sqrt(Math.max(0, 1 - up * up));
  f.page.quads.push({ f, c: [x, y, z], r: [rx * w / 2, 0, rz * w / 2], u: [0, h / 2, 0], n: [nx * k, up, nz * k] });
  f.page.quads.push({ f, c: [x, y, z], r: [-rx * w / 2, 0, -rz * w / 2], u: [0, h / 2, 0], n: [-nx * k, up, -nz * k] });
}

// A see-through card of any orientation: centre c, half-extent vectors r (image right) and u
// (image up), both faces (front normal r x u, or nrm: a shading normal of its own, e.g. a sprig
// lying on a grave leaning towards the low sun).
// (both: the back face is shaded with the same normal, e.g. a loose shoot lit like the hedge face it
// grows out of, from either side)
export function addQuad(f, c, r, u, nrm = null, tint = null, both = false) {
  const n = nrm || [r[1] * u[2] - r[2] * u[1], r[2] * u[0] - r[0] * u[2], r[0] * u[1] - r[1] * u[0]], l = Math.hypot(...n) || 1;
  f.page.quads.push({ f, c, r, u, n: n.map((v) => v / l), tint });
  // (the back face shows the image mirrored, as a real flat thing seen from behind: a drooping
  // branch droops the same way from both sides)
  f.page.quads.push({ f, c, r: r.map((v) => -v), u, n: n.map((v) => (both ? v : -v) / l), flip: true, tint });
}

// (phase 4 r2) A curved card: a grid of cols x rows cells, its (cols + 1) x (rows + 1) vertices row by
// row from the bottom: P positions and N normals ([x, y, z] each), A / B where each vertex sits on the
// face (0..1 from its left / bottom edge); front face only. tint: an [r, g, b] multiplier of the
// face's (linear) colour and optionally a 4th value, a factor on its indirect light; on the 'leaf'
// page only (a hedge plant's own tone). kit.hedge builds every
// plant of a clipped hedge as one: a cushion that bulges out of the face, its normals bent with it.
export function addGrid(f, cols, rows, P, N, A, B, tint = null) {
  let cx = 0, cz = 0;
  for (const p of P) { cx += p[0]; cz += p[2]; }
  f.page.quads.push({ f, grid: true, cols, rows, P, N, A, B, tint, c: [cx / P.length, 0, cz / P.length] });
}

let built = false, builtMeshes = [];
// Debug / look-dev: drop the sign meshes and build them again (after adding faces or cards).
export function rebuildSigns(scene) {
  for (const m of builtMeshes) { scene.remove(m); m.geometry.dispose(); }
  for (const list of Object.values(pages)) for (const p of list) if (p.tex) { p.mat.dispose(); p.tex.dispose(); p.tex = p.mat = null; }
  built = false;
  return finalizeSigns(scene);
}
export function finalizeSigns(scene) {
  if (built) return;
  built = true;
  const meshes = (builtMeshes = []);
  for (const kind of ['plain', 'glow', 'cutout', 'decal', 'twig', 'leaf', 'conifer', 'crown']) {
    for (const page of pages[kind]) {
      if (!page.quads.length) { release(page); continue; }
      // (phase 4 r2) only the rows in use: a copy of the work canvas' top texH rows (premultiplied
      // pixels copied as they are), the work canvas released at once and the copy once uploaded
      const H = (page.texH = Math.min(SIZE, Math.ceil((page.y + page.rowH) / 256) * 256));
      work(page);
      const tc = document.createElement('canvas');
      tc.width = SIZE; tc.height = H;
      const tcx = tc.getContext('2d');
      tcx.globalCompositeOperation = 'copy';
      tcx.drawImage(page.canvas, 0, 0, SIZE, H, 0, 0, SIZE, H);
      release(page);
      const tex = new THREE.CanvasTexture(tc);
      tex.onUpdate = (t) => { if (t.image?.width > 1) t.image.width = t.image.height = 1; };
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      // Twig cards: upload premultiplied, so the mips average colour weighted by coverage (the
      // shader divides by alpha again); straight alpha let the black transparent texels and the
      // full-colour antialiased stroke edges skew far crowns.
      if (CARD[kind]) tex.premultiplyAlpha = true;
      page.tex = tex;
      const m = new THREE.MeshStandardMaterial({
        map: tex, roughness: kind === 'decal' ? 0.75 : 0.5, metalness: 0,
        polygonOffset: true, polygonOffsetFactor: kind === 'decal' ? -2 : -1, polygonOffsetUnits: kind === 'decal' ? -2 : -1,
      });
      if (kind === 'glow') { m.emissive.set(0xffffff); m.emissiveMap = tex; m.emissiveIntensity = 0.55; }
      if (kind === 'decal') { m.transparent = true; m.alphaTest = 0.35; m.depthWrite = false; }
      if (kind === 'cutout') m.alphaTest = 0.5;
      // Twig / crown cards: see cardMaterial. Left out of the shadow / AO pre-pass (they would cast quads).
      if (CARD[kind]) cardMaterial(m, kind, undefined, H);
      page.mat = m;
      // Card pages (hundreds of thousands of quads all over town) are split into a 3 x 3 grid of
      // meshes, so the parts outside the view are culled.
      const groups = new Map();
      if (CARD[kind]) for (const q of page.quads) { const k = Math.max(0, Math.min(2, Math.floor((q.c[0] + 300) / 200))) * 3 + Math.max(0, Math.min(2, Math.floor((q.c[2] + 300) / 200))); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(q); }
      else groups.set(0, page.quads);
      for (const quads of groups.values()) {
        // (a quad is 4 vertices and 6 indices, a grid (addGrid) its own)
        let nv = 0, ni = 0;
        for (const q of quads) { if (q.grid) { nv += (q.cols + 1) * (q.rows + 1); ni += q.cols * q.rows * 6; } else { nv += 4; ni += 6; } }
        const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
        // (round 6) per-card far fade (twig page): the fine twig curtains / sprays of tree crowns fade
        // out from ~9 to 20 m and leave the crown to the blended haze cards; at a distance their
        // sub-pixel strokes were alpha-to-coverage crumbs against the sky
        const far = CARD[kind] ? new Float32Array(nv) : null;
        const tint = kind === 'leaf' ? new Float32Array(nv * 4).fill(1) : null;
        let v = 0, ii = 0;
        for (const q of quads) {
          const { f } = q, v0 = v;
          const u0 = f.px / SIZE, u1 = (f.px + f.pw) / SIZE, vT = 1 - f.py / H, vB = 1 - (f.py + f.ph) / H;
          if (q.grid) {
            const { cols, rows, P, N, A, B } = q;
            for (let k = 0; k < P.length; k++, v++) {
              pos.set(P[k], v * 3); nrm.set(N[k], v * 3);
              uv[v * 2] = u0 + (u1 - u0) * A[k]; uv[v * 2 + 1] = vB + (vT - vB) * B[k];
            }
            for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
              const a = v0 + j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
              idx.set([a, b, d, a, d, c], ii); ii += 6;
            }
          } else {
            const { c, r, u, n: nn } = q;
            [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b], k) => {
              for (let d = 0; d < 3; d++) { pos[(v + k) * 3 + d] = c[d] + r[d] * a + u[d] * b; nrm[(v + k) * 3 + d] = nn[d]; }
              uv[(v + k) * 2] = (a < 0) !== !!q.flip ? u0 : u1;
              uv[(v + k) * 2 + 1] = b < 0 ? vB : vT;
            });
            idx.set([v, v + 1, v + 2, v, v + 2, v + 3], ii); ii += 6;
            v += 4;
          }
          if (far && FAR_FADE.test(f.key)) far.fill(1, v0, v);
          if (tint && q.tint) for (let k = v0; k < v; k++) { tint.set(q.tint, k * 4); if (q.tint.length < 4) tint[k * 4 + 3] = 1; }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        if (far) geo.setAttribute('cardFar', new THREE.BufferAttribute(far, 1));
        if (tint) geo.setAttribute('cardTint', new THREE.BufferAttribute(tint, 4));
        geo.setIndex(new THREE.BufferAttribute(idx, 1));
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, m);
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        if (kind === 'decal') { mesh.renderOrder = 1; mesh.userData.noAO = true; }
        if (CARD[kind]) mesh.userData.noAO = true;
        // (crowns are blended: drawn after the twig cards, which write depth, and before car glass)
        if (kind === 'crown') mesh.renderOrder = 1;
        if (kind === 'conifer') mesh.renderOrder = 0.5;
        mesh.name = 'signs:' + kind;
        scene.add(mesh);
        meshes.push(mesh);
      }
    }
  }
  // If the UI font arrives after we drew, redraw every face with it.
  try {
    if (document.fonts && !document.fonts.check(`600 24px ${FONT}`)) {
      document.fonts.load(`600 24px ${FONT}`).then(() => {
        // (a page already uploaded gets a fresh canvas of its texture's size, every face repainted)
        for (const kind of Object.keys(pages)) for (const p of pages[kind]) {
          if (p.tex) { p.tex.image = pageCanvas(p, p.texH, true); p.tex.needsUpdate = true; }
          else if (!p.released) for (const f of p.faces) paint(f);
        }
      }).catch(() => {});
    }
  } catch (e) { /* no font loading API: keep the fallback font */ }
  return meshes;
}

// See-through cards (twig page: hanging birch twigs, hedge sprays, fences; crown page: the twig haze
// of whole crowns). A card stands for a volume of thin twigs, so:
// - it is lit as one: the shading normal faces the camera, leaning up a little (an up-leaning board
//   normal seen edge-on mirrored the sky at grazing Fresnel), specular mostly removed, direct
//   diffuse halved (much of the sun falls on twigs hidden behind others);
// - it keeps its density with distance: mip averaging thins the alpha of thin strokes, so the alpha
//   is compounded as if k layers of twigs overlapped, k growing with the mip level (the page is
//   uploaded premultiplied: the colour is un-premultiplied, clamped against 8-bit noise);
// - looking towards the low sun the bright haze behind would show through every gap: a backlit twig
//   mass is denser there, gets less of the sun-tinted haze (a dark silhouette, not a frosted ghost)
//   and a thin forward-scattering glow where it thins out (the bright rim of a backlit crown);
// - it fades out as it turns edge-on (the face's own normal from screen derivatives), crown cards
//   also where their texture is magnified (close up the real limbs carry the look), and the
//   horizontal crown-top cards (normal straight up) unless seen from well above.
// mode 'blend': alpha-blended, no depth write (crowns: a smooth haze at any distance, no dithered
// coverage dots); 'cut': alpha-to-coverage, crisp, writes depth (near twigs).
// The 'leaf' page (clipped evergreen hedges, round 5) is a solid wall of leaves with a frayed top: it
// keeps its own colour (no clamp, little desaturation of the sky light: green, not grey-navy), is lit
// by its own (up-leaning) normal so the sunny side of a hedge is brighter than the shaded one, takes
// more of the direct light and fades only when nearly edge-on (looking along a hedge).
const CARD_P = {
  twig: { clamp: '0.22', comp: '0.9', sun: '0.35', dd: '0.5', desat: '0.75', edge: '0.1, 0.45' },
  leaf: { clamp: '0.9', comp: '0.9', sun: '0.35', dd: '0.6', desat: '0.6', edge: '0.02, 0.1', geoNormal: true },
  conifer: { clamp: '0.9', comp: '0.35', sun: '0.6', dd: '0.5', desat: '0.75', edge: '0.1, 0.45' },
  crown: { clamp: '0.13', comp: '0.6', sun: '1.6', dd: '0.5', desat: '0.75', edge: '0.1, 0.45' },
};
function cardMaterial(m, kind, mode = kind === 'twig' || kind === 'leaf' ? 'cut' : 'blend', texH = SIZE) {
  const P = CARD_P[kind];
  m.roughness = 0.95;
  if (mode === 'blend') { m.transparent = true; m.depthWrite = false; m.alphaTest = 0.004; }
  else { m.alphaTest = 0.3; m.alphaToCoverage = true; }
  const crown = kind === 'crown';
  const near = crown ? 'diffuseColor.a *= smoothstep( -1.9, -0.9, tLod );' : kind === 'conifer' ? '' : 'diffuseColor.a *= smoothstep( -3.2, -2.2, tLod );';
  const v3 = (v) => `vec3( ${(v.x ?? v.r).toFixed(4)}, ${(v.y ?? v.g).toFixed(4)}, ${(v.z ?? v.b).toFixed(4)} )`;
  const sc = LIGHTING.sunColor;
  // (gfx.js gives every MeshStandardMaterial the same program cache key: without our own, the
  // twig and crown materials would share whichever of the two programs compiled first)
  const baseKey = THREE.MeshStandardMaterial.prototype.customProgramCacheKey;
  m.customProgramCacheKey = function () { return baseKey.call(this) + '|cards:' + kind + ':' + mode + ':7'; };
  // (phase 4 r2) the leaf page: a per-vertex tint (a hedge plant's own tone, see addGrid)
  const leaf = kind === 'leaf';
  m.onBeforeCompile = (sh) => {
    injectSceneShading(sh);
    // (the page's texture size in texels, for the mip level: pages are cropped to their used height)
    sh.uniforms.cardTexSize = { value: new THREE.Vector2(SIZE, texH) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vTopCard;\nattribute float cardFar;\nvarying float vCardFar;' + (leaf ? '\nattribute vec4 cardTint;\nvarying vec4 vCardTint;' : ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTopCard = step( 0.985, normal.y );\nvCardFar = cardFar;' + (leaf ? '\nvCardTint = cardTint;' : ''));
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vTopCard;\nvarying float vCardFar;\nuniform vec2 cardTexSize;' + (leaf ? '\nvarying vec4 vCardTint;' : ''))
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 tdx = dFdx( vMapUv * cardTexSize ), tdy = dFdy( vMapUv * cardTexSize );
        float tLod = 0.5 * log2( max( max( dot( tdx, tdx ), dot( tdy, tdy ) ), 1e-8 ) );
        // (8-bit premultiplied texels of very low alpha are quantisation noise: clamp)
        diffuseColor.rgb = min( diffuseColor.rgb / max( sampledDiffuseColor.a, 0.12 ), vec3( ${P.clamp} ) )${leaf ? ' * vCardTint.rgb' : ''};
        vec3 cRay = normalize( -vViewPosition );
        vec3 sunV = normalize( ( viewMatrix * vec4( ${v3(SUN_DIR)}, 0.0 ) ).xyz );
        vec3 upV = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
        float sunAl = dot( cRay, sunV );`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = ${P.geoNormal ? 'normalize( normal * 0.75 - cRay * 0.25 + upV * 0.08 )' : 'normalize( -cRay * 0.85 + upV * 0.25 )'};`)
      .replace('#include <alphatest_fragment>', `
        { vec3 fq = normalize( cross( dFdx( vViewPosition ), dFdy( vViewPosition ) ) );
          float tSun = smoothstep( 0.35, 0.95, sunAl );
          diffuseColor.a = 1.0 - pow( 1.0 - min( diffuseColor.a, 0.999 ), ( 1.0 + ${P.comp} * clamp( tLod, 0.0, 5.0 ) ) * ( 1.0 + ${P.sun} * tSun ) );
          diffuseColor.a *= smoothstep( ${P.edge}, abs( dot( fq, cRay ) ) ); ${near}
          diffuseColor.a *= 1.0 - vCardFar * smoothstep( 9.0, 20.0, length( vViewPosition ) );
          ${crown ? '// crown-top cards: only from well above (from the street they were a floating plank)\n          diffuseColor.a *= mix( 1.0, smoothstep( 0.42, 0.75, -dot( cRay, upV ) ), vTopCard );' : ''} }
        #include <alphatest_fragment>`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.indirectSpecular *= 0.2; reflectedLight.directSpecular *= 0.1; reflectedLight.directDiffuse *= ${P.dd};
        // the blue sky is not all that lights a twig mass (the snow below, the twigs around): keep
        // it from turning navy
        reflectedLight.indirectDiffuse = mix( reflectedLight.indirectDiffuse, vec3( 1.06, 1.0, 0.94 ) * dot( reflectedLight.indirectDiffuse, vec3( 0.2126, 0.7152, 0.0722 ) ) * 1.1, ${P.desat} );
        ${leaf ? `// (phase 4 r2) the snow-covered ground lights a hedge's face from below (the sky map's lower half
        // is a dim field colour): up to half as much again on a vertical face, none on a flat one;
        // times the card's own factor (sprigs lying on the snow are lit from below by it too)
        reflectedLight.indirectDiffuse *= ( 1.0 + 0.5 * ( 1.0 - abs( dot( normal, upV ) ) ) ) * vCardTint.a;` : ''}
        // forward scattering where a backlit twig mass thins out: the bright rim
        reflectedLight.directDiffuse += ${v3(sc)} * diffuseColor.rgb * ( 1.2 * pow( max( sunAl, 0.0 ), 24.0 ) * ( 1.0 - diffuseColor.a ) * ( 1.0 - diffuseColor.a ) );`)
      .replace('#include <fog_fragment>', `
        #ifdef USE_FOG
          vec3 fDir = normalize( vFogWorld );
          float fogFactor = gameFogAmount( cameraPosition, vFogWorld, fogDensity );
          // less sun-tinted haze in front of a backlit crown (it is a dark mass, not lit air)
          float fSun = smoothstep( 0.45, 0.97, dot( fDir, ${v3(SUN_DIR)} ) );
          fogFactor *= 1.0 - 0.5 * fSun;
          gl_FragColor.rgb = mix( gl_FragColor.rgb, gameFogColor( fDir ), fogFactor );
        #endif`);
  };
}

// Debug: the atlas pages by kind; signPageImage(page): a canvas with the page as uploaded (repainted:
// the pages' own canvases are released after upload).
export function signPages() { return pages; }
export function signPageImage(p) { return pageCanvas(p, p.texH || SIZE, true); }

export function signStats() {
  const out = {};
  for (const k of Object.keys(pages)) out[k] = pages[k].map((p) => p.quads.length);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Drawing helpers

const RED = '#c8102e', BLUE = '#1e5aa8', YEL = '#f5c518', BLACK = '#1a1a1a', WHITE = '#f6f6f2';

function rrect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}
// Background for round signs: the metal plate shows around a disc.
function discBase(c, w, h, fill, ring) {
  const R = Math.min(w, h) / 2;
  c.fillStyle = WHITE; c.beginPath(); c.arc(w / 2, h / 2, R * 0.99, 0, Math.PI * 2); c.fill();
  c.fillStyle = ring; c.beginPath(); c.arc(w / 2, h / 2, R * 0.95, 0, Math.PI * 2); c.fill();
  c.fillStyle = fill; c.beginPath(); c.arc(w / 2, h / 2, R * 0.74, 0, Math.PI * 2); c.fill();
  return R;
}
function squareBase(c, w, h, fill) {
  c.fillStyle = WHITE; c.fillRect(0, 0, w, h);
  c.fillStyle = fill; rrect(c, w * 0.045, h * 0.045, w * 0.91, h * 0.91, Math.min(w, h) * 0.08); c.fill();
}
function text(c, s, x, y, size, color, weight = '700', align = 'center', maxW = 0) {
  c.font = `${weight} ${size}px ${FONT}`;
  c.textAlign = align; c.textBaseline = 'middle';
  if (maxW) { const m = c.measureText(s).width; if (m > maxW) { c.font = `${weight} ${size * maxW / m}px ${FONT}`; } }
  c.fillStyle = color;
  c.fillText(s, x, y);
}
// Simple walking figure (pictogram), feet at (x, y), height h.
function walker(c, x, y, h, color, mirror = 1) {
  c.save(); c.translate(x, y); c.scale(mirror, 1);
  c.fillStyle = color; c.strokeStyle = color; c.lineCap = 'round'; c.lineJoin = 'round';
  const hd = h * 0.13;
  c.beginPath(); c.arc(h * 0.05, -h + hd, hd, 0, Math.PI * 2); c.fill();
  c.lineWidth = h * 0.13;
  c.beginPath(); c.moveTo(h * 0.02, -h * 0.72); c.lineTo(-h * 0.03, -h * 0.38); c.stroke(); // torso
  c.lineWidth = h * 0.09;
  c.beginPath(); c.moveTo(-h * 0.03, -h * 0.4); c.lineTo(h * 0.16, -h * 0.18); c.lineTo(h * 0.14, 0); c.stroke(); // front leg
  c.beginPath(); c.moveTo(-h * 0.03, -h * 0.4); c.lineTo(-h * 0.12, -h * 0.2); c.lineTo(-h * 0.24, -h * 0.04); c.stroke(); // back leg
  c.lineWidth = h * 0.075;
  c.beginPath(); c.moveTo(h * 0.03, -h * 0.68); c.lineTo(h * 0.17, -h * 0.5); c.lineTo(h * 0.22, -h * 0.36); c.stroke(); // arm
  c.beginPath(); c.moveTo(0, -h * 0.68); c.lineTo(-h * 0.13, -h * 0.5); c.lineTo(-h * 0.16, -h * 0.38); c.stroke();
  c.restore();
}
function carSide(c, x, y, w, color) {
  // A small car silhouette (side view), bottom-centre at (x, y), width w.
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(x - w / 2, y - w * 0.12);
  c.lineTo(x - w / 2, y - w * 0.26); c.lineTo(x - w * 0.3, y - w * 0.3); c.lineTo(x - w * 0.18, y - w * 0.46);
  c.lineTo(x + w * 0.16, y - w * 0.46); c.lineTo(x + w * 0.3, y - w * 0.3); c.lineTo(x + w / 2, y - w * 0.27);
  c.lineTo(x + w / 2, y - w * 0.12); c.closePath(); c.fill();
  for (const s of [-0.3, 0.3]) { c.beginPath(); c.arc(x + w * s, y - w * 0.1, w * 0.1, 0, Math.PI * 2); c.fill(); }
}
// Motorcycle (side view), axle height cy, centred on cx, size w: fat wheels, an engine / tank block
// between them, seat, fork and handlebar. No pedals, no crank.
function motorcycle(c, cx, cy, w, color) {
  c.save();
  c.fillStyle = color; c.strokeStyle = color; c.lineCap = 'round'; c.lineJoin = 'round';
  const R = w * 0.17, rx = cx - w * 0.36, fx = cx + w * 0.38;
  c.lineWidth = w * 0.08;
  for (const x of [rx, fx]) { c.beginPath(); c.arc(x, cy, R, 0, Math.PI * 2); c.stroke(); }
  c.beginPath();
  c.moveTo(cx - w * 0.16, cy + w * 0.03);
  c.lineTo(cx + w * 0.1, cy + w * 0.04);
  c.lineTo(cx + w * 0.2, cy - w * 0.1);
  c.lineTo(cx + w * 0.22, cy - w * 0.27);
  c.lineTo(cx + w * 0.02, cy - w * 0.31);
  c.lineTo(cx - w * 0.07, cy - w * 0.24);
  c.lineTo(rx - w * 0.02, cy - w * 0.26);
  c.lineTo(rx - w * 0.08, cy - w * 0.19);
  c.lineTo(cx - w * 0.2, cy - w * 0.12);
  c.closePath(); c.fill();
  c.lineWidth = w * 0.055;
  c.beginPath(); c.moveTo(cx + w * 0.21, cy - w * 0.3); c.lineTo(fx, cy); c.stroke();             // fork
  c.beginPath(); c.moveTo(rx, cy); c.lineTo(cx - w * 0.12, cy - w * 0.02); c.stroke();             // swingarm
  c.beginPath(); c.moveTo(cx + w * 0.17, cy - w * 0.37); c.lineTo(cx + w * 0.29, cy - w * 0.4); c.stroke(); // handlebar
  c.restore();
}
function wheelchair(c, x, y, s, color) {
  // ISO-style wheelchair user, centre (x, y), size s.
  c.save(); c.translate(x, y);
  c.strokeStyle = color; c.fillStyle = color; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.arc(-s * 0.05, -s * 0.38, s * 0.08, 0, Math.PI * 2); c.fill();
  c.lineWidth = s * 0.085;
  c.beginPath(); c.moveTo(-s * 0.07, -s * 0.24); c.lineTo(-s * 0.1, s * 0.02); c.lineTo(s * 0.16, s * 0.02); c.lineTo(s * 0.26, s * 0.26); c.stroke();
  c.beginPath(); c.moveTo(-s * 0.08, -s * 0.14); c.lineTo(s * 0.1, -s * 0.14); c.stroke();
  c.lineWidth = s * 0.065;
  c.beginPath(); c.arc(-s * 0.04, s * 0.14, s * 0.22, Math.PI * 0.75, Math.PI * 2.35); c.stroke();
  c.restore();
}
function bus(c, x, y, w, color) {
  // Side view of a city bus, centre (x, y), width w.
  c.fillStyle = color;
  rrect(c, x - w / 2, y - w * 0.22, w, w * 0.38, w * 0.05); c.fill();
  c.fillStyle = BLUE;
  for (let k = 0; k < 4; k++) c.fillRect(x - w * 0.42 + k * w * 0.2, y - w * 0.16, w * 0.15, w * 0.12);
  c.fillStyle = color;
  for (const s of [-0.28, 0.3]) { c.beginPath(); c.arc(x + w * s, y + w * 0.17, w * 0.08, 0, Math.PI * 2); c.fill(); }
}

// ---------------------------------------------------------------------------------------------
// Pictograms (Swedish road signs, simplified). Size in metres is the caller's business; these
// are drawn at ~240 px per metre of a 0.64 m sign.

const PICTOS = {
  // E19 Parkering: blue square, white P.
  p: [160, 160, (c, w, h) => { squareBase(c, w, h, BLUE); text(c, 'P', w / 2, h * 0.53, h * 0.82, WHITE, '700'); }],
  // C35 Förbud att parkera fordon: blue disc, red ring and slash.
  pforbud: [160, 160, (c, w, h) => {
    const R = discBase(c, w, h, BLUE, RED);
    c.save(); c.translate(w / 2, h / 2); c.rotate(Math.PI / 4); c.fillStyle = RED; c.fillRect(-R * 0.8, -R * 0.1, R * 1.6, R * 0.2); c.restore();
  }],
  // C39 Förbud att stanna och parkera: blue disc, red ring and X.
  stoppforbud: [160, 160, (c, w, h) => {
    const R = discBase(c, w, h, BLUE, RED);
    c.save(); c.translate(w / 2, h / 2); c.fillStyle = RED;
    for (const a of [Math.PI / 4, -Math.PI / 4]) { c.save(); c.rotate(a); c.fillRect(-R * 0.8, -R * 0.1, R * 1.6, R * 0.2); c.restore(); }
    c.restore();
  }],
  // C2 Förbud mot trafik med motordrivet fordon: yellow disc, red ring, car over motorcycle.
  motorfordon: [160, 160, (c, w, h) => {
    discBase(c, w, h, YEL, RED);
    carSide(c, w / 2, h * 0.5, w * 0.42, BLACK);
    motorcycle(c, w / 2, h * 0.685, w * 0.36, BLACK);
  }],
  speed30: [160, 160, (c, w, h) => { discBase(c, w, h, YEL, RED); text(c, '30', w / 2, h * 0.53, h * 0.44, BLACK, '700'); }],
  speed50: [160, 160, (c, w, h) => { discBase(c, w, h, YEL, RED); text(c, '50', w / 2, h * 0.53, h * 0.44, BLACK, '700'); }],
  // E9 Gångfartsområde: blue rectangle, house, grown-up and child playing.
  gangfart: [150, 210, (c, w, h) => {
    squareBase(c, w, h, BLUE);
    c.fillStyle = WHITE;
    // house
    c.beginPath(); c.moveTo(w * 0.14, h * 0.36); c.lineTo(w * 0.14, h * 0.2); c.lineTo(w * 0.27, h * 0.11); c.lineTo(w * 0.4, h * 0.2); c.lineTo(w * 0.4, h * 0.36); c.closePath(); c.fill();
    c.fillStyle = BLUE; c.fillRect(w * 0.23, h * 0.26, w * 0.08, h * 0.1);
    walker(c, w * 0.6, h * 0.62, h * 0.4, WHITE, -1);
    walker(c, w * 0.34, h * 0.62, h * 0.25, WHITE, 1);
    c.fillStyle = WHITE; c.beginPath(); c.arc(w * 0.18, h * 0.58, w * 0.05, 0, Math.PI * 2); c.fill();
    carSide(c, w * 0.5, h * 0.86, w * 0.5, WHITE);
  }],
  // B2 Övergångsställe: blue square, white triangle, walker on a zebra.
  crossing: [160, 160, (c, w, h) => {
    squareBase(c, w, h, BLUE);
    c.fillStyle = WHITE; c.beginPath(); c.moveTo(w / 2, h * 0.13); c.lineTo(w * 0.88, h * 0.84); c.lineTo(w * 0.12, h * 0.84); c.closePath(); c.fill();
    c.fillStyle = BLACK;
    for (let k = 0; k < 4; k++) c.fillRect(w * (0.28 + k * 0.12), h * 0.76, w * 0.07, h * 0.05);
    walker(c, w * 0.52, h * 0.74, h * 0.42, BLACK, 1);
  }],
  // Hållplats för buss: blue square, white bus.
  bus: [160, 160, (c, w, h) => { squareBase(c, w, h, BLUE); bus(c, w / 2, h * 0.47, w * 0.74, WHITE); text(c, 'BUSS', w / 2, h * 0.8, h * 0.16, WHITE, '700'); }],
  // A15 Barn: yellow triangle, red border, two children.
  barn: [170, 150, (c, w, h) => {
    c.fillStyle = RED; c.beginPath(); c.moveTo(w / 2, h * 0.02); c.lineTo(w * 0.99, h * 0.97); c.lineTo(w * 0.01, h * 0.97); c.closePath(); c.fill();
    c.fillStyle = YEL; c.beginPath(); c.moveTo(w / 2, h * 0.2); c.lineTo(w * 0.85, h * 0.88); c.lineTo(w * 0.15, h * 0.88); c.closePath(); c.fill();
    walker(c, w * 0.44, h * 0.84, h * 0.42, BLACK, 1);
    walker(c, w * 0.6, h * 0.84, h * 0.3, BLACK, 1);
  }],
  // Wheelchair symbol plate (tilläggstavla for rörelsehindrade).
  hcp: [160, 160, (c, w, h) => { squareBase(c, w, h, BLUE); wheelchair(c, w * 0.5, h * 0.52, w * 0.8, WHITE); }],
  // Flags (for flagpoles at the kommunhus): Swedish flag and a municipal banner.
  flagSE: [192, 120, (c, w, h) => {
    c.fillStyle = '#1f5aa0'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#f2c414'; c.fillRect(w * 0.31, 0, w * 0.125, h); c.fillRect(0, h * 0.4, w, h * 0.2);
  }],
  flagKommun: [192, 120, (c, w, h) => {
    c.fillStyle = '#f2f0ea'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#2a5a3a';
    c.beginPath(); c.moveTo(w * 0.38, h * 0.18); c.lineTo(w * 0.62, h * 0.18); c.lineTo(w * 0.62, h * 0.55); c.quadraticCurveTo(w * 0.62, h * 0.8, w * 0.5, h * 0.86); c.quadraticCurveTo(w * 0.38, h * 0.8, w * 0.38, h * 0.55); c.closePath(); c.fill();
    c.fillStyle = '#e8c030'; c.beginPath(); c.arc(w * 0.5, h * 0.48, h * 0.12, 0, Math.PI * 2); c.fill();
  }],
  // Clock face for the church tower.
  clock: [128, 128, (c, w, h) => {
    c.fillStyle = '#1a1a1a'; c.beginPath(); c.arc(w / 2, h / 2, w * 0.47, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#f0ece2'; c.beginPath(); c.arc(w / 2, h / 2, w * 0.43, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#1a1a1a';
    for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; c.lineWidth = k % 3 ? w * 0.015 : w * 0.035; c.beginPath(); c.moveTo(w / 2 + Math.sin(a) * w * 0.36, h / 2 - Math.cos(a) * w * 0.36); c.lineTo(w / 2 + Math.sin(a) * w * 0.41, h / 2 - Math.cos(a) * w * 0.41); c.stroke(); }
    c.lineCap = 'round'; c.lineWidth = w * 0.035;
    c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(w / 2 + Math.sin(5.2) * w * 0.22, h / 2 - Math.cos(5.2) * w * 0.22); c.stroke();
    c.lineWidth = w * 0.022;
    c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(w / 2 + Math.sin(0.4) * w * 0.34, h / 2 - Math.cos(0.4) * w * 0.34); c.stroke();
  }],
  // Garbage / recycling pictograms on container lids.
  recycle: [128, 128, (c, w, h) => {
    c.fillStyle = '#2f6a3a'; c.fillRect(0, 0, w, h);
    c.strokeStyle = WHITE; c.lineWidth = w * 0.07;
    for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(w / 2, h / 2, w * 0.3, k * 2.09 + 0.2, k * 2.09 + 1.7); c.stroke(); }
  }],
};

// Plate shape per picto (what the backing plate behind it looks like).
export const PICTO_SHAPE = { pforbud: 'disc', stoppforbud: 'disc', motorfordon: 'disc', speed30: 'disc', speed50: 'disc', barn: 'tri', clock: 'disc' };
export function picto(name) {
  const p = PICTOS[name];
  if (!p) throw new Error('unknown sign picto ' + name);
  const f = face('picto:' + name, p[0], p[1], p[2], PICTO_SHAPE[name] ? 'cutout' : 'plain');
  f.shape = PICTO_SHAPE[name] || 'rect';
  return f;
}

// Painted ground symbols (transparent background, white or yellow paint).
const DECALS = {
  hcp: [200, 200, (c, w, h) => { wheelchair(c, w / 2, h / 2, w * 0.9, '#e8e8e2'); }],
  p: [160, 200, (c, w, h) => { text(c, 'P', w / 2, h * 0.54, h * 0.95, '#e8e8e2', '700'); }],
  buss: [400, 140, (c, w, h) => { text(c, 'BUSS', w / 2, h * 0.54, h * 0.9, '#e8e8e2', '700'); }],
  // Faded-ish "LASTZON" lettering.
  last: [440, 140, (c, w, h) => { text(c, 'LASTZON', w / 2, h * 0.54, h * 0.9, '#e8e8e2', '700'); }],
  ambulans: [480, 130, (c, w, h) => { text(c, 'AMBULANS', w / 2, h * 0.54, h * 0.9, '#e8d040', '700'); }],
};
export function decal(name) {
  const d = DECALS[name];
  if (!d) throw new Error('unknown decal ' + name);
  return face('decal:' + name, d[0], d[1], d[2], 'decal');
}

// A text plate. opts: bg, fg, border (colour or null), weight, scale (text height / plate
// height per line), ppm (pixels per metre), glow (true: self-lit page), align, pad, font.
export function textFace(str, w, h, opts = {}) {
  const ppm = opts.ppm ?? 220;
  const bg = opts.bg === undefined ? WHITE : opts.bg, fg = opts.fg ?? BLACK, border = opts.border === undefined ? null : opts.border;
  const weight = opts.weight ?? '600', scale = opts.scale ?? 0.62, align = opts.align ?? 'center';
  const key = ['t', str, w, h, bg, fg, border, weight, scale, ppm, align, opts.font || '', opts.radius || 0].join('|');
  return face(key, w * ppm, h * ppm, (c, W, H) => {
    if (bg) {
      c.fillStyle = bg;
      if (opts.radius) { c.fillStyle = '#9a9c9e'; c.fillRect(0, 0, W, H); c.fillStyle = bg; rrect(c, 0, 0, W, H, opts.radius * ppm); c.fill(); }
      else c.fillRect(0, 0, W, H);
    }
    if (border) { c.strokeStyle = border; c.lineWidth = Math.max(2, H * (opts.borderW ?? 0.06)); const i = c.lineWidth * 0.9; if (opts.radius) { rrect(c, i, i, W - 2 * i, H - 2 * i, opts.radius * ppm * 0.8); c.stroke(); } else c.strokeRect(i, i, W - 2 * i, H - 2 * i); }
    const lines = String(str).split('\n');
    const size = (H * scale) / lines.length;
    const font = opts.font || FONT;
    lines.forEach((l, i) => {
      const y = H / 2 + (i - (lines.length - 1) / 2) * size * 1.12 + size * 0.05;
      c.font = `${weight} ${size}px ${font}`;
      c.textAlign = align; c.textBaseline = 'middle';
      const m = c.measureText(l).width, maxW = W * 0.9;
      if (m > maxW) c.font = `${weight} ${size * maxW / m}px ${font}`;
      c.fillStyle = fg;
      c.fillText(l, align === 'left' ? W * 0.06 : align === 'right' ? W * 0.94 : W / 2, y);
    });
  }, opts.glow ? 'glow' : opts.cutout ? 'cutout' : 'plain');
}

// ---------------------------------------------------------------------------------------------
// Twig silhouettes for see-through cards (tree crowns in winter, bare hedges). Drawn as recursive,
// slightly wiggling strokes in a dark purple-brown; transparent elsewhere.

const TWIG = 'rgb(110, 98, 88)', CROWN = 'rgb(78, 57, 52)', TOPC = 'rgb(98, 76, 64)';
function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// One twig from (x, y) heading `ang` (0 = up, positive = to the right), `len` px long, `wid` px
// wide. `droop` (rad over its length) bends it towards hanging down; children branch off it.
function twig(c, R, x, y, ang, len, wid, depth, o, inside) {
  const n = Math.max(2, Math.ceil(len / 5));
  const step = len / n;
  const pts = [];
  c.lineWidth = Math.max(0.55, wid);
  c.beginPath(); c.moveTo(x, y);
  let a = ang;
  const side = Math.sign(a) || (R() < 0.5 ? -1 : 1);
  for (let i = 0; i < n; i++) {
    a += (R() - 0.5) * (o.wiggle ?? 0.3);
    a += side * (o.droop || 0) / n;
    a = Math.max(-Math.PI, Math.min(Math.PI, a));
    x += Math.sin(a) * step; y -= Math.cos(a) * step;
    if (inside && !inside(x, y)) break;
    c.lineTo(x, y); pts.push([x, y, a]);
  }
  c.stroke();
  if (depth <= 0 || pts.length < 2) return;
  const nk = o.kids[0] + Math.floor(R() * (o.kids[1] + 1));
  for (let k = 0; k < nk; k++) {
    const p = pts[Math.min(pts.length - 1, Math.floor((o.from ?? 0.25) * pts.length + R() * (1 - (o.from ?? 0.25)) * pts.length))];
    const sd = R() < 0.5 ? -1 : 1;
    const na = p[2] + sd * (o.spread[0] + R() * o.spread[1]);
    twig(c, R, p[0], p[1], na, len * (o.ratio[0] + R() * o.ratio[1]), wid * 0.62, depth - 1, { ...o, droop: (o.droop || 0) * (o.droopGrow ?? 1) + (o.droopAdd ?? 0) }, inside);
  }
}
// Flat sprays of scale leaves (thuja) / small leaves: a short stem fanning into 4-7 shoots, green
// with lighter tips; n sprays, y(R) picks their height.
function sprays(c, R, W, H, n, yf, bronze, lit = 1, size = 1, cm = null) {
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (let k = 0; k < n; k++) {
    const x = W * (0.02 + 0.96 * R()), y = yf(R), up = -Math.PI / 2 + (R() - 0.5) * 1.4;
    const g = (58 + R() * 34) * lit * (0.8 + 0.2 * (1 - y / H)), rr = bronze && R() < 0.5 ? g * 0.98 : g * 0.74, bb = bronze ? g * 0.4 : g * 0.42;
    c.strokeStyle = cm ? cm(rr, g, bb) : `rgb(${Math.round(rr)}, ${Math.round(g)}, ${Math.round(bb)})`;
    const L = (4 + R() * 6) * size, nf = 4 + Math.floor(R() * 4);
    c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(x, y + L * 0.6); c.lineTo(x, y); c.stroke();
    c.lineWidth = 1.3 + R() * 0.8;
    for (let q = 0; q < nf; q++) {
      const a = up + (q / (nf - 1) - 0.5) * 1.6, l = L * (0.5 + R() * 0.5);
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
    }
  }
}
// Flat fans of scale leaves (thuja): a short stem forking two or three times in one plane into
// thick, blunt branchlets, yellow-green to bronze-olive (winter).
function fans(c, R, W, H, n, yf, bronze, lit = 1, size = 1, cm = null) {
  c.lineCap = 'round'; c.lineJoin = 'round';
  const fork = (x, y, a, L, wd, d, col) => {
    const ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L;
    c.strokeStyle = col; c.lineWidth = wd;
    c.beginPath(); c.moveTo(x, y); c.lineTo(ex, ey); c.stroke();
    if (d > 0) for (const sd of [-1, 0, 1]) if (sd !== 0 || R() < 0.6) fork(ex, ey, a + sd * (0.45 + R() * 0.25), L * (0.62 + R() * 0.15), wd * 0.82, d - 1, col);
  };
  for (let k = 0; k < n; k++) {
    const x = W * (0.02 + 0.96 * R()), y = yf(R), a = -Math.PI / 2 + (R() - 0.5) * 1.6;
    const g = (60 + R() * 34) * (0.82 + 0.18 * (1 - y / H)) * lit, br = bronze && R() < 0.55;
    const col = cm ? cm(g * (br ? 0.98 : 0.72), g, g * (br ? 0.42 : 0.5)) : `rgb(${Math.round(g * (br ? 0.98 : 0.72))}, ${Math.round(g)}, ${Math.round(g * (br ? 0.42 : 0.5))})`;
    fork(x, y, a, (3 + R() * 3) * size, 2.4 * size, 2, col);
  }
}
// The face of a clipped evergreen hedge (round 5): a solid wall of small leaf clusters, opaque below
// the clipped line (top, px from the card's top; 0: no fringe), so from 5-15 m it reads as a calm,
// finely textured green face (sparse sprays over the dark body mip-mapped into black-and-white
// speckle). Shadowed hollows, clusters lit from above, a few lighter shoot tips, sprays (or thuja
// fans) for the near detail and, above the clipped line, a frayed fringe of shoots. bronze: winter
// bronze-olive patches (thuja); every value in sRGB, mid greens about like the hedge body.
function leafWall(c, R, W, H, top, bronze, fan, tone = 1) {
  const TAU_ = Math.PI * 2, p1 = R() * 9, p2 = R() * 9;
  // (phase 4 r2: the cemetery's thuja less saturated still, an olive green: it read as green felt)
  const LR = fan ? THUJA_RGB : leafRGB;
  const patch = (x, y) => bronze ? Math.max(0, Math.sin(x * 0.021 + p1) * Math.sin(y * 0.027 + p2) + 0.35 * Math.sin(x * 0.061 + y * 0.043 + p1 * 2)) : 0;
  // (round 6: every colour through LR, and the clusters vary less: a soft leaf mass, not camouflage)
  const col = (g, x, y, k = 1) => { const b = patch(x, y) > 0.45 && R() < 0.8; k *= tone; return LR(g * (b ? 0.94 : 0.72) * k, g * k, g * (b ? 0.36 : 0.33) * k); };
  // the shadowed inside, below a clipped line that wavers by a few pixels
  c.fillStyle = fan ? LR(58, 72, 28) : LR(56, 80, 26);
  c.beginPath(); c.moveTo(-2, H + 2);
  for (let x = -2; x <= W + 8; x += 8) c.lineTo(x, top + 3 + R() * 6);
  c.lineTo(W + 2, H + 2); c.closePath(); c.fill();
  const y0 = top + 4, n = Math.round(W * (H - y0) / 60);
  const cl = [];
  for (let k = 0; k < n; k++) cl.push([R() * W, y0 + Math.pow(R(), 0.9) * (H - y0), 3.2 + R() * 4.5, R() * TAU_]);
  // (hollows: each cluster's shadow, down and to the right, then the clusters, then their lit tops)
  c.fillStyle = fan ? LR(46, 58, 24) : LR(44, 64, 22);
  for (const [x, y, r] of cl) { c.beginPath(); c.ellipse(x + 1.6, y + 2.2, r * 1.05, r * 0.8, 0, 0, TAU_); c.fill(); }
  for (const [x, y, r, a] of cl) {
    const g = (fan ? 90 : 112) + R() * 24 - 10 * (y / H);
    c.fillStyle = col(g, x, y);
    for (let q = 0; q < 3; q++) { const aa = a + q * 2.1, d = r * 0.42; c.beginPath(); c.ellipse(x + Math.cos(aa) * d, y + Math.sin(aa) * d * 0.8, r * 0.62, r * 0.4, aa, 0, TAU_); c.fill(); }
    if (R() < 0.55) { c.fillStyle = col(g, x, y, 1.1); c.beginPath(); c.ellipse(x - r * 0.15, y - r * 0.35, r * 0.42, r * 0.26, a, 0, TAU_); c.fill(); }
  }
  // near detail: flat sprays / thuja fans over the clusters, a few light shoot tips
  if (fan) fans(c, R, W, H, Math.round(n * 0.16), (R_) => y0 + R_() * (H - y0), bronze, 1.2, 0.9, LR);
  else sprays(c, R, W, H, Math.round(n * 0.22), (R_) => y0 + R_() * (H - y0), bronze, 1.25, 0.85, LR);
  for (let k = 0; k < n * 0.1; k++) {
    const x = R() * W, y = y0 + R() * (H - y0);
    c.fillStyle = col(118 + R() * 16, x, y); c.beginPath(); c.ellipse(x, y, 1.6 + R(), 1.1, R() * 3, 0, TAU_); c.fill();
  }
  // the frayed fringe over the clipped line (shoots that grew since the last clipping): low and
  // sparse, so the snow on top stays a clean white band (leaves on snow read as speckle)
  // (round 6: sparser still, and lighter)
  if (top > 0) {
    if (fan) fans(c, R, W, H, Math.round(W / 18), (R_) => top * (0.72 + 0.38 * R_()), bronze, 1.5 * tone, 0.8, LR);
    else sprays(c, R, W, H, Math.round(W / 16), (R_) => top * (0.7 + 0.4 * R_()), bronze, 1.55 * tone, 0.75, LR);
  }
}
// (round 6) Leaf colours for the clipped hedges: 20 % less saturated, and pulled towards the hedge's
// mid green (in linear light) so the darkest leaves are about half the mid-tone, not near-black
// (round 5's hedges were camouflage at 3-8 m in the sun and black speckle in the shade).
const LEAF_MID = [0.085, 0.165, 0.03];
const s2l = (v) => { v = Math.max(0, Math.min(255, v)) / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const l2s = (v) => Math.round(255 * Math.min(1, v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
const THUJA_RGB = (r, g, b) => leafRGB(r, g, b, 0.62);
function leafRGB(r, g, b, sat = 0.8) {
  const L = [s2l(r), s2l(g), s2l(b)].map((v, i) => LEAF_MID[i] + (v - LEAF_MID[i]) * 0.62);
  const Y = 0.2126 * L[0] + 0.7152 * L[1] + 0.0722 * L[2];
  const o = L.map((v) => l2s(Math.max(0, Y + (v - Y) * sat)));
  return `rgb(${o[0]}, ${o[1]}, ${o[2]})`;
}
// (round 6) A loose shoot standing proud of a clipped face (its base at the card's left edge, growing
// to the right and a little up): a curving stem with small leaves along it, larger and denser towards
// the tip; fan: a flat thuja branchlet that forks into blunt scale-leaf fans.
function sprigShoot(c, R, W, H, fan) {
  const TAU_ = Math.PI * 2, LR = fan ? THUJA_RGB : leafRGB;
  c.lineCap = 'round'; c.lineJoin = 'round';
  const pts = [];
  let x = 1, y = H * 0.6, a = -0.1;
  while (x < W - 8) { pts.push([x, y, a]); x += Math.cos(a) * 4; y += Math.sin(a) * 4; a += (R() - 0.55) * 0.14; }
  c.strokeStyle = LR(74, 78, 44); c.lineWidth = 1.8;
  c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (const p of pts) c.lineTo(p[0], p[1]); c.stroke();
  if (fan) {
    const fork = (x0, y0_, a0, L, wd, d, col) => {
      const ex = x0 + Math.cos(a0) * L, ey = y0_ + Math.sin(a0) * L;
      c.strokeStyle = col; c.lineWidth = wd; c.beginPath(); c.moveTo(x0, y0_); c.lineTo(ex, ey); c.stroke();
      if (d > 0) for (const sd of [-1, 0, 1]) if (sd !== 0 || R() < 0.6) fork(ex, ey, a0 + sd * (0.45 + R() * 0.25), L * 0.68, wd * 0.82, d - 1, col);
    };
    for (let i = 3; i < pts.length; i += 2) {
      const [px, py, pa] = pts[i], t = i / pts.length, g = 96 + R() * 26 + t * 10;
      fork(px, py, pa + (i % 4 < 2 ? -0.7 : 0.7), 4 + t * 4, 2.6, 2, LR(g * 0.72, g, g * 0.5));
    }
  } else {
    for (let i = 2; i < pts.length; i++) {
      const [px, py, pa] = pts[i], t = i / pts.length;
      for (const sd of [-1, 1]) {
        if (R() < 0.25 - t * 0.2) continue;
        const la = pa + sd * (0.75 + R() * 0.5), L = 4 + R() * 3 + t * 3, g = 100 + R() * 28 + t * 8;
        c.fillStyle = LR(g * 0.72, g, g * 0.34);
        c.beginPath(); c.ellipse(px + Math.cos(la) * L * 0.55, py + Math.sin(la) * L * 0.55, L * 0.62, L * 0.3, la, 0, TAU_); c.fill();
      }
    }
    const [tx, ty] = pts[pts.length - 1], g = 128;
    c.fillStyle = LR(g * 0.74, g, g * 0.36);
    for (let q = 0; q < 4; q++) { const la = -0.9 + q * 0.6; c.beginPath(); c.ellipse(tx + Math.cos(la) * 3.5, ty + Math.sin(la) * 3.5, 4.2, 2.2, la, 0, TAU_); c.fill(); }
  }
}
// The fine twigs a crown is mostly made of are far below a card texel: fill the crown with a
// mist of tiny, faint strokes, densest in the middle (density in the mips; at a distance a crown
// reads as a twiggy mass instead of a sparse scribble the sky shows through).
function fineFill(c, R, W, H, inside, n, alpha, cx = 0.5, cy = 0.5, rx = 0.5, ry = 0.5) {
  c.save();
  c.globalAlpha = alpha; c.lineWidth = 0.6; c.lineCap = 'round';
  for (let k = 0; k < n; k++) {
    const a = R() * Math.PI * 2, d = Math.pow(R(), 0.75);
    const x = W * (cx + Math.cos(a) * d * rx), y = H * (cy + Math.sin(a) * d * ry);
    if (!inside(x, y)) continue;
    const ang = (R() - 0.5) * 2.4 + (R() < 0.5 ? 0 : Math.PI), L = 3 + R() * 6;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.sin(ang) * L, y - Math.cos(ang) * L); c.stroke();
  }
  c.restore();
}
// Pendulous needled branchlets ('combs' of a Norway spruce) hanging from a branch line y = yb(x)
// between x0 and x1: each a slightly curving twig, needles angled forwards-down along it, crowded
// and overlapping; their length follows len(f) (f = 0..1 along the branch), so the curtain's lower
// edge is an irregular curve, not a ruled line. Dark blue-green, lighter at the top.
// (shared by the side view and the tip view)
const combs = (c, R, W, H, yb, len, n, ndl) => {
  for (let k = 0; k < n; k++) {
    const f = (k + R() * 0.9) / n, x = 2 + f * (W - 4), L = H * len(f) * (0.6 + R() * 0.5);
    if (L < 4) continue;
    const dx = (R() - 0.45) * L * 0.25, ys = yb(x);
    c.strokeStyle = 'rgb(50, 42, 32)'; c.lineWidth = 1.1;
    c.beginPath(); c.moveTo(x, ys); c.quadraticCurveTo(x + dx * 0.2, ys + L * 0.5, x + dx, ys + L); c.stroke();
    const step = 2.2 + R() * 0.8;
    for (let d = 3; d < L; d += step) {
      const t = d / L, px = x + dx * t * t, py = ys + d, kk = 0.7 * (1 - t) + 0.15 * R();
      for (const sd of [-1, 1]) {
        if (R() < 0.12) continue;
        c.strokeStyle = ndl(kk); c.lineWidth = 1.3 + R() * 0.6;
        const nl = (4 + R() * 4) * (1 - t * 0.35), a = sd * (0.55 + R() * 0.5);   // angled down, away from the twig
        c.beginPath(); c.moveTo(px, py); c.lineTo(px + Math.sin(a) * nl, py + Math.cos(a) * nl * 0.9); c.stroke();
      }
    }
  }
};
// First snow lying on a branch drawn along y = yb(x), from x0 to x1: thin, lumpy caps, white on top, a
// little blue-grey underneath (seen from the side). (phase 4 r2: two or three irregular clumps per
// branch, not lumps all along it: every snowy card's row of short white dashes read as stitching
// along the tiers)
function branchSnow(c, R, yb, x0, x1) {
  const n = 2 + (R() < 0.4 ? 1 : 0);
  for (let k = 0; k < n; k++) {
    const L = 14 + R() * 20, th = 3 + R() * 3.5, x = x0 + (x1 - x0 - L) * ((k + R() * 0.8) / n);
    for (let q = 0; q < L; q += 2) {
      const e = Math.pow(Math.sin((q / L) * Math.PI), 0.7) * (0.75 + 0.25 * Math.sin(q * 0.9 + k * 2)), px = x + q, y = yb(px);
      c.fillStyle = 'rgb(214, 222, 234)'; c.beginPath(); c.ellipse(px, y - th * e * 0.35, 2.4, th * e * 0.6 + 0.6, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgb(242, 244, 246)'; c.beginPath(); c.ellipse(px, y - th * e * 0.7, 2.2, th * e * 0.45 + 0.5, 0, 0, Math.PI * 2); c.fill();
    }
  }
}
const LEAF_TONE = [1, 0.98, 1.02, 0.99];   // per variant (more than a few % shows every card as a tile)
const TWIGS = {
  // Birch crown seen from the side; the stem is the card's centre line, the crown base its bottom
  // edge. Limbs rise and arch over, then fork into ever finer twigs that hang down.
  birch: [384, 480, (c, W, H, R) => {
    const inside = (x, y) => ((x - W / 2) / (W * 0.5)) ** 2 + ((y - H * 0.52) / (H * 0.5)) ** 2 < 1;
    c.strokeStyle = CROWN; c.lineCap = 'round'; c.lineJoin = 'round';
    fineFill(c, R, W, H, inside, 2600, 0.28, 0.5, 0.55, 0.46, 0.44);
    const nl = 30;
    for (let k = 0; k < nl; k++) {
      const t = k / nl, y = H * (0.98 - 0.88 * t) + (R() - 0.5) * 10, sd = k % 2 ? 1 : -1;
      const ang = sd * (0.5 + R() * 0.5 - t * 0.25);
      twig(c, R, W / 2 + sd * R() * 4, y, ang, W * (0.26 + R() * 0.18) * (1.05 - Math.abs(t - 0.4) * 0.8), 2.0, 4,
        { kids: [2, 1], spread: [0.3, 0.6], ratio: [0.42, 0.22], droop: 0.5, droopAdd: 0.9, wiggle: 0.25, from: 0.2 }, inside);
    }
    // Fine hanging twigs (short, many, slightly curved).
    c.lineWidth = 0.7;
    for (let k = 0; k < 260; k++) {
      const x = W * (0.06 + R() * 0.88), y = H * (0.08 + R() * 0.72);
      if (!inside(x, y)) continue;
      const L = 6 + R() * 16;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + (R() - 0.5) * 6, y + L * 0.5, x + (R() - 0.5) * 5, y + L); c.stroke();
    }
  }],
  // Lime / maple crown: a dome of upright limbs that fork again and again, finest at the rim.
  lime: [384, 320, (c, W, H, R) => {
    const inside = (x, y) => ((x - W / 2) / (W * 0.5)) ** 2 + ((y - H * 0.62) / (H * 0.62)) ** 2 < 1;
    c.strokeStyle = CROWN; c.lineCap = 'round'; c.lineJoin = 'round';
    fineFill(c, R, W, H, inside, 2200, 0.26, 0.5, 0.6, 0.46, 0.42);
    for (let k = 0; k < 11; k++) {
      const ang = -0.95 + (k / 10) * 1.9 + (R() - 0.5) * 0.2;
      twig(c, R, W / 2 + (R() - 0.5) * 12, H, ang, H * (0.45 + R() * 0.2), 2.6, 5,
        { kids: [2, 1], spread: [0.25, 0.45], ratio: [0.5, 0.2], droop: 0, droopAdd: 0.12, wiggle: 0.3 }, inside);
    }
  }],
  // Side of a clipped bare hedge: dense stems from the ground, forking upwards, a frayed fringe
  // above the clipped top (the top ~18 % of the card).
  hedgeside: [384, 160, (c, W, H, R) => {
    c.strokeStyle = TWIG; c.lineCap = 'round'; c.lineJoin = 'round';
    const top = H * 0.18;
    // (round 5: a haze of fine twigs in the body and more stems, so from 5-15 m the hedge is a calm
    // brown-grey twig mass rather than sparse strokes over the dark core: black-and-white speckle)
    fineFill(c, R, W, H, (x, y) => y > top * 1.2 && x > 1 && x < W - 1, 2600, 0.32, 0.5, 0.6, 0.5, 0.42);
    for (let k = 0; k < 96; k++) {
      const x = (k + R()) / 96 * W;
      twig(c, R, x, H, (R() - 0.5) * 0.6, H * (0.5 + R() * 0.35), 1.7, 4,
        { kids: [2, 1], spread: [0.25, 0.5], ratio: [0.5, 0.25], droop: 0, wiggle: 0.4, from: 0.15 }, (px, py) => py > top * (0.2 + R() * 0.8) && px > 0 && px < W);
    }
  }],
  // Scots pine needle clump: tufts of short needles, darker below, lit at the top, a flattish base.
  pine: [256, 176, (c, W, H, R) => {
    c.lineCap = 'round';
    const tufts = [];
    for (let k = 0; k < 90; k++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R());
      const x = W / 2 + Math.cos(a) * d * W * 0.44, y = H * 0.5 + Math.sin(a) * d * H * (Math.sin(a) > 0 ? 0.3 : 0.42);
      tufts.push([x, y]);
    }
    tufts.sort((p, q) => q[1] - p[1]);
    c.strokeStyle = 'rgb(70, 52, 40)'; c.lineWidth = 1.6;
    for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(W / 2 + (R() - 0.5) * 20, H * 0.75); c.lineTo(W * (0.15 + R() * 0.7), H * (0.3 + R() * 0.3)); c.stroke(); }
    for (const [x, y] of tufts) {
      const t = 1 - y / H;
      const g = Math.round(52 + 40 * t + R() * 14), r = Math.round(g * 0.72), b = Math.round(g * 0.52);
      c.strokeStyle = `rgb(${r}, ${g}, ${b})`;
      c.lineWidth = 1.3;
      const n = 16 + Math.floor(R() * 10);
      for (let q = 0; q < n; q++) {
        const ang = -Math.PI / 2 + (R() - 0.5) * 2.6, L = 5 + R() * 9;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(ang) * L, y + Math.sin(ang) * L * 0.8); c.stroke();
      }
    }
  }],
  // Birch: a curtain of fine hanging twigs (the card hangs from a limb at its top edge): a few
  // drooping shoots, each shedding long, thin, nearly vertical twigs, in warm purple-browns, with
  // gaps between them (coverage about a third: a curtain, never a bar).
  birchhang: [192, 320, (c, W, H, R) => {
    c.lineCap = 'round'; c.lineJoin = 'round';
    const cols = ['rgb(92, 63, 58)', 'rgb(84, 58, 55)', 'rgb(102, 72, 63)', 'rgb(76, 55, 54)'];
    const inside = (x, y) => x > 1 && x < W - 1 && y < H - 1;
    for (let k = 0; k < 4; k++) {
      c.strokeStyle = cols[k % 4];
      const x = W * (0.12 + 0.76 * (k + R()) / 4);
      twig(c, R, x, R() * 6, Math.PI + (R() - 0.5) * 0.7, H * (0.4 + R() * 0.5), 1.3, 2,
        { kids: [2, 1], spread: [0.06, 0.2], ratio: [0.35, 0.4], droop: 0, wiggle: 0.12, from: 0.05 }, inside);
    }
    for (let k = 0; k < 26; k++) {
      c.strokeStyle = cols[(k + 1) % 4]; c.lineWidth = 0.7 + R() * 0.5;
      const x = W * (0.04 + R() * 0.92), y = H * R() * 0.3, L = H * (0.25 + R() * 0.5);
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + (R() - 0.5) * 10, y + L * 0.5, x + (R() - 0.5) * 8, Math.min(H - 2, y + L)); c.stroke();
    }
  }],
  // Crowns seen from above (a horizontal card, so drone and aerial views keep the crown's mass
  // where the upright cards turn edge-on): a soft, warm twig-brown mass (about half cover in the
  // middle, thinning to the rim) with twigs radiating from the middle, forking outwards.
  crowntop: [320, 320, (c, W, H, R) => {
    const g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.49);
    g.addColorStop(0, 'rgba(104, 84, 72, 0.42)'); g.addColorStop(0.6, 'rgba(104, 84, 72, 0.26)'); g.addColorStop(1, 'rgba(104, 84, 72, 0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.strokeStyle = TOPC; c.lineCap = 'round'; c.lineJoin = 'round';
    const inside = (x, y) => ((x - W / 2) ** 2 + (y - H / 2) ** 2) < (W * 0.49) ** 2;
    fineFill(c, R, W, H, inside, 1600, 0.2, 0.5, 0.5, 0.47, 0.47);
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2 + R() * 0.2;
      twig(c, R, W / 2 + Math.sin(a) * 6, H / 2 - Math.cos(a) * 6, a, W * (0.3 + R() * 0.18), 2.0, 4,
        { kids: [2, 1], spread: [0.25, 0.45], ratio: [0.45, 0.25], droop: 0, wiggle: 0.3, from: 0.2 }, inside);
    }
  }],
  // Side of a clipped evergreen hedge (thuja / liguster): small flat sprays of scale leaves,
  // densest along the top, where a ragged fringe pokes over the clipped line (the top ~20 % of the
  // card is above the hedge). Variants 2, 3: winter bronze.
  // (dense: the card covers its face; the hedge body behind shows only in the gaps, as depth)
  // (round 5: page 'leaf'; a solid wall of leaves below the clipped line at 16 % from the top, see
  // leafWall; ~3 mm per pixel on a 0.8 x 1 m card; v 0..3 are seeds, all green)
  hedgegreen: [256, 320, (c, W, H, R, v) => leafWall(c, R, W, H, H * 0.16, false, false, LEAF_TONE[v])],
  // the same without the fringe over the top (the lower rows of a tall hedge)
  hedgegreenlow: [256, 320, (c, W, H, R, v) => leafWall(c, R, W, H, 0, false, false, LEAF_TONE[v])],
  // thuja (cemetery): flat fans of scale leaves; v 2, 3 with winter bronze-olive patches
  thujagreen: [256, 320, (c, W, H, R, v) => leafWall(c, R, W, H, H * 0.16, v >= 2, true, LEAF_TONE[v])],
  thujagreenlow: [256, 320, (c, W, H, R, v) => leafWall(c, R, W, H, 0, v >= 2, true, LEAF_TONE[v])],
  // Across the top of an evergreen hedge: sprays poking up out of the clipped top.
  // (round 6: fewer and lighter: dark sprays over the white snow cap read as black speckle)
  hedgegreentop: [384, 80, (c, W, H, R) => sprays(c, R, W, H, 40, (R_) => H * (0.55 + 0.4 * R_()), false, 1.4, 1, leafRGB)],
  // (round 6) a loose shoot proud of the face (kit.hedge leans a few out of both faces)
  hedgesprig: [128, 80, (c, W, H, R) => sprigShoot(c, R, W, H, false)],
  thujasprig: [128, 80, (c, W, H, R) => sprigShoot(c, R, W, H, true)],
  // Lime / garden tree: a spray of fine, upright, forking twigs at a branch end (bottom centre).
  limespray: [256, 192, (c, W, H, R) => {
    c.strokeStyle = CROWN; c.lineCap = 'round'; c.lineJoin = 'round';
    const inside = (x, y) => x > 1 && x < W - 1 && y > 1;
    for (let k = 0; k < 7; k++) {
      twig(c, R, W / 2 + (R() - 0.5) * 20, H, -1.0 + (k / 6) * 2.0 + (R() - 0.5) * 0.2, H * (0.45 + R() * 0.35), 1.8, 3,
        { kids: [2, 1], spread: [0.25, 0.4], ratio: [0.5, 0.25], droop: 0, wiggle: 0.35 }, inside);
    }
  }],
  // A spruce sprig seen from above (granris): a stem along the card, side shoots with needles.
  // (phase 4 r2: page 'leaf', lit by its own normal; needles in a mid spruce green, q 95-150, with a
  // lighter tip on half of them: at q 56-94 (3-8 % albedo) they were black combs against the snow)
  sprig: [96, 256, (c, W, H, R, v) => {
    c.lineCap = 'round';
    const col = (q) => `rgb(${Math.round(q * 0.68)}, ${Math.round(q)}, ${Math.round(q * 0.6)})`;
    const needle = (x0, y0, x1, y1) => {
      const q = 95 + R() * 40;
      c.strokeStyle = col(q); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      if (R() < 0.5) { c.strokeStyle = col(Math.min(150, q + 22 + R() * 12)); c.beginPath(); c.moveTo(x0 + (x1 - x0) * 0.55, y0 + (y1 - y0) * 0.55); c.lineTo(x1, y1); c.stroke(); }
    };
    c.strokeStyle = 'rgb(110, 86, 62)'; c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(W / 2, H - 4); c.quadraticCurveTo(W / 2 + (R() - 0.5) * 10, H / 2, W / 2 + (R() - 0.5) * 6, 6); c.stroke();
    for (let y = 10; y < H - 8; y += 9) for (const sd of [-1, 1]) {
      const L = (W * 0.42) * (0.55 + 0.45 * Math.sin((y / H) * Math.PI)) * (0.8 + R() * 0.3), x0 = W / 2, a = sd * (1.0 + R() * 0.3);
      c.strokeStyle = 'rgb(110, 86, 62)'; c.lineWidth = 1.1;
      c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 + Math.sin(a) * L, y - Math.cos(a) * L * 0.6); c.stroke();
      c.lineWidth = 1.3;
      for (let t = 0.1; t < 1; t += 0.12) {
        const px = x0 + Math.sin(a) * L * t, py = y - Math.cos(a) * L * 0.6 * t;
        for (const nd of [-1, 1]) needle(px, py, px + nd * 2.5 + Math.sin(a) * 3, py - 4.5);
      }
    }
    c.lineWidth = 1.3;
    for (let y = 8; y < H - 6; y += 5) for (const nd of [-1, 1]) needle(W / 2, y, W / 2 + nd * 5, y - 5);
    // variant 3: dusted with snow (flecks on the needles)
    if (v === 3) for (let k = 0; k < 70; k++) {
      const y = 8 + R() * (H - 16), hw = W * 0.4 * Math.sin((y / H) * Math.PI), x = W / 2 + (R() * 2 - 1) * hw;
      c.fillStyle = `rgb(${232 + Math.round(R() * 14)}, ${236 + Math.round(R() * 12)}, 244)`;
      c.beginPath(); c.ellipse(x, y, 1.6 + R() * 2.2, 1.2 + R() * 1.4, R() * 3, 0, Math.PI * 2); c.fill();
    }
  }],
  // A spruce branch seen from the side (card left = the stem, right = the tip, the branch along
  // the top; the card is skewed to the branch's droop in the world): combs hang from it, longest
  // a third of the way out; needles and short shoots stick up from its upper side.
  sprucebranch: [256, 160, (c, W, H, R, v) => {
    c.lineCap = 'round'; c.lineJoin = 'round';
    const ndl = (k) => { const v = 34 + k * 30 + R() * 22; return `rgb(${Math.round(v * 0.63)}, ${Math.round(v)}, ${Math.round(v * 0.72)})`; };
    const yb = (x) => H * 0.13 + Math.sin(x * 0.05) * 1.2 + (x / W) ** 2 * H * 0.04;
    combs(c, R, W, H, yb, (f) => 0.12 + 0.72 * Math.sin(Math.PI * Math.min(1, Math.pow(f, 0.6) * 1.05)) * (1 - 0.35 * f), 46, ndl);
    c.strokeStyle = 'rgb(58, 47, 36)'; c.lineWidth = 2.6;
    c.beginPath(); c.moveTo(0, yb(0)); for (let x = 6; x <= W; x += 6) c.lineTo(x, yb(x)); c.stroke();
    for (let x = 2; x < W; x += 2.2) {
      c.strokeStyle = ndl(1); c.lineWidth = 1.4;
      const nl = 3 + R() * 6 * (1 - 0.4 * x / W), a = 0.5 + (R() - 0.5) * 1.6;
      c.beginPath(); c.moveTo(x, yb(x)); c.lineTo(x + Math.sin(a) * nl, yb(x) - Math.cos(a) * nl); c.stroke();
    }
    for (let k = 0; k < 12; k++) {
      c.strokeStyle = ndl(0.8); c.lineWidth = 1.5;
      const y = yb(W) + (R() - 0.5) * 10, L = 6 + R() * 8;
      c.beginPath(); c.moveTo(W - 16, y); c.lineTo(W - 16 + L, y + (R() - 0.3) * 6); c.stroke();
    }
    if (v >= 2) branchSnow(c, R, (x) => yb(x) - 1.5, W * 0.18, W * 0.78);
  }],
  // (round 5) A spruce branch seen from above (the card lies on the branch: stem at the left, tip at
  // the right): a main axis with side shoots angled forwards, some with their own shoots, needles all
  // round, the outline widest a third of the way out and tapering to the tip, lighter new growth at
  // the shoot tips; v 2, 3 carry first snow in lumps along the axis. Near spruces lay one on every
  // branch, so a tier's upper face is needled branches with gaps, not a smooth lampshade.
  sprucefrond: [256, 160, (c, W, H, R, v) => {
    c.lineCap = 'round'; c.lineJoin = 'round';
    const ndl = (k) => { const q = 40 + k * 32 + R() * 22; return `rgb(${Math.round(q * 0.62)}, ${Math.round(q)}, ${Math.round(q * 0.68)})`; };
    const ay = (x) => H / 2 + Math.sin(x * 0.03 + 1) * 3;
    const half = (f) => H * 0.45 * Math.sin(Math.PI * Math.min(1, Math.pow(f, 0.7) * 1.02)) * (1 - 0.25 * f) + 4;
    const shoot = (x0, y0, x1, y1, k, w) => {
      c.strokeStyle = 'rgb(62, 50, 38)'; c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      const L = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / L, uy = (y1 - y0) / L;
      for (let d = 1; d < L; d += 1.8) {
        const px = x0 + ux * d, py = y0 + uy * d, t = d / L;
        for (const sd of [-1, 1]) {
          if (R() < 0.1) continue;
          c.strokeStyle = ndl(k + 0.5 * t); c.lineWidth = 1.2 + R() * 0.5;
          const nl = 3 + R() * 2.5, a = sd * (0.7 + R() * 0.5), ca = Math.cos(a), sa = Math.sin(a);
          c.beginPath(); c.moveTo(px, py); c.lineTo(px + (ux * ca - uy * sa) * nl, py + (uy * ca + ux * sa) * nl); c.stroke();
        }
      }
    };
    for (let x = 6; x < W - 10; x += 6 + R() * 4) {
      const f = x / W, hw = half(f), sd = R() < 0.5 ? -1 : 1, L = hw * (0.75 + R() * 0.35);
      const a = 0.75 + (R() - 0.5) * 0.5, ex = x + Math.cos(a) * L, ey = ay(x) + sd * Math.sin(a) * L;
      shoot(x, ay(x), ex, ey, 0.4, 1.4);
      if (L > 14 && R() < 0.7) { const mx = (x + ex) / 2, my = (ay(x) + ey) / 2; shoot(mx, my, mx + L * 0.35, my + sd * L * 0.12, 0.6, 1.0); }
    }
    shoot(0, ay(0), W - 3, ay(W - 3), 0.3, 2.4);
    for (let k = 0; k < 44; k++) {
      const f = 0.2 + R() * 0.8, x = f * W, y = ay(x) + (R() - 0.5) * 2 * half(f) * 0.9;
      c.strokeStyle = ndl(1.35); c.lineWidth = 1.3; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 3 + R() * 3, y + (R() - 0.5) * 3); c.stroke();
    }
    // (phase 4 r2: two to four irregular clumps, mostly on the outer half, not thirty lumps strung
    // along the axis: those were white dashes along every tier)
    if (v >= 2) for (let k = 0, n = 2 + Math.floor(R() * 3); k < n; k++) {
      const f = 0.3 + R() * 0.55, cx = f * W, cy = ay(cx) + (R() - 0.5) * half(f) * 0.7, sz = 1.1 + R() * 0.9;
      const blobs = [];
      for (let q = 0; q < 7 + Math.floor(R() * 5); q++) blobs.push([cx + (R() - 0.5) * 18 * sz, cy + (R() - 0.5) * 10 * sz, (2.5 + R() * 4) * sz, (1.8 + R() * 2.6) * sz, (R() - 0.5) * 0.8]);
      c.fillStyle = 'rgb(196, 206, 220)';
      for (const [x, y, rx, ry, a] of blobs) { c.beginPath(); c.ellipse(x + 0.8, y + 1.0, rx, ry, a, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = 'rgb(238, 241, 245)';
      for (const [x, y, rx, ry, a] of blobs) { c.beginPath(); c.ellipse(x, y, rx * 0.88, ry * 0.82, a, 0, Math.PI * 2); c.fill(); }
    }
  }],
  // A spruce branch end seen head-on (hangs at a branch tip, card top = the branch): a shoot across
  // the top drooping at both ends, combs hanging from it, longest in the middle.
  sprucetuft: [256, 160, (c, W, H, R, v) => {
    c.lineCap = 'round'; c.lineJoin = 'round';
    const ndl = (k) => { const v = 34 + k * 30 + R() * 22; return `rgb(${Math.round(v * 0.63)}, ${Math.round(v)}, ${Math.round(v * 0.72)})`; };
    const sag = (x) => H * 0.14 + ((x / W - 0.5) ** 2) * H * 0.4;
    combs(c, R, W, H, sag, (f) => 0.15 + 0.68 * Math.sin(Math.PI * f) ** 0.8, 44, ndl);
    c.strokeStyle = 'rgb(58, 47, 36)'; c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(0, sag(0)); for (let x = 8; x <= W; x += 8) c.lineTo(x, sag(x)); c.stroke();
    for (let x = 2; x < W - 2; x += 2.2) {
      c.strokeStyle = ndl(1); c.lineWidth = 1.4;
      const nl = 3 + R() * 6, a = (R() - 0.5) * 1.8;
      c.beginPath(); c.moveTo(x, sag(x)); c.lineTo(x + Math.sin(a) * nl, sag(x) - Math.cos(a) * nl); c.stroke();
    }
    if (v >= 2) branchSnow(c, R, (x) => sag(x) - 1.5, W * 0.25, W * 0.75);
  }],
  // Football goal net: white knotted cord, 12 cm squares, a little slack.
  net: [256, 128, (c, W, H, R) => {
    c.strokeStyle = 'rgb(232, 232, 226)'; c.lineWidth = 1.3;
    for (let x = 1; x < W; x += 6.4) { c.beginPath(); c.moveTo(x, 0); for (let y = 0; y <= H; y += 8) c.lineTo(x + Math.sin(y * 0.05 + x) * 1.2, y); c.stroke(); }
    for (let y = 1; y < H; y += 6.4) { c.beginPath(); c.moveTo(0, y); for (let x = 0; x <= W; x += 8) c.lineTo(x, y + Math.sin(x * 0.04 + y) * 1.0 + (x / W) * 2); c.stroke(); }
  }],
  // Welded mesh fence panel (green, 5 x 20 cm): see-through.
  mesh: [256, 128, (c, W, H) => {
    c.strokeStyle = 'rgb(46, 74, 52)'; c.lineWidth = 1.6;
    for (let x = 2; x < W; x += 6.4) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
    for (let y = 2; y < H; y += 25.6) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  }],
  // Fringe of a clipped bare hedge (oxbär, liguster, hagtorn): short twigs poking up and out of
  // the clipped top; the bottom third of the card sits inside the hedge.
  fringe: [384, 96, (c, W, H, R) => {
    c.strokeStyle = TWIG; c.lineCap = 'round'; c.lineJoin = 'round';
    for (let k = 0; k < 48; k++) {
      const x = (k + R()) / 48 * W;
      twig(c, R, x, H * (0.85 + R() * 0.15), (R() - 0.5) * 0.9, H * (0.35 + R() * 0.45), 1.5, 2,
        { kids: [1, 1], spread: [0.25, 0.5], ratio: [0.45, 0.25], droop: 0, wiggle: 0.35 }, (px, py) => py > 1 && px > 0 && px < W);
    }
  }],
};
// Card face of a twig silhouette: kind 'birch' | 'lime' | 'hedge', variant 0..3.
export function twigFace(kind, v = 0) {
  const t = TWIGS[kind];
  if (!t) throw new Error('unknown twig face ' + kind);
  const page = kind === 'birch' || kind === 'lime' || kind === 'pine' || kind === 'crowntop' ? 'crown' : kind.startsWith('spruce') ? 'conifer' : kind.startsWith('hedgegreen') || kind.startsWith('thujagreen') || kind.endsWith('sprig') ? 'leaf' : 'twig';   // birchhang, limespray, hedges, mesh -> 'twig'
  return face('twig:' + kind + ':' + v, t[0], t[1], (c, W, H) => t[2](c, W, H, seeded(1009 + v * 7919 + kind.length * 31), v), page);
}
