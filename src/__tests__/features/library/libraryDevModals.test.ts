// DevDBManager / MetadataSyncModal (audit Library 2026-11-22, P4).
//
// Kedua komponen ini BUKAN layar Library (DevDBManager: modal dev di
// drawer; MetadataSyncModal: Song Detail) — prioritas rendah, tapi
// pola yang sama: memo + callback stabil + key berbasis id.
//
// Jest di repo ini hanya untuk logika murni (tanpa React Native,
// tanpa @testing-library/react-native, testMatch hanya `*.test.ts`),
// jadi render-count TIDAK bisa diuji di sini. Yang diuji adalah
// properti sumbernya:
//  (1) DevDBManager di-memo; keyExtractor berbasis id (fallback
//      indeks bila tabel tanpa kolom id); onClose pemakai stabil;
//  (2) MetadataSyncModal di-memo; handleApplyMetadata + onClose
//      di [id].tsx jadi useCallback.

import * as fs from "fs";
import * as path from "path";

function readSource(rel: string): string {
  const raw = fs.readFileSync(path.resolve(__dirname, rel), "utf8");
  return raw.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

const devDB = readSource(
  "../../../features/library/components/DevDBManager.tsx",
);
const drawerLayout = readSource("../../../app/(drawer)/_layout.tsx");
const syncModal = readSource(
  "../../../features/library/components/MetadataSyncModal.tsx",
);
const songDetail = readSource("../../../app/(drawer)/song/[id].tsx");

describe("DevDBManager — memo + key berbasis id", () => {
  it("komponen di-memo dan di-export sebagai memo", () => {
    expect(devDB).toContain("function DevDBManager(");
    expect(devDB).toContain("export default memo(DevDBManager)");
  });

  it("keyExtractor berbasis id (bukan indeks), fallback indeks bila tanpa id", () => {
    expect(devDB).toContain("const rowKeyExtractor = useCallback(");
    expect(devDB).toContain("item.id != null");
    expect(devDB).toContain("keyExtractor={rowKeyExtractor}");
    expect(devDB).not.toContain("keyExtractor={(_, i) => i.toString()}");
  });

  it("onClose pemakai (drawer) stabil via useCallback", () => {
    expect(drawerLayout).toContain(
      "const handleCloseDB = useCallback(() => setShowDB(false), []);",
    );
    expect(drawerLayout).toContain("<DevDBManager onClose={handleCloseDB} />");
    expect(drawerLayout).toContain("onRequestClose={handleCloseDB}");
    expect(drawerLayout).not.toContain(
      "<DevDBManager onClose={() => setShowDB(false)} />",
    );
    expect(drawerLayout).not.toContain(
      "onRequestClose={() => setShowDB(false)}",
    );
  });
});

describe("MetadataSyncModal — memo + onSelect/onClose stabil", () => {
  it("komponen dibungkus memo()", () => {
    expect(syncModal).toContain("export const MetadataSyncModal = memo(");
  });

  it("handleApplyMetadata jadi useCallback atas song + aksi store", () => {
    expect(songDetail).toContain(
      "const handleApplyMetadata = useCallback(",
    );
    expect(songDetail).toContain("async (newMeta: AppliedMeta) => {");
    // AUD2-1: `isUpdating` ikut deps — guard in-flight di dalam
    // callback harus membaca nilai terbaru, bukan closure basi.
    expect(songDetail).toContain(
      "[song, updateTrackInStore, showToast, isUpdating]",
    );
    expect(songDetail).not.toContain(
      "const handleApplyMetadata = async (newMeta: AppliedMeta) => {",
    );
  });

  it("onClose modal stabil (tanpa ini memo batal tiap render layar)", () => {
    expect(songDetail).toContain(
      "const handleCloseSyncModal = useCallback(() => setSyncModalVisible(false), []);",
    );
    expect(songDetail).toContain("onClose={handleCloseSyncModal}");
    expect(songDetail).toContain("onSelect={handleApplyMetadata}");
  });
});
