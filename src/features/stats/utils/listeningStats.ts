// Statistik mendengarkan / "Wrapped" lokal (item 10 deep-insight §6) —
// LOGIKA MURNI.
//
// Dipisah dari StatsService (api/statsService.ts) supaya bisa diuji Jest
// node: modul ini tidak mengimpor react-native/expo/sqlite — hanya
// tanggal, angka, dan string.
//
// ── Verifikasi data (2026-11-20, dibaca dari kode, bukan dari laporan) ──
// - songs.playCount + lastPlayedAt: ADA dan terisi — ditulis tiap lagu
//   MULAI diputar (playSong + syncFromNative; SongQueries.incrementPlayCount).
// - recent_plays (song_id, played_at, play_duration): ADA — satu baris per
//   lagu yang mulai diputar. TAPI play_duration SELALU 0 (pemanggil
//   mengoper 0) — jadi TIDAK ADA data durasi/jam mendengarkan historis.
// - Akumulasi jam: BARU di fitur ini (daily_listening, lihat statsService).
//   Jam didengarkan HANYA terhitung sejak versi ini; putaran lama hanya
//   menyumbang jumlah putaran / top list / streak, bukan jam.
//
// ── Aturan yang dipakai (dinyatakan eksplisit, bukan tersirat) ──
// - Satu "pemutaran" = satu baris recent_plays = satu kali lagu mulai
//   diputar. playCount TIDAK diubah (mengubahnya akan mengubah smart
//   playlist "Paling Sering Diputar" juga) — skip 1 detik pun tercatat,
//   itu perilaku lama yang dipertahankan.
// - Satu "hari aktif" = satu hari kalender lokal dengan ≥1 baris
//   recent_plays. Streak = hari aktif berturut-turut; bila hari ini
//   belum ada putaran, streak dihitung dari kemarin (belum putus).
// - Satu detik didengarkan = satu detik posisi playback yang benar-benar
//   dilewati (lihat notePlaybackPosition di statsService) — seek/skip
//   tidak dihitung. Batas aman: 1 detik yang sama tidak dihitung ganda.

/** Rentang utama layar statistik. "30d" = tampilan utama (default). */
export type StatsRange = "30d" | "year" | "all";

export interface StatsRangeDef {
  id: StatsRange;
  label: string;
}

export const STATS_RANGE_DEFS: Record<StatsRange, StatsRangeDef> = {
  "30d": { id: "30d", label: "30 Hari" },
  year: { id: "year", label: "Tahun Ini" },
  all: { id: "all", label: "Sepanjang Waktu" },
};

export const STATS_RANGES: readonly StatsRange[] = ["30d", "year", "all"];

export interface TopArtist {
  name: string;
  plays: number;
}

export interface TopTrack {
  id: string;
  title: string;
  artist: string;
  plays: number;
}

export interface ListeningStats {
  range: StatsRange;
  totalPlays: number;
  distinctTracks: number;
  distinctDays: number;
  totalSeconds: number;
  streakDays: number;
  topArtists: TopArtist[];
  topTracks: TopTrack[];
}

export const EMPTY_STATS: (range: StatsRange) => ListeningStats = (range) => ({
  range,
  totalPlays: 0,
  distinctTracks: 0,
  distinctDays: 0,
  totalSeconds: 0,
  streakDays: 0,
  topArtists: [],
  topTracks: [],
});

// ── Tanggal (waktu lokal perangkat — sama dengan kolom `day` di
// daily_listening dan date(..., 'localtime') di query streak) ─────────────

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** 'YYYY-MM-DD' lokal dari Date. */
export function dayKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 'YYYY-MM-DD' lokal dari epoch-ms. */
export function dayKeyFromMs(ms: number): string {
  return dayKeyFromDate(new Date(ms));
}

/** Kunci hari sebelumnya ('YYYY-MM-DD' lokal). */
export function prevDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  date.setDate(date.getDate() - 1);
  return dayKeyFromDate(date);
}

// ── Rentang ────────────────────────────────────────────────────────────────

/**
 * Awal rentang (epoch-ms, inklusif) untuk query recent_plays.
 * - "30d": awal hari 29 hari lalu → hari ini + 29 hari = 30 hari kalender.
 * - "year": 1 Januari tahun berjalan, 00:00 lokal.
 * - "all": 0 (semua baris).
 */
export function rangeStartMs(range: StatsRange, nowMs: number): number {
  if (range === "all") return 0;
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  if (range === "30d") {
    d.setDate(d.getDate() - 29);
    return d.getTime();
  }
  // year
  return new Date(d.getFullYear(), 0, 1).getTime();
}

/**
 * Awal rentang sebagai kunci hari ('YYYY-MM-DD') untuk query
 * daily_listening. null = tanpa batas bawah ("all").
 */
export function rangeStartDayKey(
  range: StatsRange,
  nowMs: number,
): string | null {
  if (range === "all") return null;
  return dayKeyFromMs(rangeStartMs(range, nowMs));
}

// ── Streak ─────────────────────────────────────────────────────────────────

/**
 * Streak hari aktif berturut-turut.
 *
 * @param dayKeys hari-hari yang punya ≥1 putaran ('YYYY-MM-DD', urutan
 *   bebas — duplikat tidak berpengaruh).
 * @param todayKey kunci hari ini ('YYYY-MM-DD' lokal).
 * @returns jumlah hari berturut-turut. Bila hari ini belum ada putaran,
 *   dihitung dari kemarin — streak baru putus bila kemarin pun kosong.
 */
export function computeStreak(
  dayKeys: readonly string[],
  todayKey: string,
): number {
  const days = new Set(dayKeys);
  let cursor = todayKey;
  if (!days.has(cursor)) {
    cursor = prevDayKey(cursor);
  }
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = prevDayKey(cursor);
  }
  return streak;
}

// ── Format ─────────────────────────────────────────────────────────────────

/** "45 dtk" / "12 mnt" / "2 j 15 mnt" / "120 j 5 mnt" (jam total, bukan hari). */
export function formatListeningDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  if (s < 60) return `${s} dtk`;
  const mins = Math.floor(s / 60);
  if (mins < 60) return `${mins} mnt`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest > 0 ? `${hours} j ${rest} mnt` : `${hours} j`;
}

// ── Teks bagikan ───────────────────────────────────────────────────────────

/** Teks untuk Share.share — ringkasan yang sama dengan yang tampil di layar. */
export function buildShareText(
  stats: ListeningStats,
  rangeLabel: string,
): string {
  const lines: string[] = [
    `🎧 Statistik Mendengarkanku — PristineAudio`,
    `📅 ${rangeLabel}`,
    ``,
    `⏱️ ${formatListeningDuration(stats.totalSeconds)} didengarkan`,
    `▶️ ${stats.totalPlays}x diputar • ${stats.distinctTracks} lagu berbeda`,
    `📆 Aktif ${stats.distinctDays} hari • 🔥 Streak ${stats.streakDays} hari`,
  ];
  if (stats.topArtists.length > 0) {
    lines.push(``, `🏆 Artis Teratas:`);
    stats.topArtists.forEach((a, i) => {
      lines.push(`${i + 1}. ${a.name} — ${a.plays}x`);
    });
  }
  if (stats.topTracks.length > 0) {
    lines.push(``, `🎵 Lagu Teratas:`);
    stats.topTracks.forEach((t, i) => {
      lines.push(`${i + 1}. ${t.title} — ${t.artist} (${t.plays}x)`);
    });
  }
  lines.push(``, `#PristineAudio`);
  return lines.join("\n");
}
