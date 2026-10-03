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

Kalau arsip bertentangan dengan dokumen aktif, **dokumen aktif yang berlaku.**
