// Tes [DRAG-DIAG] — diagnostik sementara (logcat #8).
// Yang dites: hitungan throttle, overlap setter, ringkasan (murni, tanpa native).

import {
  median,
  noteThrottleTick,
  noteSetterStart,
  noteSetterEnd,
  getThrottleCounts,
  getSetterState,
  resetDragDiagState,
} from "@/features/equalizer/api/dragDiag";
import { setTempDiagEnabled } from "@/shared/utils/diagGate";

describe("median", () => {
  it("kosong -> NaN; genap -> rata-rata dua tengah", () => {
    expect(median([])).toBeNaN();
    expect(median([10, 20, 30, 40])).toBe(25);
  });
});

describe("noteThrottleTick", () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    resetDragDiagState();
    setTempDiagEnabled(true);
  });

  afterEach(() => {
    logSpy.mockRestore();
    setTempDiagEnabled(false);
    resetDragDiagState();
  });

  it("gate mati -> tidak ada hitungan, tidak ada log", () => {
    setTempDiagEnabled(false);
    noteThrottleTick("bands", "dropped", 0);
    expect(getThrottleCounts().bands.dropped).toBe(0);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("menghitung per outcome; ringkasan paling sekali per detik per nama", () => {
    // nowMs=0: lastSummaryAt=0, selisih 0 < 1000 -> belum ada ringkasan.
    noteThrottleTick("bands", "fired", 0);
    noteThrottleTick("bands", "dropped", 0);
    noteThrottleTick("bands", "dropped", 0);
    expect(logSpy).not.toHaveBeenCalled();
    expect(getThrottleCounts().bands).toEqual({
      fired: 1,
      trailing: 0,
      dropped: 2,
      skipped: 0,
    });
    // nowMs=1500: selisih >= 1000 -> ringkasan muncul sekali.
    noteThrottleTick("bands", "dropped", 1500);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      "[DRAG-DIAG] throttle=bands fired=1 trailing=0 dropped=3 skipped=0",
    );
    // nowMs=2000: selisih 500 < 1000 -> belum ringkasan lagi.
    noteThrottleTick("bands", "fired", 2000);
    expect(logSpy).toHaveBeenCalledTimes(1);
    // nowMs=2600: selisih 1100 >= 1000 -> ringkasan kedua (kumulatif).
    noteThrottleTick("bands", "fired", 2600);
    expect(logSpy).toHaveBeenCalledTimes(2);
    expect(logSpy).toHaveBeenLastCalledWith(
      "[DRAG-DIAG] throttle=bands fired=3 trailing=0 dropped=3 skipped=0",
    );
  });

  it("throttle berbeda diringkas terpisah", () => {
    noteThrottleTick("gain", "trailing", 2000);
    expect(logSpy).toHaveBeenCalledWith(
      "[DRAG-DIAG] throttle=gain fired=0 trailing=1 dropped=0 skipped=0",
    );
    expect(getThrottleCounts().bands.trailing).toBe(0);
  });
});

describe("noteSetterStart / noteSetterEnd", () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    resetDragDiagState();
    setTempDiagEnabled(true);
  });

  afterEach(() => {
    logSpy.mockRestore();
    setTempDiagEnabled(false);
    resetDragDiagState();
  });

  it("gate mati -> handle tidak aktif, end jadi no-op", () => {
    setTempDiagEnabled(false);
    const h = noteSetterStart("setVirtualizer", 0);
    expect(h.active).toBe(false);
    noteSetterEnd(h, 5000);
    expect(getSetterState().inFlight.setVirtualizer).toBe(0);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("in-flight dihitung; start kedua saat masih in-flight = overlap", () => {
    const h1 = noteSetterStart("setVirtualizer", 0);
    expect(getSetterState().inFlight.setVirtualizer).toBe(1);
    const h2 = noteSetterStart("setVirtualizer", 100);
    expect(getSetterState().inFlight.setVirtualizer).toBe(2);
    expect(getSetterState().overlaps.setVirtualizer).toBe(1);
    // Baris overlap dilog sekali (throttle 1/detik): start pertama di
    // nowMs=100 -> selisih dari 0 < 1000? lastOverlapLogAt awal 0, jadi
    // 100-0 < 1000 -> BELUM dilog. Start ketiga di 1500 -> dilog.
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("overlap"),
    );
    const h3 = noteSetterStart("setVirtualizer", 1500);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "[DRAG-DIAG] setter=setVirtualizer overlap depth=3 overlaps=2",
      ),
    );
    noteSetterEnd(h1, 1600);
    noteSetterEnd(h2, 1600);
    noteSetterEnd(h3, 1600);
    expect(getSetterState().inFlight.setVirtualizer).toBe(0);
  });

  it("round-trip >=1000ms dilog SLOW", () => {
    const h = noteSetterStart("setBassBoost", 0);
    noteSetterEnd(h, 1200);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "[DRAG-DIAG] setter=setBassBoost SLOW roundTrip=1200ms inFlight=0",
      ),
    );
  });

  it("ringkasan tiap 10 panggilan selesai", () => {
    for (let i = 0; i < 9; i++) {
      const h = noteSetterStart("setReverb", i * 10);
      noteSetterEnd(h, i * 10 + 50);
    }
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("[DRAG-DIAG] setters summary"),
    );
    const h = noteSetterStart("setReverb", 100);
    noteSetterEnd(h, 150);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "[DRAG-DIAG] setters summary setReverb: n=10 med=50ms max=50ms overlaps=0",
      ),
    );
  });
});
