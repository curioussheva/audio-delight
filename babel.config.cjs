module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@/app':        './src/app',
            '@/features':   './src/features',
            '@/shared':     './src/shared',
            '@/components': './src/shared/components',
            '@/ui':         './src/shared/components/ui',
            '@/hooks':      './src/shared/hooks',
            '@/utils':      './src/shared/utils',
            '@/types':      './src/shared/types',
            '@/constants':  './src/shared/constants',
            '@/context':    './src/shared/context',
            '@/assets':     './assets',
            '@':            './src',
            'expo-file-system': 'expo-file-system/legacy',
          },
        },
      ],
      'react-native-reanimated/plugin',
    ],
  };
}; 