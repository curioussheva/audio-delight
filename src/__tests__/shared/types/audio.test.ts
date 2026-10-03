import { formatDuration, formatFileSize } from "../../../shared/types/audio";

describe("formatDuration", () => {
  it("format mm:ss", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(5)).toBe("00:05");
    expect(formatDuration(65)).toBe("01:05");
    expect(formatDuration(3599)).toBe("59:59");
  });

  it("menit tidak di-clamp di 60 (menit panjang tetap jalan)", () => {
    expect(formatDuration(3600)).toBe("60:00");
    expect(formatDuration(7325)).toBe("122:05");
  });

  it("desimal dibulatkan ke bawah", () => {
    expect(formatDuration(59.9)).toBe("00:59");
    expect(formatDuration(1.99)).toBe("00:01");
  });

  it("nilai tidak valid jadi 00:00", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(NaN)).toBe("00:00");
  });

  // REGRESI: `!seconds` tidak menangkap Infinity (truthy), sehingga versi lama
  // menghasilkan "Infinity:NaN". Sekarang semua nilai non-finite -> "00:00".
  it("REGRESI: Infinity dan -Infinity jadi 00:00", () => {
    expect(formatDuration(Infinity)).toBe("00:00");
    expect(formatDuration(-Infinity)).toBe("00:00");
  });

  it("durasi negatif jadi 00:00", () => {
    expect(formatDuration(-5)).toBe("00:00");
  });

  it("selalu dua digit untuk menit dan detik", () => {
    expect(formatDuration(5)).toMatch(/^\d{2}:\d{2}$/);
    expect(formatDuration(605)).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("formatFileSize", () => {
  it("byte mentah di bawah 1 KB", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1023)).toBe("1023 B");
  });

  it("KB dengan satu desimal", () => {
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });

  it("MB dengan satu desimal", () => {
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("GB dengan dua desimal", () => {
    expect(formatFileSize(1024 ** 3)).toBe("1.00 GB");
    expect(formatFileSize(2.5 * 1024 ** 3)).toBe("2.50 GB");
  });

  it("FLAC hi-res 24/96 realistis", () => {
    // ~60 MB file
    expect(formatFileSize(60 * 1024 * 1024)).toBe("60.0 MB");
  });

  it("batas antar satuan konsisten", () => {
    expect(formatFileSize(1024 - 1)).toMatch(/B$/);
    expect(formatFileSize(1024)).toMatch(/KB$/);
    expect(formatFileSize(1024 ** 2)).toMatch(/MB$/);
    expect(formatFileSize(1024 ** 3)).toMatch(/GB$/);
  });
});
