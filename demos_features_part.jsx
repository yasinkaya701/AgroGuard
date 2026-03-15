          {bottomTab === "demos" ? <div id="demo" className="section-anchor" /> : null}
          {bottomTab === "demos" ? (<div className="advanced-toggle">
            <div className="demo-note">
              <strong>Demo / Ar-Ge alani</strong>
              <p>Gelistirme asamasindaki ozellikler burada toplanir.</p>
            </div>
            <div className="demo-actions">
              <button
                className="ghost"
                onClick={() => startQuickDemo("normal")}
              >
                Hizli demo baslat
              </button>
              <button
                className="ghost"
                onClick={() => startQuickDemo("frost_stress")}
              >
                Kritik senaryo
              </button>
              <button
                className="primary"
                onClick={() => {
                  setShowFullDemo((prev) => !prev);
                  document.getElementById("demo")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                {showFullDemo ? "Demo modunu kapat" : "Demo modunu ac"}
              </button>
            </div>
          </div>) : null}
          {bottomTab === "demos" && showAdvanced && (
            <div className="drawer-overlay" onClick={() => { setShowFullDemo(true); setShowAdvanced(false); }}>
              <div className="mini-drawer" onClick={(event) => event.stopPropagation()}>
                <div className="drawer-head">
                  <strong>Diger Ozellikler</strong>
                  <button className="ghost" onClick={() => { setShowFullDemo(true); setShowAdvanced(false); }}>
                    Kapat
                  </button>
                </div>
                <div className="drawer-actions">
                  <button
                    className="ghost"
                    onClick={() => {
                      setShowFullDemo((prev) => !prev);
                      setShowAdvanced(false);
                    }}
                  >
                    {showFullDemo ? "Demo icerigini kisalt" : "Tum demo icerigi"}
                  </button>
                </div>
                <div className="drawer-tabs">
                  {[
                    { key: "operations", label: "Saha" },
                    { key: "intelligence", label: "AI" },
                    { key: "commerce", label: "Pazar" },
                    { key: "learning", label: "Ogrenme" }
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      className={drawerTab === tab.key ? "active" : ""}
                      onClick={() => setDrawerTab(tab.key)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="drawer-compact">
                  {drawerTab === "operations" && (
                    <div className="drawer-card">
                      <h4>Saha & Operasyon</h4>
                      <p>Hava, toprak, sulama, parsel ve risk kartlari.</p>
                      <a href="#operations" onClick={() => { setShowFullDemo(true); setShowAdvanced(false); }}>
                        Bolume git
                      </a>
                    </div>
                  )}
                  {drawerTab === "intelligence" && (
                    <div className="drawer-card">
                      <h4>AI & Rapor</h4>
                      <p>Ozet rapor, planlayici, risk haritasi.</p>
                      <a href="#intelligence" onClick={() => { setShowFullDemo(true); setShowAdvanced(false); }}>
                        Bolume git
                      </a>
                    </div>
                  )}
                  {drawerTab === "commerce" && (
                    <div className="drawer-card">
                      <h4>Pazar & Uygunluk</h4>
                      <p>Fiyat, lojistik, sertifikasyon ve kayit.</p>
                      <a href="#commerce" onClick={() => { setShowFullDemo(true); setShowAdvanced(false); }}>
                        Bolume git
                      </a>
                    </div>
                  )}
                  {drawerTab === "learning" && (
                    <div className="drawer-card">
                      <h4>Ogrenme</h4>
                      <p>Kilavuz, dersler, uygulama notlari.</p>
                      <a href="#learning" onClick={() => { setShowFullDemo(true); setShowAdvanced(false); }}>
                        Bolume git
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {bottomTab === "demos" && showAdvanced && !showFullDemo && (
            <section className="demo-compact">
              <div className="steps-header">
                <h2>Demo ozellik ozetleri</h2>
                <p>Detaya girmek icin tum demo icerigini acabilirsin.</p>
              </div>
              <div className="demo-compact-grid">
                {demoCompactItems.map((item) => (
                  <div key={item.title} className="demo-compact-card">
                    <h3>{item.title}</h3>
                    <p>{item.detail}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {bottomTab === "demos" && showFullDemo && (
            <section className="steps">
              <div className="steps-header">
                <h2>3 adimda teshis</h2>
                <p>Ekstra donanim yok. Sadece fotograf, hizli sonuc.</p>
              </div>
              <div className="step-grid">
                {steps.map((step, index) => (
                  <div key={step.title} className="step-card">
                    <span className="step-index">0{index + 1}</span>
                    <h3>{step.title}</h3>
                    <p>{step.detail}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {bottomTab === "demos" && showFullDemo && (
            <>
            <section className="features">
              <div className="steps-header">
                <h2>Demo saha icgoru paketleri</h2>
                <p>Gorev, risk ve verim ciktilarini tek akista topla.</p>
              </div>
              <div className="step-grid">
                {demoInsightCards.map((item) => (
                  <div key={item.title} className="step-card">
                    <h3>{item.title}</h3>
                    <p>{item.detail}</p>
                  </div>
                ))}
              </div>
            </section>
            <section className="features">
              <div className="steps-header">
                <h2>Canli video + sesli asistan</h2>
                <p>Uygulama mobil oldugunda kameradan canli teshis ve sesli danismanlik.</p>
              </div>
              <div className="step-grid">
                <div className="step-card">
                  <h3>Canli kamera analizi</h3>
                  <p>Yapraklari gezdir, sistem sorunlu bolgeleri isaretlesin.</p>
                  <span className="badge subtle">Yakinda aktif</span>
                </div>
                <div className="step-card">
                  <h3>Sesli soru-cevap</h3>
                  <p>\"Bu leke neden oldu?\" diye sor, sahaya uygun cevap al.</p>
                  <span className="badge subtle">Mobilde acilacak</span>
                </div>
                <div className="step-card">
                  <h3>Video kayitli rapor</h3>
                  <p>Canli seans sonunda otomatik rapor ve aksiyon listesi.</p>
                  <span className="badge subtle">Beta asamasinda</span>
                </div>
                <div className="step-card assistant-card">
                  <h3>AI asistan oturumu</h3>
                  <p>Sesli sor, canli tespit et, aksiyon planini otomatik al.</p>
                  <div className="assistant-status">
                    <span>Mod</span>
                    <strong>Canli teshis + danismanlik</strong>
                  </div>
                  <span className="badge">Oturum baslat (mobilde)</span>
                </div>
              </div>
            </section>
            </>

          )}


          {bottomTab === "demos" && showFullDemo && (
            <>
          <div id="intelligence" className="section-anchor" />
              <section className="features">
            <div className="steps-header">
              <h2>AI saha raporu</h2>
              <p>Canli tespit oturumlarini rapora ceviren otomatik dokum.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Ozet rapor</h3>
                <ul>
                  <li>Tespit edilen hastalik ve risk skoru</li>
                  <li>Problem bolgesi ve yayilim haritasi</li>
                  <li>Uygulama takvimi ve acil aksiyonlar</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Uygulama planlayici</h3>
                <ul>
                  <li>Ilac/organik cozum zamanlari</li>
                  <li>Takip fotograflari icin hatirlatici</li>
                  <li>Risk azalma trendi</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Paylasim ve export</h3>
                <ul>
                  <li>PDF rapor indir (mobil)</li>
                  <li>Danisman ile paylas</li>
                  <li>Parsel arsivi ile eslestir</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="features land-demo-section">
            <div className="steps-header">
              <h2>Hastalik risk haritasi</h2>
              <p>Parsel bazli riskleri renklerle takip et.</p>
            </div>
            <div className="step-grid land-demo-grid">
              <div className="step-card land-demo-card">
                <h3>Parsel 1</h3>
                <div className="risk-meter high">Yuksek risk</div>
                <p>Nem ve yaprak islakligi yuksek.</p>
              </div>
              <div className="step-card">
                <h3>Parsel 2</h3>
                <div className="risk-meter mid">Orta risk</div>
                <p>Hava akisi yetersiz.</p>
              </div>
              <div className="step-card">
                <h3>Parsel 3</h3>
                <div className="risk-meter low">Dusuk risk</div>
                <p>Denge stabil.</p>
              </div>
            </div>
          </section>

          <section className="features trade-section">
            <div className="steps-header">
              <h2>Parsel arsivi</h2>
              <p>Her parsel icin teshis ve uygulama gecmisi.</p>
            </div>
            <div className="step-grid trade-grid">
              <div className="step-card trade-card">
                <h3>Parsel: Battalgazi-1</h3>
                <ul>
                  <li>Son teshis: Bakteriyel leke</li>
                  <li>Uygulama: Bakir + mankozeb</li>
                  <li>Son guncelleme: 2 gun once</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Parsel: Yazihan-2</h3>
                <ul>
                  <li>Son teshis: Kulleme</li>
                  <li>Uygulama: Kukürt bazli</li>
                  <li>Son guncelleme: 4 gun once</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Parsel: Ornek-3</h3>
                <ul>
                  <li>Son teshis: Saglikli</li>
                  <li>Uygulama: Koruyucu plan</li>
                  <li>Son guncelleme: 1 hafta once</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Verim tahminleme</h2>
              <p>Sezon ortasi beklenen uretim araligi.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Domates</h3>
                <p>Beklenen: 3.4 - 4.8 ton/da</p>
                <div className="score-pill">Trend: +%6</div>
              </div>
              <div className="step-card">
                <h3>Biber</h3>
                <p>Beklenen: 2.1 - 3.2 ton/da</p>
                <div className="score-pill">Trend: +%3</div>
              </div>
              <div className="step-card">
                <h3>Marul</h3>
                <p>Beklenen: 1.2 - 1.8 ton/da</p>
                <div className="score-pill">Trend: -%2</div>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Gunluk saha brifingi</h2>
              <p>Bugun yapilacak oncelikli isler.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Sabah</h3>
                <ul>
                  <li>Yaprak islakligi kontrolu</li>
                  <li>Sulama hattini gozden gecir</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Oglen</h3>
                <ul>
                  <li>Gunes stresi var mi kontrol et</li>
                  <li>Hizli zararlı taramasi</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Aksam</h3>
                <ul>
                  <li>Notlari kaydet</li>
                  <li>Yarin icin aksiyon planini belirle</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Is gucu planlayici</h2>
              <p>Gunluk ekip planlamasi ve gorev dagilimi.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Bugun ekip</h3>
                <ul>
                  <li>Sulama: 2 kisi</li>
                  <li>Ilaclama: 1 kisi</li>
                  <li>Hasat: 3 kisi</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Yarin</h3>
                <ul>
                  <li>Budama: 2 kisi</li>
                  <li>Toprak kontrol: 1 kisi</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Haftalik</h3>
                <ul>
                  <li>Bakim ve temizlik gunu</li>
                  <li>Depo stok kontrolu</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Ekipman bakim takvimi</h2>
              <p>Damla hatlari, ilaclama makinesi ve ekipman bakimi.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Haftalik</h3>
                <ul>
                  <li>Filtre temizligi</li>
                  <li>Depo hizli kontrol</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Aylik</h3>
                <ul>
                  <li>Ilaclama nozulu kontrolu</li>
                  <li>Basinc ayari</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Sezonluk</h3>
                <ul>
                  <li>Hat yikama</li>
                  <li>Yedek parca yenileme</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Ilaclama gunlugu</h2>
              <p>Uygulanan ilac, tarih ve doz kaydi.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Son uygulama</h3>
                <ul>
                  <li>Urun: Bakir + mankozeb</li>
                  <li>Tarih: 2 gun once</li>
                  <li>Doz: Etikete uygun</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Planlanan</h3>
                <ul>
                  <li>Urun: Kukürt bazli</li>
                  <li>Tarih: 3 gun sonra</li>
                  <li>Not: Hava ruzgarsiz olmali</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Uyari</h3>
                <p>Hasat oncesi bekleme suresi etiketten kontrol edilmeli.</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Su kullanimi takibi</h2>
              <p>Sezonluk su tuketimi ve tasarruf hedefleri.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Guncel tuketim</h3>
                <p>Haftalik 32 m³</p>
                <div className="score-pill">Hedef: 28 m³</div>
              </div>
              <div className="step-card">
                <h3>Tasarruf oneri</h3>
                <p>Gece sulamasi ve basinc dusurme ile %8 tasarruf.</p>
              </div>
              <div className="step-card">
                <h3>Kayip alarmi</h3>
                <div className="risk-meter mid">Orta risk</div>
                <p>Hatta kacaği kontrol et.</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Girdi ve stok yonetimi</h2>
              <p>Tohum, gubre ve ilac stoklarini tek panelde takip et.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Tohum stogu</h3>
                <ul>
                  <li>Domates: 4 paket</li>
                  <li>Biber: 2 paket</li>
                  <li>Marul: 6 paket</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Gubre stogu</h3>
                <ul>
                  <li>Azot: 120 kg</li>
                  <li>Fosfor: 60 kg</li>
                  <li>Potasyum: 80 kg</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Ilac stogu</h3>
                <ul>
                  <li>Bakirli: 12 L</li>
                  <li>Kukurt: 8 kg</li>
                  <li>Yaprak biti: 4 L</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Rotasyon planlayici</h2>
              <p>Topragi dinlendir, hastalik baskisini dusur.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Yil 1</h3>
                <ul>
                  <li>Parsel A: Domates</li>
                  <li>Parsel B: Baklagil</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Yil 2</h3>
                <ul>
                  <li>Parsel A: Tahil</li>
                  <li>Parsel B: Domates</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Yil 3</h3>
                <ul>
                  <li>Parsel A: Yag bitkisi</li>
                  <li>Parsel B: Tahil</li>
                </ul>
              </div>
            </div>
          </section>



          <div id="commerce" className="section-anchor" />
          <section className="features">
            <div className="steps-header">
              <h2>Canli saha risk & hasat penceresi</h2>
              <p>5 gunluk tahmin ve anlik verilerle planlama.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Isik/Isı penceresi</h3>
                {forecastSummary ? (
                  <>
                    <p>
                      Min: {forecastSummary.minTemp}°C • Max: {forecastSummary.maxTemp}°C
                    </p>
                    <div className="score-pill">
                      Don gunu: {forecastSummary.frostDays} • Yagisli gun: {forecastSummary.rainyDays}
                    </div>
                  </>
                ) : (
                  <p>Veri bekleniyor.</p>
                )}
              </div>
              <div className="step-card">
                <h3>Yagis riski</h3>
                {forecastSummary ? (
                  <>
                    <p>Maks yagis: {forecastSummary.maxPrecip} mm</p>
                    <div className="score-pill">
                      {forecastSummary.maxPrecip >= 20 ? "Asiri yagis riski" : "Yagis kontrolu"}
                    </div>
                  </>
                ) : (
                  <p>Veri bekleniyor.</p>
                )}
              </div>
              <div className="step-card">
                <h3>Ruzgar stresi</h3>
                <p>Tepe ruzgar: {Math.round(maxWindKmh)} km/sa</p>
                <div className="score-pill">
                  {maxWindKmh >= 35 ? "Yuksek risk" : maxWindKmh >= 20 ? "Orta risk" : "Dengeli"}
                </div>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Depolama ve lojistik</h2>
              <p>Hasat sonrasi kaybi azaltan kontrol listesi.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Soguk zincir</h3>
                <ul>
                  <li>On sogutma 0-4°C</li>
                  <li>Nem: %85-90</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Paketleme</h3>
                <ul>
                  <li>Darbelere karsi koruma</li>
                  <li>Havalandirmali kasa</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Nakliye</h3>
                <ul>
                  <li>Gunes altinda bekletme</li>
                  <li>Etiketleme ve izlenebilirlik</li>
                </ul>
              </div>
            </div>
          </section>



          <div id="compliance" className="section-anchor" />

                      <section className="features">
            <div className="steps-header">
              <h2>Uygunluk kontrolu</h2>
              <p>Gida guvenligi ve etiket uyum adimlari.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <ul>
                  <li>PHI (hasat oncesi bekleme) kaydi</li>
                  <li>Ilaclama etiketi ve doz uyumu</li>
                  <li>Personel KKD kontrolu</li>
                </ul>
              </div>
              <div className="step-card">
                <ul>
                  <li>Parti bazli izlenebilirlik</li>
                  <li>Depolama sicaklik kaydi</li>
                  <li>Atik bertaraf kaydi</li>
                </ul>
              </div>
              <div className="step-card">
                <ul>
                  <li>Su kaynagi test raporu</li>
                  <li>Gubre kaynagi belge kontrolu</li>
                  <li>Yillik risk degerlendirme</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Operasyon performans ozeti</h2>
              <p>Saha skoru ve oncelikli aksiyonlarin anlik ozeti.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Saha skoru</h3>
                <p>{fieldScore.score} / 100</p>
                <div className="score-pill">{fieldScore.status}</div>
              </div>
              <div className="step-card">
                <h3>Oncelikler</h3>
                <ul>
                  {fieldScore.priorities.slice(0, 3).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="step-card">
                <h3>Uyari yogunlugu</h3>
                <p>{weatherSummary?.riskTags?.join(" • ") || "Normal"}</p>
                <div className="score-pill">
                  {weatherSummary ? `Skor ${weatherSummary.score}/100` : "Veri bekleniyor"}
                </div>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Hastalik trend analizi</h2>
              <p>Son teshislerden olusan canli dagilim.</p>
            </div>
            <div className="step-grid">
              {diseaseTrends.length ? (
                diseaseTrends.map((item) => (
                  <div key={item.name} className="step-card">
                    <h3>{item.name}</h3>
                    <div className="score-pill">%{item.pct}</div>
                  </div>
                ))
              ) : (
                <div className="step-card">
                  <h3>Veri yok</h3>
                  <p>Henuz analiz kaydi yok.</p>
                </div>
              )}
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Canli veri kaynaklari</h2>
              <p>Uygulamanin internete bagli canli veri durumlari.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Hava</h3>
                <p>{weather?.source ? `Kaynak: ${weather.source}` : "Veri yok"}</p>
                <div className="score-pill">
                  {weather?.updatedAt
                    ? `Guncel: ${new Date(weather.updatedAt).toLocaleTimeString("tr-TR")}`
                    : "Guncelleme yok"}
                </div>
              </div>
              <div className="step-card">
                <h3>Tahmin</h3>
                <p>{forecast?.source ? `Kaynak: ${forecast.source}` : "Veri yok"}</p>
                <div className="score-pill">
                  {forecast?.days?.length ? `${forecast.days.length} gunluk veri` : "Tahmin yok"}
                </div>
              </div>
              <div className="step-card">
                <h3>Toprak</h3>
                <p>{soilReport?.source ? `Kaynak: ${soilReport.source}` : "Veri yok"}</p>
                <div className="score-pill">
                  {soilReport?.soilType ? `Tip: ${soilReport.soilType}` : "Tip yok"}
                </div>
              </div>

              <div className="step-card">
                <h3>API metrikleri</h3>
                <p>{metrics?.status === "ok" ? "Saglikli" : "Bilinmiyor"}</p>
                <div className="score-pill">
                  {metrics ? `Uptime ${metrics.uptimeSec}s` : "Veri yok"}
                </div>
                <small className="muted">
                  {metrics ? `Queue ${metrics.queueLength} • Cache ${metrics.cacheSize}` : metricsError}
                </small>
                {metrics && (
                  <small className={`muted ${metricsStale ? "warning-text" : ""}`}>
                    {metricsStale ? "Metrik verisi bayat" : "Metrik verisi guncel"} •{" "}
                    {metricsUpdatedAt
                      ? new Date(metricsUpdatedAt).toLocaleTimeString("tr-TR")
                      : "-"}
                  </small>
                )}
                {metrics && (
                  <small className="muted">
                    Model: {metrics.primaryModelLoaded ? "primary" : "-"}
                    {metrics.secondaryModelLoaded ? " + secondary" : ""} • Sinif:{" "}
                    {metrics.modelLabels ?? 0}
                  </small>
                )}
                {metrics?.modelStrictOnly ? (
                  <small className="muted">Mod: strict (fallback kapali)</small>
                ) : null}
                {backendInfo.modelVersion ? (
                  <small className="muted">
                    Backend API {backendInfo.apiVersion || "-"} • Model {backendInfo.modelVersion}
                  </small>
                ) : null}
                {integrationsHealth ? (
                  <>
                    <small className="muted">
                      Dis API: {Number(integrationsHealth.healthy || 0)}/{Number(integrationsHealth.total || 0)} saglikli
                    </small>
                    <div className="info-badges">
                      {(integrationsHealth.items || []).slice(0, 4).map((item) => (
                        <span key={`integration-health-${item.id}`} className={`badge ${item.ok ? "safe" : "warn"}`}>
                          {item.title}: {item.ok ? "ok" : item.status || "down"}
                        </span>
                      ))}
                    </div>
                    <div className="demo-actions">
                      <button className="ghost" onClick={() => loadIntegrationsHealth(true)}>
                        API kontrollerini yenile
                      </button>
                    </div>
                  </>
                ) : null}
                {integrationsHealthError ? <small className="muted warning-text">{integrationsHealthError}</small> : null}
                {modelHealth ? (
                  <>
                    <small className={`muted ${modelHealth.healthy ? "" : "warning-text"}`}>
                      Model health: {modelHealth.healthy ? "iyi" : "sorun var"} • pipeline{" "}
                      {modelHealth?.checks?.pipelineCount ?? 0}
                    </small>
                    {modelHealth?.lastFailure ? (
                      <small className="muted warning-text">
                        Son hata: {modelHealth.lastFailure.failureCode} • {modelHealth.lastFailure.detail}
                      </small>
                    ) : (
                      <small className="muted">
                        Son basarili analiz:{" "}
                        {modelHealth?.lastSuccessAt
                          ? new Date(modelHealth.lastSuccessAt).toLocaleTimeString("tr-TR")
                          : "-"}
                      </small>
                    )}
                    {Array.isArray(modelHealth?.recommendations) && modelHealth.recommendations.length ? (
                      <small className="muted warning-text">
                        Oneri: {modelHealth.recommendations.slice(0, 2).join(" • ")}
                      </small>
                    ) : null}
                  </>
                ) : null}
                {modelHealthError ? <small className="muted warning-text">{modelHealthError}</small> : null}
                {modelSelfCheck ? (
                  <small className={`muted ${modelSelfCheck.ok ? "" : "warning-text"}`}>
                    Self-check: {modelSelfCheck.summary}
                  </small>
                ) : null}
                {modelDiagnostics?.diagnostics ? (
                  <>
                    <small
                      className={`muted ${
                        modelDiagnostics.diagnostics.lowVarianceWarning ? "warning-text" : ""
                      }`}
                    >
                      Guven dagilimi std: %
                      {Math.round(Number(modelDiagnostics.diagnostics?.confidence?.std || 0) * 1000) / 10} •
                      ortalama %{Math.round(Number(modelDiagnostics.diagnostics?.confidence?.mean || 0) * 100)}
                    </small>
                    <small className="muted">
                      Cesitlilik: {modelDiagnostics.diagnostics.labelDiversity || 0} sinif •
                      healthy orani %{Math.round(Number(modelDiagnostics.diagnostics.healthyRate || 0) * 100)}
                    </small>
                    <small className="muted">
                      Fallback orani %{Math.round(Number(modelDiagnostics.diagnostics.fallbackRate || 0) * 100)} •
                      baskin sinif payi %
                      {Math.round(Number(modelDiagnostics.diagnostics.dominantLabelShare || 0) * 100)}
                    </small>
                    <small className="muted">
                      Tahmin hata orani %{Math.round(Number(modelDiagnostics.diagnostics.failureRate || 0) * 100)} •
                      pencere {modelDiagnostics.diagnostics.predictEventWindow || "-"}
                    </small>
                    {modelDiagnostics.diagnostics.sourceBreakdown ? (
                      <small className="muted">
                        Kaynak dagilimi:{" "}
                        {Object.entries(modelDiagnostics.diagnostics.sourceBreakdown)
                          .map(([key, value]) => `${key}:${value}`)
                          .join(" • ") || "-"}
                      </small>
                    ) : null}
                    {Array.isArray(modelDiagnostics.diagnostics.topLabels) &&
                    modelDiagnostics.diagnostics.topLabels.length ? (
                      <small className="muted">
                        En sik siniflar:{" "}
                        {modelDiagnostics.diagnostics.topLabels
                          .slice(0, 3)
                          .map((item) => `${item.label} (%${Math.round(Number(item.share || 0) * 100)})`)
                          .join(" • ")}
                      </small>
                    ) : null}
                    {Array.isArray(modelDiagnostics.diagnostics.recommendations) &&
                    modelDiagnostics.diagnostics.recommendations.length ? (
                      <small className="muted warning-text">
                        Oneri: {modelDiagnostics.diagnostics.recommendations.slice(0, 2).join(" • ")}
                      </small>
                    ) : null}
                    {Array.isArray(modelDiagnostics.diagnostics.recentPredictions) &&
                    modelDiagnostics.diagnostics.recentPredictions.length ? (
                      <small className="muted">
                        Son tahminler:{" "}
                        {modelDiagnostics.diagnostics.recentPredictions
                          .slice(0, 3)
                          .map(
                            (item) =>
                              `${item.label} %${Math.round(Number(item.confidence || 0) * 100)} (${item.status})`
                          )
                          .join(" • ")}
                      </small>
                    ) : null}
                    {Array.isArray(modelDiagnostics.diagnostics.recentFailures) &&
                    modelDiagnostics.diagnostics.recentFailures.length ? (
                      <small className="muted warning-text">
                        Son hatalar:{" "}
                        {modelDiagnostics.diagnostics.recentFailures
                          .slice(0, 2)
                          .map((item) => `${item.stage}:${item.failureCode}`)
                          .join(" • ")}
                      </small>
                    ) : null}
                  </>
                ) : null}
                {modelDiagnosticsError ? (
                  <small className="muted warning-text">{modelDiagnosticsError}</small>
                ) : null}
                <div className="demo-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setApiHealthTick((prev) => prev + 1);
                      setMetricsRefreshTick((prev) => prev + 1);
                    }}
                  >
                    Metrikleri yenile
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={runModelSelfCheck}
                    disabled={modelSelfCheckRunning || !supportsModelSelfCheck}
                  >
                    {modelSelfCheckRunning ? "Self-check..." : "Model self-check"}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={resetModelDiagnostics}
                    disabled={modelDiagnosticsResetRunning || !supportsModelDiagnostics}
                  >
                    {modelDiagnosticsResetRunning ? "Reset..." : "Diagnostics reset"}
                  </button>
                </div>
              </div>
            </div>
          </section>
      </>
      )}

          {bottomTab === "demos" && (
          <section className={`features ${demoUiMode === "expert" ? "demo-mode-expert" : "demo-mode-simple"}`}>
            <div className="steps-header">
              <h2>Demo durum panosu</h2>
              <p>Her modulu tek tek acip hizli test et.</p>
            </div>
            <div className="demo-mode-toggle">
              <button
                type="button"
                className={demoUiMode === "simple" ? "active" : ""}
                onClick={() => setDemoUiMode("simple")}
              >
                Basit
              </button>
              <button
                type="button"
                className={demoUiMode === "expert" ? "active" : ""}
                onClick={() => setDemoUiMode("expert")}
              >
                Uzman
              </button>
            </div>
            <div className="demo-ready-banner">
              <div>
                <strong>Tek tikla demo hazirlama</strong>
                <p>Paket uygula, arazi+pazar seed yukle ve smoke testi otomatik kos.</p>
                {demoBootstrapSummary ? <small className="muted">{demoBootstrapSummary}</small> : null}
              </div>
              <div className="demo-actions">
                <button
                  className="primary"
                  onClick={() => prepareDemosForUse({ silent: false })}
                  disabled={demoBootstrapRunning || demoAutopilotRunning || demoFlowRunning || demoShowcaseRunning}
                >
                  {demoBootstrapRunning ? "Demo hazirlaniyor..." : "Demolari hazirla"}
                </button>
                <button
                  className="ghost"
                  onClick={runDemoShowcaseReady}
                  disabled={demoBootstrapRunning || demoAutopilotRunning || demoFlowRunning || demoShowcaseRunning}
                >
                  {demoShowcaseRunning ? "Sunum hazirlaniyor..." : "Sunuma hazirla"}
                </button>
                {!demoBootstrapReady ? (
                  <button
                    className="ghost"
                    onClick={() => prepareDemosForUse({ silent: false, autoRepair: false })}
                    disabled={demoBootstrapRunning || demoAutopilotRunning || demoFlowRunning || demoShowcaseRunning}
                  >
                    Tekrar dene
                  </button>
                ) : null}
                <span className={`badge ${demoBootstrapReady ? "safe" : "warn"}`}>
                  {demoBootstrapReady ? "Durum: hazir" : "Durum: hazirlaniyor"}
                </span>
              </div>
            </div>
            <div className="demo-story-grid">
              <article className="demo-story-card">
                <strong>Saha turu</strong>
                <p>Teshis, iklim ve model sagligini tek akista dogrula.</p>
                <div className="info-badges">
                  <span className="badge">Akis: Tam tur</span>
                  <span className="badge">Hedef: teknik demo</span>
                </div>
                <button
                  className="ghost"
                  onClick={() => {
                    setBottomTab("demos");
                    runDemoFlowPreset("all_round");
                  }}
                  disabled={demoFlowRunning || demoAutopilotRunning}
                >
                  Sahneyi baslat
                </button>
              </article>
              <article className="demo-story-card">
                <strong>Yatirimci hikayesi</strong>
                <p>Pazar + arazi + KPI setini sunuma hazir akista topla.</p>
                <div className="info-badges">
                  <span className="badge">Akis: Showcase</span>
                  <span className="badge">Hedef: yatirimci</span>
                </div>
                <button className="ghost" onClick={runInvestorShowcase} disabled={demoFlowRunning || demoAutopilotRunning}>
                  Yatirimci akisini ac
                </button>
              </article>
              <article className="demo-story-card">
                <strong>Model guven turu</strong>
                <p>Self-check, diagnostics ve smoke akisini birlestirir.</p>
                <div className="info-badges">
                  <span className="badge">Akis: Model + onarim</span>
                  <span className="badge">Hedef: guvenilirlik</span>
                </div>
                <button
                  className="ghost"
                  onClick={() => {
                    setBottomTab("home");
                    runDemoFlowPreset("model_smoke");
                  }}
                  disabled={demoFlowRunning || demoAutopilotRunning}
                >
                  Model turunu ac
                </button>
              </article>
              <article className="demo-story-card">
                <strong>Arazi + pazar turu</strong>
                <p>Fiyatlama paneli ve pazar vitrini gecisini hizla dogrula.</p>
                <div className="info-badges">
                  <span className="badge">Akis: Pazar + finans</span>
                  <span className="badge">Hedef: ticari demo</span>
                </div>
                <button
                  className="ghost"
                  onClick={() => {
                    setBottomTab("land");
                    setCommerceMiniTab("land");
                    runDemoFlowPreset("market_finance");
                  }}
                  disabled={demoFlowRunning || demoAutopilotRunning}
                >
                  Ticari turu ac
                </button>
              </article>
            </div>
            <div className="demo-pack-row">
              <label className="plant-select">
                <span>Demo paketi</span>
                <select value={demoPack} onChange={(e) => setDemoPack(e.target.value)}>
                  <option value="normal">Normal</option>
                  <option value="riskli">Riskli saha</option>
                  <option value="pazar-hizli">Pazar hizli</option>
                  <option value="pazar-durgun">Pazar durgun</option>
                </select>
              </label>
              <label className="plant-select">
                <span>Autopilot modu</span>
                <select value={demoAutopilotMode} onChange={(e) => setDemoAutopilotMode(e.target.value)}>
                  <option value="quick">Hizli</option>
                  <option value="full">Tam</option>
                </select>
              </label>
              <label className="plant-select">
                <span>Retry</span>
                <select
                  value={String(demoAutopilotRetryCount)}
                  onChange={(e) => setDemoAutopilotRetryCount(Number(e.target.value) || 0)}
                >
                  <option value="0">0</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                </select>
              </label>
              <div className="demo-actions">
                <button className="ghost" onClick={() => applyDemoPack(demoPack)}>
                  Paketi uygula
                </button>
                <button className="ghost" onClick={() => applyDemoPack("normal")}>
                  Normal'e don
                </button>
                <button className="ghost" onClick={runDemoResetSeed} disabled={demoAutopilotRunning}>
                  Full reset + seed
                </button>
                <button className="primary" onClick={runDemoAutopilot} disabled={demoAutopilotRunning}>
                  {demoAutopilotRunning ? "Autopilot calisiyor..." : "Demo autopilot"}
                </button>
              </div>
            </div>
            <div className="info-badges">
              <span className="badge">Hazir moduller: {demoControlMetrics.readyModules}/{demoControlMetrics.totalModules}</span>
              <span className="badge">Bekleyen: {demoControlMetrics.waitingModules}</span>
              <span className={`badge ${demoControlMetrics.runScore >= 80 ? "safe" : ""}`}>Demo skoru: {demoControlMetrics.runScore}/100</span>
              <span className="badge">Smoke: {demoControlMetrics.smokePass}/{demoControlMetrics.smokeTotal || "-"}</span>
            </div>
            <div className="demo-quick-actions">
              <button className="ghost" onClick={() => startQuickDemo("normal")} disabled={demoFlowRunning || demoAutopilotRunning}>
                Hizli baslat
              </button>
              <button className="ghost" onClick={() => startQuickDemo("frost_stress")} disabled={demoFlowRunning || demoAutopilotRunning}>
                Don senaryosu
              </button>
              <button className="ghost" onClick={runDemoEndToEnd} disabled={demoFlowRunning || demoAutopilotRunning}>
                Uctan uca
              </button>
              <button className="ghost" onClick={runDemoAutoRepair} disabled={demoFlowRunning || demoAutopilotRunning}>
                Oto onarim
              </button>
              <button className="ghost" onClick={runDemoSmokeTest} disabled={demoFlowRunning || demoAutopilotRunning}>
                Smoke test
              </button>
              <button className="ghost" onClick={simulateDemoDay} disabled={demoFlowRunning || demoAutopilotRunning}>
                Gun sonu simule et
              </button>
              <button className="ghost" onClick={runFailedDemoFlows} disabled={demoFlowRunning || demoAutopilotRunning}>
                Hatali akislari tekrarla
              </button>
              <button
                className="ghost"
                onClick={() => demoFlowTrend?.topFailFlowId && runDemoFlow(demoFlowTrend.topFailFlowId)}
                disabled={demoFlowRunning || demoAutopilotRunning || !demoFlowTrend?.topFailFlowId}
              >
                Kritik akisi calistir
              </button>
            </div>
            <div className="demo-preset-rail">
              <button className="ghost" onClick={() => runDemoFlowPreset("model_smoke")} disabled={demoFlowRunning || demoAutopilotRunning}>
                Preset: Model + Onarim
              </button>
              <button className="ghost" onClick={() => runDemoFlowPreset("market_finance")} disabled={demoFlowRunning || demoAutopilotRunning}>
                Preset: Pazar + Finans
              </button>
              <button className="ghost" onClick={() => runDemoFlowPreset("all_round")} disabled={demoFlowRunning || demoAutopilotRunning}>
                Preset: Tam tur
              </button>
            </div>
            <div className="investor-panel">
              <div className="investor-panel-head">
                <div>
                  <strong>Yatirimci sunum modulu</strong>
                  <small className="muted">Tek kartta urun hazirlik, pazar aktivitesi ve model guveni.</small>
                </div>
                <span className={`badge ${investorSnapshot.readiness >= 75 ? "safe" : "warn"}`}>
                  Hazirlik: {investorSnapshot.readiness}/100
                </span>
              </div>
              <div className="info-badges">
                <span className={`badge ${investorExecutionDecision.tone}`}>Yatirim karari: {investorExecutionDecision.label}</span>
                <span className="badge">{investorExecutionDecision.note}</span>
              </div>
              <div className="investor-kpi-grid">
                <article className="investor-kpi-card">
                  <span>Demo skoru</span>
                  <strong>{investorSnapshot.demoScore}/100</strong>
                </article>
                <article className="investor-kpi-card">
                  <span>Akis basari</span>
                  <strong>%{investorSnapshot.flowSuccess}</strong>
                </article>
                <article className="investor-kpi-card">
                  <span>Yayindaki ilan</span>
                  <strong>{investorSnapshot.marketOpen}</strong>
                </article>
                <article className="investor-kpi-card">
                  <span>Aktif siparis</span>
                  <strong>{investorSnapshot.activeOrders}</strong>
                </article>
                <article className="investor-kpi-card">
                  <span>Gerceklesen hacim</span>
                  <strong>{Math.round(investorSnapshot.fulfilledVolumeKg).toLocaleString("tr-TR")} kg</strong>
                </article>
                <article className="investor-kpi-card">
                  <span>Arazi model guveni</span>
                  <strong>%{investorSnapshot.landConfidence}</strong>
                </article>
              </div>
              <div className="investor-note-list">
                {investorHighlights.map((note) => (
                  <small key={note} className="muted">
                    • {note}
                  </small>
                ))}
              </div>
              <div className="investor-risk-grid">
                {investorRiskCards.map((card) => (
                  <article key={card.id} className="investor-risk-card">
                    <strong>{card.title}</strong>
                    <span>{card.state}</span>
                    <small className="muted">{card.note}</small>
                  </article>
                ))}
              </div>
              <div className="investor-room-grid">
                {investorDataRoom.map((block) => (
                  <article key={`investor-room-${block.id}`} className="investor-room-card">
                    <strong>{block.title}</strong>
                    {block.points.map((point) => (
                      <small key={point} className="muted">
                        • {point}
                      </small>
                    ))}
                  </article>
                ))}
              </div>
              <div className="investor-check-grid">
                {investorChecklist.map((item) => (
                  <article key={item.id} className="investor-check-card">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <em className={item.ok ? "safe-text" : "warning-text"}>{item.ok ? "Hazir" : "Takip et"}</em>
                  </article>
                ))}
              </div>
              <div className="investor-kpi-grid">
                <article className="investor-kpi-card">
                  <span>Gerceklesen GMV</span>
                  <strong>{Number(investorUnitEconomics.gmvTl || 0).toLocaleString("tr-TR")} TL</strong>
                </article>
                <article className="investor-kpi-card">
                  <span>Net gelir (take-rate)</span>
                  <strong>{Number(investorUnitEconomics.netRevenueTl || 0).toLocaleString("tr-TR")} TL</strong>
                </article>
                <article className="investor-kpi-card">
                  <span>Aylik proj. gelir</span>
                  <strong>{Number(investorUnitEconomics.projectedMonthlyRevenueTl || 0).toLocaleString("tr-TR")} TL</strong>
                </article>
              </div>
              <div className="investor-note-list">
                <small className="muted">
                  Take-rate varsayimi: %{Number(investorUnitEconomics.takeRatePct || 0).toFixed(1)} •
                  Siparis tamamlanma: %{Number(investorUnitEconomics.orderFillRatePct || 0)}
                </small>
                {investorMomentum ? (
                  <small className="muted">
                    Son snapshot trendi: {investorMomentum.trend}
                    {" • "}hazirlik degisimi {investorMomentum.delta > 0 ? "+" : ""}
                    {investorMomentum.delta}
                  </small>
                ) : (
                  <small className="muted">Trend icin en az 2 snapshot biriktir.</small>
                )}
              </div>
              <div className="investor-blockers">
                <strong>Sunum blokeleri</strong>
                {investorBlockers.length ? (
                  <ul>
                    {investorBlockers.map((item) => (
                      <li key={`blocker-${item.id}`}>{item.label}: {item.value}</li>
                    ))}
                  </ul>
                ) : (
                  <small className="safe-text">Kritik bloke yok. Sunum hazir.</small>
                )}
              </div>
              <div className="demo-quick-actions">
                <button className="primary" onClick={runInvestorShowcase} disabled={demoFlowRunning || demoAutopilotRunning}>
                  Yatirimci vitrinini calistir
                </button>
                <button className="ghost" onClick={runInvestorDryRun} disabled={demoFlowRunning || demoAutopilotRunning}>
                  Dry-run calistir
                </button>
                <button className="ghost" onClick={runInvestorPreflight} disabled={investorPreflightRunning}>
                  {investorPreflightRunning ? "Preflight kontrol..." : "Preflight kontrolu"}
                </button>
                <button className="ghost" onClick={exportInvestorBrief}>
                  Yatirimci ozeti indir
                </button>
                <button className="ghost" onClick={exportInvestorOnePager}>
                  One-pager indir
                </button>
                <button className="ghost" onClick={exportInvestorDeckHtml}>
                  Deck HTML indir
                </button>
                <button className="ghost" onClick={captureInvestorSnapshot}>
                  Snapshot al
                </button>
                <button className="ghost" onClick={clearInvestorSnapshots} disabled={!investorSnapshots.length}>
                  Snapshot temizle
                </button>
                <button className="ghost" onClick={copyInvestorScript}>
                  Sunum metnini kopyala
                </button>
                <button className="ghost" onClick={activatePresentationMode}>
                  Sunum moduna gec
                </button>
                <button
                  className="ghost"
                  onClick={() => {
                    setBottomTab("market");
                    setTradeWorkspaceTab("vitrin");
                  }}
                >
                  Pazar vitrini ac
                </button>
                <button
                  className="ghost"
                  onClick={() => {
                    setBottomTab("land");
                    setCommerceMiniTab("land");
                  }}
                >
                  Arazi panelini ac
                </button>
              </div>
              {investorPreflight ? (
                <div className="investor-preflight">
                  <div className="investor-preflight-head">
                    <strong>Preflight sonucu</strong>
                    <small className="muted">
                      {investorPreflight.city}/{investorPreflight.crop} • {investorPreflight.passCount}/
                      {investorPreflight.checks?.length || 0} gecti • {Math.round(investorPreflight.totalMs || 0)} ms
                    </small>
                  </div>
                  <div className="investor-preflight-grid">
                    {(investorPreflight.checks || []).map((row) => (
                      <article key={`preflight-${row.id}`} className="investor-preflight-card">
                        <span>{row.label}</span>
                        <strong className={row.ok ? "safe-text" : "warning-text"}>{row.ok ? "PASS" : "FAIL"}</strong>
                        <small className="muted">
                          HTTP {row.status || 0} • {row.latencyMs} ms
                        </small>
                        <small className="muted">{row.detail || "-"}</small>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
              {investorSnapshots.length ? (
                <div className="investor-preflight">
                  <div className="investor-preflight-head">
                    <strong>Snapshot gecmisi</strong>
                    <small className="muted">Son {Math.min(5, investorSnapshots.length)} kayit</small>
                  </div>
                  <div className="investor-preflight-grid">
                    {investorSnapshots.slice(0, 5).map((row) => (
                      <article key={`isnap-${row.id}`} className="investor-preflight-card">
                        <span>{new Date(row.capturedAt).toLocaleString("tr-TR")}</span>
                        <strong>Hazirlik {row.readiness}/100</strong>
                        <small className="muted">Akis %{row.flowSuccess} • Smoke {row.smokeFail}</small>
                        <small className="muted">
                          GMV {Number(row.gmvTl || 0).toLocaleString("tr-TR")} TL
                        </small>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
              <pre className="investor-script">{investorPresentationScript}</pre>
            </div>
            <div className="demo-insight-grid">
              <article className="demo-insight-card">
                <strong>Autopilot ozet</strong>
                <span>Adim: {demoAutopilotSummary.done}/{demoAutopilotSummary.total || "-"}</span>
                <span>Hata: {demoAutopilotSummary.failed}</span>
                <span>Ortalama sure: {demoAutopilotSummary.avgDurationMs} ms</span>
              </article>
              <article className="demo-insight-card">
                <strong>Akis trendi</strong>
                <span>Toplam kosu: {demoFlowStats.total}</span>
                <span>Basari: %{demoFlowStats.successRate}</span>
                <span>Kritik akis: {demoFlowTrend?.topFailFlowLabel || "-"}</span>
              </article>
              <article className="demo-insight-card">
                <strong>Smoke sonucu</strong>
                <span>
                  Son durum: {demoSmokeResult?.ok ? "basarili" : demoSmokeResult?.items?.length ? "hata var" : "bekleniyor"}
                </span>
                <span>Pass: {demoSmokeResult?.passCount ?? "-"}</span>
                <span>Fail: {demoSmokeResult?.failCount ?? "-"}</span>
              </article>
            </div>
            <div className="demo-health-strip">
              <div className="demo-health-bar">
                <span style={{ width: `${Math.max(0, Math.min(100, Number(demoControlMetrics.runScore || 0)))}%` }} />
              </div>
              <div className="info-badges">
                <span className={`badge ${Number(demoControlMetrics.runScore || 0) >= 80 ? "safe" : "warn"}`}>
                  Hazirlik: {demoControlMetrics.runScore}/100
                </span>
                <span className={`badge ${Number(demoFlowStats.successRate || 0) >= 80 ? "safe" : "warn"}`}>
                  Akis basari: %{demoFlowStats.successRate}
                </span>
                <span className="badge">Smoke fail: {demoSmokeResult?.failCount ?? "-"}</span>
              </div>
            </div>
            {demoSmokeHistory.length ? (
              <div className="demo-smoke-mini">
                {demoSmokeHistory.slice(0, 5).map((entry) => (
                  <span key={`demo-smoke-mini-${entry.id}`} className={`badge ${entry.ok ? "safe" : "warn"}`}>
                    {new Date(entry.at).toLocaleTimeString("tr-TR")} • {entry.passCount}/{entry.total || "-"}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="demo-command-hub">
              <div className="demo-command-head">
                <strong>Demo komut merkezi</strong>
                <span className={`badge ${demoRiskLevel.tone}`}>Risk: {demoRiskLevel.label}</span>
              </div>
              <div className="demo-command-grid">
                {demoRecommendedCommands.map((cmd) => (
                  <article key={`demo-cmd-${cmd.id}`} className="demo-command-card">
                    <strong>{cmd.title}</strong>
                    <small className="muted">{cmd.note}</small>
                    <button className="ghost" onClick={() => runDemoCommand(cmd.id)} disabled={demoFlowRunning || demoAutopilotRunning}>
                      Komutu calistir
                    </button>
                  </article>
                ))}
              </div>
            </div>
            <div className="demo-ops-rail">
              <button className="ghost" onClick={exportDemoFlowHistory} disabled={!demoFlowHistory.length}>
                Akis JSON indir
              </button>
              <button className="ghost" onClick={exportDemoJson}>
                Demo bundle indir
              </button>
              <button className="ghost" onClick={generateDemoReport}>
                Rapor uret
              </button>
              <button className="ghost" onClick={downloadDemoReport} disabled={!demoReport}>
                Rapor indir
              </button>
              <button
                className="ghost"
                onClick={() => {
                  setDemoSmokeHistory([]);
                  setDemoOpsStatus("Smoke gecmisi temizlendi.");
                }}
                disabled={!demoSmokeHistory.length || demoAutopilotRunning}
              >
                Smoke gecmisini temizle
              </button>
            </div>
            {demoFlowHistory[0] ? (
              <div className="demo-last-run-card">
                <strong>Son akis kosusu</strong>
                <span>
                  {demoFlowLibrary.find((item) => item.id === demoFlowHistory[0].flowId)?.title || demoFlowHistory[0].flowId} •{" "}
                  {demoFlowHistory[0].ok ? "ok" : "fail"} • {demoFlowHistory[0].durationMs} ms
                </span>
                <small className="muted">{demoFlowHistory[0].note || "-"}</small>
              </div>
            ) : null}
            {demoFailingFlows.length ? (
              <div className="demo-failing-panel">
                <strong>Tekrar eden hatali akislar</strong>
                <div className="demo-smoke-history">
                  {demoFailingFlows.map((item) => (
                    <div key={`demo-fail-${item.flowId}`} className="demo-step-chip">
                      <span className="badge warn">
                        {item.title} • {item.failCount} hata •{" "}
                        {item.lastAt ? new Date(item.lastAt).toLocaleTimeString("tr-TR") : "-"}
                      </span>
                      <button
                        className="ghost tiny"
                        onClick={() => runDemoFlow(item.flowId)}
                        disabled={demoFlowRunning || demoAutopilotRunning}
                      >
                        Calistir
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="demo-flow-grid">
              {demoFlowLibrary.map((flow) => (
                <article key={`demo-flow-${flow.id}`} className="demo-flow-card">
                  <h3>{flow.title}</h3>
                  <p>{flow.detail}</p>
                  {demoFlowStats.byFlow?.[flow.id] ? (
                    <small className={`muted ${demoFlowStats.byFlow[flow.id]?.ok ? "safe-text" : "warning-text"}`}>
                      Son kosu: {demoFlowStats.byFlow[flow.id]?.ok ? "basarili" : "hatali"} •{" "}
                      {Number(demoFlowStats.byFlow[flow.id]?.durationMs || 0)} ms
                    </small>
                  ) : (
                    <small className="muted">Bu akis henuz calistirilmadi.</small>
                  )}
                  <button
                    className="ghost"
                    onClick={() => runDemoFlow(flow.id)}
                    disabled={demoFlowRunning || demoAutopilotRunning}
                  >
                    {demoFlowRunning ? "Akim calisiyor..." : flow.actionLabel}
                  </button>
                </article>
              ))}
            </div>
            <div className="demo-actions">
              <button className="ghost" onClick={runAllDemoFlows} disabled={demoFlowRunning || demoAutopilotRunning}>
                Tum akislari calistir
              </button>
              <button className="ghost" onClick={exportDemoFlowHistory} disabled={!demoFlowHistory.length}>
                Akis gecmisini indir
              </button>
              <button
                className="ghost"
                onClick={() => {
                  setDemoFlowHistory([]);
                  setDemoFlowStatus("Akim gecmisi temizlendi.");
                }}
                disabled={!demoFlowHistory.length || demoFlowRunning || demoAutopilotRunning}
              >
                Akis gecmisini temizle
              </button>
            </div>
            <div className="demo-flow-toolbar">
              <label className="plant-select">
                <span>Filtre</span>
                <select value={demoFlowFilter} onChange={(e) => setDemoFlowFilter(e.target.value)}>
                  <option value="all">Tum sonuclar</option>
                  <option value="ok">Sadece basarili</option>
                  <option value="fail">Sadece hatali</option>
                </select>
              </label>
              <label className="plant-select">
                <span>Zaman</span>
                <select value={demoFlowWindow} onChange={(e) => setDemoFlowWindow(e.target.value)}>
                  <option value="all">Tum zaman</option>
                  <option value="today">Bugun</option>
                  <option value="7d">Son 7 gun</option>
                </select>
              </label>
              {demoFlowTrend ? (
                <div className="info-badges">
                  <span className={`badge ${demoFlowTrend.successRate >= 80 ? "safe" : ""}`}>
                    Son 10 basari: %{demoFlowTrend.successRate}
                  </span>
                  <span className="badge">Son 10 hata: {demoFlowTrend.fail}</span>
                  <span className="badge">Kritik akis: {demoFlowTrend.topFailFlowLabel}</span>
                </div>
              ) : null}
            </div>
            <div className="info-badges">
              <span className="badge">Akim kosu: {demoFlowStats.total}</span>
              <span className={`badge ${demoFlowStats.successRate >= 80 ? "safe" : ""}`}>Basari: %{demoFlowStats.successRate}</span>
              <span className="badge">Hata: {demoFlowStats.fail}</span>
              <span className="badge">Ortalama: {demoFlowStats.avgDurationMs} ms</span>
            </div>
            {demoFlowHistoryFiltered.length ? (
              <div className="demo-flow-history">
                {demoFlowHistoryFiltered.slice(0, 8).map((entry) => (
                  <div key={entry.id} className="demo-flow-history-row">
                    <small className={`muted ${entry.ok ? "safe-text" : "warning-text"}`}>
                      {new Date(entry.endedAt).toLocaleTimeString("tr-TR")} •{" "}
                      {demoFlowLibrary.find((item) => item.id === entry.flowId)?.title || entry.flowId} •{" "}
                      {entry.ok ? "ok" : "fail"} • {entry.durationMs} ms
                    </small>
                    {!entry.ok ? (
                      <button
                        className="ghost tiny"
                        onClick={() => runDemoFlow(entry.flowId)}
                        disabled={demoFlowRunning || demoAutopilotRunning}
                      >
                        Tekrar calistir
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
            {demoFlowStatus ? <small className="muted">{demoFlowStatus}</small> : null}
            {demoRepairSummary ? <small className="muted">{demoRepairSummary}</small> : null}
            {demoAutopilotSummary.total ? (
              <div className="demo-autopilot-panel">
                <div className="demo-autopilot-progress">
                  <span style={{ width: `${demoAutopilotSummary.progressPct}%` }} />
                </div>
                <div className="info-badges">
                  <span className="badge">Adim: {demoAutopilotSummary.done}/{demoAutopilotSummary.total}</span>
                  <span className={`badge ${demoAutopilotSummary.failed ? "" : "safe"}`}>
                    Hata: {demoAutopilotSummary.failed}
                  </span>
                  <span className="badge">Calisan: {demoAutopilotSummary.runningLabel || "-"}</span>
                  <span className="badge">Ortalama sure: {demoAutopilotSummary.avgDurationMs} ms</span>
                  <span className="badge">Toplam sure: {demoAutopilotSummary.totalDurationMs} ms</span>
                </div>
                <div className="demo-smoke-history">
                  {demoAutopilotSteps.map((step) => (
                    <div key={`auto-step-${step.key}`} className="demo-step-chip">
                      <span className={`badge ${step.status === "ok" ? "safe" : ""}`}>
                        {step.label}: {step.status === "pending" ? "bekliyor" : step.status}
                        {step.attempt > 0 ? ` (${step.attempt})` : ""}
                        {Number(step.durationMs) > 0 ? ` • ${Number(step.durationMs)} ms` : ""}
                      </span>
                      {step.status === "failed" ? (
                        <button
                          className="ghost tiny"
                          onClick={() => runDemoAutopilotStep(step.key)}
                          disabled={demoAutopilotRunning}
                        >
                          Tekrar dene
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className="demo-log-panel">
                  <div className="demo-log-header">
                    <strong>Autopilot loglari</strong>
                    <button className="ghost tiny" onClick={() => setDemoAutopilotLogs([])} disabled={demoAutopilotRunning}>
                      Temizle
                    </button>
                  </div>
                  <div className="demo-log-list">
                    {demoAutopilotLogs.length ? (
                      demoAutopilotLogs.map((entry) => (
                        <small key={entry.id} className={`muted demo-log-line ${entry.level}`}>
                          {new Date(entry.at).toLocaleTimeString("tr-TR")} • {entry.text}
                        </small>
                      ))
                    ) : (
                      <small className="muted">Henüz log yok.</small>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="demo-status-grid">
              {demoStatusCards.map((item) => (
                <article key={`demo-status-${item.key}`} className={`demo-status-card ${item.status}`}>
                  <h3>{item.title}</h3>
                  <p>{item.detail}</p>
                  <span className="badge">{item.status}</span>
                  <div className="demo-actions">
                    <button
                      className="ghost"
                      onClick={() => {
                        if (item.key === "market") {
                          setBottomTab("market");
                          setCommerceMiniTab("market");
                          setDemoDockTab("market");
                          setTimeout(() => document.getElementById("demo-market")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
                          return;
                        }
                        if (item.key === "economy" || item.key === "land") {
                          setBottomTab("land");
                          setCommerceMiniTab(item.key === "land" ? "land" : commerceMiniTab);
                          setDemoDockTab(item.key === "land" ? "land" : "economy");
                          setTimeout(() => {
                            const target = item.key === "land" ? "demo-land" : "demo-economy";
                            document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
                          }, 80);
                          return;
                        }
                        setBottomTab("demos");
                        handleDemoDockTab(item.key);
                      }}
                    >
                      Modulu ac
                    </button>
                    {item.key === "market" ? (
                      <>
                        <button className="ghost" onClick={seedTradeDemoData}>
                          Demo veri yukle
                        </button>
                        <button className="ghost" onClick={resetTradeDemoData}>
                          Demo temizle
                        </button>
                      </>
                    ) : null}
                    {item.key === "land" ? (
                      <>
                        <button className="ghost" onClick={seedLandDemoListings}>
                          Arazi seed
                        </button>
                        <button className="ghost" onClick={resetLandDemoListings}>
                          Seed temizle
                        </button>
                      </>
                    ) : null}
                    {item.key === "weather" ? (
                      <button className="ghost" onClick={runWeatherDemoSetup}>
                        Senaryo kur
                      </button>
                    ) : null}
                    {item.key === "soil" ? (
                      <button className="ghost" onClick={runSoilDemoSetup}>
                        Koordinat kur
                      </button>
                    ) : null}
                    {item.key === "economy" ? (
                      <button className="ghost" onClick={runFinanceDemoSetup}>
                        Finansal kur
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
            <div className="demo-actions">
              <button className="ghost" onClick={runDemoSmokeTest}>Tum demolar smoke test</button>
            </div>
            {demoOpsStatus ? <small className="muted">{demoOpsStatus}</small> : null}
            {demoSmokeHistory.length ? (
              <div className="demo-smoke-history">
                {demoSmokeHistory.map((entry) => (
                  <span key={entry.id} className={`badge ${entry.ok ? "safe" : ""}`}>
                    {new Date(entry.at).toLocaleTimeString("tr-TR")} • {entry.passCount}/{entry.total || "-"}
                    {!entry.ok && entry.failed.length ? ` • ${entry.failed.slice(0, 2).join(", ")}` : ""}
                  </span>
                ))}
              </div>
            ) : null}
            {demoSmokeResult?.items?.length ? (
              <div className="info-badges">
                {demoSmokeResult.items.map((item) => (
                  <span key={`smoke-${item.id}`} className={`badge ${item.ok ? "safe" : ""}`}>
                    {item.label}: {item.ok ? "ok" : `hata(${item.status || "-"})`}
                  </span>
                ))}
              </div>
            ) : null}
          </section>
          )}
