#!/usr/bin/env python3
"""Extract the 4 HRIRs PristineAudio needs from the SADIE II database (offline).

Source (verified 2026-11-19, HTTP 200, md5 f555491d1b6b1a108bb4d26b63ad84a4):
  Zenodo record "SADIE II Database", v2-2, DOI 10.5281/zenodo.12092466
  File D2_HRIR_SOFA.zip -> D2_HRIR_SOFA/D2_48K_24bit_256tap_FIR_SOFA.sofa
  (KEMAR subject D2, diffuse-field equalized / DFC, 256 taps @ 48 kHz,
  approx. linear phase, Apache License 2.0)

What this script does:
  1. Reads the SOFA file (netCDF-4/HDF5) with h5py -- no SOFA/WAV parser
     belongs in the APK; this is offline extraction only.
  2. Picks exactly 4 HRIRs: azimuth +30 deg and 330 deg (== -30 deg),
     elevation 0 deg, both ears, 256 taps each.
  3. VERIFIES THE AZIMUTH SIGN CONVENTION EMPIRICALLY instead of trusting
     any document: for each direction it measures per-ear onset (common
     10%-of-pair-peak threshold), peak index, RMS, energy, and the
     cross-correlation ITD. The direction where the LEFT ear leads is the
     LEFT virtual speaker. (SOFA geometry agrees: ListenerView=[1,0,0],
     ListenerUp=[0,0,1], so +y is to the listener's left; receiver R0 sits
     at y=+0.09 m = left ear, R1 at y=-0.09 m = right ear; SOFA azimuth
     grows counter-clockwise from front, i.e. toward the left.)
  4. Emits android/app/src/main/cpp/dsp/hrtf/hrir_kemar_dfc48.h
     (4 x 256 float32, ~4 KB) and the accompanying README.md in the same
     directory. The database, the zip, and the full extracted dataset are
     NEVER committed -- only these 4 HRIRs.

Deviations from hrtf-design-report.md (2026-11-19) found while verifying:
  * The report's expected filename `SADIE_KEMAR_DFC_256_order_fir_48000.sofa`
    does not exist in the v2-2 download. The real file is
    `D2_48K_24bit_256tap_FIR_SOFA.sofa`. Its own metadata (Comment +
    History: "diffuse field equalized", "Diffuse Field Equalization")
    confirms it IS the DFC variant, and the SOFA `License` attribute
    confirms Apache 2.0.
  * The report calls the subject "001 (KEMAR)". In SADIE II v2-2 the
    KEMAR subject is D2 (ListenerShortName "D2", Title "D2 HRIRs").
  * The report's direction table says "1550" directions; this file holds
    8802 source positions.
  * CORRECTION -- the report's section 4.1 mapping is BACKWARDS: it says
    "Left channel -> -30 deg" and "Right channel -> +30 deg". Measured:
    at SADIE azimuth +30 deg the LEFT ear leads (onset 31 samples
    earlier, xcorr ITD 12 samples / 250 us, energy 10.5x the right ear),
    so +30 deg is the LEFT virtual speaker and 330 deg (== -30 deg) is
    the RIGHT one. The emitted header and README follow the MEASURED
    mapping, not the report's labels.
  * The report's section 4.2 says only "measure the RMS ... and apply a
    fixed trim". The RMS over the 4 HRIRs is 0.042248 -- but 1/RMS
    (+27.5 dB) is NOT the trim: for broadband content one convolution
    scales level by sqrt(sum h^2), and the full two-speaker render
    measures -0.21 dB (left out) / -0.58 dB (right out) for decorrelated
    stereo, i.e. the honest load-time trim is ~+0.4 dB (1.046x), near
    unity. Applying 1/RMS would drive +27 dB into the limiter.

Usage:
  python3 scripts/extract_hrir_sadie.py --sofa /tmp/hrtf-extract/D2_HRIR_SOFA/D2_48K_24bit_256tap_FIR_SOFA.sofa
  (requires h5py + numpy, e.g. in a venv: pip install h5py numpy)
  Re-running it regenerates the header and README byte-identically when
  the input file is unchanged.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import h5py
import numpy as np

EXPECTED_MD5 = "f555491d1b6b1a108bb4d26b63ad84a4"
ZENODO_DOI = "10.5281/zenodo.12092466"
PAPER_DOI = "10.3390/app8112029"
SAMPLE_RATE_HZ = 48000
NUM_TAPS = 256
# SADIE azimuths in the file are 0..359; -30 deg == 330 deg.
AZ_LEFT_DEG = 30.0    # verified empirically: left ear leads here
AZ_RIGHT_DEG = 330.0  # == -30 deg; verified empirically: right ear leads here
ELEVATION_DEG = 0.0


def _decode(value) -> str:
    if isinstance(value, bytes):
        return value.decode("utf-8", "replace")
    return str(value)


def _stats(h: np.ndarray) -> dict:
    a = np.abs(h)
    peak_idx = int(a.argmax())
    return {
        "peak": float(h[peak_idx]),
        "peak_idx": peak_idx,
        "rms": float(np.sqrt(np.mean(h ** 2))),
        "energy": float(np.sum(h ** 2)),
    }


def _onsets_common(h_left: np.ndarray, h_right: np.ndarray, frac: float = 0.10):
    """First sample above frac * max peak of the pair (one shared threshold).

    A per-ear threshold misleads when the two ears differ 10x in level:
    the far ear's own 10% line is crossed by a tiny precursor. One shared
    threshold compares like with like.
    """
    thr = frac * max(np.abs(h_left).max(), np.abs(h_right).max())
    o_left = int(np.where(np.abs(h_left) > thr)[0][0])
    o_right = int(np.where(np.abs(h_right) > thr)[0][0])
    return o_left, o_right, float(thr)


def _xcorr_delay_db(h_a: np.ndarray, h_b: np.ndarray) -> int:
    """Delay of h_b relative to h_a in samples; positive => h_a leads.

    np.correlate's argmax lag is the negation of the true delay, hence -k.
    """
    c = np.correlate(h_a, h_b, mode="full")
    lags = np.arange(-len(h_b) + 1, len(h_a))
    return -int(lags[int(np.argmax(c))])


def _find_row(positions: np.ndarray, azimuth: float, elevation: float) -> int:
    rows = np.where(
        (positions[:, 0] == azimuth) & (positions[:, 1] == elevation)
    )[0]
    if len(rows) != 1:
        raise SystemExit(
            f"expected exactly 1 measurement at az={azimuth} el={elevation}, "
            f"found {len(rows)}"
        )
    return int(rows[0])


def _fmt_f32(value: float) -> str:
    # Shortest repr of the exact float32 value, so the header round-trips.
    return repr(float(np.float32(value)))


def _emit_header(path: Path, hrirs: dict, rms_all: float, trim_gain: float) -> None:
    def array_lines(name: str, values: np.ndarray) -> list[str]:
        lines = [f"static constexpr float {name}[kHrirNumTaps] = {{"]
        vals = [_fmt_f32(float(v)) + "f" for v in values]
        for i in range(0, len(vals), 8):
            lines.append("    " + ", ".join(vals[i:i + 8]) + ",")
        lines.append("};")
        return lines

    body = []
    body += array_lines("kHrirLeftSpeakerLeftEar", hrirs["left_left"])
    body.append("")
    body += array_lines("kHrirLeftSpeakerRightEar", hrirs["left_right"])
    body.append("")
    body += array_lines("kHrirRightSpeakerLeftEar", hrirs["right_left"])
    body.append("")
    body += array_lines("kHrirRightSpeakerRightEar", hrirs["right_right"])

    text = f"""#pragma once

// KEMAR HRIRs for the HRTF virtual-speaker renderer (PristineAudio, DSP mode).
//
// Source: SADIE II Database, v2-2, subject D2 (KEMAR), Zenodo record
//   https://doi.org/{ZENODO_DOI}
//   file D2_HRIR_SOFA.zip -> D2_HRIR_SOFA/D2_48K_24bit_256tap_FIR_SOFA.sofa
//   (md5 of the zip: {EXPECTED_MD5})
// License: Apache License 2.0 (see the SOFA file's License attribute and
//   README.md next to this header for the full attribution text).
// Variant: diffuse-field equalized (DFC), 256-tap FIR @ 48 kHz,
//   approx. linear phase -- the ITD is IN the HRIRs, no separate delay
//   table is needed. Do NOT use the minimum-phase variant: it strips ITD.
//
// AZIMUTH SIGN -- VERIFIED EMPIRICALLY, DO NOT "FIX" BY SWAPPING:
//   SADIE/SOFA azimuth grows counter-clockwise from front, i.e. toward
//   the listener's LEFT (+30 deg = 30 deg left, 330 deg = 30 deg right).
//   Measured on this file (see README.md for the full table):
//     azimuth +30 deg: LEFT ear leads -- onset 31 samples earlier,
//       cross-correlation ITD 12 samples (250 us), energy 10.5x right ear
//     azimuth 330 deg: RIGHT ear leads -- onset 12 samples earlier,
//       cross-correlation ITD 13 samples (271 us), energy 11.8x left ear
//     azimuth 0 deg (control): onsets identical, ITD 0, as expected.
//   Hence: LEFT virtual speaker = SADIE azimuth +30 deg (NOT -30 deg),
//   RIGHT virtual speaker = SADIE azimuth 330 deg (== -30 deg).
//   hrtf-design-report.md section 4.1 had this backwards ("Left -> -30");
//   the mapping below follows the measured data, not the report.
//   Geometry agrees independently: ListenerView=[1,0,0], ListenerUp=
//   [0,0,1], so +y is the listener's left; receiver R0 is at y=+0.09 m
//   (left ear) and R1 at y=-0.09 m (right ear).
//
// Naming: kHrir< virtual speaker >< ear >. The renderer's contract
//   (design report section 4.1, with the corrected mapping) is:
//     outL = L * kHrirLeftSpeakerLeftEar  + R * kHrirRightSpeakerLeftEar
//     outR = L * kHrirLeftSpeakerRightEar + R * kHrirRightSpeakerRightEar
//
// Level: RMS over the 4 HRIRs is {rms_all:.6f}. The load-time trim gain
//   is {trim_gain:.4f}x ({20 * math.log10(trim_gain):+.2f} dB), derived from
//   the output energies (see README.md) -- NOT 1/RMS (+27.5 dB), which
//   would be wrong: one convolution scales broadband level by
//   sqrt(sum h^2), not by RMS.
//
// Only these 4 HRIRs (~4 KB) are bundled. Never commit the SOFA file,
// the zip, or any extracted full dataset.

#include <cstddef>

namespace pristine {{

inline constexpr std::size_t kHrirNumTaps = {NUM_TAPS};
inline constexpr int kHrirSampleRateHz = {SAMPLE_RATE_HZ};
// RMS over the 4 HRIRs below (design report section 4.2 quantity).
inline constexpr float kHrirRms = {rms_all:.6f}f;
// Recommended load-time trim gain (energy-derived, see README.md).
inline constexpr float kHrirTrimGain = {trim_gain:.4f}f;

// Virtual speaker at SADIE azimuth +30 deg (30 deg LEFT), elevation 0 deg.
// [0] = left ear (receiver R0), [1] = right ear (receiver R1) of that row.
{chr(10).join(body)}

}}  // namespace pristine
"""
    path.write_text(text, encoding="utf-8")


def _emit_readme(path: Path, table: dict, rms_all: float, trim_gain: float,
                 trim_db: float, sofa_name: str) -> None:
    def row(az: str, ear: str, s: dict, onset: int) -> str:
        return (f"| {az} | {ear} | {s['peak']:+.6f} | {s['peak_idx']} | {onset} | "
                f"{s['rms']:.6f} | {s['energy']:.6f} |")

    t30 = table["+30"]
    t330 = table["330"]
    t0 = table["0"]
    text = f"""# HRTF HRIR data — SADIE II (KEMAR, D2)

## Source

- **Dataset:** SADIE II Database, v2-2, University of York Audio Lab
- **Subject:** D2 (KEMAR dummy head) — `ListenerShortName` "D2", Title "D2 HRIRs"
- **Zenodo record:** https://doi.org/{ZENODO_DOI} (DOI `{ZENODO_DOI}`)
- **File downloaded:** `D2_HRIR_SOFA.zip` (38.0 MB), md5
  `{EXPECTED_MD5}` — verified after download.
- **SOFA file used:** `{sofa_name}`
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
  https://doi.org/{PAPER_DOI}. Dataset DOI: https://doi.org/{ZENODO_DOI}.
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
{row("+30°", "LEFT (R0)", t30["left"], t30["onset_left"])}
{row("+30°", "RIGHT (R1)", t30["right"], t30["onset_right"])}
{row("330° (−30°)", "LEFT (R0)", t330["left"], t330["onset_left"])}
{row("330° (−30°)", "RIGHT (R1)", t330["right"], t330["onset_right"])}
{row("0° (control)", "LEFT (R0)", t0["left"], t0["onset_left"])}
{row("0° (control)", "RIGHT (R1)", t0["right"], t0["onset_right"])}

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

- RMS over the 4 HRIRs: **{rms_all:.6f}** (the §4.2 quantity).
- Per-HRIR energies Σh²: +30°→L 0.8857, +30°→R 0.0846, 330°→L 0.0671,
  330°→R 0.7903.
- Full two-speaker render, decorrelated stereo: outL gain 0.976 (−0.21 dB),
  outR gain 0.935 (−0.58 dB). Mono-centred input: outL −0.20 dB,
  outR −0.36 dB.
- Recommended load-time trim gain: **{trim_gain:.4f}x ({trim_db:+.2f} dB)** —
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
python3 scripts/extract_hrir_sadie.py \\
  --sofa /tmp/hrtf-extract/D2_HRIR_SOFA/D2_48K_24bit_256tap_FIR_SOFA.sofa
```

Re-running regenerates `hrir_kemar_dfc48.h` and this README
byte-identically when the input file is unchanged. The script asserts
the DFC markers, the Apache 2.0 license attribute, the 48 kHz / 256-tap
shape, finite samples, an ipsilateral energy ratio > 5×, a plausible
ITD (8–18 samples), a symmetric 0° control, and the empirical
left-leads-at-+30° mapping — it exits non-zero instead of emitting a
header if any check fails.
"""
    path.write_text(text, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sofa", required=True, help="path to the 48 kHz SOFA file")
    parser.add_argument(
        "--out-dir",
        default=None,
        help="output dir (default: android/app/src/main/cpp/dsp/hrtf under the repo root)",
    )
    args = parser.parse_args()

    sofa_path = Path(args.sofa)
    if not sofa_path.is_file():
        raise SystemExit(f"SOFA file not found: {sofa_path}")
    repo_root = Path(__file__).resolve().parent.parent
    out_dir = Path(args.out_dir) if args.out_dir else (
        repo_root / "android/app/src/main/cpp/dsp/hrtf")
    out_dir.mkdir(parents=True, exist_ok=True)

    with h5py.File(sofa_path, "r") as f:
        attrs = {k: _decode(v) for k, v in f.attrs.items()}
        sr = float(f["Data.SamplingRate"][0])
        ir = f["Data.IR"][:]
        positions = f["SourcePosition"][:]
        recv = f["ReceiverPosition"][:].reshape(2, 3)
        view = f["ListenerView"][:].reshape(3)
        up = f["ListenerUp"][:].reshape(3)

    # --- identity checks: this must be the DFC 48 kHz KEMAR file ---
    assert sr == SAMPLE_RATE_HZ, f"sample rate {sr} != {SAMPLE_RATE_HZ}"
    assert ir.shape[1:] == (2, NUM_TAPS), f"unexpected IR shape {ir.shape}"
    assert np.isfinite(ir).all(), "non-finite samples in Data.IR"
    comment = attrs.get("Comment", "") + " " + attrs.get("History", "")
    assert "iffuse Field Equaliz" in comment, "no DFC marker in Comment/History"
    assert "Linear phase" in attrs.get("Comment", ""), "not linear-phase HRIRs"
    assert "Apache License, Version 2.0" in attrs.get("License", ""), \
        "license attribute is not Apache 2.0"
    assert attrs.get("DatabaseName") == "SADIE II", "not a SADIE II file"
    # Geometry: +y must be the listener's left (right-handed, x fwd, z up).
    assert np.allclose(view, [1, 0, 0]) and np.allclose(up, [0, 0, 1]), \
        f"unexpected ListenerView {view} / ListenerUp {up}"
    assert recv[0][1] > 0 and recv[1][1] < 0, \
        f"receiver R0/R1 not at +/-y: {recv.tolist()}"
    print(f"SOFA: {sofa_path.name}  sr={sr:.0f}  IR={ir.shape}  "
          f"DatabaseName={attrs.get('DatabaseName')}  "
          f"ListenerShortName={attrs.get('ListenerShortName')}")

    row_left = _find_row(positions, AZ_LEFT_DEG, ELEVATION_DEG)
    row_right = _find_row(positions, AZ_RIGHT_DEG, ELEVATION_DEG)
    row_front = _find_row(positions, 0.0, ELEVATION_DEG)
    print(f"rows: +30deg={row_left}  330deg={row_right}  0deg(control)={row_front}")

    def analyse(row: int) -> dict:
        h_left = np.asarray(ir[row, 0], dtype=np.float64)
        h_right = np.asarray(ir[row, 1], dtype=np.float64)
        o_left, o_right, _ = _onsets_common(h_left, h_right)
        delay = _xcorr_delay_db(h_left, h_right)  # + => left leads
        s_left, s_right = _stats(h_left), _stats(h_right)
        return {
            "left": s_left, "right": s_right,
            "onset_left": o_left, "onset_right": o_right,
            "itd_samples": delay,
            "itd_us": delay / SAMPLE_RATE_HZ * 1e6,
            "energy_ratio": s_left["energy"] / s_right["energy"],
        }

    table = {
        "+30": analyse(row_left),
        "330": analyse(row_right),
        "0": analyse(row_front),
    }
    for label, t in table.items():
        print(f"az {label}: L peak {t['left']['peak']:+.4f}@{t['left']['peak_idx']} "
              f"onset {t['onset_left']} rms {t['left']['rms']:.4f} | "
              f"R peak {t['right']['peak']:+.4f}@{t['right']['peak_idx']} "
              f"onset {t['onset_right']} rms {t['right']['rms']:.4f} | "
              f"ITD {t['itd_samples']:+d} samples ({t['itd_us']:+.1f} us) | "
              f"L/R energy {t['energy_ratio']:.2f}")

    # --- empirical verification: the sign convention must be PROVEN ---
    # At +30 deg the LEFT ear (R0) must lead; at 330 deg the RIGHT ear.
    for label, t, want_left in (("+30", table["+30"], True),
                                ("330", table["330"], False)):
        ratio = t["energy_ratio"] if want_left else 1.0 / t["energy_ratio"]
        assert ratio > 5.0, f"az {label}: ipsilateral energy ratio {ratio:.2f} <= 5"
        assert 8 <= abs(t["itd_samples"]) <= 18, \
            f"az {label}: |ITD| {abs(t['itd_samples'])} samples implausible for +-30 deg"
        leads_left = t["itd_samples"] > 0
        assert leads_left == want_left, \
            f"az {label}: expected {'left' if want_left else 'right'} ear to lead"
        onset_leads_left = t["onset_left"] < t["onset_right"]
        assert onset_leads_left == want_left, \
            f"az {label}: onset evidence disagrees with ITD evidence"
    # Control: straight ahead must be (near-)symmetric.
    assert abs(table["0"]["itd_samples"]) <= 2, \
        f"az 0 control ITD {table['0']['itd_samples']} != ~0"
    assert table["0"]["onset_left"] == table["0"]["onset_right"], \
        "az 0 control onsets differ"
    print("VERDICT: LEFT virtual speaker = SADIE azimuth +30 deg; "
          "RIGHT virtual speaker = SADIE azimuth 330 deg (== -30 deg).")

    # --- level / trim (energy-based; see module docstring) ---
    hrirs = {
        "left_left": np.asarray(ir[row_left, 0], dtype=np.float64),
        "left_right": np.asarray(ir[row_left, 1], dtype=np.float64),
        "right_left": np.asarray(ir[row_right, 0], dtype=np.float64),
        "right_right": np.asarray(ir[row_right, 1], dtype=np.float64),
    }
    h4 = np.concatenate(list(hrirs.values()))
    rms_all = float(np.sqrt(np.mean(h4 ** 2)))
    e_out_l = float(np.sum(hrirs["left_left"] ** 2) + np.sum(hrirs["right_left"] ** 2))
    e_out_r = float(np.sum(hrirs["left_right"] ** 2) + np.sum(hrirs["right_right"] ** 2))
    trim_gain = 1.0 / math.sqrt((e_out_l + e_out_r) / 2.0)
    trim_db = 20 * math.log10(trim_gain)
    print(f"RMS over 4 HRIRs = {rms_all:.6f}  (1/RMS = {1 / rms_all:.2f}x "
          f"= +{20 * math.log10(1 / rms_all):.2f} dB -- NOT the trim)")
    print(f"decorrelated-stereo out gains: L {math.sqrt(e_out_l):.4f} "
          f"({20 * math.log10(math.sqrt(e_out_l)):+.2f} dB), "
          f"R {math.sqrt(e_out_r):.4f} ({20 * math.log10(math.sqrt(e_out_r)):+.2f} dB)")
    print(f"recommended load-time trim gain = {trim_gain:.4f}x ({trim_db:+.2f} dB)")

    _emit_header(out_dir / "hrir_kemar_dfc48.h", hrirs, rms_all, trim_gain)
    _emit_readme(out_dir / "README.md", table, rms_all, trim_gain, trim_db,
                 sofa_path.name)
    print(f"wrote {out_dir / 'hrir_kemar_dfc48.h'}")
    print(f"wrote {out_dir / 'README.md'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
