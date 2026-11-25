// Unit test pushDsp + dspSession (EQ-17).
//
// Kedua modul murni tanpa impor (tanpa store/spec/react-native), jadi
// diuji langsung tanpa mock. State modul di-reset per test lewat
// jest.resetModules + require ulang — pola yang sama dengan
// crossfadeStore.test.ts.
const loadModules = () => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dspSession = require("@/features/equalizer/api/dspSession") as typeof import("@/features/equalizer/api/dspSession");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { pushDsp } = require("@/features/equalizer/api/pushDsp") as typeof import("@/features/equalizer/api/pushDsp");
  return { dspSession, pushDsp };
};

describe("dspSession", () => {
  it("default -1 (engine belum siap)", () => {
    const { dspSession } = loadModules();
    expect(dspSession.getDspSessionId()).toBe(-1);
  });

  it("setDspSessionId(-1) tidak menimpa token valid", () => {
    const { dspSession } = loadModules();
    dspSession.setDspSessionId(7);
    dspSession.setDspSessionId(-1);
    expect(dspSession.getDspSessionId()).toBe(7);
  });

  it("waitForDspSession langsung resolve bila token sudah ada", async () => {
    const { dspSession } = loadModules();
    dspSession.setDspSessionId(7);
    await expect(dspSession.waitForDspSession()).resolves.toBe(7);
  });
});

describe("pushDsp", () => {
  it("token sudah ada -> fn dipanggil dengan token, hasil diteruskan", async () => {
    const { dspSession, pushDsp } = loadModules();
    dspSession.setDspSessionId(7);
    const fn = jest.fn(async (sid: number) => sid * 2);
    await expect(pushDsp("Tes", fn)).resolves.toBe(14);
    expect(fn).toHaveBeenCalledWith(7);
  });

  it("token belum ada -> push menunggu, mendarat begitu token diterbitkan", async () => {
    const { dspSession, pushDsp } = loadModules();
    const fn = jest.fn(async (sid: number) => `sesi-${sid}`);
    const done = pushDsp("Tes", fn);
    expect(fn).not.toHaveBeenCalled();
    // Terbitkan sedikit kemudian (masih jauh di bawah batas 10 detik).
    setTimeout(() => dspSession.setDspSessionId(7), 10);
    await expect(done).resolves.toBe("sesi-7");
    expect(fn).toHaveBeenCalledWith(7);
  });

  it("token tak kunjung datang -> lewati sesudah 10 detik, fn tidak dipanggil, tanpa throw", async () => {
    const { pushDsp } = loadModules();
    jest.useFakeTimers();
    try {
      const fn = jest.fn(async () => "tidak boleh jalan");
      const done = pushDsp("Tes", fn);
      await jest.advanceTimersByTimeAsync(10_000);
      await expect(done).resolves.toBeUndefined();
      expect(fn).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("fn melempar -> undefined, tanpa throw ke pemanggil", async () => {
    const { dspSession, pushDsp } = loadModules();
    dspSession.setDspSessionId(7);
    const fn = jest.fn(async () => {
      throw new Error("bridge belum siap");
    });
    await expect(pushDsp("Tes", fn)).resolves.toBeUndefined();
  });
});
