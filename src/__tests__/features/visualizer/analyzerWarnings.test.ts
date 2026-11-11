import {
  cleanWarningText,
  cleanAnalyzerWarnings,
} from "@/features/visualizer/api/analyzerWarnings";

describe("cleanWarningText", () => {
  it("membuang prefix '[FFT] '", () => {
    expect(cleanWarningText("[FFT] Konten berhenti di 18,2 kHz")).toBe(
      "Konten berhenti di 18,2 kHz",
    );
  });

  it("membiarkan teks tanpa prefix apa adanya", () => {
    expect(
      cleanWarningText("Metadata tidak bisa dibaca — verdict ini estimasi"),
    ).toBe("Metadata tidak bisa dibaca — verdict ini estimasi");
  });
});

describe("cleanAnalyzerWarnings", () => {
  it("membersihkan prefix dari semua warning", () => {
    expect(
      cleanAnalyzerWarnings([
        "[FFT] Konten berhenti di 18,2 kHz",
        "Very low bitrate (96 kbps) — heavily compressed",
      ]),
    ).toEqual([
      "Konten berhenti di 18,2 kHz",
      "Very low bitrate (96 kbps) — heavily compressed",
    ]);
  });

  it("membuang warning yang sama dengan fakeReason (tidak tampil dua kali)", () => {
    expect(
      cleanAnalyzerWarnings(
        [
          "[FFT] Konten berhenti di 18,2 kHz",
          "[FFT] 8 bit bawah semuanya nol (rasio LSB-16 100%) — kemungkinan padding dari 16-bit",
        ],
        "[FFT] Konten berhenti di 18,2 kHz",
      ),
    ).toEqual([
      "8 bit bawah semuanya nol (rasio LSB-16 100%) — kemungkinan padding dari 16-bit",
    ]);
  });

  it("fakeReason tanpa prefix tetap didedup", () => {
    expect(
      cleanAnalyzerWarnings(["[FFT] Catatan spektral"], "Catatan spektral"),
    ).toEqual([]);
  });

  it("tanpa fakeReason tidak ada yang dibuang; null/undefined aman", () => {
    expect(cleanAnalyzerWarnings(["[FFT] A", "B"])).toEqual(["A", "B"]);
    expect(cleanAnalyzerWarnings(null, "x")).toEqual([]);
    expect(cleanAnalyzerWarnings(undefined)).toEqual([]);
  });
});
