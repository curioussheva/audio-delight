/**
 * refreshStore — Fase 4: satu counter global, bump menaikkan key + mencatat
 * alasan dan asal. Tanpa react-native — pola yang sama dengan toastStore.
 */
import { useRefreshStore } from "../../../shared/store/refreshStore";

describe("refreshStore", () => {
  it("awal: key 0, tanpa alasan dan asal", () => {
    // Registry modul jest segar per file test — store belum pernah di-bump.
    const s = useRefreshStore.getState();
    expect(s.refreshKey).toBe(0);
    expect(s.lastReason).toBeNull();
    expect(s.lastOrigin).toBeNull();
  });

  it("bump menaikkan key 1 dan mencatat alasan + asal", () => {
    const before = useRefreshStore.getState().refreshKey;
    useRefreshStore.getState().bumpRefreshKey("resume", "coordinator");
    const s = useRefreshStore.getState();
    expect(s.refreshKey).toBe(before + 1);
    expect(s.lastReason).toBe("resume");
    expect(s.lastOrigin).toBe("coordinator");
  });

  it("bump tanpa asal: origin kembali null, key tetap naik", () => {
    useRefreshStore.getState().bumpRefreshKey("manual-scan", "library");
    const before = useRefreshStore.getState().refreshKey;
    useRefreshStore.getState().bumpRefreshKey("manual-scan");
    const s = useRefreshStore.getState();
    expect(s.refreshKey).toBe(before + 1);
    expect(s.lastReason).toBe("manual-scan");
    expect(s.lastOrigin).toBeNull();
  });

  it("bump berurutan: key naik tiap kali, alasan terakhir yang menang", () => {
    const before = useRefreshStore.getState().refreshKey;
    useRefreshStore.getState().bumpRefreshKey("playlist-change", "a");
    useRefreshStore.getState().bumpRefreshKey("playlist-change", "b");
    const s = useRefreshStore.getState();
    expect(s.refreshKey).toBe(before + 2);
    expect(s.lastReason).toBe("playlist-change");
    expect(s.lastOrigin).toBe("b");
  });
});
