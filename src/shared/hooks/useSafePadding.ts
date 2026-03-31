// src/shared/hooks/useSafePadding.ts
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlayerStore } from '@/features/player/store/playerStore';

export const useSafePadding = () => {
  const insets = useSafeAreaInsets();
  const { currentSong } = usePlayerStore();

  const hasFloatingPlayer = !!currentSong;

  return {
    paddingTop: insets.top,
    paddingBottom: hasFloatingPlayer 
      ? insets.bottom + 110     // ada player
      : insets.bottom + 30,     // belum ada player
    paddingLeft: insets.left,
    paddingRight: insets.right,
  };
}; 