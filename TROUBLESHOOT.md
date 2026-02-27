# Troubleshooting AudioDelight

## ❌ Error: Cannot find module 'react-native-track-player/lib/src/trackPlayer'

### Penyebab
`react-native-track-player` v4.x kadang tidak include compiled `.js` di `lib/src/`
setelah install via yarn, terutama di Termux / Linux ARM / Node 22+.

### Fix Cepat (3 langkah)

```bash
# Langkah 1: Hapus node_modules dan reinstall
cd /path/to/AudioDelight
rm -rf node_modules
yarn install

# Langkah 2: Jalankan fix script
node scripts/fix-track-player.js

# Langkah 3: Coba start
yarn start
```

### Fix Manual (kalau script gagal)

```bash
# Cek struktur yang ada
ls node_modules/react-native-track-player/lib/

# Buat direktori kalau belum ada
mkdir -p node_modules/react-native-track-player/lib/src

# Cek apakah ada source TypeScript
ls node_modules/react-native-track-player/src/
```

Kalau ada folder `src/` dengan `.ts` files, compile manual:
```bash
cd node_modules/react-native-track-player
npx tsc --allowJs --declaration false --outDir lib/ 2>/dev/null || true
cd ../../
```

Kalau tidak ada source, buat stub manual:
```bash
cat > node_modules/react-native-track-player/lib/src/trackPlayer.js << 'EOF'
const noop = () => Promise.resolve();
module.exports = { default: { setupPlayer: noop, add: noop, play: noop, pause: noop, stop: noop, reset: noop, skip: noop, skipToNext: noop, skipToPrevious: noop, seekTo: noop, setVolume: noop, setRepeatMode: noop, getActiveTrack: () => Promise.resolve(null), addEventListener: () => ({ remove: () => {} }), registerPlaybackService: () => {}, updateOptions: noop }, State: {Playing:'playing',Paused:'paused',Stopped:'stopped',Loading:'loading',Buffering:'buffering'}, Event: {PlaybackState:'playback-state',PlaybackActiveTrackChanged:'playback-active-track-changed',RemotePlay:'remote-play',RemotePause:'remote-pause',RemoteStop:'remote-stop',RemoteNext:'remote-next',RemotePrevious:'remote-previous',RemoteSeek:'remote-seek',RemoteDuck:'remote-duck'}, RepeatMode:{Off:0,Track:1,Queue:2}, Capability:{Play:'play',Pause:'pause',Stop:'stop',SeekTo:'seek-to',SkipToNext:'skip-to-next',SkipToPrevious:'skip-to-previous'}, AppKilledPlaybackBehavior:{StopPlaybackAndRemoveNotification:0} };
EOF
```

---

## ❌ Error: Expo Go tidak bisa load react-native-audio-api

### Penyebab
`react-native-audio-api` adalah native module — tidak kompatibel dengan Expo Go standar.

### Fix
Butuh development build:
```bash
# Option 1: Build + run langsung ke device
npx expo run:android

# Option 2: Build APK via EAS (butuh akun Expo)
eas build --platform android --profile preview
```

---

## ❌ Error: Metro bundler - "Unable to resolve module"

```bash
# Clear cache Metro + restart
npx expo start --clear
```

---

## ❌ AudioContext tidak jalan di emulator

Emulator Android sering tidak support real-time audio dengan baik. **Selalu test di device fisik.**

Enable USB Debugging:
1. Settings → About Phone → tap Build Number 7x
2. Settings → Developer Options → USB Debugging: ON
3. Koneksi USB ke PC
4. `adb devices` → pastikan device muncul
5. `yarn android`

---

## ❌ Error: RNTP / audio berhenti saat screen off (background)

Pastikan `app.json` punya:
```json
{
  "android": {
    "permissions": ["android.permission.FOREGROUND_SERVICE", "android.permission.WAKE_LOCK"]
  }
}
```

Dan `TrackPlayerService` sudah disetup dengan benar (sudah ada di `src/services/TrackPlayerService.ts`).
