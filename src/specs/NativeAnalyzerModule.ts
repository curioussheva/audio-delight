import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  // Analisis spektral offline sebuah file (path lokal, boleh "file://").
  // Mengembalikan JSON string dari native:
  //   { ok: true, durationSeconds, sampleRate, channels, measuredCutoffHz,
  //     peakDbfs, rmsDbfs, lsbZeroRatio16, windowsUsed }
  //   { ok: false, error }
  // ok:false di dalam JSON berarti file tidak bisa dianalisis (bukan
  // exception) — pemanggil TS yang memutuskan tampilannya.
  analyzeFile(uri: string): Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeAnalyzerModule');
