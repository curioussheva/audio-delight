/**
 * jsLagStats — JL-1 (Fase 0): sampler lag 100 ms + p50/p95/p99/max
 * per skenario, report via console.warn.
 *
 * Logika murni, tanpa react-native — sesuai aturan jest proyek ini.
 * Fake timer: Date.now di-mock berurutan supaya tiap tick 100 ms
 * menghasilkan lag 50 ms (now naik 150 ms per tick).
 */
import { startJsLagStats } from "../../../shared/utils/jsLagStats";

const g = globalThis as typeof globalThis & {
  __jsLagStats?: { timer: unknown; reportTimer: unknown };
};

describe("jsLagStats — JL-1", () => {
  let nowValues: number[];
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    nowValues = [1000];
    jest.spyOn(Date, "now").mockImplementation(() => nowValues.shift() ?? 1000);
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllTimers();
    delete g.__jsLagStats;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  /** Isi antrean Date.now untuk `ticks` tick @ lag 50 ms. */
  const feedTicks = (ticks: number) => {
    for (let i = 1; i <= ticks; i++) nowValues.push(1000 + i * 150);
  };

  it("melaporkan p50/p95/p99/max per skenario tiap interval", () => {
    feedTicks(25);
    startJsLagStats(() => "idle", 1000);
    jest.advanceTimersByTime(3500);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "[JSLagStats] idle n=20 p50=50 p95=50 p99=50 max=50 ms",
    );
  });

  it("mengelompokkan sampel per skenario", () => {
    let scenario = "idle";
    feedTicks(40);
    startJsLagStats(() => scenario, 1000);
    jest.advanceTimersByTime(2000);
    expect(warnSpy).toHaveBeenCalledWith(
      "[JSLagStats] idle n=20 p50=50 p95=50 p99=50 max=50 ms",
    );
    scenario = "play+drag";
    jest.advanceTimersByTime(2000);
    expect(warnSpy).toHaveBeenCalledWith(
      "[JSLagStats] play+drag n=20 p50=50 p95=50 p99=50 max=50 ms",
    );
  });

  it("panggilan kedua no-op (aman Fast Refresh)", () => {
    startJsLagStats(() => "idle", 1000);
    const first = g.__jsLagStats;
    startJsLagStats(() => "play", 1000);
    expect(g.__jsLagStats).toBe(first);
  });
});
