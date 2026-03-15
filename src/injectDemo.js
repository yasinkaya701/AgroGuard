// injectDemo.js
const fs = require('fs');

let content = fs.readFileSync('src/App.js', 'utf8');
let lines = content.split('\n');

const demoCode = fs.readFileSync('src/temp_demo.jsx', 'utf8');

// The lines array is 0-indexed.
// lines[14620] is the blank line before `<div className="demo-dashboard">`

const keep1 = lines.slice(0, 14621).join('\n'); // 1 to 14621

// lines[21114] is the blank line before `{ showBackTop && (`
// lines[21232] is the closing `}` for `showQuickModal`
const keep2 = lines.slice(21114, 21233).join('\n'); // 21115 to 21233

// lines[21287] is the blank line after the final demo block's closing `}`
const keep3 = lines.slice(21287).join('\n'); // 21288 to EOF

const finalContent = keep1 + '\n' + demoCode + '\n' + keep2 + '\n' + keep3;

fs.writeFileSync('src/App.js', finalContent);
console.log('Successfully injected Demo Dashboard and cleanly removed over 6000 lines of legacy code!');
