const fs = require('fs');

const demosTabPath = 'src/components/tabs/DemosTab.jsx';
let content = fs.readFileSync(demosTabPath, 'utf8');

const demosFeatures = fs.readFileSync('demos_features_part.jsx', 'utf8');

// I will replace the content within the tab-page div.
const startIndex = content.indexOf('<div className="tab-page">');
const endIndex = content.lastIndexOf('</div>\n    );');

if (startIndex !== -1 && endIndex !== -1) {
    const modifiedContent = 
        content.substring(0, startIndex) +
        '<div className="tab-page premium-styled">\n' + 
        demosFeatures +
        '\n        </div>' +
        content.substring(endIndex + 6);
    
    fs.writeFileSync(demosTabPath, modifiedContent);
    console.log('Successfully injected into DemosTab.jsx');
} else {
    console.error('Could not find injection points in DemosTab.jsx');
}
