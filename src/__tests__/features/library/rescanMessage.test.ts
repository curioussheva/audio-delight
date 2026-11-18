/**
 * formatRescanToast — pesan toast hasil Rescan. Logika murni.
 */
import { formatRescanToast } from "../../../features/library/utils/rescanMessage";

describe("formatRescanToast", () => {
  it("tanpa perubahan -> kalimat netral", () => {
    expect(formatRescanToast({ added: 0, removed: 0, updated: 0 })).toBe(
      "Rescan selesai — tidak ada perubahan.",
    );
  });

  it("hanya lagu baru", () => {
    expect(formatRescanToast({ added: 3, removed: 0, updated: 0 })).toBe(
      "Rescan selesai — 3 lagu baru.",
    );
  });

  it("ketiganya digabung urut baru, hapus, ubah", () => {
    expect(formatRescanToast({ added: 2, removed: 1, updated: 4 })).toBe(
      "Rescan selesai — 2 lagu baru, 1 dihapus, 4 diperbarui.",
    );
  });

  it("nol di tengah tidak disebut", () => {
    expect(formatRescanToast({ added: 0, removed: 5, updated: 0 })).toBe(
      "Rescan selesai — 5 dihapus.",
    );
  });
});
