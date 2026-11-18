/**
 * refreshCoalescer — Fase 4: refresh foreground berulang tidak boleh
 * menjalankan pekerjaan yang sama dua kali bersamaan.
 * Logika murni, tanpa react-native.
 */
import { createRefreshCoalescer } from "../../../features/library/services/refreshCoalescer";

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("createRefreshCoalescer", () => {
  it("panggilan kedua saat pekerjaan jalan: task TIDAK dipanggil lagi, promise sama dibagikan", async () => {
    const c = createRefreshCoalescer();
    let calls = 0;
    const d = deferred<boolean>();
    const task = jest.fn(() => {
      calls += 1;
      return d.promise;
    });
    const p1 = c.run(task);
    const p2 = c.run(task);
    expect(calls).toBe(1);
    expect(p2).toBe(p1);
    expect(c.isRunning).toBe(true);
    d.resolve(true);
    await expect(p1).resolves.toBe(true);
    await expect(p2).resolves.toBe(true);
    expect(c.isRunning).toBe(false);
  });

  it("setelah pekerjaan selesai, panggilan berikutnya jalan lagi", async () => {
    const c = createRefreshCoalescer();
    let calls = 0;
    const task = jest.fn(async () => {
      calls += 1;
      return calls;
    });
    await expect(c.run(task)).resolves.toBe(1);
    await expect(c.run(task)).resolves.toBe(2);
    expect(calls).toBe(2);
  });

  it("penolakan diteruskan ke semua penunggu dan slot dibersihkan", async () => {
    const c = createRefreshCoalescer();
    let calls = 0;
    const err = new Error("gagal");
    const failing = jest.fn(async () => {
      calls += 1;
      throw err;
    });
    const p1 = c.run(failing);
    const p2 = c.run(failing);
    expect(calls).toBe(1);
    await expect(p1).rejects.toBe(err);
    await expect(p2).rejects.toBe(err);
    expect(c.isRunning).toBe(false);
    // Panggilan berikutnya boleh jalan lagi (bukan terkunci selamanya).
    const ok = jest.fn(async () => true);
    await expect(c.run(ok)).resolves.toBe(true);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it("task sync-throw: tidak mengunci slot", async () => {
    const c = createRefreshCoalescer();
    const throwing = jest.fn(() => {
      throw new Error("sync");
    });
    await expect(c.run(throwing as never)).rejects.toThrow("sync");
    expect(c.isRunning).toBe(false);
  });
});
