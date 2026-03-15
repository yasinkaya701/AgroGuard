              )}
            </section>
          ) : null}

          {bottomTab === "home" && (
            <div className="telemetry-dashboard">
              <div className="hero">
                <div className="hero-badge">Sistem Çevrimiçi</div>
                <h1>Tarla İzleme ve Analiz</h1>
                <p>Kamera sensörleri ve uydu verisi ile arazinizi anlık olarak denetleyin.</p>
                
                <div className="hero-stats">
                  <div>
                    <span>Son Senkronizasyon</span>
                    <strong>Sinyal Aktif</strong>
                  </div>
                  <div>
                    <span>Taranan Alan</span>
                    <strong>124 Dekar</strong>
                  </div>
                  <div>
                    <span>Aktif Risk</span>
                    <strong className="safe-text">Temiz</strong>
                  </div>
                </div>
              </div>

              <div className="bento-grid">
                <div className="bento-card scan-card" onClick={() => fileInputRef.current?.click()}>
                  <div className="scan-icon-wrapper">
                    <Camera size={48} strokeWidth={1} />
                  </div>
                  <h3>Yeni Spektral Analiz</h3>
                  <p>Yapay zeka ile anında hastalık ve zararlı tespiti yapın.</p>
                  <button className="btn-primary mt-4">Kamerayı Aç</button>
                </div>

                <div className="bento-card">
                  <div className="card-header">
                    <Activity className="accent-icon" size={20} />
                    <h3>Aksiyon Merkezi</h3>
                  </div>
                  <div className="bento-list">
                    <div className="bento-list-item">
                      <div className="indicator safe"></div>
                      <div>
                        <strong>Nem seviyesi optimal</strong>
                        <span>Son sulama: 4 saat önce</span>
                      </div>
                    </div>
                    <div className="bento-list-item">
                      <div className="indicator warn"></div>
                      <div>
                        <strong>Zararlı riski artıyor</strong>
                        <span>Trip popülasyonu uyarı sınırında</span>
                      </div>
                    </div>
                  </div>
                  <button className="btn mt-4 w-full" onClick={() => handleBottomTab("demos")}>
                    Detaylı Raporlar
                  </button>
                </div>

                <div className="bento-card">
                  <div className="card-header">
                    <Map className="accent-icon" size={20} />
                    <h3>Bölge Konumu</h3>
                  </div>
                  <div className="map-placeholder">
                    {TURKEY_CITIES_81[0]} - Uydu Görünümü
                  </div>
                  <button className="btn mt-4 w-full" onClick={() => handleBottomTab("weather")}>
                    Haritaya Git
                  </button>
                </div>
              </div>
            </div>
          )}
