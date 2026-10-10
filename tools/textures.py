# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy", "pillow", "scipy"]
# ///
# Downloads the CC0 source textures (Poly Haven / ambientCG, 1K JPG) and packs them into the
# game's format (see assets/LICENSES.md):
#   <key>_a.jpg  albedo "detail": colour / mean colour, x0.5, sRGB (shader: x2 x vertex colour)
#   <key>_n.jpg  R,G = OpenGL tangent-space normal XY, B = roughness
# Usage:  uv run tools/textures.py            (writes assets/tex/, caches downloads in /tmp)
# To add a surface texture: add a pack(...) line below, run, then add the key to TEX_KEYS and a
# SURFACES entry in src/gfx.js, and a row in assets/LICENSES.md.
import sys, os, json, io, zipfile, urllib.request
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.environ.get('RAW', '/tmp/saab_tex_raw')
OUT = os.path.join(HERE, '..', 'assets', 'tex')
os.makedirs(OUT, exist_ok=True)
SIZE = 1024
UA = {'User-Agent': 'Mozilla/5.0'}

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()

def fetch(src):
    kind, aid = src.split(':')
    d = f'{RAW}/{aid}'
    if os.path.exists(f'{d}/color.jpg'):
        return d
    os.makedirs(d, exist_ok=True)
    if kind == 'ph':
        files = json.loads(get(f'https://api.polyhaven.com/files/{aid}'))
        for key, short in (('Diffuse', 'color'), ('nor_gl', 'normal'), ('Rough', 'rough'), ('AO', 'ao')):
            if key in files:
                open(f'{d}/{short}.jpg', 'wb').write(get(files[key]['1k']['jpg']['url']))
    else:
        z = zipfile.ZipFile(io.BytesIO(get(f'https://ambientcg.com/get?file={aid}_1K-JPG.zip')))
        for n in z.namelist():
            low = n.lower()
            for tag, short in (('_color', 'color'), ('_normalgl', 'normal'), ('_roughness', 'rough'), ('_ambientocclusion', 'ao')):
                if tag in low and low.endswith('.jpg'):
                    open(f'{d}/{short}.jpg', 'wb').write(z.read(n))
    return d

def load(path, mode='RGB'):
    im = Image.open(path).convert(mode)
    if im.size != (SIZE, SIZE):
        im = im.resize((SIZE, SIZE), Image.LANCZOS)
    return np.asarray(im).astype(np.float64) / 255.0

def load_tiled(path, mode, tile_y):
    im = Image.open(path).convert(mode)
    a = np.asarray(im).astype(np.float64) / 255.0
    if tile_y > 1:
        a = np.concatenate([a] * tile_y, axis=0)
    im = Image.fromarray((a * 255).astype(np.uint8))
    im = im.resize((SIZE, SIZE), Image.LANCZOS)
    return np.asarray(im).astype(np.float64) / 255.0

def s2l(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def l2s(c): return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(np.maximum(c, 0), 1 / 2.4) - 0.055)

def pack(key, src, chroma=0.3, ao=0.6, flatten=0.6, flatten_sigma=10, rot=0, tile_y=1, rough_mul=1.0, rough_add=0.0, nrm_flip_y=False, contrast=1.0):
    d = fetch(src)
    ld = (lambda p, m: load_tiled(p, m, tile_y)) if tile_y > 1 else load
    C = s2l(ld(f'{d}/color.jpg', 'RGB'))
    N = ld(f'{d}/normal.jpg', 'RGB')
    R = ld(f'{d}/rough.jpg', 'L') if os.path.exists(f'{d}/rough.jpg') else np.full(C.shape[:2], 0.7)
    if os.path.exists(f'{d}/ao.jpg') and ao > 0:
        A = ld(f'{d}/ao.jpg', 'L')
        C = C * (A[..., None] ** ao)
    if rot:
        C = np.rot90(C, rot); N = np.rot90(N, rot); R = np.rot90(R, rot)
        # rotating the image rotates the encoded tangent-space vectors too
        nx, ny = N[..., 0] * 2 - 1, N[..., 1] * 2 - 1
        for _ in range(rot % 4):
            nx, ny = ny, -nx  # 90 degrees counter-clockwise (np.rot90 is CCW)
        N = N.copy(); N[..., 0] = nx * 0.5 + 0.5; N[..., 1] = ny * 0.5 + 0.5
    if nrm_flip_y:
        N = N.copy(); N[..., 1] = 1 - N[..., 1]
    # Flatten large-scale blotches (they betray the tiling) but keep the fine detail.
    lum = C @ np.array([0.2126, 0.7152, 0.0722])
    if flatten > 0:
        low = gaussian_filter(lum, SIZE / flatten_sigma, mode='wrap')
        C = C * ((lum.mean() / np.maximum(low, 1e-4)) ** flatten)[..., None]
        lum = C @ np.array([0.2126, 0.7152, 0.0722])
    mean = C.reshape(-1, 3).mean(0)
    rel_full = C / mean
    rel_grey = (lum / lum.mean())[..., None].repeat(3, -1)
    rel = rel_grey + (rel_full - rel_grey) * chroma
    if contrast != 1.0:
        rel = 1 + (rel - 1) * contrast
    a = l2s(np.clip(rel * 0.5, 0, 1))
    Image.fromarray((a * 255 + 0.5).astype(np.uint8)).save(f'{OUT}/{key}_a.jpg', quality=88, subsampling=0)
    Rr = np.clip(R * rough_mul + rough_add, 0, 1)
    n = np.stack([N[..., 0], N[..., 1], Rr], -1)
    Image.fromarray((n * 255 + 0.5).astype(np.uint8)).save(f'{OUT}/{key}_n.jpg', quality=90, subsampling=0)
    mean_srgb = l2s(mean)
    print(f"{key:10s} <- {src:28s} mean linear {mean.round(3)} sRGB #{''.join(f'{int(v*255+0.5):02x}' for v in mean_srgb)} rough {Rr.mean():.2f}")
    return '#' + ''.join(f'{int(v*255+0.5):02x}' for v in mean_srgb)

# (key, source, options). Run with key names to repack only those: uv run tools/textures.py asphalt
JOBS = [
    ('wood', 'ph:white_planks_clean', dict(chroma=0.15, ao=0.8, flatten=0.5, contrast=1.15)),
    ('brick', 'acg:Bricks101', dict(chroma=1.0, ao=0.6, flatten=0.5)),
    # Wavy concrete pantiles (betongpannor), rows along the image X.
    ('rooftile', 'acg:RoofingTiles006', dict(chroma=0.15, ao=0.9, flatten=0.4, contrast=1.25)),
    ('metalroof', 'ph:box_profile_metal_sheet', dict(chroma=0.0, ao=0.8, flatten=0.4)),
    # Coarse aggregate asphalt (ABT-like): keep the stones and the mid frequencies.
    ('asphalt', 'ph:asphalt_floor', dict(chroma=0.15, ao=0.6, flatten=0.25, flatten_sigma=4, contrast=1.15)),
    ('concrete', 'acg:Concrete034', dict(chroma=0.2, ao=0.0, flatten=0.6, tile_y=2)),
    ('plaster', 'ph:white_stucco', dict(chroma=0.1, ao=0.6, flatten=0.6, contrast=1.4)),
    ('paving', 'ph:concrete_pavement', dict(chroma=0.3, ao=0.8, flatten=0.5)),
    ('snow', 'acg:Snow010A', dict(chroma=0.2, ao=0.4, flatten=0.5)),
    ('grass', 'ph:sparse_grass', dict(chroma=1.0, ao=0.6, flatten=0.5)),
    ('gravel', 'ph:gravel_floor', dict(chroma=0.7, ao=0.7, flatten=0.5)),
    ('bark', 'ph:pine_bark', dict(chroma=0.8, ao=0.8, flatten=0.4, rot=0)),
    ('fabric', 'ph:caban', dict(chroma=0.0, ao=0.5, flatten=0.6, contrast=1.3)),
    ('leather', 'ph:brown_leather', dict(chroma=0.0, ao=0.5, flatten=0.6)),
    ('metal', 'acg:Metal009', dict(chroma=0.0, ao=0.0, flatten=0.5)),
]
only = set(sys.argv[1:])
mpath = f'{OUT}/means.json'
means = json.load(open(mpath)) if os.path.exists(mpath) else {}
for key, src, opt in JOBS:
    if only and key not in only:
        continue
    means[key] = pack(key, src, **opt)
json.dump(means, open(mpath, 'w'), indent=1)
print('wrote', OUT)
