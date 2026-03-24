const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Tambahkan ekstensi file yang sering digunakan dalam library audio/data
config.resolver.sourceExts.push('cjs', 'mjs', 'ts', 'tsx', 'js', 'jsx');

// Memastikan Metro memantau folder src dan shared dengan benar
config.watchFolders = [__dirname];

// Opsional: Jika Anda menggunakan library native yang butuh akses aset mentah (seperti filter IR/WAV)
config.resolver.assetExts.push('bin', 'db', 'wav', 'mp3');

// Mengaktifkan fitur exports untuk library modern (seperti music-metadata)
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
 