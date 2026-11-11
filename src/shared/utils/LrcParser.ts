export interface LirikLine {
  time: number; // dalam milidetik
  text: string;
}

/**
 * Index baris lirik yang aktif pada posisi pemutaran tertentu.
 *
 * PERHATIAN SATUAN: `positionSeconds` dalam DETIK (satuan position di
 * playerStore — `posMs / 1000`), sedangkan `line.time` dalam MILIDETIK.
 * Membandingkan keduanya mentah-mentah salah faktor 1000×: baris 01:00
 * baru "aktif" saat position >= 60000, alias 16 jam (U-P2-12). Konversi
 * ke milidetik dilakukan DI SINI, di satu tempat, supaya pemanggil tidak
 * perlu mengingatnya.
 *
 * Mengembalikan -1 bila belum ada baris yang mulai (atau list kosong).
 */
export const findActiveLyricIndex = (
  lines: LirikLine[],
  positionSeconds: number,
): number => {
  const positionMs = positionSeconds * 1000;
  return lines.findIndex((line, index) => {
    const nextLine = lines[index + 1];
    return positionMs >= line.time && (!nextLine || positionMs < nextLine.time);
  });
};

export const parseLRC = (lrcText: string): LirikLine[] => {
  const lines = lrcText.split("\n");
  const result: LirikLine[] = [];
  const timeReg = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;

  lines.forEach((line) => {
    const text = line.replace(timeReg, "").trim();
    if (!text) return;

    let match;
    timeReg.lastIndex = 0;
    while ((match = timeReg.exec(line)) !== null) {
      const min = parseInt(match[1]);
      const sec = parseInt(match[2]);
      const ms = parseInt(match[3].padEnd(3, "0"));
      const time = min * 60 * 1000 + sec * 1000 + ms;
      result.push({ time, text });
    }
  });

  return result.sort((a, b) => a.time - b.time);
};
