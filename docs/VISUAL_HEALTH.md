# Visual Health - PristineAudio

> Terukur **2026-10-03**; kontras diperbaiki **2026-10-04** dan **2026-10-10**.
> Kontras: dihitung langsung dari `src/shared/constants/theme.ts` + `src/shared/constants/themes/*.ts`.
> Spacing: `check_layout.ts` dari skill `rn-layout-composition` (`npx --yes tsx .../check_layout.ts src`).
> Kedua angka bisa diperiksa ulang dengan menjalankan alat yang sama.

**Ringkas: 0 `BELUM` kontras, 1 `BELUM` spacing. Status: kontras bersih, spacing belum.**

---

## Kontras

**0 pasangan gagal dari 240 diperiksa.** (Sebelumnya: 16 gagal di lingkup border, lalu 7 gagal di lingkup teks.)

### Putaran kedua (2026-10-10) - lingkup diperluas ke seluruh peran teks

Lingkup putaran pertama hanya `border.*` vs `background.primary`, jadi ia melaporkan "bersih" sementara **tujuh** kegagalan teks di atas permukaan berwarna belum pernah diperiksa. Checker kini menyapu seluruh peran teks x permukaan; ia juga sudah diperbaiki agar melewatkan kategori yang memang dikecualikan WCAG 1.4.3 (`disabled` dan `inverse`, yang secara spesifikasi bukan teks-di-atas-latar-aplikasi). Tanpa itu, 160 non-temuan menutupi 7 temuan nyata.

| Tema | Token | Lama | rasio | Baru | rasio |
|---|---|---|---|---|---|
| light-elegant | `text.tertiary` | `#64748B` | 4.34 | `#617187` | 4.54 |
| light-silver | `text.tertiary` | `#71717A` | 3.81 | `#65656D` | 4.55 |
| light-gray | `text.tertiary` | `#64748B` | 3.86 | `#5A687D` | 4.59 |
| pure-white | `text.tertiary` | `#737373` | 4.35 | `#707070` | 4.54 |
| neon-cyber | `text.tertiary` | `#FF00FF` | 3.92 | `#FF4DFF` | 4.54 |

Nilai baru adalah **pergeseran minimum** yang lulus (hue dipertahankan; tema gelap dilighten, tema terang digelapkan), bukan warna baru. Untuk `neon-cyber`, `#FF00FF` adalah magenta primer tema - mempertahankan hue penting supaya identitas temanya tidak berubah.

**Catatan:** `DEEP_NAVY` di `themes/dark.ts` tetap dead code seperti disebut di atas; perubahan di atas menyentuh tema yang benar-benar dipakai.

### Yang diperbaiki (2026-10-04)

Semua kegagalan adalah satu jenis: `border.medium` di atas `background.primary`, ambang 3:1 (WCAG non-text contrast). **Akar masalah:** token border ditulis manual per tema tanpa dihitung terhadap background-nya.

**Fix:** border sekarang **diturunkan secara algoritmik** dari `background.primary` tiap tema — di-*lighten* (tema gelap) atau di-*darken* (tema terang) sampai rasio ≥ 3:1. Hue tiap tema terjaga (border tema navy tetap navy-ish, bukan abu-abu global). Skrip: `fix_borders.py` (idempotent, ada `--dry-run`, ada guard untuk token yang sudah lolos).

| Tema | border.medium lama | rasio | border.medium baru | rasio |
|---|---|---|---|---|
| aged-whiskey | `#241810` | 1.12 | `#65615E` | 3.17 |
| charcoal-black | `#121212` | 1.12 | `#666666` | 3.66 |
| deep-navy | `#1F2A3A` | 1.25 | `#606873` | 3.22 |
| midnight-blue | `#1A2540` | 1.21 | `#606671` | 3.19 |
| light-gray | `#CBD5E1` | 1.42 | `#888A8B` | 3.31 |
| pure-white | `#D4D4D4` | 1.48 | `#8C8C8C` | 3.36 |
| forest-green | `#253F21` | 1.48 | `#636D62` | 3.19 |
| ocean-wave | `#194055` | 1.54 | `#606D75` | 3.19 |

(10 tema lainnya juga diperbaiki dengan cara yang sama — lihat commit.)

`border.light` juga diperbaiki (sebelumnya gagal di 16/17 tema, lebih buruk dari medium, meski dipakai 9× vs medium 1×). Sekarang tier kedua yang lebih halus: mix 18%.

**Yang sudah lolos sejak awak (`neon-cyber`, 6.20):** tidak disentuh — guard di skrip melewatinya.

**Catatan teknis:** `DEEP_NAVY` di `themes/dark.ts` adalah **dead code** — `theme.ts` mendefinisikan `deep-navy` sebagai inline literal yang menang. `DEEP_NAVY` tidak ter-import dan tidak terpakai di mana pun.

Status: `ADA` lulus AA (4.5:1 teks) | `SEBAGIAN` lulus large-text saja (3:1) | `BELUM` gagal

---

## Spacing

**521 literal hardcoded di 52 file** (195 dipindai, 10 file token dikecualikan). Status: `BELUM`

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
35x  src/app/(drawer)/settings.tsx
26x  src/app/(drawer)/song/[id].tsx
26x  src/features/library/components/ArtistList.tsx
23x  src/features/library/components/FolderList.tsx
22x  src/features/library/components/AlbumGrid.tsx
20x  src/app/(drawer)/(tabs)/analyzer.tsx
20x  src/app/player/index.tsx
20x  src/features/library/components/PlaylistList.tsx
19x  src/features/headphone/components/HeadphoneSection.tsx
```

**Layar EQ turun 23 -> 7** (2026-10-10), sehingga keluar dari daftar terburuk.
`HeadphoneSection.tsx` masih 19; sisa literal di sana adalah ukuran tipografi/
aspek (mis. rasio thumb fader), bukan ritme spacing - belum ditokenkan dan
**tidak diklaim selesai**.

### Akar masalahnya: `SPACING` tidak punya padanan

`SPACING` di `theme.ts` berisi **8 token**: `xxs:2 | xs:4 | sm:8 | md:16 | lg:24 | xl:32 | xxl:48 | xxxl:64`.

Tapi literal yang paling sering muncul adalah **20 (74x), 12 (68x), 10 (43x), 15 (19x), 6 (18x), 30 (14x), 40 (12x)** - **tidak satu pun** dari nilai itu punya token. Artinya skala spacing ini tidak dibangun dari pemakaian nyata; ia ditulis lebih dulu, lalu kode ditulis tanpa memakainya.

**Konsekuensi untuk rencana perbaikan:** menambahkan token spekulatif hanya menggeser masalah. Yang benar adalah menurunkan skala dari nilai yang benar-benar terpakai (20, 12, 10 paling sering) atau memang sengaja memetakan literal itu ke token terdekat dan menerima pergeseran visual. **Keduanya keputusan desain, bukan pekerjaan mekanis.** Lihat `ROADMAP.md` Fase 4.

Status: `ADA` pakai token | `SEBAGIAN` literal (dalam toleransi) | `BELUM` drift

---

## Kenapa ini dicatat, bukan diabaikan

Standar project ini (`docs/README.md`) mengharuskan status bisa dibuktikan. Untuk lapisan visual, sebelum 2026-10-03 tidak ada satu pun angka - hanya pernyataan umum "masih banyak hardcoded". Dua angka di atas menggantinya dengan sesuatu yang bisa diperiksa dan diperbaiki.

**Lebih baik 2 `BELUM` yang jujur daripada 10 `ADA` yang diasumsikan.**
