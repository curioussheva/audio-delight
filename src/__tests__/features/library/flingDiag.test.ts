// Tes [FLING] — diagnostik sementara (drawDistance 100).
// Yang dites: matematika durasi/jarak/rowsEst + end tanpa start (murni).

import {
  noteFlingStart,
  noteFlingEnd,
  rowsEstForDistance,
  resetFlingDiagState,
} from "@/features/library/api/flingDiag";
import { setTempDiagEnabled } from "@/shared/utils/diagGate";

describe("rowsEstForDistance", () => {
  it("0dp -> 0 baris; 77dp -> 1; 770dp -> 10", () => {
    expect(rowsEstForDistance(0)).toBe(0);
    expect(rowsEstForDistance(77)).toBe(1);
    expect(rowsEstForDistance(770)).toBe(10);
  });

  it("dibulatkan (setengah baris ke atas)", () => {
    expect(rowsEstForDistance(115)).toBe(1);
    expect(rowsEstForDistance(116)).toBe(2);
  });
});

describe("noteFlingStart / noteFlingEnd", () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    resetFlingDiagState();
    setTempDiagEnabled(true);
  });

  afterEach(() => {
    logSpy.mockRestore();
    setTempDiagEnabled(false);
    resetFlingDiagState();
  });

  it("gate mati -> tidak ada log", () => {
    setTempDiagEnabled(false);
    noteFlingStart("songs", 0, 0);
    noteFlingEnd("songs", 770, 800);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("start tidak dilog; end melog durasi + jarak + rowsEst", () => {
    noteFlingStart("songs", 100, 1000);
    expect(logSpy).not.toHaveBeenCalled();
    noteFlingEnd("songs", 870, 1800);
    expect(logSpy).toHaveBeenCalledWith(
      "[FLING] list=songs duration=800ms distance=770dp rowsEst=10",
    );
  });

  it("jarak dihitung absolut (fling ke atas)", () => {
    noteFlingStart("playlist", 900, 0);
    noteFlingEnd("playlist", 130, 500);
    expect(logSpy).toHaveBeenCalledWith(
      "[FLING] list=playlist duration=500ms distance=770dp rowsEst=10",
    );
  });

  it("end tanpa start -> endWithoutStart, tanpa throw", () => {
    noteFlingEnd("songs", 500, 100);
    expect(logSpy).toHaveBeenCalledWith(
      "[FLING] list=songs endWithoutStart offsetY=500dp",
    );
  });

  it("dua daftar dilacak terpisah", () => {
    noteFlingStart("songs", 0, 0);
    noteFlingStart("playlist", 100, 0);
    noteFlingEnd("songs", 770, 800);
    expect(logSpy).toHaveBeenCalledWith(
      "[FLING] list=songs duration=800ms distance=770dp rowsEst=10",
    );
    noteFlingEnd("playlist", 177, 900);
    expect(logSpy).toHaveBeenCalledWith(
      "[FLING] list=playlist duration=900ms distance=77dp rowsEst=1",
    );
  });
});
