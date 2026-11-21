# Fixture audio uji — chirp 24-bit / 96 kHz

Berkas uji untuk tes bit-perfect otomatis (Gerbang kualitas audio di
`docs/RELEASE_CHECKLIST.md`): dekode berkas ini di app, bandingkan PCM
keluaran dengan referensi `ffmpeg -f s32le`, lewat hash.

## Berkas

- `chirp-24bit-96k.wav` — 5.760.102 byte, 10,000 dtk, stereo
- Format: WAV PCM signed 24-bit little-endian (`pcm_s24le`), 96.000 Hz
- Isi: sine sweep linear 20 Hz → 20 kHz selama 10 dtk, amplitudo 0,7
  (peak terukur −6,1 dBFS, mean −9,1 dB — tidak clipping)
- SHA-256:
  `14847271e90e530f43f0431935887238a1ac60360d9cef71e38518cdc4406905`

## Cara dibuat (ulang kapan saja)

```bash
ffmpeg -f lavfi -i "aevalsrc=0.7*sin(2*PI*(20*t+999*t*t)):s=96000:d=10" \
  -ac 2 -c:a pcm_s24le scripts/test-fixtures/chirp-24bit-96k.wav
```

Rumus fase `2π(20t + 999t²)` = frekuensi sesaat `20 + 1998t` Hz,
jadi 20 Hz di t=0 → 20.000 Hz di t=10.

## Verifikasi (21 Nov 2026, ffmpeg 8.1.2)

- `ffprobe`: `pcm_s24le`, 96000 Hz, 2 channel, 24-bit, 10,000 dtk.
- Zero-crossing per jendela 1 dtk: t=0–1 → ~1.019 Hz (rata-rata
  jendela, target 20→2.018 Hz); t=4,5–5,5 → ~10.010 Hz
  (target ~10.010 Hz); t=9–10 → ~19.000 Hz (target ~19.001 Hz).
  Sweep linear terkonfirmasi.
- `volumedetect`: mean −9,1 dB, max −6,1 dB.

## Referensi s32le untuk hash (dibuat saat tes, tidak disimpan)

```bash
ffmpeg -v error -i scripts/test-fixtures/chirp-24bit-96k.wav \
  -f s32le /tmp/chirp-24bit-96k-ref.s32le
sha256sum /tmp/chirp-24bit-96k-ref.s32le
```

## Catatan

- Bukan berkas "02-asli-1644-chirp" (44,1 kHz/16-bit) yang disebut di
  `docs/ANALYZER_FFT_2026-11-11.md` — berkas itu tidak ada di repo.
- Di POCO M6 + DAC CM108 (maks 48 kHz) berkas ini TIDAK bisa
  bit-perfect — downsample pasti terjadi. Tes hash bit-perfect yang
  valid butuh jalur 96 kHz (DAC UAC2 via USB Direct, atau harness host).
