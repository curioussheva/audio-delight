/**
 * Parse angka bulat dari string luar (form / API) dengan aman.
 */

/**
 * U-P2-05: parse string jadi integer basis 10 — kembalikan `keep` bila
 * string kosong/undefined atau bukan angka, jangan pernah NaN. Dipakai
 * untuk tahun dari MusicBrainz / form edit, yang dulu tersimpan sebagai
 * NaN saat isinya non-numerik.
 */
export const parseIntOrKeep = (
  raw: string | undefined | null,
  keep: number | undefined,
): number | undefined => {
  if (!raw) return keep;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? keep : parsed;
};
