import { usePlayerStore } from "@/features/player/store/playerStore";

// U-P2-15: dulu hook ini menerima parameter interval (default 250) tapi
// mengabaikannya — posisi dibaca dari watcher store (500ms), bukan dari
// polling hook ini. Parameter dihapus supaya pemanggil tidak mengira
// intervalnya dihormati. Field `buffered` juga dihapus: dulu selalu =
// durasi penuh (palsu, bukan hasil ukur buffering native) dan tidak ada
// pemakai di luar hook.
export const useAudioProgress = () => {
  const position = usePlayerStore((s) => s.position);
  const duration = usePlayerStore((s) => s.duration);

  const durationSafe = duration || 0;
  const positionSafe = position || 0;

  return {
    position: positionSafe,
    duration: durationSafe,
    progress: durationSafe > 0 ? positionSafe / durationSafe : 0,
    remaining: Math.max(0, durationSafe - positionSafe),
  };
};
