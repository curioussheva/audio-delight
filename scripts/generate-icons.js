const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

async function generateIcons() {
  const inputSvg = path.join(__dirname, '../assets/icon.svg');
  const svgBuffer = fs.readFileSync(inputSvg);
  
  for (const [outputPath, size] of Object.entries(sizes)) {
    const fullPath = path.join(__dirname, '../android/app/src/main/res', outputPath);
    const dir = path.dirname(fullPath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    try {
      const resvg = new Resvg(svgBuffer, {
        fitTo: {
          mode: 'width',
          value: size
        }
      });
      
      const pngData = resvg.render();
      fs.writeFileSync(fullPath, pngData.asPng());
      
      console.log(`✅ Generated: ${outputPath} (${size}x${size})`);
    } catch (err) {
      console.error(`❌ Failed: ${outputPath} - ${err.message}`);
    }
  }
}