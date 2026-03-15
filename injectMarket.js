const fs = require('fs');

const marketTabPath = 'src/components/tabs/MarketTab.jsx';
let content = fs.readFileSync(marketTabPath, 'utf8');

const marketFeatures = fs.readFileSync('market_features_part.jsx', 'utf8');

// I will replace the content within the tab-page div.
const startIndex = content.indexOf('<div className="tab-page">');
const endIndex = content.lastIndexOf('</div>\n    );');

if (startIndex !== -1 && endIndex !== -1) {
    const modifiedContent = 
        content.substring(0, startIndex) +
        '<div className="tab-page premium-styled">\n' + 
        marketFeatures +
        '\n        </div>' +
        content.substring(endIndex + 6);
    
    fs.writeFileSync(marketTabPath, modifiedContent);
    console.log('Successfully injected into MarketTab.jsx');
} else {
    console.error('Could not find injection points in MarketTab.jsx');
}
