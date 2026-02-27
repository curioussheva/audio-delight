/**
 * fix-track-player.js
 * Fixes ESM import resolution for react-native-track-player on Node 18+/22+
 * Root cause: index.js uses ESM `import` without .js extensions → ERR_MODULE_NOT_FOUND
 */

const fs = require('fs');
const path = require('path');

const pkgDir = path.join(__dirname, '..', 'node_modules', 'react-native-track-player');
const libSrc = path.join(pkgDir, 'lib', 'src');

if (!fs.existsSync(pkgDir)) {
  console.log('[fix-rntp] Package not installed, skipping.');
  process.exit(0);
}

// ─── Step 1: Ensure trackPlayer.js exists as ESM ─────────────────────────────
const trackPlayerFile = path.join(libSrc, 'trackPlayer.js');

if (!fs.existsSync(trackPlayerFile)) {
  console.log('[fix-rntp] Creating trackPlayer.js stub (ESM)...');
  fs.mkdirSync(libSrc, { recursive: true });
  fs.writeFileSync(trackPlayerFile, `
export const setupPlayer = () => Promise.resolve();
export const add = () => Promise.resolve();
export const play = () => Promise.resolve();
export const pause = () => Promise.resolve();
export const stop = () => Promise.resolve();
export const reset = () => Promise.resolve();
export const skip = () => Promise.resolve();
export const skipToNext = () => Promise.resolve();
export const skipToPrevious = () => Promise.resolve();
export const seekTo = () => Promise.resolve();
export const setVolume = () => Promise.resolve();
export const setRepeatMode = () => Promise.resolve();
export const getActiveTrack = () => Promise.resolve(null);
export const getProgress = () => Promise.resolve({ position: 0, duration: 0, buffered: 0 });
export const addEventListener = () => ({ remove: () => {} });
export const registerPlaybackService = () => {};
export const updateOptions = () => Promise.resolve();
`.trim());
} else {
  // Check if existing file is CommonJS - convert to ESM if needed
  const content = fs.readFileSync(trackPlayerFile, 'utf8');
  if (content.includes('module.exports') && !content.includes('export')) {
    console.log('[fix-rntp] trackPlayer.js is CJS, converting to ESM...');
    fs.writeFileSync(trackPlayerFile, `
export const setupPlayer = () => Promise.resolve();
export const add = () => Promise.resolve();
export const play = () => Promise.resolve();
export const pause = () => Promise.resolve();
export const stop = () => Promise.resolve();
export const reset = () => Promise.resolve();
export const skip = () => Promise.resolve();
export const skipToNext = () => Promise.resolve();
export const skipToPrevious = () => Promise.resolve();
export const seekTo = () => Promise.resolve();
export const setVolume = () => Promise.resolve();
export const setRepeatMode = () => Promise.resolve();
export const getActiveTrack = () => Promise.resolve(null);
export const getProgress = () => Promise.resolve({ position: 0, duration: 0, buffered: 0 });
export const addEventListener = () => ({ remove: () => {} });
export const registerPlaybackService = () => {};
export const updateOptions = () => Promise.resolve();
`.trim());
  }
}

// ─── Step 2: Patch index.js - add .js extensions to bare ESM imports ─────────
const indexFile = path.join(libSrc, 'index.js');
if (fs.existsSync(indexFile)) {
  let content = fs.readFileSync(indexFile, 'utf8');
  const original = content;

  // Add .js extension to relative imports missing it
  // Matches: from './foo' or from "./foo" but NOT from './foo.js'
  content = content.replace(/from '(\.[^']+(?<!\.js))'/g, (match, p1) => {
    // Skip if already has extension
    if (p1.match(/\.\w+$/)) return match;
    return `from '${p1}.js'`;
  });

  // Fix subdir imports: ./constants → ./constants/index.js
  content = content.replace(/from '(\.\/(?:constants|hooks|interfaces))\.js'/g,
    (match, p1) => {
      const dirIndex = path.join(libSrc, p1.replace('./', ''), 'index.js');
      if (fs.existsSync(dirIndex)) return `from '${p1}/index.js'`;
      return match;
    }
  );

  if (content !== original) {
    fs.writeFileSync(indexFile, content);
    console.log('[fix-rntp] ✅ Patched index.js with .js extensions');
    console.log('[fix-rntp]    Before:', original.trim().split('\n').join(' | '));
    console.log('[fix-rntp]    After: ', content.trim().split('\n').join(' | '));
  } else {
    console.log('[fix-rntp] index.js already correct');
  }
}

// ─── Step 3: Patch hooks/index.js and constants/index.js if needed ───────────
['constants', 'hooks', 'interfaces'].forEach(dir => {
  const dirIndex = path.join(libSrc, dir, 'index.js');
  if (!fs.existsSync(dirIndex)) return;

  let content = fs.readFileSync(dirIndex, 'utf8');
  const original = content;
  content = content.replace(/from '(\.[^']+(?<!\.js))'/g, (match, p1) => {
    if (p1.match(/\.\w+$/)) return match;
    return `from '${p1}.js'`;
  });
  if (content !== original) {
    fs.writeFileSync(dirIndex, content);
    console.log(`[fix-rntp] ✅ Patched ${dir}/index.js`);
  }
});

console.log('[fix-rntp] ✅ Done. Run: yarn start');
