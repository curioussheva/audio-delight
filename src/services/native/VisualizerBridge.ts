import { NativeModules, NativeEventEmitter } from 'react-native';

const { NativeVisualizerBridge } = NativeModules;

// Pastikan export fungsinya ada di sini
export const startVisualizer = (audioSessionId: number): Promise<boolean> => {
  return NativeVisualizerBridge.startVisualizer(audioSessionId);
};

export const stopVisualizer = () => {
  NativeVisualizerBridge.stopVisualizer();
};

export const visualizerEmitter = new NativeEventEmitter(NativeVisualizerBridge);
