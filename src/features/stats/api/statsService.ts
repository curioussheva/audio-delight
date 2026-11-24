// Statistik mendengarkan / "Wrapped" lokal (item 10 deep-insight §6) —
// LAPISAN DATA (SQLite + akumulasi). BUKAN logika murni: modul ini
// mengimpor react-native-quick-sqlite, jadi TIDAK diuji Jest node
// (pola yang sama dengan backupIO.ts — yang diuji adalah
// utils/listeningStats.ts).
//
// ── Sumber data (verifikasi 2026-11-20) ──
// - Top artis / top lagu / jumlah putaran / hari aktif / streak:
//   tabel recent_plays (satu baris per lagu MULAI diputar) + songs.
//   Sudah terisi sejak lama — statistik ini langsung punya isi.
// - Jam didengarkan: tabel daily_listening (baru, lihat sqlite.ts).
//   TIDAK ADA data historis (recent_plays.play_duration selalu 0),
//   jadi jam baru terhitung sejak versi ini — layar menyampaikan itu
//   di catatan kaki, bukan mengarang estimasi dari durasi lagu.
//
// ── Aturan akumulasi detik (notePlaybackPosition) ──
// Dipanggil tiap tick watcher posisi (500 ms) dengan posisi playback
// saat ini. Yang diakumulasi adalah WALL-CLOCK antar tick (AUD-ST-1):
// delta posisi hanya dipakai sebagai GATE — 0 < delta ≤ 2 dtk berarti
// lagu memang sedang berjalan maju (bukan seek/skip/jeda). Menghitung
// dari delta posisi akan salah sebanding kecepatan putar (1,5x → +50%),
// karena di 1,5x posisi maju 0,75 dtk tiap tick 0,5 dtk, padahal hanya
// 0,5 dtk waktu nyata yang dilewati. Lompat maju (seek/skip) dan lompat
// mundur (seek/ulang) bukan detik yang didengarkan. Ganti lagu / jeda
// lama / seek tidak membuat detik ganda: delta negatif/tinggi diabaikan,
// posisi terakhir dicatat ulang. Bucket ditulis ke DB tiap ≥30 dtk
// terkumpul, saat pause (flushListenedSeconds), dan saat ganti trek —
// jadi kalau app dimatikan paksa, paling banyak ~30 dtk yang hilang.

import { db } from "@/shared/lib/sqlite";
import {
  computeStreak,
  dayKeyFromMs,
  EMPTY_STATS,
  rangeStartDayKey,
  rangeStartMs,
  type ListeningStats,
  type StatsRange,
  type TopArtist,
  type TopTrack,
} from "../utils/listeningStats";

// ── Akumulasi detik didengarkan ────────────────────────────────────────────

// Bucket berjalan (in-memory): detik yang sudah dilewati tapi belum
// ditulis ke daily_listening.
let _bucketDay: string | null = null;
let _bucketSeconds = 0;
// Posisi terakhir yang diamati watcher — untuk menghitung delta.
let _lastSongId: string | null = null;
let _lastPosition = 0;
// Wall-clock (epoch-ms) tick terakhir yang diamati — untuk menghitung
// detik nyata yang dilewati (AUD-ST-1). Diperbarui tiap tick dengan
// posisi valid, termasuk saat pause (posisi diam → delta 0 → tidak
// diakumulasi, dan jeda tidak ikut terhitung saat resume).
let _lastTickMs = 0;

const FLUSH_THRESHOLD_SECONDS = 30;
// Tick watcher 500 ms → delta posisi normal ≤ ~1 dtk (kecepatan 1,5x ≈
// 0,75 dtk; kecepatan 2x ≈ 1 dtk); 2 dtk memberi toleransi jeda tick
// tanpa memberi ruang seek. Batas yang sama dipakai untuk selisih
// wall-clock antar tick: tick yang tertunda karena JS kelaparan
// (gap > 2 dtk) tidak ikut dihitung penuh.
const MAX_COUNTED_DELTA_SECONDS = 2;

/** Tulis N detik (bulat ke bawah) ke hari yang bersangkutan. */
function addListenedSeconds(day: string, seconds: number): void {
  const whole = Math.floor(seconds);
  if (whole <= 0) return;
  try {
    db.execute(
      `INSERT OR IGNORE INTO daily_listening (day, seconds) VALUES (?, 0)`,
      [day],
    );
    db.execute(
      `UPDATE daily_listening SET seconds = seconds + ? WHERE day = ?`,
      [whole, day],
    );
  } catch (e) {
    console.warn("[Stats] gagal mencatat detik didengarkan:", e);
  }
}

/**
 * Catat posisi playback saat ini (dipanggil watcher 500 ms di
 * playerStore). Tidak pernah melempar — statistik tidak boleh
 * mengganggu playback.
 *
 * Akumulasi memakai WALL-CLOCK antar tick (AUD-ST-1), bukan delta
 * posisi — jadi kecepatan putar 1,5x/2x tetap tercatat sebagai waktu
 * nyata yang dilewati. Delta posisi hanya gate: 0 < delta ≤ 2 dtk
 * berarti lagu sedang berjalan maju.
 */
export function notePlaybackPosition(
  songId: string | null,
  positionSeconds: number,
): void {
  try {
    if (!songId || !(positionSeconds > 0)) {
      _lastSongId = songId;
      _lastPosition = 0;
      _lastTickMs = 0;
      return;
    }
    const nowMs = Date.now();
    const today = dayKeyFromMs(nowMs);
    if (_bucketDay !== null && _bucketDay !== today) {
      // Lewat tengah malam di tengah pemutaran: tutup hari lama dulu.
      flushListenedSeconds();
      _bucketSeconds = 0;
      _bucketDay = today;
    }
    if (_bucketDay === null) _bucketDay = today;

    if (_lastSongId !== songId) {
      // Lagu baru (atau sesi baru): jangan hitung lompatan posisi
      // dari lagu lama sebagai detik didengarkan.
      _lastSongId = songId;
      _lastPosition = positionSeconds;
      _lastTickMs = nowMs;
      return;
    }
    const delta = positionSeconds - _lastPosition;
    _lastPosition = positionSeconds;
    if (delta > 0 && delta <= MAX_COUNTED_DELTA_SECONDS) {
      // Posisi maju wajar → lagu sedang diputar: hitung waktu nyata
      // sejak tick sebelumnya (bukan delta posisi — lihat AUD-ST-1).
      const wallDelta = _lastTickMs > 0 ? (nowMs - _lastTickMs) / 1000 : 0;
      if (wallDelta > 0 && wallDelta <= MAX_COUNTED_DELTA_SECONDS) {
        _bucketSeconds += wallDelta;
        if (_bucketSeconds >= FLUSH_THRESHOLD_SECONDS) {
          flushListenedSeconds();
        }
      }
    }
    // Jangkar wall-clock diperbarui tiap tick valid — termasuk saat
    // pause (delta 0): jeda tidak ikut terhitung saat resume.
    _lastTickMs = nowMs;
  } catch (e) {
    console.warn("[Stats] notePlaybackPosition gagal:", e);
  }
}

/**
 * Tulis bucket berjalan ke daily_listening. Dipanggil saat pause dan
 * saat ganti trek (playerStore) — di luar itu notePlaybackPosition
 * sudah menulis sendiri tiap ≥30 dtk.
 */
export function flushListenedSeconds(): void {
  try {
    if (_bucketDay === null) return;
    const whole = Math.floor(_bucketSeconds);
    if (whole > 0) addListenedSeconds(_bucketDay, whole);
    _bucketSeconds -= whole;
    if (_bucketSeconds < 0) _bucketSeconds = 0;
  } catch (e) {
    console.warn("[Stats] flushListenedSeconds gagal:", e);
  }
}

// ── Query statistik ────────────────────────────────────────────────────────

type CountRow = { c: number };
type DayRow = { day: string };

function queryAll<T>(sql: string, params: (string | number)[]): T[] {
  try {
    const result = db.execute(sql, params);
    return (result.rows?._array ?? []) as T[];
  } catch (e) {
    console.warn("[Stats] query gagal:", e);
    return [];
  }
}

function queryCount(sql: string, params: (string | number)[]): number {
  const rows = queryAll<CountRow>(sql, params);
  return Number(rows[0]?.c) || 0;
}

/**
 * Hitung statistik untuk satu rentang. Sinkron (quick-sqlite sinkron,
 * pola yang sama dengan SongQueries) — dipanggil saat layar dibuka /
 * ganti rentang, bukan tiap render.
 */
export function getStats(
  range: StatsRange,
  nowMs: number = Date.now(),
): ListeningStats {
  const stats = EMPTY_STATS(range);
  const startMs = rangeStartMs(range, nowMs);
  const startDay = rangeStartDayKey(range, nowMs);

  stats.totalPlays = queryCount(
    `SELECT COUNT(*) AS c FROM recent_plays WHERE played_at >= ?`,
    [startMs],
  );
  stats.distinctTracks = queryCount(
    `SELECT COUNT(DISTINCT song_id) AS c FROM recent_plays WHERE played_at >= ?`,
    [startMs],
  );
  stats.distinctDays = queryCount(
    `SELECT COUNT(DISTINCT date(played_at / 1000, 'unixepoch', 'localtime')) AS c
     FROM recent_plays WHERE played_at >= ?`,
    [startMs],
  );

  // Jam didengarkan HANYA dari daily_listening (akumulasi baru).
  // Rentang "all" tanpa batas hari — query tanpa WHERE.
  stats.totalSeconds =
    startDay === null
      ? queryCount(
          `SELECT COALESCE(SUM(seconds), 0) AS c FROM daily_listening`,
          [],
        )
      : queryCount(
          `SELECT COALESCE(SUM(seconds), 0) AS c FROM daily_listening WHERE day >= ?`,
          [startDay],
        );

  stats.topArtists = queryAll<TopArtist>(
    `SELECT s.artist AS name, COUNT(*) AS plays
     FROM recent_plays rp
     JOIN songs s ON rp.song_id = s.id
     WHERE rp.played_at >= ?
       AND s.artist IS NOT NULL AND TRIM(s.artist) != ''
     GROUP BY s.artist
     ORDER BY plays DESC, name ASC
     LIMIT 5`,
    [startMs],
  ).map((r) => ({ name: r.name, plays: Number(r.plays) || 0 }));

  stats.topTracks = queryAll<TopTrack>(
    `SELECT s.id AS id, s.title AS title,
            COALESCE(s.artist, '') AS artist, COUNT(*) AS plays
     FROM recent_plays rp
     JOIN songs s ON rp.song_id = s.id
     WHERE rp.played_at >= ?
     GROUP BY rp.song_id
     ORDER BY plays DESC, MAX(rp.played_at) DESC
     LIMIT 5`,
    [startMs],
  ).map((r) => ({
    id: r.id,
    title: r.title ?? "Unknown Title",
    artist: r.artist ?? "",
    plays: Number(r.plays) || 0,
  }));

  // Streak tidak terikat rentang: hari aktif berurutan sampai hari ini
  // (atau kemarin bila hari ini belum ada putaran).
  const playedDays = queryAll<DayRow>(
    `SELECT DISTINCT date(played_at / 1000, 'unixepoch', 'localtime') AS day
     FROM recent_plays ORDER BY day DESC`,
    [],
  ).map((r) => r.day);
  stats.streakDays = computeStreak(playedDays, dayKeyFromMs(nowMs));

  return stats;
}
