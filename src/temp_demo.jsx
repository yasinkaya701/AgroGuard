<div className="demo-dashboard bento-grid pb-24">
    <div className="demo-hero col-span-full">
        <div className="hero-badge">Simülasyon Modülleri</div>
        <h1>Finans & Verim Laboratuvarı</h1>
        <p>Aşağıdaki araçları kullanarak mahsulünüzün tahmini verimini, maliyetini ve ekonomik stres senaryolarını test edebilirsiniz.</p>
    </div>

    {/* EKONOMİ SİMÜLATÖRÜ */}
    <div className="bento-card col-span-3">
        <div className="card-header">
            <Calculator className="accent-icon" size={20} />
            <h3>Bilanço ve Kar/Zarar Senaryosu</h3>
        </div>

        <div className="simulation-inputs mt-4">
            <div className="grid grid-cols-2 gap-4">
                <label className="smart-input">
                    <span>Hedef Mahsul</span>
                    <select value={econCrop || selectedPlant?.id || ""} onChange={(e) => setEconCrop(e.target.value)}>
                        <option value="">Arazi Ürünü Seç</option>
                        {Object.keys(cropLabelMap).map((key) => (
                            <option key={key} value={key}>{cropLabelMap[key]}</option>
                        ))}
                    </select>
                </label>
                <label className="smart-input">
                    <span>Ekim Alanı (Dönüm)</span>
                    <input type="number" min="0" value={econArea} onChange={(e) => setEconArea(e.target.value)} />
                </label>
                <label className="smart-input">
                    <span>Beklenen Verim (kg/da)</span>
                    <input type="number" min="0" value={econYield} onChange={(e) => setEconYield(e.target.value)} />
                </label>
                <label className="smart-input">
                    <span>Satış Fiyatı (TL/kg)</span>
                    <input type="number" min="0" value={econPrice} onChange={(e) => setEconPrice(e.target.value)} />
                </label>
            </div>

            <div className="flex gap-2 mt-4">
                <button className="btn-secondary w-full" onClick={() => {
                    setEconArea(50);
                    setEconYield(econYieldAuto || 650);
                    setEconPrice(economyPlannerData?.signals?.suggestedPriceTlKg || econPriceAuto || 18);
                }}>Pazar Ortalaması Çek</button>
                <button className="btn-secondary text-red-500 w-full" onClick={() => {
                    setEconArea(50);
                    setEconYield(Math.max(300, Number(econYieldAuto || 500) - 150));
                    setEconPrice(Math.max(10, Number(econPriceAuto || 16) - 5));
                }}>Stres Testi C (Kötü)</button>
            </div>
        </div>

        <div className="simulation-results mt-6">
            <div className="kpi-grid">
                <div className="kpi-box">
                    <small>Toplam Ciro</small>
                    <strong className="text-emerald-500">{econTotals.revenue.toLocaleString("tr-TR")} TL</strong>
                </div>
                <div className="kpi-box">
                    <small>Operasyonel Maliyet</small>
                    <strong className="text-rose-500">-{econTotals.cost.toLocaleString("tr-TR")} TL</strong>
                </div>
                <div className="kpi-box total">
                    <small>Net Kar / Zarar</small>
                    <strong className={econTotals.net >= 0 ? "text-emerald-600" : "text-rose-600"}>
                        {econTotals.net.toLocaleString("tr-TR")} TL
                    </strong>
                </div>
            </div>

            <div className="secondary-metrics flex justify-between mt-4 p-4 bg-black/5 rounded-xl border border-black/10">
                <div className="metric">
                    <span className="text-gray-500 block text-xs">Yatırım Getirisi (ROI)</span>
                    <strong className="text-lg">%{econTotals.roi}</strong>
                </div>
                <div className="metric">
                    <span className="text-gray-500 block text-xs">Başa Baş Verim</span>
                    <strong className="text-lg">{Math.round(econTotals.breakEvenYield).toLocaleString("tr-TR")} kg/da</strong>
                </div>
                <div className="metric">
                    <span className="text-gray-500 block text-xs">Birim Maliyet (TL/kg)</span>
                    <strong className="text-lg">{econTotals.unitCostKg.toFixed(2)} TL</strong>
                </div>
            </div>
        </div>
    </div>

    {/* VERİM SİMÜLATÖRÜ */}
    <div className="bento-card col-span-3">
        <div className="card-header">
            <TrendingDown className="accent-icon" size={20} />
            <h3>Hastalık ve Rekolte Şok Testleri</h3>
        </div>
        <div className="flex flex-col md:flex-row gap-6 mt-4">
            <div className="flex-1 space-y-4">
                <label className="smart-slider">
                    <div className="flex justify-between mb-1">
                        <span>İklim Şoku Etkisi</span>
                        <strong>{demoYieldModel.climateImpact}%</strong>
                    </div>
                    <input type="range" min="-50" max="30" value={demoYieldModel.climateImpact} onChange={(e) => setDemoYieldModel((prev) => ({ ...prev, climateImpact: e.target.value }))} className="w-full accent-emerald-500" />
                </label>
                <label className="smart-slider">
                    <div className="flex justify-between mb-1">
                        <span>Zararlı Patojen Etkisi</span>
                        <strong className="text-rose-500">{demoYieldModel.diseaseImpact}%</strong>
                    </div>
                    <input type="range" min="-80" max="10" value={demoYieldModel.diseaseImpact} onChange={(e) => setDemoYieldModel((prev) => ({ ...prev, diseaseImpact: e.target.value }))} className="w-full accent-rose-500" />
                </label>
                <label className="smart-slider">
                    <div className="flex justify-between mb-1">
                        <span>Gübre / İlaç Başarısı</span>
                        <strong>{demoYieldModel.operationImpact}%</strong>
                    </div>
                    <input type="range" min="-30" max="50" value={demoYieldModel.operationImpact} onChange={(e) => setDemoYieldModel((prev) => ({ ...prev, operationImpact: e.target.value }))} className="w-full accent-blue-500" />
                </label>
            </div>

            <div className="flex-1 bg-black/5 p-5 rounded-2xl border border-black/10 flex flex-col justify-center">
                <h4 className="text-sm text-gray-500 uppercase tracking-wider mb-2">Tahmini Rekabet Gücü</h4>
                <div className="text-4xl font-light tracking-tight mb-2">
                    {demoYieldForecast.scenarios[1]?.totalYieldKg.toLocaleString("tr-TR") || 0} <span className="text-lg text-gray-500">kg/hasat</span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                    <Activity size={16} className={demoYieldForecast.baseImpactPct < 0 ? "text-rose-500" : "text-emerald-500"} />
                    <span className={`text-sm font-medium ${demoYieldForecast.baseImpactPct < 0 ? "text-rose-500" : "text-emerald-500"}`}>
                        Yıl Başı Tahminine Kıyasla %{demoYieldForecast.baseImpactPct}
                    </span>
                </div>
            </div>
        </div>
    </div>

    {/* EMLAK DEĞER SİMÜLATÖRÜ */}
    <div className="bento-card col-span-3">
        <div className="card-header">
            <Landmark className="accent-icon" size={20} />
            <h3>Gerçek Zamanlı Arazi Değerlemesi</h3>
        </div>

        <div className="flex items-start gap-6 mt-4">
            <div className="flex-1">
                <div className="land-value-hero p-6 rounded-2xl bg-gradient-to-br from-indigo-50/50 to-blue-50/30 border border-indigo-100 mb-4 text-center">
                    <span className="text-indigo-900/60 font-medium tracking-wide text-sm uppercase">Yapay Zeka Rayiç Bedeli</span>
                    <div className="text-3xl font-semibold text-indigo-950 mt-1 mb-2">
                        {landPriceData?.priceTlDa ? Number(landPriceData.priceTlDa).toLocaleString("tr-TR") : econLandValue.toLocaleString("tr-TR")} <span className="text-lg text-indigo-900/40">TL/da</span>
                    </div>
                    {landPriceData?.confidenceScore && (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold">
                            <ShieldCheck size={14} /> %{Math.round(Number(landPriceData.confidenceScore) * 100)} Algoritma Güveni
                        </div>
                    )}
                </div>
                <p className="text-sm text-gray-500 leading-relaxed">Sistem, piyasadaki güncel veri sağlayıcılarını (API) kullanarak seçilen bölge için optimum hektar değeri üretir.</p>
            </div>

            <div className="flex-1 space-y-3">
                {landPriceLoading && (
                    <div className="p-4 rounded-xl bg-gray-50 border border-gray-100 text-center text-sm text-gray-500 flex items-center justify-center gap-2">
                        <Loader2 size={16} className="spinning" /> Piyasalar Taranıyor...
                    </div>
                )}
                {landPriceData?.providerResults && landPriceData.providerResults.slice(0, 3).map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors">
                        <span className="text-sm font-medium text-gray-700">{item.sourceTitle || item.source}</span>
                        <strong className="text-sm text-gray-900">{Number(item.priceTlDa).toLocaleString("tr-TR")} TL</strong>
                    </div>
                ))}
                {!landPriceData && !landPriceLoading && (
                    <div className="p-4 rounded-xl border border-dashed border-gray-300 text-center text-sm text-gray-400">
                        Hassas değerleme için lütfen konum belirtin.
                    </div>
                )}
            </div>
        </div>
    </div>
</div>
