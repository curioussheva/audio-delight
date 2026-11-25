// Unit test dragState (DS-1): watchdog auto-reset flag drag.
//
// Modul murni tanpa impor — diuji langsung, state di-reset per test
// lewat jest.resetModules + require ulang.
const loadModule = () => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@/features/equalizer/api/dragState") as typeof import("@/features/equalizer/api/dragState");
};

describe("dragState", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("default tidak drag", () => {
    const m = loadModule();
    expect(m.isDragActive()).toBe(false);
  });

  it("setDragActive(true) -> true; false -> false", () => {
    const m = loadModule();
    m.setDragActive(true);
    expect(m.isDragActive()).toBe(true);
    m.setDragActive(false);
    expect(m.isDragActive()).toBe(false);
  });

  it("watchdog: flag reset sendiri sesudah 30 detik bila onFinalize tak sampai (DS-1)", () => {
    const m = loadModule();
    jest.useFakeTimers();
    m.setDragActive(true);
    expect(m.isDragActive()).toBe(true);
    jest.advanceTimersByTime(29_999);
    expect(m.isDragActive()).toBe(true);
    jest.advanceTimersByTime(1);
    expect(m.isDragActive()).toBe(false);
  });

  it("setDragActive(false) membatalkan watchdog", () => {
    const m = loadModule();
    jest.useFakeTimers();
    m.setDragActive(true);
    m.setDragActive(false);
    jest.advanceTimersByTime(60_000);
    expect(m.isDragActive()).toBe(false);
  });

  it("setDragActive(true) kedua mengulang timer dari awal", () => {
    const m = loadModule();
    jest.useFakeTimers();
    m.setDragActive(true);
    jest.advanceTimersByTime(20_000);
    m.setDragActive(true);
    jest.advanceTimersByTime(20_000);
    expect(m.isDragActive()).toBe(true);
    jest.advanceTimersByTime(10_000);
    expect(m.isDragActive()).toBe(false);
  });
});
