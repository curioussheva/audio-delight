import { NativeModules } from "react-native";

const { USBDACModule } = NativeModules;

export interface BitDepthAnalysis {
  realDepth: number;
  isFake: boolean;
  confidence: number;
}

export const verifyBitDepth = async (
  filePath: string,
): Promise<BitDepthAnalysis> => {
  try {
    if (!USBDACModule?.analyzeActualBitDepth) {
      // Fallback jika module belum siap
      return { realDepth: 16, isFake: false, confidence: 0 };
    }

    // Memanggil modul native yang melakukan scanning LSB
    const result = await USBDACModule.analyzeActualBitDepth(filePath);

    return {
      realDepth: result.actualDepth, // misal: 16, 24, atau 32
      isFake: result.isPadded, // true jika bit bawah hanya nol
      confidence: result.confidence, // tingkat kepastian analisis (0-100)
    };
  } catch (error) {
    console.error("Bit depth verification failed:", error);
    return { realDepth: 16, isFake: false, confidence: 0 };
  }
};
