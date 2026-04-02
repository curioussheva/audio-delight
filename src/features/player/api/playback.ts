import TrackPlayer, { Event } from "react-native-track-player";
import { NativeModules } from "react-native";
import { useEqualizerStore } from "@/features/equalizer/store/equalizerStore"; // Sesuaikan path

const { NativeDSPModule } = NativeModules;

export const playbackService = async function () {
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async () => {
    // Gunakan timeout sedikit lebih lama jika di perangkat low-end 500ms masih meleset
    setTimeout(async () => {
      try {
        const sessionId = await (TrackPlayer as any).getAudioSessionId?.();

        if (sessionId && sessionId !== -1 && NativeDSPModule) {
          const state = useEqualizerStore.getState();

          if (state.isEQEnabled) {
            console.log(`[DSP] Syncing All Effects to Session: ${sessionId}`);

            // 1. Terapkan Bass Boost
            await NativeDSPModule.setBassBoost(state.bassStrength, sessionId);

            // 2. Terapkan Virtualizer (Sound Stage)
            if (NativeDSPModule.setVirtualizer) {
              await NativeDSPModule.setVirtualizer(
                state.virtualizerLevel,
                sessionId,
              );
            }

            // 3. Terapkan Reverb
            await NativeDSPModule.setReverbPreset(
              state.reverbPreset,
              sessionId,
            );

            // 4. Terapkan Semua Band EQ
            // Pastikan di NativeDSPModule.kt Anda sudah menambah method setFullEqualizer
            const gains = state.bands.map((b) => (b.gain * 100).toInt());
            await NativeDSPModule.setFullEqualizer(gains, sessionId);
          }
        }
      } catch (e) {
        console.error("[DSP] Sync error:", e);
      }
    }, 800);
  });

  // --- Remote Control ---
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteNext, () =>
    TrackPlayer.skipToNext(),
  );
  TrackPlayer.addEventListener(Event.RemotePrevious, () =>
    TrackPlayer.skipToPrevious(),
  );

  TrackPlayer.addEventListener(Event.RemoteStop, async () => {
    await TrackPlayer.reset();
    if (NativeDSPModule) await NativeDSPModule.releaseAllFX();
  });

  console.log("[PlaybackService] Registered with Full DSP Sync");
};
