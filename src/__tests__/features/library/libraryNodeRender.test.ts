// src/__tests__/features/library/libraryNodeRender.test.ts
//
// Per-node render Library (2026-11-22, prinsip csheva — hanya node yang
// bersangkutan yang render ulang; pola opsi 2 EQ).
//
// Jest di repo ini hanya untuk logika murni (tanpa React Native, tanpa
// @testing-library/react-native, testMatch hanya `*.test.ts`), jadi
// render-count komponen TIDAK bisa diuji di sini. Yang diuji adalah
// properti yang membuat penyempitan itu bekerja — sama seperti
// eqSubscriptionNarrowing.test.ts:
//  (1) tiap setter store hanya mengubah potongan state-nya sendiri, dan
//      referensi potongan lain tetap identik — sehingga selector per
//      nilai (yang dipakai LibraryScreen / LibraryHeader / LibraryTabBar
//      / ScanStatusBar) tidak membangunkan subscriber yang tidak
//      berkepentingan;
//  (2) sumber: layar tidak lagi melanggan store utuh / objek progres,
//      TabBar melanggan progresnya sendiri, EmptyLibrary tidak lagi
//      punya animasi spinner/bar progres.
//
// Emulasi langganan selector: `trackSlice` memakai `store.subscribe`
// (zustand v4: listener tiap set) + perbandingan Object.is pada hasil
// selector — sama seperti yang dilakukan `useSyncExternalStoreWithSelector`
// di balik `useStore(selector)` di React.

import * as fs from "fs";
import * as path from "path";

const backing = new Map<string, string>();

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => backing.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      backing.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      backing.delete(key);
    }),
  },
}));

jest.mock("@/features/library/api/scanner", () => ({
  LibraryScanner: {},
}));

async function loadStore() {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useLibraryStore } = require("@/features/library/store/libraryStore");
  await useLibraryStore.persist.rehydrate();
  return useLibraryStore;
}

const track = (over: Record<string, unknown> = {}) => ({
  id: "1",
  uri: "content://media/1",
  filename: "lagu.mp3",
  title: "Judul",
  artist: "Artis",
  album: "Album",
  genre: "Pop",
  duration: 180,
  codec: "MP3",
  sampleRate: 44100,
  bitDepth: 16,
  folder: "Music",
  dateAdded: 1700000000000,
  playCount: 0,
  isFavorite: false,
  isEnriched: true,
  lastSeenAt: 1700000000000,
  ...over,
});

function trackSlice<T>(store: any, selector: (s: any) => T) {
  let calls = 0;
  let current = selector(store.getState());
  const unsub = store.subscribe((s: any) => {
    const next = selector(s);
    if (!Object.is(current, next)) {
      calls += 1;
      current = next;
    }
  });
  return {
    get calls() {
      return calls;
    },
    get current() {
      return current;
    },
    unsub,
  };
}

function readSource(rel: string): string {
  const raw = fs.readFileSync(path.resolve(__dirname, rel), "utf8");
  // Hapus komentar sebelum diperiksa — komentar penjelas memang menyebut
  // nama field lama; yang diuji adalah kodenya (pola scanStatusBar.test.ts).
  return raw.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("libraryStore — tick progres hanya mengubah potongannya sendiri", () => {
  it("tick manual scan: hanya manualScanProgress + flag yang berubah", async () => {
    const store = await loadStore();
    const manual = trackSlice(store, (s) => s.manualScanProgress);
    const auto = trackSlice(store, (s) => s.autoScanProgress);
    const enrich = trackSlice(store, (s) => s.enrichmentProgress);
    const tracks = trackSlice(store, (s) => s.tracks);
    const tab = trackSlice(store, (s) => s.activeTab);
    const pending = trackSlice(store, (s) => s.unenrichedCount);
    const tracksBefore = store.getState().tracks;

    store.getState().startManualScan();
    store
      .getState()
      .updateManualScanProgress({ phase: "discover", current: 5, total: 100 });
    store
      .getState()
      .updateManualScanProgress({ phase: "discover", current: 12, total: 100 });
    store
      .getState()
      .updateManualScanProgress({ phase: "process", current: 40, total: 100 });

    // start (0/0) + 3 tick = 4 kali objek progres berganti.
    expect(manual.calls).toBe(4);
    expect(manual.current).toEqual({
      phase: "process",
      current: 40,
      total: 100,
    });
    expect(auto.calls).toBe(0);
    expect(enrich.calls).toBe(0);
    expect(tracks.calls).toBe(0);
    expect(tab.calls).toBe(0);
    expect(pending.calls).toBe(0);
    // Referensi daftar lagu identik — selector `tracks` tidak bangun.
    expect(store.getState().tracks).toBe(tracksBefore);
  });

  it("tick enrichment: hanya enrichmentProgress yang berubah", async () => {
    const store = await loadStore();
    const manual = trackSlice(store, (s) => s.manualScanProgress);
    const auto = trackSlice(store, (s) => s.autoScanProgress);
    const enrich = trackSlice(store, (s) => s.enrichmentProgress);
    const tracks = trackSlice(store, (s) => s.tracks);
    const pending = trackSlice(store, (s) => s.unenrichedCount);

    store.getState().startEnrichment(1, 10);
    store.getState().updateEnrichmentProgress({
      level: 1,
      current: 3,
      total: 10,
      success: 3,
      failed: 0,
    });
    store.getState().updateEnrichmentProgress({
      level: 1,
      current: 7,
      total: 10,
      success: 7,
      failed: 0,
    });

    expect(enrich.calls).toBe(3);
    expect(enrich.current).toEqual({
      level: 1,
      current: 7,
      total: 10,
      success: 7,
      failed: 0,
    });
    expect(manual.calls).toBe(0);
    expect(auto.calls).toBe(0);
    expect(tracks.calls).toBe(0);
    // Hitungan pending TIDAK berubah tiap tick progres — hanya saat
    // lagu selesai di-enrich (markAsEnriched / setUnenrichedCount).
    expect(pending.calls).toBe(0);
  });

  it("tick auto scan: hanya autoScanProgress yang berubah", async () => {
    const store = await loadStore();
    const manual = trackSlice(store, (s) => s.manualScanProgress);
    const auto = trackSlice(store, (s) => s.autoScanProgress);
    const enrich = trackSlice(store, (s) => s.enrichmentProgress);
    const tracks = trackSlice(store, (s) => s.tracks);

    store.getState().startAutoScan();
    store
      .getState()
      .updateAutoScanProgress({ phase: "discover", current: 2, total: 0 });
    store
      .getState()
      .updateAutoScanProgress({ phase: "discover", current: 9, total: 0 });

    expect(auto.calls).toBe(3);
    expect(manual.calls).toBe(0);
    expect(enrich.calls).toBe(0);
    expect(tracks.calls).toBe(0);
  });

  it("setTracks (daftar berubah): hanya tracks (+bukan progres) yang berubah", async () => {
    const store = await loadStore();
    const manual = trackSlice(store, (s) => s.manualScanProgress);
    const enrich = trackSlice(store, (s) => s.enrichmentProgress);
    const tracks = trackSlice(store, (s) => s.tracks);
    const pending = trackSlice(store, (s) => s.unenrichedCount);

    store.getState().setTracks([track(), track({ id: "2", title: "Kedua" })]);

    expect(tracks.calls).toBe(1);
    expect(tracks.current).toHaveLength(2);
    expect(manual.calls).toBe(0);
    expect(enrich.calls).toBe(0);
    // Kedua lagu sudah enriched → hitungan pending tetap 0.
    expect(pending.calls).toBe(0);
  });

  it("ganti tab: hanya activeTab yang berubah", async () => {
    const store = await loadStore();
    const tab = trackSlice(store, (s) => s.activeTab);
    const tracks = trackSlice(store, (s) => s.tracks);
    const manual = trackSlice(store, (s) => s.manualScanProgress);

    store.getState().setActiveTab("album");

    expect(tab.calls).toBe(1);
    expect(tab.current).toBe("album");
    expect(tracks.calls).toBe(0);
    expect(manual.calls).toBe(0);
  });

  it("setUnenrichedCount: hanya hitungan pending yang berubah (node badge)", async () => {
    const store = await loadStore();
    const pending = trackSlice(store, (s) => s.unenrichedCount);
    const tracks = trackSlice(store, (s) => s.tracks);
    const enrich = trackSlice(store, (s) => s.enrichmentProgress);

    store.getState().setUnenrichedCount(7);

    expect(pending.calls).toBe(1);
    expect(pending.current).toBe(7);
    expect(tracks.calls).toBe(0);
    expect(enrich.calls).toBe(0);
  });
});

describe("library.tsx — layar tidak melanggan store utuh / progres", () => {
  const library = readSource("../../../app/(drawer)/(tabs)/library.tsx");

  it("tidak ada langganan useLibraryStore() tanpa selector", () => {
    expect(library).not.toMatch(/useLibraryStore\(\s*\)/);
  });

  it("layar tidak membaca objek progres (angka itu milik node-nya)", () => {
    expect(library).not.toContain("manualScanProgress?.current");
    expect(library).not.toContain("enrichmentProgress?.current");
    expect(library).not.toContain("scanProgress={");
    expect(library).not.toContain("enrichProgress={");
    expect(library).not.toContain("scanTotal={");
  });

  it("header dipisah jadi komponen memo yang melanggan potongannya sendiri", () => {
    expect(library).toContain("const LibraryHeader = memo(");
    // Header hanya butuh flag + hitungan pending (tanpa objek progres,
    // supaya tick enrichment tidak membangunkan header).
    expect(library).toContain("useScanFlags()");
    expect(library).toContain("useEnrichmentCounts()");
    expect(library).not.toContain("useEnrichmentProgress()");
    expect(library).toContain("<LibraryHeader");
  });

  it("guard enhance-metadata baca hitungan lewat getState(), bukan langganan", () => {
    expect(library).toContain("getState().unenrichedCount");
  });

  it("tombol AUTO/SCAN statis selama scan — bukan spinner ke-3", () => {
    // 2026-11-23 (koreksi csheva dari screenshot fresh install):
    // saat scan awal ada 3 spinner — tombol AUTO pojok kanan atas,
    // bar "Discovering files…" dan chip "Scanning library…".
    // Target maks 2 animasi: tombol ini statis, yang beranimasi
    // tinggal bar + chip.
    expect(library).not.toContain("ActivityIndicator");
    expect(library).toContain('"AUTO"');
    expect(library).toContain('"SCAN"');
  });
});

describe("useScanManager — hook flag/aksi vs hook progres terpisah", () => {
  const hook = readSource("../../../features/library/hooks/useScanManager.ts");

  it("tidak ada lagi `const store = useLibraryStore()` utuh", () => {
    expect(hook).not.toContain("const store = useLibraryStore()");
  });

  it("ada hook progres per kelompok pemakai, bukan satu hook gabungan", () => {
    expect(hook).toContain("export function useScanFlags()");
    expect(hook).toContain("export function useManualScanProgress()");
    expect(hook).toContain("export function useAutoScanProgress()");
    expect(hook).toContain("export function useEnrichmentProgress()");
    expect(hook).toContain("export function useEnrichmentCounts()");
    // Hook gabungan lama dihapus: tidak ada pemakai yang memakai semua
    // field-nya, dan satu hook 10 selector membangunkan semua pemakai
    // pada tiap perubahan field mana pun.
    expect(hook).not.toContain("export function useScanProgress()");
    expect(hook).not.toContain("useScanProgress()");
  });

  it("badan useScanManager tidak menyentuh objek progres/hitungan", () => {
    const body = hook.slice(
      hook.indexOf("export function useScanManager()"),
      hook.indexOf("export function useScanFlags()"),
    );
    expect(body).not.toContain("manualScanProgress");
    expect(body).not.toContain("enrichmentProgress");
    expect(body).not.toContain("autoScanProgress");
    expect(body).not.toContain("unenrichedCount");
    expect(body).not.toContain("enrichmentQueueSize");
  });
});

describe("LibraryTabBar — node progres melanggan sendiri + memo", () => {
  const tabBar = readSource(
    "../../../features/library/components/LibraryTabBar.tsx",
  );

  it("melanggan progres lewat hook per kelompok (bukan prop dari layar)", () => {
    expect(tabBar).toContain("useScanFlags()");
    expect(tabBar).toContain("useManualScanProgress()");
    expect(tabBar).toContain("useEnrichmentProgress()");
    expect(tabBar).toContain("manualScanProgress");
    expect(tabBar).toContain("enrichmentProgress");
    // Bar tidak menampilkan angka auto scan — tidak melanggan hook-nya.
    expect(tabBar).not.toContain("useAutoScanProgress()");
    expect(tabBar).not.toContain("autoScanProgress");
  });

  it("prop progres lama + trackCount tak terpakai sudah dihapus", () => {
    // Yang dihapus adalah prop-nya (tipe di interface Props) — variabel
    // lokal `scanProgress`/`enrichProgress` di dalam TabBar tetap ada,
    // karena dihitung dari langganan useScanProgress sendiri.
    expect(tabBar).not.toContain("scanProgress: number");
    expect(tabBar).not.toContain("scanTotal: number");
    expect(tabBar).not.toContain("enrichProgress?: number");
    expect(tabBar).not.toContain("enrichTotal?: number");
    expect(tabBar).not.toContain("isScanning: boolean");
    expect(tabBar).not.toContain("trackCount");
  });

  it("komponen di-memo supaya render induk tidak ikut membangunkan TabBar", () => {
    expect(tabBar).toContain("memo(function LibraryTabBar");
  });

  it("bar + pill progres scan/enrichment tetap ada (node yang dipertahankan)", () => {
    expect(tabBar).toContain("Discovering files...");
    expect(tabBar).toContain("Scanning ${scanProgress} / ${scanTotal} files");
    expect(tabBar).toContain(
      "Enriching ${enrichProgress} / ${enrichTotal} tracks",
    );
  });
});

describe("EmptyLibrary — animasi ke-3 dihapus, status jadi statis", () => {
  const empty = readSource(
    "../../../features/library/components/EmptyLibrary.tsx",
  );

  it("tidak ada lagi spinner / bar progres / persen", () => {
    expect(empty).not.toContain("ActivityIndicator");
    expect(empty).not.toContain("scanProgress");
    expect(empty).not.toContain("scanTotal");
    expect(empty).not.toContain("progressTrack");
    expect(empty).not.toContain("progressFill");
  });

  it("status scan statis tetap ada (tanpa animasi)", () => {
    expect(empty).toContain("Memindai library…");
  });

  it("komponen di-memo; tombol scan + judul kosong tidak berubah", () => {
    expect(empty).toContain("memo(");
    expect(empty).toContain("SCAN PERANGKAT");
    expect(empty).toContain("Library Anda masih kosong");
  });
});

describe("ScanStatusBar — chip memakai hook progres (bukan hook layar)", () => {
  const chip = readSource(
    "../../../features/library/components/ScanStatusBar.tsx",
  );

  it("melanggan hook per kelompok, bukan useScanManager", () => {
    expect(chip).toContain("useAutoScanProgress()");
    expect(chip).toContain("useEnrichmentProgress()");
    // "useScanManager" sebagai NAMA MODUL di path impor tetap ada
    // (hook-nya satu file) — yang diuji adalah pemanggilannya.
    expect(chip).not.toContain("useScanManager()");
    // Chip tidak menampilkan progres manual — tidak melanggan hook-nya.
    expect(chip).not.toContain("useManualScanProgress()");
    expect(chip).not.toContain("manualScanProgress");
  });

  it("chip 'Scanning library...' tetap dipertahankan", () => {
    expect(chip).toContain("Scanning library...");
  });
});

describe("useScanProgress dipecah — tiap pemakai hanya melanggan kelompoknya", () => {
  // KOREKSI audit (2026-11-22): komentar lama mengklaim "tick manual
  // tidak membangunkan subscriber enrichment" — salah: hook gabungan
  // 10 selector melanggan semua pemakainya ke semua field. Pemecahan
  // ini memisahkan LANGGANAN-nya; klaim lama tidak boleh muncul lagi
  // (diuji dari sumber MENTAH, termasuk komentar).
  const hookRaw = fs.readFileSync(
    path.resolve(
      __dirname,
      "../../../features/library/hooks/useScanManager.ts",
    ),
    "utf8",
  );
  const hook = readSource("../../../features/library/hooks/useScanManager.ts");
  const modal = readSource(
    "../../../features/library/components/EnrichMetadataModal.tsx",
  );

  it("klaim salah 'tick manual tidak membangunkan subscriber enrichment' sudah dibetulkan", () => {
    expect(hookRaw).not.toContain(
      "tick manual tidak membangunkan subscriber enrichment",
    );
    expect(hookRaw).toContain("KOREKSI");
    expect(hookRaw).toContain("useScanProgress` dihapus");
  });

  it("tiap hook kelompok hanya melanggan field kelompoknya (selector per nilai)", () => {
    const manualBody = hook.slice(
      hook.indexOf("export function useManualScanProgress()"),
      hook.indexOf("export function useAutoScanProgress()"),
    );
    expect(manualBody).toContain("s.isManualScanning");
    expect(manualBody).toContain("s.manualScanProgress");
    expect(manualBody).not.toContain("s.enrichmentProgress");
    expect(manualBody).not.toContain("s.autoScanProgress");
    expect(manualBody).not.toContain("s.lastScanAt");

    const enrichBody = hook.slice(
      hook.indexOf("export function useEnrichmentProgress()"),
      hook.indexOf("export function useEnrichmentCounts()"),
    );
    expect(enrichBody).toContain("s.isEnriching");
    expect(enrichBody).toContain("s.enrichmentProgress");
    expect(enrichBody).toContain("s.unenrichedCount");
    expect(enrichBody).not.toContain("s.manualScanProgress");
    expect(enrichBody).not.toContain("s.autoScanProgress");
    expect(enrichBody).not.toContain("s.lastEnrichmentAt");

    // Tidak ada lagi langganan ke penanda waktu: tidak satu pun hook
    // kelompok membaca lastScanAt / lastEnrichmentAt.
    expect(hook).not.toContain("lastScanAt");
    expect(hook).not.toContain("lastEnrichmentAt");
  });

  it("EnrichMetadataModal hanya melanggan enrichment (bukan manual/auto)", () => {
    expect(modal).toContain("useEnrichmentProgress()");
    expect(modal).not.toContain("useManualScanProgress()");
    expect(modal).not.toContain("useAutoScanProgress()");
    expect(modal).not.toContain("useScanProgress()");
  });

  it("tidak ada lagi pemakai useScanProgress di layar/komponen Library", () => {
    for (const rel of [
      "../../../app/(drawer)/(tabs)/library.tsx",
      "../../../features/library/components/LibraryTabBar.tsx",
      "../../../features/library/components/ScanStatusBar.tsx",
      "../../../features/library/components/EnrichMetadataModal.tsx",
    ]) {
      expect(readSource(rel)).not.toContain("useScanProgress()");
    }
  });
});
