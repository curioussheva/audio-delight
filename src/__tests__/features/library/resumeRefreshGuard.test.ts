/**
 * resumeRefreshGuard — J3-1: satu predikat penjaga untuk semua pemicu
 * refresh foreground (library.tsx + useScanManager.quickDiff).
 *
 * Logika murni, tanpa react-native — sesuai aturan jest proyek ini.
 */
import {
  MIN_BACKGROUND_MS,
  RESUME_SCAN_COOLDOWN_MS,
  shouldRunResumeRefresh,
} from "../../../features/library/services/resumeRefreshGuard";

describe("shouldRunResumeRefresh — penjaga resume J3-1", () => {
  const NOW = 1_000_000;

  it("jalan saat belum pernah background dan belum pernah refresh", () => {
    expect(
      shouldRunResumeRefresh({ backgroundedAt: 0, lastRunAt: 0, now: NOW }),
    ).toBe("ok");
  });

  it("tolak kalau baru 1 dtk di background (false positive audio focus)", () => {
    expect(
      shouldRunResumeRefresh({
        backgroundedAt: NOW - 1_000,
        lastRunAt: 0,
        now: NOW,
      }),
    ).toBe("background-too-short");
  });

  it("tepat 3 dtk di background: jalan (batas < 3 dtk yang ditolak)", () => {
    expect(
      shouldRunResumeRefresh({
        backgroundedAt: NOW - MIN_BACKGROUND_MS,
        lastRunAt: 0,
        now: NOW,
      }),
    ).toBe("ok");
  });

  it("1 ms sebelum 3 dtk: masih ditolak", () => {
    expect(
      shouldRunResumeRefresh({
        backgroundedAt: NOW - MIN_BACKGROUND_MS + 1,
        lastRunAt: 0,
        now: NOW,
      }),
    ).toBe("background-too-short");
  });

  it("tolak kalau refresh terakhir 30 dtk lalu (cooldown 60 dtk)", () => {
    expect(
      shouldRunResumeRefresh({
        backgroundedAt: NOW - 120_000,
        lastRunAt: NOW - 30_000,
        now: NOW,
      }),
    ).toBe("cooldown");
  });

  it("tepat 60 dtk sejak refresh terakhir: jalan", () => {
    expect(
      shouldRunResumeRefresh({
        backgroundedAt: NOW - 120_000,
        lastRunAt: NOW - RESUME_SCAN_COOLDOWN_MS,
        now: NOW,
      }),
    ).toBe("ok");
  });

  it("1 ms sebelum 60 dtk: masih ditolak", () => {
    expect(
      shouldRunResumeRefresh({
        backgroundedAt: NOW - 120_000,
        lastRunAt: NOW - RESUME_SCAN_COOLDOWN_MS + 1,
        now: NOW,
      }),
    ).toBe("cooldown");
  });

  it("alasan background didahulukan saat kedua penjaga gagal", () => {
    expect(
      shouldRunResumeRefresh({
        backgroundedAt: NOW - 1_000,
        lastRunAt: NOW - 1_000,
        now: NOW,
      }),
    ).toBe("background-too-short");
  });

  it("konstanta penjaga: cooldown 60 dtk, ambang background 3 dtk", () => {
    expect(RESUME_SCAN_COOLDOWN_MS).toBe(60_000);
    expect(MIN_BACKGROUND_MS).toBe(3_000);
  });
});
