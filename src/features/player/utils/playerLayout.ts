/**
 * Geometri layar Player — logika murni (tanpa React/native) supaya bisa
 * diuji. Dipakai P2-7: bar utilitas + kontrol utama tidak boleh tergeser
 * keluar layar, dan ukuran harus mengikuti rotasi (dulu `Dimensions.get(
 * "window")` di level modul — nilainya dibekukan saat import, tidak pernah
 * berubah saat rotasi).
 */

/**
 * LAYOUT-V3 — tinggi kanvas visualizer (dp). Dulu 120: visualizer jatuh
 * di bawah lipatan di portrait POCO M6. Sekarang 64 — ruang TETAP yang
 * dihitung dalam anggaran vertikal, supaya visualizer selalu terlihat
 * tanpa scroll. Dipakai kanvas ParametricSpectrumView + kolom skala dBFS
 * (keduanya harus sama tinggi).
 */
export const VISUALIZER_CANVAS_HEIGHT = 64;

/**
 * LAYOUT-V3 — chrome vertikal tetap layar Player (dp, TANPA insets dan
 * TANPA sampul), dijumlah dari style `src/app/player/index.tsx`. Bila
 * style berubah, ubah konstanta ini juga — kalau tidak, anggaran
 * artworkSize meleset dan layar kembali butuh scroll:
 *   header 88 (kotak 76: panel pad 24 + paddingTop 8 + isi 44,
 *     + marginBottom 12)
 * + blok judul 124 (mt 10 + panel 104: pad 16 + judul 20px 2 baris 48
 *     + mb 6 + artis 14px 17 + info file mt 4 + 11px 13, + mb 10)
 * + visualizer 100 (panel 88: pad 24 + kanvas 64, + mb 12)
 * + kontrol 156 (panel 126: pad 24 + baris tombol 56 + slider 40 +
 *     baris waktu 6, + mb 30)
 * + utilitas 86 (mt 8 + paddingVertical 24 + isi 54: padding tombol
 *     20 + ikon 20 + label mt 2 + 12)
 * + gap bawah 12 (playerBottomPadding = insets.bottom + 12)
 * + marginBottom sampul 12
 * = 578.
 *
 * Asumsi insets (bukan tebakan — layar 17:44 memakai nav 3-tombol):
 * insets.top 24 (status bar), insets.bottom 48 (nav bar). Bila device
 * memakai gesture nav (insets.bottom ~16–20), selisihnya jadi ruang
 * ekstra untuk sampul (artworkSize membesar sendiri).
 */
export const PLAYER_CHROME_DP = 578;

/** Tinggi bar chip speed/tuning saat tampil (isi 21 + marginBottom 20). */
export const PLAYER_CHIPS_DP = 41;

/** Lantai ukuran sampul — layar kecil/landscape tetap punya sampul. */
export const PLAYER_ARTWORK_MIN_DP = 96;

/**
 * Sisi kotak sampul/lirik (persegi). LAYOUT-V3: bukan lagi
 * `min(w,h) − 100` — ukuran dihitung dari ANGGARAN VERTIKAL supaya
 * seluruh layar (header + judul + sampul + visualizer + kontrol +
 * utilitas) muat 1 layar tanpa scroll di portrait POCO M6:
 *   tinggi layar − safeTop − safeBottom − PLAYER_CHROME_DP
 *   (− PLAYER_CHIPS_DP bila chip speed/tuning tampil).
 * Dibatasi lebar (kotak tidak boleh lebih lebar dari layar − 100,
 * aturan lama) dan lantai 96 — di layar kecil/landscape, ScrollView
 * tetap jadi pengaman scroll. Anggaran memakai judul 2 baris (kasus
 * terburuk); judul 1 baris menyisakan 24dp kosong di tengah.
 *
 * 360×800 (24/48): 150 — 393×873 (24/48): 223.
 */
export function artworkSize(
  windowWidth: number,
  windowHeight: number,
  safeTop = 24,
  safeBottom = 48,
  chipsVisible = false,
): number {
  const fromHeight =
    windowHeight -
    safeTop -
    safeBottom -
    PLAYER_CHROME_DP -
    (chipsVisible ? PLAYER_CHIPS_DP : 0);
  return Math.max(
    PLAYER_ARTWORK_MIN_DP,
    Math.min(windowWidth - 100, fromHeight),
  );
}

/**
 * Lebar kanvas visualizer. Panel selebar layar - 48 (paddingHorizontal 24
 * x2 di konten ScrollView), dikurangi padding panel 24, kolom skala dBFS
 * 28, dan margin 8.
 */
export function visualizerWidth(windowWidth: number): number {
  return windowWidth - 108;
}

/**
 * Padding vertikal konten lirik (FullLyricsView). Ruang kosong agar lirik
 * awal/akhir bisa digulir ke tengah. Dulu `height / 2.5` dari tinggi layar
 * saat import — dibekukan saat rotasi.
 */
export function lyricsVerticalPadding(windowHeight: number): number {
  return windowHeight / 2.5;
}
