// injectLand.js
const fs = require('fs');

let content = fs.readFileSync('src/App.js', 'utf8');
let lines = content.split('\n');

const landCode = fs.readFileSync('src/temp_land.jsx', 'utf8');

// The lines array is 0-indexed.
// Target start: `{(bottomTab === "land" || (bottomTab === "demos" && isDemoVisible("land"))) ? (` (approx L13932)
// Target end: `) : null}` before `{bottomTab === "home" && (` (approx L14548)

const keep1 = lines.slice(0, 13931).join('\n'); // 1 to 13931
const keep2 = lines.slice(14549).join('\n'); // 14550 to EOF (Wait, L14550 is the blank line before home)

// Let's refine the ranges based on the sed output I saw earlier.
// 13930:             ) : null}
// 13931: 
// 13932:             {(bottomTab === "land" || (bottomTab === "demos" && isDemoVisible("land"))) ? (

// 14546:               </section>
// 14547:             ) : null}
// 14548: 
// 14549: 
// 14550:             {bottomTab === "home" && (

const finalContent = keep1 + '\n' + '            {(bottomTab === "land" || (bottomTab === "demos" && isDemoVisible("land"))) && (\n' + landCode + '\n            )}' + '\n' + keep2;

fs.writeFileSync('src/App.js', finalContent);
console.log('Successfully injected Land Dashboard and replaced legacy valuation form!');
