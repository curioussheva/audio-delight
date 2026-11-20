// Tes [EVENT-LAG] + [DIAG] mode-switch — diagnostik sementara (logcat #8).
// Yang dites: logika timing/agregasi/klasifikasi (murni, tanpa native).
// Modul tidak mengimpor react-native; gating lewat diagGate (diset eksplisit
// di tiap tes) supaya tidak bergantung pada `__DEV__` yang tidak ada di jest.

import {
  median,
  summarizeEventLags,
  noteNativeEventHandled,
  notePositionTick,
  notePositionTickSkipped,
  noteModeSwitch,
  getEventLagSamples,
  getPositionTickCounts,
  resetEventLagState,
} from "@/features/player/api/eventLag";
import {
  isTempDiagEnabled,
  setTempDiagEnabled,
} from "@/shared/utils/diagGate";

describe("diagGate", () => {
  it("default mati; setTempDiagEnabled menyalakan/mematikan", () => {
    setTempDiagEnabled(false);
    expect(isTempDiagEnabled()).toBe(false);
    setTempDiagEnabled(true);
    expect(isTempDiagEnabled()).toBe(true);
    setTempDiagEnabled(false);
    expect(isTempDiagEnabled()).toBe(false);
  });
});

describe("median", () => {
  it("kosong -> NaN", () => {
    expect(median([])).toBeNaN();
  });

  it("ganjil -> nilai tengah", () => {
    expect(median([30, 10, 20])).toBe(20);
  });

  it("genap -> rata-rata dua tengah", () => {
    expect(median([10, 20, 30, 40])).toBe(25);
  });
});

describe("summarizeEventLags", () => {
  it("kosong -> semua event null", () => {
    expect(summarizeEventLags([])).toEqual({
      "track-ended": null,
      "playback-state": null,
      "track-changed": null,
      "repeat-shuffle": null,
    });
  });

  it("menghitung per event", () => {
    const stats = summarizeEventLags([
      { event: "track-ended", ms: 10, at: 0 },
      { event: "track-ended", ms: 30, at: 0 },
      { event: "playback-state", ms: 5, at: 0 },
    ]);
    expect(stats["track-ended"]).toEqual({ count: 2, median: 20, max: 30 });
    expect(stats["playback-state"]).toEqual({ count: 1, median: 5, max: 5 });
    expect(stats["track-changed"]).toBeNull();
  });
});

describe("noteNativeEventHandled", () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    resetEventLagState();
    setTempDiagEnabled(true);
  });

  afterEach(() => {
    logSpy.mockRestore();
    setTempDiagEnabled(false);
    resetEventLagState();
  });

  it("gate mati -> tidak ada sampel, tidak ada log", () => {
    setTempDiagEnabled(false);
    noteNativeEventHandled("track-ended", 1000, 1500);
    expect(getEventLagSamples()).toEqual([]);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("mencatat sampel; <100ms tidak dilog langsung", () => {
    noteNativeEventHandled("track-ended", 1000, 1050);
    expect(getEventLagSamples()).toEqual([
      { event: "track-ended", ms: 50, at: 1050 },
    ]);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it(">=100ms dilog sebagai SLOW", () => {
    noteNativeEventHandled("playback-state", 1000, 1250);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[EVENT-LAG] event=playback-state handledLag=250ms"),
    );
  });

  it("ringkasan tiap 10 sampel", () => {
    for (let i = 0; i < 9; i++) {
      noteNativeEventHandled("track-ended", 0, 10);
    }
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("[EVENT-LAG] summary"),
    );
    noteNativeEventHandled("track-ended", 0, 10);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[EVENT-LAG] summary track-ended:"),
    );
  });
});

describe("notePositionTick", () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    resetEventLagState();
    setTempDiagEnabled(true);
  });

  afterEach(() => {
    logSpy.mockRestore();
    setTempDiagEnabled(false);
    resetEventLagState();
  });

  it("await=-1 dihitung gagal, bukan maxAwait", () => {
    notePositionTick(-1, 500);
    expect(getPositionTickCounts()).toEqual({ ticks: 1, skipped: 0, failed: 1 });
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("await >=100ms atau gap >=1000ms dilog langsung", () => {
    notePositionTick(150, 500);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[EVENT-LAG] position await=150ms gap=500ms"),
    );
    logSpy.mockClear();
    notePositionTick(10, 2500);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[EVENT-LAG] position await=10ms gap=2500ms"),
    );
  });

  it("ringkasan tiap 60 tick", () => {
    for (let i = 0; i < 59; i++) {
      notePositionTick(10, 500);
    }
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("[EVENT-LAG] position summary"),
    );
    notePositionTick(10, 500);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[EVENT-LAG] position summary ticks=60"),
    );
  });
});

describe("notePositionTickSkipped", () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    resetEventLagState();
    setTempDiagEnabled(true);
  });

  afterEach(() => {
    logSpy.mockRestore();
    setTempDiagEnabled(false);
    resetEventLagState();
  });

  it("dilog paling sekali per detik walau skip berkali-kali", () => {
    notePositionTickSkipped(0);
    notePositionTickSkipped(500);
    expect(logSpy).toHaveBeenCalledTimes(1);
    notePositionTickSkipped(1500);
    expect(logSpy).toHaveBeenCalledTimes(2);
    expect(getPositionTickCounts().skipped).toBe(3);
  });
});

describe("noteModeSwitch", () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    setTempDiagEnabled(true);
  });

  afterEach(() => {
    logSpy.mockRestore();
    setTempDiagEnabled(false);
  });

  it("satu baris from -> to + restartExpected", () => {
    noteModeSwitch("immersive", "dsp", false);
    expect(logSpy).toHaveBeenCalledWith(
      "[DIAG] mode-switch from=immersive to=dsp exclusiveToggled=false restartExpected=false",
    );
    noteModeSwitch("dsp", "bit-perfect", true);
    expect(logSpy).toHaveBeenCalledWith(
      "[DIAG] mode-switch from=dsp to=bit-perfect exclusiveToggled=true restartExpected=true",
    );
  });

  it("gate mati -> tidak ada log", () => {
    setTempDiagEnabled(false);
    noteModeSwitch("dsp", "bit-perfect", true);
    expect(logSpy).not.toHaveBeenCalled();
  });
});
