# spike/dsp-eq-bypass — Harness host sakelar master EQ (P0-1)

Harness host (g++, tanpa perangkat, tanpa NDK) untuk sakelar master
"Pemrosesan DSP" (P0-1, 2026-11-19): `DSPConfig.enabled = false`
harus membuat `DSPChain` passthrough BIT-EXACT, dan
`AudioPipeline::applyDSPConfig` harus memetakan
`DSPParameters.eqEnabled` ke flag itu dengan dedup yang mendeteksi
toggle.

## Bangun & jalankan

```sh
cmake -S spike/dsp-eq-bypass -B /tmp/eq-bypass-build
cmake --build /tmp/eq-bypass-build
/tmp/eq-bypass-build/test_dsp_eq_bypass
/tmp/eq-bypass-build/test_pipeline_eq_bypass
```

Sanitizer (ASan+UBSan, pola `spike/hrtf`):

```sh
cmake -S spike/dsp-eq-bypass -B /tmp/eq-bypass-asan \
  -DCMAKE_CXX_FLAGS="-O1 -g -fsanitize=address,undefined" \
  -DCMAKE_EXE_LINKER_FLAGS="-fsanitize=address,undefined"
cmake --build /tmp/eq-bypass-asan
/tmp/eq-bypass-asan/test_dsp_eq_bypass
/tmp/eq-bypass-asan/test_pipeline_eq_bypass
```

## Yang dibuktikan

`test_dsp_eq_bypass` (11 checks):

- Default `DSPConfig.enabled == true` (perilaku lama).
- enabled=true + EQ +6 dB semua band: output BERUBAH (maxDiff ~0.67).
- enabled=false + EQ yang sama: output BIT-EXACT (memcmp == 0).
- Toggle on -> off -> on -> off: berubah -> bit-exact -> berubah ->
  bit-exact (bypass pulih, bukan macet).
- Bypass bit-exact untuk semua ukuran chunk 1..512 + acak (3, 7, 100,
  333, 511).

`test_pipeline_eq_bypass` (8 checks):

- Default `DSPParameters.eqEnabled == true`.
- `AudioPipeline::process()` mode DSP, eqEnabled=false + EQ +6 dB:
  BIT-EXACT — membuktikan `applyDSPConfig` memetakan flag ke
  `DSPConfig.enabled`.
- Toggle ke eqEnabled=true (config lain identik): output BERUBAH —
  membuktikan `dspConfigEquals` mendeteksi perubahan flag dan
  mengirim ulang config ke DSPChain (tanpa ini toggle ditelan dedup).
- Toggle kembali ke false: BIT-EXACT lagi; ke true lagi: BERUBAH lagi.

Pemetaan dibuktikan lewat perilaku `process()`, bukan akses langsung:
`dspConfigEquals` + `mDspConfig` bersifat privat (anonymous namespace
/ member privat). Perilaku ini hanya mungkin bila pemetaan + dedup
keduanya benar: tanpa pemetaan, off tetap memproses; tanpa dedup,
toggle true sesudah off tidak terkirim ulang.

Catatan: buffer pertama sesudah `prepare()` TIDAK di-fade (`noteMode`
hanya mencatat mode; fade 8 ms hanya saat ganti mode sungguhan), jadi
bit-exact di sini bukan artefak fade.

## Yang TIDAK dibuktikan di sini

Kompilasi NDK, bunyi di headphone, CPU di POCO M6, gate output, jalur
JNI/Kotlin/JS, dan limiter callback sebagai backstop saat bypass
(kondisi `nodeLimiterRan` di `AudioCallback.cpp` hanya bisa dibaca
dari kode — tidak ada harness host untuk `AudioCallback`).
Lihat `~/workspace/audit-chain-2026-11-18/dsp-tab-ui-ux-audit.md` §2.1.
