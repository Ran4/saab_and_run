# /// script
# requires-python = ">=3.11,<3.13"
# dependencies = ["numpy", "praat-parselmouth", "torch", "transformers", "faster-whisper", "matplotlib"]
# ///
# Listening for tools/sfx/grunts.mjs: measures every raw take in .cache/sfx (or the files given)
# so the jump grunts can be chosen by numbers as well as by judgement.
#
#   uv run tools/sfx/grunts.py [take ...] [--sheet out.png]   -> a table, .cache/sfx/analysis.json and
#        (--sheet) a contact sheet: each take's spectrogram (0-3 kHz) with its pitch, as it was trimmed
#        --bursts: each separate sound in a take on its own too (take#k, from..to s in the raw take), and
#        --only a,b: just those (takes or their parts)
#        its voiced core with the breath after it cut off 70 ms after the voice ends (take#kc): a TTS
#        take of "[grunts] ..." is a grunt and then a long sigh; "[strained grunt] Hmmf!" two sounds
#
#   dur      the sound itself (40 dB under its loudest 10 ms), s
#   attack   from its start to its loudest 10 ms, ms
#   bursts   separate sounds in it (gaps of 60 ms or more under -20 dB of the peak): a grunt is one
#   f0       median pitch where voiced (Praat), Hz; voiced: how much of it is voiced, s
#   hnr      harmonics-to-noise, dB (speech ~10-15; a pressed, rough grunt lower, breath ~0)
#   grunt    AudioSet's "Grunt" + "Groan" (MIT's AST classifier), and speech: its speech classes
#   ove      cosine of the take's x-vector (microsoft/wavlm-base-plus-sv) to the mean of Ove's lines;
#   margin   that minus the best of the other men's voices (> 0: closer to Ove than to any of them)
#   heard    what KBLab's Swedish whisper makes of it, and its no-speech probability
import json, subprocess, sys, glob, os, random
import numpy as np
import parselmouth, torch
from transformers import AutoFeatureExtractor, ASTForAudioClassification, WavLMForXVector
from faster_whisper import WhisperModel

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
CACHE = os.path.join(ROOT, ".cache/sfx")
torch.set_num_threads(8)

def load(path, sr=16000):
    raw = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", path, "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).copy()

def frames(x, sr, hop=0.01):
    n = int(sr * hop)
    return np.array([np.sqrt(np.mean(x[i:i + n] ** 2) + 1e-12) for i in range(0, len(x) - n + 1, n)])

def trim(x, sr):
    f = 20 * np.log10(frames(x, sr) + 1e-9)
    thr = max(f.max() - 40, -60)
    on = np.where(f > thr)[0]
    a, b = on[0], on[-1] + 1
    return x[max(0, int((a / 100 - 0.015) * sr)):int((b / 100 + 0.06) * sr)], f[a:b] - f.max()

def envelope(f):
    dur = len(f) / 100
    attack = int(np.argmax(f)) * 10
    loud = f > -20
    bursts, gap, inb = 0, 99, False
    for v in loud:
        if v:
            if not inb and gap >= 6: bursts += 1
            inb, gap = True, 0
        else:
            inb = False; gap += 1
    return dur, attack, bursts

def praat(x, sr):
    snd = parselmouth.Sound(x.astype(np.float64), sampling_frequency=sr)
    p = snd.to_pitch_ac(time_step=0.01, pitch_floor=60, pitch_ceiling=450)
    f = p.selected_array["frequency"]; v = f[f > 0]
    h = snd.to_harmonicity_cc(time_step=0.01, minimum_pitch=60)
    hv = h.values[h.values > -100]
    return (float(np.median(v)) if len(v) >= 3 else None), len(v) / 100, (float(np.mean(hv)) if len(hv) else None), (v.tolist() if len(v) else [])

def main():
    argv = sys.argv[1:]
    sheet = argv[argv.index("--sheet") + 1] if "--sheet" in argv else None
    bursts_on = "--bursts" in argv
    only = set(argv[argv.index("--only") + 1].split(",")) if "--only" in argv else None
    names = [a for i, a in enumerate(argv) if a not in ("--sheet", "--bursts", "--only") and (i == 0 or argv[i - 1] not in ("--sheet", "--only"))]
    files = [os.path.join(CACHE, n + ".mp3") if not n.endswith(".mp3") else n for n in names] or sorted(glob.glob(os.path.join(CACHE, "*.mp3")))
    files = [f for f in files if not os.path.basename(f).startswith("tmp-")]
    # AudioSet classifier
    fe = AutoFeatureExtractor.from_pretrained("MIT/ast-finetuned-audioset-10-10-0.4593")
    ast = ASTForAudioClassification.from_pretrained("MIT/ast-finetuned-audioset-10-10-0.4593").eval()
    lab = ast.config.id2label
    idx = {v: int(k) for k, v in lab.items()}
    GR = [idx[k] for k in ("Grunt", "Groan") if k in idx]
    SP = [idx[k] for k in ("Speech", "Male speech, man speaking", "Conversation", "Narration, monologue") if k in idx]
    def classify(x):
        with torch.no_grad():
            p = torch.sigmoid(ast(**fe(x, sampling_rate=16000, return_tensors="pt")).logits)[0].numpy()
        top = [(lab[i], round(float(p[i]), 2)) for i in np.argsort(-p)[:4]]
        return float(sum(p[i] for i in GR)), float(max(p[i] for i in SP)), top
    # speakers
    sfe = AutoFeatureExtractor.from_pretrained("microsoft/wavlm-base-plus-sv")
    xv = WavLMForXVector.from_pretrained("microsoft/wavlm-base-plus-sv").eval()
    def emb(x):
        if len(x) < 8000: x = np.pad(x, (0, 8000 - len(x)))   # (the x-vector wants half a second)
        with torch.no_grad():
            e = xv(**sfe(x, sampling_rate=16000, return_tensors="pt", padding=True)).embeddings[0]
        return torch.nn.functional.normalize(e, dim=-1).numpy()
    random.seed(7)
    voices = {}
    for who in ["ove", "patrick", "anders", "rune", "jimmy", "adrian", "vitskjorta", "ped_m_old_1", "ped_m_old_2", "ped_m_mid_1"]:
        fs = sorted(glob.glob(os.path.join(ROOT, "assets/voice", who, "*.mp3")))
        if not fs: continue
        pick = random.sample(fs, min(len(fs), 30 if who == "ove" else 10))
        voices[who] = [emb(load(f)) for f in pick]
    cent = {w: (lambda m: m / np.linalg.norm(m))(np.mean(v, axis=0)) for w, v in voices.items()}
    # (how well it tells voices apart: Ove's own lines left out of his mean, against the others)
    held = []
    for i, e in enumerate(voices["ove"][:10]):
        rest = np.mean([x for j, x in enumerate(voices["ove"]) if j != i], axis=0); rest /= np.linalg.norm(rest)
        held.append(float(e @ rest) - max(float(e @ c) for w, c in cent.items() if w != "ove"))
    print(f"sanity: Ove's own lines, margin over the other men: min {min(held):.3f} median {np.median(held):.3f}")
    ref = [praat(load(f), 16000)[0] for f in sorted(glob.glob(os.path.join(ROOT, "assets/voice/ove/*.mp3")))[:40]]
    ref = [v for v in ref if v]
    print(f"Ove's lines: median pitch {np.median(ref):.0f} Hz (10-90 %: {np.percentile(ref, 10):.0f}-{np.percentile(ref, 90):.0f})", flush=True)
    wm = WhisperModel("KBLab/kb-whisper-small", device="cpu", compute_type="int8")
    rows = []
    jobs = []
    for f in files:
        name = os.path.basename(f)[:-4]
        x = load(f)
        jobs.append((name, x, *trim(x, 16000), None))
        if bursts_on: jobs += [(name + lab, x, sg, fd, span) for lab, sg, fd, span in split(x, 16000)]
    if only: jobs = [j for j in jobs if j[0] in only]
    for name, x, seg, fdb, span in jobs:
        dur, attack, bursts = envelope(fdb)
        f0, voiced, hnr, contour = praat(seg, 16000)
        gr, sp, top = classify(seg)
        e = emb(seg)
        ove = float(e @ cent["ove"]); other = max((float(e @ c), w) for w, c in cent.items() if w != "ove")
        segs, info = wm.transcribe(seg, language="sv", beam_size=5, condition_on_previous_text=False, vad_filter=False)
        segs = list(segs)
        heard = " ".join(s.text.strip() for s in segs).strip()
        nsp = float(np.mean([s.no_speech_prob for s in segs])) if segs else 1.0
        base = name.split("#")[0]
        meta = json.load(open(os.path.join(CACHE, base + ".json"))) if os.path.exists(os.path.join(CACHE, base + ".json")) else {}
        r = dict(name=name, kind=meta.get("kind"), text=meta.get("text") or meta.get("from"), raw=round(len(x) / 16000, 2), dur=round(dur, 2), attack=attack, bursts=bursts,
                 f0=round(f0) if f0 else None, voiced=round(voiced, 2), hnr=round(hnr, 1) if hnr is not None else None, grunt=round(gr, 2), speech=round(sp, 2), top=top,
                 ove=round(ove, 3), margin=round(ove - other[0], 3), nearest=other[1], heard=heard, nosp=round(nsp, 2), span=span)
        r["_seg"], r["_f0"] = seg, contour_of(seg)
        rows.append(r)
        print(f"{name:8} {('%.2f-%.2f' % span) if span else '':9} {r['kind'] or '':4} dur {r['dur']:.2f} att {attack:3d} b{bursts} f0 {str(r['f0']):>4} v {r['voiced']:.2f} hnr {str(r['hnr']):>5} | grunt {r['grunt']:.2f} speech {r['speech']:.2f} | ove {r['ove']:.3f} m {r['margin']:+.3f} ({other[1]}) | {heard!r} nosp {r['nosp']} | {top[:2]}", flush=True)
    if sheet: draw(rows, sheet)
    json.dump([{k: v for k, v in r.items() if not k.startswith("_")} for r in rows], open(os.path.join(CACHE, "analysis.json"), "w"), ensure_ascii=False, indent=1)

# The separate sounds in a take (gaps of 60 ms or more 30 dB under its peak), each with 15 ms before
# and up to 60 ms after it, and each one's voiced core (to 70 ms after its last voiced 10 ms).
def split(x, sr):
    f = 20 * np.log10(frames(x, sr) + 1e-9); f -= f.max()
    on = f > -30
    runs, a, gap = [], None, 0
    for i, v in enumerate(on):
        if v:
            if a is None: a = i
            gap, last = 0, i
        elif a is not None:
            gap += 1
            if gap >= 6: runs.append((a, last + 1)); a = None
    if a is not None: runs.append((a, last + 1))
    out = []
    for k, (a, b) in enumerate(runs):
        nxt = runs[k + 1][0] / 100 if k + 1 < len(runs) else len(x) / sr
        t0, t1 = max(0, a / 100 - 0.015), min(nxt, b / 100 + 0.06)
        if t1 - t0 < 0.12: continue
        seg = x[int(t0 * sr):int(t1 * sr)]
        out.append((f"#{k + 1}", seg, f[a:b], (round(t0, 3), round(t1, 3))))
        ts, f0 = contour_of(seg)
        vz = ts[f0 > 0]
        if len(vz) >= 5:
            c1 = t0 + vz[-1] + 0.07
            if c1 < t1 - 0.08:
                cs = x[int(t0 * sr):int(c1 * sr)]
                out.append((f"#{k + 1}c", cs, f[a:min(b, int(c1 * 100))], (round(t0, 3), round(c1, 3))))
    return out

def contour_of(x):
    snd = parselmouth.Sound(x.astype(np.float64), sampling_frequency=16000)
    p = snd.to_pitch_ac(time_step=0.01, pitch_floor=60, pitch_ceiling=450)
    return p.xs(), p.selected_array["frequency"]

def draw(rows, out):
    import matplotlib; matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    n = len(rows); cols = 4; rws = (n + cols - 1) // cols
    fig, axs = plt.subplots(rws, cols, figsize=(cols * 4.2, rws * 2.6), squeeze=False)
    for ax in axs.flat: ax.axis("off")
    for ax, r in zip(axs.flat, rows):
        ax.axis("on")
        x = r["_seg"]
        ax.specgram(x, NFFT=512, Fs=16000, noverlap=448, cmap="magma", vmin=-120)
        ax.set_ylim(0, 3000); ax.set_xlim(0, 1.2)
        t, f = r["_f0"]; m = f > 0
        ax.plot(t[m], f[m], ".", color="cyan", ms=3)
        env = 20 * np.log10(frames(x, 16000) + 1e-9); env -= env.max()
        ax.plot(np.arange(len(env)) / 100, 3000 + env * 40, color="white", lw=1)
        ax.set_title(f"{r['name']} {r['dur']:.2f}s f0 {r['f0']} gr {r['grunt']:.2f} {r['top'][0][0]}", fontsize=8)
        ax.tick_params(labelsize=6)
    fig.tight_layout(); fig.savefig(out, dpi=80)
    print("sheet", out)

main()
