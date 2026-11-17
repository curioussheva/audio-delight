# Font aplikasi — Playfair Display + Inter

Keputusan redesign final (2026-11-18): Playfair Display untuk display/headings
(serif elegan, meniru splashscreen), Inter untuk body/UI.

- **Sumber:** file TTF disalin dari paket `@expo-google-fonts/inter` dan
  `@expo-google-fonts/playfair-display` (versi 0.4.2). Bukan dependensi baru —
  `pnpm add` terhalang EPERM chown di sandbox VM, jadi TTF disalin langsung
  ke repo. Kalau nanti pnpm berfungsi lagi, paket tersebut boleh menggantikan
  file-file ini (nama keluarga harus tetap sama).
- **Lisensi:** SIL Open Font License 1.1 — lihat `OFL-LICENSE.txt`.
- **Bobot yang dibundel (sengaja hemat):** Inter 400/500/600/700,
  Playfair Display 400/700. Bobot lain (300/800/900, italic) TIDAK dibundel.
- **Pemakaian:** font TIDAK dipanggil per komponen. Nama keluarga didaftarkan
  di `src/shared/utils/fonts.ts` (`FONT_FAMILY`) dan dirujuk lewat token
  `theme.typography.fontFamily`. Pemuatan sekali di boot (`_layout`), tidak
  pernah memblokir boot bila gagal.
