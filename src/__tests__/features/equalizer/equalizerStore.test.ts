// src/__tests__/features/equalizer/equalizerStore.test.ts
//
// Fix G: throttle update store di setBandGain (leading + trailing, 100 ms).
// Store mengimpor react-native / AsyncStorage / modul native, jadi semuanya
// di-mock di sini — yang diuji hanya logika throttle store-nya. Native
// apply (J1-2) tidak berubah dan EQ dimatikan di test ini, jadi tidak ada
// panggilan native yang terlibat.

jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));

jest.mock("@/features/player/api/engine", () => ({ audioEngine: {} }));

jest.mock("@/features/equalizer/api/nativeInterface", () => ({
  __esModule: true,
  NativeDSPModule: {
    setFullEqualizer: jest.fn(async () => true),
    // N4: mock ketiga setter efek — applyAllEffectsToNative kini
    // memanggil keempatnya saat EQ dinyalakan / session berganti.
    setBassBoost: jest.fn(async () => true),
    setVirtualizer: jest.fn(async () => true),
    setReverbPreset: jest.fn(async () => true),
    // Master gain: sinkron (void) di native, bukan Promise.
    setMasterGain: jest.fn(() => undefined),
    releaseAllFX: jest.fn(async () => true),
    createAudioSession: jest.fn(async () => ({ sessionId: -1, isNew: false })),
  },
}));

// Muat ulang modul store per test supaya state throttle module-level
// (_eqStoreLastAt / timer / pending) selalu segar.
const loadStore = () => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@/features/equalizer/store/equalizerStore")
    .useEqualizerStore as typeof import("@/features/equalizer/store/equalizerStore").useEqualizerStore;
};

describe("setBandGain store throttle (Fix G)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const gainAt = (store: ReturnType<typeof loadStore>, i: number) =>
    store.getState().bands[i]?.gain;

  it("leading: tick pertama langsung masuk store", () => {
    const store = loadStore();
    store.getState().setBandGain(0, 5);
    expect(gainAt(store, 0)).toBe(5);
    expect(store.getState().activePresetId).toBe("custom");
  });

  it("tick cepat dalam satu jendela digabung: store tidak update sampai trailing flush, nilai terakhir yang menang", () => {
    const store = loadStore();
    store.getState().setBandGain(0, 1); // leading
    store.getState().setBandGain(0, 2);
    store.getState().setBandGain(0, 3);
    store.getState().setBandGain(0, 4);
    expect(gainAt(store, 0)).toBe(1); // belum update di tiap tick
    jest.advanceTimersByTime(99);
    expect(gainAt(store, 0)).toBe(1); // belum flush
    jest.advanceTimersByTime(1);
    expect(gainAt(store, 0)).toBe(4); // trailing: nilai terbaru
  });

  it("perubahan band berbeda dalam satu jendela sama-sama kebawa flush", () => {
    const store = loadStore();
    store.getState().setBandGain(0, 1); // leading
    store.getState().setBandGain(1, 7); // pending, band lain
    store.getState().setBandGain(0, 2); // pending, band sama
    jest.advanceTimersByTime(100);
    expect(gainAt(store, 0)).toBe(2);
    expect(gainAt(store, 1)).toBe(7);
  });

  it("clamp ±10 tetap berlaku pada nilai pending (trailing)", () => {
    const store = loadStore();
    store.getState().setBandGain(0, 0); // leading
    store.getState().setBandGain(0, 50);
    jest.advanceTimersByTime(100);
    expect(gainAt(store, 0)).toBe(10);
  });

  it("setelah jendela habis, tick berikutnya leading lagi", () => {
    const store = loadStore();
    store.getState().setBandGain(0, 1);
    store.getState().setBandGain(0, 2);
    jest.advanceTimersByTime(100); // flush -> 2
    expect(gainAt(store, 0)).toBe(2);
    jest.advanceTimersByTime(100); // jendela baru
    store.getState().setBandGain(0, 3);
    expect(gainAt(store, 0)).toBe(3); // langsung, tanpa tunggu timer
  });

  it("applyPreset membatalkan pending: flush basi tidak menimpa preset", () => {
    const store = loadStore();
    store.getState().setBandGain(0, 1); // leading
    store.getState().setBandGain(0, 9); // pending
    store.getState().applyPreset("flat");
    expect(gainAt(store, 0)).toBe(0);
    jest.advanceTimersByTime(500);
    expect(gainAt(store, 0)).toBe(0); // tetap flat, bukan 9
    expect(store.getState().activePresetId).toBe("flat");
  });
});

describe("N4 — applyAllEffectsToNative mengirim keempat efek", () => {
  const native = () =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@/features/equalizer/api/nativeInterface").NativeDSPModule as {
      setFullEqualizer: jest.Mock;
      setBassBoost: jest.Mock;
      setVirtualizer: jest.Mock;
      setReverbPreset: jest.Mock;
    };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("EQ dinyalakan lagi -> bass/widener/reverb ikut terkirim dengan nilai store", async () => {
    const store = loadStore();
    store.getState().setAudioSessionId(7);
    await store.getState().setBassBoost(500);
    await store.getState().setVirtualizer(300);
    await store.getState().setReverb(2);
    jest.clearAllMocks();

    await store.getState().setEQEnabled(true);

    const n = native();
    expect(n.setFullEqualizer).toHaveBeenCalledWith(
      expect.arrayContaining([0]),
      7,
    );
    expect(n.setBassBoost).toHaveBeenCalledWith(500, 7);
    expect(n.setVirtualizer).toHaveBeenCalledWith(300, 7);
    expect(n.setReverbPreset).toHaveBeenCalledWith(2, 7);
  });

  it("sakelar efek OFF -> efek itu dikirim 0, yang lain tetap nilainya", async () => {
    const store = loadStore();
    store.getState().setAudioSessionId(7);
    await store.getState().setBassBoost(500);
    await store.getState().setVirtualizer(300);
    await store.getState().setBassEnabled(false);
    jest.clearAllMocks();

    await store.getState().setEQEnabled(true);

    const n = native();
    expect(n.setBassBoost).toHaveBeenCalledWith(0, 7);
    expect(n.setVirtualizer).toHaveBeenCalledWith(300, 7);
  });

  it("satu efek gagal -> efek lain tetap terkirim", async () => {
    const store = loadStore();
    store.getState().setAudioSessionId(7);
    await store.getState().setBassBoost(500);
    await store.getState().setVirtualizer(300);
    const n = native();
    jest.clearAllMocks();
    n.setVirtualizer.mockRejectedValueOnce(new Error("bridge down"));

    await store.getState().setEQEnabled(true);

    expect(n.setFullEqualizer).toHaveBeenCalled();
    expect(n.setBassBoost).toHaveBeenCalledWith(500, 7);
    expect(n.setVirtualizer).toHaveBeenCalledWith(300, 7);
    expect(n.setReverbPreset).toHaveBeenCalled();
  });
});

describe("Master gain (2026-11-19) — store + native + log [DSP] Applied", () => {
  const native = () =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@/features/equalizer/api/nativeInterface").NativeDSPModule as {
      setMasterGain: jest.Mock;
      setReverbPreset: jest.Mock;
    };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("default 1.0 (netral)", () => {
    const store = loadStore();
    expect(store.getState().masterGain).toBe(1.0);
  });

  it("setMasterGain menyimpan + mendorong ke native saat EQ menyala", async () => {
    const store = loadStore();
    store.getState().setAudioSessionId(7);
    await store.getState().setEQEnabled(true);
    jest.clearAllMocks();

    await store.getState().setMasterGain(1.25);

    expect(store.getState().masterGain).toBe(1.25);
    expect(native().setMasterGain).toHaveBeenCalledWith(1.25);
  });

  it("clamp −12..+12 dB: 9 -> ~3.98, -1 -> ~0.251", async () => {
    const store = loadStore();
    store.getState().setAudioSessionId(7);
    await store.getState().setEQEnabled(true);

    await store.getState().setMasterGain(9);
    expect(store.getState().masterGain).toBeCloseTo(3.981, 3);
    expect(native().setMasterGain).toHaveBeenLastCalledWith(
      expect.closeTo(3.981, 3),
    );

    await store.getState().setMasterGain(-1);
    expect(store.getState().masterGain).toBeCloseTo(0.251, 3);
    expect(native().setMasterGain).toHaveBeenLastCalledWith(
      expect.closeTo(0.251, 3),
    );
  });

  it("EQ mati -> native tidak dipanggil, tapi state tetap disimpan", async () => {
    const store = loadStore();
    await store.getState().setMasterGain(1.2);
    expect(store.getState().masterGain).toBe(1.2);
    expect(native().setMasterGain).not.toHaveBeenCalled();
  });

  it("nyalakan EQ lagi -> gain ikut ter-restore + tercatat di log [DSP] Applied", async () => {
    const store = loadStore();
    store.getState().setAudioSessionId(7);
    await store.getState().setMasterGain(1.2);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    jest.clearAllMocks();

    await store.getState().setEQEnabled(true);

    expect(native().setMasterGain).toHaveBeenCalledWith(1.2);
    const applied = logSpy.mock.calls
      .map((c) => String(c[0]))
      .find((s) => s.includes("[DSP] Applied"));
    expect(applied).toContain("gain=1.20");
    logSpy.mockRestore();
  });

  it("resetToDefault mengembalikan gain ke 1.0", async () => {
    const store = loadStore();
    await store.getState().setMasterGain(0.5);
    await store.getState().resetToDefault();
    expect(store.getState().masterGain).toBe(1.0);
  });
});

describe("Master gain skala dB (2026-11-19) — preamp −12..+12 dB", () => {
  const helpers = () =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@/features/equalizer/store/equalizerStore") as {
      dbToGain: (db: number) => number;
      gainToDb: (gain: number) => number;
      formatMasterGainDb: (db: number) => string;
      clampMasterGainDb: (db: number) => number;
    };

  it("dbToGain: 0 dB = 1×, +12 dB ≈ 3.98×, −12 dB ≈ 0.251×", () => {
    const h = helpers();
    expect(h.dbToGain(0)).toBe(1);
    expect(h.dbToGain(12)).toBeCloseTo(3.981, 3);
    expect(h.dbToGain(-12)).toBeCloseTo(0.251, 3);
    expect(h.dbToGain(-6)).toBeCloseTo(0.501, 3);
  });

  it("gainToDb: 1× = 0 dB, 2× ≈ +6.02 dB, 0.5× ≈ −6.02 dB, 0 -> -Infinity", () => {
    const h = helpers();
    expect(h.gainToDb(1)).toBe(0);
    expect(h.gainToDb(2)).toBeCloseTo(6.021, 3);
    expect(h.gainToDb(0.5)).toBeCloseTo(-6.021, 3);
    expect(h.gainToDb(0)).toBe(-Infinity);
  });

  it("round-trip: dbToGain(gainToDb(x)) ≈ x dan sebaliknya", () => {
    const h = helpers();
    expect(h.dbToGain(h.gainToDb(1.5))).toBeCloseTo(1.5, 10);
    expect(h.gainToDb(h.dbToGain(-12))).toBeCloseTo(-12, 10);
    expect(h.gainToDb(h.dbToGain(3.52))).toBeCloseTo(3.52, 10);
  });

  it("clampMasterGainDb: 20 -> 12, -30 -> -12, NaN -> 0", () => {
    const h = helpers();
    expect(h.clampMasterGainDb(20)).toBe(12);
    expect(h.clampMasterGainDb(-30)).toBe(-12);
    expect(h.clampMasterGainDb(NaN)).toBe(0);
  });

  it("formatMasterGainDb: 0 -> '0 dB', 3.52 -> '+3.5 dB', -12 -> '−12 dB'", () => {
    const h = helpers();
    expect(h.formatMasterGainDb(0)).toBe("0 dB");
    expect(h.formatMasterGainDb(3.52)).toBe("+3.5 dB");
    expect(h.formatMasterGainDb(-12)).toBe("−12 dB");
    expect(h.formatMasterGainDb(12)).toBe("+12 dB");
    expect(h.formatMasterGainDb(0.04)).toBe("0 dB");
    expect(h.formatMasterGainDb(NaN)).toBe("0 dB");
  });

  it("migrate v2: nilai linear lama di-clamp (0 -> lantai −12 dB, 9 -> ~3.98, NaN -> 1.0)", () => {
    const store = loadStore();
    const migrate = store.persist.getOptions().migrate as (
      s: any,
      v: number,
    ) => any;

    expect(migrate({ masterGain: 0 }, 1).masterGain).toBeCloseTo(0.251, 3);
    expect(migrate({ masterGain: 1.5 }, 1).masterGain).toBe(1.5);
    expect(migrate({ masterGain: 9 }, 1).masterGain).toBeCloseTo(3.981, 3);
    expect(migrate({ masterGain: NaN }, 1).masterGain).toBe(1.0);
    expect(migrate({}, 1).masterGain).toBeUndefined();
  });
});
