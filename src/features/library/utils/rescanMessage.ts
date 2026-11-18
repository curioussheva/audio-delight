/**
 * rescanMessage.ts — pesan toast hasil Rescan (full scan manual).
 *
 * Fungsi murni (diuji jest): merangkai hitungan ScanResult jadi satu
 * kalimat berbahasa user. Dipakai aksi Rescan di Settings — dan bisa
 * dipakai ulang pemanggil manualScan lain bila perlu.
 */
import type { ScanResult } from "../types/scan";

export function formatRescanToast(
  result: Pick<ScanResult, "added" | "removed" | "updated">,
): string {
  const parts: string[] = [];
  if (result.added > 0) parts.push(`${result.added} lagu baru`);
  if (result.removed > 0) parts.push(`${result.removed} dihapus`);
  if (result.updated > 0) parts.push(`${result.updated} diperbarui`);
  if (parts.length === 0) return "Rescan selesai — tidak ada perubahan.";
  return `Rescan selesai — ${parts.join(", ")}.`;
}
