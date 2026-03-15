const fs = require('fs');
const content = fs.readFileSync('src/App.js', 'utf8');
const lines = content.split('\n');

// Skip lines 14620 to 15417 (developer demo smoke test cruft)
// We preserve the `{bottomTab === 'demos' && (` conditional for the real features
const before = lines.slice(0, 14620).join('\n');
const after = lines.slice(15417).join('\n');

const newDemoTabHeader = `
            {bottomTab === "demos" && (
              <div className="demo-dashboard">
                <div className="demo-hero">
                   <div className="hero-badge">Simülasyon Modülleri</div>
                   <h1>Araziniz İçin Finans & Verim Keşfi</h1>
                   <p>Aşağıdaki araçları kullanarak mahsulünüzün tahmini verimini, maliyetini ve hastalığın ekonomik etkilerini analiz edebilirsiniz.</p>
                </div>
              </div>
            )}
`;

fs.writeFileSync('src/App.js', before + '\n' + newDemoTabHeader + '\n' + after);
console.log('Successfully stripped developer test cruft from Demos Tab!');
