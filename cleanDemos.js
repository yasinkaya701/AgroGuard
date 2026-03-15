const fs = require('fs');
const demosTabPath = 'src/components/tabs/DemosTab.jsx';
let content = fs.readFileSync(demosTabPath, 'utf8');

// Remove redundant bottomTab === "demos" checks
// We want to keep the content inside but remove the conditional wrapper logic.
// This is tricky with regex if there are nested braces, but let's try a simple approach for common patterns.

// Pattern 1: {bottomTab === "demos" ? ... : null}
content = content.replace(/\{bottomTab === "demos" \? \(([\s\S]*?)\) : null\}/g, '$1');
content = content.replace(/\{bottomTab === "demos" \? ([\s\S]*?) : null\}/g, '$1');

// Pattern 2: {bottomTab === "demos" && ... && (
content = content.replace(/\{bottomTab === "demos" && /g, '{');

fs.writeFileSync(demosTabPath, content);
console.log('Cleaned up DemosTab.jsx');
