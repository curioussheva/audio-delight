import { usePlayerStore } from "@/features/player/store/playerStore";

export const useAudioProgress = (_updateInterval = 250) => {
  const position = usePlayerStore((s) => s.position);
  const duration = usePlayerStore((s) => s.duration);

  const durationSafe = duration || 0;
  const positionSafe = position || 0;

  // Sementara buffered dianggap penuh; bisa dihubungkan ke native nanti
  const buffered = durationSafe;

  return {
    position: positionSafe,
    duration: durationSafe,
    buffered,
    progress: durationSafe > 0 ? positionSafe / durationSafe : 0,
    remaining: Math.max(0, durationSafe - positionSafe),
  };
};