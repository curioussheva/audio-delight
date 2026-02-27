// TrackPlayerService - stub for Expo Go compatibility
// Real implementation hanya aktif saat native build

export async function setupTrackPlayer(): Promise<boolean> {
  try {
    const RNTP = require('react-native-track-player');
    const tp = RNTP.default || RNTP;
    if (!tp?.setupPlayer) return false;
    await tp.setupPlayer({ minBuffer: 15, maxBuffer: 50 });
    await tp.updateOptions?.({
      capabilities: ['play', 'pause', 'skip-to-next', 'skip-to-previous', 'seek-to'],
      compactCapabilities: ['play', 'pause', 'skip-to-next'],
    });
    return true;
  } catch (e) {
    console.warn('[TrackPlayer] Setup failed (Expo Go mode):', e);
    return false;
  }
}

export async function PlaybackService() {
  try {
    const RNTP = require('react-native-track-player');
    const tp = RNTP.default || RNTP;
    const Event = RNTP.Event;
    if (!tp?.addEventListener || !Event) return;
    tp.addEventListener(Event.RemotePlay, () => tp.play());
    tp.addEventListener(Event.RemotePause, () => tp.pause());
    tp.addEventListener(Event.RemoteStop, () => tp.stop());
    tp.addEventListener(Event.RemoteNext, () => tp.skipToNext());
    tp.addEventListener(Event.RemotePrevious, () => tp.skipToPrevious());
    tp.addEventListener(Event.RemoteSeek, ({ position }: any) => tp.seekTo(position));
  } catch (e) {
    // Silent fail in Expo Go
  }
}
