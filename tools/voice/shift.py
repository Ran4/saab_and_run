# /// script
# requires-python = ">=3.11"
# dependencies = ["praat-parselmouth>=0.4.4", "numpy"]
# ///
# A child's voice from an adult's take, for tools/voice/voice.mjs (features/implemented/barnroster.md:
# ElevenLabs makes no child voices). Praat's "Change gender" (PSOLA): the pitch raised by `pitch` (the
# take's own median times it, the contour kept in proportion), the formants by `formant`, the length
# kept, so the line's character times and lip curve still fit. Reads JSON lines on stdin,
# {"src", "dst", "pitch", "formant"} (wav in, wav out); writes {"dst", "f0", "dur"} on stdout (f0: the
# source's median pitch, Hz).
#   echo '{"src": "a.wav", "dst": "b.wav", "pitch": 1.6, "formant": 1.3}' | uv run tools/voice/shift.py
import json, sys
import numpy as np
import parselmouth
from parselmouth.praat import call

FLOOR, CEILING = 75, 600   # the pitch analysis (Hz): the adult voices' range

for line in sys.stdin:
    if not line.strip(): continue
    job = json.loads(line)
    snd = parselmouth.Sound(job["src"])
    f = snd.to_pitch_ac(time_step=0.01, pitch_floor=FLOOR, pitch_ceiling=CEILING).selected_array["frequency"]
    f = f[f > 0]
    # (a take with hardly anything voiced, a whisper: its formants move, its pitch stays)
    med = float(np.median(f)) if len(f) >= 3 else 0.0
    out = call(snd, "Change gender", FLOOR, CEILING, float(job.get("formant", 1)), med * float(job.get("pitch", 1)) if med else 0.0, 1.0, 1.0)
    # (the levels are set afterwards: only keep the peaks from clipping in the wav)
    peak = float(np.max(np.abs(out.values))) if out.values.size else 0.0
    if peak > 0.99: out.scale_peak(0.99)
    out.save(job["dst"], "WAV")
    print(json.dumps({"dst": job["dst"], "f0": round(med, 1), "dur": round(out.duration, 4)}), flush=True)
