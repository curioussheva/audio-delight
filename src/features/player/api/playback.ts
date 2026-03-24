import TrackPlayer, { Event } from 'react-native-track-player';

export const playbackService = async function() {
    // Listener untuk tombol di Notifikasi / Lockscreen
    TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
    TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
    TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext());
    TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious());
    TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.reset());
    TrackPlayer.addEventListener(Event.RemoteSeek, (event) => TrackPlayer.seekTo(event.position));
    
    // Listener untuk error atau gangguan (Duck/Interruption)
    TrackPlayer.addEventListener(Event.RemoteDuck, async (event) => {
        if (event.paused) {
            await TrackPlayer.pause();
        } else {
            await TrackPlayer.play();
        }
    });

    console.log("[PlaybackService] Registered successfully");
};
