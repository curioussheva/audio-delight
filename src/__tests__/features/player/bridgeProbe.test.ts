// Tes [BRIDGE-PROBE] — diagnostik sementara (logcat #8).
// Yang dites: logika timing/agregasi/klasifikasi (murni, tanpa native).
// Panggilan native-nya diinjeksikan sebagai fake di tiap tes; modul probe
// sendiri tidak mengimpor apa pun dari react-native, jadi tidak perlu
// mock modul (aturan jest.config.cjs: tes hanya untuk logika murni).

import {
  median,
  summarizeSamples,
  classifyProbeContext,
  noteBridgeProbeApply,
  getBridgeProbeSamples,
  resetBridgeProbeState,
  startBridgeProbe,
  type BridgeProbeSample,
} from "@/features/player/api/bridgeProbe";

const makeSample = (
  ms: number,
  context: BridgeProbeSample["context"],
): BridgeProbeSample => ({ ms, context, at: 0 });

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

describe("summarizeSamples", () => {
  it("kosong -> semua konteks null", () => {
    expect(summarizeSamples([])).toEqual({
      idle: null,
      drag: null,
      apply: null,
    });
  });

  it("statistik per konteks terpisah", () => {
    const stats = summarizeSamples([
      makeSample(10, "idle"),
      makeSample(20, "idle"),
      makeSample(1000, "drag"),
      makeSample(4000, "apply"),
    ]);
    expect(stats.idle).toEqual({ count: 2, min: 10, median: 15, max: 20 });
    expect(stats.drag).toEqual({
      count: 1,
      min: 1000,
      median: 1000,
      max: 1000,
    });
    expect(stats.apply).toEqual({
      count: 1,
      min: 4000,
      median: 4000,
      max: 4000,
    });
  });
});

describe("classifyProbeContext", () => {
  it("belum pernah apply -> idle", () => {
    expect(classifyProbeContext(null, 5000)).toBe("idle");
  });

  it("apply < 1 dtk lalu -> drag", () => {
    expect(classifyProbeContext(4000, 4500)).toBe("drag");
  });

  it("apply > 1 dtk lalu -> idle", () => {
    expect(classifyProbeContext(4000, 5001)).toBe("idle");
  });
});

describe("noteBridgeProbeApply / buffer", () => {
  beforeEach(() => {
    resetBridgeProbeState();
  });

  it("satu apply = satu sampel konteks apply", () => {
    noteBridgeProbeApply(4550);
    const samples = getBridgeProbeSamples();
    expect(samples).toHaveLength(1);
    expect(samples[0].context).toBe("apply");
    expect(samples[0].ms).toBe(4550);
  });

  it("buffer dipangkas ke 120 sampel terakhir", () => {
    for (let i = 0; i < 130; i += 1) noteBridgeProbeApply(i);
    const samples = getBridgeProbeSamples();
    expect(samples).toHaveLength(120);
    expect(samples[0].ms).toBe(10);
    expect(samples[119].ms).toBe(129);
  });
});

describe("startBridgeProbe (sampler)", () => {
  let logSpy: jest.SpyInstance;
  let fakeNow: number;

  beforeEach(() => {
    jest.useFakeTimers();
    resetBridgeProbeState();
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    fakeNow = 100000;
  });

  afterEach(() => {
    jest.useRealTimers();
    logSpy.mockRestore();
    resetBridgeProbeState();
  });

  const startProbe = (overrides: Record<string, unknown> = {}) => {
    const callNative = jest.fn(async () => true);
    const createSession = jest.fn(async () => 80353);
    const probe = startBridgeProbe({
      getAudioMode: () => "dsp",
      getCrossfadeSeconds: () => 0,
      now: () => fakeNow,
      callNative,
      createSession,
      ...overrides,
    });
    return { probe, callNative, createSession };
  };

  const loggedLines = () =>
    logSpy.mock.calls.map((args) => String(args[0]));

  it("memanggil setter sekali/detik dengan nilai + session yang sama", async () => {
    const { probe, callNative, createSession } = startProbe();
    await jest.advanceTimersByTimeAsync(3000);
    probe.stop();
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(callNative).toHaveBeenCalledTimes(3);
    expect(callNative).toHaveBeenCalledWith(0, 80353);
  });

  it("meringkas tiap 10 sampel dengan konteks idle", async () => {
    const { probe } = startProbe();
    await jest.advanceTimersByTimeAsync(10000);
    probe.stop();
    const summary = loggedLines().find((l) =>
      l.startsWith("[BRIDGE-PROBE] summary"),
    );
    expect(summary).toBeDefined();
    expect(summary).toContain("idle:");
    expect(summary).toContain("n=10");
  });

  it("sampel ≥1 dtk langsung dilog sebagai SLOW", async () => {
    const callNative = jest.fn(async () => {
      fakeNow += 1500;
      return true;
    });
    const { probe } = startProbe({ callNative });
    await jest.advanceTimersByTimeAsync(1000);
    probe.stop();
    expect(
      loggedLines().some((l) =>
        l.startsWith("[BRIDGE-PROBE] SLOW round-trip=1500ms context=idle"),
      ),
    ).toBe(true);
  });

  it("tidak memanggil native di mode bit-perfect", async () => {
    const { probe, callNative } = startProbe({
      getAudioMode: () => "bit-perfect",
    });
    await jest.advanceTimersByTimeAsync(5000);
    probe.stop();
    expect(callNative).not.toHaveBeenCalled();
  });

  it("tidak mengantre panggilan baru saat tick sebelumnya masih jalan", async () => {
    let resolvePending: (() => void) | null = null;
    const callNative = jest.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolvePending = () => resolve(true);
        }),
    );
    const { probe } = startProbe({ callNative });
    await jest.advanceTimersByTimeAsync(1000);
    expect(callNative).toHaveBeenCalledTimes(1);
    // Dua tick berikutnya saat panggilan pertama masih menggantung: dilewati.
    await jest.advanceTimersByTimeAsync(2000);
    expect(callNative).toHaveBeenCalledTimes(1);
    resolvePending?.();
    await jest.advanceTimersByTimeAsync(1000);
    expect(callNative).toHaveBeenCalledTimes(2);
    probe.stop();
  });

  it("hasil false dihitung sebagai fail di ringkasan", async () => {
    const callNative = jest.fn(async () => false);
    const { probe } = startProbe({ callNative, summaryEverySamples: 3 });
    await jest.advanceTimersByTimeAsync(3000);
    probe.stop();
    const summary = loggedLines().find((l) =>
      l.startsWith("[BRIDGE-PROBE] summary"),
    );
    expect(summary).toContain("fail=3");
  });

  it("sampel sampler sesudah apply ditandai konteks drag", async () => {
    const callNative = jest.fn(async () => true);
    const createSession = jest.fn(async () => 80353);
    const probe = startBridgeProbe({
      getAudioMode: () => "dsp",
      getCrossfadeSeconds: () => 0,
      callNative,
      createSession,
    });
    noteBridgeProbeApply(4550);
    await jest.advanceTimersByTimeAsync(1000);
    probe.stop();
    const samplerSample = getBridgeProbeSamples().find(
      (s) => s.context === "drag",
    );
    expect(samplerSample).toBeDefined();
  });

  it("stop() menghentikan interval", async () => {
    const { probe, callNative } = startProbe();
    await jest.advanceTimersByTimeAsync(2000);
    probe.stop();
    const callsAtStop = callNative.mock.calls.length;
    await jest.advanceTimersByTimeAsync(5000);
    expect(callNative.mock.calls.length).toBe(callsAtStop);
  });
});
