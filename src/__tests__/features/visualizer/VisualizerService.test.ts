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

const FFT_DATA = Array.from({ length: 128 }, () => 0.5);

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
import { setDragActive } from "../../../features/equalizer/api/dragState";

describe("VisualizerService (multi-subscriber)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    visualizerService.destroy();
    // Item 2: flag drag module-level — jangan bocor ke test berikut.
    setDragActive(false);
    jest.useRealTimers();
  });

  const frames = async (ms = 100) => {
    await jest.advanceTimersByTimeAsync(ms);
  };

  // E1 (2026-11-19, lag visualizer): default polling 50 ms (dulu 100).
  // HARUS jadi test pertama di file — subscribe dengan config di test lain
  // mengubah config singleton (merge), jadi default hanya terlihat sebelum
  // ada yang meng-override. Tanpa config, 100 ms = 2 tick (t=50, t=100).
  // ITEM 4 (2026-11-21): data mock konstan 0.5 — tick ke-2 dilewati
  // fan-out-nya (tidak berubah dalam epsilon), jadi yang mengukur
  // interval polling adalah getFFTData (2×), bukan callback (1×).
  test("default polling interval 50 ms (E1)", async () => {
    const received: number[][] = [];
    visualizerService.setDataCallback((d) => received.push(d));

    const ok = await visualizerService.start(123);
    expect(ok).toBe(true);

    await frames(100);

    expect(mockGetFFTData.mock.calls.length).toBe(2);
    expect(received.length).toBe(1);
  });

  // ITEM 4 (2026-11-21): fan-out dilewati bila data tidak berubah,
  // jalan lagi begitu data berubah. Mock mengembalikan 0.5 konstan:
  // smoothed = 0.5 persis sejak tick pertama, jadi hanya tick pertama
  // yang sampai ke callback walau polling tetap jalan tiap 10 ms;
  // begitu mock berubah ke 0.9, fan-out jalan lagi.
  test("fan-out dilewati bila data tidak berubah, jalan lagi bila berubah", async () => {
    const received: number[][] = [];
    visualizerService.setDataCallback((d) => received.push(d), {
      pollingIntervalMs: 10,
    });

    const ok = await visualizerService.start(123);
    expect(ok).toBe(true);

    await frames(100);

    expect(mockGetFFTData.mock.calls.length).toBeGreaterThanOrEqual(5);
    expect(received.length).toBe(1);
    expect(received[0][0]).toBe(0.5);

    mockGetFFTData.mockImplementation(async () =>
      Array.from({ length: 128 }, () => 0.9),
    );
    await frames(50);

    expect(received.length).toBeGreaterThan(1);
    expect(received[received.length - 1][0]).toBeGreaterThan(0.5);

    // Kembalikan mock ke data kanonik — mockImplementation tidak
    // di-reset clearAllMocks di beforeEach, jangan bocor ke test berikut.
    mockGetFFTData.mockImplementation(async () => [...FFT_DATA]);
  });

  // Item 2 (2026-11-21): poll melambat saat drag aktif — 50 ms -> 100 ms
  // efektif (lewati tiap tick genap; spektrum tetap jalan 10 Hz, bukan
  // beku), kembali penuh sesudah drag selesai. Interval 10 ms di sini:
  // 100 ms drag = 10 tick -> ~5 poll (bukan ~10); 50 ms sesudah drag ->
  // ~5 poll lagi. Rentang, bukan angka eksak — satu tick bisa bergeser
  // oleh resolusi async getFFTData.
  test("poll melambat saat drag aktif, kembali penuh sesudah drag", async () => {
    visualizerService.setDataCallback(() => {}, {
      pollingIntervalMs: 10,
    });

    const ok = await visualizerService.start(123);
    expect(ok).toBe(true);

    await frames(50);
    const baseline = mockGetFFTData.mock.calls.length;
    expect(baseline).toBeGreaterThanOrEqual(4);

    setDragActive(true);
    await frames(100);
    const duringDrag = mockGetFFTData.mock.calls.length - baseline;
    expect(duringDrag).toBeGreaterThanOrEqual(4);
    expect(duringDrag).toBeLessThanOrEqual(6);

    setDragActive(false);
    await frames(50);
    const afterDrag =
      mockGetFFTData.mock.calls.length - baseline - duringDrag;
    expect(afterDrag).toBeGreaterThanOrEqual(4);
  });

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
    // ITEM 4 (2026-11-21): data mock default konstan 0.5 — fan-out
    // tick ke-2 dst. dilewati (tidak berubah), jadi test ini butuh data
    // yang BERUBAH tiap tick (0.5/0.6 bergantian) supaya callback
    // yang tersisa benar-benar menerima data baru sesudah unsubscribe.
    let toggle = false;
    mockGetFFTData.mockImplementation(async () => {
      toggle = !toggle;
      return Array.from({ length: 128 }, () => (toggle ? 0.5 : 0.6));
    });
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

    // Kembalikan mock ke data kanonik (lihat test ITEM 4 di atas).
    mockGetFFTData.mockImplementation(async () => [...FFT_DATA]);
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
