/**
 * Geometri layar Player — logika murni (tanpa React/native) supaya bisa
 * diuji. Dipakai P2-7: bar utilitas + kontrol utama tidak boleh tergeser
 * keluar layar, dan ukuran harus mengikuti rotasi (dulu `Dimensions.get(
 * "window")` di level modul — nilainya dibekukan saat import, tidak pernah
 * berubah saat rotasi).
 */

/**
 * Sisi kotak sampul/lirik (persegi). Dulu `width - 100` dari lebar layar
 * saat import: di portrait sama persis, tapi di landscape membesar
 * mengikuti lebar (kotak jauh lebih tinggi dari layar). Dibatasi dimensi
 * terkecil supaya kotak selalu muat di layar.
 */
export function artworkSize(windowWidth: number, windowHeight: number): number {
  return Math.min(windowWidth, windowHeight) - 100;
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
