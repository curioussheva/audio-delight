// src/__tests__/features/equalizer/eqSubscriptionNarrowing.test.ts
//
// Opsi 2 (log #16): penyempitan langganan layar EQ.
//
// Jest di repo ini hanya untuk logika murni (tanpa React Native), jadi
// render-count komponen TIDAK bisa diuji di sini — tidak ada
// @testing-library/react-native dan testMatch hanya `*.test.ts`.
// Yang diuji adalah properti yang membuat penyempitan itu bekerja:
// tiap setter store hanya mengubah potongan state-nya sendiri, dan
// referensi potongan lain tetap identik — sehingga selector per nilai /
// per seksi (yang dipakai komponen memo di equalizer.tsx) tidak
// membangunkan subscriber yang tidak berkepentingan.
//
// Emulasi langganan selector: `trackSlice` memakai `store.subscribe`
// (zustand v4: listener tiap set) + perbandingan Object.is pada hasil
// selector — sama seperti yang dilakukan `useSyncExternalStoreWithSelector`
// di balik `useStore(selector)` di React. `shallow` dari
// `zustand/shallow` membuktikan hal yang sama untuk objek seksi
// (beberapa field sekaligus, seperti yang dikembalikan hook
// `useEq*State` di useEqualizer.ts).
//
// Mock: sama seperti equalizerStore.test.ts — store mengimpor
// react-native / AsyncStorage / modul native.

import { shallow } from "zustand/shallow";
import { isDspDisabledForMode } from "@/features/equalizer/api/modeInfo";

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
    setBassBoost: jest.fn(async () => true),
    setVirtualizer: jest.fn(async () => true),
    setReverbPreset: jest.fn(async () => true),
    setHrtfEnabled: jest.fn(async () => true),
    setMasterGain: jest.fn(async () => true),
    setEqEnabled: jest.fn(async () => true),
    releaseAllFX: jest.fn(async () => true),
    createAudioSession: jest.fn(async () => ({ sessionId: -1, isNew: false })),
  },
}));

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

const mockHeadphone = { deactivate: jest.fn(async () => {}) };

const mockConvolverState = {
  isConvolverEnabled: false,
  ir: null as { name: string } | null,
  setConvolverEnabled: jest.fn(async (v: boolean) => {
    mockConvolverState.isConvolverEnabled = v;
  }),
  restoreToNative: jest.fn(async () => {}),
  preloadConvolverIr: jest.fn(async () => {}),
};

jest.mock("@/features/convolver/store/convolverStore", () => ({
  __esModule: true,
  useConvolverStore: {
    getState: () => mockConvolverState,
  },
}));

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

const mockGaplessState = {
  gaplessEnabled: true,
  setGaplessEnabled: jest.fn(async (v: boolean) => {
    mockGaplessState.gaplessEnabled = v;
  }),
  restoreToNative: jest.fn(async () => {}),
};

jest.mock("@/features/gapless/store/gaplessStore", () => ({
  __esModule: true,
  useGaplessStore: {
    getState: () => mockGaplessState,
  },
}));

jest.mock("@/features/headphone/store/headphoneStore", () => ({
  __esModule: true,
  useHeadphoneStore: {
    getState: () => mockHeadphone,
  },
}));

// Muat ulang modul store per test supaya state throttle module-level
// (_eqScalarLastAt / timer / pending) selalu segar.
const loadStore = () => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@/features/equalizer/store/equalizerStore")
    .useEqualizerStore as typeof import("@/features/equalizer/store/equalizerStore").useEqualizerStore;
};

type Store = ReturnType<typeof loadStore>;
type State = ReturnType<Store["getState"]>;

/**
 * Emulasi satu langganan selector: hitung berapa kali hasil selector
 * BERUBAH (Object.is) selama test. 0 = subscriber ini diam.
 */
const trackSlice = <T>(store: Store, select: (s: State) => T) => {
  let current = select(store.getState());
  let calls = 0;
  const unsub = store.subscribe((state: State) => {
    const next = select(state);
    if (!Object.is(next, current)) {
      current = next;
      calls += 1;
    }
  });
  return {
    get calls() {
      return calls;
    },
    unsub,
  };
};

describe("isDspDisabledForMode (gate DSP)", () => {
  it("dsp hidup, bit-perfect + immersive beku, tanpa mode tidak beku", () => {
    expect(isDspDisabledForMode("dsp")).toBe(false);
    expect(isDspDisabledForMode("bit-perfect")).toBe(true);
    expect(isDspDisabledForMode("immersive")).toBe(true);
    expect(isDspDisabledForMode(undefined)).toBe(false);
  });
});

describe("tick drag satu nilai hanya mengubah potongan itu", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("tick widener: hanya virtualizerLevel berubah — bands/bass/gain/preset diam", () => {
    const store = loadStore();
    const bandsBefore = store.getState().bands;
    const bands = trackSlice(store, (s) => s.bands);
    const bass = trackSlice(store, (s) => s.bassStrength);
    const gain = trackSlice(store, (s) => s.masterGain);
    const reverb = trackSlice(store, (s) => s.reverbPreset);
    const preset = trackSlice(store, (s) => s.activePresetId);
    const widener = trackSlice(store, (s) => s.virtualizerLevel);

    void store.getState().setVirtualizer(500);

    expect(store.getState().virtualizerLevel).toBe(500);
    expect(widener.calls).toBe(1);
    expect(bands.calls).toBe(0);
    expect(bass.calls).toBe(0);
    expect(gain.calls).toBe(0);
    expect(reverb.calls).toBe(0);
    expect(preset.calls).toBe(0);
    // Referensi bands tetap identik — subscriber bands tidak bangun.
    expect(store.getState().bands).toBe(bandsBefore);
  });

  it("tick band: hanya bands berubah — widener/bass/gain diam; preset sekali jadi custom lalu diam", () => {
    const store = loadStore();
    const bands = trackSlice(store, (s) => s.bands);
    const widener = trackSlice(store, (s) => s.virtualizerLevel);
    const bass = trackSlice(store, (s) => s.bassStrength);
    const gain = trackSlice(store, (s) => s.masterGain);
    const preset = trackSlice(store, (s) => s.activePresetId);

    store.getState().setBandGain(0, 5);

    expect(store.getState().bands[0]?.gain).toBe(5);
    expect(bands.calls).toBe(1);
    expect(widener.calls).toBe(0);
    expect(bass.calls).toBe(0);
    expect(gain.calls).toBe(0);
    // setBandGain menandai preset jadi "custom" — SATU kali, saat band
    // pertama kali diubah dari preset ("flat" -> "custom"). Tick band
    // berikutnya tidak mengubahnya lagi.
    expect(preset.calls).toBe(1);
    expect(store.getState().activePresetId).toBe("custom");
    jest.advanceTimersByTime(100);
    store.getState().setBandGain(0, 6);
    expect(bands.calls).toBe(2);
    expect(preset.calls).toBe(1);
  });

  it("tick bass: hanya bassStrength berubah — bands/widener diam", () => {
    const store = loadStore();
    const bass = trackSlice(store, (s) => s.bassStrength);
    const bands = trackSlice(store, (s) => s.bands);
    const widener = trackSlice(store, (s) => s.virtualizerLevel);

    void store.getState().setBassBoost(400);

    expect(store.getState().bassStrength).toBe(400);
    expect(bass.calls).toBe(1);
    expect(bands.calls).toBe(0);
    expect(widener.calls).toBe(0);
  });

  it("tick master gain: hanya masterGain berubah — bands/widener diam", () => {
    const store = loadStore();
    const gain = trackSlice(store, (s) => s.masterGain);
    const bands = trackSlice(store, (s) => s.bands);
    const widener = trackSlice(store, (s) => s.virtualizerLevel);

    void store.getState().setMasterGain(1.5);

    expect(store.getState().masterGain).toBe(1.5);
    expect(gain.calls).toBe(1);
    expect(bands.calls).toBe(0);
    expect(widener.calls).toBe(0);
  });
});

describe("objek seksi (shallow): hanya seksi yang nilainya berubah yang bangun", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Slice yang sama persis dengan yang dilanggan hook `useEq*State`.
  const graphSlice = (s: State) => ({
    bands: s.bands,
    isBassEnabled: s.isBassEnabled,
    bassStrength: s.bassStrength,
    masterGain: s.masterGain,
    isEQEnabled: s.isEQEnabled,
  });
  const presetSlice = (s: State) => ({
    activePresetId: s.activePresetId,
    customPresets: s.customPresets,
    isEQEnabled: s.isEQEnabled,
  });
  const effectsSlice = (s: State) => ({
    bassStrength: s.bassStrength,
    virtualizerLevel: s.virtualizerLevel,
    reverbPreset: s.reverbPreset,
    masterGain: s.masterGain,
    isBassEnabled: s.isBassEnabled,
    isVirtualizerEnabled: s.isVirtualizerEnabled,
    isReverbEnabled: s.isReverbEnabled,
    isEQEnabled: s.isEQEnabled,
  });
  const bandListSlice = (s: State) => ({
    bands: s.bands,
    isEQEnabled: s.isEQEnabled,
  });

  it("seksi grafik diam saat widener digeser, bangun saat band/bass berubah", () => {
    const store = loadStore();
    const beforeWidener = graphSlice(store.getState());
    void store.getState().setVirtualizer(500);
    expect(shallow(beforeWidener, graphSlice(store.getState()))).toBe(true);
    // Scalar throttle: tick kedua dalam jendela jadi pending — majukan
    // timer supaya nilai terbaru masuk store sebelum membandingkan.
    const beforeWidener2 = graphSlice(store.getState());
    void store.getState().setVirtualizer(700);
    jest.advanceTimersByTime(100);
    expect(shallow(beforeWidener2, graphSlice(store.getState()))).toBe(true);

    const beforeBand = graphSlice(store.getState());
    store.getState().setBandGain(0, 5);
    expect(shallow(beforeBand, graphSlice(store.getState()))).toBe(false);

    jest.advanceTimersByTime(100);
    const beforeBass = graphSlice(store.getState());
    void store.getState().setBassBoost(400);
    expect(shallow(beforeBass, graphSlice(store.getState()))).toBe(false);
  });

  it("seksi preset diam selama drag apa pun (widener, band, bass)", () => {
    const store = loadStore();
    // Satu tick band dulu supaya activePresetId sudah "custom" (setBandGain
    // menandai preset jadi custom sekali — itu perubahan yang benar, bukan
    // noise drag; yang diuji di sini adalah drag SESUDAH itu).
    store.getState().setBandGain(0, 1);
    jest.advanceTimersByTime(100);
    const before = presetSlice(store.getState());
    void store.getState().setVirtualizer(500);
    store.getState().setBandGain(0, 5);
    jest.advanceTimersByTime(100);
    void store.getState().setBassBoost(400);
    jest.advanceTimersByTime(100);
    expect(shallow(before, presetSlice(store.getState()))).toBe(true);
  });

  it("seksi efek diam saat band digeser, bangun saat widener digeser", () => {
    const store = loadStore();
    const before = effectsSlice(store.getState());
    store.getState().setBandGain(2, -3);
    expect(shallow(before, effectsSlice(store.getState()))).toBe(true);

    void store.getState().setVirtualizer(600);
    expect(shallow(before, effectsSlice(store.getState()))).toBe(false);
  });

  it("seksi band diam saat widener/bass digeser, bangun saat band digeser", () => {
    const store = loadStore();
    const before = bandListSlice(store.getState());
    void store.getState().setVirtualizer(500);
    jest.advanceTimersByTime(100);
    void store.getState().setBassBoost(400);
    jest.advanceTimersByTime(100);
    expect(shallow(before, bandListSlice(store.getState()))).toBe(true);

    store.getState().setBandGain(1, 4);
    expect(shallow(before, bandListSlice(store.getState()))).toBe(false);
  });

  it("applyPreset membangunkan preset + grafik + band (nilai berubah), bukan efek yang tak berubah", () => {
    const store = loadStore();
    const beforePreset = presetSlice(store.getState());
    const beforeGraph = graphSlice(store.getState());
    const beforeBand = bandListSlice(store.getState());
    store.getState().applyPreset("rock");
    expect(shallow(beforePreset, presetSlice(store.getState()))).toBe(false);
    expect(shallow(beforeGraph, graphSlice(store.getState()))).toBe(false);
    expect(shallow(beforeBand, bandListSlice(store.getState()))).toBe(false);
  });
});
