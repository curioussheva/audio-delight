const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('cjs', 'mjs', 'ts', 'tsx', 'js', 'jsx');

config.watchFolders = [__dirname];

config.resolver.assetExts.push('bin', 'db', 'wav', 'mp3');

config.resolver.unstable_enablePackageExports = true;

// Fix untuk Termux: inotify tidak support, pakai polling
config.watcher = {
  watchman: false,
  healthCheck: {
    enabled: false,
  },
};

module.exports = config;