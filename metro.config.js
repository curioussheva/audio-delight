const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const config = getDefaultConfig(__dirname);
config.resolver.extraNodeModules = {
  'react-native-track-player': path.resolve(__dirname, 'src/mocks/react-native-track-player.js'),
};
module.exports = config;
