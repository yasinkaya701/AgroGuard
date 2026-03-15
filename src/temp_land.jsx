<div className="land-dashboard bento-grid pb-24">
    <div className="land-hero col-span-full">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
                <div className="hero-badge">Gayrimenkul Değerleme</div>
                <h1>{[effectiveLandCity, landDemo?.district, landDemo?.neighborhood].filter(Boolean).join(" / ") || "Arazi Konumu Belirtilmedi"}</h1>
                <p className="max-w-2xl text-gray-400 mt-2">Yapay zeka modellerimiz, bölgedeki 1000+ emsal veriyi tarayarak araziniz için en gerçekçi rayiç bedeli hesaplar.</p>
            </div>
            <div className="flex gap-2">
                <button className="btn-secondary" onClick={() => setLandRefreshKey(p => p + 1)}>
                    <Sparkles size={16} className="text-amber-400" /> Veriyi Yenile
                </button>
                <button className="btn-secondary" onClick={() => trainCustomLandPriceModel({ prefetch: true })}>
                    <Activity size={16} /> Modeli Eğit
                </button>
            </div>
        </div>

        <div className="valuation-strip mt-8 grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="valuation-card main">
                <span className="label">Birim Fiyat</span>
                <div className="value">
                    {Number(landPriceData?.priceTlDa || 0).toLocaleString("tr-TR")} <small>TL/da</small>
                </div>
                <div className={`trend ${Number((landMlData?.confidenceScore || 0) * 100) > 70 ? "positive" : "neutral"}`}>
                    Model Güveni: %{Math.round(Number((landMlData?.confidenceScore || 0) * 100))}
                </div>
            </div>
            <div className="valuation-card">
                <span className="label">Toplam Değerleme</span>
                <div className="value">
                    {Number(landValuationDemo?.total || 0).toLocaleString("tr-TR")} <small>TL</small>
                </div>
                <small className="text-gray-500">{landDemo.areaDa} dekar üzerinden</small>
            </div>
            <div className="valuation-card">
                <span className="label">Yatırım Notu</span>
                <div className="value">{landPriceData?.decisionSignals?.grade || "B-"}</div>
                <div className="badge safe">Yüksek Potansiyel</div>
            </div>
            <div className="valuation-card">
                <span className="label">Geri Dönüş (Amorti)</span>
                <div className="value">{Number(landInvestmentLens.paybackYears || 0).toFixed(1)} <small>Yıl</small></div>
                <small className="text-gray-500">Bölge ortalaması: 18.4 yıl</small>
            </div>
        </div>
    </div>

    {/* PARAMETRE PANELİ */}
    <div className="bento-card col-span-4">
        <div className="card-header">
            <Target className="accent-icon" size={20} />
            <h3>Fiziksel Özellikler & Konfigürasyon</h3>
        </div>

        <div className="location-search-wrapper my-4">
            <div className="search-pill">
                <Map size={18} className="text-gray-400" />
                <input
                    value={locationSearch}
                    onChange={(e) => setLocationSearch(e.target.value)}
                    placeholder="İl, ilçe veya mahalle arayın..."
                    className="bg-transparent border-none outline-none flex-1 text-sm h-10 px-2"
                />
            </div>
            {locationSearchMatches.length > 0 && (
                <div className="search-dropdown">
                    {locationSearchMatches.map((item) => (
                        <button key={item.id} onClick={() => applyLocationSearchHit(item)} className="dropdown-item">
                            <strong>{item.label}</strong>
                            <span>{item.type === 'city' ? 'Şehir' : item.type === 'district' ? 'İlçe' : 'Mahalle'}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mt-6">
            <div className="input-group">
                <label>Eğim Derecesi (%)</label>
                <input type="number" value={landDemo.slopePct} onChange={(e) => setLandDemo(prev => ({ ...prev, slopePct: e.target.value }))} />
            </div>
            <div className="input-group">
                <label>Sulama Durumu</label>
                <select value={landDemo.irrigation} onChange={(e) => setLandDemo(prev => ({ ...prev, irrigation: e.target.value }))}>
                    <option value="var">Mevcut</option>
                    <option value="yok">Yok</option>
                </select>
            </div>
            <div className="input-group">
                <label>Yol Erişimi</label>
                <select value={landDemo.roadAccess} onChange={(e) => setLandDemo(prev => ({ ...prev, roadAccess: e.target.value }))}>
                    <option value="iyi">İyi</option>
                    <option value="orta">Orta</option>
                    <option value="zayif">Zayıf</option>
                </select>
            </div>
            <div className="input-group">
                <label>İmar Durumu</label>
                <select value={landDemo.zoningStatus} onChange={(e) => setLandDemo(prev => ({ ...prev, zoningStatus: e.target.value }))}>
                    <option value="var">İmarlı</option>
                    <option value="kismi">Besihane/Bağ Evi</option>
                    <option value="yok">Yalnızca Tarım</option>
                </select>
            </div>
        </div>

        <div className="flex gap-4 mt-8 border-t border-black/10 pt-6">
            <button className="btn-primary" onClick={saveCurrentLandProfile}>Profillere Kaydet</button>
            <button className="btn-secondary" onClick={() => landProfiles[0] && applyLandProfile(landProfiles[0])}>Son Başarılı Profili Uygula</button>
            <button className="btn-secondary text-red-500 ml-auto" onClick={resetLandDemoListings}>Sıfırla</button>
        </div>
    </div>

    {/* YATIRIM ANALİZİ */}
    <div className="bento-card col-span-2">
        <div className="card-header">
            <Calculator className="accent-icon" size={20} />
            <h3>Yatırım Merceği (Investment Lens)</h3>
        </div>
        <div className="space-y-6 mt-6">
            <div className="flex justify-between items-center bg-black/5 p-4 rounded-2xl">
                <span className="text-gray-500">Yıllık Tahmini Net Gelir</span>
                <strong className="text-emerald-600 text-xl">{Number(landInvestmentLens.annualNetPerDa || 0).toLocaleString("tr-TR")} TL / da</strong>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="p-4 border border-black/10 rounded-2xl">
                    <small className="block text-gray-500 mb-1">Karar Skoru</small>
                    <div className="flex items-center gap-2">
                        <span className={`h-3 w-3 rounded-full ${landActionPlan?.score >= 70 ? "bg-emerald-500" : "bg-amber-500"}`}></span>
                        <strong className="text-lg">{landActionPlan?.score || 0}/100</strong>
                    </div>
                </div>
                <div className="p-4 border border-black/10 rounded-2xl">
                    <small className="block text-gray-500 mb-1">Piyasa Stratejisi</small>
                    <strong className="text-lg">{landActionPlan?.strategy || "Analiz ediliyor..."}</strong>
                </div>
            </div>
            <div className="p-5 bg-gradient-to-r from-indigo-900 to-indigo-800 text-white rounded-2xl shadow-lg relative overflow-hidden">
                <div className="relative z-10">
                    <h4 className="text-indigo-200 text-sm uppercase tracking-wider font-semibold mb-1">Mali Olgunluk Tahmini</h4>
                    <p className="text-xs text-indigo-300/80 mb-4">Bu arazi, bölge verilerine göre %{landActionPlan?.uncertainty || 15} belirsizlik payı ile optimum değerindedir.</p>
                    <div className="flex justify-between items-end">
                        <div>
                            <small className="opacity-60 block">Yatırım Grubu</small>
                            <span className="text-xl font-bold">{landLocationScope?.position || "A+ Class"}</span>
                        </div>
                        <ShieldCheck size={40} className="opacity-20 absolute -right-2 -bottom-2" />
                    </div>
                </div>
            </div>
        </div>
    </div>

    {/* PİYASA KIYASLAMA */}
    <div className="bento-card col-span-2">
        <div className="card-header">
            <Compass className="accent-icon" size={20} />
            <h3>Bölgesel Kıyaslama (Benchmark)</h3>
        </div>
        <div className="mt-6 space-y-4">
            <div className="benchmark-row">
                <div className="flex justify-between mb-2">
                    <span>Mahalle Medyanı</span>
                    <strong>{Number(landDistrictBenchmark?.neighborhoodMedian || 0).toLocaleString("tr-TR")} TL/da</strong>
                </div>
                <div className="benchmark-bar"><span style={{ width: '85%' }}></span></div>
            </div>
            <div className="benchmark-row">
                <div className="flex justify-between mb-2">
                    <span>İlçe Medyanı</span>
                    <strong>{Number(landDistrictBenchmark?.districtMedian || 0).toLocaleString("tr-TR")} TL/da</strong>
                </div>
                <div className="benchmark-bar"><span style={{ width: '65%' }}></span></div>
            </div>
            <div className="benchmark-row">
                <div className="flex justify-between mb-2">
                    <span>İl Medyanı</span>
                    <strong>{Number(landDistrictBenchmark?.cityMedian || 0).toLocaleString("tr-TR")} TL/da</strong>
                </div>
                <div className="benchmark-bar"><span style={{ width: '45%' }}></span></div>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <span className="text-gray-400 text-xs uppercase block mb-1">Mahalle Sırası</span>
                    <strong className="text-2xl font-light text-gray-800">{landLocationScope?.neighborhoodRank || "#4"}</strong>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <span className="text-gray-400 text-xs uppercase block mb-1">İlçe Sırası</span>
                    <strong className="text-2xl font-light text-gray-800">{landLocationScope?.districtRank || "#12"}</strong>
                </div>
            </div>
        </div>
    </div>
</div>
