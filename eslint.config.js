import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import globals from 'globals';

export default [
  // 1. Rekomendasi ESLint dasar
  js.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      // MENENTUKAN GLOBAL VARIABLES
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
        // Global khusus React Native / Expo
        __DEV__: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        require: 'readonly',
        Buffer: 'readonly',
        module: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // Aturan TypeScript
      ...tsPlugin.configs.recommended.rules,
      
      // Kustomisasi Aturan
      'no-unused-vars': 'off', // Dimatikan agar tidak bentrok dengan TS
      '@typescript-eslint/no-unused-vars': ['warn', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_' 
      }],
      
      // Audio Dev: Izinkan console.warn/error untuk monitor buffer
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      
      // React Native sering pakai require untuk assets
      'no-undef': 'error',
    },
  },

  {
    ignores: [
      'node_modules/**',
      'android/**',
      'ios/**',
      'dist/**',
      'build/**',
      '.expo/**',
      '*.config.js',
      'scripts/*.js',
    ],
  },
];
 