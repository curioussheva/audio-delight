const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Cek apakah kita sedang dalam proses build native atau development biasa
const isEASBuild = process.env.EAS_BUILD === 'true';

if (!isEASBuild) {
  // Hanya gunakan mock saat development di Expo Go agar tidak crash
  config.resolver.extraNodeModules = {
    ...config.resolver.extraNodeModules,
    'react-native-track-player': path.resolve(__dirname, 'src/mocks/react-native-track-player.js'),
  };
}

// Tambahkan dukungan ekstensi yang dibutuhkan SDK 52
config.resolver.sourceExts = [...config.resolver.sourceExts, 'mjs', 'cjs'];

module.exports = config;
 