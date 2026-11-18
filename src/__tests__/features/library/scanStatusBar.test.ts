/**
 * ScanStatusBar — banner "N songs ready for metadata enhancement"
 * DINONAKTIFKAN (keputusan csheva 2026-11-18: banner hijau menabrak
 * SafeAreaView/status bar, tampil terpotong).
 *
 * Test ini sengaja berbasis sumber, bukan render komponen: repo ini
 * tidak punya testing-library dan jest hanya menjalankan `.test.ts`,
 * jadi komponen .tsx tidak bisa di-render di test. Test ini mengunci
 * penghapusan — bila banner ditambahkan lagi, test gagal — sekaligus
 * mengunci bahwa cabang progres scan (yang harus tetap utuh) tidak
 * ikut terhapus.
 */
import * as fs from "fs";
import * as path from "path";

const source = fs.readFileSync(
  path.resolve(
    __dirname,
    "../../../features/library/components/ScanStatusBar.tsx",
  ),
  "utf8",
);

// Hapus komentar (// ... dan /* ... */) sebelum diperiksa: komentar
// penjelas di file memang menyebut nama banner yang dimatikan — yang
// diuji adalah kodenya, bukan penjelasannya.
const code = source
  .replace(/\/\/.*$/gm, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");

describe("ScanStatusBar — banner notif hijau dimatikan", () => {
  it("tidak lagi menampilkan banner 'songs ready for metadata enhancement'", () => {
    expect(code).not.toContain("ready for metadata enhancement");
    expect(code).not.toContain("unenrichedCount");
    expect(code).not.toContain('router.push("/(drawer)/settings")');
  });

  it("cabang progres scan tetap utuh (bukan seluruh komponen yang dimatikan)", () => {
    // Auto scan
    expect(code).toContain("Scanning library...");
    // Manual enrichment (isEnriching + enrichmentProgress)
    expect(code).toContain("Enhancing {current}/{total} songs...");
    // Background enrichment
    expect(code).toContain("in background...");
  });
});

describe("ScanStatusBar — banner duduk di bawah status bar", () => {
  it("memakai inset safe-area atas (bukan y=0)", () => {
    expect(code).toContain("useSafeAreaInsets");
    expect(code).toContain("react-native-safe-area-context");
    // Definisi paddingTop dari inset (bukan angka hardcoded).
    expect(code).toMatch(/paddingTop:\s*insets\.top/);
  });

  it("ketiga cabang progres memakai paddingTop inset yang sama", () => {
    // safeTop didefinisikan sekali (paddingTop: insets.top + 12,
    // mempertahankan paddingVertical container 12) lalu dipakai
    // di ketiga style array cabang: 1 definisi + 3 pemakaian.
    const hits = code.match(/safeTop/g) ?? [];
    expect(hits.length).toBe(4);
  });

  it("isi dan warna banner tidak berubah", () => {
    // Tidak ada yang dimatikan/diubah selain posisi: ketiga cabang
    // tetap ada (diuji di atas) dan backgroundColor tiap cabang utuh.
    expect(code).toContain("colors.primary[500]");
    expect(code).toContain("colors.status.success");
    expect(code).toContain('colors.status.success + "dd"');
  });
});
