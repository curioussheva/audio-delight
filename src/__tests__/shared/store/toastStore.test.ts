/**
 * Toast store (Fase 2): satu toast dalam satu waktu, show() baru
 * menggantikan yang lama, dismiss mengosongkan.
 */
import { useToastStore } from "../../../shared/store/toastStore";

describe("toastStore", () => {
  beforeEach(() => {
    useToastStore.getState().dismissToast();
  });

  it("awal: tidak ada toast", () => {
    expect(useToastStore.getState().toast).toBeNull();
  });

  it("showToast menampilkan pesan dengan tipe default info", () => {
    useToastStore.getState().showToast("Playlist dibuat");
    const t = useToastStore.getState().toast;
    expect(t).toMatchObject({ message: "Playlist dibuat", type: "info" });
    expect(typeof t?.id).toBe("number");
  });

  it("showToast baru menggantikan yang lama dengan id naik", () => {
    useToastStore.getState().showToast("Satu", "success");
    const first = useToastStore.getState().toast;
    useToastStore.getState().showToast("Dua", "error");
    const second = useToastStore.getState().toast;
    expect(second?.message).toBe("Dua");
    expect(second?.type).toBe("error");
    expect(second?.id).toBeGreaterThan(first?.id ?? 0);
  });

  it("dismissToast mengosongkan", () => {
    useToastStore.getState().showToast("X");
    useToastStore.getState().dismissToast();
    expect(useToastStore.getState().toast).toBeNull();
  });
});
