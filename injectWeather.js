const fs = require('fs');

const weatherTabPath = 'src/components/tabs/WeatherTab.jsx';
let content = fs.readFileSync(weatherTabPath, 'utf8');

const weatherFeatures = fs.readFileSync('weather_features_part.jsx', 'utf8');

// I will replace most of the content inside the return (line 11 to 101 approx)
// Let's find the first div inside the return and the last one.
const startIndex = content.indexOf('<div className="tab-page"');
const endIndex = content.lastIndexOf('</div>\n    );');

if (startIndex !== -1 && endIndex !== -1) {
    const modifiedContent = 
        content.substring(0, startIndex) +
        '<div className="tab-page premium-styled">\n' + 
        weatherFeatures +
        '\n        </div>' +
        content.substring(endIndex + 6);
    
    fs.writeFileSync(weatherTabPath, modifiedContent);
    console.log('Successfully injected into WeatherTab.jsx');
} else {
    console.error('Could not find injection points in WeatherTab.jsx');
}
