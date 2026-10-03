# Visual Health - PristineAudio

> Terukur **2026-10-03**.
> Kontras: dihitung langsung dari `src/shared/constants/theme.ts` + `src/shared/constants/themes/*.ts`.
> Spacing: `check_layout.ts` dari skill `rn-layout-composition` (`npx --yes tsx .../check_layout.ts src`).
> Kedua angka bisa diperiksa ulang dengan menjalankan alat yang sama.

**Ringkas: 2 temuan `BELUM`, 0 `SEBAGIAN`. Status keseluruhan: belum bersih.**

---

## Kontras

**16 pasangan gagal dari 102 diperiksa.** Semuanya satu jenis: `border.medium` di atas `background.primary`, ambang 3:1 (WCAG non-text contrast).

| Tema | Token | Rasio | Minimal | Status |
|---|---|---|---|---|
| aged-whiskey | `#241810` on `#120C08` | 1.12 | 3.0 | BELUM |
| charcoal-black | `#121212` on `#000000` | 1.12 | 3.0 | BELUM |
| emerald-noir | `#141D17` on `#0A0F0C` | 1.12 | 3.0 | BELUM |
| vinyl-noir | `#1C1C1C` on `#080808` | 1.18 | 3.0 | BELUM |
| midnight-blue | `#1A2540` on `#0B1424` | 1.21 | 3.0 | BELUM |
| blue-jeans | `#1E2835` on `#0F1620` | 1.22 | 3.0 | BELUM |
| cozy-metallic | `#2F251E` on `#1A1410` | 1.22 | 3.0 | BELUM |
| deep-navy | `#1F2A3A` on `#0A1628` | 1.25 | 3.0 | BELUM |
| graphite-slate | `#232C34` on `#12181C` | 1.26 | 3.0 | BELUM |
| sunset-orange | `#3A251A` on `#1A0F0A` | 1.31 | 3.0 | BELUM |
| rose-gold | `#3F2E2E` on `#1F1A1A` | 1.34 | 3.0 | BELUM |
| golden-hour | `#3A2C24` on `#1A1410` | 1.36 | 3.0 | BELUM |
| light-gray | `#CBD5E1` on `#F8FAFC` | 1.42 | 3.0 | BELUM |
| pure-white | `#D4D4D4` on `#FFFFFF` | 1.48 | 3.0 | BELUM |
| forest-green | `#253F21` on `#0F1F0D` | 1.48 | 3.0 | BELUM |
| ocean-wave | `#194055` on `#0B1E2B` | 1.54 | 3.0 | BELUM |

**Yang lolos (`ADA`):** 86 pasangan lain, termasuk `text.primary` / `text.secondary` di atas `background.primary` / `background.secondary` di **semua 20 tema**. Teks utama terbaca; yang gagal adalah **garis**.

**Catatan penting:** 4 tema yang didefinisi inline di `theme.ts` (`deep-navy`, `obsidian`, `light-elegant`, `light-silver`) punya `border.medium` dengan nilai berbeda dari 16 tema lain - lebih kontras (`#334155`, `#404040`, `#E2E8F0`, `#D4D4D8`), tapi tetap gagal ambang 3:1 (1.23-1.85). Jadi ini bukan artefak parsing: **seluruh 20 tema gagal di pasangan ini**, hanya nilainya berbeda.

Status: `ADA` lulus AA (4.5:1 teks) | `SEBAGIAN` lulus large-text saja (3:1) | `BELUM` gagal

---

## Spacing

**519 literal hardcoded di 52 file** (172 dipindai, 10 file token dikecualikan). Status: `BELUM`

### Menurut nilai

| Nilai | Jumlah | Punya token? |
|---|---|---|
| 20 | 74 | BELUM |
| 12 | 68 | BELUM |
| 8 | 60 | ADA `space.sm` |
| 16 | 51 | ADA `space.md` |
| 4 | 43 | ADA `space.xs` |
| 10 | 43 | BELUM |
| 2 | 38 | ADA `space.xxs` |
| 24 | 34 | ADA `space.lg` |
| 15 | 19 | BELUM |
| 6 | 18 | BELUM |
| 30 | 14 | BELUM |
| 40 | 12 | BELUM |
| 14, 25, 5, 120, 100, 0, 150, 32, 18, 1, 48, 80, 66, 34, 72, 28 | 1-8 masing-masing | campur |

### File terburuk

```
28x  src/app/(drawer)/settings.tsx
26x  src/app/(drawer)/song/[id].tsx
26x  src/features/library/components/ArtistList.tsx
23x  src/app/(drawer)/(tabs)/equalizer.tsx
23x  src/features/library/components/FolderList.tsx
22x  src/features/library/components/AlbumGrid.tsx
20x  src/app/(drawer)/(tabs)/analyzer.tsx
20x  src/app/player/index.tsx
20x  src/features/library/components/PlaylistList.tsx
```

### Akar masalahnya: `SPACING` tidak punya padanan

`SPACING` di `theme.ts` berisi **8 token**: `xxs:2 | xs:4 | sm:8 | md:16 | lg:24 | xl:32 | xxl:48 | xxxl:64`.

Tapi literal yang paling sering muncul adalah **20 (74x), 12 (68x), 10 (43x), 15 (19x), 6 (18x), 30 (14x), 40 (12x)** - **tidak satu pun** dari nilai itu punya token. Artinya skala spacing ini tidak dibangun dari pemakaian nyata; ia ditulis lebih dulu, lalu kode ditulis tanpa memakainya.

**Konsekuensi untuk rencana perbaikan:** menambahkan token spekulatif hanya menggeser masalah. Yang benar adalah menurunkan skala dari nilai yang benar-benar terpakai (20, 12, 10 paling sering) atau memang sengaja memetakan literal itu ke token terdekat dan menerima pergeseran visual. **Keduanya keputusan desain, bukan pekerjaan mekanis.** Lihat `ROADMAP.md` Fase 4.

Status: `ADA` pakai token | `SEBAGIAN` literal (dalam toleransi) | `BELUM` drift

---

## Kenapa ini dicatat, bukan diabaikan

Standar project ini (`docs/README.md`) mengharuskan status bisa dibuktikan. Untuk lapisan visual, sebelum 2026-10-03 tidak ada satu pun angka - hanya pernyataan umum "masih banyak hardcoded". Dua angka di atas menggantinya dengan sesuatu yang bisa diperiksa dan diperbaiki.

**Lebih baik 2 `BELUM` yang jujur daripada 10 `ADA` yang diasumsikan.**
