# /// script
# requires-python = ">=3.11"
# dependencies = ["faster-whisper>=1.1", "praat-parselmouth>=0.4.4"]
# ///
# Measures voice clips for tools/voice/voice.mjs (features/a_fully_voiced_game.md 5.4): what a Swedish
# speech recogniser hears (KBLab's kb-whisper-small, run locally on the CPU: free), the word error rate
# against the line, and the pitch (Praat). Reads JSON lines on stdin, {"file", "text"}; writes JSON
# lines on stdout, {"file", "heard", "wer", "f0", "f0lo", "f0hi", "voiced", "dur"}.
#   uv run tools/voice/analyze.py < jobs.jsonl > results.jsonl
import json, re, subprocess, sys, unicodedata
import numpy as np
import parselmouth
from faster_whisper import WhisperModel

MODEL = "KBLab/kb-whisper-small"

ONES = "noll ett två tre fyra fem sex sju åtta nio tio elva tolv tretton fjorton femton sexton sjutton arton nitton".split()
TENS = {20: "tjugo", 30: "trettio", 40: "fyrtio", 50: "femtio", 60: "sextio", 70: "sjuttio", 80: "åttio", 90: "nittio"}

def num_sv(n):
    if n >= 1000 and n < 1000000 and not (1100 <= n < 2100): return ("" if n < 2000 else num_sv(n // 1000)) + "tusen" + (num_sv(n % 1000) if n % 1000 else "")
    if n < 20: return ONES[n]
    if n < 100: return TENS[n - n % 10] + (ONES[n % 10] if n % 10 else "")
    if n < 1000: return (ONES[n // 100] if n >= 200 else "ett") + "hundra" + (num_sv(n % 100) if n % 100 else "")
    if 1100 <= n < 2100 and n % 100 != 0 or n in (1900, 2000): return num_sv(n // 100) + "hundra" + (num_sv(n % 100) if n % 100 else "")
    return str(n)

def norm(s):
    s = unicodedata.normalize("NFC", s.lower())
    s = re.sub(r"\[[^\]]*\]", " ", s)            # audio tags are not words
    s = re.sub(r"(?<=\d) (?=\d{3}\b)", "", s)    # "5 000"
    s = re.sub(r"\d+", lambda m: " " + num_sv(int(m.group())) + " ", s)
    s = re.sub(r"[^\w\såäöéü-]", " ", s)
    s = s.replace("-", " ")
    # "i går" and "igår" are the same word to a listener
    s = re.sub(r"\bi (går|dag|morgon|kväll|natt|morse)\b", r"i\1", s)
    return s.split()

def lev(a, b):
    d = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(b) + 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] != b[j - 1]))
            prev, d[j] = d[j], cur
    return d[len(b)]

def same(a, b):
    # (names and long words spelt a letter differently: Patrick / Patrik)
    return a == b or (min(len(a), len(b)) >= 5 and lev(a, b) <= 1)

def wer(ref, hyp):
    r, h = norm(ref), norm(hyp)
    # (the same letters with the spaces elsewhere: "Jaja" / "Ja, ja", "Saab-folk" / "Saabfolk")
    if "".join(r) == "".join(h): return 0.0
    if not r: return 0.0 if not h else 1.0
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (not same(r[i - 1], h[j - 1])))
            prev, d[j] = d[j], cur
    return d[len(h)] / len(r)

def pitch(path):
    snd = parselmouth.Sound(path)
    p = snd.to_pitch_ac(time_step=0.01, pitch_floor=60, pitch_ceiling=600)
    f = [v for v in p.selected_array["frequency"] if v > 0]
    if len(f) < 5: return None, None, None, len(f) / 100, snd.duration
    f.sort()
    q = lambda k: round(f[int(k * (len(f) - 1))], 1)
    return q(0.5), q(0.1), q(0.9), len(f) / 100, snd.duration

def pcm16k(path):
    # (decoded with ffmpeg, -nostdin: it would eat the jobs waiting on stdin; faster-whisper's own
    # decoder trips over newer PyAV releases)
    raw = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", path, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32)

model = WhisperModel(MODEL, device="cpu", compute_type="int8")
for line in sys.stdin:
    if not line.strip(): continue
    job = json.loads(line)
    segs, info = model.transcribe(pcm16k(job["file"]), language="sv", beam_size=5, condition_on_previous_text=False, vad_filter=False)
    heard = " ".join(s.text.strip() for s in segs).strip()
    f0, lo, hi, voiced, dur = pitch(job["file"])
    out = {"file": job["file"], "heard": heard, "wer": round(wer(job.get("text", ""), heard), 3), "f0": f0, "f0lo": lo, "f0hi": hi, "voiced": round(voiced, 2), "dur": round(dur, 3)}
    print(json.dumps(out, ensure_ascii=False), flush=True)
