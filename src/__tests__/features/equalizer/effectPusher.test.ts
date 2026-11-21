// Tes effectPusher — throttle leading + trailing + fire-and-forget
// untuk nilai efek drag (logcat #9). Logika murni, tanpa native.
//
// Yang dites: leading langsung fire; tick cepat dalam satu jendela
// digabung ke SATU trailing fire dengan nilai TERBARU; fire-and-forget
// (push kembali sebelum send selesai; rejection send ditelan);
// cancelPending membuang trailing; commit jalan saat fire, bukan saat
// push dalam jendela.

import {
  createEffectPusher,
  type EffectPusher,
} from "@/features/equalizer/api/effectPusher";
import { getThrottleCounts, resetDragDiagState } from "@/features/equalizer/api/dragDiag";
import { setTempDiagEnabled } from "@/shared/utils/diagGate";

const THROTTLE_MS = 100;

describe("createEffectPusher", () => {
  let send: jest.Mock;
  let pusher: EffectPusher;

  beforeEach(() => {
    jest.useFakeTimers();
    resetDragDiagState();
    setTempDiagEnabled(true);
    send = jest.fn(() => {});
    pusher = createEffectPusher({
      throttleName: "widener",
      throttleMs: THROTTLE_MS,
      send,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    setTempDiagEnabled(false);
    resetDragDiagState();
  });

  it("leading: push pertama langsung fire (send + commit sinkron)", () => {
    const commit = jest.fn();
    pusher.push(300, 7, commit);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(300, 7);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(getThrottleCounts().widener.fired).toBe(1);
  });

  it("tick cepat dalam satu jendela digabung: satu trailing fire, nilai terbaru yang menang", () => {
    const commits: number[] = [];
    pusher.push(100, 7, () => commits.push(100)); // leading
    pusher.push(200, 7, () => commits.push(200)); // trailing
    pusher.push(300, 7, () => commits.push(300)); // dropped -> pending
    pusher.push(400, 7, () => commits.push(400)); // dropped -> pending
    expect(send).toHaveBeenCalledTimes(1); // baru leading
    expect(commits).toEqual([100]); // commit dalam jendela belum jalan
    jest.advanceTimersByTime(99);
    expect(send).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(400, 7); // nilai terbaru
    expect(commits).toEqual([100, 400]); // commit lama tidak jalan
    expect(getThrottleCounts().widener.trailing).toBe(1);
    expect(getThrottleCounts().widener.dropped).toBe(2);
  });

  it("trailing fire memakai sessionId terbaru", () => {
    pusher.push(100, 7);
    pusher.push(200, 8); // session berganti dalam jendela
    jest.advanceTimersByTime(100);
    expect(send).toHaveBeenLastCalledWith(200, 8);
  });

  it("sesudah jendela habis, push berikutnya leading lagi", () => {
    pusher.push(100, 7);
    jest.advanceTimersByTime(100);
    pusher.push(200, 7);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(200, 7);
  });

  it("fire-and-forget: push kembali sebelum send selesai, tanpa menunggu", async () => {
    let resolveSend!: (v: boolean) => void;
    send.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSend = resolve;
        }),
    );
    pusher.push(100, 7);
    expect(send).toHaveBeenCalledTimes(1);
    // Push kedua (leading sesudah jendela) TIDAK menunggu send pertama.
    jest.advanceTimersByTime(100);
    pusher.push(200, 7);
    expect(send).toHaveBeenCalledTimes(2);
    // Selesaikan yang pertama belakangan — tidak ada yang menggantung.
    resolveSend(true);
    await Promise.resolve();
  });

  it("rejection send ditelan pusher (tidak melempar, tidak unhandled)", async () => {
    send.mockRejectedValue(new Error("bridge down"));
    expect(() => pusher.push(100, 7)).not.toThrow();
    // Biarkan microtask rejection jalan — tanpa handler pun tidak boleh
    // jadi unhandled (pusher memasang .catch pengaman).
    await Promise.resolve();
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("send yang melempar sinkron ditelan pusher", () => {
    send.mockImplementation(() => {
      throw new Error("sync throw");
    });
    expect(() => pusher.push(100, 7)).not.toThrow();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("cancelPending membuang trailing: nilai drag basi tidak terkirim", () => {
    pusher.push(100, 7); // leading
    pusher.push(900, 7); // trailing terjadwal
    pusher.cancelPending();
    jest.advanceTimersByTime(500);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenLastCalledWith(100, 7);
  });

  it("gate diagnostik mati -> throttle tetap jalan, tanpa hitungan/log", () => {
    setTempDiagEnabled(false);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      pusher.push(100, 7);
      pusher.push(200, 7);
      jest.advanceTimersByTime(100);
      expect(send).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenLastCalledWith(200, 7);
      expect(getThrottleCounts().widener.fired).toBe(0);
      expect(logSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
    }
  });

  describe("flush() (Item 7) — nilai akhir drag terkirim saat release", () => {
    it("pending terkirim SEGERA saat flush, nilai terbaru yang menang", () => {
      const commits: number[] = [];
      pusher.push(100, 7, () => commits.push(100)); // leading
      pusher.push(200, 7, () => commits.push(200)); // trailing
      pusher.push(300, 7, () => commits.push(300)); // dropped -> pending
      expect(send).toHaveBeenCalledTimes(1);
      pusher.flush();
      expect(send).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenLastCalledWith(300, 7); // nilai terbaru
      expect(commits).toEqual([100, 300]); // commit lama tidak jalan
    });

    it("timer trailing sesudah flush tidak mengirim ulang nilai yang sama", () => {
      pusher.push(100, 7); // leading
      pusher.push(200, 7); // trailing terjadwal
      pusher.flush();
      expect(send).toHaveBeenCalledTimes(2);
      jest.advanceTimersByTime(500);
      expect(send).toHaveBeenCalledTimes(2); // tetap 2, bukan 3
    });

    it("flush dua kali berturut-turut: hanya satu kiriman (idempotent)", () => {
      pusher.push(100, 7); // leading
      pusher.push(200, 7); // trailing terjadwal
      pusher.flush();
      pusher.flush();
      expect(send).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenLastCalledWith(200, 7);
    });

    it("no-op bila tidak ada pending: sesudah leading saja, dan sebelum push apa pun", () => {
      pusher.flush(); // belum ada push — no-op, tidak melempar
      expect(send).toHaveBeenCalledTimes(0);
      pusher.push(100, 7); // leading, tidak ada trailing
      pusher.flush();
      expect(send).toHaveBeenCalledTimes(1); // tetap 1, bukan 2
      expect(send).toHaveBeenLastCalledWith(100, 7);
    });

    it("no-op sesudah trailing fire sudah jalan sendiri", () => {
      pusher.push(100, 7); // leading
      pusher.push(200, 7); // trailing terjadwal
      jest.advanceTimersByTime(100); // trailing fire jalan
      expect(send).toHaveBeenCalledTimes(2);
      pusher.flush();
      expect(send).toHaveBeenCalledTimes(2); // tetap 2
    });
  });
});
