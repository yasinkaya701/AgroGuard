const fs = require('fs');
const content = fs.readFileSync('src/App.js', 'utf8');
const lines = content.split('\n');
const homeCode = fs.readFileSync('src/temp_home.jsx', 'utf8');

// Insert the new home code at line 15141
const before = lines.slice(0, 15140).join('\n');
// Skip up to line 16903 (which is index 16903 in zero-based, because we skip the old code)
const after = lines.slice(16903).join('\n');

fs.writeFileSync('src/App.js', before + '\n' + homeCode + '\n' + after);
console.log('Successfully injected telemetry-dashboard and removed legacy home code!');
