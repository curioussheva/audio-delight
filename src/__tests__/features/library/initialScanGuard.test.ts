/**
 * shouldRunInitialScan — S1: kapan initial quickscan boleh jalan.
 * Logika murni, tanpa dependensi React Native.
 */
import {
  shouldRunInitialScan,
  type InitialScanState,
} from "../../../features/library/services/initialScanGuard";

describe("shouldRunInitialScan — S1", () => {
  const base: InitialScanState = {
    trackCount: 0,
    hasCompletedInitialScan: false,
    isManualScanning: false,
    isAutoScanning: false,
  };

  it("library kosong + belum pernah scan + idle -> jalan", () => {
    expect(shouldRunInitialScan(base)).toBe(true);
  });

  it("library tidak kosong -> skip", () => {
    expect(shouldRunInitialScan({ ...base, trackCount: 5 })).toBe(false);
  });

  it("scan perdana sudah selesai -> skip walau library kosong (device memang tanpa lagu)", () => {
    expect(
      shouldRunInitialScan({ ...base, hasCompletedInitialScan: true }),
    ).toBe(false);
  });

  it("manual scan sedang jalan -> skip (library sedang diisi scan itu)", () => {
    expect(
      shouldRunInitialScan({ ...base, isManualScanning: true }),
    ).toBe(false);
  });

  it("auto scan sedang jalan -> skip", () => {
    expect(
      shouldRunInitialScan({ ...base, isAutoScanning: true }),
    ).toBe(false);
  });
});
