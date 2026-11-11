/**
 * Unit test VisualizerService — multi-subscriber (2026-11-10).
 *
 * Service ini mengimpor react-native (AppState) dan spec TurboModule, jadi
 * kedua modul itu di-mock DI FILE INI SAJA (jest.mock lokal): AppState
 * palsu + bridge native palsu (startVisualizer resolve true, getFFTData
 * mengembalikan 128 bin 0.5). Mock tidak menyebar ke suite lain, dan
 * config Jest repo (logika murni, tanpa preset RN) tetap berlaku untuk
 * semua test lain.
 *
 * Yang diuji: fan-out ke semua subscriber, unsubscribe satu tidak
 * mematikan yang lain, subscriber terakhir pergi -> polling berhenti,
 * start() sebelum ada subscriber -> auto-start saat subscriber pertama
 * mendaftar, dan subscriber SharedValue ikut menerima data.
 */

jest.mock("react-native", () => ({
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  Platform: { OS: "android" },
}));

const FFT_DATA = new Array(128).fill(0.5);

const mockStartVisualizer = jest.fn(async () => true);
const mockStopVisualizer = jest.fn(() => {});
const mockGetFFTData = jest.fn(async () => [...FFT_DATA]);

jest.mock("../../../specs/NativeVisualizerBridge", () => ({
  __esModule: true,
  default: {
    startVisualizer: mockStartVisualizer,
    stopVisualizer: mockStopVisualizer,
    getFFTData: mockGetFFTData,
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  },
}));

import { visualizerService } from "../../../features/visualizer/services/VisualizerService";

describe("VisualizerService (multi-subscriber)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    visualizerService.destroy();
    jest.useRealTimers();
  });

  const frames = async (ms = 100) => {
    await jest.advanceTimersByTimeAsync(ms);
  };

  test("fan-out: dua callback sama-sama menerima data", async () => {
    const receivedA: number[][] = [];
    const receivedB: number[][] = [];
    visualizerService.setDataCallback((d) => receivedA.push(d), {
      pollingIntervalMs: 10,
    });
    visualizerService.setDataCallback((d) => receivedB.push(d), {
      pollingIntervalMs: 10,
    });

    const ok = await visualizerService.start(123);
    expect(ok).toBe(true);

    await frames(100);

    expect(receivedA.length).toBeGreaterThan(0);
    expect(receivedB.length).toBeGreaterThan(0);
    expect(receivedA[0]).toHaveLength(128);
    expect(receivedB[0]).toHaveLength(128);
    expect(visualizerService.getStatus().subscriberCount).toBe(2);
  });

  test("unsubscribe satu callback, yang lain tetap menerima data", async () => {
    const receivedA: number[][] = [];
    const receivedB: number[][] = [];
    const unsubA = visualizerService.setDataCallback(
      (d) => receivedA.push(d),
      { pollingIntervalMs: 10 },
    );
    visualizerService.setDataCallback((d) => receivedB.push(d), {
      pollingIntervalMs: 10,
    });

    await visualizerService.start(123);
    await frames(50);

    expect(receivedA.length).toBeGreaterThan(0);
    expect(receivedB.length).toBeGreaterThan(0);

    const countA = receivedA.length;
    const countB = receivedB.length;
    unsubA();

    expect(visualizerService.getStatus().subscriberCount).toBe(1);
    expect(visualizerService.getStatus().isStarted).toBe(true);

    await frames(50);

    expect(receivedA.length).toBe(countA);
    expect(receivedB.length).toBeGreaterThan(countB);
  });

  test("subscriber terakhir pergi -> polling berhenti", async () => {
    const unsub = visualizerService.setDataCallback(() => {}, {
      pollingIntervalMs: 10,
    });

    await visualizerService.start(123);
    await frames(50);

    const callsAfterStart = mockGetFFTData.mock.calls.length;
    expect(callsAfterStart).toBeGreaterThan(0);

    unsub();

    expect(visualizerService.getStatus().isStarted).toBe(false);
    expect(mockStopVisualizer).toHaveBeenCalled();

    await frames(100);

    expect(mockGetFFTData.mock.calls.length).toBe(callsAfterStart);
  });

  test("start() sebelum ada subscriber -> auto-start saat subscriber pertama mendaftar", async () => {
    const ok = await visualizerService.start(123);
    expect(ok).toBe(false); // belum ada subscriber, sesi di-queue

    const received: number[][] = [];
    visualizerService.setDataCallback((d) => received.push(d), {
      pollingIntervalMs: 10,
    });

    await frames(100);

    expect(received.length).toBeGreaterThan(0);
    expect(visualizerService.getStatus().isStarted).toBe(true);
  });

  test("subscriber SharedValue ikut menerima data", async () => {
    const sv = { value: [] as number[] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visualizerService.initialize(sv as any, { pollingIntervalMs: 10 });

    await visualizerService.start(123);
    await frames(100);

    expect(sv.value).toHaveLength(128);
    expect(visualizerService.getStatus().subscriberCount).toBe(1);
  });

  // U-P2-27: kanal error — dulu private onError tanpa setter, tidak ada
  // yang pernah membaca kegagalan polling. Sekarang setOnError aditif.
  test("setOnError: kegagalan polling pertama dilaporkan sekali saja", async () => {
    mockGetFFTData.mockImplementation(async () => {
      throw new Error("native gagal");
    });
    const errors: unknown[] = [];
    const errors2: unknown[] = [];
    visualizerService.setOnError((e) => errors.push(e));
    visualizerService.setOnError((e) => errors2.push(e));
    visualizerService.setDataCallback(() => {}, { pollingIntervalMs: 10 });

    await visualizerService.start(123);
    await frames(100); // ~10 kegagalan berturut-turut

    expect(errors).toHaveLength(1);
    expect(errors2).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
  });

  test("setOnError: unsubscribe menghentikan pemberitahuan", async () => {
    mockGetFFTData.mockImplementation(async () => {
      throw new Error("native gagal");
    });
    const errors: unknown[] = [];
    const unsub = visualizerService.setOnError((e) => errors.push(e));
    unsub();
    visualizerService.setDataCallback(() => {}, { pollingIntervalMs: 10 });

    await visualizerService.start(123);
    await frames(100);

    expect(errors).toHaveLength(0);
  });
});
