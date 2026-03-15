      {(bottomTab === "market" || (bottomTab === "demos" && isDemoVisible("market"))) ? (
        <section className="features market-quick-create">
          <div className="steps-header">
            <h2>Pazar hizli panel</h2>
            <p>Ilan gir, aninda yayinla ve ilan yonetimini bu panelden yap.</p>
          </div>
          <div className="step-card tab-quick-head market-quick-head">
            <div className="weather-quick-main">
              <strong>
                {[effectiveTradeCity, landDemo?.district, landDemo?.neighborhood].filter(Boolean).join(" / ") || "Pazar konumu secilmedi"}
              </strong>
              <small className="muted">
                {tradeDashboard?.updatedAt
                  ? `Son guncelleme: ${new Date(tradeDashboard.updatedAt).toLocaleTimeString("tr-TR")}`
                  : "Canli pazar verisi bekleniyor"}
              </small>
            </div>
            <div className="chip-row">
              <span className={`chip ${Number(tradeDashboard?.orders?.active || 0) > 0 ? "warning" : ""}`}>
                Aktif siparis: {Number(tradeDashboard?.orders?.active || tradeMyOrders.length || 0)}
              </span>
              <span className="chip">
                Spread: {Number((tradeDashboard?.market?.spread ?? tradeMarketDepth?.spread) || 0).toFixed(2)} TL
              </span>
            </div>
            <div className="demo-actions">
              <button type="button" className="ghost-button" onClick={() => loadTradeData()}>
                Pazar verisini yenile
              </button>
            </div>
          </div>
          <div className="quick-kpi-strip">
            <div>
              <span>Toplam ilan</span>
              <strong>{Number(tradeDashboard?.listings?.total ?? tradeListings.length)}</strong>
            </div>
            <div>
              <span>Yayinda ilan</span>
              <strong>{Number(tradeDashboard?.listings?.open ?? tradeListings.filter((x) => x.status === "open").length)}</strong>
            </div>
            <div>
              <span>Aktif siparis</span>
              <strong>{Number(tradeDashboard?.orders?.active ?? tradeMyOrders.length)}</strong>
            </div>
            <div>
              <span>Spread</span>
              <strong>{Number((tradeDashboard?.market?.spread ?? tradeMarketDepth?.spread) || 0).toFixed(2)} TL</strong>
            </div>
          </div>
          <div className="quick-panel-tabs">
            {[
              { id: "kesfet", label: "Kesfet" },
              { id: "ilanlarim", label: "Ilanlarim" },
              { id: "teklifler", label: "Teklifler" },
              { id: "siparisler", label: "Siparisler" }
            ].map((tab) => (
              <button
                key={`market-quick-tab-${tab.id}`}
                className={tradeWorkspaceTab === tab.id ? "active" : ""}
                onClick={() => setTradeWorkspaceTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="field-grid-3">
            <label className="plant-select">
              <span>Profil / iletisim</span>
              <input
                value={tradeIdentityName}
                onChange={(e) => setTradeIdentityName(e.target.value)}
                placeholder={effectiveTradeIdentity || "Uretici adi"}
              />
            </label>
            <label className="plant-select">
              <span>Sehir filtresi</span>
              <input
                list="location-city-suggestions"
                value={tradeQuery.city}
                onChange={(e) => setTradeQuery((prev) => ({ ...prev, city: e.target.value }))}
                placeholder={effectiveTradeCity}
              />
            </label>
            <label className="plant-select">
              <span>Urun filtresi</span>
              <input
                value={tradeQuery.crop}
                onChange={(e) => setTradeQuery((prev) => ({ ...prev, crop: e.target.value }))}
                placeholder={effectiveTradeCrop}
              />
            </label>
            <label className="plant-select">
              <span>Durum filtresi</span>
              <select value={tradeFilterStatus} onChange={(e) => setTradeFilterStatus(e.target.value)}>
                <option value="all">Tum durumlar</option>
                <option value="open">Yayinda</option>
                <option value="paused">Duraklatilmis</option>
                <option value="closed">Kapatilmis</option>
              </select>
            </label>
          </div>
          <div className="field-grid-3">
            <label className="plant-select">
              <span>Metin ara</span>
              <input
                value={tradeFilterText}
                onChange={(e) => setTradeFilterText(e.target.value)}
                placeholder="Baslik, urun, ilce, iletisim"
              />
            </label>
            <label className="plant-select">
              <span>Islem filtresi</span>
              <select value={tradeFilterType} onChange={(e) => setTradeFilterType(e.target.value)}>
                <option value="all">Tum tipler</option>
                <option value="sell">Satilik</option>
                <option value="buy">Alim</option>
              </select>
            </label>
            <label className="plant-select">
              <span>Siralama</span>
              <select value={tradeSortBy} onChange={(e) => setTradeSortBy(e.target.value)}>
                <option value="newest">En yeni</option>
                <option value="smart">Akilli skor</option>
                <option value="price_asc">Fiyat artan</option>
                <option value="price_desc">Fiyat azalan</option>
                <option value="qty_desc">Miktar azalan</option>
              </select>
            </label>
          </div>
          <div className="field-grid-3">
            <label className="plant-select">
              <span>Min fiyat (TL/kg)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={tradePriceMin}
                onChange={(e) => setTradePriceMin(e.target.value)}
              />
            </label>
            <label className="plant-select">
              <span>Max fiyat (TL/kg)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={tradePriceMax}
                onChange={(e) => setTradePriceMax(e.target.value)}
              />
            </label>
            <label className="plant-select">
              <span>Satici filtresi</span>
              <select value={tradeSellerFilter} onChange={(e) => setTradeSellerFilter(e.target.value)}>
                <option value="all">Tum saticilar</option>
                {tradeSellerDirectory.map((seller) => (
                  <option key={`quick-seller-${seller.id}`} value={seller.id}>
                    {seller.name} ({seller.openCount})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="field-grid-3">
            <label className="plant-select">
              <span>Islem tipi</span>
              <select
                value={tradeListingForm.type}
                onChange={(e) => setTradeListingForm((prev) => ({ ...prev, type: e.target.value }))}
              >
                <option value="sell">Satilik</option>
                <option value="buy">Alim</option>
              </select>
            </label>
            <label className="plant-select">
              <span>Ilan sehri</span>
                <input
                  list="location-city-suggestions"
                  value={tradeListingForm.city}
                  onChange={(e) => {
                    const value = String(e.target.value || "");
                    const canonicalCity = cityCanonicalByKey[normalizeKey(value)] || value;
                    setTradeListingForm((prev) => ({ ...prev, city: canonicalCity, district: "" }));
                  }}
                  placeholder={effectiveTradeCity}
                />
            </label>
            <label className="plant-select">
              <span>Ilan urunu</span>
              <input
                value={tradeListingForm.crop}
                onChange={(e) => setTradeListingForm((prev) => ({ ...prev, crop: e.target.value }))}
                placeholder={effectiveTradeCrop}
              />
            </label>
          </div>
          <label className="plant-select">
            <span>Baslik</span>
            <input
              value={tradeListingForm.title}
              onChange={(e) => setTradeListingForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Orn: Malatya domates satilik"
            />
          </label>
          <div className="field-grid-3">
            <label className="plant-select">
              <span>Miktar (kg)</span>
              <input
                type="number"
                min="1"
                value={tradeListingForm.quantityKg}
                onChange={(e) => setTradeListingForm((prev) => ({ ...prev, quantityKg: e.target.value }))}
              />
            </label>
            <label className="plant-select">
              <span>Fiyat (TL/kg)</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={tradeListingForm.priceTlKg}
                onChange={(e) => setTradeListingForm((prev) => ({ ...prev, priceTlKg: e.target.value }))}
              />
            </label>
            <label className="plant-select">
              <span>Ilce</span>
              <input
                list="location-trade-district-suggestions"
                value={tradeListingForm.district}
                onChange={(e) => setTradeListingForm((prev) => ({ ...prev, district: e.target.value }))}
                placeholder="Orn: Yesilyurt"
              />
            </label>
          </div>
          <div className="field-grid-3">
            <label className="plant-select">
              <span>Teslimat</span>
              <select
                value={tradeListingForm.deliveryType}
                onChange={(e) => setTradeListingForm((prev) => ({ ...prev, deliveryType: e.target.value }))}
              >
                <option value="pickup">Teslim al</option>
                <option value="seller_delivery">Satici teslim</option>
                <option value="cargo">Kargo</option>
                <option value="broker">Komisyoncu</option>
              </select>
            </label>
            <label className="plant-select">
              <span>Odeme</span>
              <select
                value={tradeListingForm.paymentType}
                onChange={(e) => setTradeListingForm((prev) => ({ ...prev, paymentType: e.target.value }))}
              >
                <option value="transfer">Havale/EFT</option>
                <option value="cash">Nakit</option>
                <option value="term">Vade</option>
                <option value="escrow">Guvenli odeme</option>
                <option value="card">Kart</option>
              </select>
            </label>
            <label className="plant-select">
              <span>Kalite</span>
              <select
                value={tradeListingForm.qualityGrade}
                onChange={(e) => setTradeListingForm((prev) => ({ ...prev, qualityGrade: e.target.value }))}
              >
                <option value="premium">Premium</option>
                <option value="standard">Standart</option>
                <option value="mixed">Karisik</option>
                <option value="processing">Sanayi/isalma</option>
              </select>
            </label>
          </div>
          <div className="market-quick-actions">
            <button className="primary" onClick={submitTradeListing}>
              {tradeEditingListingId ? "Ilan guncelle" : "Ilan koy"}
            </button>
            {tradeEditingListingId ? (
              <button className="ghost" onClick={cancelTradeListingEdit}>
                Duzenlemeyi iptal et
              </button>
            ) : null}
            <button className="ghost" onClick={loadTradeData}>Pazari yenile</button>
            <button className="ghost" onClick={() => setTradeWorkspaceTab("ilanlarim")}>Ilanlarim</button>
            <button className="ghost" onClick={() => setTradeWorkspaceTab("teklifler")}>Teklifler</button>
            <button
              className="ghost"
              onClick={() =>
                setTradeListingForm((prev) => ({
                  ...prev,
                  priceTlKg: String(
                    Number(tradeSummary?.market?.sellMedianTlKg || tradeMarketDepth?.bestAsk || prev.priceTlKg || 0).toFixed(2)
                  )
                }))
              }
            >
              Medyan fiyati uygula
            </button>
          </div>
          <div className="market-quick-actions">
            <button className="ghost" onClick={() => setTradeSellerFilter(normalizeKey(effectiveTradeIdentity) || "all")}>
              Sadece benim ilanlarim
            </button>
            <button className="ghost" onClick={resetTradeFilters}>
              Filtreleri sifirla
            </button>
            <button
              className="ghost"
              onClick={() =>
                setTradeListingForm((prev) => ({
                  ...prev,
                  city: effectiveTradeCity,
                  crop: effectiveTradeCrop,
                  title: `${effectiveTradeCity} ${effectiveTradeCrop} ${prev.type === "buy" ? "alim" : "satilik"}`.trim()
                }))
              }
            >
              Formu akilli doldur
            </button>
          </div>
          <div className="market-filter-presets">
            <div className="market-filter-presets-head">
              <strong>Filtre presetleri</strong>
              <small className="muted">Sabit kombinasyonlari tek tikla uygula.</small>
            </div>
            <div className="market-filter-presets-form">
              <input
                value={tradeFilterPresetName}
                onChange={(e) => setTradeFilterPresetName(e.target.value)}
                placeholder="Orn: Malatya acik satilik"
              />
              <button className="ghost" onClick={saveTradeFilterPreset}>
                Kaydet
              </button>
            </div>
            {tradeFilterPresets.length ? (
              <div className="chip-row">
                {tradeFilterPresets.map((preset) => (
                  <span key={`quick-preset-${preset.id}`} className="chip chip-action">
                    <button
                      type="button"
                      className="chip-link"
                      onClick={() => applyTradeFilterSnapshot(preset)}
                    >
                      {preset.label}
                    </button>
                    <button
                      type="button"
                      className="chip-link danger"
                      onClick={() => deleteTradeFilterPreset(preset.id)}
                    >
                      Sil
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <small className="muted">Kayitli preset yok.</small>
            )}
          </div>
          <div className="quick-offer-box">
            <strong>Hizli teklif</strong>
            <div className="field-grid-3">
              <label className="plant-select">
                <span>Ilan</span>
                <select
                  value={tradeOfferForm.listingId}
                  onChange={(e) => setTradeOfferForm((prev) => ({ ...prev, listingId: e.target.value }))}
                >
                  <option value="">Ilan sec</option>
                  {tradeFilteredListings.slice(0, 24).map((item) => (
                    <option key={`quick-offer-${item.id}`} value={item.id}>
                      {(item.title || item.id)} • {Number(item.priceTlKg || 0).toFixed(2)} TL/kg
                    </option>
                  ))}
                </select>
              </label>
              <label className="plant-select">
                <span>Alici</span>
                <input
                  value={tradeOfferForm.buyer}
                  onChange={(e) => setTradeOfferForm((prev) => ({ ...prev, buyer: e.target.value }))}
                  placeholder={effectiveTradeIdentity || "Alici"}
                />
              </label>
              <label className="plant-select">
                <span>Teklif suresi (saat)</span>
                <input
                  type="number"
                  min="1"
                  max="720"
                  value={tradeOfferForm.expiryHours}
                  onChange={(e) => setTradeOfferForm((prev) => ({ ...prev, expiryHours: e.target.value }))}
                />
              </label>
            </div>
            <div className="field-grid-2">
              <label className="plant-select">
                <span>Miktar (kg)</span>
                <input
                  type="number"
                  min="1"
                  value={tradeOfferForm.quantityKg}
                  onChange={(e) => setTradeOfferForm((prev) => ({ ...prev, quantityKg: e.target.value }))}
                />
              </label>
              <label className="plant-select">
                <span>Teklif (TL/kg)</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={tradeOfferForm.offerPriceTlKg}
                  onChange={(e) => setTradeOfferForm((prev) => ({ ...prev, offerPriceTlKg: e.target.value }))}
                />
              </label>
            </div>
            <div className="market-quick-actions">
              <button className="ghost" onClick={submitTradeOffer}>Teklif ver</button>
              {selectedTradeListing ? (
                <button
                  className="ghost"
                  onClick={() =>
                    setTradeOfferForm((prev) => ({
                      ...prev,
                      offerPriceTlKg: String(
                        Number(selectedTradeListing.priceTlKg || 0)
                          ? Number((Number(selectedTradeListing.priceTlKg || 0) * 0.98).toFixed(2))
                          : prev.offerPriceTlKg
                      )
                    }))
                  }
                >
                  Fiyati %2 kir
                </button>
              ) : null}
            </div>
          </div>
          {tradeStatus ? <small className="muted">{tradeStatus}</small> : null}
          {tradeFilteredStats ? (
            <div className="info-badges">
              <span className="badge">Sonuc: {tradeFilteredStats.count}</span>
              <span className="badge">Min: {Number(tradeFilteredStats.min).toFixed(2)} TL/kg</span>
              <span className="badge">Medyan: {Number(tradeFilteredStats.median).toFixed(2)} TL/kg</span>
              <span className="badge">Max: {Number(tradeFilteredStats.max).toFixed(2)} TL/kg</span>
            </div>
          ) : null}
          {tradeOpportunityHighlights.length ? (
            <div className="info-badges">
              {tradeOpportunityHighlights.map((row, idx) => (
                <button
                  key={`quick-opportunity-${row.item.id}`}
                  className="badge badge-button"
                  onClick={() => setTradeOfferForm((prev) => ({ ...prev, listingId: row.item.id }))}
                >
                  #{idx + 1} {row.item.title || row.item.crop || row.item.id} • skor {row.score}
                </button>
              ))}
            </div>
          ) : null}
          <ul className="marketplace-list">
            {tradeFilteredListings.slice(0, 12).map((item) => (
              <li key={`fast-market-${item.id}`}>
                <strong>{item.title || `${item.crop || "-"} ${item.type || ""}`}</strong>
                <span>
                  {item.status || "open"} • {item.city || "-"} {item.district || ""} •{" "}
                  {Number(item.priceTlKg || 0).toFixed(2)} TL/kg • {Number((item.availableKg ?? item.quantityKg) || 0).toLocaleString("tr-TR")} kg
                </span>
                <div className="demo-actions">
                  <button className="ghost" onClick={() => editTradeListing(item)}>Duzenle</button>
                  <button className="ghost" onClick={() => setTradeOfferForm((prev) => ({ ...prev, listingId: item.id }))}>Teklif sec</button>
                  <button
                    className="ghost"
                    onClick={() => pauseOrOpenTradeListing(item.id, item.status === "paused" ? "open" : "paused")}
                  >
                    {item.status === "paused" ? "Yayina al" : "Duraklat"}
                  </button>
                  <button className="ghost" onClick={() => closeTradeListing(item.id)}>Kapat</button>
                  <button className="ghost" onClick={() => deleteTradeListing(item.id)}>Sil</button>
                </div>
              </li>
            ))}
            {!tradeFilteredListings.length ? <li className="muted">Filtreye uygun ilan yok.</li> : null}
          </ul>
          <div className="quick-mini-columns">
            <div className="quick-mini-card">
              <strong>Benim ilanlarim</strong>
              <ul className="marketplace-list">
                {tradeMyListings.slice(0, 3).map((item) => (
                  <li key={`quick-my-listing-${item.id}`}>
                    <strong>{item.title || item.id}</strong>
                    <span>{Number(item.priceTlKg || 0).toFixed(2)} TL/kg • {item.status}</span>
                    <div className="demo-actions">
                      <button className="ghost" onClick={() => editTradeListing(item)}>Duzenle</button>
                      <button className="ghost" onClick={() => closeTradeListing(item.id)}>Kapat</button>
                    </div>
                  </li>
                ))}
                {!tradeMyListings.length ? <li className="muted">Size ait ilan yok.</li> : null}
              </ul>
            </div>
            <div className="quick-mini-card">
              <strong>Benim tekliflerim</strong>
              <ul className="marketplace-list">
                {tradeMyOffers.slice(0, 3).map((item) => (
                  <li key={`quick-my-offer-${item.id}`}>
                    <strong>{item.listingTitle || item.listingId || "Teklif"}</strong>
                    <span>
                      {Number(item.offerPriceTlKg || 0).toFixed(2)} TL/kg • {Number(item.quantityKg || 0).toLocaleString("tr-TR")} kg
                    </span>
                  </li>
                ))}
                {!tradeMyOffers.length ? <li className="muted">Size ait teklif yok.</li> : null}
              </ul>
            </div>
            <div className="quick-mini-card">
              <strong>Siparislerim</strong>
              <ul className="marketplace-list">
                {tradeMyOrders.slice(0, 3).map((order) => (
                  <li key={`quick-my-order-${order.id}`}>
                    <strong>{order.crop || "Urun"} • {order.status}</strong>
                    <span>{Number(order.totalTl || 0).toLocaleString("tr-TR")} TL • escrow {order.escrowStatus || "-"}</span>
                    <div className="demo-actions">
                      <button className="ghost" onClick={() => updateTradeOrder(order.id, "in_transit")}>Kargoda</button>
                      <button className="ghost" onClick={() => updateTradeOrder(order.id, "delivered")}>Teslim</button>
                      <button className="ghost" onClick={() => updateTradeOrder(order.id, "completed", "released")}>Tamamla</button>
                    </div>
                  </li>
                ))}
                {!tradeMyOrders.length ? <li className="muted">Size ait siparis yok.</li> : null}
              </ul>
            </div>
