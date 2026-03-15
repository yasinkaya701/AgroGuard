      {(bottomTab === "land" || (bottomTab === "demos" && isDemoVisible("land"))) ? (
        <section className="features market-quick-create">
          <div className="steps-header">
            <h2>Arazi hizli panel</h2>
            <p>Sehir/ilce/mahalle, toprak ve erisim degerlerini gir; model degeri aninda gunceller.</p>
          </div>
          <div className="step-card tab-quick-head land-quick-head">
            <div className="weather-quick-main">
              <strong>
                {[effectiveLandCity, landDemo?.district, landDemo?.neighborhood].filter(Boolean).join(" / ") || "Arazi konumu secilmedi"}
              </strong>
              <small className="muted">
                {landPriceData?.updatedAt
                  ? `Son guncelleme: ${new Date(landPriceData.updatedAt).toLocaleTimeString("tr-TR")}`
                  : "Arazi fiyat verisi bekleniyor"}
              </small>
            </div>
            <div className="chip-row">
              <span className={`chip ${Number((landMlData?.confidenceScore || landPriceData?.confidenceScore || 0) * 100) < 60 ? "warning" : ""}`}>
                Model guven: %{Math.round(Number((landMlData?.confidenceScore || landPriceData?.confidenceScore || 0) * 100))}
              </span>
              <span className="chip">
                Yatirim: {landPriceData?.decisionSignals?.grade || "-"}
              </span>
            </div>
            <div className="demo-actions">
              <button type="button" className="ghost-button" onClick={() => setLandRefreshKey((prev) => prev + 1)}>
                Arazi verisini yenile
              </button>
            </div>
          </div>
          <div className="quick-kpi-strip">
            <div>
              <span>Birim fiyat</span>
              <strong>{Number(landPriceData?.priceTlDa || 0).toLocaleString("tr-TR")} TL/da</strong>
            </div>
            <div>
              <span>Tahmini toplam</span>
              <strong>{Number(landValuationDemo?.total || 0).toLocaleString("tr-TR")} TL</strong>
            </div>
            <div>
              <span>Model guven</span>
              <strong>%{Math.round(Number((landMlData?.confidenceScore || 0) * 100))}</strong>
            </div>
            <div>
              <span>Profil sayisi</span>
              <strong>{landProfiles.length}</strong>
            </div>
          </div>
          <div className="info-badges">
            <span className={`badge ${landDataReadiness.score >= 75 ? "safe" : "warn"}`}>
              Veri hazirlik: {landDataReadiness.score}/100
            </span>
            <span className="badge">
              Dolu alan: {landDataReadiness.hit}/{landDataReadiness.total}
            </span>
            {landDataReadiness.missing.length ? (
              <span className="badge">Eksik: {landDataReadiness.missing.join(", ")}</span>
            ) : (
              <span className="badge">Tum temel alanlar dolu</span>
            )}
          </div>
          <div className="quick-panel-tabs">
            <button onClick={() => setLandDemo((prev) => ({ ...prev, district: "", neighborhood: "" }))}>
              Konumu temizle
            </button>
            <button
              onClick={() =>
                setLandDemo((prev) => ({
                  ...prev,
                  district: landDistrictLeaders?.high?.district || prev.district
                }))
              }
            >
              Ust ilceyi sec
            </button>
            <button
              onClick={() =>
                setLandDemo((prev) => ({
                  ...prev,
                  district: landDistrictLeaders?.low?.district || prev.district
                }))
              }
            >
              Dusuk ilceyi sec
            </button>
            <button onClick={() => landProfiles[0] && applyLandProfile(landProfiles[0])}>Son profili uygula</button>
          </div>
          <div className="location-search-box">
            <label className="plant-select">
              <span>Konum arama (il / ilce / mahalle)</span>
              <input
                value={locationSearch}
                onChange={(e) => setLocationSearch(e.target.value)}
                placeholder="M yaz: Malatya, Mersin, Merkez..."
              />
            </label>
            {locationSearchMatches.length ? (
              <div className="location-search-hits">
                {locationSearchMatches.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`ghost ${item.type}`}
                    onClick={() => applyLocationSearchHit(item)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="field-grid-3">
            <label className="plant-select">
              <span>Sehir</span>
              <input
                list="location-city-suggestions"
                value={landQuery.city}
                onChange={(e) => handleLandCityInputChange(e.target.value)}
                placeholder={effectiveLandCity}
              />
            </label>
            <label className="plant-select">
              <span>Urun</span>
              <input
                value={landQuery.crop}
                onChange={(e) => setLandQuery((prev) => ({ ...prev, crop: e.target.value }))}
                placeholder={effectiveLandCrop}
              />
            </label>
            <label className="plant-select">
              <span>Koordinat</span>
              <input
                value={fieldLocation.coords}
                placeholder="38.355, 38.309"
                onChange={(e) => setFieldLocation((prev) => ({ ...prev, coords: e.target.value }))}
              />
            </label>
          </div>
          <div className="field-grid-3">
            <label className="plant-select">
              <span>Ilce</span>
                  <input
                    list="location-land-district-suggestions"
                    value={landDemo.district}
                    onChange={(e) => setLandDemo((prev) => ({ ...prev, district: e.target.value, neighborhood: "" }))}
                  />
            </label>
            <label className="plant-select">
              <span>Mahalle</span>
              <input
                list="location-land-neighborhood-suggestions"
                value={landDemo.neighborhood}
                onChange={(e) => setLandDemo((prev) => ({ ...prev, neighborhood: e.target.value }))}
              />
            </label>
            <label className="plant-select">
              <span>Alan (da)</span>
              <input
                type="number"
                min="0"
                value={landDemo.areaDa}
                onChange={(e) => setLandDemo((prev) => ({ ...prev, areaDa: e.target.value }))}
              />
            </label>
          </div>
          <div className="field-grid-3">
            <label className="plant-select">
              <span>Egim (%)</span>
              <input
                type="number"
                min="0"
                max="40"
                value={landDemo.slopePct}
                onChange={(e) => setLandDemo((prev) => ({ ...prev, slopePct: e.target.value }))}
              />
            </label>
            <label className="plant-select">
              <span>Sulama</span>
              <select
                value={landDemo.irrigation}
                onChange={(e) => setLandDemo((prev) => ({ ...prev, irrigation: e.target.value }))}
              >
                <option value="var">Var</option>
                <option value="yok">Yok</option>
              </select>
            </label>
            <label className="plant-select">
              <span>Yol erisimi</span>
              <select
                value={landDemo.roadAccess}
                onChange={(e) => setLandDemo((prev) => ({ ...prev, roadAccess: e.target.value }))}
              >
                <option value="iyi">Iyi</option>
                <option value="orta">Orta</option>
                <option value="zayif">Zayif</option>
              </select>
            </label>
          </div>
          <div className="field-grid-3">
            <label className="plant-select">
              <span>Yola uzaklik (m)</span>
              <input
                type="number"
                min="0"
                step="10"
                value={landDemo.roadDistanceM}
                onChange={(e) => setLandDemo((prev) => ({ ...prev, roadDistanceM: e.target.value }))}
              />
            </label>
            <label className="plant-select">
              <span>Yol gecisi</span>
              <select
                value={landDemo.roadPass}
                onChange={(e) => setLandDemo((prev) => ({ ...prev, roadPass: e.target.value }))}
              >
                <option value="var">Var</option>
                <option value="yok">Yok</option>
              </select>
            </label>
            <label className="plant-select">
              <span>Imar durumu</span>
              <select
                value={landDemo.zoningStatus}
                onChange={(e) => setLandDemo((prev) => ({ ...prev, zoningStatus: e.target.value }))}
              >
                <option value="var">Var</option>
                <option value="kismi">Kismi</option>
                <option value="yok">Yok</option>
              </select>
            </label>
            <label className="plant-select">
              <span>Arazide yapi</span>
              <select
                value={landDemo.structureStatus}
                onChange={(e) => setLandDemo((prev) => ({ ...prev, structureStatus: e.target.value }))}
              >
                <option value="yok">Yok</option>
                <option value="var">Var</option>
              </select>
            </label>
          </div>
          <div className="field-grid-3">
            <label className="plant-select">
              <span>Bolge tipi</span>
              <select
                value={landDemo.zone}
                onChange={(e) => setLandDemo((prev) => ({ ...prev, zone: e.target.value }))}
              >
                <option value="ova">Ova</option>
                <option value="gecis">Gecis</option>
                <option value="yamac">Yamac</option>
              </select>
            </label>
            <label className="plant-select">
              <span>Toprak skoru</span>
              <input
                type="number"
                min="0"
                max="100"
                value={landDemo.soilScore}
                onChange={(e) => setLandDemo((prev) => ({ ...prev, soilScore: e.target.value }))}
              />
            </label>
            <label className="plant-select">
              <span>Profil adi</span>
              <input
                value={landProfileName}
                onChange={(e) => setLandProfileName(e.target.value)}
                placeholder="Orn: Yesilyurt 20da"
              />
            </label>
          </div>
          <div className="field-grid-3">
            <label className="plant-select">
              <span>Parsel durumu</span>
              <select
                value={landDemo.plantedStatus}
                onChange={(e) =>
                  setLandDemo((prev) => ({
                    ...prev,
                    plantedStatus: e.target.value,
                    plantedCrop: e.target.value === "ekili" ? prev.plantedCrop : "",
                    plantedValueTlDa: e.target.value === "ekili" ? prev.plantedValueTlDa : 0
                  }))
                }
              >
                <option value="bos">Bos</option>
                <option value="ekili">Ekili</option>
              </select>
            </label>
            <label className="plant-select">
              <span>Ekili urun</span>
              <input
                value={landDemo.plantedCrop}
                onChange={(e) => setLandDemo((prev) => ({ ...prev, plantedCrop: e.target.value }))}
                placeholder="Orn: domates"
                disabled={landDemo.plantedStatus !== "ekili"}
              />
            </label>
            <label className="plant-select">
              <span>Urun degeri (TL/da)</span>
              <input
                type="number"
                min="0"
                step="100"
                value={landDemo.plantedValueTlDa}
                onChange={(e) => setLandDemo((prev) => ({ ...prev, plantedValueTlDa: e.target.value }))}
                disabled={landDemo.plantedStatus !== "ekili"}
              />
            </label>
          </div>
          <div className="market-quick-actions">
            <button className="primary" onClick={saveCurrentLandProfile}>Profili kaydet</button>
            <button className="ghost" onClick={applyLandFromSoilSignals}>
              Topraktan otomatik doldur
            </button>
            <button className="ghost" onClick={() => trainCustomLandPriceModel({ prefetch: true })}>
              Veriyi cek + modeli guncelle
            </button>
            <button className="ghost" onClick={resetLandDemoListings}>Arazi reset</button>
          </div>
          <div className="market-quick-actions">
            <button
              className="ghost"
              onClick={() =>
                setLandDemo((prev) => ({
                  ...prev,
                  zone: "ova",
                  irrigation: "var",
                  roadAccess: "iyi",
                  roadDistanceM: 120,
                  roadPass: "var",
                  zoningStatus: "kismi",
                  structureStatus: "var",
                  slopePct: 2,
                  soilScore: 84,
                  plantedStatus: "ekili",
                  plantedCrop: effectiveLandCrop || "domates",
                  plantedValueTlDa: 24000
                }))
              }
            >
              Senaryo: verimli ova
            </button>
            <button
              className="ghost"
              onClick={() =>
                setLandDemo((prev) => ({
                  ...prev,
                  zone: "gecis",
                  irrigation: "var",
                  roadAccess: "orta",
                  roadDistanceM: 480,
                  roadPass: "var",
                  zoningStatus: "yok",
                  structureStatus: "yok",
                  slopePct: 6,
                  soilScore: 70,
                  plantedStatus: "ekili",
                  plantedCrop: effectiveLandCrop || "domates",
                  plantedValueTlDa: 14500
                }))
              }
            >
              Senaryo: dengeli arazi
            </button>
            <button
              className="ghost"
              onClick={() =>
                setLandDemo((prev) => ({
                  ...prev,
                  zone: "yamac",
                  irrigation: "yok",
                  roadAccess: "zayif",
                  roadDistanceM: 2200,
                  roadPass: "yok",
                  zoningStatus: "yok",
                  structureStatus: "yok",
                  slopePct: 14,
                  soilScore: 56,
                  plantedStatus: "bos",
                  plantedCrop: "",
                  plantedValueTlDa: 0
                }))
              }
            >
              Senaryo: riskli arazi
            </button>
          </div>
          <div className="market-quick-actions">
            <button className="ghost" onClick={() => setEconLandValue(Number(landValuationDemo?.min || 0))}>
              Temkinli fiyat uygula
            </button>
            <button className="ghost" onClick={() => setEconLandValue(Number(landPriceData?.priceTlDa || 0))}>
              Baz fiyat uygula
            </button>
            <button className="ghost" onClick={() => setEconLandValue(Number(landValuationDemo?.max || 0))}>
              Agresif fiyat uygula
            </button>
            {landMlData?.unitPriceTlDa ? (
              <button className="ghost" onClick={() => setEconLandValue(Number(landMlData.unitPriceTlDa || 0))}>
                ML fiyatini uygula
              </button>
            ) : null}
          </div>
          {landProfileStatus ? <small className="muted">{landProfileStatus}</small> : null}
          {landMlLoading ? <small className="muted">ML modeli egitiliyor...</small> : null}
          {landMlError ? <small className="muted warning-text">{landMlError}</small> : null}
          <div className="info-badges">
            <span className="badge">Birim: {Number(landPriceData?.priceTlDa || 0).toLocaleString("tr-TR")} TL/da</span>
            <span className="badge">Toplam: {Number(landValuationDemo?.total || 0).toLocaleString("tr-TR")} TL</span>
            {landValuationDemo?.planted ? (
              <span className="badge">Ekili urun: {Number(landValuationDemo?.plantedTotal || 0).toLocaleString("tr-TR")} TL</span>
            ) : null}
            <span className="badge">Toplam varlik: {Number(landValuationDemo?.totalWithCrop || landValuationDemo?.total || 0).toLocaleString("tr-TR")} TL</span>
            <span className="badge">Aralik: {Number(landValuationDemo?.min || 0).toLocaleString("tr-TR")} - {Number(landValuationDemo?.max || 0).toLocaleString("tr-TR")} TL/da</span>
          </div>
          {landDistrictBenchmark ? (
            <div className="info-badges">
              {landDistrictBenchmark.neighborhoodMedian ? (
                <span className="badge">Mahalle medyan: {Number(landDistrictBenchmark.neighborhoodMedian).toLocaleString("tr-TR")} TL/da</span>
              ) : null}
              {landDistrictBenchmark.districtMedian ? (
                <span className="badge">Ilce medyan: {Number(landDistrictBenchmark.districtMedian).toLocaleString("tr-TR")} TL/da</span>
              ) : null}
              {landDistrictBenchmark.cityMedian ? (
                <span className="badge">Il medyan: {Number(landDistrictBenchmark.cityMedian).toLocaleString("tr-TR")} TL/da</span>
              ) : null}
            </div>
          ) : null}
          <div className="info-badges">
            {Number.isFinite(Number(landInvestmentLens.annualNetPerDa)) ? (
              <span className="badge">Yillik net/da: {Number(landInvestmentLens.annualNetPerDa).toLocaleString("tr-TR")} TL</span>
            ) : null}
            {landInvestmentLens.paybackYears ? (
              <span className="badge">Geri donus: {Number(landInvestmentLens.paybackYears).toFixed(1)} yil</span>
            ) : null}
            {landMlData?.training?.sampleCount ? (
              <span className="badge">ML ornek: {landMlData.training.sampleCount}</span>
            ) : null}
            {landMlData?.preferredModel ? (
              <span className="badge">Aktif model: {landMlData.preferredModel}</span>
            ) : null}
          </div>
          {landActionPlan ? (
            <div className="info-badges">
              <span className={`badge ${landActionPlan.score >= 70 ? "safe" : "warn"}`}>Karar skoru: {landActionPlan.score}/100</span>
              <span className="badge">Belirsizlik: %{landActionPlan.uncertainty}</span>
              <span className="badge">Strateji: {landActionPlan.strategy}</span>
            </div>
          ) : null}
          {landLocationScope ? (
            <div className="info-badges">
              <span className="badge">Piyasa konumu: {landLocationScope.position}</span>
              <span className="badge">Mahalle sirasi: {landLocationScope.neighborhoodRank}</span>
              <span className="badge">Ilce sirasi: {landLocationScope.districtRank}</span>
              <span className="badge">Guven: %{landSignalQuality.confidencePct}</span>
            </div>
          ) : null}
          <div className="land-comparable-panel">
            <div className="land-comparable-head">
              <strong>Emsal ilan girisi + hizli uygulama</strong>
              <small className="muted">Bu alanla ilce/mahalle bazli emsal veriyi arazi modeline direkt bagla.</small>
            </div>
            <div className="field-grid-3">
              <label className="plant-select">
                <span>Ilce</span>
                <input
                  list="location-manual-district-suggestions"
                  value={manualListingForm.district}
                  onChange={(e) => setManualListingForm((prev) => ({ ...prev, district: e.target.value }))}
                />
              </label>
              <label className="plant-select">
                <span>Mahalle</span>
                <input
                  list="location-manual-neighborhood-suggestions"
                  value={manualListingForm.neighborhood}
                  onChange={(e) => setManualListingForm((prev) => ({ ...prev, neighborhood: e.target.value }))}
                />
              </label>
              <label className="plant-select">
                <span>Fiyat (TL/da)</span>
                <input
                  type="number"
                  min="0"
                  value={manualListingForm.priceTlDa}
                  onChange={(e) => setManualListingForm((prev) => ({ ...prev, priceTlDa: e.target.value }))}
                />
              </label>
            </div>
            <label className="plant-select">
              <span>Ilan basligi</span>
              <input
                value={manualListingForm.title}
                onChange={(e) => setManualListingForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Orn: Yesilyurt satilik tarla"
              />
            </label>
            <div className="market-quick-actions">
              <button className="ghost" onClick={saveManualListing}>
                Ilan ekle
              </button>
              <button className="ghost" onClick={loadLiveLandListings}>
                Canli ilan cek
              </button>
              <button className="ghost" onClick={loadManualListings}>
                Emsal listeyi yenile
              </button>
            </div>
            {manualListingStatus ? <small className="muted">{manualListingStatus}</small> : null}
            {manualListingStats ? (
              <div className="info-badges">
                <span className="badge">Ilan: {manualListingStats.count}</span>
                <span className="badge">Medyan: {manualListingStats.median.toLocaleString("tr-TR")} TL/da</span>
                <span className="badge">Min/Max: {manualListingStats.min.toLocaleString("tr-TR")} / {manualListingStats.max.toLocaleString("tr-TR")}</span>
                <span className="badge">7 gun: %{manualListingStats.weeklyChangePct}</span>
              </div>
            ) : null}
            {landComparableListings.length ? (
              <ul className="marketplace-list">
                {landComparableListings.map((row) => (
                  <li key={`land-comparable-${row.item.id}`}>
                    <strong>{row.item.title || `${row.item.city || "-"} ${row.item.district || ""} ${row.item.neighborhood || ""}`}</strong>
                    <span>
                      {Number(row.item.priceTlDa || 0).toLocaleString("tr-TR")} TL/da • skor {row.score} • {row.item.source || "manual"}
                    </span>
                    <div className="demo-actions">
                      <button className="ghost" onClick={() => applyManualListingToLand(row.item)}>Uygula</button>
                      <button className="ghost" onClick={() => setEconLandValue(Number(row.item.priceTlDa || 0))}>Fiyati uygula</button>
                      <button className="ghost" onClick={() => removeManualListing(row.item.id)}>Sil</button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <small className="muted">Bu konuma uygun emsal ilan bulunamadi.</small>
            )}
          </div>
          {(landDistrictLeaders?.high || landDistrictLeaders?.low) ? (
            <div className="market-quick-actions">
              {landDistrictLeaders?.high ? (
                <button
                  className="ghost"
                  onClick={() => setLandDemo((prev) => ({ ...prev, district: landDistrictLeaders.high.district, neighborhood: "" }))}
                >
                  Ust ilceyi sec: {landDistrictLeaders.high.district}
                </button>
              ) : null}
              {landDistrictLeaders?.low ? (
                <button
                  className="ghost"
                  onClick={() => setLandDemo((prev) => ({ ...prev, district: landDistrictLeaders.low.district, neighborhood: "" }))}
                >
                  Dusuk ilceyi sec: {landDistrictLeaders.low.district}
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="quick-mini-columns">
            <div className="quick-mini-card">
              <strong>Deger karsilastirma</strong>
              <div className="info-badges">
                <span className="badge">Min: {Number(landValuationDemo?.min || 0).toLocaleString("tr-TR")} TL/da</span>
                <span className="badge">Baz: {Number(landValuationDemo?.unitPrice || 0).toLocaleString("tr-TR")} TL/da</span>
                <span className="badge">Max: {Number(landValuationDemo?.max || 0).toLocaleString("tr-TR")} TL/da</span>
                {landMlData?.unitPriceTlDa ? (
                  <span className="badge">ML: {Number(landMlData.unitPriceTlDa || 0).toLocaleString("tr-TR")} TL/da</span>
                ) : null}
              </div>
            </div>
            <div className="quick-mini-card">
              <strong>Konum skoru</strong>
              <div className="info-badges">
                <span className={`badge ${landSignalQuality.score >= 70 ? "safe" : "warn"}`}>
                  Skor: {landSignalQuality.score}/100
                </span>
                <span className="badge">Geo komsu: {landSignalQuality.geoCount}</span>
                <span className="badge">Ort mesafe: {Number(landSignalQuality.avgKm || 0).toFixed(1)} km</span>
              </div>
            </div>
            <div className="quick-mini-card">
              <strong>Emsal farki</strong>
              <div className="info-badges">
                {landDistrictBenchmark?.districtMedian ? (
                  <span className={`badge ${Number(landDistrictBenchmark.deltaPct || 0) <= 12 ? "safe" : "warn"}`}>
                    Ilce medyana fark: %{Number(landDistrictBenchmark.deltaPct || 0).toFixed(1)}
                  </span>
                ) : null}
                <span className="badge">Ilce: {landDemo.district || "-"}</span>
                <span className="badge">Mahalle: {landDemo.neighborhood || "-"}</span>
              </div>
            </div>
          </div>
          {landProfiles.length ? (
            <ul className="marketplace-list">
              {landProfiles.slice(0, 8).map((profile) => (
                <li key={`land-profile-quick-${profile.id}`}>
                  <strong>{profile.name}</strong>
                  <span>
                    {profile.city || "-"} • {profile.crop || "-"} • {Number(profile?.landDemo?.areaDa || 0)} da
                  </span>
                  <div className="demo-actions">
                    <button className="ghost" onClick={() => applyLandProfile(profile)}>Uygula</button>
                    <button className="ghost" onClick={() => deleteLandProfile(profile.id)}>Sil</button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <small className="muted">Kayitli arazi profili yok.</small>
          )}
        </section>
      ) : null}
