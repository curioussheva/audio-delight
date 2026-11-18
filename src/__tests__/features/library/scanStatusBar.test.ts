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
