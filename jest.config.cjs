/**
 * Jest hanya untuk logika murni (fungsi tanpa dependensi React Native).
 *
 * Sengaja TIDAK memakai babel-preset-expo: file yang diuji di sini tidak
 * mengimpor react/react-native/expo, jadi ts-jest cukup dan jauh lebih cepat.
 * Kalau nanti mau menguji komponen, buat project Jest terpisah dengan
 * preset react-native + mock yang sesuai - jangan bebankan mock ke sini.
 */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    // Cocokkan alias PALING SPESIFIK lebih dulu - `@/*` di akhir akan
    // menelannya kalau ditaruh di depan.
    "^@/app/(.*)$": "<rootDir>/src/app/$1",
    "^@/features/(.*)$": "<rootDir>/src/features/$1",
    "^@/shared/(.*)$": "<rootDir>/src/shared/$1",
    "^@/components/(.*)$": "<rootDir>/src/shared/components/$1",
    "^@/ui/(.*)$": "<rootDir>/src/shared/components/ui/$1",
    "^@/hooks/(.*)$": "<rootDir>/src/shared/hooks/$1",
    "^@/utils/(.*)$": "<rootDir>/src/shared/utils/$1",
    "^@/types/(.*)$": "<rootDir>/src/shared/types/$1",
    "^@/constants/(.*)$": "<rootDir>/src/shared/constants/$1",
    "^@/context/(.*)$": "<rootDir>/src/shared/context/$1",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: {
          // File yang diuji murni TS; longgarkan agar tidak terseret config RN
          esModuleInterop: true,
          allowJs: true,
          resolveJsonModule: true,
          types: ["jest", "node"],
        },
      },
    ],
  },
  collectCoverageFrom: ["src/shared/types/**/*.ts", "src/shared/utils/**/*.ts"],
  coveragePathIgnorePatterns: ["/node_modules/", "\\.d\\.ts$"],
};
