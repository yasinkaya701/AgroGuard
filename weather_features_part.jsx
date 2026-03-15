          {(bottomTab === "weather" || (bottomTab === "demos" && isDemoVisible("weather"))) && (
                      <section id="demo-weather" className="features">
            <div className="steps-header">
              <h2>Tarla konumu + hava durumu</h2>
              <p>Konumu gir, hava riski ve don tahminlerini birlikte gor.</p>
            </div>
            <div className="step-grid">
              <div className="step-card weather-quick-head">
                <div className="weather-quick-main">
                  <strong>{weatherLocationLabel}</strong>
                  <small className="muted">{weatherFreshnessText}</small>
                </div>
                <div className="chip-row">
                  <span className={`chip ${frostSignal.hasRisk ? "warning" : ""}`}>
                    {frostSignal.hasRisk ? "Don riski: aktif" : "Don riski: dusuk"}
                  </span>
                  <span className="chip">
                    {weather?.condition || "Hava verisi bekleniyor"}
                  </span>
                </div>
                <div className="demo-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => setWeatherRefreshKey((prev) => prev + 1)}
                  >
                    Hava verisini yenile
                  </button>
                </div>
              </div>
              {agroClimateAdvisor ? (
                <div className="step-card agro-advisor-card">
                  <h3>Hava + toprak aksiyon motoru</h3>
                  <p>{agroClimateAdvisor.summary}</p>
                  <div className="chip-row">
                    {agroClimateAdvisor.chips.map((item) => (
                      <span key={`agro-chip-${item.text}`} className={`chip ${item.tone === "danger" ? "warning" : ""}`}>
                        {item.text}
                      </span>
                    ))}
                  </div>
                  <ul>
                    {agroClimateAdvisor.actions.map((item) => (
                      <li key={`agro-action-${item}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="step-card">
                <label className="plant-select">
                  <span>Tarla adi</span>
                  <input
                    type="text"
                    value={fieldLocation.name}
                    onChange={(event) =>
                      setFieldLocation((prev) => ({ ...prev, name: event.target.value }))
                    }
                    placeholder="Orn: Battalgazi-1"
                  />
                </label>
                <label className="plant-select">
                  <span>Koordinat</span>
                  <input
                    type="text"
                    value={fieldLocation.coords}
                    onChange={(event) =>
                      setFieldLocation((prev) => ({ ...prev, coords: event.target.value }))
                    }
                    placeholder="38.3511, 38.3095"
                  />
                  <div className="geo-actions">
                    <button type="button" className="ghost-button" onClick={useMyLocation}>
                      Konumumu al
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => setWeatherRefreshKey((prev) => prev + 1)}
                    >
                      Yenile
                    </button>
                    {geoStatus && <small className="muted">{geoStatus}</small>}
                  </div>
                  <div className="soil-map-picker">
                    <div className="soil-map-picker-head">
                      <strong>Haritadan nokta sec</strong>
                      <small className="muted">Haritaya tikla, koordinat otomatik dolsun ve toprak verisi cekilsin.</small>
                    </div>
                    <button type="button" className="soil-map-canvas" onClick={selectSoilMapPoint}>
                      <img
                        src={`https://staticmap.openstreetmap.de/staticmap.php?center=${SOIL_MAP_PICKER.centerLat},${SOIL_MAP_PICKER.centerLon}&zoom=${SOIL_MAP_PICKER.zoom}&size=${SOIL_MAP_PICKER.width}x${SOIL_MAP_PICKER.height}&maptype=mapnik`}
                        alt="Turkiye toprak koordinat secim haritasi"
                        loading="lazy"
                      />
                      {soilPickerMarker ? (
                        <span
                          className="soil-map-marker"
                          style={{ left: `${soilPickerMarker.left}px`, top: `${soilPickerMarker.top}px` }}
                        />
                      ) : null}
                    </button>
                  </div>
                  {!coordsValid && fieldLocation.coords?.trim() && (
                    <small className="muted warning-text">
                      Koordinat formati hatali. Ornek: 38.3511, 38.3095
                    </small>
                  )}
                  {mapLink && (
                    <a className="map-link" href={mapLink} target="_blank" rel="noreferrer">
                      Haritada ac
                    </a>
                  )}
                </label>
                <label className="plant-select">
                  <span>Sehir (opsiyonel)</span>
                  <div className="city-input">
                    <input
                      type="text"
                      value={cityQuery}
                      onChange={(event) => setCityQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          applyCityQuery();
                        }
                      }}
                      placeholder="Sehir yaz ve Enter ile uygula"
                    />
                    <button type="button" className="ghost-button" onClick={applyCityQuery}>
                      Uygula
                    </button>
                  </div>
                </label>
                <div className="field-grid-3">
                  <label className="plant-select">
                    <span>Ilce</span>
                    <input
                      list="location-weather-district-suggestions"
                      value={landDemo.district}
                      onChange={(e) =>
                        setLandDemo((prev) => ({ ...prev, district: e.target.value, neighborhood: "" }))
                      }
                      placeholder="Ilce sec"
                    />
                  </label>
                  <label className="plant-select">
                    <span>Mahalle</span>
                    <input
                      list="location-weather-neighborhood-suggestions"
                      value={landDemo.neighborhood}
                      onChange={(e) => setLandDemo((prev) => ({ ...prev, neighborhood: e.target.value }))}
                      placeholder="Mahalle sec"
                    />
                  </label>
                  <label className="plant-select">
                    <span>Konum arama</span>
                    <input
                      value={locationSearch}
                      onChange={(e) => setLocationSearch(e.target.value)}
                      placeholder="m yaz: Malatya, Merkez..."
                    />
                  </label>
                </div>
                {locationSearchMatches.length ? (
                  <div className="location-search-hits">
                    {locationSearchMatches.map((item) => (
                      <button
                        key={`weather-hit-${item.id}`}
                        type="button"
                        className={`ghost ${item.type}`}
                        onClick={() => applyLocationSearchHit(item)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="city-list">
                  {locationCitySuggestions
                    .filter((item) => normalizeKey(item).includes(normalizeKey(cityQuery)))
                    .slice(0, 30)
                    .map((item) => (
                      <button
                        key={item}
                        className={city === item ? "active" : ""}
                        onClick={() => {
                          setCity(item);
                          setLandDemo((prev) => ({ ...prev, district: "", neighborhood: "" }));
                          setFieldLocation((prev) => ({ ...prev, coords: "" }));
                          setGeoStatus("Sehir secildi, koordinat temizlendi.");
                          setCityQuery("");
                          setWeatherRefreshKey((prev) => prev + 1);
                        }}
                      >
                        {item}
                      </button>
                    ))}
                </div>
                <label className="plant-select">
                  <span>Saha notu</span>
                  <input
                    type="text"
                    value={fieldLocation.notes}
                    onChange={(event) =>
                      setFieldLocation((prev) => ({ ...prev, notes: event.target.value }))
                    }
                    placeholder="Toprak kirecli, ruzgar aliyor"
                  />
                </label>
              </div>
              <div className="step-card">
                <div className="weather-head">
                  <h3>{weather?.city || city}</h3>
                  {weather?.source && (
                    <span className="live-badge live">
                      Canli
                    </span>
                  )}
                </div>
                {weather?.localTime && (
                  <p className="muted">
                    Canli saat:{" "}
                    {new Date(weather.localTime).toLocaleString("tr-TR", {
                      timeZone: weather.timeZone || undefined
                    })}
                  </p>
                )}
                {weather?.updatedAt && (
                  <p className="muted">
                    Son guncelleme:{" "}
                    {new Date(weather.updatedAt).toLocaleTimeString("tr-TR")}
                  </p>
                )}
                <div className={`weather-alert ${frostSignal.hasRisk ? "danger" : "safe"}`}>
                  {frostSignal.hasRisk
                    ? `Don erken uyarisi: aktif${Number.isFinite(frostSignal.min) ? ` (min ${frostSignal.min}°C)` : ""}`
                    : "Don erken uyarisi: risk gorunmuyor"}
                </div>
                {weather ? (
                  <>
                    <p>{weather.condition}</p>
                    <p className="countup">
                      Sicaklik: <strong data-count={weather.temp}>{weather.temp}</strong>°C (Min{" "}
                      <strong data-count={weather.tempMin}>{weather.tempMin}</strong>°C / Max{" "}
                      <strong data-count={weather.tempMax}>{weather.tempMax}</strong>°C)
                    </p>
                    <p className="countup">
                      Nem: <strong data-count={weather.humidity}>{weather.humidity}</strong>% •
                      Ruzgar: <strong data-count={weather.windKmh}>{weather.windKmh}</strong> km/sa
                      {weather.windGustKmh ? (
                        <>
                          {" "}
                          (Esinti{" "}
                          <strong data-count={weather.windGustKmh}>{weather.windGustKmh}</strong>{" "}
                          km/sa)
                        </>
                      ) : null}
                    </p>
                    {typeof weather.windKmh === "number" && (
                      <span
                        className={`risk-meter ${
                          weather.windGustKmh >= 40 || weather.windKmh >= 20
                            ? "high"
                            : weather.windKmh >= 12
                              ? "mid"
                              : "low"
                        }`}
                      >
                        Ruzgar riski{" "}
                        {weather.windGustKmh >= 40 || weather.windKmh >= 20
                          ? "Yuksek"
                          : weather.windKmh >= 12
                            ? "Orta"
                            : "Dusuk"}
                      </span>
                    )}
                    {typeof weather.precipitationMm === "number" && (
                      <p className="countup">
                        Yagis:{" "}
                        <strong data-count={weather.precipitationMm}>{weather.precipitationMm}</strong>{" "}
                        mm
                      </p>
                    )}
                    <div className="weather-risk">
                      <span className={weather.humidity >= 80 ? "risk" : "ok"}>
                        Nem riski: {weather.humidity >= 80 ? "Yuksek" : "Normal"}
                      </span>
                      <span className={weather.windKmh >= 20 ? "risk" : "ok"}>
                        Ruzgar riski: {weather.windKmh >= 20 ? "Yuksek" : "Normal"}
                      </span>
                    </div>
                    <div className={`weather-alert ${weather.frostRisk ? "danger" : "safe"}`}>
                      {weather.frostRisk ? "Anlik don riski var" : "Anlik don riski yok"}
                    </div>
                    {(weatherSummary || weatherAlerts.length || hourlyAlerts.length) && (
                      <details className="accordion compact">
                        <summary>Hava riskleri</summary>
                        {weatherSummary && (
                          <div className="weather-quick">
                            <div>
                              <strong>Hizli risk ozeti</strong>
                              <p>
                                {weatherSummary.riskTags.join(" • ")} • Skor{" "}
                                {weatherSummary.score}/100
                              </p>
                            </div>
                            <div className="chip-row">
                              {weatherSummary.riskTags.map((tag) => (
                                <span
                                  key={tag}
                                  className={`chip ${tag !== "Normal" ? "warning" : ""}`}
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                            <ul>
                              {weatherSummary.actions.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {weatherAlerts.length ? (
                          <div className="weather-alerts">
                            {weatherAlerts.map((alert) => (
                              <div key={alert.text} className={`alert ${alert.level}`}>
                                <AlertCircle size={14} />
                                <span>{alert.text}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {hourlyAlerts.length ? (
                          <div className="weather-alerts">
                            {hourlyAlerts.map((alert) => (
                              <div key={alert.text} className={`alert ${alert.level}`}>
                                <AlertCircle size={14} />
                                <span>{alert.text}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </details>
                    )}
                    {weather.source === "openmeteo" && (
                      <small className="muted">Hava verisi: Open-Meteo.</small>
                    )}
                    {weather.source === "openweather" && (
                      <small className="muted">Hava verisi: OpenWeather.</small>
                    )}
                    <div className="notif-card">
                      <strong>Mobil bildirimler</strong>
                      <small className="muted">
                        {isNativeApp
                          ? `Izin: ${notifPermission}`
                          : "Bildirim planlama sadece iOS/Android app icinde aktif."}
                      </small>
                      <label className="notif-row">
                        <input
                          type="checkbox"
                          checked={notifSettings.enabled}
                          onChange={(event) =>
                            setNotifSettings((prev) => ({ ...prev, enabled: event.target.checked }))
                          }
                        />
                        <span>Bildirimleri etkinlestir</span>
                      </label>
                      <label className="notif-row">
                        <input
                          type="checkbox"
                          checked={notifSettings.frostThreat}
                          onChange={(event) =>
                            setNotifSettings((prev) => ({ ...prev, frostThreat: event.target.checked }))
                          }
                        />
                        <span>Don tehdidi uyarisi</span>
                      </label>
                      <label className="notif-row">
                        <input
                          type="checkbox"
                          checked={notifSettings.dailySummary}
                          onChange={(event) =>
                            setNotifSettings((prev) => ({ ...prev, dailySummary: event.target.checked }))
                          }
                        />
                        <span>Gunluk ozet</span>
                      </label>
                      <label className="notif-row">
                        <input
                          type="checkbox"
                          checked={notifSettings.calendarReminders}
                          onChange={(event) =>
                            setNotifSettings((prev) => ({ ...prev, calendarReminders: event.target.checked }))
                          }
                        />
                        <span>Takvim gorev hatirlatmalari</span>
                      </label>
                      <div className="notif-time">
                        <label className="notif-row">
                          <span>Saat</span>
                          <input
                            type="number"
                            min="0"
                            max="23"
                            value={notifSettings.dailyHour}
                            onChange={(event) =>
                              setNotifSettings((prev) => ({
                                ...prev,
                                dailyHour: Math.max(0, Math.min(23, Number(event.target.value) || 0))
                              }))
                            }
                          />
                        </label>
                        <label className="notif-row">
                          <span>Dakika</span>
                          <input
                            type="number"
                            min="0"
                            max="59"
                            value={notifSettings.dailyMinute}
                            onChange={(event) =>
                              setNotifSettings((prev) => ({
                                ...prev,
                                dailyMinute: Math.max(0, Math.min(59, Number(event.target.value) || 0))
                              }))
                            }
                          />
                        </label>
                        <label className="notif-row">
                          <span>Takvim once (dk)</span>
                          <input
                            type="number"
                            min="0"
                            max="1440"
                            value={notifSettings.reminderLeadMinutes}
                            onChange={(event) =>
                              setNotifSettings((prev) => ({
                                ...prev,
                                reminderLeadMinutes: Math.max(
                                  0,
                                  Math.min(1440, Number(event.target.value) || 0)
                                )
                              }))
                            }
                          />
                        </label>
                      </div>
                      <div className="demo-actions">
                        <button className="ghost" onClick={() => syncNotifications("manual")} disabled={!isNativeApp}>
                          Izin iste + bildirimi planla
                        </button>
                      </div>
                      {notifStatus && <small className="muted">{notifStatus}</small>}
                    </div>
                  </>
                ) : (
                  <p>Hava durumu yukleniyor...</p>
                )}
                {weatherError && <p className="muted warning-text">{weatherError}</p>}
              </div>
              <div className="step-card">
                <h3>Don riskleri (4 gun)</h3>
                <details className="accordion compact">
                  <summary>Detaylari ac</summary>
                  {forecast?.days ? (
                    <div className="forecast-list">
                      {forecast.days.map((item) => (
                        <div key={item.day} className={`forecast-item ${item.frost ? "risk" : "ok"}`}>
                          <strong>{item.day}</strong>
                          <span>
                            {item.min}°C / {item.max}°C
                          </span>
                          <em>{item.condition}</em>
                          {typeof item.precipitationMm === "number" && (
                            <span>Yagis: {item.precipitationMm} mm</span>
                          )}
                          {typeof item.windGustKmh === "number" && (
                            <span>Esinti: {item.windGustKmh} km/sa</span>
                          )}
                          <span>{item.frost ? "Don riski" : "Normal"}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p>Tahmin yukleniyor...</p>
                  )}
                </details>
                {forecast?.source === "openmeteo" && (
                  <small className="muted">Tahmin verisi: Open-Meteo.</small>
                )}
                {forecast?.source === "openweather" && (
                  <small className="muted">Tahmin verisi: OpenWeather.</small>
                )}
                {forecast?.timeZone && (
                  <small className="muted">Zaman dilimi: {forecast.timeZone}</small>
                )}
                {forecastError && <p className="muted warning-text">{forecastError}</p>}
              </div>
              <div className="step-card">
                <h3>Saatlik gorunum (12 saat)</h3>
                <details className="accordion compact">
                  <summary>Detaylari ac</summary>
                  {forecast?.hourly?.length ? (
                    <div className="hourly-list">
                      {forecast.hourly.map((item) => (
                        <div key={item.time} className="hourly-card">
                          <strong>
                            {new Date(item.time).toLocaleTimeString("tr-TR", {
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: forecast.timeZone || undefined
                            })}
                          </strong>
                          <span>{item.temp ?? "-"}°C</span>
                          {typeof item.windGustKmh === "number" && (
                            <em>Esinti {item.windGustKmh} km/sa</em>
                          )}
                          {typeof item.precipitationMm === "number" && (
                            <em>Yagis {item.precipitationMm} mm</em>
                          )}
                          {typeof item.windKmh === "number" && (
                            <em>Ruzgar {item.windKmh} km/sa</em>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p>Saatlik veri yukleniyor...</p>
                  )}
                </details>
                {nextHours.length ? (
                  <div className="hourly-strip">
                    {nextHours.map((item) => (
                      <div key={item.time} className="hourly-chip">
                        <strong>{item.label}</strong>
                        <span>{item.temp ?? "-"}°C</span>
                        <em>{item.precipitationMm ?? 0} mm</em>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </section>
          {(bottomTab === "weather" || (bottomTab === "demos" && isDemoVisible("soil"))) && (
          <section id="demo-soil" className="features">
            <div className="steps-header">
              <h2>Toprak + iklim danismani</h2>
              <p>Bulundugun bolgeye gore toprak profili ve ekim onerileri.</p>
              <a className="soil-academy-link" href="/toprak-akademi.html" target="_blank" rel="noreferrer">
                Toprak Akademi sitesini ac
              </a>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Toprak profili</h3>
                <p className="muted">Konum: {soilReport?.locationLabel || soilLocationLabel}</p>
                {soilLoading ? (
                  <p>Toprak verisi yukleniyor...</p>
                ) : soilReport ? (
                  <>
                    <p>Tip: {soilReport.soilType}</p>
                    <p>pH: {soilReport.ph} • Organik: {soilReport.organic}</p>
                    <details className="accordion compact">
                      <summary>Detaylari ac</summary>
                      {soilReport.source === "soilgrids" || soilReport.source === "soilgrids+mta" ? (
                        <>
                          <p>Kil: {soilReport.clay} • Kum: {soilReport.sand} • Silt: {soilReport.silt}</p>
                          <p>Azot: {soilReport.nitrogen} • CEC: {soilReport.cec}</p>
                          <p>Hacim agirligi: {soilReport.bulkDensity}</p>
                          {soilReport.depthProfile && typeof soilReport.depthProfile === "object" && (
                            <div className="depth-grid">
                              {["phh2o", "soc", "clay", "sand"].map((key) => {
                                const depthMap = soilReport.depthProfile[key];
                                if (!depthMap || typeof depthMap !== "object") return null;
                                const labelMap = {
                                  phh2o: "pH katman",
                                  soc: "Organik C katman",
                                  clay: "Kil katman",
                                  sand: "Kum katman"
                                };
                                return (
                                  <div key={key} className="depth-card">
                                    <strong>{labelMap[key] || key}</strong>
                                    <small>
                                      0-5: {depthMap["0-5cm"] ?? "-"} • 5-15: {depthMap["5-15cm"] ?? "-"}
                                    </small>
                                    <small>
                                      15-30: {depthMap["15-30cm"] ?? "-"} • 30-60: {depthMap["30-60cm"] ?? "-"}
                                    </small>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {soilReport.profile && (
                            <p>
                              Su tutma: {soilReport.profile.waterHolding || "-"} •
                              Verimlilik: {soilReport.profile.fertility || "-"} •
                              pH bandi: {soilReport.profile.phBand || "-"}
                            </p>
                          )}
                          {soilReport.mta && (
                            <>
                              <p>MTA toprak: {soilReport.mta.soilMap || "-"}</p>
                              <p>MTA maden: {soilReport.mta.mineralProspect || "-"}</p>
                              {soilReport.mta.geology && <p>Jeoloji: {soilReport.mta.geology}</p>}
                              {soilReport.mta.mapName && <p>MTA katman: {soilReport.mta.mapName}</p>}
                            </>
                          )}
                          {soilInsights && (
                            <div className="chip-row">
                              <span className="chip">{soilInsights.phLabel}</span>
                              <span className="chip">{soilInsights.organicLabel}</span>
                            </div>
                          )}
                          {soilReport.internetSignals && (
                            <>
                              <p>
                                Toprak sicakligi (0cm): {soilReport.internetSignals.topTempAvg ?? "-"}°C •
                                Derinlik sicakligi: {soilReport.internetSignals.deepTempAvg ?? "-"}°C
                              </p>
                              <p>
                                Nem (0-1cm): {soilReport.internetSignals.moistureTopAvg ?? "-"} •
                                Nem (1-3cm): {soilReport.internetSignals.moistureMidAvg ?? "-"} •
                                Durum: {soilReport.internetSignals.moistureState || "-"}
                              </p>
                              <p>
                                ET ortalama: {soilReport.internetSignals.evapotranspirationAvg ?? "-"} •
                                Rakim: {soilReport.internetMeta?.elevation ?? "-"} m
                              </p>
                            </>
                          )}
                          {soilReport.internetSources?.length ? (
                            <div className="chip-row">
                              {soilReport.internetSources.map((item) => (
                                <a
                                  key={item.id}
                                  className={`chip ${item.available ? "" : "warning"}`}
                                  href={item.url || "#"}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {item.title}
                                </a>
                              ))}
                            </div>
                          ) : null}
                          <small className="muted">
                            Kaynak: {soilReport.source || "soilgrids"}
                          </small>
                        </>
                      ) : soilReport.source === "mta" ? (
                        <>
                          <p>MTA toprak: {soilReport.mta?.soilMap || "-"}</p>
                          <p>MTA maden: {soilReport.mta?.mineralProspect || "-"}</p>
                          <small className="muted">Kaynak: MTA katman servisi</small>
                        </>
                      ) : (
                        <>
                          <p>Drenaj: {soilReport.drainage} • Tuzluluk: {soilReport.salinity}</p>
                          <p>Iklem: {soilReport.climate}</p>
                          {soilReport.source === "demo" && (
                            <small className="muted">Gosterim verisi. API eklenince canli olur.</small>
                          )}
                        </>
                      )}
                    </details>
                  </>
                ) : (
                  <p>Toprak verisi yok.</p>
                )}
                {soilError && <p className="muted">{soilError}</p>}
              </div>
              <div className="step-card">
                <h3>Toprak haritasi</h3>
                <p>Konum: {soilMapContext.label}</p>
                {soilMapContext.hasCoords ? (
                  <iframe
                    className="soil-map-frame"
                    title="Toprak haritasi"
                    loading="lazy"
                    src={soilMapContext.osmEmbed}
                  />
                ) : (
                  <p>Koordinat secince harita ve nokta isaretleyici acilir.</p>
                )}
                <div className="soil-map-links">
                  <a className="chip" href={soilMapContext.google} target="_blank" rel="noreferrer">Google Harita</a>
                  <a className="chip" href={soilMapContext.osm} target="_blank" rel="noreferrer">OpenStreetMap</a>
                  {soilMapContext.wmsUrl ? (
                    <a className="chip" href={soilMapContext.wmsUrl} target="_blank" rel="noreferrer">TR Toprak WMS</a>
                  ) : null}
                  {soilMapContext.mtaUrl ? (
                    <a className="chip" href={soilMapContext.mtaUrl} target="_blank" rel="noreferrer">MTA Katman</a>
                  ) : null}
                </div>
              </div>
              <div className="step-card">
                <h3>Bitki uygunlugu</h3>
                {selectedPlant ? (
                  soilFit ? (
                    <div className={`fit-badge ${soilFit.level}`}>
                      <strong>{soilFit.label}</strong>
                      <span>{soilFit.detail}</span>
                    </div>
                  ) : (
                    <p>Toprak verisi yuklenince uygunluk hesaplanir.</p>
                  )
                ) : (
                  <p>Bitki secilmedi. Uygunluk icin bitki sec.</p>
                )}
              </div>
              <div className="step-card soil-score-card">
                <h3>Toprak skoru</h3>
                {soilDiagnostics ? (
                  <>
                    <div className="soil-score-head">
                      <strong>{soilDiagnostics.score}/100</strong>
                      <span className="chip">{soilDiagnostics.grade} seviye</span>
                      <span className={`chip ${soilDiagnostics.risk === "Yuksek" ? "warning" : ""}`}>
                        Risk: {soilDiagnostics.risk}
                      </span>
                    </div>
                    <div className="chip-row">
                      {soilDiagnostics.findings.map((item) => (
                        <span key={item} className="chip">{item}</span>
                      ))}
                    </div>
                    <ul>
                      {soilDiagnostics.actions.slice(0, 3).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p>Skor hesaplamak icin toprak verisi bekleniyor.</p>
                )}
              </div>
              <div className="step-card">
                <h3>Toprak operasyon indeksleri</h3>
                {soilIndexCards.length ? (
                  <div className="soil-index-grid">
                    {soilIndexCards.map((item) => (
                      <div key={item.key} className={`soil-index-card ${item.tone}`}>
                        <div className="soil-index-head">
                          <strong>{item.label}</strong>
                          <span>{item.value}/100</span>
                        </div>
                        <div className="soil-index-bar">
                          <span style={{ width: `${Math.max(4, Math.min(100, item.value))}%` }} />
                        </div>
                        <small>{item.text}</small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>Canli indeksler icin SoilGrids/Open-Meteo verisi bekleniyor.</p>
                )}
              </div>
              <div className="step-card">
                <h3>Toprak yonetim plani</h3>
                {soilManagementPlan ? (
                  <>
                    <div className="soil-plan-grid">
                      <div className="soil-plan-item">
                        <strong>Sulama</strong>
                        <span>{soilManagementPlan.irrigation || "-"}</span>
                      </div>
                      <div className="soil-plan-item">
                        <strong>Besleme</strong>
                        <span>{soilManagementPlan.nutrition || "-"}</span>
                      </div>
                      <div className="soil-plan-item">
                        <strong>Toprak isleme</strong>
                        <span>{soilManagementPlan.tillage || "-"}</span>
                      </div>
                      <div className="soil-plan-item">
                        <strong>Sezon</strong>
                        <span>{soilManagementPlan.season || "-"}</span>
                      </div>
                    </div>
                    {soilManagementPlan.monitoring?.length ? (
                      <ul>
                        {soilManagementPlan.monitoring.slice(0, 4).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : null}
                    {soilManagementPlan.alerts?.length ? (
                      <div className="chip-row">
                        {soilManagementPlan.alerts.map((item) => (
                          <span key={item} className="chip warning">{item}</span>
                        ))}
                      </div>
                    ) : (
                      <small className="muted">Kritik toprak alarmi yok.</small>
                    )}
                  </>
                ) : (
                  <p>Plan olusturmak icin toprak verisi bekleniyor.</p>
                )}
              </div>
              <div className="step-card">
                <h3>Ne ekilir?</h3>
                {soilSmartSuggestions.length ? (
                  <ul>
                    {soilSmartSuggestions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p>Oneri hesaplanamadi.</p>
                )}
              </div>
              <div className="step-card">
                <h3>Riskli urunler + hastaliklar</h3>
                <div className="chip-row">
                  {(soilReport?.risky || []).map((item) => (
                    <span key={item} className="chip warning">{item}</span>
                  ))}
                  {(soilReport?.diseaseRisk || []).map((item) => (
                    <span key={item} className="chip">{item}</span>
                  ))}
                </div>
                <div className="note-block">
                  <strong>Danismanlik notu</strong>
                  <p>
                    Bulundugun bolge ve toprak tipine gore ekim yapmadan once sulama
                    programini netlestir, hastalik risklerini takip et.
                  </p>
                </div>
              </div>
              <div className="step-card">
                <h3>Tum bitkiler uyumluluk</h3>
                {soilSuitability.length ? (
                  <div className="chip-row">
                    {soilSuitability.slice(0, 10).map((item) => (
                      <span
                        key={item.id}
                        className={`chip ${
                          item.status === "Riskli" ? "warning" : item.status === "Uygun" ? "" : ""
                        }`}
                      >
                        {item.name}: {item.score}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p>Bitki bazli uyumluluk hesaplanamadi.</p>
                )}
              </div>
              <div className="step-card">
                <h3>Soru sor</h3>
                <p>Ornek: "Bursa'da tinali toprakta ne ekilir?"</p>
                <textarea
                  className="note"
                  value={soilQuestion}
                  onChange={(event) => setSoilQuestion(event.target.value)}
                  placeholder="Sorunu yaz, ekip planini buradan olusturalim."
                />
                <button
                  className="primary"
                  onClick={() => {
                    setSoilAnswer(buildSoilAnswer());
                    openConsultMail(soilQuestion || "Toprak ve ekim uygunlugu icin danismanlik talebi.");
                  }}
                >
                  Danismanlik iste
                </button>
                {soilAnswer && <p className="muted">{soilAnswer}</p>}
              </div>
            </div>
          </section>
