const fs = require('fs');

const homeTabPath = 'src/components/tabs/HomeTab.jsx';
let content = fs.readFileSync(homeTabPath, 'utf8');

const featuresPart1 = fs.readFileSync('home_features_part.jsx', 'utf8');

// Also extract the features that were at the very end of old_app.js (lines 22440-22600 approx)
// I'll grab them from old_app.js directly using a regex or known string.
const oldApp = fs.readFileSync('old_app.js', 'utf8');
const searchStart = '<h2>AI oturum planlayici</h2>';
let featuresPart2 = '';

const startIndex = oldApp.indexOf('<section className="features">\n            <div className="steps-header">\n              ' + searchStart);
if (startIndex !== -1) {
  const endIndex = oldApp.indexOf('<div id="operations" className="section-anchor" />', startIndex);
  if (endIndex !== -1) {
    featuresPart2 = oldApp.substring(startIndex, endIndex);
  }
}

const closingTagIndex = content.lastIndexOf('</div>\n    );\n}');

if (closingTagIndex !== -1) {
  const modifiedContent = 
    content.substring(0, closingTagIndex) + 
    '\n' + featuresPart1 + '\n' + featuresPart2 + '\n' + 
    content.substring(closingTagIndex);
  
  fs.writeFileSync(homeTabPath, modifiedContent);
  console.log('Successfully injected into HomeTab.jsx');
} else {
  console.error('Could not find closing tag in HomeTab.jsx');
}
