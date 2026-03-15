const fs = require('fs');

const landTabPath = 'src/components/tabs/LandTab.jsx';
let content = fs.readFileSync(landTabPath, 'utf8');

const landFeatures = fs.readFileSync('land_features_part.jsx', 'utf8');

// I will replace the content within the tab-page div.
const startIndex = content.indexOf('<div className="tab-page">');
const endIndex = content.lastIndexOf('</div>\n    );');

if (startIndex !== -1 && endIndex !== -1) {
    const modifiedContent = 
        content.substring(0, startIndex) +
        '<div className="tab-page premium-styled">\n' + 
        landFeatures +
        '\n        </div>' +
        content.substring(endIndex + 6);
    
    fs.writeFileSync(landTabPath, modifiedContent);
    console.log('Successfully injected into LandTab.jsx');
} else {
    console.error('Could not find injection points in LandTab.jsx');
}
