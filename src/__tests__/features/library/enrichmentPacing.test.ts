/**
 * enrichmentPacing — throttle worker enrichment (less aggressive).
 *
 * `waitWhilePlaying` murni (predikat + sinyal disuntik) supaya bisa
 * diuji dengan fake timer. Angka-angkanya didokumentasikan di
 * enrichmentPacing.ts (alasan + dampak), di sini dikunci supaya tidak
 * berubah diam-diam.
 */
import {
  ENRICHMENT_INTER_ITEM_DELAY_MS,
  ENRICHMENT_PLAYBACK_POLL_MS,
  waitWhilePlaying,
} from "../../../features/library/services/enrichmentPacing";

describe("angka throttle (dikunci)", () => {
  it("jeda antar item 1000ms — 3x lebih longgar dari 350ms lama", () => {
    expect(ENRICHMENT_INTER_ITEM_DELAY_MS).toBe(1000);
  });

  it("poll playback 2000ms", () => {
    expect(ENRICHMENT_PLAYBACK_POLL_MS).toBe(2000);
  });
});

describe("waitWhilePlaying", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("tidak putar -> langsung kembali tanpa menunggu", async () => {
    const promise = waitWhilePlaying(() => false);
    await expect(promise).resolves.toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
  });

  it("putar lalu jeda -> menunggu sampai predikat false, lalu kembali", async () => {
    let playing = true;
    const promise = waitWhilePlaying(() => playing);
    // Satu poll (2 dtk) berlalu selagi masih putar: belum kembali.
    await jest.advanceTimersByTimeAsync(ENRICHMENT_PLAYBACK_POLL_MS);
    let settled = false;
    void promise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    // Lagu dijeda -> poll berikutnya melihat false -> kembali.
    playing = false;
    await jest.advanceTimersByTimeAsync(ENRICHMENT_PLAYBACK_POLL_MS);
    await expect(promise).resolves.toBeUndefined();
  });

  it("abort saat putar -> kembali segera (tidak menunggu jeda)", async () => {
    const controller = new AbortController();
    const promise = waitWhilePlaying(() => true, controller.signal);
    controller.abort();
    await jest.advanceTimersByTimeAsync(ENRICHMENT_PLAYBACK_POLL_MS);
    await expect(promise).resolves.toBeUndefined();
  });

  it("poll kustom < 250ms dijepit ke minimum (tidak busy-loop)", async () => {
    let calls = 0;
    const isPlaying = () => {
      calls += 1;
      return calls < 3;
    };
    const promise = waitWhilePlaying(isPlaying, undefined, 0);
    // Dengan jepit 250ms: 2 poll × 250ms cukup untuk 3 panggilan.
    await jest.advanceTimersByTimeAsync(500);
    await expect(promise).resolves.toBeUndefined();
    expect(calls).toBe(3);
  });
});
