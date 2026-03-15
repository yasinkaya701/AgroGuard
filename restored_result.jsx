                <>
                <div className="model-tabs">
                  <button
                    type="button"
                    className={`ghost ${modelDetailTab === "summary" ? "active" : ""}`}
                    onClick={() => setModelDetailTab("summary")}
                  >
                    Ozet
                  </button>
                  <button
                    type="button"
                    className={`ghost ${modelDetailTab === "risk" ? "active" : ""}`}
                    onClick={() => setModelDetailTab("risk")}
                  >
                    Risk
                  </button>
                  <button
                    type="button"
                    className={`ghost ${modelDetailTab === "tech" ? "active" : ""}`}
                    onClick={() => setModelDetailTab("tech")}
                  >
                    Teknik
                  </button>
                </div>
                <div className="model-panel">
                  {modelDetailTab === "summary" && (
                    <div className="model-health-strip">
                      <div className="model-health-card">
                        <span>Kaynagi</span>
                        <strong>{result.model?.source || "-"}</strong>
                        <small className="muted">
                          {result.model?.ensembleSize ? `Cift model x${result.model.ensembleSize}` : "Tek model"}
                        </small>
                      </div>
                      <div className="model-health-card">
                        <span>Guven</span>
                        <strong>%{Math.round(Number(result.diagnosis?.confidence || 0) * 100)}</strong>
                        <small className="muted">{result.diagnosis?.confidenceTier || "-"}</small>
                      </div>
                      <div className="model-health-card">
                        <span>Risk</span>
                        <strong>{result.modelMetrics?.uncertaintyScore ?? "-"} / 100</strong>
                        <small className="muted">
                          {result.modelMetrics?.uncertaintyHigh ? "Yuksek" : "Kontrol altinda"}
                        </small>
                      </div>
                    </div>
                  )}
                  {modelDetailTab === "risk" && (
                    <div className="result-section">
                      <div className="model-insight">
                        <div>
                          <strong>Karar gucu</strong>
                          <p>
                            Top1 {Math.round((result.modelMetrics?.top1 || 0) * 100)}% • Top2{" "}
                            {Math.round((result.modelMetrics?.top2 || 0) * 100)}% • Fark{" "}
                            {Math.round((result.modelMetrics?.margin || 0) * 100)}%
                          </p>
                        </div>
                        <span className={result.modelMetrics?.lowConfidence ? "risk" : "ok"}>
                          {result.modelMetrics?.lowConfidence ? "Kararsiz" : "Net"}
                        </span>
                      </div>
                      {result.reliability ? (
                        <div className="model-insight">
                          <div>
                            <strong>Guvenilirlik</strong>
                            <p>Skor {result.reliability.score}/100 • {result.reliability.level || "-"}</p>
                          </div>
                          <span className={result.reliability.unstable ? "warn" : "ok"}>
                            {result.reliability.unstable ? "Tekrar cekim" : "Stabil"}
                          </span>
                        </div>
                      ) : null}
                      {result.plantCheck ? (
                        <div className="model-insight">
                          <div>
                            <strong>Bitki dogrulama</strong>
                            <p>{result.plantCheck.reason}</p>
                          </div>
                          <span>{result.plantCheck.label}</span>
                        </div>
                      ) : null}
                    </div>
                  )}
                  {modelDetailTab === "tech" && (
                    <div className="result-section">
                      <div className="quality-grid">
                        <div>
                          <span>Kaynak</span>
                          <strong>{result.model?.source || "demo"}</strong>
                        </div>
                        <div>
                          <span>Girdi boyutu</span>
                          <strong>{result.model?.inputSize || "-"}</strong>
                        </div>
                        <div>
                          <span>Sinif</span>
                          <strong>{result.model?.labels || "-"}</strong>
                        </div>
                        <div>
                          <span>Kalite</span>
                          <strong>{result.quality ? Math.round(result.quality.score * 100) : "-"}%</strong>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                </>
                )}
                {showCarePlan && (
                  <details className="accordion compact">
                    <summary>Uygulama plani</summary>
                    <div className="result-section">
                      <strong className="result-subtitle">Bakim adimlari</strong>
                      <ul>
                        {result.carePlan?.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    {result.treatments && (
                      <div className="result-section">
                        <strong className="result-subtitle">Ilac ve cozumler</strong>
                        <small className="muted warning-text">
                          Not: Ilac secimi, doz ve tekrar araligi icin ruhsat etiketi + ziraat muhendisi onayi gerekir.
                        </small>
                        {result.treatments.organic?.length ? (
                          <>
                            <strong className="result-subtitle muted">Organik</strong>
                            <ul>
                              {result.treatments.organic.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </>
                        ) : null}
                        {result.treatments.chemical?.length ? (
                          <>
                            <strong className="result-subtitle muted">Kimyasal</strong>
                            <ul>
                              {result.treatments.chemical.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </>
                        ) : null}
                      </div>
                    )}
                  </details>
                )}
                <details className="accordion compact">
                  <summary>Uygulama plani</summary>
                  {actionPlan ? (
                    <div className="plan-grid">
                      <div>
                        <strong>Bugun</strong>
                        <ul>
                          {actionPlan.today.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <strong>Bu hafta</strong>
                        <ul>
                          {actionPlan.week.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <strong>Takip</strong>
                        <ul>
                          {actionPlan.monitor.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : (
                    <p className="muted">Plan olusmadı. Once analiz tamamlanmali.</p>
                  )}
                </details>
                {(result.topPredictionsDetailed || result.topPredictions)?.length ? (
                  <details className="accordion compact">
                    <summary>Top 3 tahmin</summary>
                    {result.filter?.applied && (
                      <p className="muted">
                        {result.filter.matched
                          ? "Bitki filtresi uygulandi."
                          : "Bitki filtresi uygulandi, eslesme bulunamadi."}
                      </p>
                    )}
                    <div className="top3-grid">
                      {(result.topPredictionsDetailed || result.topPredictions).map((item) => (
                        <div key={item.label} className="top3-card">
                          <div className="top3-head">
                            <Leaf size={14} />
                            <strong>{item.pretty || item.label.replace(/_/g, " ")}</strong>
                          </div>
                          {item.plant && (
                            <small className="muted">
                              Bitki: {plantNameMap.get(item.plant) || item.plant}
                            </small>
                          )}
                          <div className="top3-bar">
                            <span style={{ width: `${Math.round(item.confidence * 100)}%` }} />
                          </div>
                          <small>{Math.round(item.confidence * 100)}% guven</small>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : result.filter?.applied ? (
                  <details className="accordion compact">
                    <summary>Top 3 tahmin</summary>
                    <p className="muted">
                      Bitki filtresi nedeniyle tahmin listesi gosterilemiyor. Fotografu
                      yenileyin.
                    </p>
                  </details>
                ) : null}
                <div className="quick-actions">
                  <button className="ghost" onClick={() => setShowQuickModal("plan")}>
                    Bakim planini kaydet
                  </button>
                  <button className="ghost" onClick={() => setShowQuickModal("treatment")}>
                    Ilac listesini goruntule
                  </button>
                  <button className="primary" onClick={() => setShowQuickModal("alert")}>
                    Acil aksiyon al
                  </button>
                </div>
                <div className="mini-stats">
                  <div>
                    <strong>{history.length}</strong>
                    <span>Son analiz</span>
                  </div>
                  <div>
                    <strong>
                      {history.length
                        ? `${Math.round(
                            history.reduce((acc, item) => acc + (item.confidence || 0), 0) /
                              history.length *
                              100
                          )}%`
                        : "—"}
                    </strong>
                    <span>Ortalama guven</span>
                  </div>
                  <div>
                    <strong>{result.diagnosis.status === "healthy" ? "Saglikli" : "Risk"}</strong>
                    <span>Durum</span>
                  </div>
                </div>
                <div className="result-note">{result.notes}</div>
              </div>
            )}
            {activeTab === "diagnosis" && selectedPlant && (
              <div className="plant-card">
