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
    // N4: mock keempat setter efek — applyAllEffectsToNative kini
    // memanggil kelimanya saat EQ dinyalakan / session berganti.
    setBassBoost: jest.fn(async () => true),
    setVirtualizer: jest.fn(async () => true),
    setReverbPreset: jest.fn(async () => true),
    // HRTF (2026-11-19): flag dari hrtfStore, dipulihkan di sini.
    setHrtfEnabled: jest.fn(async () => true),
    // Master gain: Promise<boolean> di native (P1-9, 2026-11-19).
    setMasterGain: jest.fn(async () => true),
    // Sakelar master native (P0, 2026-11-19).
    setEqEnabled: jest.fn(async () => true),
    releaseAllFX: jest.fn(async () => true),
    createAudioSession: jest.fn(async () => ({ sessionId: -1, isNew: false })),
  },
}));

// HRTF store di-mock: modul aslinya mengimpor spec TurboModule langsung
// (getEnforcing) yang tidak ada di bawah mock react-native test ini.
// Flag bisa diubah per test supaya N4 membuktikan pemulihan HRTF.
const mockHrtfState = {
  isHrtfEnabled: false,
  setHrtfEnabled: jest.fn(async (v: boolean) => {
    mockHrtfState.isHrtfEnabled = v;
  }),
};

jest.mock("@/features/hrtf/store/hrtfStore", () => ({
  __esModule: true,
  useHrtfStore: {
    getState: () => mockHrtfState,
  },
}));

// Koreksi headphone di-mock dengan alasan yang sama: headphoneStore
// mengimpor spec TurboModule langsung. resetToDefault memanggil
// deactivate() dari store ini.
const mockHeadphone = { deactivate: jest.fn(async () => {}) };

// Convolver di-mock dengan alasan yang sama: convolverStore mengimpor
// spec TurboModule langsung + DocumentPicker + FileSystem.
// restoreToNative dipanggil applyAllEffectsToNative; setConvolverEnabled
// dipanggil resetToDefault.
const mockConvolverState = {
  isConvolverEnabled: false,
  ir: null as { name: string } | null,
  setConvolverEnabled: jest.fn(async (v: boolean) => {
    mockConvolverState.isConvolverEnabled = v;
  }),
  restoreToNative: jest.fn(async () => {}),
  // (2026-11-20, fix logcat #9): separuh pertama restoreToNative —
  // muat IR tanpa toggle; dipakai jalur batch applyDspEffects.
  preloadConvolverIr: jest.fn(async () => {}),
};

jest.mock("@/features/convolver/store/convolverStore", () => ({
  __esModule: true,
  useConvolverStore: {
    getState: () => mockConvolverState,
  },
}));

// Crossfade di-mock dengan alasan yang sama: crossfadeStore mengimpor
// spec TurboModule langsung. restoreToNative dipanggil
// applyAllEffectsToNative + initialize.
const mockCrossfadeState = {
  crossfadeSeconds: 0,
  setCrossfadeSeconds: jest.fn(async (v: number) => {
    mockCrossfadeState.crossfadeSeconds = v;
  }),
  restoreToNative: jest.fn(async () => {}),
};

jest.mock("@/features/crossfade/store/crossfadeStore", () => ({
  __esModule: true,
  useCrossfadeStore: {
    getState: () => mockCrossfadeState,
  },
}));

jest.mock("@/features/headphone/store/headphoneStore", () => ({
  __esModule: true,
  useHeadphoneStore: {
    getState: () => mockHeadphone,
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

describe("N4 — applyAllEffectsToNative mengirim kelima efek", () => {
  const native = () =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@/features/equalizer/api/nativeInterface").NativeDSPModule as {
      setFullEqualizer: jest.Mock;
      setBassBoost: jest.Mock;
      setVirtualizer: jest.Mock;
      setReverbPreset: jest.Mock;
      setHrtfEnabled: jest.Mock;
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
    // HRTF default OFF -> dikirim false (bukan tidak dikirim).
    expect(n.setHrtfEnabled).toHaveBeenCalledWith(false, 7);
  });

  it("HRTF ON di store sendiri -> ikut terkirim true saat EQ dinyalakan", async () => {
    const store = loadStore();
    store.getState().setAudioSessionId(7);
    mockHrtfState.isHrtfEnabled = true;
    try {
      await store.getState().setEQEnabled(true);
      expect(native().setHrtfEnabled).toHaveBeenCalledWith(true, 7);
    } finally {
      mockHrtfState.isHrtfEnabled = false;
    }
  });

  it("convolver restore ikut terpanggil saat EQ dinyalakan (load IR + toggle)", async () => {
    const store = loadStore();
    store.getState().setAudioSessionId(7);
    jest.clearAllMocks();

    await store.getState().setEQEnabled(true);

    expect(mockConvolverState.restoreToNative).toHaveBeenCalled();
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

  it("Flat benar-benar netral: kurva rata + bass/widener/reverb ikut 0", async () => {
    const store = loadStore();
    store.getState().setAudioSessionId(7);
    await store.getState().setBassBoost(500);
    await store.getState().setVirtualizer(300);
    await store.getState().setReverb(2);
    await store.getState().setEQEnabled(true);
    jest.clearAllMocks();

    await store.getState().applyPreset("flat");

    const s = store.getState();
    expect(s.bands.every((b) => b.gain === 0)).toBe(true);
    expect(s.bassStrength).toBe(0);
    expect(s.virtualizerLevel).toBe(0);
    expect(s.reverbPreset).toBe(0);
    expect(s.activePresetId).toBe("flat");
    const n = native();
    expect(n.setBassBoost).toHaveBeenCalledWith(0, 7);
    expect(n.setVirtualizer).toHaveBeenCalledWith(0, 7);
    expect(n.setReverbPreset).toHaveBeenCalledWith(0, 7);
  });
});

describe("logcat #9 — batch applyDspEffects + fallback APK lama", () => {
  const native = () =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@/features/equalizer/api/nativeInterface").NativeDSPModule as unknown as Record<
      string,
      jest.Mock
    >;

  // Pasang metode batch di mock native SETELAH loadStore() — tiap
  // loadStore() me-reset modul dan membuat objek mock baru, jadi pasang
  // di beforeEach (objek lama) tidak akan terlihat store.
  const installBatch = (
    impl: (...args: unknown[]) => Promise<boolean> = async () => true,
  ) => {
    const mod = native();
    mod.applyDspEffects = jest.fn(impl);
    return mod.applyDspEffects;
  };

  it("batch dipakai bila tersedia: SATU panggilan, setter individual tidak dipanggil, IR di-preload", async () => {
    const store = loadStore();
    store.getState().setAudioSessionId(7);
    const batch = installBatch();
    await store.getState().setBassBoost(500);
    await store.getState().setVirtualizer(300);
    await store.getState().setReverb(2);
    jest.clearAllMocks();

    await store.getState().setEQEnabled(true);

    expect(batch).toHaveBeenCalledWith(
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      500,
      300,
      2,
      false,
      0,
      false,
      1,
      7,
    );
    const n = native();
    expect(n.setFullEqualizer).not.toHaveBeenCalled();
    expect(n.setBassBoost).not.toHaveBeenCalled();
    expect(n.setVirtualizer).not.toHaveBeenCalled();
    expect(n.setReverbPreset).not.toHaveBeenCalled();
    expect(n.setHrtfEnabled).not.toHaveBeenCalled();
    expect(n.setMasterGain).not.toHaveBeenCalled();
    // IR dimuat dulu (toggle ikut batch), restoreToNative TIDAK dipakai
    // jalur ini.
    expect(mockConvolverState.preloadConvolverIr).toHaveBeenCalled();
    expect(mockConvolverState.restoreToNative).not.toHaveBeenCalled();
  });

  it("fallback: metode batch tidak ada (APK lama) -> setter individual jalan seperti dulu", async () => {
    const store = loadStore();
    store.getState().setAudioSessionId(7);
    expect(
      (native() as Record<string, unknown>).applyDspEffects,
    ).toBeUndefined();
    await store.getState().setBassBoost(500);
    jest.clearAllMocks();

    await store.getState().setEQEnabled(true);

    const n = native();
    expect(n.setFullEqualizer).toHaveBeenCalledWith(
      expect.arrayContaining([0]),
      7,
    );
    expect(n.setBassBoost).toHaveBeenCalledWith(500, 7);
    expect(mockConvolverState.restoreToNative).toHaveBeenCalled();
  });

  it("fallback: batch melempar -> setter individual menerapkan nilai yang sama (idempotent)", async () => {
    const store = loadStore();
    store.getState().setAudioSessionId(7);
    const batch = installBatch(async () => {
      throw new Error("metode tidak ada di proxy");
    });
    await store.getState().setBassBoost(500);
    jest.clearAllMocks();

    await store.getState().setEQEnabled(true);

    expect(batch).toHaveBeenCalled();
    const n = native();
    expect(n.setFullEqualizer).toHaveBeenCalledWith(
      expect.arrayContaining([0]),
      7,
    );
    expect(n.setBassBoost).toHaveBeenCalledWith(500, 7);
  });

  it("batch resolve false (engine menolak) TIDAK di-fallback — setter individual tetap diam", async () => {
    const store = loadStore();
    store.getState().setAudioSessionId(7);
    const batch = installBatch(async () => false);
    jest.clearAllMocks();

    await store.getState().setEQEnabled(true);

    expect(batch).toHaveBeenCalled();
    const n = native();
    expect(n.setFullEqualizer).not.toHaveBeenCalled();
    expect(n.setBassBoost).not.toHaveBeenCalled();
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

    // Throttle native 100 ms (P1-9): tunggu jendela lewat supaya panggilan
    // kedua jadi leading lagi, bukan trailing yang tertunda.
    await new Promise((r) => setTimeout(r, 120));
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

describe("resetToDefault + penanda DSP Guard (clean-cozy 2026-11-19)", () => {
  const native = () =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@/features/equalizer/api/nativeInterface").NativeDSPModule as {
      setHrtfEnabled: jest.Mock;
    };

  beforeEach(() => {
    jest.clearAllMocks();
    mockHrtfState.isHrtfEnabled = false;
  });

  it("reset mematikan HRTF + menonaktifkan koreksi headphone", async () => {
    const store = loadStore();
    mockHrtfState.isHrtfEnabled = true;
    await store.getState().resetToDefault();

    expect(mockHrtfState.setHrtfEnabled).toHaveBeenCalledWith(false);
    expect(mockHrtfState.isHrtfEnabled).toBe(false);
    expect(mockHeadphone.deactivate).toHaveBeenCalled();
  });

  it("reset mematikan convolver (toggle OFF, IR tetap tersimpan)", async () => {
    const store = loadStore();
    mockConvolverState.isConvolverEnabled = true;
    mockConvolverState.ir = { name: "Hall.wav" };
    try {
      await store.getState().resetToDefault();

      expect(mockConvolverState.setConvolverEnabled).toHaveBeenCalledWith(
        false,
      );
      expect(mockConvolverState.isConvolverEnabled).toBe(false);
      expect(mockConvolverState.ir).toEqual({ name: "Hall.wav" });
    } finally {
      mockConvolverState.isConvolverEnabled = false;
      mockConvolverState.ir = null;
    }
  });

  it("reset saat EQ menyala -> native menerima hrtf=0 lewat apply", async () => {
    const store = loadStore();
    store.getState().setAudioSessionId(7);
    mockHrtfState.isHrtfEnabled = true;
    await store.getState().setEQEnabled(true);
    jest.clearAllMocks();

    await store.getState().resetToDefault();

    expect(native().setHrtfEnabled).toHaveBeenCalledWith(false, 7);
  });

  it("penanda eqEnabledBeforeBitPerfect default null, bisa di-set dan dihapus", () => {
    const store = loadStore();
    expect(store.getState().eqEnabledBeforeBitPerfect).toBeNull();
    store.getState().setEqEnabledBeforeBitPerfect(true);
    expect(store.getState().eqEnabledBeforeBitPerfect).toBe(true);
    store.getState().setEqEnabledBeforeBitPerfect(false);
    expect(store.getState().eqEnabledBeforeBitPerfect).toBe(false);
    store.getState().setEqEnabledBeforeBitPerfect(null);
    expect(store.getState().eqEnabledBeforeBitPerfect).toBeNull();
  });

  it("penanda DIPERSIST (preferensi tahan restart)", () => {
    const store = loadStore();
    const partialize = store.persist.getOptions().partialize as (
      s: any,
    ) => Record<string, unknown>;
    store.getState().setEqEnabledBeforeBitPerfect(true);
    expect(partialize(store.getState())).toHaveProperty(
      "eqEnabledBeforeBitPerfect",
      true,
    );
  });
});

describe("setEQEnabled mendorong flag P0 ke native (clean-cozy)", () => {
  const native = () =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@/features/equalizer/api/nativeInterface").NativeDSPModule as {
      setEqEnabled: jest.Mock;
      setFullEqualizer: jest.Mock;
      releaseAllFX: jest.Mock;
    };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("EQ ON -> setEqEnabled(true) lalu apply; EQ OFF -> setEqEnabled(false), tanpa releaseAllFX", async () => {
    const store = loadStore();
    store.getState().setAudioSessionId(7);

    await store.getState().setEQEnabled(true);
    const n = native();
    expect(n.setEqEnabled).toHaveBeenCalledWith(true, 7);
    expect(n.setFullEqualizer).toHaveBeenCalled();
    expect(n.releaseAllFX).not.toHaveBeenCalled();

    jest.clearAllMocks();
    await store.getState().setEQEnabled(false);
    expect(n.setEqEnabled).toHaveBeenCalledWith(false, 7);
    expect(n.releaseAllFX).not.toHaveBeenCalled();
  });
});

describe("setMasterGain throttle native (P1-9, clean-cozy)", () => {
  const native = () =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@/features/equalizer/api/nativeInterface").NativeDSPModule as {
      setMasterGain: jest.Mock;
    };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("tick pertama langsung ke native, tick dalam jendela digabung ke trailing dengan nilai terakhir", async () => {
    const store = loadStore();
    store.getState().setAudioSessionId(7);
    await store.getState().setEQEnabled(true);
    const n = native();
    jest.clearAllMocks();

    // Leading: state + native langsung.
    await store.getState().setMasterGain(1.2);
    expect(store.getState().masterGain).toBe(1.2);
    expect(n.setMasterGain).toHaveBeenCalledTimes(1);
    expect(n.setMasterGain).toHaveBeenCalledWith(1.2);

    // Dalam jendela: state langsung, native belum.
    await store.getState().setMasterGain(1.3);
    await store.getState().setMasterGain(1.4);
    expect(store.getState().masterGain).toBe(1.4);
    expect(n.setMasterGain).toHaveBeenCalledTimes(1);

    // Trailing flush: hanya nilai terakhir yang terkirim.
    await jest.advanceTimersByTimeAsync(100);
    expect(n.setMasterGain).toHaveBeenCalledTimes(2);
    expect(n.setMasterGain).toHaveBeenLastCalledWith(1.4);
  });

  it("EQ mati -> tidak ada dorongan native, state tetap tersimpan", async () => {
    const store = loadStore();
    await store.getState().setMasterGain(1.5);
    expect(store.getState().masterGain).toBe(1.5);
    expect(native().setMasterGain).not.toHaveBeenCalled();
  });
});

describe("logcat #9 — tiga setter drag: throttle + fire-and-forget", () => {
  const native = () =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@/features/equalizer/api/nativeInterface").NativeDSPModule as {
      setBassBoost: jest.Mock;
      setVirtualizer: jest.Mock;
      setReverbPreset: jest.Mock;
    };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const enableEq = async (store: ReturnType<typeof loadStore>) => {
    store.getState().setAudioSessionId(7);
    await store.getState().setEQEnabled(true);
    jest.clearAllMocks();
  };

  it("drag cepat: banyak tick -> leading + satu trailing, nilai terakhir yang terkirim", async () => {
    const store = loadStore();
    await enableEq(store);
    const n = native();

    await store.getState().setVirtualizer(100); // leading
    await store.getState().setVirtualizer(200); // trailing
    await store.getState().setVirtualizer(300); // dropped
    await store.getState().setVirtualizer(400); // dropped
    expect(n.setVirtualizer).toHaveBeenCalledTimes(1);
    expect(n.setVirtualizer).toHaveBeenLastCalledWith(100, 7);
    // Ronde 1: store set() masih langsung per tick.
    expect(store.getState().virtualizerLevel).toBe(400);

    await jest.advanceTimersByTimeAsync(100);
    expect(n.setVirtualizer).toHaveBeenCalledTimes(2);
    expect(n.setVirtualizer).toHaveBeenLastCalledWith(400, 7);
  });

  it("fire-and-forget: aksi kembali sebelum native resolve (tidak menggantung)", async () => {
    const store = loadStore();
    await enableEq(store);
    const n = native();
    // Native tidak pernah resolve — dulu: tiap tick await ini selamanya.
    n.setVirtualizer.mockImplementation(() => new Promise(() => {}));
    await store.getState().setVirtualizer(500);
    expect(n.setVirtualizer).toHaveBeenCalledWith(500, 7);
    expect(store.getState().virtualizerLevel).toBe(500);
  });

  it("reset membatalkan trailing: nilai drag basi tidak menimpa reset", async () => {
    const store = loadStore();
    await enableEq(store);
    const n = native();

    await store.getState().setVirtualizer(100); // leading
    await store.getState().setVirtualizer(900); // trailing terjadwal
    await store.getState().resetToDefault();
    await jest.advanceTimersByTimeAsync(500);

    // Leading 100 + apply reset 0 — trailing 900 TIDAK PERNAH terkirim.
    expect(n.setVirtualizer).not.toHaveBeenCalledWith(900, 7);
    expect(n.setVirtualizer).toHaveBeenLastCalledWith(0, 7);
    expect(store.getState().virtualizerLevel).toBe(0);
  });

  it("bass + reverb ikut pola yang sama (throttle per setter)", async () => {
    const store = loadStore();
    await enableEq(store);
    const n = native();

    await store.getState().setBassBoost(100);
    await store.getState().setBassBoost(900);
    await store.getState().setReverb(1);
    await store.getState().setReverb(6);
    expect(n.setBassBoost).toHaveBeenCalledTimes(1);
    expect(n.setReverbPreset).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(100);
    expect(n.setBassBoost).toHaveBeenLastCalledWith(900, 7);
    expect(n.setReverbPreset).toHaveBeenLastCalledWith(6, 7);
  });
});
