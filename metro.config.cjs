const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Optional: Matikan watcher feature yang deprecated (hilangkan warning)
config.watchFolders = [__dirname];
config.resolver.unstable_enablePackageExports = false; // optional, stabilkan resolution

// Optional: tambah jika kamu pakai banyak symlink atau custom resolver
config.resolver.sourceExts.push('cjs', 'mjs');

module.exports = config;