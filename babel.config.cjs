module.exports = function (api) {
  // NOTE: api.cache(true) cannot be combined with api.env() (Babel throws
  // "Caching has already been configured with .never or .forever()"), so the
  // cache is keyed on the env instead.
  api.cache.using(() => process.env.BABEL_ENV || process.env.NODE_ENV);
  const isProduction = api.env("production");
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          root: ["./"],
          alias: {
            "@/app": "./src/app",
            "@/features": "./src/features",
            "@/shared": "./src/shared",
            "@/components": "./src/shared/components",
            "@/ui": "./src/shared/components/ui",
            "@/hooks": "./src/shared/hooks",
            "@/utils": "./src/shared/utils",
            "@/types": "./src/shared/types",
            "@/constants": "./src/shared/constants",
            "@/context": "./src/shared/context",
            "@/assets": "./assets",
            "@": "./src",
            //  'expo-file-system': 'expo-file-system/legacy',
          },
        },
      ],
      // V-7: strip console.log/info/debug in production only. `error` and
      // `warn` are excluded: jsLagMonitor/jsLagStats report via console.warn
      // and [PERF] failures via console.error must survive in release.
      // Reanimated stays last.
      ...(isProduction
        ? [["transform-remove-console", { exclude: ["error", "warn"] }]]
        : []),
      "react-native-reanimated/plugin",
    ],
  };
};
