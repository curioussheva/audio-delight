# spike/hrtf — Harness host HRTF

Harness host (g++, tanpa perangkat, tanpa NDK) untuk konvolver
partitioned HRTF (`UniformPartitionedConvolver`).

## Bangun & jalankan

```sh
cmake -S spike/hrtf -B /tmp/hrtf-build
cmake --build /tmp/hrtf-build
/tmp/hrtf-build/test_hrtf_convolver
```

Atau langsung g++ (lihat header `test_hrtf_convolver.cpp`).
Dengan sanitizer (ASan+UBSan) juga tercantum di sana.

## Yang dibuktikan

- FFTPlan round-trip (forward -> inverse = identitas).
- Konvolver == FIR langsung (`FIRFilter`) pada sinyal panjang,
  untuk SEMUA ukuran chunk process() 1..1920 (termasuk 1920 =
  maks callback) + chunk acak — membuktikan FIFO streaming dan
  latensi tepat satu blok (256 sampel).
- Tes impuls: output = IR digeser satu blok.
- Sunyi -> sunyi; NaN tidak menggantung (reset membersihkan).
- Validasi kernel + passthrough bila kernel belum dimuat.

## Yang TIDAK dibuktikan di sini

Kompilasi NDK, bunyi di headphone, CPU di POCO M6, gate output.
Lihat `~/workspace/audit-chain-2026-11-18/hrtf-implementation-report.md`.
