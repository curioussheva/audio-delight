# Arsip Dokumentasi PristineAudio

**Jangan pakai folder ini sebagai rujukan.** Isinya 11 dokumen perencanaan lama (31 Agustus - 20 September 2026) yang sudah digantikan `../README.md` dan dokumen di `../`.

## Kenapa diarsipkan - Dokumen-dokumen ini mengandung masalah yang membuatnya tidak bisa dipakai:

- **6 dokumen dengan nama roadmap/plan/todo** yang saling tumpang tindih, tanpa hirarki
- **10 blok "FASE 0" berulang dalam satu file** (`roadmap.md`) - tidak ada cara menentukan bagian mana yang berlaku
- **`TL;DR` sampai 5 kali** dalam satu dokumen (`plan-consolidation-debugging.md`)
- **226 checkbox `[ ]` vs 31 `[x]`** - status tidak terpelihara
- **Nol frontmatter, nol tanggal revisi** - tidak diketahui kapan terakhir diverifikasi
- Ukuran: `build-fix-changelog.md` 141 KB, `roadmap.md` 101 KB, `plan-consolidation-debugging.md` 71 KB

Beberapa klaimnya sudah **terbukti usang** saat diperiksa ke kode pada 2026-10-03:

| Klaim di arsip | Kenyataan |
|---|---|
| `clearCache` native belum ada | Sudah ada: `NativePlaybackService.kt:210`, dipanggil `_layout.tsx:73` |
| `PlaybackManager.cpp/.h` perlu dihapus | Sudah terhapus dari repo |
| `react-native-track-player` perlu dibersihkan | Sudah tidak ada di `package.json` |

## Ke mana isinya pergi

| Dokumen arsip | Diserap ke |
|---|---|
| `build-fix-changelog.md`, `build-fix-status.md` | `../TROUBLESHOOTING.md` (10 pola berulang + error spesifik) |
| `roadmap.md`, `new-arch-roadmap.md`, `todo.md` | `../ROADMAP.md` |
| `native-bridge-roadmap.md`, `ui-js-post-native-refactor-todolist.md` | `../ROADMAP.md` Fase 2 (wiring native) |
| `plan-consolidation-debugging.md`, `ConsolidationV2.md` | `../ARCHITECTURE.md` + `../ROADMAP.md` |
| `kt-post-native-refactor-todolist.md` | `../FEATURES.md` |
| `MigrasiRNTPkeCustomOboe.md` | `../ARCHITECTURE.md` (tiga mode pemrosesan) |

## Yang masih berharga di sini - Tidak semua isinya usang. Yang **belum** diserap penuh dan masih bisa dibaca kalau butuh detail:

- **`build-fix-changelog.md`** - detail per-commit perbaikan C++ Agustus 2026. Root cause-nya sudah dirangkum di `TROUBLESHOOTING.md`, tapi kalau butuh konteks satu kejadian spesifik, ada di sini.
- **`plan-consolidation-debugging.md`** - inventarisasi awal JNI  Kotlin  TS. Berguna sebagai pembanding saat audit wiring Fase 2.
- **`ui-js-post-native-refactor-todolist.md`** - daftar kapabilitas native yang "mentok" sebelum sampai TS spec.

## ✅ Verifikasi ulang 2026-10-06 — mana klaim arsip yang masih berlaku

Audit ini membaca ulang 4 dokumen kecil + 3 besar (via subagent) dan **memverifikasi setiap klaim penting ke kode hari ini**.

### Sudah TIDAK berlaku (arsip salah lagi, arsip-README sudah benar)

| Klaim arsip | Kenyataan 2026-10-06 |
|---|---|
| `clearCache` native belum ada | Ada: `NativePlaybackService.kt`, spec punya `clearCache()` |
| `PlaybackManager.cpp/.h` dead code | Sudah dihapus dari repo |
| `react-native-track-player` perlu dibersihkan | Sudah tidak ada di `package.json` |
| `nativeGetDevices()` masih stub kosong | Sudah implementasi nyata: baca `refreshDevices()` + `getAvailableDevices()`, return `AudioDeviceInfo` |
| `System.loadLibrary("pristineaudio_engine")` salah | Sudah `"pristine-audio"` |
| `bootEngineNative()` menunjuk fungsi yang tidak di-compile | Sudah dihapus |
| `initPlaybackModule` tidak dipanggil dari manapun (FASE A1) | **Sudah tidak blocker**: `getController()` lazy-init dari `EngineManager::get().playback()` (`NativePlaybackModule.cpp:13-20`) |
| Kotlin wrapper modul JNI "belum ada" | Semua ada: `NativePristineAudio.kt`, `NativePlaybackModule.kt`, `NativeDeviceModule.kt` |
| TS spec tidak cocok Kotlin | `NativeDSPModule` 16/16 SYNC, `USBDACModule` 12/12, `MediaStoreModule` 2/2, `NativePristineAudio` 7/7 |
| RNTP_ENABLED, `scripts/patch-pristine.sh`, `scripts/custom-rntp/` | Semua sudah hilang |
| "Audio berhenti setelah 18 detik belum di-debug" (`ConsolidationV2.md:133`) | **Tervalidasi sebagai bug nyata**: throughput decoder 24.8k fps < 48k realtime → underrun tiap ~18 detik. Fixed di commit `aa66cc4d` (lihat `../TROUBLESHOOTING.md` 96kHz) |

### Masih BERLAKU hari ini

- **`dsp/immersive/*`, `fft/`, `modes/*`, `jni/NativeAudioFeed.cpp` = dead code.** Rantai dependensi terkonfirmasi: `AudioPipeline.cpp` (AKTIF) hanya pakai `dsp/DSPChain.cpp`; `modes/ImmersivePipeline.h` (DEAD) satu-satunya pemakai `dsp/immersive/*` (6 file, hanya saling include); `fft/FFTPlan.cpp` hanya dipakai `FFTResonanceAnalyzer` yang sendiri DEAD; `NativeAudioFeed.cpp` (82 baris, JNI `OboeAudioProcessor_*`) tidak punya pasangan Kotlin. Total ~1141 baris dead code. **Hapus `modes/` dulu**, sisanya ikut (Limiter di `BitPerfectPipeline.cpp` sudah pindah ke `DSPChain`). Catatan: `AudioPipeline.cpp` sendiri punya mode switch `ProcessingMode` inline (baris 55-99), jadi tidak ikut terhapus.
- **`setProcessingMode` orphan**: C++ chain ada (`AudioConfig.h`, `NativeDSPModule.cpp:142`), JS-nya ada di spec, tapi `AudioPipeline::processImmersive` masih hanya `mDSP.process()` + komentar "FUTURE" — immersive DSP-nya belum jadi.
- **FD-based custom I/O** (hilangkan cache copy) — masih feature backlog, belum dikerjakan.

Kalau arsip bertentangan dengan dokumen aktif, **dokumen aktif yang berlaku.**
