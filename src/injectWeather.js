const fs = require('fs');
const content = fs.readFileSync('src/App.js', 'utf8');
const lines = content.split('\n');
const weatherCode = fs.readFileSync('src/temp_weather.jsx', 'utf8');

// Insert the new weather code at line 13725
const before = lines.slice(0, 13724).join('\n');
// Skip up to line 14518
const after = lines.slice(14518).join('\n');

fs.writeFileSync('src/App.js', before + '\n' + weatherCode + '\n' + after);
console.log('Successfully injected weather-dashboard and removed legacy weather code!');
