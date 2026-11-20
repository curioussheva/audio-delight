/**
 * Statistik mendengarkan — logika murni (streak, rentang, format, teks bagikan).
 */
import {
  buildShareText,
  computeStreak,
  dayKeyFromMs,
  EMPTY_STATS,
  formatListeningDuration,
  prevDayKey,
  rangeStartDayKey,
  rangeStartMs,
  STATS_RANGES,
  type ListeningStats,
} from "@/features/stats/utils/listeningStats";

// 2026-11-20 12:00 WIB lokal sebagai "sekarang" yang tetap — semua
// harapan tanggal dihitung dari titik ini supaya tes tidak bergantung
// pada jam jalan.
const NOW = new Date(2026, 10, 20, 12, 0, 0).getTime(); // 20 Nov 2026

describe("STATS_RANGES", () => {
  it("ada tepat 3 rentang, 30 hari yang pertama (default)", () => {
    expect(STATS_RANGES).toEqual(["30d", "year", "all"]);
  });
});

describe("dayKeyFromMs / prevDayKey", () => {
  it("kunci hari memakai waktu lokal, format YYYY-MM-DD", () => {
    expect(dayKeyFromMs(NOW)).toBe("2026-11-20");
    expect(dayKeyFromMs(new Date(2026, 0, 5, 23, 59).getTime())).toBe(
      "2026-01-05",
    );
  });

  it("prevDayKey mundur satu hari, tembus batas bulan & tahun", () => {
    expect(prevDayKey("2026-11-20")).toBe("2026-11-19");
    expect(prevDayKey("2026-11-01")).toBe("2026-10-31");
    expect(prevDayKey("2026-01-01")).toBe("2025-12-31");
    // 2026 bukan tahun kabisat: 1 Mar mundur ke 28 Feb.
    expect(prevDayKey("2026-03-01")).toBe("2026-02-28");
  });
});

describe("rangeStartMs", () => {
  it("30d: awal hari 29 hari lalu (hari ini + 29 hari = 30 hari)", () => {
    const start = rangeStartMs("30d", NOW);
    expect(dayKeyFromMs(start)).toBe("2026-10-22");
    expect(new Date(start).getHours()).toBe(0);
  });

  it("year: 1 Januari tahun berjalan 00:00", () => {
    const start = rangeStartMs("year", NOW);
    expect(dayKeyFromMs(start)).toBe("2026-01-01");
    expect(new Date(start).getHours()).toBe(0);
  });

  it("all: 0 (tanpa batas)", () => {
    expect(rangeStartMs("all", NOW)).toBe(0);
  });
});

describe("rangeStartDayKey", () => {
  it("30d/year mengembalikan kunci hari awal, all null", () => {
    expect(rangeStartDayKey("30d", NOW)).toBe("2026-10-22");
    expect(rangeStartDayKey("year", NOW)).toBe("2026-01-01");
    expect(rangeStartDayKey("all", NOW)).toBeNull();
  });
});

describe("computeStreak", () => {
  const today = "2026-11-20";

  it("hari ini + 2 hari sebelumnya berurutan = 3", () => {
    expect(
      computeStreak(["2026-11-20", "2026-11-19", "2026-11-18"], today),
    ).toBe(3);
  });

  it("hari ini kosong, kemarin + lusa ada = 2 (streak belum putus)", () => {
    expect(computeStreak(["2026-11-19", "2026-11-18"], today)).toBe(2);
  });

  it("kemarin kosong = 0 walau hari ini ada", () => {
    expect(computeStreak(["2026-11-20", "2026-11-18"], today)).toBe(1);
  });

  it("tidak ada hari aktif sama sekali = 0", () => {
    expect(computeStreak([], today)).toBe(0);
  });

  it("hari ini saja = 1", () => {
    expect(computeStreak(["2026-11-20"], today)).toBe(1);
  });

  it("duplikat dan urutan acak tidak berpengaruh", () => {
    expect(
      computeStreak(
        ["2026-11-18", "2026-11-20", "2026-11-19", "2026-11-19"],
        today,
      ),
    ).toBe(3);
  });

  it("bolong di tengah memotong streak (bukan dijumlah)", () => {
    expect(
      computeStreak(
        ["2026-11-20", "2026-11-19", "2026-11-17", "2026-11-16"],
        today,
      ),
    ).toBe(2);
  });

  it("kemarin + hari ini kosong = 0 walau minggu lalu beruntun", () => {
    expect(
      computeStreak(["2026-11-17", "2026-11-16", "2026-11-15"], today),
    ).toBe(0);
  });
});

describe("formatListeningDuration", () => {
  it("detik, menit, jam — jam total tanpa diubah ke hari", () => {
    expect(formatListeningDuration(0)).toBe("0 dtk");
    expect(formatListeningDuration(45)).toBe("45 dtk");
    expect(formatListeningDuration(59)).toBe("59 dtk");
    expect(formatListeningDuration(60)).toBe("1 mnt");
    expect(formatListeningDuration(90)).toBe("1 mnt");
    expect(formatListeningDuration(3599)).toBe("59 mnt");
    expect(formatListeningDuration(3600)).toBe("1 j");
    expect(formatListeningDuration(3600 + 60 * 15)).toBe("1 j 15 mnt");
    expect(formatListeningDuration(3600 * 120 + 60 * 5)).toBe("120 j 5 mnt");
  });

  it("nilai negatif / NaN dijaga ke 0", () => {
    expect(formatListeningDuration(-30)).toBe("0 dtk");
    expect(formatListeningDuration(NaN)).toBe("0 dtk");
  });
});

describe("buildShareText", () => {
  const stats: ListeningStats = {
    ...EMPTY_STATS("30d"),
    totalPlays: 248,
    distinctTracks: 96,
    distinctDays: 21,
    totalSeconds: 12 * 3600 + 34 * 60,
    streakDays: 7,
    topArtists: [
      { name: "Artis A", plays: 42 },
      { name: "Artis B", plays: 30 },
    ],
    topTracks: [{ id: "t1", title: "Lagu Satu", artist: "Artis A", plays: 18 }],
  };

  it("memuat angka ringkasan + top artis/lagu + label rentang", () => {
    const text = buildShareText(stats, "30 Hari");
    expect(text).toContain("30 Hari");
    expect(text).toContain("12 j 34 mnt");
    expect(text).toContain("248x diputar");
    expect(text).toContain("96 lagu berbeda");
    expect(text).toContain("Streak 7 hari");
    expect(text).toContain("1. Artis A — 42x");
    expect(text).toContain("2. Artis B — 30x");
    expect(text).toContain("1. Lagu Satu — Artis A (18x)");
    expect(text).toContain("#PristineAudio");
  });

  it("statistik kosong: tidak ada seksi top, tetap berbagi angka nol", () => {
    const text = buildShareText(EMPTY_STATS("year"), "Tahun Ini");
    expect(text).toContain("Tahun Ini");
    expect(text).toContain("0 dtk");
    expect(text).not.toContain("Artis Teratas");
    expect(text).not.toContain("Lagu Teratas");
  });
});
