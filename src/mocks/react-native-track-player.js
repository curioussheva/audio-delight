const noop = () => Promise.resolve();
const TrackPlayer = {
  setupPlayer: noop, add: noop, play: noop, pause: noop,
  stop: noop, reset: noop, skip: noop, skipToNext: noop,
  skipToPrevious: noop, seekTo: noop, setVolume: noop,
  setRepeatMode: noop, updateOptions: noop,
  getActiveTrack: () => Promise.resolve(null),
  getProgress: () => Promise.resolve({ position: 0, duration: 0, buffered: 0 }),
  addEventListener: () => ({ remove: () => {} }),
  registerPlaybackService: () => {},
};
const State = { None:'none', Ready:'ready', Playing:'playing', Paused:'paused', Stopped:'stopped', Loading:'loading', Buffering:'buffering' };
const Event = { PlaybackState:'playback-state', PlaybackActiveTrackChanged:'playback-active-track-changed', RemotePlay:'remote-play', RemotePause:'remote-pause', RemoteStop:'remote-stop', RemoteNext:'remote-next', RemotePrevious:'remote-previous', RemoteSeek:'remote-seek', RemoteDuck:'remote-duck' };
const RepeatMode = { Off: 0, Track: 1, Queue: 2 };
const Capability = { Play:'play', Pause:'pause', Stop:'stop', SeekTo:'seek-to', SkipToNext:'skip-to-next', SkipToPrevious:'skip-to-previous' };
const AppKilledPlaybackBehavior = { StopPlaybackAndRemoveNotification: 0 };
const usePlaybackState = () => ({ state: State.None });
const useProgress = () => ({ position: 0, duration: 0, buffered: 0 });
const useActiveTrack = () => null;
const useTrackPlayerEvents = () => {};
const useIsPlaying = () => ({ playing: false });
module.exports = { default: TrackPlayer, ...TrackPlayer, State, Event, RepeatMode, Capability, AppKilledPlaybackBehavior, usePlaybackState, useProgress, useActiveTrack, useTrackPlayerEvents, useIsPlaying };
