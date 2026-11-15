// src/__tests__/features/player/bitPerfectPath.test.ts
import {
  describeBitPerfectPath,
  type BitPerfectPathVerdict,
} from "@/features/player/api/bitPerfectPath";
import type { BitPerfectStatus } from "@/features/player/hooks/useBitPerfectStatus";

type StatusInput = Pick<
  BitPerfectStatus,
  | "requested"
  | "streamExclusive"
  | "isBitPerfect"
  | "exclusiveFailed"
  | "unavailable"
  | "stale"
>;

const base: StatusInput = {
  requested: true,
  streamExclusive: false,
  isBitPerfect: false,
  exclusiveFailed: false,
  unavailable: false,
  stale: false,
};

describe("describeBitPerfectPath", () => {
  it("requested + exclusive → Bit-Perfect aktif", () => {
    const verdict: BitPerfectPathVerdict = describeBitPerfectPath({
      ...base,
      streamExclusive: true,
      isBitPerfect: true,
    });
    expect(verdict.label).toBe("Bit-Perfect aktif — output murni");
    expect(verdict.tone).toBe("active");
  });

  it("requested + ditolak + native terbaca → fallback shared", () => {
    const verdict = describeBitPerfectPath({
      ...base,
      exclusiveFailed: true,
    });
    expect(verdict.label).toBe("Fallback shared");
    expect(verdict.tone).toBe("fallback");
    expect(verdict.note).toContain("tetap tanpa pemrosesan");
  });

  it("stale → bukan verdict live, hanya keadaan terakhir diketahui", () => {
    const exclusive = describeBitPerfectPath({
      ...base,
      streamExclusive: true,
      isBitPerfect: true,
      stale: true,
    });
    expect(exclusive.tone).toBe("stale");
    expect(exclusive.label).toBe("Exclusive (terakhir diketahui)");
    expect(exclusive.note).toContain("Diperbarui saat memutar");

    const shared = describeBitPerfectPath({
      ...base,
      exclusiveFailed: true,
      stale: true,
    });
    expect(shared.tone).toBe("stale");
    expect(shared.label).toBe("Shared (terakhir diketahui)");
    // Tidak boleh menuduh fallback saat verdict basi.
    expect(shared.label).not.toContain("Fallback");
  });

  it("unavailable → Native belum siap, mengalahkan stale", () => {
    const verdict = describeBitPerfectPath({
      ...base,
      unavailable: true,
      stale: true,
    });
    expect(verdict.label).toBe("Native belum siap");
    expect(verdict.tone).toBe("not-ready");
  });

  it("tidak diminta → idle", () => {
    const verdict = describeBitPerfectPath({ ...base, requested: false });
    expect(verdict.label).toBe("Bit-Perfect tidak dipilih");
    expect(verdict.tone).toBe("idle");
  });
});
