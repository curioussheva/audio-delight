declare module 'react-native-track-player' {
  export const Capability: any;
  export const State: any;
  export const Event: any;
  
  export function usePlaybackState(): any;
  export function useProgress(): any;
  
  export function setupPlayer(options?: any): Promise<void>;
  export function updateOptions(options?: any): Promise<void>;
  export function reset(): Promise<void>;
  export function add(tracks: any[] | any): Promise<void>;
  export function play(): Promise<void>;
  export function pause(): Promise<void>;
  export function stop(): Promise<void>;
  export function seekTo(position: number): Promise<void>;
  export function skipToNext(): Promise<void>;
  export function skipToPrevious(): Promise<void>;
  export function getQueue(): Promise<any[]>;
  export function getCurrentTrack(): Promise<number>;
  export function getPlaybackState(): Promise<any>;
  
  export default {
    setupPlayer,
    updateOptions,
    reset,
    add,
    play,
    pause,
    stop,
    seekTo,
    skipToNext,
    skipToPrevious,
    getQueue,
    getCurrentTrack,
    getPlaybackState,
    Capability,
    State,
    Event,
    usePlaybackState,
    useProgress,
  };
}