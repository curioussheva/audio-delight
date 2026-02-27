const fs = require('fs');
const path = require('path');
const libSrc = path.join(__dirname,'..','node_modules','react-native-track-player','lib','src');

if (!fs.existsSync(libSrc)) { console.log('RNTP not installed'); process.exit(0); }

// Step 1: trackPlayer.js harus ESM
const tpFile = path.join(libSrc, 'trackPlayer.js');
const esmStub = `export const setupPlayer=()=>Promise.resolve();
export const add=()=>Promise.resolve();
export const play=()=>Promise.resolve();
export const pause=()=>Promise.resolve();
export const stop=()=>Promise.resolve();
export const reset=()=>Promise.resolve();
export const skip=()=>Promise.resolve();
export const skipToNext=()=>Promise.resolve();
export const skipToPrevious=()=>Promise.resolve();
export const seekTo=()=>Promise.resolve();
export const setVolume=()=>Promise.resolve();
export const setRepeatMode=()=>Promise.resolve();
export const getActiveTrack=()=>Promise.resolve(null);
export const getProgress=()=>Promise.resolve({position:0,duration:0,buffered:0});
export const addEventListener=()=>({remove:()=>{}});
export const registerPlaybackService=()=>{};
export const updateOptions=()=>Promise.resolve();`;
const needsRewrite = !fs.existsSync(tpFile) || fs.readFileSync(tpFile,'utf8').includes('module.exports');
if (needsRewrite) { fs.writeFileSync(tpFile, esmStub); console.log('✅ trackPlayer.js → ESM stub'); }

// Step 2: patch index.js - tambah .js extension
['index.js','constants/index.js','hooks/index.js','interfaces/index.js'].forEach(rel => {
  const fp = path.join(libSrc, rel);
  if (!fs.existsSync(fp)) return;
  let c = fs.readFileSync(fp, 'utf8'), orig = c;
  // dari './foo' → './foo.js' kecuali kalau sudah ada .js
  c = c.replace(/from '(\.[^']+)'/g, (m,p)=> p.endsWith('.js')?m:`from '${p}.js'`);
  // ./constants.js → ./constants/index.js kalau folder
  c = c.replace(/from '(\.\/(?:constants|hooks|interfaces))\.js'/g, (m,p)=>{
    return fs.existsSync(path.join(libSrc,p.replace('./',''),'index.js'))?`from '${p}/index.js'`:m;
  });
  if (c!==orig) { fs.writeFileSync(fp,c); console.log(`✅ Patched ${rel}`); }
});
console.log('✅ Fix selesai. Run: yarn start');
