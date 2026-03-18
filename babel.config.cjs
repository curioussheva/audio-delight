module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./src'],
          alias: {
            '@': './src',
            '@components': './src/components',
            '@hooks': './src/hooks',
            '@store': './src/store',
            '@utils': './src/utils',
            '@constants': './src/constants',
            '@types': './src/types',
          },
        },
      ],
      // Reanimated plugin HARUS paling akhir
      'react-native-reanimated/plugin',
    ],
  };
};