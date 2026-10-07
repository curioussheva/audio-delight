# PristineAudio - Docs Index - Dokumen perencanaan & referensi project PristineAudio. Urutan baca yang disarankan buat orang baru: `../README.md` (status & setup), lalu `ARCHITECTURE.md`, baru sisanya sesuai kebutuhan.

| Dokumen | Isi |
|---|---|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Stack, struktur folder, alur audio, keputusan arsitektur (ADR bernomor) |
| [`FEATURES.md`](./FEATURES.md) | Breakdown per-fitur (scope dipisah dari status implementasi) |
| [`ROADMAP.md`](./ROADMAP.md) | **Satu-satunya roadmap.** Urutan kerja per fase + status nyata |
| [`CHANGELOG.md`](./CHANGELOG.md) | Catatan rilis - diisi saat cut release, bukan per-commit |
| [`RELEASE_PROCESS.md`](./RELEASE_PROCESS.md) | Versioning, alur build & distribusi (EAS + GitLab CI) |
| [`TESTING.md`](./TESTING.md) | Verifikasi lokal tanpa Gradle, apa yang diuji CI, manual QA |
| [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md) | Build error yang sudah pernah ketemu & fix-nya - cek dulu sebelum debug dari nol |
| [`VISUAL_HEALTH.md`](./VISUAL_HEALTH.md) | Utang visual terukur: kontras & spacing |
| [`DECODER_RESAMPLER_ANALYSIS.md`](./DECODER_RESAMPLER_ANALYSIS.md) | Analisis konsistensi decoder/resampler: bug timing, dead code, semantic mismatch (2026-10-07) |
| [`PLAYBACK_CONSISTENCY_ANALYSIS.md`](./PLAYBACK_CONSISTENCY_ANALYSIS.md) | Analisis konsistensi playback cpp→JNI→Kotlin→JS: dead spec, missing methods (2026-10-07) |
| [`NATIVE_MODULES_CONSISTENCY.md`](./NATIVE_MODULES_CONSISTENCY.md) | Analisis konsistensi semua native modules: 1 bug, 3 clean, dead code inventory (2026-10-07) |
| [`RATE_CHAIN_AUDIT.md`](./RATE_CHAIN_AUDIT.md) | Alur sample rate hulu→hilir: autodetect device/DAC status, di mana rantai putus, jalan ke bit-perfect (2026-10-07) |
| [`AUDIO_OUTPUT_PATHS.md`](./AUDIO_OUTPUT_PATHS.md) | Audit jalur output audio: speaker/jack/USB DAC/HDMI/Bluetooth-A2DP/cast, mana yang bisa bit-perfect (2026-10-07) |
| [`adr/0001-tiga-mode-satu-sumber-kebenaran.md`](./adr/0001-tiga-mode-satu-sumber-kebenaran.md) | ADR: di mana logika tiga mode hidup, dan mengapa `AudioPipeline` (2026-10-07) |
| [`adr/0002-komparasi-modes.md`](./adr/0002-komparasi-modes.md) | Komparasi teknis nasib `cpp/modes/*`: port-lalu-hapus vs hidupkan kembali (2026-10-07) |
| [`BOILERPLATE_AND_STUBS.md`](./BOILERPLATE_AND_STUBS.md) | Aturan penulisan stub & node penghubung: kosong boleh, bohong tidak (2026-10-07) |
| [`THREAT_MODEL.md`](./THREAT_MODEL.md) | Aset yang dilindungi, skenario ancaman, status mitigasi |
| [`PRIVACY.md`](./PRIVACY.md) | Data apa yang diproses lokal vs keluar device, izin yang diminta |
| [`ACCEPTABLE_USE.md`](./ACCEPTABLE_USE.md) | Batas penggunaan yang sah |

> **Catatan 2026-10-03.** Sebelum ini `docs/` berisi 11 dokumen bergaya roadmap/todolist/plan yang saling tumpang tindih (`roadmap.md` 101 KB, `plan-consolidation-debugging.md` 71 KB, `build-fix-changelog.md` 141 KB, ...), tanpa satu pun indeks, tanpa frontmatter, dan tanpa tanggal revisi. Dokumen-dokumen itu mengandung **10 blok "FASE 0" berulang di satu file** dan **`TL;DR` sampai 5x** - status tidak bisa dipercaya karena tidak ada cara menentukan bagian mana yang berlaku. Semuanya dipindahkan ke [`archive/`](./archive/) apa adanya, dan isinya diserap ke dokumen di tabel ini. **`archive/` bukan rujukan aktif** - kalau ada selisih antara arsip dan dokumen di atas, yang di atas yang berlaku.

---

## Prinsip dokumen di folder ini - Sama seperti `persona/docs/`: kalau sebuah dokumen menyatakan sesuatu **"sudah ada"** atau **"sudah selesai"**, itu harus bisa dibuktikan di kode. Dokumen yang mengklaim status padahal kodenya belum ada **lebih berbahaya** daripada dokumen yang mengaku belum selesai - karena membuat pekerjaan yang masih terbuka terbaca seolah sudah tertutup.

Karena itu:

- **Status harus diverifikasi ke kode**, bukan diwarisi dari dokumen sebelumnya. Dokumen arsip di sini sudah terbukti berisi klaim yang usang.
- **Kalau status tidak bisa diverifikasi, tulis "belum diverifikasi"** - jangan diasumsikan selesai karena filenya ada.
- **Scope** (fitur ini masuk MVP atau Phase 2) dan **status implementasi** (sudah jalan atau belum) harus selalu dipisah. Lihat `FEATURES.md`.
- **Tanda status:** ADA (terverifikasi) -  sebagian - BELUM **belum ada** - ? **belum diverifikasi** (tak bisa dipastikan dari lingkungan ini).

## Konvensi - Tanggal ditulis absolut (`2026-10-03`), bukan "hari ini" atau "baru saja".
- Setiap klaim terukur menyertakan **perintah atau file** yang membuktikannya.
- Dokumen yang menyebut angka (jumlah file, rasio kontras, jumlah literal) harus menyebut **kapan diukur** dan **dengan alat apa**.
- Revisi besar diberi catatan bertanggal di tempat kejadian, bukan dihapus diam-diam.
- Setiap fase di `ROADMAP.md` memakai `[x]` / `[~]` / `[ ]` / `[!]` dengan arti yang sama seperti persona: `[x]` = **ada pemanggil nyata**, bukan "filenya ada".
