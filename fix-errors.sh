#!/bin/bash

# 1. Fix import paths (ganti @types/audio jadi @/types/audio)
find src -type f -name "*.ts" -o -name "*.tsx" | xargs sed -i "s/@types\/audio/@\/types\/audio/g"

# 2. Fix useAudioPlayer import di NowPlaying.tsx
sed -i "1i import { useAudioPlayer } from '@/hooks/useAudioPlayer';" src/components/audio/NowPlaying.tsx

# 3. Fix icon name di PlayerControls.tsx
sed -i "s/repeat-once/repeat-1/g" src/components/audio/PlayerControls.tsx

# 4. Fix PlaybackStatus di useAudioPlayer.ts
sed -i "s/import { Audio } from 'expo-av'/import { Audio, AVPlaybackStatus } from 'expo-av'/g" src/hooks/useAudioPlayer.ts
sed -i "s/Audio.PlaybackStatus/AVPlaybackStatus/g" src/hooks/useAudioPlayer.ts

echo "✅ Fixes applied! Run 'npx tsc --noEmit' again to check."