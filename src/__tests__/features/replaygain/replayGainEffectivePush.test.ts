// src/__tests__/features/replaygain/replayGainEffectivePush.test.ts
//
// Integrasi ujung-ke-ujung (JS saja, tanpa device): perubahan state
// ReplayGain -> langganan di equalizerStore -> setMasterGain native
// dipanggil dengan gain EFEKTIF (user × RG). Mock mengikuti pola
// equalizerStore.test.ts (react-native / AsyncStorage / nativeInterface /
// hrtf+headphone store di-mock karena menarik spec TurboModule).

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

const mockSetMasterGain = jest.fn(async (_gain: number) => true);
jest.mock("@/features/equalizer/api/nativeInterface", () => ({
  __esModule: true,
  NativeDSPModule: {
    setFullEqualizer: jest.fn(async () => true),
    setBassBoost: jest.fn(async () => true),
    setVirtualizer: jest.fn(async () => true),
    setReverbPreset: jest.fn(async () => true),
    setHrtfEnabled: jest.fn(async () => true),
    setMasterGain: mockSetMasterGain,
    setEqEnabled: jest.fn(async () => true),
    releaseAllFX: jest.fn(async () => true),
    createAudioSession: jest.fn(async () => ({ sessionId: -1, isNew: false })),
  },
}));

jest.mock("@/features/hrtf/store/hrtfStore", () => ({
  __esModule: true,
  useHrtfStore: { getState: () => ({ isHrtfEnabled: false }) },
}));

jest.mock("@/features/headphone/store/headphoneStore", () => ({
  __esModule: true,
  useHeadphoneStore: { getState: () => ({ deactivate: jest.fn() }) },
}));

// Muat ulang kedua store per test supaya langganan + throttle segar.
const loadStores = () => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const eq = require("@/features/equalizer/store/equalizerStore") as typeof import(
    "@/features/equalizer/store/equalizerStore"
  );
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const rg = require("@/features/replaygain/store/replayGainStore") as typeof import(
    "@/features/replaygain/store/replayGainStore"
  );
  return { eqStore: eq.useEqualizerStore, rgStore: rg.useReplayGainStore };
};

const flush = async () => {
  // Dorongan master gain di-throttle 100 ms (leading + trailing):
  // beri waktu supaya trailing ikut terkirim sebelum assert.
  await new Promise((r) => setTimeout(r, 150));
};

describe("ReplayGain -> equalizerStore: gain efektif didorong ke native", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("tag lagu aktif -6 dB: setMasterGain dipanggil dengan 10^(-6/20)", async () => {
    const { eqStore, rgStore } = loadStores();
    eqStore.setState({ isEQEnabled: true, masterGain: 1.0 });
    mockSetMasterGain.mockClear();

    rgStore.getState().setReplayGainEnabled(true);
    rgStore.getState().setCurrentTags("s1", { trackGainDb: -6 });
    await flush();

    expect(mockSetMasterGain).toHaveBeenCalled();
    const last = mockSetMasterGain.mock.calls.at(-1)?.[0] as number;
    expect(last).toBeCloseTo(Math.pow(10, -6 / 20));
  });

  it("toggle OFF memulihkan gain user (1,0) tanpa restart", async () => {
    const { eqStore, rgStore } = loadStores();
    eqStore.setState({ isEQEnabled: true, masterGain: 1.0 });
    rgStore.getState().setReplayGainEnabled(true);
    rgStore.getState().setCurrentTags("s1", { trackGainDb: -6 });
    await flush();
    mockSetMasterGain.mockClear();

    rgStore.getState().setReplayGainEnabled(false);
    await flush();

    expect(mockSetMasterGain).toHaveBeenCalledWith(1.0);
  });

  it("mode album memakai album gain", async () => {
    const { eqStore, rgStore } = loadStores();
    eqStore.setState({ isEQEnabled: true, masterGain: 1.0 });
    rgStore.getState().setReplayGainEnabled(true);
    rgStore.getState().setReplayGainMode("album");
    rgStore
      .getState()
      .setCurrentTags("s1", { trackGainDb: -6, albumGainDb: -2 });
    await flush();

    const last = mockSetMasterGain.mock.calls.at(-1)?.[0] as number;
    expect(last).toBeCloseTo(Math.pow(10, -2 / 20));
  });

  it("EQ mati: tidak ada dorongan ke native", async () => {
    const { eqStore, rgStore } = loadStores();
    eqStore.setState({ isEQEnabled: false, masterGain: 1.0 });
    mockSetMasterGain.mockClear();

    rgStore.getState().setReplayGainEnabled(true);
    rgStore.getState().setCurrentTags("s1", { trackGainDb: -6 });
    await flush();

    expect(mockSetMasterGain).not.toHaveBeenCalled();
  });

  it("slider master gain tetap mengalikan RG (user 2,0 × RG -6 dB)", async () => {
    const { eqStore, rgStore } = loadStores();
    eqStore.setState({ isEQEnabled: true, masterGain: 1.0 });
    rgStore.getState().setReplayGainEnabled(true);
    rgStore.getState().setCurrentTags("s1", { trackGainDb: -6 });
    await flush();
    mockSetMasterGain.mockClear();

    await eqStore.getState().setMasterGain(2.0);
    await flush();

    const last = mockSetMasterGain.mock.calls.at(-1)?.[0] as number;
    expect(last).toBeCloseTo(2.0 * Math.pow(10, -6 / 20));
  });
});
