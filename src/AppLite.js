import React, { useMemo, useState } from "react";
import "./App.css";

const cropOptions = [
  { id: "tomato", name: "Domates" },
  { id: "pepper", name: "Biber" },
  { id: "cucumber", name: "Salatalik" },
  { id: "wheat", name: "Bugday" }
];

export default function AppLite() {
  const [selectedCrop, setSelectedCrop] = useState("tomato");
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState(null);

  const selectedLabel = useMemo(
    () => cropOptions.find((item) => item.id === selectedCrop)?.name || selectedCrop,
    [selectedCrop]
  );

  const analyzeDemo = () => {
    const now = new Date().toLocaleString("tr-TR");
    setResult({
      name: `${selectedLabel} - Yaprak Lekesi Riski`,
      confidence: 78,
      severity: "orta",
      at: now,
      actions: [
        "Sabah saatlerinde yaprak alti kontrolu yapin.",
        "Sulamayi kok bolgesine yonlendirin.",
        "3 gun sonra tekrar fotograf cekin."
      ]
    });
  };

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-top">
          <div className="logo">
            <span>AgroGuard Lite</span>
          </div>
          <div className="hero-badge subtle">Guvenli Baslangic Modu</div>
        </div>
        <div className="hero-grid">
          <div className="hero-copy">
            <h1>Uygulama acildi. Temel mod aktif.</h1>
            <p>Stabil calisma icin sade mod acildi. Analiz ve rapor ekrani kullanima hazir.</p>
          </div>
        </div>
      </header>

      <section className="panel">
        <h2>Hizli Teshis</h2>
        <div className="panel-actions">
          <label className="plant-select">
            <span>Bitki</span>
            <select value={selectedCrop} onChange={(e) => setSelectedCrop(e.target.value)}>
              {cropOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="plant-select">
            <span>Fotograf</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFileName(e.target.files?.[0]?.name || "")}
            />
            <small className="muted">{fileName || "Dosya secilmedi"}</small>
          </label>
          <button className="primary" onClick={analyzeDemo}>
            Demo analiz calistir
          </button>
        </div>
      </section>

      {result ? (
        <section className="result-card compact">
          <h3>{result.name}</h3>
          <p>
            Guven %{result.confidence} • Siddet: {result.severity}
          </p>
          <small className="muted">Tarih: {result.at}</small>
          <ul>
            {result.actions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
