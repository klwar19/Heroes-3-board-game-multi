# Octave-robust voice/gender classification via YIN F0. Reads wav directly.
import numpy as np, json, os, sys, warnings
from scipy.io import wavfile
warnings.filterwarnings("ignore")

SRC = sys.argv[1]; OUT = sys.argv[2]

def load(path, sr=16000):
    fsr, x = wavfile.read(path)
    if x.ndim > 1:
        x = x.mean(axis=1)
    x = x.astype(np.float32)
    if np.issubdtype(np.int16, np.integer):
        x /= 32768.0
    if fsr != sr:
        # simple decimation/interp
        n = int(len(x) * sr / fsr)
        if n < 1:
            return np.zeros(1), sr
        x = np.interp(np.linspace(0, len(x), n, endpoint=False), np.arange(len(x)), x)
    return x, sr

def yin_f0(frame, sr, fmin=75, fmax=350, thr=0.15):
    W = len(frame)
    taumin = int(sr/fmax); taumax = min(int(sr/fmin), W//2)
    if taumax <= taumin:
        return 0.0
    d = np.zeros(taumax)
    for tau in range(taumin, taumax):
        diff = frame[:W-taumax] - frame[tau:tau+W-taumax]
        d[tau] = np.dot(diff, diff)
    cum = np.cumsum(d[taumin:taumax]) + 1e-9
    dp = d[taumin:taumax] * np.arange(taumin, taumax) / cum
    below = np.where(dp < thr)[0]
    if len(below):
        i = below[0]
    else:
        i = int(np.argmin(dp))
    tau = i + taumin
    aper = float(dp[i])  # CMNDF value at chosen lag: low = strongly periodic (voice)
    return (sr / tau if tau > 0 else 0.0), aper

def stats(a, sr):
    fl = int(0.04*sr); hop = int(0.02*sr)
    rms_all = float(np.sqrt(np.mean(a**2)+1e-9))
    if len(a) < fl:
        return 0.0, 0.0, rms_all
    f0s = []; apers = []; voiced = 0; total = 0
    for i in range(0, len(a)-fl, hop):
        fr = a[i:i+fl]
        if np.sqrt(np.mean(fr**2)) < 0.02:
            continue
        total += 1
        f0, aper = yin_f0(fr, sr)
        apers.append(aper)
        if 75 <= f0 <= 350 and aper < 0.15:   # strongly periodic => real voiced frame
            voiced += 1; f0s.append(f0)
    if total == 0:
        return 0.0, 0.0, rms_all, 1.0
    med_aper = float(np.median(apers)) if apers else 1.0
    return (float(np.median(f0s)) if f0s else 0.0), voiced/total, rms_all, med_aper

rows = []
files = sorted(f for f in os.listdir(SRC) if f.lower().endswith(('.wav', '.ogg')))
for idx, f in enumerate(files):
    try:
        a, sr = load(os.path.join(SRC, f))
        dur = len(a)/sr
        f0, vr, rms, aper = stats(a, sr)
    except Exception:
        dur = f0 = vr = rms = 0; aper = 1.0
    is_voice = (vr >= 0.45 and 85 <= f0 <= 320 and rms >= 0.02
                and 0.2 <= dur <= 2.6 and aper < 0.30)
    gender = ("male" if f0 < 160 else "female" if f0 > 175 else "mid") if is_voice else ""
    rows.append({"file": f, "dur": round(dur,3), "f0": round(f0,1), "vr": round(vr,2),
                 "rms": round(rms,3), "aper": round(aper,3), "voice": is_voice, "gender": gender})
    if idx % 100 == 0:
        print(f"...{idx}/{len(files)}", flush=True)

json.dump(rows, open(OUT, "w"))
v = [r for r in rows if r["voice"]]
print(f"total {len(rows)} | voice {len(v)} | male {sum(1 for r in v if r['gender']=='male')} "
      f"| female {sum(1 for r in v if r['gender']=='female')} | mid {sum(1 for r in v if r['gender']=='mid')}")
