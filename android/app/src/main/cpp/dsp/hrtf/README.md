# HRTF HRIR data — SADIE II (KEMAR, D2)

## Source

- **Dataset:** SADIE II Database, v2-2, University of York Audio Lab
- **Subject:** D2 (KEMAR dummy head) — `ListenerShortName` "D2", Title "D2 HRIRs"
- **Zenodo record:** https://doi.org/10.5281/zenodo.12092466 (DOI `10.5281/zenodo.12092466`)
- **File downloaded:** `D2_HRIR_SOFA.zip` (38.0 MB), md5
  `f555491d1b6b1a108bb4d26b63ad84a4` — verified after download.
- **SOFA file used:** `D2_48K_24bit_256tap_FIR_SOFA.sofa`
  (8802 source positions, `Data.IR` shape `[8802][2][256]`,
  `Data.SamplingRate` 48000 Hz, `DataType` FIR, `Data.Delay` all 0)
- **Variant:** diffuse-field equalized (DFC). The SOFA `Comment` attribute
  says the filters are "diffuse field equalized and windowed" and
  "(approx.) Linear phase HRIRs"; `History` lists "Diffuse Field
  Equalization". The ITD is therefore IN the HRIRs — no separate delay
  table is needed, and the minimum-phase variant (which strips ITD) was
  not used.
- **License:** Apache License 2.0 — confirmed twice: the `LICENSE.txt`
  shipped in the Zenodo record is the Apache License Version 2.0, and the
  SOFA file's own `License` attribute reads "Copyright 2018, University
  of York, Licensed under the Apache License, Version 2.0".
- **Attribution (required by the license):** SADIE II Database,
  University of York Audio Lab — Cal Armstrong, Lewis Thresh,
  Gavin Kearney. Cite: Armstrong et al., "A Perceptual Evaluation of
  Individual and Non-Individual HRTFs", Appl. Sci. 2018,
  https://doi.org/10.3390/app8112029. Dataset DOI: https://doi.org/10.5281/zenodo.12092466.
- **What is bundled:** only the 4 HRIRs below (4 × 256 float32 ≈ 4 KB)
  in `hrir_kemar_dfc48.h`. The zip, the SOFA file, and the full dataset
  are NEVER committed. No BRIR file and no Ambisonic decoder config file
  from the SADIE site was downloaded (those are under a separate
  non-commercial license).

## Deviation from `hrtf-design-report.md` (2026-11-19)

The report's substantive claims check out (Apache 2.0, 48 kHz, 256 taps,
DFC, linear phase, KEMAR), but four details were wrong and are corrected
here:

1. **Filename:** the report expects `SADIE_KEMAR_DFC_256_order_fir_48000.sofa`;
   the v2-2 download contains `D2_48K_24bit_256tap_FIR_SOFA.sofa` instead
   (alongside 44.1 kHz / 96 kHz siblings). The DFC identity is confirmed
   by the file's own metadata, not by the filename.
2. **Subject label:** the report says "subject 001 (KEMAR)"; in SADIE II
   v2-2 the KEMAR subject is D2.
3. **Direction count:** the report's table says 1550 directions; this file
   holds 8802 source positions.
4. **AZIMUTH SIGN (the important one):** report §4.1 says "Left channel →
   −30°" and "Right channel → +30°". That is backwards under the
   SADIE/SOFA convention, and the measurement below proves it. The header
   and the renderer must use the MEASURED mapping:
   **LEFT virtual speaker = SADIE azimuth +30°, RIGHT = 330° (−30°).**

## Azimuth-sign verification (measured on the file, 48 kHz)

Geometry (independent of the acoustics): `ListenerView = [1, 0, 0]`
(front = +x), `ListenerUp = [0, 0, 1]`; in this right-handed system +y is
the listener's LEFT. `ReceiverPosition`: R0 at y = +0.09 m → **left ear**,
R1 at y = −0.09 m → **right ear**. SOFA azimuth grows counter-clockwise
from front, i.e. toward +y = left, so +30° should be 30° left.

Acoustics (onset = first sample above 10% of the pair's max peak, one
shared threshold for both ears; ITD = cross-correlation delay, positive
= left ear leads; Woodworth prediction for ±30°, head radius 8.75 cm:
261 µs ≈ 12.5 samples @ 48 kHz):

| SADIE azimuth | Ear (receiver) | Peak | Peak idx | Onset | RMS | Energy Σh² |
|---|---|---|---|---|---|---|
| +30° | LEFT (R0) | +0.329236 | 98 | 76 | 0.058820 | 0.885695 |
| +30° | RIGHT (R1) | +0.123795 | 117 | 107 | 0.018181 | 0.084619 |
| 330° (−30°) | LEFT (R0) | +0.104182 | 117 | 107 | 0.016191 | 0.067109 |
| 330° (−30°) | RIGHT (R1) | +0.366784 | 97 | 95 | 0.055562 | 0.790315 |
| 0° (control) | LEFT (R0) | +0.232033 | 107 | 86 | 0.036424 | 0.339643 |
| 0° (control) | RIGHT (R1) | +0.279768 | 110 | 86 | 0.041048 | 0.431334 |

| SADIE azimuth | ITD (samples) | ITD (µs) | Energy ratio L/R | Leading ear |
|---|---|---|---|---|
| +30° | +12 (left leads) | +250.0 | 10.47 | LEFT |
| 330° (−30°) | −13 (right leads) | −270.8 | 0.085 | RIGHT |
| 0° (control) | 0 | 0.0 | 0.79 | neither |

Verdict: at +30° the left ear leads on every metric (onset 31 samples
earlier, peak 19 samples earlier, 10.5× the energy) and the measured ITD
(250 µs) matches the Woodworth prediction (261 µs); at 330° the mirror
image holds (right ear leads, 271 µs). The 0° control is symmetric
(identical onsets, ITD 0), which validates the method. **LEFT virtual
speaker = SADIE azimuth +30°, RIGHT virtual speaker = SADIE azimuth
330°.** The two mirror pairs are not perfectly identical (max |diff|
0.46 on the ipsilateral pair, 0.064 on the contralateral pair — the KEMAR
in this dataset is not perfectly symmetric), which is why all 4 HRIRs
are stored explicitly instead of mirroring 2.

## Level / trim

- RMS over the 4 HRIRs: **0.042248** (the §4.2 quantity).
- Per-HRIR energies Σh²: +30°→L 0.8857, +30°→R 0.0846, 330°→L 0.0671,
  330°→R 0.7903.
- Full two-speaker render, decorrelated stereo: outL gain 0.976 (−0.21 dB),
  outR gain 0.935 (−0.58 dB). Mono-centred input: outL −0.20 dB,
  outR −0.36 dB.
- Recommended load-time trim gain: **1.0461x (+0.39 dB)** —
  the mean of the two output ears, i.e. effectively unity. Toggling HRTF
  changes broadband level by less than 0.6 dB, so no large trim is needed.
- WARNING: 1/RMS = 23.67x (+27.48 dB) is NOT the trim. One convolution
  scales broadband level by sqrt(Σh²), not by RMS; applying 1/RMS would
  drive +27 dB into the limiter. The header records both `kHrirRms`
  (the measured quantity) and `kHrirTrimGain` (the gain to apply).

## Reproduce

```sh
python3 -m venv /tmp/hrtf-extract/venv
/tmp/hrtf-extract/venv/bin/pip install h5py numpy
python3 scripts/extract_hrir_sadie.py \
  --sofa /tmp/hrtf-extract/D2_HRIR_SOFA/D2_48K_24bit_256tap_FIR_SOFA.sofa
```

Re-running regenerates `hrir_kemar_dfc48.h` and this README
byte-identically when the input file is unchanged. The script asserts
the DFC markers, the Apache 2.0 license attribute, the 48 kHz / 256-tap
shape, finite samples, an ipsilateral energy ratio > 5×, a plausible
ITD (8–18 samples), a symmetric 0° control, and the empirical
left-leads-at-+30° mapping — it exits non-zero instead of emitting a
header if any check fails.
