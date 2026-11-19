# spike/hrtf — Harness host HRTF

Harness host (g++, tanpa perangkat, tanpa NDK) untuk konvolver
partitioned HRTF (`UniformPartitionedConvolver`) dan node
`HRTFNode` (virtual speaker ±30°).

## Bangun & jalankan

```sh
cmake -S spike/hrtf -B /tmp/hrtf-build
cmake --build /tmp/hrtf-build
/tmp/hrtf-build/test_hrtf_convolver
/tmp/hrtf-build/test_hrtf_node
```

Atau langsung g++ (lihat header tiap file test).
Dengan sanitizer (ASan+UBSan) juga tercantum di sana.

## Yang dibuktikan

`test_hrtf_convolver`:

- FFTPlan round-trip (forward -> inverse = identitas).
- Konvolver == FIR langsung (`FIRFilter`) pada sinyal panjang,
  untuk SEMUA ukuran chunk process() 1..1920 (termasuk 1920 =
  maks callback) + chunk acak — membuktikan FIFO streaming dan
  latensi tepat satu blok (256 sampel).
- Tes impuls: output = IR digeser satu blok.
- Sunyi -> sunyi; NaN tidak menggantung (reset membersihkan).
- Validasi kernel + passthrough bila kernel belum dimuat.

`test_hrtf_node`:

- Disabled: passthrough bit-exact; enabled + settle: output ==
  konvolusi langsung 4 kernel HRIR (trim dilipat).
- Impuls L saja -> outL = kLL, outR = kLR (dan sebaliknya) —
  membuktikan pemetaan azimuth terkoreksi (+30° = speaker kiri).
- Disable: fade-out kembali ke passthrough bit-exact.
- Input mono: phantom centre (level seimbang + ITD ~0).
- Prepare 44,1 kHz: kernel ter-resample, ITD terjaga (lag 11);
  96 kHz: node inert.
- Toggle sinus 100 Hz tidak mengklik; NaN + reset; chunking
  count > maxFrames.

## Yang TIDAK dibuktikan di sini

Kompilasi NDK, bunyi di headphone, CPU di POCO M6, gate output.
Lihat `~/workspace/audit-chain-2026-11-18/hrtf-implementation-report.md`.
