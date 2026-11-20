// src/features/library/store/trackListMerge.ts
//
// Merge MURNI untuk `setTracks` (nol dependensi runtime — tanpa import
// nilai, hanya tipe lokal, sama seperti pola scanBatchWriter.ts).
//
// MASALAH (Item 2 — spike completion scan, logcat #10): tiap scan
// selesai, `getLibrarySongs` membaca ulang SELURUH library dari SQLite
// dan `setTracks` mengganti array 289 track sekaligus dengan 289 objek
// BARU — walau isinya sama persis dengan yang sudah tampil. Dua
// pemanggil berurutan melakukan ini di jalur resume yang sama
// (library.tsx `refreshLibrary`: setTracks + reload() → useLibrary
// `loadSongs`: setTracks lagi), dan tiap `set()` me-render ulang penuh
// LibraryScreen (langganan SELURUH store, library.tsx:172) + semua
// selector (stats/album/artis/folder/genre/filetype) + FlashList dengan
// drawDistance ~100 baris.
//
// PERBAIKAN — dua lapis, keduanya di DALAM `setTracks` saja (satu
// tempat, semua pemanggil ikut — initialScan, refreshLibrary,
// useLibrary, [id].tsx, OnlineMetadataService):
//   1. LEWATI set bila isi daftar sama persis (id + urutan + semua field
//      tiap lagu). Resume tanpa lagu baru/hilang — kasus paling sering,
//      quickDiff melaporkan "No changes detected" — kini NOL `set()`,
//      NOL re-render, NOL tulis persist. Set ganda berurutan dengan isi
//      sama (refreshLibrary + reload) runtuh jadi nol.
//   2. Bila isi BERUBAH (lagu baru/hilang/metadata berubah), pakai
//      kembali referensi objek LAMA untuk lagu yang isinya tidak berubah
//      — hanya lagu baru/berubah yang jadi objek baru. Daftar akhir
//      (isi + urutan) IDENTIK dengan yang dulu dihasilkan `setTracks`
//      mentah; yang berubah hanya identitas referensi, supaya memo di
//      bawah (SongListItem memo, useMemo atas `tracks`) bisa melewatkan
//      baris yang tidak berubah.
//
// KENAPA BUKAN CHUNKED-SET (set bertahap + yield antar chunk):
// biaya spike BUKAN di `set()` itu sendiri (itu O(1)-ish + satu
// `filter` O(n) untuk unenrichedCount) melainkan di RENDER yang
// dipicunya — dan tiap chunk memicu SATU render penuh layar
// (FlashList me-render ~100 baris dari drawDistance tidak peduli
// berapa isi `data`). N chunk = N render penuh: total kerja NAIK,
// bukan turun, ditambah daftar tampak muncul bertahap (berkedip).
// Chunking juga tidak menyelesaikan set ganda. Jadi chunking DITOLAK;
// guard + reuse identitas adalah bentuk yang tidak mengganggu tampilan.
//
// KEAMANAN PERBANDINGAN (arah konservatif — salah lebih baik "berubah"
// daripada "sama", supaya UI tidak pernah menampilkan data basi):
//   - Semua own key dibandingkan; array (satu-satunya nilai non-skalar
//     dari dbRowToSong — `editedFields`, dibuat BARU tiap pemetaan dari
//     JSON.parse, jadi `!==` mentah akan selalu bilang berubah)
//     dibandingkan per elemen.
//   - Nilai objek non-array yang referensinya beda = berubah.
//   - Kunci `undefined` vs kunci yang tidak ada dianggap sama
//     (dbRowToSong selalu menulis kunci; pemanggil lain kadang tidak).
//   - `lastSeenAt` TIDAK dikecualikan: quickDiff hanya menulis lagu
//     baru/berubah (ScanDiffEngine.processQuickDiff: toWrite = new +
//     updated saja), jadi lagu yang tidak berubah punya lastSeenAt
//     yang stabil di DB dan perbandingan tetap lolos. Bila suatu hari
//     scan mulai menyentuh lastSeenAt semua baris, guard ini berhenti
//     melewatkan set (aman — kembali ke perilaku lama, bukan data basi).
//
// CATATAN BATAS: guard ini tidak menghilangkan SATU set penuh saat
// daftar BENAR-BENAR berubah (mis. 5 lagu baru) — render ulang penuh
// layar tetap terjadi sekali di kasus itu, karena `renderSongItem`
// (library.tsx) + `isFavorite` (useFavorites) dibuat ulang tiap
// `tracks` berubah identitasnya, sehingga memo ViewHolder FlashList
// (renderItem + item harus SAMA referensinya) tetap gagal untuk semua
// baris. Itu celah stabilisasi terpisah (di luar "cara hasil diff
// diterapkan ke store") — dicatat sebagai tindak lanjut, bukan
// dikerjakan di sini.

/** Bentuk minimal yang dibandingkan: objek lagu apa pun (MediaTrack / Song). */
export type TrackRecord = Record<string, unknown> & { id: string };

export interface TrackListMergeResult<T> {
  /** Daftar akhir — isi + urutan SAMA dengan `next`; referensi lama dipakai ulang bila isinya sama. */
  tracks: T[];
  /** False hanya bila `next` sama persis isinya (id + urutan + semua field) dengan `prev`. */
  changed: boolean;
}

/** Bandingkan dua nilai field: skalar `===`, array per elemen, objek non-array hanya bila referensi sama. */
function isValueEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  // Objek non-array (tidak dikenal dari dbRowToSong) — konservatif:
  // referensi beda = anggap berubah, jangan pernah samakan dua objek beda.
  return false;
}

/**
 * Dua lagu sama isinya bila semua field-nya sama (kunci `undefined` =
 * kunci tak ada). `id` TIDAK dibandingkan di sini — pemanggil sudah
 * memasangkan berdasarkan id.
 *
 * Catatan tipe: `MediaTrack` adalah `interface`, dan interface TIDAK
 * punya index signature implisit — jadi `MediaTrack` tidak bisa
 * langsung dipakai sebagai `Record<string, unknown>`. Pemakaian di
 * `mergeTrackList` (generik atas `{ id: string }`) meng-cast lewat
 * `unknown`; fungsi ini sendiri menerima bentuk record apa pun.
 */
export function isTrackContentEqual(a: TrackRecord, b: TrackRecord): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  // Kunci yang hanya ada di satu sisi dengan nilai undefined tidak dihitung.
  const aMeaningful = aKeys.filter((k) => a[k] !== undefined);
  const bMeaningful = bKeys.filter((k) => b[k] !== undefined);
  if (aMeaningful.length !== bMeaningful.length) return false;
  for (const key of aMeaningful) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!isValueEqual(a[key], b[key])) return false;
  }
  return true;
}

/**
 * Gabungkan daftar lama (`prev`, yang tampil) dengan daftar segar
 * (`next`, dari SQLite): lagu yang isinya sama memakai kembali objek
 * lama; lagu baru/berubah memakai objek dari `next`; urutan mengikuti
 * `next`. Bila `next` sama persis dengan `prev`, kembalikan array `prev`
 * itu sendiri dengan `changed: false` — pemanggil (setTracks) lalu
 * melewatkan `set()` sepenuhnya.
 */
export function mergeTrackList<T extends { id: string }>(
  prev: T[],
  next: T[],
): TrackListMergeResult<T> {
  if (prev === next) return { tracks: prev, changed: false };

  const prevById = new Map<string, T>();
  for (const track of prev) {
    const id = track?.id;
    if (typeof id === "string" && !prevById.has(id)) prevById.set(id, track);
  }

  let changed = prev.length !== next.length;
  const merged: T[] = Array.from<T>({ length: next.length });
  for (let i = 0; i < next.length; i++) {
    const incoming = next[i];
    const id = incoming?.id;
    const existing =
      typeof id === "string" ? prevById.get(id) : undefined;
    if (
      existing &&
      isTrackContentEqual(
        existing as unknown as TrackRecord,
        incoming as unknown as TrackRecord,
      )
    ) {
      // Urutan berubah = daftar berubah, walau tiap lagu sama isinya.
      if (prev[i] !== existing) changed = true;
      merged[i] = existing;
    } else {
      changed = true;
      merged[i] = incoming;
    }
  }

  return { tracks: changed ? merged : prev, changed };
}
