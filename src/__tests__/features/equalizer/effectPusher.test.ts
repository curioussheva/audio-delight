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
import { setDragActive } from "@/features/equalizer/api/dragState";
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
    setDragActive(false);
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

  describe("coalescing in-flight (opsi 3, log #15) — maks 1 in-flight + 1 tertahan, selama drag", () => {
    // Janji send yang bisa di-resolve / di-reject manual, untuk
    // mensimulasikan native yang resolve-nya tertahan (thread JS
    // kelaparan) atau gagal.
    let resolveSend!: (v: boolean) => void;
    let rejectSend!: (e: unknown) => void;
    const pendingSend = () =>
      new Promise<boolean>((resolve, reject) => {
        resolveSend = resolve;
        rejectSend = reject;
      });

    it("drag aktif + send belum resolve: tick berikut tidak kirim, nilai terbaru yang menang saat resolve", async () => {
      send.mockImplementation(pendingSend);
      setDragActive(true);
      const commits: number[] = [];
      pusher.push(100, 7, () => commits.push(100)); // leading, in-flight
      expect(send).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(100); // jendela habis
      pusher.push(200, 7, () => commits.push(200)); // ditahan
      pusher.push(300, 7, () => commits.push(300)); // ditahan, menimpa 200
      expect(send).toHaveBeenCalledTimes(1); // tetap 1 — tidak ada yang dikirim
      expect(commits).toEqual([100]); // commit nilai tertahan belum jalan
      expect(getThrottleCounts().widener.dropped).toBe(2);

      resolveSend(true); // janji pertama selesai
      await Promise.resolve();
      await Promise.resolve();
      expect(send).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenLastCalledWith(300, 7); // nilai terbaru
      expect(commits).toEqual([100, 300]); // commit 200 tidak jalan
    });

    it("nilai tertahan dari trailing timer ikut terkirim saat resolve", async () => {
      send.mockImplementation(pendingSend);
      setDragActive(true);
      pusher.push(100, 7); // leading, in-flight
      pusher.push(200, 7); // trailing terjadwal
      jest.advanceTimersByTime(100); // trailing fire -> ditahan (in-flight)
      expect(send).toHaveBeenCalledTimes(1);
      resolveSend(true);
      await Promise.resolve();
      await Promise.resolve();
      expect(send).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenLastCalledWith(200, 7);
    });

    it("flush saat drag masih aktif + ada nilai tertahan: no-op, nilai akhir mendarat sekali saat resolve", async () => {
      send.mockImplementation(pendingSend);
      setDragActive(true);
      pusher.push(100, 7); // leading, in-flight
      jest.advanceTimersByTime(100);
      pusher.push(300, 7); // ditahan
      pusher.flush(); // timer sudah habis -> no-op
      expect(send).toHaveBeenCalledTimes(1);
      resolveSend(true);
      await Promise.resolve();
      await Promise.resolve();
      expect(send).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenLastCalledWith(300, 7);
      jest.advanceTimersByTime(500);
      expect(send).toHaveBeenCalledTimes(2); // tidak ada kiriman ganda
    });

    it("flush sesudah drag selesai (urutan onFinalize): nilai akhir langsung terkirim walau ada in-flight", async () => {
      send.mockImplementation(pendingSend);
      setDragActive(true);
      pusher.push(100, 7); // leading, in-flight
      pusher.push(200, 7); // trailing terjadwal
      // onFinalize: drag off DULU, baru onDragEnd (flush).
      setDragActive(false);
      pusher.flush();
      expect(send).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenLastCalledWith(200, 7);
      // Janji pertama selesai belakangan — tidak ada kiriman susulan.
      resolveSend(true);
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(500);
      expect(send).toHaveBeenCalledTimes(2);
    });

    it("di luar drag: push kembali sebelum send selesai tetap kirim (perilaku lama)", async () => {
      // Drag TIDAK aktif — gating tidak berlaku.
      send.mockImplementation(pendingSend);
      pusher.push(100, 7);
      expect(send).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(100);
      pusher.push(200, 7);
      expect(send).toHaveBeenCalledTimes(2); // langsung kirim, tidak ditahan
      expect(send).toHaveBeenLastCalledWith(200, 7);
      resolveSend(true);
      await Promise.resolve();
      await Promise.resolve();
    });

    it("cancelPending membuang nilai tertahan juga", async () => {
      send.mockImplementation(pendingSend);
      setDragActive(true);
      pusher.push(100, 7); // leading, in-flight
      jest.advanceTimersByTime(100);
      pusher.push(300, 7); // ditahan
      pusher.cancelPending();
      resolveSend(true);
      await Promise.resolve();
      await Promise.resolve();
      expect(send).toHaveBeenCalledTimes(1); // 300 tidak pernah terkirim
      expect(send).toHaveBeenLastCalledWith(100, 7);
    });

    it("send pertama reject: nilai tertahan tetap terkirim sesudahnya", async () => {
      send.mockImplementation(pendingSend);
      setDragActive(true);
      pusher.push(100, 7); // leading, in-flight
      jest.advanceTimersByTime(100);
      pusher.push(300, 7); // ditahan
      // Janji pertama reject — settle jalan di cabang rejection juga.
      rejectSend(new Error("bridge down"));
      await Promise.resolve();
      await Promise.resolve();
      expect(send).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenLastCalledWith(300, 7);
    });
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
