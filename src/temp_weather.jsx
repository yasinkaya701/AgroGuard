<div className="weather-dashboard">
    <div className="weather-hero">
        <div className="weather-location">
            <Map className="accent-icon" size={24} />
            <div>
                <h2>{[cityQuery || city, landDemo.district, landDemo.neighborhood].filter(Boolean).join(" / ") || "Konum Seçilmedi"}</h2>
                <small className="muted">{weatherFreshnessText || "Veri bekleniyor"}</small>
            </div>
        </div>

        <div className="weather-hero-stats">
            <div className="weather-kpi">
                <span className="kpi-label">Hava Skoru</span>
                <strong className="kpi-value">{weatherSummary?.score || 0}/100</strong>
            </div>
            <div className="weather-kpi">
                <span className="kpi-label">Toprak Kalitesi</span>
                <strong className="kpi-value">{soilDiagnostics?.score || "-"}</strong>
            </div>
            <div className={`weather-kpi ${frostSignal.hasRisk ? "risk-active" : ""}`}>
                <span className="kpi-label">Don Riski</span>
                <strong className="kpi-value">{frostSignal.hasRisk ? "YÜKSEK" : "Normal"}</strong>
            </div>
        </div>
    </div>

    <div className="bento-grid">
        <div className="bento-card col-span-2">
            <div className="card-header">
                <Radio className="accent-icon" size={20} />
                <h3>Anlık İklim Verisi</h3>
            </div>

            {weather ? (
                <div className="weather-current-grid">
                    <div className="weather-main-metric">
                        <span className="huge-temp">{weather.temp ?? "-"}°C</span>
                        <span>{weather.condition || "-"}</span>
                        <div className="temp-range">
                            Min: {weather.tempMin ?? "-"}°C / Max: {weather.tempMax ?? "-"}°C
                        </div>
                    </div>

                    <div className="weather-sub-metrics">
                        <div className="metric-row">
                            <span className="metric-label">Nem</span>
                            <strong className="metric-value">%{weather.humidity ?? "-"}</strong>
                        </div>
                        <div className="metric-row">
                            <span className="metric-label">Rüzgar</span>
                            <strong className="metric-value">{weather.windKmh ?? "-"} km/s</strong>
                        </div>
                        <div className="metric-row">
                            <span className="metric-label">Yağış</span>
                            <strong className="metric-value">{weather.precipitationMm ?? 0} mm</strong>
                        </div>
                        <div className="metric-row">
                            <span className="metric-label">Kaynak</span>
                            <strong className="metric-value">{weather?.source || "-"}</strong>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="empty-state">
                    <Loader2 className="spinning accent-icon" size={24} />
                    <p>Meteoroloji istasyonu aranıyor...</p>
                </div>
            )}
        </div>

        <div className="bento-card">
            <div className="card-header">
                <AlertCircle className="accent-icon" size={20} />
                <h3>Uyarı Taraması</h3>
            </div>
            <div className="alerts-container">
                {weatherAlerts.length || hourlyAlerts.length ? (
                    [...weatherAlerts, ...hourlyAlerts].slice(0, 4).map((alert, idx) => (
                        <div key={`alert-${idx}`} className={`alert-row ${alert.level}`}>
                            <span className="alert-dot"></span>
                            <p>{alert.text}</p>
                        </div>
                    ))
                ) : (
                    <div className="all-clear">
                        <CheckCircle2 color="#10b981" size={32} />
                        <p>Riskli hava olayı tespit edilmedi.</p>
                    </div>
                )}
            </div>
        </div>

        <div className="bento-card col-span-3">
            <div className="card-header">
                <Activity className="accent-icon" size={20} />
                <h3>5 Günlük Toprak & İklim Tahmini</h3>
            </div>
            {forecast?.days?.length ? (
                <div className="forecast-timeline">
                    {forecast.days.map((item) => (
                        <div key={`forecast-${item.day}`} className={`timeline-day ${item.frost ? "frost-risk" : ""}`}>
                            <strong>{item.day}</strong>
                            <div className="timeline-icon">
                                {item.frost ? <ShieldAlert size={24} /> : <LeafyGreen size={24} />}
                            </div>
                            <div className="timeline-temps">
                                <span className="max-t">{item.max}°</span>
                                <span className="min-t">{item.min}°</span>
                            </div>
                            <small>{item.condition}</small>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="muted text-center pt-4">Uzun vadeli tahmin bulunamadı.</p>
            )}
        </div>

        <div className="bento-card col-span-2">
            <div className="card-header">
                <Leaf className="accent-icon" size={20} />
                <h3>Toprak Profili & Analizi</h3>
            </div>
            {soilReport ? (
                <div className="soil-analysis-grid">
                    <div className="soil-metric">
                        <strong>pH Değeri</strong>
                        <span>{soilReport.ph ?? "-"}</span>
                    </div>
                    <div className="soil-metric">
                        <strong>Organik Madde</strong>
                        <span>{soilReport.organic ?? "-"}</span>
                    </div>
                    <div className="soil-metric">
                        <strong>Toprak Tipi</strong>
                        <span>{soilReport.soilType || "-"}</span>
                    </div>
                    <div className="soil-metric">
                        <strong>Azot (N)</strong>
                        <span>{soilReport.nitrogen ?? "-"}</span>
                    </div>
                    <div className="soil-metric">
                        <strong>Kalibrasyon</strong>
                        <span>{soilDiagnostics?.score || 0}/100</span>
                    </div>
                    <div className="soil-metric">
                        <strong>Kil / Kum</strong>
                        <span>{soilReport.clay ?? "-"} / {soilReport.sand ?? "-"}</span>
                    </div>
                </div>
            ) : (
                <p className="muted text-center pt-4">Derin toprak sensör verisi bekleniyor.</p>
            )}
        </div>

        <div className="bento-card control-panel">
            <div className="card-header">
                <Target className="accent-icon" size={20} />
                <h3>Sistem Konfigürasyonu</h3>
            </div>
            <div className="config-inputs">
                <label className="smart-input">
                    <span>Şehir / İlçe</span>
                    <div className="flex gap-2">
                        <input
                            list="location-city-suggestions"
                            value={cityQuery}
                            onChange={(e) => setCityQuery(e.target.value)}
                            onBlur={applyCityQuery}
                            placeholder={city || "Şehir seç"}
                        />
                        <input
                            list="location-weather-district-suggestions"
                            value={landDemo.district}
                            onChange={(e) => setLandDemo((prev) => ({ ...prev, district: e.target.value, neighborhood: "" }))}
                            placeholder="İlçe seç"
                        />
                    </div>
                </label>
                <label className="smart-input">
                    <span>Hassas Koordinat</span>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={fieldLocation.coords}
                            onChange={(e) => setFieldLocation((prev) => ({ ...prev, coords: e.target.value }))}
                            placeholder="Enlem, Boylam"
                        />
                        <button className="icon-btn" onClick={useMyLocation} title="Konumumu Bul">
                            <Compass size={18} />
                        </button>
                    </div>
                </label>
                <button className="btn w-full mt-4 flex items-center justify-center gap-2" onClick={() => setWeatherRefreshKey((prev) => prev + 1)}>
                    <Loader2 size={16} className={weatherRefreshKey > 0 ? "spinning" : ""} />
                    Tüm Uyduları Senkronize Et
                </button>
            </div>
        </div>
    </div>
</div>
