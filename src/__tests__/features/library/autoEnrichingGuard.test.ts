/**
 * autoEnrichingGuard — gerbang Auto Enriching (toggle baru, default ON).
 *
 * Start OTOMATIS worker enrichment (pasca initial/resume scan,
 * background task, autoScan) hanya bila toggle ON. Aksi eksplisit user
 * (modal manual, Rescan Library, menyalakan toggle ON) tidak melewati
 * gerbang ini.
 */
import { shouldAutoStartEnrichmentWorker } from "../../../features/library/services/autoEnrichingGuard";

describe("shouldAutoStartEnrichmentWorker", () => {
  it("ON (default) -> worker otomatis boleh jalan", () => {
    expect(
      shouldAutoStartEnrichmentWorker({ isAutoEnrichingEnabled: true }),
    ).toBe(true);
  });

  it("OFF -> worker otomatis tidak jalan (antrean tetap tersimpan)", () => {
    expect(
      shouldAutoStartEnrichmentWorker({ isAutoEnrichingEnabled: false }),
    ).toBe(false);
  });
});
