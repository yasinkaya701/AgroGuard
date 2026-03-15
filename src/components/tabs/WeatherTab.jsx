import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  CloudRain, Wind, Thermometer, MapPin, RefreshCw,
  Bell, Droplets, Leaf, Activity, Map as MapIcon, Calendar,
  CheckCircle2, AlertTriangle, Gauge,
  CloudSun, Sun, Snowflake, CloudLightning, Waves,
  Target, Wifi, Radar, Bug, LineChart,
  BarChart2, TrendingUp, Layers, ThermometerSun, AlertOctagon,
  DownloadCloud, Maximize2, Droplet,
  Search, ChevronDown, Cpu
} from 'lucide-react';
import { TURKEY_CITIES_81 } from '../../data/trLocationData';
import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

/* ─────── Icon Wrapper (Premium circular icon treatment) ─────── */
const IconBox = ({ icon: Icon, size = 18, color = "var(--sprout)", bg, glow, style }) => (
  <div style={{
    width: size * 2.2, height: size * 2.2,
    borderRadius: '12px',
    background: bg || `rgba(143,188,69,0.12)`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: glow ? `0 0 16px ${glow}` : 'none',
    flexShrink: 0,
    ...style
  }}>
    <Icon size={size} color={color} strokeWidth={1.8} />
  </div>
);

/* ─────── Weather Condition Icon Mapper ─────── */
const conditionIcon = (text) => {
  const t = (text || "").toLowerCase();
  if (t.includes("yağmur") || t.includes("rain")) return { icon: CloudRain, color: "var(--sky)" };
  if (t.includes("kar") || t.includes("snow")) return { icon: Snowflake, color: "#B8D0E8" };
  if (t.includes("gök gürültü") || t.includes("fırtına")) return { icon: CloudLightning, color: "#E07070" };
  if (t.includes("güneş") || t.includes("açık")) return { icon: Sun, color: "var(--wheat)" };
  if (t.includes("bulut") || t.includes("cloud")) return { icon: CloudSun, color: "rgba(245,237,216,0.6)" };
  return { icon: CloudSun, color: "rgba(245,237,216,0.5)" };
};

const IRRIGATION_CROP_OPTIONS = [
  { key: 'domates', label: 'Domates', defaultPlantingMonthDay: '04-15' },
  { key: 'misir', label: 'Misir', defaultPlantingMonthDay: '05-01' },
  { key: 'aycicegi', label: 'Aycicegi', defaultPlantingMonthDay: '05-01' },
  { key: 'bag_uzum', label: 'Bag / Uzum', defaultPlantingMonthDay: '04-01' },
  { key: 'bugday_kislik', label: 'Bugday (kislik)', defaultPlantingMonthDay: '11-01' }
];

const IRRIGATION_METHOD_OPTIONS = [
  { key: 'damla', label: 'Damla', efficiency: 0.9 },
  { key: 'yagmurlama', label: 'Yagmurlama', efficiency: 0.75 },
  { key: 'salma', label: 'Salma', efficiency: 0.6 }
];

const IRRIGATION_WATER_SOURCE_OPTIONS = [
  { key: 'baraj_kanal', label: 'Baraj / kanal' },
  { key: 'kuyu', label: 'Kuyu / pompaj' },
  { key: 'karma', label: 'Karma kaynak' }
];

const mapPlantToIrrigationCrop = (plantId = '') => {
  const key = String(plantId || '').trim().toLowerCase();
  if (key === 'tomato') return 'domates';
  if (key === 'corn' || key === 'maize') return 'misir';
  if (key === 'grape') return 'bag_uzum';
  if (key === 'wheat') return 'bugday_kislik';
  return IRRIGATION_CROP_OPTIONS.some((item) => item.key === key) ? key : 'domates';
};

const getDefaultIrrigationPlantingDate = (cropKey, now = new Date()) => {
  const crop = IRRIGATION_CROP_OPTIONS.find((item) => item.key === cropKey) || IRRIGATION_CROP_OPTIONS[0];
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const baseYear = crop.key === 'bugday_kislik' && month <= 6 ? year - 1 : year;
  return `${baseYear}-${crop.defaultPlantingMonthDay}`;
};

export default function WeatherTab({
  weather,
  weatherError,
  weatherLocationLabel,
  weatherFreshnessText,
  frostSignal,
  agroClimateAdvisor,
  fieldLocation,
  setFieldLocation,
  useMyLocation,
  geoStatus,
  SOIL_MAP_PICKER,
  soilPickerMarker,
  selectSoilMapPoint,
  coordsValid,
  cityQuery,
  setCityQuery,
  applyCityQuery,
  landDemo,
  setLandDemo,
  locationSearch,
  setLocationSearch,
  locationSearchMatches,
  applyLocationSearchHit,
  locationCitySuggestions,
  weatherDistrictSuggestions,
  weatherNeighborhoodSuggestions,
  normalizeKey,
  city,
  setCity,
  forecast,
  forecastError,
  nextHours,
  soilReport,
  soilLoading,
  soilError,
  soilMapContext,
  selectedPlant,
  soilFit,
  soilDiagnostics,
  setWeatherRefreshKey,
  isNativeApp,
  notifPermission,
  notifSettings,
  setNotifSettings,
  syncNotifications,
  upsertCalendarItems,
  mergeNotifications,
  notifStatus,
  weatherSummary,
  weatherAlerts,
  hourlyAlerts,
  soilInsights,
  soilSmartSuggestions,
  soilManagementPlan,
  soilIndexCards,
  soilSuitability,
  soilQuestion,
  setSoilQuestion,
  soilAnswer,
  buildSoilAnswer,
  apiBaseForAssets,
  hackhatonDashboard,
  hackhatonDashboardError,
  hackhatonModelSuite,
  hackhatonModelSuiteError
}) {
  const allAlerts = [...(weatherAlerts || []), ...(hourlyAlerts || [])];
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
  const [citySearchText, setCitySearchText] = useState('');
  const filteredCities = useMemo(() => {
    if (!citySearchText.trim()) return TURKEY_CITIES_81;
    const q = citySearchText.toLowerCase();
    return TURKEY_CITIES_81.filter(c => c.toLowerCase().includes(q));
  }, [citySearchText]);
  const selectedDistrict = String(landDemo?.district || '').trim();
  const selectedNeighborhood = String(landDemo?.neighborhood || '').trim();
  const resolvedGeoSource = String(soilReport?.geoSource || weather?.geoSource || '').trim() || 'bilinmiyor';
  const resolvedScopeLevel = String(soilReport?.scopeLevel || weather?.scopeLevel || '').trim() || 'city';
  const resolvedCoords = useMemo(() => {
    const raw = String(fieldLocation?.coords || soilReport?.coords || weather?.coords || '').trim();
    if (!raw) return null;
    const parts = raw.split(',').map((item) => Number(item.trim()));
    if (parts.length !== 2 || parts.some((item) => Number.isNaN(item))) return null;
    return { lat: parts[0], lon: parts[1], raw };
  }, [fieldLocation?.coords, soilReport?.coords, weather?.coords]);
  const soilMapCenter = useMemo(
    () =>
      resolvedCoords
        ? [resolvedCoords.lat, resolvedCoords.lon]
        : [SOIL_MAP_PICKER.centerLat, SOIL_MAP_PICKER.centerLon],
    [SOIL_MAP_PICKER.centerLat, SOIL_MAP_PICKER.centerLon, resolvedCoords]
  );
  const weatherScopeTarget = useMemo(
    () =>
      [landDemo?.neighborhood, landDemo?.district, city]
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .join(', ') || city || 'Malatya',
    [city, landDemo?.district, landDemo?.neighborhood]
  );
  const weatherSource = String(weather?.source || '').trim();
  const forecastSource = String(forecast?.source || '').trim();
  const soilSource = String(soilReport?.source || '').trim();
  const weatherLive = Boolean(weather) && weatherSource && !/demo|unavailable/i.test(weatherSource);
  const forecastLive = Boolean(forecast) && forecastSource && !/demo|unavailable/i.test(forecastSource);
  const soilLive = Boolean(soilReport) && soilSource && !/demo|unavailable/i.test(soilSource);
  const liveDataChips = [
    { label: 'Hava', value: weatherLive ? weatherSource : 'canlı yok', tone: weatherLive ? 'var(--sprout)' : '#E07070' },
    { label: 'Tahmin', value: forecastLive ? forecastSource : 'canlı yok', tone: forecastLive ? 'var(--sky)' : '#E07070' },
    { label: 'Toprak', value: soilLive ? soilSource : 'canlı yok', tone: soilLive ? 'var(--wheat)' : '#E07070' }
  ];
  const coreDataWarnings = [weatherError, forecastError, soilError]
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  const suiteSummary = hackhatonModelSuite?.summary || {};
  const suiteModelCards = Array.isArray(hackhatonModelSuite?.selectedModels) ? hackhatonModelSuite.selectedModels : [];
  const suiteReportCards = Array.isArray(hackhatonModelSuite?.reportCards) ? hackhatonModelSuite.reportCards : [];
  const suiteHealthCards = Array.isArray(hackhatonModelSuite?.healthModels) ? hackhatonModelSuite.healthModels : [];
  const dashboardVisuals = Array.isArray(hackhatonDashboard?.visuals) ? hackhatonDashboard.visuals : [];
  const dashboardDocuments = Array.isArray(hackhatonDashboard?.documents) ? hackhatonDashboard.documents : [];
  const dashboardPresentation = hackhatonDashboard?.presentation || null;
  const dashboardSlides = Array.isArray(dashboardPresentation?.slides) ? dashboardPresentation.slides : [];
  const dashboardGemGallery = Array.isArray(hackhatonDashboard?.gemGallery) ? hackhatonDashboard.gemGallery : [];
  const dashboardDatasetHighlights = Array.isArray(hackhatonDashboard?.datasetHighlights) ? hackhatonDashboard.datasetHighlights : [];
  const dashboardLongTerm = hackhatonDashboard?.longTermClimate || null;
  const dashboardHybrid = hackhatonDashboard?.hybridClimate || null;
  const dashboardHybridTemp = dashboardHybrid?.temp || null;
  const dashboardHybridPrecip = dashboardHybrid?.precip || null;
  const dashboardHybridHighlights = Array.isArray(dashboardHybrid?.highlights) ? dashboardHybrid.highlights : [];
  const dashboardHybridTrends = dashboardHybrid?.trends || null;
  const dashboardHybridLast10 = dashboardHybrid?.last10 || null;
  const dashboardLongTermYears = useMemo(
    () => (Array.isArray(dashboardLongTerm?.years) ? dashboardLongTerm.years : []),
    [dashboardLongTerm?.years]
  );
  const dashboardLongTermSeries = dashboardLongTerm?.series || {};
  const dashboardLongTermForecast = dashboardLongTerm?.forecast || {};
  const dashboardLongTermHighlights = Array.isArray(dashboardLongTerm?.highlights) ? dashboardLongTerm.highlights : [];
  const isSolarLongTerm = dashboardLongTerm?.kind === 'sunshine_proxy_1911_2025';
  const longTermTitle = isSolarLongTerm ? '115 yıllık guneslenme + radyasyon panosu' : '115 yıllık iklim + ET0 panosu';
  const longTermSubtitle = isSolarLongTerm
    ? `${dashboardLongTerm?.periodStart || ''}-${dashboardLongTerm?.periodEnd || ''} guneslenme proxy serisi + lineer tahmin`
    : `${dashboardLongTerm?.periodStart || ''}-${dashboardLongTerm?.periodEnd || ''} arasi gercek seri + lineer tahmin`;
  const dashboardPlaybooks = Array.isArray(hackhatonDashboard?.playbooks) ? hackhatonDashboard.playbooks : [];
  const dashboardDroughtIntel = hackhatonDashboard?.droughtIntel || null;
  const dashboardDroughtCards = Array.isArray(dashboardDroughtIntel?.cards) ? dashboardDroughtIntel.cards : [];
  const dashboardDroughtDocuments = Array.isArray(dashboardDroughtIntel?.documents) ? dashboardDroughtIntel.documents : [];
  const dashboardDroughtVisuals = Array.isArray(dashboardDroughtIntel?.visuals) ? dashboardDroughtIntel.visuals : [];
  const dashboardDroughtAlerts = Array.isArray(dashboardDroughtIntel?.alertCalendar) ? dashboardDroughtIntel.alertCalendar : [];
  const dashboardDroughtRiskYears = Array.isArray(dashboardDroughtIntel?.riskYears) ? dashboardDroughtIntel.riskYears : [];
  const dashboardDroughtIndicatorNotes = Array.isArray(dashboardDroughtIntel?.indicatorNotes) ? dashboardDroughtIntel.indicatorNotes : [];
  const dashboardWaterDecision = hackhatonDashboard?.waterDecision || null;
  const dashboardWaterCards = Array.isArray(dashboardWaterDecision?.cards) ? dashboardWaterDecision.cards : [];
  const dashboardWaterDashboards = Array.isArray(dashboardWaterDecision?.dashboards) ? dashboardWaterDecision.dashboards : [];
  const dashboardWaterDocuments = Array.isArray(dashboardWaterDecision?.documents) ? dashboardWaterDecision.documents : [];
  const dashboardWaterVisuals = Array.isArray(dashboardWaterDecision?.visuals) ? dashboardWaterDecision.visuals : [];
  const dashboardWaterScenarioWeights = Array.isArray(dashboardWaterDecision?.scenarioWeights) ? dashboardWaterDecision.scenarioWeights : [];
  const dashboardWaterCriticalSeries = Array.isArray(dashboardWaterDecision?.criticalSeries) ? dashboardWaterDecision.criticalSeries : [];
  const dashboardWaterAlertSeries = Array.isArray(dashboardWaterDecision?.alertSeries) ? dashboardWaterDecision.alertSeries : [];
  const dashboardWaterStrategyPulse = dashboardWaterDecision?.strategyPulse || null;
  const dashboardWaterHistorySummary = dashboardWaterDecision?.historySummary || null;
  const dashboardWaterHistoryTimeline = Array.isArray(dashboardWaterDecision?.historyTimeline) ? dashboardWaterDecision.historyTimeline : [];
  const dashboardWaterOutlookTimeline = Array.isArray(dashboardWaterDecision?.outlookTimeline) ? dashboardWaterDecision.outlookTimeline : [];
  const dashboardWaterScenarioMatrix = Array.isArray(dashboardWaterDecision?.scenarioMatrix) ? dashboardWaterDecision.scenarioMatrix : [];
  const dashboardWaterAlertsFeed = Array.isArray(dashboardWaterDecision?.alertsFeed) ? dashboardWaterDecision.alertsFeed : [];
  const dashboardWaterDropEvents = Array.isArray(dashboardWaterDecision?.dropEvents) ? dashboardWaterDecision.dropEvents : [];
  const dashboardWaterStrategyBoard = Array.isArray(dashboardWaterDecision?.strategyBoard) ? dashboardWaterDecision.strategyBoard : [];
  const dashboardWaterWatchlist = Array.isArray(dashboardWaterDecision?.watchlist) ? dashboardWaterDecision.watchlist : [];
  const dashboardNarratives = Array.isArray(hackhatonDashboard?.narratives) ? hackhatonDashboard.narratives : [];
  const [hackhatonPanel, setHackhatonPanel] = useState('overview');
  const [weatherWorkspaceTab, setWeatherWorkspaceTab] = useState('command');
  const [dashboardExpand, setDashboardExpand] = useState({
    slides: false,
    gallery: false,
    playbooks: false,
    droughtVisuals: false,
    droughtYears: false,
    waterVisuals: false,
    waterCriticalSeries: false,
    waterAlertSeries: false,
    waterScenarioMatrix: false,
    waterAlertsFeed: false,
    waterDropEvents: false
  });
  const defaultIrrigationCrop = useMemo(
    () => mapPlantToIrrigationCrop(selectedPlant?.id || ''),
    [selectedPlant?.id]
  );
  const [irrigationForm, setIrrigationForm] = useState(() => ({
    crop: 'domates',
    plantingDate: getDefaultIrrigationPlantingDate('domates'),
    areaHa: '1',
    method: 'damla',
    waterSource: 'baraj_kanal',
    efficiency: '0.90'
  }));
  const [irrigationRequest, setIrrigationRequest] = useState(null);
  const [irrigationCalendar, setIrrigationCalendar] = useState(null);
  const [irrigationLoading, setIrrigationLoading] = useState(false);
  const [irrigationError, setIrrigationError] = useState('');
  const [irrigationOpsStatus, setIrrigationOpsStatus] = useState('');
  const [anomalyVariable, setAnomalyVariable] = useState('all');
  const [anomalyDate, setAnomalyDate] = useState('');
  const [anomalyIntel, setAnomalyIntel] = useState(null);
  const [anomalyLoading, setAnomalyLoading] = useState(false);
  const [anomalyError, setAnomalyError] = useState('');
  const assetBase = String(apiBaseForAssets || '').replace(/\/$/, '');
  const resolveHackhatonAssetUrl = (asset) => {
    const rawUrl = String(asset?.url || asset?.asset?.url || '').trim();
    if (!rawUrl) return '';
    if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
    return `${assetBase}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
  };
  const toggleDashboardExpand = (key) => {
    setDashboardExpand((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const getExpandedItems = (items, key, limit = 4) => {
    const list = Array.isArray(items) ? items : [];
    return dashboardExpand[key] ? list : list.slice(0, limit);
  };
  const shouldShowExpand = (items, limit = 4) => Array.isArray(items) && items.length > limit;
  const getWaterRiskTone = (riskLevel) => {
    const key = String(riskLevel || '').toLowerCase();
    if (key === 'high') return { color: '#E07070', background: 'rgba(224,112,112,0.12)', border: 'rgba(224,112,112,0.18)' };
    if (key === 'medium') return { color: 'var(--wheat)', background: 'rgba(212,168,67,0.12)', border: 'rgba(212,168,67,0.18)' };
    return { color: 'var(--sprout)', background: 'rgba(143,188,69,0.12)', border: 'rgba(143,188,69,0.18)' };
  };
  const getQueueTone = (priority) => {
    const key = String(priority || '').toLowerCase();
    if (key === 'high') return { color: '#f5a0a0', background: 'rgba(224,112,112,0.08)', border: 'rgba(224,112,112,0.2)' };
    if (key === 'medium') return { color: 'var(--wheat)', background: 'rgba(212,168,67,0.08)', border: 'rgba(212,168,67,0.2)' };
    if (key === 'planning') return { color: 'var(--sky)', background: 'rgba(88,143,180,0.08)', border: 'rgba(88,143,180,0.2)' };
    return { color: 'var(--sprout)', background: 'rgba(143,188,69,0.08)', border: 'rgba(143,188,69,0.2)' };
  };
  const dashboardSectionTabs = useMemo(
    () =>
      [
        dashboardVisuals.length || dashboardDocuments.length || dashboardNarratives.length || dashboardDatasetHighlights.length
          ? { id: 'overview', label: 'Genel bakis', count: dashboardDocuments.length + dashboardNarratives.length + dashboardDatasetHighlights.length }
          : null,
        dashboardPresentation || dashboardGemGallery.length
          ? { id: 'presentation', label: 'ET0 + grafik', count: (dashboardSlides.length || 0) + dashboardGemGallery.length }
          : null,
        dashboardPlaybooks.length ? { id: 'playbooks', label: 'Playbook', count: dashboardPlaybooks.length } : null,
        dashboardDroughtIntel ? { id: 'drought', label: 'Kuraklik', count: dashboardDroughtCards.length + dashboardDroughtDocuments.length } : null,
        dashboardWaterDecision ? { id: 'water', label: 'Su karari', count: dashboardWaterCards.length + dashboardWaterDocuments.length } : null
      ].filter(Boolean),
    [
      dashboardDatasetHighlights.length,
      dashboardDocuments.length,
      dashboardDroughtCards.length,
      dashboardDroughtDocuments.length,
      dashboardDroughtIntel,
      dashboardGemGallery.length,
      dashboardNarratives.length,
      dashboardPlaybooks.length,
      dashboardPresentation,
      dashboardSlides.length,
      dashboardVisuals.length,
      dashboardWaterCards.length,
      dashboardWaterDecision,
      dashboardWaterDocuments.length
    ]
  );
  const dashboardOverviewStats = [
    { id: 'doc', label: 'Rapor', value: dashboardDocuments.length + dashboardNarratives.length, tone: 'rgba(143,188,69,0.18)' },
    { id: 'presentation', label: 'Slayt + grafik', value: dashboardSlides.length + dashboardGemGallery.length, tone: 'rgba(88,143,180,0.18)' },
    { id: 'playbook', label: 'Rehber', value: dashboardPlaybooks.length, tone: 'rgba(212,168,67,0.18)' },
    {
      id: 'decision',
      label: 'Karar destek',
      value: dashboardWaterDashboards.length + dashboardWaterDocuments.length + dashboardDroughtDocuments.length,
      tone: 'rgba(224,112,112,0.18)'
    }
  ].filter((item) => item.value > 0);
  const irrigationSummary = irrigationCalendar?.summary || null;
  const irrigationRows = Array.isArray(irrigationCalendar?.calendar) ? irrigationCalendar.calendar : [];
  const irrigationWeekly = Array.isArray(irrigationCalendar?.weekly) ? irrigationCalendar.weekly : [];
  const irrigationReference = irrigationCalendar?.referenceCampaign || null;
  const irrigationSlides = Array.isArray(irrigationReference?.slides) ? irrigationReference.slides : [];
  const irrigationScenarios = Array.isArray(irrigationReference?.scenarios) ? irrigationReference.scenarios : [];
  const irrigationAnomaly = irrigationCalendar?.anomaly || null;
  const irrigationActionPlan = irrigationCalendar?.actionPlan || null;
  const irrigationStageBoard = Array.isArray(irrigationCalendar?.stageBoard) ? irrigationCalendar.stageBoard : [];
  const irrigationTaskBoard = Array.isArray(irrigationCalendar?.taskBoard) ? irrigationCalendar.taskBoard : [];
  const irrigationPlantingShiftBoard = Array.isArray(irrigationCalendar?.plantingShiftBoard) ? irrigationCalendar.plantingShiftBoard : [];
  const irrigationDepletionTrace = Array.isArray(irrigationCalendar?.depletionTrace) ? irrigationCalendar.depletionTrace : [];
  const evapotranspirationProfile = irrigationCalendar?.evapotranspirationProfile || null;
  const evapotranspirationDaily = Array.isArray(evapotranspirationProfile?.daily) ? evapotranspirationProfile.daily : [];
  const evapotranspirationExplainers = Array.isArray(evapotranspirationProfile?.explainers) ? evapotranspirationProfile.explainers : [];
  const hourlyEvapoCommand = irrigationCalendar?.hourlyEvapoCommand || null;
  const et0ResearchPack = irrigationCalendar?.et0ResearchPack || null;
  const et0SeasonalProfile = Array.isArray(et0ResearchPack?.seasonalProfile) ? et0ResearchPack.seasonalProfile : [];
  const et0ScenarioComparison = Array.isArray(et0ResearchPack?.scenarioComparison) ? et0ResearchPack.scenarioComparison : [];
  const et0TrendSnapshot = Array.isArray(et0ResearchPack?.trendSnapshot) ? et0ResearchPack.trendSnapshot : [];
  const et0DecisionHooks = Array.isArray(et0ResearchPack?.decisionHooks) ? et0ResearchPack.decisionHooks : [];
  const et0ReservoirBridge = et0ResearchPack?.reservoirBridge || null;
  const et0ReservoirCards = Array.isArray(et0ReservoirBridge?.triggerCards) ? et0ReservoirBridge.triggerCards : [];
  const irrigationPriorityBoard = useMemo(
    () => (Array.isArray(irrigationCalendar?.priorityBoard) ? irrigationCalendar.priorityBoard : []),
    [irrigationCalendar?.priorityBoard]
  );
  const irrigationAlertBundle = irrigationCalendar?.alertBundle || null;
  const irrigationAlertCards = Array.isArray(irrigationAlertBundle?.cards) ? irrigationAlertBundle.cards : [];
  const irrigationTaskDrafts = useMemo(
    () => (Array.isArray(irrigationCalendar?.taskDrafts) ? irrigationCalendar.taskDrafts : []),
    [irrigationCalendar?.taskDrafts]
  );
  const irrigationCalendarDrafts = useMemo(() => {
    const now = new Date();
    const toDateText = (offsetDays = 0, fallback = '') => {
      if (fallback) return String(fallback).slice(0, 10);
      const d = new Date(now.getTime());
      d.setDate(d.getDate() + offsetDays);
      return d.toISOString().slice(0, 10);
    };
    const laneOffset = { bugün: 0, "24s": 1, "72s": 3, hafta: 7 };
    return irrigationTaskDrafts.map((task, index) => ({
      id: `irrigation-draft-${task.id || index}`,
      tag: `irrigation-draft-${task.id || index}`,
      title: task.title,
      detail: task.detail,
      date: toDateText(
        laneOffset[String(task.lane || '').trim()] ?? 1,
        task.id === 'lock-next-irrigation' ? irrigationSummary?.nextIrrigationDate : ''
      ),
      time: task.id === 'lock-next-irrigation' ? '06:00' : task.lane === 'hafta' ? '09:00' : '07:00',
      notify: true,
      done: false
    }));
  }, [irrigationTaskDrafts, irrigationSummary?.nextIrrigationDate]);
  const longTermWindow = useMemo(() => {
    if (!dashboardLongTermYears.length) return null;
    const windowSize = 24;
    const start = Math.max(0, dashboardLongTermYears.length - windowSize);
    if (isSolarLongTerm) {
      return {
        years: dashboardLongTermYears.slice(start),
        sunshineHoursDay: (dashboardLongTermSeries.sunshineHoursDay || []).slice(start),
        radiationDay: (dashboardLongTermSeries.radiationDay || []).slice(start),
        cloudPct: (dashboardLongTermSeries.cloudPct || []).slice(start),
        forecastYears: Array.isArray(dashboardLongTermForecast?.years) ? dashboardLongTermForecast.years : [],
        forecastSunshine: Array.isArray(dashboardLongTermForecast?.sunshineHoursDay) ? dashboardLongTermForecast.sunshineHoursDay : [],
        forecastRadiation: Array.isArray(dashboardLongTermForecast?.radiationDay) ? dashboardLongTermForecast.radiationDay : [],
        forecastCloud: Array.isArray(dashboardLongTermForecast?.cloudPct) ? dashboardLongTermForecast.cloudPct : []
      };
    }
    return {
      years: dashboardLongTermYears.slice(start),
      temps: (dashboardLongTermSeries.tempMeanC || []).slice(start),
      precip: (dashboardLongTermSeries.precipSumMm || []).slice(start),
      et0Mean: (dashboardLongTermSeries.et0MeanMm || []).slice(start),
      et0Sum: (dashboardLongTermSeries.et0SumMm || []).slice(start),
      forecastYears: Array.isArray(dashboardLongTermForecast?.years) ? dashboardLongTermForecast.years : [],
      forecastTemp: Array.isArray(dashboardLongTermForecast?.tempMeanC) ? dashboardLongTermForecast.tempMeanC : [],
      forecastEt0: Array.isArray(dashboardLongTermForecast?.et0MeanMm) ? dashboardLongTermForecast.et0MeanMm : [],
      forecastPrecip: Array.isArray(dashboardLongTermForecast?.precipSumMm) ? dashboardLongTermForecast.precipSumMm : []
    };
  }, [
    dashboardLongTermYears,
    dashboardLongTermSeries.tempMeanC,
    dashboardLongTermSeries.precipSumMm,
    dashboardLongTermSeries.et0MeanMm,
    dashboardLongTermSeries.et0SumMm,
    dashboardLongTermSeries.sunshineHoursDay,
    dashboardLongTermSeries.radiationDay,
    dashboardLongTermSeries.cloudPct,
    dashboardLongTermForecast?.years,
    dashboardLongTermForecast?.tempMeanC,
    dashboardLongTermForecast?.et0MeanMm,
    dashboardLongTermForecast?.precipSumMm,
    dashboardLongTermForecast?.sunshineHoursDay,
    dashboardLongTermForecast?.radiationDay,
    dashboardLongTermForecast?.cloudPct,
    isSolarLongTerm
  ]);
  const showLongTerm = Boolean(dashboardLongTerm?.available && longTermWindow);
  const showHybrid = Boolean(
    dashboardHybrid?.available &&
      ((dashboardHybridTemp?.years && dashboardHybridTemp.years.length) || (dashboardHybridPrecip?.years && dashboardHybridPrecip.years.length))
  );
  const hourlyEvapoBestWindows = Array.isArray(hourlyEvapoCommand?.bestWindows) ? hourlyEvapoCommand.bestWindows : [];
  const hourlyEvapoAvoidWindows = Array.isArray(hourlyEvapoCommand?.avoidWindows) ? hourlyEvapoCommand.avoidWindows : [];
  const hourlyEvapoTopHours = Array.isArray(hourlyEvapoCommand?.topHours) ? hourlyEvapoCommand.topHours : [];
  const irrigationAgrobotGuide = irrigationCalendar?.agrobotGuide || null;
  const irrigationWaterSource = irrigationCalendar?.waterSource || null;
  const irrigationWaterSupplyAdvisor = irrigationCalendar?.waterSupplyAdvisor || null;
  const irrigationDataQuality = irrigationCalendar?.dataQuality || null;
  const irrigationQualityLabel = irrigationDataQuality
    ? (irrigationDataQuality.forecastLive && (irrigationDataQuality.soilGridLive || irrigationDataQuality.soilSignalsLive) ? 'Canli' : 'Kisitli')
    : '-';
  const irrigationQualityDetail = irrigationDataQuality
    ? `Tahmin ${irrigationDataQuality.forecastLive ? 'canlı' : 'yok'} • Toprak ${(irrigationDataQuality.soilGridLive || irrigationDataQuality.soilSignalsLive) ? 'canlı' : 'yok'}`
    : 'Canli veri kontrol ediliyor';
  const irrigationEt0Source = irrigationDataQuality?.et0Source?.length ? irrigationDataQuality.et0Source.join(' + ') : '-';
  const irrigationSupplyZonePlan = Array.isArray(irrigationWaterSupplyAdvisor?.zonePlan) ? irrigationWaterSupplyAdvisor.zonePlan : [];
  const irrigationSupplyWeeklyAllocation = Array.isArray(irrigationWaterSupplyAdvisor?.weeklyAllocation) ? irrigationWaterSupplyAdvisor.weeklyAllocation : [];
  const irrigationSupplyEventAdjustments = Array.isArray(irrigationWaterSupplyAdvisor?.eventAdjustments) ? irrigationWaterSupplyAdvisor.eventAdjustments : [];
  const irrigationSupplyTriggers = Array.isArray(irrigationWaterSupplyAdvisor?.triggers) ? irrigationWaterSupplyAdvisor.triggers : [];
  const climateAnomalyCards = Array.isArray(anomalyIntel?.topAnomalies) ? anomalyIntel.topAnomalies : [];
  const climateAnomalyTimeline = Array.isArray(anomalyIntel?.timeline) ? anomalyIntel.timeline : [];
  const climateAnomalyCharts = Array.isArray(anomalyIntel?.charts) ? anomalyIntel.charts : [];
  const climateAnomalyVariables = Array.isArray(anomalyIntel?.variables) ? anomalyIntel.variables : [];
  const climateAnomalyLocalMatches = Array.isArray(anomalyIntel?.localMatches) ? anomalyIntel.localMatches : [];
  const climateAnomalyLiveNews = Array.isArray(anomalyIntel?.liveNews) ? anomalyIntel.liveNews : [];
  const climateAnomalyArchiveNews = Array.isArray(anomalyIntel?.archiveNews) ? anomalyIntel.archiveNews : [];
  const climateAgrobotPlaybook = anomalyIntel?.agrobotPlaybook || null;
  const climateImpactMatrix = Array.isArray(anomalyIntel?.agrobotImpactMatrix) ? anomalyIntel.agrobotImpactMatrix : [];
  const climateAnomalyEvidence = anomalyIntel?.evidenceSummary || null;
  const climateAnomalyAnalogs = Array.isArray(anomalyIntel?.analogEvents) ? anomalyIntel.analogEvents : [];
  const climateAnomalyContext = Array.isArray(anomalyIntel?.contextWindow) ? anomalyIntel.contextWindow : [];
  const climateAnomalyMonthProfile = Array.isArray(anomalyIntel?.monthProfile) ? anomalyIntel.monthProfile : [];
  const climateAnomalyRegimeSignals = Array.isArray(anomalyIntel?.regimeSignals) ? anomalyIntel.regimeSignals : [];
  const climateAnomalyCompoundEvents = Array.isArray(anomalyIntel?.compoundEvents) ? anomalyIntel.compoundEvents : [];
  const climateAnomalyCouplingMatrix = Array.isArray(anomalyIntel?.couplingMatrix) ? anomalyIntel.couplingMatrix : [];
  const climateAnomalyDecadeProfile = Array.isArray(anomalyIntel?.decadeProfile) ? anomalyIntel.decadeProfile : [];
  const climateAnomalySourceBoard = Array.isArray(anomalyIntel?.sourceBoard) ? anomalyIntel.sourceBoard : [];
  const climateAnomalyTriggerBoard = Array.isArray(anomalyIntel?.triggerBoard) ? anomalyIntel.triggerBoard : [];
  const climateAnomalyActionQueue = Array.isArray(anomalyIntel?.actionQueue) ? anomalyIntel.actionQueue : [];
  const climateAnomalyStoryline = anomalyIntel?.storyline || null;

  useEffect(() => {
    if (!dashboardSectionTabs.length) return;
    if (!dashboardSectionTabs.some((item) => item.id === hackhatonPanel)) {
      setHackhatonPanel(dashboardSectionTabs[0].id);
    }
  }, [dashboardSectionTabs, hackhatonPanel]);

  useEffect(() => {
    setIrrigationForm((prev) => {
      const nextCrop = prev.crop && prev.crop !== 'domates' ? prev.crop : defaultIrrigationCrop;
      return {
        ...prev,
        crop: nextCrop,
        plantingDate:
          prev.plantingDate && prev.plantingDate !== getDefaultIrrigationPlantingDate('domates')
            ? prev.plantingDate
            : getDefaultIrrigationPlantingDate(nextCrop),
        efficiency:
          prev.method === 'damla' && prev.efficiency === '0.90'
            ? String((IRRIGATION_METHOD_OPTIONS.find((item) => item.key === prev.method)?.efficiency || 0.9).toFixed(2))
            : prev.efficiency
      };
    });
  }, [defaultIrrigationCrop]);
  useEffect(() => {
    setIrrigationRequest((prev) => {
      if (prev) return prev;
      return {
        crop: defaultIrrigationCrop,
        plantingDate: getDefaultIrrigationPlantingDate(defaultIrrigationCrop),
        areaHa: '1',
        method: 'damla',
        waterSource: 'baraj_kanal',
        efficiency: '0.90'
      };
    });
  }, [defaultIrrigationCrop]);
  useEffect(() => {
    if (!irrigationRequest?.crop) return;
    const controller = new AbortController();
    const params = new URLSearchParams();
    params.set('city', city || 'Malatya');
    if (selectedDistrict) params.set('district', selectedDistrict);
    if (selectedNeighborhood) params.set('neighborhood', selectedNeighborhood);
    if (resolvedCoords?.raw) params.set('coords', resolvedCoords.raw);
    params.set('crop', irrigationRequest.crop);
    params.set('plantingDate', irrigationRequest.plantingDate || getDefaultIrrigationPlantingDate(irrigationRequest.crop));
    params.set('areaHa', irrigationRequest.areaHa || '1');
    params.set('method', irrigationRequest.method || 'damla');
    params.set('waterSource', irrigationRequest.waterSource || 'baraj_kanal');
    params.set('efficiency', irrigationRequest.efficiency || '0.90');
    params.set('strictLive', '1');
    params.set('seasonPlan', '1');
    params.set('horizonDays', '14');
    setIrrigationLoading(true);
    setIrrigationError('');
    fetch(`${assetBase || ''}/api/irrigation/calendar?${params.toString()}`, { signal: controller.signal })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok || !data?.available) {
          setIrrigationCalendar(null);
          setIrrigationError(data?.error ? `Sulama takvimi hazır değil: ${data.error}` : 'Sulama takvimi yuklenemedi.');
          return;
        }
        setIrrigationCalendar(data);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setIrrigationCalendar(null);
        setIrrigationError('Sulama takvimi baglantisi kurulamadi.');
      })
      .finally(() => setIrrigationLoading(false));
    return () => controller.abort();
  }, [
    assetBase,
    city,
    irrigationRequest,
    resolvedCoords?.raw,
    selectedDistrict,
    selectedNeighborhood
  ]);

  useEffect(() => {
    if (!mergeNotifications || !irrigationAlertBundle) return;
    if (irrigationAlertBundle.level === 'normal' && !irrigationSummary?.nextIrrigationDate) return;
    const locationLabel = [selectedNeighborhood, selectedDistrict, city].filter(Boolean).join(', ') || city || 'Parsel';
    mergeNotifications([
      {
        id: `irrigation-alert-${irrigationSummary?.nextIrrigationDate || irrigationAlertBundle.level || 'current'}`,
        tag: `irrigation-alert:${locationLabel}:${irrigationForm.crop}:${irrigationSummary?.nextIrrigationDate || irrigationAlertBundle.level || 'current'}`,
        type: irrigationAlertBundle.level === 'high' ? 'danger' : irrigationAlertBundle.level === 'elevated' ? 'warning' : 'info',
        title: 'Sulama operasyonu',
        messağe: `${locationLabel}: ${irrigationAlertBundle.headline || 'Sulama alarmi aktif.'}`,
        time: new Date().toLocaleTimeString('tr-TR')
      }
    ]);
  }, [
    city,
    irrigationAlertBundle,
    irrigationForm.crop,
    irrigationSummary?.nextIrrigationDate,
    mergeNotifications,
    selectedDistrict,
    selectedNeighborhood
  ]);

  const exportIrrigationTasksToCalendar = useCallback(() => {
    if (!upsertCalendarItems || !irrigationCalendarDrafts.length) {
      setIrrigationOpsStatus('Takvime aktarılacak görev yok.');
      return;
    }
    const inserted = upsertCalendarItems(irrigationCalendarDrafts);
    setIrrigationOpsStatus(
      inserted > 0
        ? `${inserted} sulama görevi takvime eklendi.`
        : 'Sulama görevleri takvimde zaten güncel.'
    );
    if (typeof syncNotifications === 'function') {
      syncNotifications('manual');
    }
  }, [irrigationCalendarDrafts, syncNotifications, upsertCalendarItems]);

  const pushIrrigationAlertsToCenter = useCallback(() => {
    if (!mergeNotifications || !irrigationAlertBundle) {
      setIrrigationOpsStatus('Bildirim için aktif sulama alarmı yok.');
      return;
    }
    const locationLabel = [selectedNeighborhood, selectedDistrict, city].filter(Boolean).join(', ') || city || 'Parsel';
    const payload = [
      {
        id: `irrigation-summary-${irrigationSummary?.nextIrrigationDate || Date.now()}`,
        tag: `irrigation-summary:${locationLabel}:${irrigationForm.crop}:${irrigationSummary?.nextIrrigationDate || irrigationAlertBundle.level || 'current'}`,
        type: irrigationAlertBundle.level === 'high' ? 'danger' : irrigationAlertBundle.level === 'elevated' ? 'warning' : 'info',
        title: 'Sulama alarmı',
        messağe: irrigationAlertBundle.headline || 'Sulama alarmı oluşturuldu.',
        time: new Date().toLocaleTimeString('tr-TR')
      }
    ];
    const topPriority = irrigationPriorityBoard[0];
    if (topPriority?.detail) {
      payload.push({
        id: `irrigation-priority-${topPriority.id}`,
        tag: `irrigation-priority:${locationLabel}:${topPriority.id}`,
        type: topPriority.level === 'high' ? 'danger' : topPriority.level === 'elevated' ? 'warning' : 'info',
        title: topPriority.title,
        messağe: topPriority.detail,
        time: new Date().toLocaleTimeString('tr-TR')
      });
    }
    const inserted = mergeNotifications(payload);
    setIrrigationOpsStatus(
      inserted > 0
        ? `${inserted} sulama bildirimi merkeze eklendi.`
        : 'Sulama bildirimleri zaten güncel.'
    );
  }, [
    city,
    irrigationAlertBundle,
    irrigationForm.crop,
    irrigationPriorityBoard,
    irrigationSummary?.nextIrrigationDate,
    mergeNotifications,
    selectedDistrict,
    selectedNeighborhood
  ]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    params.set('city', city || 'Malatya');
    if (selectedDistrict) params.set('district', selectedDistrict);
    if (selectedNeighborhood) params.set('neighborhood', selectedNeighborhood);
    params.set('variable', anomalyVariable || 'all');
    if (anomalyDate) params.set('date', anomalyDate);
    params.set('crop', irrigationForm.crop || defaultIrrigationCrop || 'domates');
    params.set('limit', '10');
    setAnomalyLoading(true);
    setAnomalyError('');
    fetch(`${assetBase || ''}/api/climate/anomaly-intel?${params.toString()}`, { signal: controller.signal })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok || !data?.available) {
          setAnomalyIntel(null);
          setAnomalyError(data?.error ? `Anomali merkezi hazır değil: ${data.error}` : 'Anomali merkezi yüklenemedi.');
          return;
        }
        setAnomalyIntel(data);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setAnomalyIntel(null);
        setAnomalyError('Anomali merkezi baglantisi kurulamadi.');
      })
      .finally(() => setAnomalyLoading(false));
    return () => controller.abort();
  }, [assetBase, anomalyDate, anomalyVariable, city, defaultIrrigationCrop, irrigationForm.crop, selectedDistrict, selectedNeighborhood]);

  // ---------- MIKROKLIMA GRID ORNEKLERI (OPEN-METEO GRID SAMPLE) ----------
  const [mikroNodes, setMikroNodes] = useState([
    { id: 'GRID-1', loc: 'Kuzey Yamac', temp: '-', hum: '-', stat: 'online', source: 'Open-Meteo grid' },
    { id: 'GRID-2', loc: 'Dogu Vadi', temp: '-', hum: '-', stat: 'online', source: 'Open-Meteo grid' },
    { id: 'GRID-3', loc: 'Guney Plato', temp: '-', hum: '-', stat: 'online', source: 'Open-Meteo grid' },
    { id: 'GRID-4', loc: 'Dere Yatagi', temp: '-', hum: '-', stat: 'limited', source: 'Open-Meteo grid' },
    { id: 'GRID-5', loc: 'Bati Sera', temp: '-', hum: '-', stat: 'online', source: 'Open-Meteo grid' }
  ]);
  const [mikroMapCenter, setMikroMapCenter] = useState({ lat: 39.92, lon: 32.85 });
  const [mikroLoading, setMikroLoading] = useState(false);

  useEffect(() => {
    setMikroLoading(false);
    const center = resolvedCoords || { lat: SOIL_MAP_PICKER.centerLat, lon: SOIL_MAP_PICKER.centerLon };
    setMikroMapCenter({ lat: center.lat, lon: center.lon });

    const baseTemp = Number(weather?.temp);
    const baseHumidity = Number(weather?.humidity);
    const topMoistureAvg = Number(soilReport?.internetSignals?.moistureTopAvg);
    const moistureBias = Number.isFinite(topMoistureAvg) ? (0.28 - topMoistureAvg) * 4 : 0;
    const derivedSource = weatherLive || soilLive ? 'Ana canlı veri tabanlı grid örneği' : 'Canlı kaynak yok';
    const offsets = [
      { t: -0.7, h: 6 },
      { t: 0.2, h: 2 },
      { t: 1.1, h: -5 },
      { t: -1.4, h: 8 },
      { t: 0.5, h: -2 }
    ];

    setMikroNodes((prev) => prev.map((node, i) => {
      const offset = offsets[i] || { t: 0, h: 0 };
      const nodeTemp = Number.isFinite(baseTemp) ? `${(baseTemp + offset.t + moistureBias).toFixed(1)}°C` : '-';
      const nodeHumidity = Number.isFinite(baseHumidity)
        ? `%${Math.max(0, Math.min(100, Math.round(baseHumidity + offset.h)))}`
        : '-';
      return {
        ...node,
        stat: weatherLive || soilLive ? 'online' : 'limited',
        temp: nodeTemp,
        hum: nodeHumidity,
        source: derivedSource
      };
    }));
  }, [SOIL_MAP_PICKER.centerLat, SOIL_MAP_PICKER.centerLon, resolvedCoords, soilLive, soilReport?.internetSignals?.moistureTopAvg, weather?.humidity, weather?.temp, weatherLive]);

  // ---------- OBSERVATION DATA (only from actual weather/soil signals) ----------
  const observationData = useMemo(() => {
    const cloudCover = Number.isFinite(Number(weather?.cloudCoverPct)) ? Math.round(Number(weather.cloudCoverPct)) : null;
    const moistureState = String(soilReport?.internetSignals?.moistureState || '').trim() || null;
    const topTemp = Number(soilReport?.internetSignals?.topTempAvg);
    const deepTemp = Number(soilReport?.internetSignals?.deepTempAvg);
    const thermalValue = Number.isFinite(topTemp)
      ? `${topTemp.toFixed(1)}°C`
      : Number.isFinite(Number(weather?.temp))
        ? `${Number(weather.temp).toFixed(1)}°C`
        : '-';
    return {
      cloudCover,
      soilMoisture: moistureState || (soilLive ? 'Belirsiz' : '-'),
      soilMoistureStatus: moistureState ? 'Canli' : soilLive ? 'Sinirli' : 'Kaynak yok',
      thermalGain: thermalValue,
      subSurfaceTemp: Number.isFinite(deepTemp) ? `${deepTemp.toFixed(1)}°C` : '-',
      liveSourceCount: [weatherLive, soilLive].filter(Boolean).length
    };
  }, [soilLive, soilReport?.internetSignals?.deepTempAvg, soilReport?.internetSignals?.moistureState, soilReport?.internetSignals?.topTempAvg, weather?.cloudCoverPct, weather?.temp, weatherLive]);

  // ---------- 30-DAY PREDICTIVE MODEL (from forecast) ----------
  const predictiveData = useMemo(() => {
    const days = forecast?.days || [];
    if (!days.length) {
      return {
        avgTemp: null,
        totalRain: null,
        monthlyRainEstimate: null,
        trend: null,
        coveragePct: 0,
        currentNormal: null,
        rainDelta: null,
        scaled: false
      };
    }
    const temps = days.map(d => (d.min + d.max) / 2);
    const avgTemp = Math.round(temps.reduce((a, b) => a + b, 0) / temps.length * 10) / 10;
    const totalRain = Math.round(days.reduce((a, d) => a + (d.precipitationMm || 0), 0));
    const monthlyRainEstimate = Math.round(totalRain * (30 / Math.max(days.length, 1)));
    // Seasonal normal comparison
    const monthNormals = [35, 30, 40, 50, 45, 20, 8, 5, 15, 35, 45, 40];
    const currentNormal = monthNormals[new Date().getMonth()];
    const rainDelta = currentNormal > 0 ? Math.round(((monthlyRainEstimate - currentNormal) / currentNormal) * 100) : 0;
    // Trend from first vs last half temperatures
    const half = Math.floor(temps.length / 2);
    const firstHalf = temps.slice(0, half).reduce((a, b) => a + b, 0) / Math.max(half, 1);
    const secondHalf = temps.slice(half).reduce((a, b) => a + b, 0) / Math.max(temps.length - half, 1);
    const trendPct = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf * 100).toFixed(1) : '0';
    const coveragePct = Math.round((days.length / 5) * 100);
    return { avgTemp, totalRain, monthlyRainEstimate, trend: trendPct, coveragePct, currentNormal, rainDelta, scaled: true };
  }, [forecast]);

  // ---------- WATER / SOIL SIGNALS (actual + explicitly derived) ----------
  const hydroData = useMemo(() => {
    const signals = soilReport?.internetSignals || {};
    const topMoistureAvg = Number(signals?.moistureTopAvg);
    const midMoistureAvg = Number(signals?.moistureMidAvg);
    const etcRaw = Number(signals?.evapotranspirationAvg);
    const topTemp = Number(signals?.topTempAvg);
    const deepTemp = Number(signals?.deepTempAvg);
    const etc = Number.isFinite(etcRaw) ? Number(etcRaw.toFixed(2)) : null;
    const moistureTopPct = Number.isFinite(topMoistureAvg) ? Number((topMoistureAvg * 100).toFixed(1)) : null;
    const moistureMidPct = Number.isFinite(midMoistureAvg) ? Number((midMoistureAvg * 100).toFixed(1)) : null;
    const irrigationNeed = etc == null
      ? null
      : Math.max(0, Math.round((etc * 7) - (Number.isFinite(topMoistureAvg) ? topMoistureAvg * 22 : 0)));
    const irrigationStatus =
      irrigationNeed == null
        ? 'Veri yok'
        : irrigationNeed >= 26
          ? 'Acil'
          : irrigationNeed >= 12
            ? 'Planli'
            : 'Yeterli';
    const etcStatus = etc == null ? 'Veri yok' : etc >= 0.25 ? 'Yüksek' : etc >= 0.1 ? 'Normal' : 'Düşük';
    const moistureStatus =
      moistureTopPct == null
        ? 'Veri yok'
        : moistureTopPct < 18
          ? 'Kuru'
          : moistureTopPct > 34
            ? 'Islak'
            : 'Dengeli';
    const heatGradient = Number.isFinite(topTemp) && Number.isFinite(deepTemp)
      ? Number((topTemp - deepTemp).toFixed(1))
      : null;
    return {
      etc,
      etcStatus,
      moistureTopPct,
      moistureMidPct,
      moistureStatus,
      irrigationNeed,
      irrigationStatus,
      topTemp: Number.isFinite(topTemp) ? Number(topTemp.toFixed(1)) : null,
      deepTemp: Number.isFinite(deepTemp) ? Number(deepTemp.toFixed(1)) : null,
      heatGradient,
      live: Number.isFinite(etc) || Number.isFinite(moistureTopPct) || Number.isFinite(moistureMidPct)
    };
  }, [soilReport?.internetSignals]);

  // ---------- METEOROLOGICAL CONDITION SIGNALS (no fake outbreak geometry) ----------
  const pestData = useMemo(() => {
    const temp = Number(weather?.temp);
    const hum = Number(weather?.humidity);
    const wind = Number(weather?.windKmh);
    const rain = Number(weather?.precipitationMm);
    const conditions = [];
    if (Number.isFinite(hum) && hum >= 82 && Number.isFinite(rain) && rain >= 1) {
      conditions.push({
        name: 'Mantar kosullari uygun',
        detail: 'Yüksek nem ve yağış birlikte goruluyor.',
        basis: `Nem %${Math.round(hum)} • yağış ${rain.toFixed(1)} mm`,
        risk: hum >= 90 ? 'Yüksek' : 'Orta',
        pct: Math.min(100, Math.round(hum)),
        icon: 'Target'
      });
    }
    if (Number.isFinite(temp) && temp >= 28 && Number.isFinite(hum) && hum <= 40) {
      conditions.push({
        name: 'Akar baskisi kosulu',
        detail: 'Sıcak ve kuru hava akar baskısını destekleyebilir.',
        basis: `${temp.toFixed(1)}°C • Nem %${Math.round(hum)}`,
        risk: temp >= 32 ? 'Yüksek' : 'Orta',
        pct: Math.min(100, Math.round((temp - 20) * 6)),
        icon: 'Bug'
      });
    }
    if (Number.isFinite(wind) && wind >= 20) {
      conditions.push({
        name: 'Rüzgar stresi',
        detail: 'İlaçlama ve açık saha operasyonu icin dikkat gerekir.',
        basis: `${Math.round(wind)} km/s`,
        risk: wind >= 30 ? 'Yüksek' : 'Orta',
        pct: Math.min(100, Math.round(wind * 2.4)),
        icon: 'Target'
      });
    }
    if (weather?.frostRisk) {
      conditions.push({
        name: 'Don stresi',
        detail: 'Don riski dogrudan meteoroloji verisinden geliyor.',
        basis: `Min ${weather?.tempMin ?? '-'}°C`,
        risk: 'Kritik',
        pct: 100,
        icon: 'Target'
      });
    }
    return { pests: conditions.slice(0, 4), totalDetections: conditions.length };
  }, [weather]);

  const onlineSensorCount = useMemo(
    () => mikroNodes.filter((node) => node.stat === 'online').length,
    [mikroNodes]
  );
  const weatherScore = Number(weatherSummary?.score || 0);
  const soilHealthScore = Number(soilDiagnostics?.score || soilReport?.soilHealth?.score || 0);
  const predictiveCoverage = Number(predictiveData?.coveragePct || 0);
  const operationWindow = useMemo(() => {
    if (frostSignal?.hasRisk || allAlerts.length >= 3 || weatherScore >= 72) {
      return {
        label: 'Dar pencere',
        detail: 'Uygulama ve sulama kararlarini saatlik izle.',
        tone: '#E07070'
      };
    }
    if (weatherScore >= 55 || String(hydroData.irrigationStatus || '').toLowerCase() === 'acil') {
      return {
        label: 'Kontrollu pencere',
        detail: 'İşlem mumkun; saha kararlarini parcali planla.',
        tone: 'var(--wheat)'
      };
    }
    return {
      label: 'Uygun pencere',
      detail: 'Bugun saha operasyona uygun gorunuyor.',
      tone: 'var(--sprout)'
    };
  }, [allAlerts.length, frostSignal?.hasRisk, hydroData.irrigationStatus, weatherScore]);
  const responseProtocols = useMemo(() => {
    const protocols = [];
    const add = (item) => {
      if (item?.tag) protocols.push(item);
    };

    if (frostSignal?.hasRisk || weather?.frostRisk) {
      add({
        tag: 'Don protokolu',
        action: 'Kritik bloklarda ortu, sulama ve gece nobeti akisini devreye al.',
        trigger: weather?.tempMin != null ? `Min ${weather.tempMin}°C` : 'Meteorolojik don sinyali',
        icon: Snowflake,
        color: '#B8D0E8'
      });
    }
    if (Number.isFinite(Number(weather?.windKmh)) && Number(weather.windKmh) >= 20) {
      add({
        tag: 'Rüzgar protokolu',
        action: 'İlaçlama, dron ve hafif saha operasyonlarını rüzgar penceresine göre ertele.',
        trigger: `${Math.round(Number(weather.windKmh))} km/s rüzgar`,
        icon: Wind,
        color: 'var(--sky)'
      });
    }
    if (Number.isFinite(Number(weather?.precipitationMm)) && Number(weather.precipitationMm) >= 5) {
      add({
        tag: 'Yağış protokolu',
        action: 'Tarlaya giriş, hasat ve ilaçlama planını yağış penceresine göre yeniden sırala.',
        trigger: `${Number(weather.precipitationMm).toFixed(1)} mm yağış`,
        icon: CloudRain,
        color: 'var(--wheat)'
      });
    }
    if (String(hydroData.irrigationStatus || '').toLowerCase() === 'acil') {
      add({
        tag: 'Sulama protokolu',
        action: 'Ust katman nemi kritik; sulama vardiyasini ayni gun icinde yeniden planla.',
        trigger: `Ust katman %${hydroData.moistureTopPct ?? '-'} • ETc ${hydroData.etc ?? '-'} mm/gun`,
        icon: Droplets,
        color: '#E07070'
      });
    }
    if (!protocols.length) {
      add({
        tag: 'Stabil operasyon',
        action: 'Kritik alarm yok. Standart saha plani ve rutin izleme yeterli.',
        trigger: 'Canli sinyaller kritik esik asmadi',
        icon: CheckCircle2,
        color: 'var(--sprout)'
      });
    }
    return protocols.slice(0, 3);
  }, [frostSignal?.hasRisk, hydroData.etc, hydroData.irrigationStatus, hydroData.moistureTopPct, weather?.frostRisk, weather?.precipitationMm, weather?.tempMin, weather?.windKmh]);

  const climateWorkspaceTabs = useMemo(
    () => [
      { id: 'command', label: 'Komuta', icon: Activity, sectionId: 'climate-command-center', summary: 'Konum, kapsam ve operasyon durumu.' },
      { id: 'forecast', label: 'Tahmin', icon: LineChart, sectionId: 'climate-forecast', summary: 'Saatlik, 7 günlük ve 30 günlük pencere.' },
      { id: 'soil', label: 'Toprak', icon: Waves, sectionId: 'climate-soil', summary: 'Toprak profili, indeksler ve saha uyumu.' },
      { id: 'irrigation', label: 'Sulama', icon: Droplet, sectionId: 'climate-irrigation', summary: 'ET0, Kc ve Hackhaton referansına göre sulama takvimi.' },
      { id: 'anomaly', label: 'Anomali', icon: AlertOctagon, sectionId: 'climate-anomaly', summary: 'Tarihsel anomaliler, olay eslesmeleri ve haber baglami.' },
      { id: 'hackhaton', label: 'Model', icon: Cpu, sectionId: 'climate-hackhaton', summary: 'Hackhaton chart, ET0 ve karar destek paketi.' },
      { id: 'sensors', label: 'Sensor', icon: Wifi, sectionId: 'climate-sensors', summary: 'Mikroklima ve hidroloji izlemesi.' },
      { id: 'risk', label: 'Risk', icon: AlertTriangle, sectionId: 'climate-risk', summary: 'Uyari, zararli radari ve protokoller.' }
    ],
    []
  );
  const activeClimateWorkspace = climateWorkspaceTabs.find((item) => item.id === weatherWorkspaceTab) || climateWorkspaceTabs[0];
  const climateCommandStats = useMemo(
    () => [
      { label: 'Operasyon', value: operationWindow.label, detail: operationWindow.detail, tone: operationWindow.tone },
      { label: 'Kapsam', value: weatherScopeTarget, detail: `${resolvedScopeLevel} • ${resolvedGeoSource}`, tone: 'var(--sky)' },
      { label: 'Toprak skoru', value: soilHealthScore ? `${soilHealthScore}/100` : 'Bekleniyor', detail: soilReport?.soilType || 'Toprak profili hazırlaniyor', tone: soilHealthScore >= 70 ? 'var(--sprout)' : soilHealthScore >= 45 ? 'var(--wheat)' : 'rgba(245,237,216,0.8)' },
      { label: 'Tahmin kapsami', value: predictiveCoverage ? `%${predictiveCoverage}` : 'Bekleniyor', detail: predictiveData.monthlyRainEstimate != null ? `${predictiveData.monthlyRainEstimate} mm / 30 gun` : 'Canli tahmin bekleniyor', tone: 'var(--wheat)' },
      { label: 'Grid örnekleri', value: `${onlineSensorCount}/${mikroNodes.length}`, detail: mikroLoading ? 'Canli veriler yenileniyor' : 'Open-Meteo mikroklima örnekleri', tone: 'var(--sprout)' },
      { label: 'Don / acil', value: frostSignal?.hasRisk ? 'Hazirlik gerekli' : 'Normal', detail: frostSignal?.detail || 'Kritik don sinyali yok', tone: frostSignal?.hasRisk ? '#E07070' : 'var(--sky)' }
    ],
    [
      frostSignal?.detail,
      frostSignal?.hasRisk,
      mikroLoading,
      mikroNodes.length,
      onlineSensorCount,
      operationWindow.detail,
      operationWindow.label,
      operationWindow.tone,
      predictiveCoverage,
      predictiveData.monthlyRainEstimate,
      resolvedGeoSource,
      resolvedScopeLevel,
      soilHealthScore,
      soilReport?.soilType,
      weatherScopeTarget
    ]
  );
  const climateActionCards = useMemo(
    () => [
      {
        title: 'Uygulama penceresi',
        value: operationWindow.label,
        detail: operationWindow.detail,
        tone: operationWindow.tone,
        action: 'Tahmini ac',
        tabId: 'forecast',
        sectionId: 'climate-forecast'
      },
      {
        title: 'Sulama karari',
        value: irrigationSummary?.nextIrrigationDate ? irrigationSummary.nextIrrigationDate : hydroData.irrigationStatus,
        detail: irrigationSummary?.nextIrrigationGrossMm
          ? `${irrigationSummary.nextIrrigationGrossMm} mm brut • ${irrigationSummary.nextIrrigationGrossM3} m3`
          : `ETc ${hydroData.etc} mm/gun • ihtiyac ${hydroData.irrigationNeed} mm`,
        tone: irrigationSummary?.nextIrrigationDate
          ? 'var(--sky)'
          : hydroData.irrigationStatus === 'Acil'
            ? '#E07070'
            : hydroData.irrigationStatus === 'Planli'
              ? 'var(--wheat)'
              : 'var(--sprout)',
        action: 'Takvimi ac',
        tabId: 'irrigation',
        sectionId: 'climate-irrigation'
      },
      {
        title: 'Toprak modu',
        value: soilReport?.soilType || 'Bekleniyor',
        detail: soilDiagnostics?.risk ? `Risk: ${soilDiagnostics.risk}` : 'Toprak uyum profili hazırlaniyor',
        tone: soilHealthScore >= 70 ? 'var(--sprout)' : soilHealthScore >= 45 ? 'var(--wheat)' : 'var(--sky)',
        action: 'Topraga git',
        tabId: 'soil',
        sectionId: 'climate-soil'
      },
      {
        title: 'Anomali merkezi',
        value: anomalyIntel?.selectedDate || 'Hazır',
        detail: anomalyIntel?.selectedAnomaly
          ? `${anomalyIntel.selectedAnomaly.variableLabel} • ${anomalyIntel.selectedAnomaly.anomalyType}`
          : 'Tarihsel anomali ve haber baglami hazır.',
        tone:
          Number(anomalyIntel?.selectedAnomaly?.severityScore || 0) >= 8
            ? '#E07070'
            : Number(anomalyIntel?.selectedAnomaly?.severityScore || 0) >= 4
              ? 'var(--wheat)'
              : 'var(--sky)',
        action: 'Merkezi ac',
        tabId: 'anomaly',
        sectionId: 'climate-anomaly'
      },
      {
        title: 'Erken uyarı',
        value: pestData.totalDetections > 0 ? `${pestData.totalDetections} risk` : 'Temiz',
        detail: pestData.totalDetections > 0 ? 'Yerel meteorolojik stres kosullari algilandi.' : 'Canli meteorolojik risk sinyali düşük.',
        tone: pestData.totalDetections > 0 ? '#E07070' : 'var(--sprout)',
        action: 'Radari ac',
        tabId: 'risk',
        sectionId: 'climate-risk'
      }
    ],
    [
      hydroData.etc,
      hydroData.irrigationNeed,
      hydroData.irrigationStatus,
      irrigationSummary?.nextIrrigationDate,
      irrigationSummary?.nextIrrigationGrossM3,
      irrigationSummary?.nextIrrigationGrossMm,
      anomalyIntel?.selectedAnomaly,
      anomalyIntel?.selectedDate,
      operationWindow.detail,
      operationWindow.label,
      operationWindow.tone,
      pestData.totalDetections,
      soilDiagnostics?.risk,
      soilHealthScore,
      soilReport?.soilType
    ]
  );
  const scrollToClimateSection = (sectionId, workspaceId) => {
    if (workspaceId) setWeatherWorkspaceTab(workspaceId);
    if (typeof document === 'undefined') return;
    const run = () => {
      const el = document.getElementById(sectionId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(run);
      return;
    }
    run();
  };
  // ---------------------------------------------------------

  return (
    <div className="tab-page">
      <div className="tab-content-inner">

        {/* ═══ HERO ═══ */}
        <section style={{
          padding: '48px 24px 40px',
          background: 'linear-gradient(180deg, rgba(10,18,12,0.3) 0%, transparent 100%)',
          borderRadius: '24px',
          marginBottom: '20px',
          border: '1px solid rgba(143,188,69,0.08)',
          backdropFilter: 'blur(8px)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 70% 20%, rgba(88,143,180,0.08) 0%, transparent 60%)', pointerEvents: 'none' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px', position: 'relative', zIndex: 2 }}>
            <div>
              <div className="tech-badge" style={{ marginBottom: '12px' }}>İKLİM_KOMUTA_SİSTEMİ v3.2</div>
              <h2 style={{ fontSize: '40px', fontWeight: '900', margin: 0, lineHeight: 1.1, letterSpacing: '-1px' }}>
                İklim <em style={{ color: 'var(--sky)' }}>İstihbaratı</em>
              </h2>
              <p style={{ fontSize: '15px', opacity: 0.55, marginTop: '10px', maxWidth: '500px', lineHeight: 1.5 }}>
                Uydu, sensör ağı ve yapay zeka destekli 30 günlük iklim projeksiyonu.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div className="bento-card" style={{ padding: '16px 20px', textAlign: 'center', minWidth: '100px' }}>
                <div style={{ fontSize: '10px', fontWeight: '800', letterSpacing: '1px', opacity: 0.4, marginBottom: '4px' }}>SKOR</div>
                <div style={{ fontSize: '28px', fontWeight: '900', color: 'var(--sprout)', fontFamily: 'JetBrains Mono' }}>{weatherSummary?.score ?? '--'}</div>
                <div style={{ fontSize: '9px', opacity: 0.3 }}>/100</div>
              </div>
              <div className="bento-card" style={{ padding: '16px 20px', textAlign: 'center', minWidth: '100px' }}>
                <div style={{ fontSize: '10px', fontWeight: '800', letterSpacing: '1px', opacity: 0.4, marginBottom: '4px' }}>UYARI</div>
                <div style={{ fontSize: '28px', fontWeight: '900', color: allAlerts.length > 0 ? '#E07070' : 'var(--sprout)', fontFamily: 'JetBrains Mono' }}>{allAlerts.length}</div>
                <div style={{ fontSize: '9px', opacity: 0.3 }}>aktif</div>
              </div>
              <div className="bento-card" style={{ padding: '16px 20px', textAlign: 'center', minWidth: '100px' }}>
                <div style={{ fontSize: '10px', fontWeight: '800', letterSpacing: '1px', opacity: 0.4, marginBottom: '4px' }}>SENSÖR</div>
                <div style={{ fontSize: '28px', fontWeight: '900', color: 'var(--wheat)', fontFamily: 'JetBrains Mono' }}>{mikroNodes.filter(n => n.stat === 'online').length}</div>
                <div style={{ fontSize: '9px', opacity: 0.3 }}>çevrimiçi</div>
              </div>
            </div>
          </div>
        </section>

        <section className="panel glass-premium" style={{ display: 'grid', gap: '18px', marginBottom: '20px', overflow: 'hidden', position: 'relative' }}>
          <div className="hud-scan" style={{ opacity: 0.1, animationDuration: '16s' }} />
          <div style={{ position: 'relative', zIndex: 2, display: 'grid', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ maxWidth: '760px' }}>
                <div className="tech-badge" style={{ marginBottom: '8px' }}>IKLIM WORKSPACE</div>
                <h3 style={{ margin: 0, fontSize: '28px', fontWeight: '900' }}>
                  {activeClimateWorkspace.label} <em>merkezi</em>
                </h3>
                <p style={{ margin: '8px 0 0', color: 'rgba(245,237,216,0.68)', fontSize: '13px', lineHeight: 1.6 }}>
                  {activeClimateWorkspace.summary}
                </p>
              </div>
              <button className="btn-secondary" onClick={() => setWeatherRefreshKey((p) => p + 1)}>
                <RefreshCw size={14} /> Tüm veriyi yenile
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {climateWorkspaceTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={weatherWorkspaceTab === tab.id ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => scrollToClimateSection(tab.sectionId, tab.id)}
                  style={{
                    padding: '10px 14px',
                    background: weatherWorkspaceTab === tab.id ? 'rgba(143,188,69,0.18)' : 'rgba(255,255,255,0.03)',
                    borderColor: weatherWorkspaceTab === tab.id ? 'rgba(143,188,69,0.32)' : 'rgba(255,255,255,0.08)'
                  }}
                >
                  <tab.icon size={14} />
                  {tab.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
              {climateCommandStats.map((item) => (
                <div key={item.label} className="bento-card" style={{ padding: '14px', minHeight: '108px', background: 'rgba(255,255,255,0.03)' }}>
                  <div style={{ fontSize: '11px', opacity: 0.52, fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.7px' }}>{item.label}</div>
                  <strong style={{ fontSize: '22px', color: item.tone, display: 'block', marginTop: '8px' }}>{item.value}</strong>
                  <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.62)', marginTop: '8px', lineHeight: 1.45 }}>{item.detail}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              {climateActionCards.map((item) => (
                <div key={item.title} className="bento-card" style={{ padding: '16px', border: `1px solid ${item.tone}30`, background: 'rgba(12,24,16,0.56)' }}>
                  <div style={{ fontSize: '11px', opacity: 0.52, fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.7px' }}>{item.title}</div>
                  <div style={{ fontSize: '20px', fontWeight: '900', color: item.tone, marginTop: '8px' }}>{item.value}</div>
                  <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.64)', lineHeight: 1.5, marginTop: '8px', minHeight: '38px' }}>{item.detail}</div>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ marginTop: '12px', width: '100%', justifyContent: 'center' }}
                    onClick={() => scrollToClimateSection(item.sectionId, item.tabId)}
                  >
                    {item.action}
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {liveDataChips.map((item) => (
                <span key={item.label} className="tech-badge" style={{ background: `${item.tone}18`, color: item.tone }}>
                  {item.label}: {item.value}
                </span>
              ))}
            </div>

            {coreDataWarnings.length ? (
              <div style={{ display: 'grid', gap: '8px' }}>
                {coreDataWarnings.map((item) => (
                  <div key={item} style={{ fontSize: '12px', color: '#f0c26d', background: 'rgba(240,194,109,0.08)', border: '1px solid rgba(240,194,109,0.18)', borderRadius: '12px', padding: '10px 12px' }}>
                    {item}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        {/* ═══ LIVE OBSERVATION LAYER ═══ */}
        <div className="glass-premium" style={{ marginBottom: '20px', padding: '24px', position: 'relative', overflow: 'hidden' }}>
          <div className="hud-scan" style={{ animationDuration: '8s', opacity: 0.4 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', position: 'relative', zIndex: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <IconBox icon={Radar} color="var(--sprout)" bg="rgba(143,188,69,0.1)" glow="rgba(143,188,69,0.2)" />
              <div>
                <h3 className="section-title" style={{ fontSize: '20px', color: 'var(--sprout)', margin: 0 }}>Canli <em>gozlem katmani</em></h3>
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', letterSpacing: '2px' }}>HARITA + HAVA + TOPRAK sinyali</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: 'var(--sprout)', fontWeight: '800' }}>KONUM AKTIF</div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>LAT: {mikroMapCenter.lat.toFixed(4)} LON: {mikroMapCenter.lon.toFixed(4)}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', height: '280px' }}>
            <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', background: '#0a100a' }}>
              {typeof window !== 'undefined' && (
                <MapContainer
                  center={[mikroMapCenter.lat, mikroMapCenter.lon]}
                  zoom={12}
                  style={{ height: '100%', width: '100%' }}
                  zoomControl={false}
                  attributionControl={false}
                  scrollWheelZoom={false}
                  dragging={false}
                >
                  <TileLayer
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    maxZoom={18}
                  />
                  <CircleMarker
                    center={[mikroMapCenter.lat, mikroMapCenter.lon]}
                    pathOptions={{ color: 'var(--sprout)', fillColor: 'var(--sprout)', fillOpacity: 0.4 }}
                    radius={12}
                  />
                  <CircleMarker
                    center={[mikroMapCenter.lat, mikroMapCenter.lon]}
                    pathOptions={{ color: 'var(--sprout)', fill: false }}
                    radius={30}
                    className="pulse-ring" // Needs CSS animation
                  />
                </MapContainer>
              )}
              <div style={{ position: 'absolute', inset: 0, border: '2px solid rgba(143,188,69,0.2)', pointerEvents: 'none', zIndex: 1000 }} />
              <div style={{ position: 'absolute', top: '10px', left: '10px', background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: '4px', fontSize: '9px', fontFamily: 'JetBrains Mono', borderLeft: '3px solid var(--sprout)', zIndex: 1000 }}>
                CANLI GOZLEM • {observationData.liveSourceCount}/2 kaynak
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                {
                  label: "Bulut Örtüsü",
                  value: observationData.cloudCover == null ? "-" : `%${observationData.cloudCover}`,
                  status:
                    observationData.cloudCover == null
                      ? "Kaynak yok"
                      : observationData.cloudCover < 30
                        ? "Açık"
                        : observationData.cloudCover < 60
                          ? "Parcali"
                          : "Kapali"
                },
                { label: "Toprak Nemi", value: observationData.soilMoisture, status: observationData.soilMoistureStatus },
                { label: "Yuzey Sıcakligi", value: observationData.thermalGain, status: observationData.subSurfaceTemp === '-' ? 'Tek katman' : `6cm ${observationData.subSurfaceTemp}` }
              ].map((m, i) => (
                <div key={i} className="bento-card" style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '10px', opacity: 0.5, marginBottom: '4px' }}>{m.label}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: '700' }}>{m.value}</div>
                    <div style={{ fontSize: '9px', color: 'var(--sprout)', fontWeight: '800' }}>{m.status}</div>
                  </div>
                </div>
              ))}
              <button className="btn-primary" style={{ marginTop: 'auto', padding: '10px', fontSize: '11px' }}>
                <Layers size={14} style={{ marginRight: '6px' }} /> KAYNAK OZETI
              </button>
            </div>
          </div>
        </div>

        {/* ═══ CITY SELECTOR ═══ */}
        <div id="climate-command-center" className="panel" style={{ position: 'relative', overflow: 'visible', zIndex: 9999, background: 'linear-gradient(135deg, rgba(14,32,22,0.95), rgba(9,24,16,0.92))', border: '1px solid rgba(155,203,92,0.3)', scrollMarginTop: '110px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: cityDropdownOpen ? '12px' : '0' }}>
            <IconBox icon={MapPin} color="var(--sprout)" glow="rgba(143,188,69,0.2)" />
            <div style={{ flex: 1 }}>
              <span className="bento-head" style={{ marginBottom: '4px', display: 'block' }}>KONUM SEÇİMİ</span>
              <p style={{ fontSize: '12px', color: 'rgba(245,237,216,0.45)', margin: 0 }}>İklim ve toprak verilerini görmek istediğiniz şehri seçin</p>
            </div>
            <button
              onClick={() => { setCityDropdownOpen(!cityDropdownOpen); setCitySearchText(''); }}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                background: 'linear-gradient(135deg, rgba(143,188,69,0.15), rgba(143,188,69,0.08))',
                border: '1px solid rgba(143,188,69,0.35)',
                borderRadius: '12px', padding: '10px 18px',
                color: 'var(--cream)', fontWeight: 700, fontSize: '14px',
                cursor: 'pointer', transition: 'all 0.3s',
                fontFamily: 'Playfair Display', letterSpacing: '-0.3px'
              }}
            >
              <MapPin size={14} color="var(--sprout)" />
              {city || 'Şehir Seç'}
              <ChevronDown size={14} style={{ transform: cityDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s' }} />
            </button>
          </div>
          <div style={{ marginTop: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: '220px', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(10,19,13,0.7)', borderRadius: '12px', padding: '8px 12px', border: '1px solid rgba(143,188,69,0.2)' }}>
              <Search size={14} color="var(--sprout)" />
              <input
                type="text"
                value={cityQuery || ""}
                onChange={(e) => typeof setCityQuery === "function" && setCityQuery(e.target.value)}
                placeholder="Şehir yaz ve uygula (örn: Ankara)"
                style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--cream)', fontSize: '13px', width: '100%', fontFamily: 'Outfit' }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && typeof applyCityQuery === "function") {
                    applyCityQuery();
                    setWeatherRefreshKey((p) => p + 1);
                  }
                }}
              />
            </div>
            <button
              className="btn-secondary"
              style={{ padding: '10px 16px' }}
              onClick={() => {
                if (typeof applyCityQuery === "function") applyCityQuery();
                setWeatherRefreshKey((p) => p + 1);
              }}
            >
              Şehri Uygula
            </button>
          </div>
          {cityDropdownOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
              background: 'linear-gradient(180deg, rgba(10,20,14,0.98), rgba(8,16,11,0.98))',
              border: '1px solid rgba(143,188,69,0.3)',
              borderTop: 'none',
              borderRadius: '0 0 16px 16px',
              boxShadow: '0 24px 48px rgba(2,10,6,0.6)',
              backdropFilter: 'blur(20px)',
              animation: 'slideUp 0.25s ease'
            }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(143,188,69,0.15)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(143,188,69,0.08)', borderRadius: '10px', padding: '8px 12px', border: '1px solid rgba(143,188,69,0.2)' }}>
                  <Search size={14} color="var(--sprout)" />
                  <input
                    type="text"
                    value={citySearchText}
                    onChange={e => setCitySearchText(e.target.value)}
                    placeholder="Şehir ara..."
                    autoFocus
                    style={{
                      background: 'transparent', border: 'none', outline: 'none',
                      color: 'var(--cream)', fontSize: '14px', width: '100%',
                      fontFamily: 'Outfit'
                    }}
                  />
                </div>
              </div>
              <div style={{ maxHeight: '280px', overflowY: 'auto', padding: '8px', scrollbarWidth: 'thin' }}>
                {filteredCities.map(c => (
                  <button
                    key={c}
                    onClick={() => {
                      setCity(c);
                      setLandDemo((prev) => ({ ...(prev || {}), district: '', neighborhood: '' }));
                      setFieldLocation((prev) => ({ ...(prev || {}), coords: '' }));
                      setCityDropdownOpen(false);
                      setCitySearchText('');
                      setWeatherRefreshKey(p => p + 1);
                    }}
                    style={{
                      width: '100%', textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '10px 14px', borderRadius: '10px',
                      background: c === city ? 'rgba(143,188,69,0.15)' : 'transparent',
                      border: c === city ? '1px solid rgba(143,188,69,0.3)' : '1px solid transparent',
                      color: c === city ? 'var(--sprout)' : 'rgba(245,237,216,0.8)',
                      fontSize: '13px', fontWeight: c === city ? 700 : 500,
                      cursor: 'pointer', transition: 'all 0.15s',
                      fontFamily: 'Outfit'
                    }}
                    onMouseEnter={e => { if (c !== city) e.currentTarget.style.background = 'rgba(245,237,216,0.04)'; }}
                    onMouseLeave={e => { if (c !== city) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <MapPin size={12} color={c === city ? 'var(--sprout)' : 'rgba(245,237,216,0.3)'} />
                    {c}
                    {c === city && <CheckCircle2 size={14} color="var(--sprout)" style={{ marginLeft: 'auto' }} />}
                  </button>
                ))}
                {filteredCities.length === 0 && (
                  <p style={{ textAlign: 'center', padding: '20px', color: 'rgba(245,237,216,0.4)', fontSize: '13px' }}>Sonuç bulunamadı</p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="panel" style={{ display: 'grid', gap: '14px', background: 'linear-gradient(135deg, rgba(10,20,14,0.92), rgba(10,22,18,0.78))', border: '1px solid rgba(88,143,180,0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <strong style={{ fontSize: '18px', display: 'block' }}>İl + ilçe + mahalle kapsamı</strong>
              <span style={{ fontSize: '12px', color: 'rgba(245,237,216,0.45)' }}>
                İklim ve toprak sorgularını ilçe düzeyine indir.
              </span>
            </div>
            <span className="tech-badge" style={{ background: 'rgba(88,143,180,0.12)', color: 'var(--sky)' }}>
              {weatherScopeTarget}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            <div style={{ display: 'grid', gap: '6px' }}>
              <span className="bento-head">Hızlı konum arama</span>
              <input
                type="text"
                value={locationSearch || ''}
                onChange={(e) => setLocationSearch(e.target.value)}
                placeholder="İlçe veya mahalle yaz"
                style={{
                  width: '100%',
                  borderRadius: '12px',
                  border: '1px solid rgba(143,188,69,0.22)',
                  background: 'rgba(255,255,255,0.04)',
                  color: 'var(--cream)',
                  padding: '12px 14px',
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ display: 'grid', gap: '6px' }}>
              <span className="bento-head">İlçe</span>
              <input
                list="weather-district-suggestions"
                value={selectedDistrict}
                onChange={(e) => {
                  setFieldLocation((prev) => ({ ...(prev || {}), coords: '' }));
                  setLandDemo((prev) => ({
                    ...prev,
                    district: e.target.value,
                    neighborhood: ''
                  }));
                }}
                placeholder="İlçe seç"
                style={{
                  width: '100%',
                  borderRadius: '12px',
                  border: '1px solid rgba(88,143,180,0.22)',
                  background: 'rgba(255,255,255,0.04)',
                  color: 'var(--cream)',
                  padding: '12px 14px',
                  outline: 'none'
                }}
              />
              <datalist id="weather-district-suggestions">
                {(weatherDistrictSuggestions || []).map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </div>

            <div style={{ display: 'grid', gap: '6px' }}>
              <span className="bento-head">Mahalle / mevki</span>
              <input
                list="weather-neighborhood-suggestions"
                value={selectedNeighborhood}
                onChange={(e) => {
                  setFieldLocation((prev) => ({ ...(prev || {}), coords: '' }));
                  setLandDemo((prev) => ({
                    ...prev,
                    neighborhood: e.target.value
                  }));
                }}
                placeholder="Mahalle seç"
                style={{
                  width: '100%',
                  borderRadius: '12px',
                  border: '1px solid rgba(212,168,67,0.22)',
                  background: 'rgba(255,255,255,0.04)',
                  color: 'var(--cream)',
                  padding: '12px 14px',
                  outline: 'none'
                }}
              />
              <datalist id="weather-neighborhood-suggestions">
                {(weatherNeighborhoodSuggestions || []).map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </div>
          </div>

          {locationSearchMatches?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {locationSearchMatches.slice(0, 8).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="btn-secondary"
                  style={{ padding: '8px 12px', fontSize: '11px' }}
                  onClick={() => applyLocationSearchHit(item)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span className="tech-badge" style={{ background: 'rgba(143,188,69,0.1)', color: 'var(--sprout)' }}>
                {city || 'Şehir seçilmedi'}
              </span>
              {selectedDistrict ? (
                <span className="tech-badge" style={{ background: 'rgba(88,143,180,0.1)', color: 'var(--sky)' }}>
                  İlçe: {selectedDistrict}
                </span>
              ) : null}
              {selectedNeighborhood ? (
                <span className="tech-badge" style={{ background: 'rgba(212,168,67,0.1)', color: 'var(--wheat)' }}>
                  Mahalle: {selectedNeighborhood}
                </span>
              ) : null}
            </div>
            <button className="btn-primary" style={{ padding: '10px 18px' }} onClick={() => setWeatherRefreshKey((p) => p + 1)}>
              İlçe verisini uygula
            </button>
          </div>
        </div>

        {/* ═══ STATUS ═══ */}
        <div className="panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <IconBox icon={MapPin} color="var(--sprout)" />
            <div>
              <strong style={{ fontSize: '20px', fontFamily: 'Playfair Display', display: 'block' }}>{weatherLocationLabel}</strong>
              <p style={{ fontSize: '11px', color: 'rgba(245,237,216,0.35)', fontStyle: 'italic', margin: 0 }}>{weatherFreshnessText}</p>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                <span className="tech-badge" style={{ background: 'rgba(88,143,180,0.1)', color: 'var(--sky)' }}>
                  Kapsam: {resolvedScopeLevel}
                </span>
                <span className="tech-badge" style={{ background: 'rgba(143,188,69,0.1)', color: 'var(--sprout)' }}>
                  Kaynak: {resolvedGeoSource}
                </span>
                {resolvedCoords?.raw ? (
                  <span className="tech-badge" style={{ background: 'rgba(212,168,67,0.1)', color: 'var(--wheat)' }}>
                    Koordinat: {resolvedCoords.raw}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {weatherSummary?.score != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(143,188,69,0.1)', padding: '8px 16px', borderRadius: '20px', border: '1px solid rgba(143,188,69,0.2)' }}>
                <IconBox icon={Activity} size={12} bg="transparent" />
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: '12px', fontWeight: 700, color: 'var(--sprout)' }}>{weatherSummary.score}/100</span>
              </div>
            )}
            <button className="btn-secondary" style={{ padding: '10px 20px' }} onClick={() => setWeatherRefreshKey((p) => p + 1)}>
              <RefreshCw size={14} strokeWidth={2} style={{ marginRight: '6px' }} /> YENİLE
            </button>
          </div>
        </div>

        {/* ═══ KONUM DURUMU ═══ */}
        <div className="panel" style={{ display: 'grid', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <IconBox icon={MapPin} color="var(--sprout)" />
            <div>
              <strong style={{ fontSize: '16px' }}>Seçili kapsam: {weatherScopeTarget}</strong>
              <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.45)' }}>
                Hava ve toprak sorgusu ilçe/mahalle kırılımıyla yenilenir.
              </div>
            </div>
          </div>
        </div>

        {/* ═══ CURRENT WEATHER (bento strip) ═══ */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '2px', background: 'rgba(143,188,69,0.1)', border: '1px solid rgba(143,188,69,0.15)', borderRadius: '16px', overflow: 'hidden' }}>
          {[
            { label: "Don Riski", value: frostSignal.hasRisk ? "KRİTİK" : "YOK", color: frostSignal.hasRisk ? '#E07070' : 'var(--sprout)', icon: Snowflake, iconColor: frostSignal.hasRisk ? '#E07070' : 'var(--sprout)', sub: frostSignal.hasRisk ? (frostSignal.detail || "Don bekleniyor") : null },
            { label: "Sıcaklık", value: `${weather?.temp || 0}°C`, icon: Thermometer, iconColor: 'var(--wheat)', sub: `Min ${weather?.tempMin ?? "-"}° / Max ${weather?.tempMax ?? "-"}°` },
            { label: "Nem", value: `%${weather?.humidity || 0}`, color: 'var(--sky)', icon: Droplets, iconColor: 'var(--sky)', sub: weather?.condition || "Stabil" },
            { label: "Rüzgar", value: `${weather?.windKmh || 0} km/s`, icon: Wind, iconColor: 'rgba(245,237,216,0.6)', sub: `Rafale: ${weather?.windGustKmh || 0} km/s` }
          ].map((item, idx) => (
            <div key={idx} className="bento-card" style={{ background: 'rgba(26,46,26,0.8)', border: 'none', borderRadius: 0, display: 'flex', alignItems: 'center', gap: '14px' }}>
              <IconBox icon={item.icon} color={item.iconColor} bg={`${item.iconColor}15`} glow={`${item.iconColor}10`} />
              <div>
                <span className="bento-head">{item.label}</span>
                <strong style={{ color: item.color || 'var(--cream)', display: 'block' }}>{item.value}</strong>
                {item.sub && <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.35)' }}>{item.sub}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* ═══ ALERTS ═══ */}
        <div id="climate-risk" className="panel" style={{ borderLeft: allAlerts.length > 0 ? '4px solid #E07070' : '4px solid var(--sprout)', background: allAlerts.length > 0 ? 'rgba(224,112,112,0.03)' : 'rgba(143,188,69,0.03)', scrollMarginTop: '110px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <IconBox icon={allAlerts.length > 0 ? AlertTriangle : CheckCircle2} color={allAlerts.length > 0 ? '#E07070' : 'var(--sprout)'} bg={allAlerts.length > 0 ? 'rgba(224,112,112,0.12)' : 'rgba(143,188,69,0.12)'} glow={allAlerts.length > 0 ? 'rgba(224,112,112,0.15)' : 'rgba(143,188,69,0.15)'} />
              <h3 className="section-title" style={{ fontSize: '24px', margin: 0 }}>Uyarı <em>Taraması</em></h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div className="pulse-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', background: allAlerts.length > 0 ? '#E07070' : 'var(--sprout)' }} />
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: '10px', color: allAlerts.length > 0 ? '#E07070' : 'var(--sprout)', fontWeight: 700 }}>
                {allAlerts.length > 0 ? `${allAlerts.length} UYARI` : "TEMİZ"}
              </span>
            </div>
          </div>
          {allAlerts.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {allAlerts.slice(0, 5).map((alert, idx) => (
                <div key={idx} className="list-item" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderRadius: '12px', background: alert.level === 'critical' || alert.level === 'danger' ? 'rgba(224,112,112,0.06)' : 'rgba(212,168,67,0.05)', border: `1px solid ${alert.level === 'critical' || alert.level === 'danger' ? 'rgba(224,112,112,0.15)' : 'rgba(212,168,67,0.12)'}` }}>
                  <div className="pulse-dot" style={{ width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0, background: alert.level === 'critical' || alert.level === 'danger' ? '#E07070' : 'var(--wheat)' }} />
                  <p style={{ fontSize: '13px', color: 'rgba(245,237,216,0.8)', lineHeight: 1.5, margin: 0 }}>{alert.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '24px', background: 'rgba(143,188,69,0.05)', borderRadius: '12px' }}>
              <IconBox icon={CheckCircle2} size={22} color="var(--sprout)" glow="rgba(143,188,69,0.2)" />
              <div>
                <p style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px' }}>Riskli hava olayı tespit edilmedi</p>
                <p style={{ fontSize: '12px', color: 'rgba(245,237,216,0.4)', margin: 0 }}>Tüm meteorolojik değerler güvenli aralıkta.</p>
              </div>
            </div>
          )}
        </div>

        {/* ═══ AGRO ADVISOR ═══ */}
        {agroClimateAdvisor && (
          <div className="panel" style={{ borderLeft: '4px solid var(--sprout)', background: 'rgba(143,188,69,0.03)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <IconBox icon={Leaf} color="var(--sprout)" glow="rgba(143,188,69,0.15)" />
              <h3 className="section-title" style={{ fontSize: '24px', margin: 0 }}>Tarım <em>Stratejisi</em></h3>
            </div>
            <p style={{ fontSize: '15px', lineHeight: 1.8, fontWeight: 300, color: 'rgba(245,237,216,0.8)', marginBottom: '24px' }}>{agroClimateAdvisor.summary}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {agroClimateAdvisor.actions.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'center', background: 'rgba(245,237,216,0.03)', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--sprout)', flexShrink: 0 }} />
                  <p style={{ fontSize: '13px', color: 'rgba(245,237,216,0.7)', margin: 0 }}>{item}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ HOURLY ═══ */}
        <div id="climate-soil" className="panel" style={{ scrollMarginTop: '110px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <IconBox icon={Gauge} color="var(--wheat)" bg="rgba(212,168,67,0.12)" />
            <h3 className="section-title" style={{ fontSize: '24px', margin: 0 }}>Saatlik <em>Analiz</em></h3>
          </div>
          <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '12px', scrollbarWidth: 'none' }}>
            {nextHours?.map((h, i) => (
              <div key={i} className="bento-card" style={{ minWidth: '120px', textAlign: 'center', padding: '20px 16px', transition: 'transform 0.2s, box-shadow 0.2s' }}>
                <span className="bento-head">{h.label || h.time}</span>
                <strong style={{ fontSize: '28px', margin: '8px 0', display: 'block', fontFamily: 'Playfair Display' }}>{h.temp ?? "—"}°</strong>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                  <Droplets size={13} color="var(--sky)" strokeWidth={2} />
                  <span style={{ fontSize: '11px', fontFamily: 'JetBrains Mono' }}>%{h.precipitationMm ?? 0}</span>
                </div>
                {h.windKmh != null && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
                    <Wind size={11} color="rgba(245,237,216,0.35)" strokeWidth={2} />
                    <span style={{ fontSize: '10px', color: 'rgba(245,237,216,0.35)', fontFamily: 'JetBrains Mono' }}>{h.windKmh}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ═══ SOIL & GEO ═══ */}
        <div className="panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <IconBox icon={Waves} color="var(--sky)" bg="rgba(127,179,213,0.12)" />
            <h3 className="section-title" style={{ fontSize: '24px', margin: 0 }}>Toprak & <em>Konum</em></h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '32px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label className="bento-head">Tarla Tanımı</label>
                <input className="select-premium" value={fieldLocation.name} onChange={e => setFieldLocation({ ...fieldLocation, name: e.target.value })} placeholder="Örn: Kuzey Elma Bahçesi" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <label className="bento-head">Koordinat Girişi</label>
                  <button onClick={useMyLocation} style={{ background: 'none', border: 'none', color: 'var(--sprout)', fontWeight: 700, fontSize: '11px', cursor: 'pointer', letterSpacing: '0.5px' }}>
                    <MapPin size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} /> KONUMUMU BUL
                  </button>
                </div>
                <input className="select-premium" value={fieldLocation.coords} onChange={e => setFieldLocation({ ...fieldLocation, coords: e.target.value })} placeholder="38.35, 38.30" />
              </div>

              {soilReport && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginTop: '4px' }}>
                  {[
                    { label: "pH Dengesi", value: soilInsights?.phLabel || soilReport.ph, color: 'var(--wheat)', bg: 'rgba(212,168,67,0.06)', border: 'rgba(212,168,67,0.1)' },
                    { label: "Toprak Tipi", value: soilReport.soilType, color: 'var(--cream)', bg: 'rgba(143,188,69,0.04)', border: 'rgba(143,188,69,0.1)' },
                    { label: "Organik Madde", value: (soilInsights?.organicLabel || soilReport.organic) || "-", color: 'var(--sky)', bg: 'rgba(127,179,213,0.06)', border: 'rgba(127,179,213,0.1)' },
                    { label: "Azot (N)", value: soilReport.nitrogen ?? "-", color: 'var(--cream)', bg: 'rgba(245,237,216,0.03)', border: 'rgba(245,237,216,0.06)' },
                    { label: "Kil / Kum", value: `${soilReport.clay ?? "-"} / ${soilReport.sand ?? "-"}`, color: 'var(--cream)', bg: 'rgba(245,237,216,0.03)', border: 'rgba(245,237,216,0.06)' },
                    { label: "Sağlık Skoru", value: `${soilDiagnostics?.score || soilReport.soilHealth?.score || 0}/100`, color: 'var(--sprout)', bg: 'rgba(143,188,69,0.06)', border: 'rgba(143,188,69,0.1)' }
                  ].map((m, i) => (
                    <div key={i} style={{ background: m.bg, padding: '14px', borderRadius: '12px', border: `1px solid ${m.border}` }}>
                      <span className="bento-head">{m.label}</span>
                      <p style={{ fontSize: typeof m.value === 'string' && m.value.length > 8 ? '13px' : '18px', fontWeight: 700, color: m.color, margin: '4px 0 0' }}>{m.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="upload-area" style={{ padding: 0, overflow: 'hidden', position: 'relative', minHeight: '320px' }}>
              <MapContainer
                center={soilMapCenter}
                zoom={resolvedCoords ? 13 : SOIL_MAP_PICKER.zoom}
                style={{ width: '100%', height: '100%' }}
              >
                <TileLayer
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={18}
                  attribution="Tiles © Esri"
                />
                {resolvedCoords ? (
                  <CircleMarker
                    center={[resolvedCoords.lat, resolvedCoords.lon]}
                    pathOptions={{ color: 'var(--sprout)', fillColor: 'var(--sprout)', fillOpacity: 0.45 }}
                    radius={10}
                  />
                ) : null}
              </MapContainer>
              <button
                type="button"
                onClick={selectSoilMapPoint}
                style={{
                  position: 'absolute',
                  inset: 'auto 16px 16px 16px',
                  borderRadius: '14px',
                  border: '1px solid rgba(143,188,69,0.25)',
                  background: 'rgba(7,14,10,0.78)',
                  color: 'var(--cream)',
                  padding: '12px 14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  backdropFilter: 'blur(10px)'
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 700 }}>
                  <MapIcon size={15} color="var(--sprout)" />
                  {resolvedCoords ? 'Seçili konum haritada işaretlendi' : 'Konum seçmek için harita panelini aç'}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--sprout)' }}>Paneli aç</span>
              </button>
            </div>
          </div>

          {/* Ekstra Toprak Analizleri */}
          {soilDiagnostics && (
            <div style={{ marginTop: '24px', background: 'rgba(143,188,69,0.03)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(143,188,69,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Activity size={18} color="var(--sprout)" />
                  <strong style={{ fontSize: '16px', color: 'var(--sprout)' }}>Toprak Kondisyonu</strong>
                </div>
                <div className="tech-badge" style={{ margin: 0 }}>Risk: {soilDiagnostics.risk}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <span className="bento-head">Bulgular</span>
                  <ul style={{ margin: '8px 0 0', paddingLeft: '20px', color: 'rgba(245,237,216,0.8)', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {soilDiagnostics.findings?.slice(0, 3).map((f, idx) => <li key={idx}>{f}</li>)}
                  </ul>
                </div>
                <div>
                  <span className="bento-head">Aksiyonlar</span>
                  <ul style={{ margin: '8px 0 0', paddingLeft: '20px', color: 'rgba(245,237,216,0.8)', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {soilDiagnostics.actions?.slice(0, 3).map((a, idx) => <li key={idx}>{a}</li>)}
                  </ul>
                </div>
              </div>
              {soilReport?.samplePoint?.distanceKm > 0 ? (
                <div style={{ marginTop: '14px', fontSize: '12px', color: 'rgba(245,237,216,0.7)' }}>
                  SoilGrids tam nokta yerine en yakin veri hucresinden okundu: {soilReport.samplePoint.distanceKm} km
                </div>
              ) : null}
            </div>
          )}

          {/* Toprak İndeks Kartları */}
          {soilIndexCards && soilIndexCards.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: '16px' }}>
              {soilIndexCards.map((card, idx) => (
                <div key={idx} className="bento-card" style={{ padding: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.5)', display: 'block' }}>{card.label}</span>
                    <strong style={{ fontSize: '14px', fontFamily: 'JetBrains Mono', color: card.goodHigh ? (card.value > 50 ? 'var(--sprout)' : '#E07070') : (card.value > 50 ? '#E07070' : 'var(--sprout)') }}>{card.value}</strong>
                  </div>
                  <div style={{ width: '100%', height: '4px', background: 'rgba(245,237,216,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${card.value}%`, height: '100%', background: card.goodHigh ? 'var(--sprout)' : '#E07070', transition: 'width 1s ease' }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Yönetim Planı */}
          {soilManagementPlan && soilManagementPlan.recommendations?.length > 0 && (
            <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(245,237,216,0.02)', borderRadius: '12px', border: '1px solid rgba(245,237,216,0.05)' }}>
              <span className="bento-head" style={{ marginBottom: '12px', display: 'block', color: 'var(--wheat)' }}>Detaylı Yönetim Planı</span>
              <ul style={{ margin: 0, paddingLeft: '20px', color: 'rgba(245,237,216,0.8)', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {soilManagementPlan.recommendations.map((rec, idx) => <li key={idx}>{rec}</li>)}
              </ul>
            </div>
          )}

          {/* Mahsul Uygunluğu */}
          {soilSuitability && soilSuitability.length > 0 && (
            <div style={{ marginTop: '24px' }}>
              <span className="bento-head" style={{ marginBottom: '12px', display: 'block' }}>Mahsul Uygunluk Listesi</span>
              <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px', scrollbarWidth: 'none' }}>
                {soilSuitability.map((item, idx) => (
                  <div key={idx} style={{ minWidth: '140px', padding: '12px', background: 'rgba(26,46,26,0.6)', borderRadius: '12px', border: '1px solid rgba(143,188,69,0.15)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <IconBox icon={Leaf} size={14} color="var(--sprout)" bg="rgba(143,188,69,0.1)" />
                    <div>
                      <strong style={{ fontSize: '14px', display: 'block' }}>{item.plant}</strong>
                      <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.5)' }}>% {Math.round(item.score)} Uyumlu</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div id="climate-irrigation" className="panel" style={{ background: 'linear-gradient(145deg, rgba(88,143,180,0.08), rgba(12,24,16,0.72))', borderTop: '2px solid rgba(88,143,180,0.24)', scrollMarginTop: '110px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
            <div>
              <div className="tech-badge" style={{ marginBottom: '8px' }}>ET0 + KC + HACKHATON</div>
              <h3 className="section-title" style={{ fontSize: '26px', margin: 0 }}>Sulama <em>takvimi</em></h3>
              <p style={{ margin: '8px 0 0', fontSize: '13px', color: 'rgba(245,237,216,0.68)', maxWidth: '760px', lineHeight: 1.6 }}>
                FAO-56 mantigi ile ETc hesaplanir, RAW esigi asildiginda sulama eventi onerilir. Referans kampanya Hackhaton sulama bundle dosyalarindan okunur.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {(irrigationCalendar?.assumptions || []).map((item) => (
                <span key={item.label} className="tech-badge" style={{ background: 'rgba(88,143,180,0.12)', color: 'var(--sky)' }}>
                  {item.label}: {item.value}
                </span>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '18px' }}>
            <label style={{ display: 'grid', gap: '6px' }}>
              <span className="bento-head">Urun</span>
              <select
                className="input"
                value={irrigationForm.crop}
                onChange={(e) => {
                  const nextCrop = e.target.value;
                  setIrrigationForm((prev) => ({
                    ...prev,
                    crop: nextCrop,
                    plantingDate: getDefaultIrrigationPlantingDate(nextCrop)
                  }));
                }}
              >
                {IRRIGATION_CROP_OPTIONS.map((item) => (
                  <option key={item.key} value={item.key}>{item.label}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: '6px' }}>
              <span className="bento-head">Dikim tarihi</span>
              <input
                className="input"
                type="date"
                value={irrigationForm.plantingDate}
                onChange={(e) => setIrrigationForm((prev) => ({ ...prev, plantingDate: e.target.value }))}
              />
            </label>
            <label style={{ display: 'grid', gap: '6px' }}>
              <span className="bento-head">Alan (ha)</span>
              <input
                className="input"
                type="number"
                min="0.1"
                step="0.1"
                value={irrigationForm.areaHa}
                onChange={(e) => setIrrigationForm((prev) => ({ ...prev, areaHa: e.target.value }))}
              />
            </label>
            <label style={{ display: 'grid', gap: '6px' }}>
              <span className="bento-head">Yontem</span>
              <select
                className="input"
                value={irrigationForm.method}
                onChange={(e) => {
                  const nextMethod = e.target.value;
                  const methodMeta = IRRIGATION_METHOD_OPTIONS.find((item) => item.key === nextMethod);
                  setIrrigationForm((prev) => ({
                    ...prev,
                    method: nextMethod,
                    efficiency: methodMeta ? String(methodMeta.efficiency.toFixed(2)) : prev.efficiency
                  }));
                }}
              >
                {IRRIGATION_METHOD_OPTIONS.map((item) => (
                  <option key={item.key} value={item.key}>{item.label}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: '6px' }}>
              <span className="bento-head">Su kaynagi</span>
              <select
                className="input"
                value={irrigationForm.waterSource}
                onChange={(e) => setIrrigationForm((prev) => ({ ...prev, waterSource: e.target.value }))}
              >
                {IRRIGATION_WATER_SOURCE_OPTIONS.map((item) => (
                  <option key={item.key} value={item.key}>{item.label}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: '6px' }}>
              <span className="bento-head">Verim</span>
              <input
                className="input"
                type="number"
                min="0.35"
                max="0.98"
                step="0.01"
                value={irrigationForm.efficiency}
                onChange={(e) => setIrrigationForm((prev) => ({ ...prev, efficiency: e.target.value }))}
              />
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {(irrigationCalendar?.researchRefs || []).map((item) => (
                <a
                  key={item.id}
                  className="tech-badge"
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ background: 'rgba(143,188,69,0.1)', color: 'var(--sprout)', textDecoration: 'none' }}
                >
                  {item.title}
                </a>
              ))}
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setIrrigationRequest({ ...irrigationForm })}
            >
              <Calendar size={14} />
              Takvimi yenile
            </button>
          </div>

          {irrigationError ? (
            <div style={{ marginBottom: '14px', fontSize: '12px', color: '#f0c26d', background: 'rgba(240,194,109,0.08)', border: '1px solid rgba(240,194,109,0.18)', borderRadius: '12px', padding: '10px 12px' }}>
              {irrigationError}
            </div>
          ) : null}

          {irrigationLoading ? (
            <div className="bento-card" style={{ padding: '18px', background: 'rgba(255,255,255,0.03)' }}>
              Sulama takvimi hesaplanıyor...
            </div>
          ) : null}

          {irrigationCalendar ? (
            <div style={{ display: 'grid', gap: '18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
                {[
                  { label: 'Kampanya', value: irrigationSummary?.campaignStatus || '-', detail: `Gun ${irrigationSummary?.campaignDay ?? '-'}` },
                  { label: 'Sıradaki sulama', value: irrigationSummary?.nextIrrigationDate || 'Takip et', detail: irrigationSummary?.nextIrrigationGrossMm ? `${irrigationSummary.nextIrrigationGrossMm} mm brut` : 'Esik asilmadi' },
                  { label: 'Sezon ETC', value: `${irrigationSummary?.horizonEtcMm ?? 0} mm`, detail: `${irrigationSummary?.horizonEffectiveRainMm ?? 0} mm etkin yağış` },
                  {
                    label: 'Horizon',
                    value: `${irrigationSummary?.horizonDays ?? 0} gun`,
                    detail: `${irrigationSummary?.forecastDays ?? 0} gun tahmin • ${irrigationSummary?.normalDays ?? 0} gun normal`
                  },
                  { label: 'Event sayisi', value: irrigationSummary?.irrigationEventCount ?? 0, detail: `${irrigationSummary?.horizonGrossMm ?? 0} mm brut toplam` },
                  { label: 'Toprak tamponu', value: `${irrigationCalendar?.soilProfile?.rawMm ?? 0} mm`, detail: `${irrigationCalendar?.soilProfile?.label || '-'} • TAW ${irrigationCalendar?.soilProfile?.tawMm ?? 0} mm` },
                  { label: 'Veri kalitesi', value: irrigationQualityLabel, detail: `${irrigationQualityDetail} • ET0 ${irrigationEt0Source}` },
                  {
                    label: 'Su kaynagi',
                    value: irrigationWaterSource?.label || '-',
                    detail: irrigationWaterSupplyAdvisor?.mode || 'normal'
                  }
                ].map((item) => (
                  <div key={item.label} className="bento-card" style={{ padding: '14px', background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ fontSize: '11px', opacity: 0.52, fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.7px' }}>{item.label}</div>
                    <strong style={{ display: 'block', marginTop: '8px', fontSize: '21px', color: 'var(--cream)' }}>{item.value}</strong>
                    <div style={{ marginTop: '8px', fontSize: '12px', color: 'rgba(245,237,216,0.62)', lineHeight: 1.45 }}>{item.detail}</div>
                  </div>
                ))}
              </div>

              {(irrigationAlertBundle || irrigationPriorityBoard.length > 0 || irrigationTaskDrafts.length > 0) ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 0.95fr) minmax(0, 1.05fr)', gap: '16px' }}>
                  <div className="bento-card" style={{ padding: '16px', background: irrigationAlertBundle?.level === 'high' ? 'linear-gradient(145deg, rgba(224,112,112,0.1), rgba(12,24,16,0.68))' : irrigationAlertBundle?.level === 'elevated' ? 'linear-gradient(145deg, rgba(212,168,67,0.1), rgba(12,24,16,0.68))' : 'linear-gradient(145deg, rgba(88,143,180,0.1), rgba(12,24,16,0.68))', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <div>
                        <div className="tech-badge" style={{ marginBottom: '8px', background: 'rgba(255,255,255,0.08)', color: 'var(--cream)' }}>SULAMA ALARM RAYI</div>
                        <strong style={{ display: 'block', fontSize: '20px' }}>{irrigationAlertBundle?.headline || 'Sulama alarm durumu'}</strong>
                        {Array.isArray(irrigationAlertBundle?.actions) && irrigationAlertBundle.actions.length ? (
                          <div style={{ marginTop: '8px', display: 'grid', gap: '6px' }}>
                            {irrigationAlertBundle.actions.slice(0, 3).map((item) => (
                              <div key={item} style={{ fontSize: '12px', color: 'rgba(245,237,216,0.68)', lineHeight: 1.5 }}>• {item}</div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <span className="tech-badge" style={{ background: 'rgba(255,255,255,0.08)', color: irrigationAlertBundle?.level === 'high' ? '#f5a0a0' : irrigationAlertBundle?.level === 'elevated' ? 'var(--wheat)' : 'var(--sky)' }}>
                        {irrigationAlertBundle?.level || 'normal'}
                      </span>
                    </div>

                    {irrigationAlertCards.length > 0 ? (
                      <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
                        {irrigationAlertCards.map((item) => (
                          <div key={item.id} style={{ padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)' }}>
                            <div style={{ fontSize: '10px', color: 'rgba(245,237,216,0.45)' }}>{item.label}</div>
                            <strong style={{ display: 'block', marginTop: '6px', fontSize: '15px' }}>{item.value}</strong>
                            <div style={{ marginTop: '4px', fontSize: '11px', color: 'rgba(245,237,216,0.58)', lineHeight: 1.4 }}>{item.detail}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div style={{ marginTop: '14px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <button type="button" className="primary" onClick={exportIrrigationTasksToCalendar}>
                        <Calendar size={15} /> Takvime aktar
                      </button>
                      <button type="button" className="ghost" onClick={pushIrrigationAlertsToCenter}>
                        <Bell size={15} /> Bildirim merkezine ekle
                      </button>
                    </div>
                    {irrigationOpsStatus ? (
                      <div style={{ marginTop: '10px', fontSize: '12px', color: 'rgba(245,237,216,0.62)' }}>{irrigationOpsStatus}</div>
                    ) : null}
                  </div>

                  <div style={{ display: 'grid', gap: '12px' }}>
                    {irrigationPriorityBoard.length > 0 ? (
                      <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                        <strong style={{ display: 'block', marginBottom: '10px', fontSize: '16px' }}>Operasyon oncelikleri</strong>
                        <div style={{ display: 'grid', gap: '8px' }}>
                          {irrigationPriorityBoard.map((item) => (
                            <div key={item.id} style={{ padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: item.level === 'high' ? 'rgba(224,112,112,0.08)' : item.level === 'elevated' ? 'rgba(212,168,67,0.08)' : 'rgba(88,143,180,0.08)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                                <strong style={{ fontSize: '12px' }}>{item.title}</strong>
                                <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.75)' }}>{item.metric}</span>
                              </div>
                              <div style={{ marginTop: '5px', fontSize: '11px', color: 'rgba(245,237,216,0.58)', lineHeight: 1.45 }}>{item.detail}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {irrigationTaskDrafts.length > 0 ? (
                      <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                        <strong style={{ display: 'block', marginBottom: '10px', fontSize: '16px' }}>72 saatlik görev taslağı</strong>
                        <div style={{ display: 'grid', gap: '8px' }}>
                          {irrigationTaskDrafts.map((task) => (
                            <div key={task.id} style={{ padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                                <strong style={{ fontSize: '12px' }}>{task.title}</strong>
                                <span className="tech-badge" style={{ background: 'rgba(88,143,180,0.12)', color: 'var(--sky)' }}>{task.lane}</span>
                              </div>
                              <div style={{ marginTop: '5px', fontSize: '11px', color: 'rgba(245,237,216,0.58)', lineHeight: 1.45 }}>{task.detail}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {irrigationAgrobotGuide ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 0.9fr) minmax(0, 1.1fr)', gap: '16px' }}>
                  <div className="bento-card" style={{ padding: '16px', background: 'linear-gradient(145deg, rgba(143,188,69,0.1), rgba(12,24,16,0.62))', border: '1px solid rgba(143,188,69,0.18)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <div>
                        <div className="tech-badge" style={{ background: 'rgba(143,188,69,0.14)', color: 'var(--sprout)', marginBottom: '8px' }}>AGROBOT PILOT</div>
                        <strong style={{ display: 'block', fontSize: '20px' }}>{irrigationAgrobotGuide.mode?.title || 'Sulama cockpit'}</strong>
                        <div style={{ marginTop: '8px', fontSize: '13px', color: 'rgba(245,237,216,0.72)', lineHeight: 1.6 }}>
                          {irrigationAgrobotGuide.mode?.summary || 'Sulama, norm ve risk penceresi birlikte okunur.'}
                        </div>
                      </div>
                      <span className="tech-badge" style={{ background: 'rgba(88,143,180,0.12)', color: 'var(--sky)' }}>
                        {irrigationAgrobotGuide.mode?.tone || 'normal'}
                      </span>
                    </div>
                    <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
                      <div style={{ padding: '10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ fontSize: '10px', opacity: 0.5 }}>14 gun brut</div>
                        <strong style={{ display: 'block', marginTop: '6px', fontSize: '16px' }}>{irrigationAgrobotGuide.waterBudget?.horizonGrossMm ?? 0} mm</strong>
                        <div style={{ marginTop: '4px', fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>{irrigationAgrobotGuide.waterBudget?.horizonGrossM3 ?? 0} m3</div>
                      </div>
                      <div style={{ padding: '10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ fontSize: '10px', opacity: 0.5 }}>Sonraki event</div>
                        <strong style={{ display: 'block', marginTop: '6px', fontSize: '16px' }}>{irrigationAgrobotGuide.waterBudget?.nextEventGrossMm ?? 0} mm</strong>
                        <div style={{ marginTop: '4px', fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>{irrigationAgrobotGuide.waterBudget?.nextEventGrossM3 ?? 0} m3</div>
                      </div>
                      <div style={{ padding: '10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ fontSize: '10px', opacity: 0.5 }}>RAW tamponu</div>
                        <strong style={{ display: 'block', marginTop: '6px', fontSize: '16px' }}>{irrigationAgrobotGuide.waterBudget?.rawMm ?? 0} mm</strong>
                        <div style={{ marginTop: '4px', fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>Kok bolgesi alarm esigi</div>
                      </div>
                      <div style={{ padding: '10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ fontSize: '10px', opacity: 0.5 }}>Senaryo spread</div>
                        <strong style={{ display: 'block', marginTop: '6px', fontSize: '16px' }}>
                          {irrigationAgrobotGuide.seasonalSpreadMm == null ? '-' : `${irrigationAgrobotGuide.seasonalSpreadMm} mm`}
                        </strong>
                        <div style={{ marginTop: '4px', fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>
                          {irrigationAgrobotGuide.seasonalSpreadM3 == null ? 'Kuru/nemli yıl farki' : `${irrigationAgrobotGuide.seasonalSpreadM3} m3`}
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: '14px', display: 'grid', gap: '8px' }}>
                      {(irrigationAgrobotGuide.watchItems || []).map((item) => (
                        <div key={item} style={{ padding: '10px 12px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', fontSize: '12px', color: 'rgba(245,237,216,0.68)', lineHeight: 1.5 }}>
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: '12px' }}>
                    <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
                        <div>
                          <strong style={{ display: 'block', marginBottom: '8px', fontSize: '15px' }}>En iyi pencereler</strong>
                          <div style={{ display: 'grid', gap: '8px' }}>
                            {(irrigationAgrobotGuide.bestWindows || []).map((item) => (
                              <div key={`${item.date}-${item.level}`} style={{ padding: '10px', borderRadius: '12px', border: '1px solid rgba(143,188,69,0.18)', background: 'rgba(143,188,69,0.08)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                  <div style={{ fontSize: '12px', fontWeight: 700 }}>{item.date}</div>
                                  <div style={{ fontSize: '11px', color: 'var(--sprout)' }}>{item.score}/100</div>
                                </div>
                                <div style={{ marginTop: '6px', fontSize: '11px', color: 'rgba(245,237,216,0.58)' }}>
                                  {item.window} • {item.stage} • {item.detail}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <strong style={{ display: 'block', marginBottom: '8px', fontSize: '15px' }}>Kacinilacak gunler</strong>
                          <div style={{ display: 'grid', gap: '8px' }}>
                            {(irrigationAgrobotGuide.avoidWindows || []).map((item) => (
                              <div key={`${item.date}-${item.level}`} style={{ padding: '10px', borderRadius: '12px', border: '1px solid rgba(224,112,112,0.18)', background: 'rgba(224,112,112,0.08)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                  <div style={{ fontSize: '12px', fontWeight: 700 }}>{item.date}</div>
                                  <div style={{ fontSize: '11px', color: '#f5a0a0' }}>{item.score}/100</div>
                                </div>
                                <div style={{ marginTop: '6px', fontSize: '11px', color: 'rgba(245,237,216,0.58)' }}>
                                  {item.tempBand} • {item.detail}
                                </div>
                              </div>
                            ))}
                            {!irrigationAgrobotGuide.avoidWindows?.length ? (
                              <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.58)' }}>Kritik kacın penceresi gorunmuyor.</div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
                        <div>
                          <strong style={{ display: 'block', marginBottom: '8px', fontSize: '15px' }}>Bugun yap</strong>
                          <div style={{ display: 'grid', gap: '8px' }}>
                            {(irrigationAgrobotGuide.todayActions || []).map((item) => (
                              <div key={item} style={{ padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', fontSize: '12px', color: 'rgba(245,237,216,0.68)', lineHeight: 1.5 }}>
                                {item}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <strong style={{ display: 'block', marginBottom: '8px', fontSize: '15px' }}>Bu hafta</strong>
                          <div style={{ display: 'grid', gap: '8px' }}>
                            {(irrigationAgrobotGuide.weekActions || []).map((item) => (
                              <div key={item} style={{ padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', fontSize: '12px', color: 'rgba(245,237,216,0.68)', lineHeight: 1.5 }}>
                                {item}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {irrigationWaterSupplyAdvisor ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 0.95fr) minmax(0, 1.05fr)', gap: '16px' }}>
                  <div className="bento-card" style={{ padding: '16px', background: 'linear-gradient(145deg, rgba(212,168,67,0.1), rgba(12,24,16,0.66))', border: '1px solid rgba(212,168,67,0.18)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <div>
                        <div className="tech-badge" style={{ marginBottom: '8px', background: 'rgba(212,168,67,0.14)', color: 'var(--wheat)' }}>SU KAYNAGI KOKPITI</div>
                        <strong style={{ display: 'block', fontSize: '20px' }}>{irrigationWaterSource?.label || 'Kaynak'}</strong>
                        <div style={{ marginTop: '8px', fontSize: '13px', color: 'rgba(245,237,216,0.72)', lineHeight: 1.6 }}>
                          {irrigationWaterSupplyAdvisor.headline}
                        </div>
                        <div style={{ marginTop: '8px', fontSize: '12px', color: 'rgba(245,237,216,0.58)', lineHeight: 1.55 }}>
                          {irrigationWaterSupplyAdvisor.detail}
                        </div>
                      </div>
                      <span className="tech-badge" style={{ background: 'rgba(88,143,180,0.12)', color: 'var(--sky)' }}>
                        {irrigationWaterSupplyAdvisor.mode}
                      </span>
                    </div>

                    <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
                      <div style={{ padding: '10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ fontSize: '10px', opacity: 0.5 }}>Event kisiti</div>
                        <strong style={{ display: 'block', marginTop: '6px', fontSize: '16px' }}>%{irrigationWaterSupplyAdvisor.reductionPct ?? 0}</strong>
                        <div style={{ marginTop: '4px', fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>Önerilen brut azaltim</div>
                      </div>
                      <div style={{ padding: '10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ fontSize: '10px', opacity: 0.5 }}>Haftalik guvenli tavan</div>
                        <strong style={{ display: 'block', marginTop: '6px', fontSize: '16px' }}>{irrigationWaterSupplyAdvisor.weeklyCapM3 ?? 0} m3</strong>
                        <div style={{ marginTop: '4px', fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>İlk hafta ayarlanmis tahsis</div>
                      </div>
                      <div style={{ padding: '10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ fontSize: '10px', opacity: 0.5 }}>Sonraki event tavani</div>
                        <strong style={{ display: 'block', marginTop: '6px', fontSize: '16px' }}>{irrigationWaterSupplyAdvisor.nextEventCapM3 ?? 0} m3</strong>
                        <div style={{ marginTop: '4px', fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>Kaynak moduna göre düzeltilmiş</div>
                      </div>
                      <div style={{ padding: '10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ fontSize: '10px', opacity: 0.5 }}>Gece vardiyasi payi</div>
                        <strong style={{ display: 'block', marginTop: '6px', fontSize: '16px' }}>%{irrigationWaterSupplyAdvisor.recommendedNightSharePct ?? 70}</strong>
                        <div style={{ marginTop: '4px', fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>Buharlasma kaybini kismak icin</div>
                      </div>
                    </div>

                    <div style={{ marginTop: '14px', display: 'grid', gap: '8px' }}>
                      {irrigationSupplyTriggers.map((item) => (
                        <div key={item} style={{ padding: '10px 12px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', fontSize: '12px', color: 'rgba(245,237,216,0.66)', lineHeight: 1.5 }}>
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: '12px' }}>
                    <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                      <strong style={{ display: 'block', marginBottom: '10px', fontSize: '16px' }}>Blok bazli tahsis</strong>
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {irrigationSupplyZonePlan.map((item) => (
                          <div key={item.id} style={{ padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                              <strong style={{ fontSize: '12px' }}>{item.label}</strong>
                              <span className="tech-badge" style={{ background: 'rgba(143,188,69,0.12)', color: 'var(--sprout)' }}>{item.suggestedGrossM3} m3</span>
                            </div>
                            <div style={{ marginTop: '6px', fontSize: '11px', color: 'rgba(245,237,216,0.58)', lineHeight: 1.45 }}>
                              Pay {item.sharePct}% • deficit %{item.deficitPct} • {item.note}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                      <strong style={{ display: 'block', marginBottom: '10px', fontSize: '16px' }}>Event duzeltmeleri</strong>
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {irrigationSupplyEventAdjustments.map((item) => (
                          <div key={item.id} style={{ padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                              <strong style={{ fontSize: '12px' }}>{item.date} • {item.stage}</strong>
                              <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.6)' }}>%{item.reductionPct}</span>
                            </div>
                            <div style={{ marginTop: '6px', fontSize: '11px', color: 'rgba(245,237,216,0.58)' }}>
                              {item.baseGrossMm} mm / {item.baseGrossM3} m3 -> {item.adjustedGrossMm} mm / {item.adjustedGrossM3} m3
                            </div>
                            <div style={{ marginTop: '4px', fontSize: '11px', color: 'rgba(245,237,216,0.52)' }}>{item.note}</div>
                          </div>
                        ))}
                        {!irrigationSupplyEventAdjustments.length ? (
                          <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.58)' }}>Ayarlanacak yakin event yok.</div>
                        ) : null}
                      </div>
                    </div>

                    <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                      <strong style={{ display: 'block', marginBottom: '10px', fontSize: '16px' }}>Haftalik tahsis</strong>
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {irrigationSupplyWeeklyAllocation.map((item) => (
                          <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '88px minmax(0, 1fr) 84px', gap: '10px', alignItems: 'center' }}>
                            <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.62)' }}>{item.weekLabel}</div>
                            <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.58)' }}>
                              {item.baseGrossM3} m3 -> {item.adjustedGrossM3} m3 • {item.eventCount} event
                            </div>
                            <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>{item.adjustedGrossMm} mm</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {hourlyEvapoCommand ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.05fr) minmax(320px, 0.95fr)', gap: '16px' }}>
                  <div className="bento-card" style={{ padding: '16px', background: 'linear-gradient(145deg, rgba(88,143,180,0.08), rgba(12,24,16,0.66))', border: '1px solid rgba(88,143,180,0.18)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '12px' }}>
                      <div>
                        <div className="tech-badge" style={{ marginBottom: '8px', background: 'rgba(88,143,180,0.14)', color: 'var(--sky)' }}>SAATLIK ET KOMUTASI</div>
                        <strong style={{ display: 'block', fontSize: '20px' }}>Gun ici evaporasyon penceresi</strong>
                        <div style={{ marginTop: '8px', fontSize: '13px', color: 'rgba(245,237,216,0.72)', lineHeight: 1.6 }}>
                          Saatlik sıcaklık, nem, rüzgar ve radyasyon birlikte okunur. Amaç günün en düşük kayıplı sulama slotunu bulmak.
                        </div>
                      </div>
                      <span className="tech-badge" style={{ background: 'rgba(212,168,67,0.14)', color: 'var(--wheat)' }}>
                        shift gain {hourlyEvapoCommand.summary?.shiftGainPct == null ? '-' : `%${hourlyEvapoCommand.summary.shiftGainPct}`}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px', marginBottom: '12px' }}>
                      <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: '10px', opacity: 0.5 }}>En iyi pencere</div>
                        <strong style={{ display: 'block', marginTop: '6px', fontSize: '15px' }}>{hourlyEvapoCommand.summary?.bestWindowLabel || '-'}</strong>
                        <div style={{ marginTop: '4px', fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>skor {hourlyEvapoCommand.summary?.bestWindowScore ?? 0}</div>
                      </div>
                      <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: '10px', opacity: 0.5 }}>Kacin pencere</div>
                        <strong style={{ display: 'block', marginTop: '6px', fontSize: '15px' }}>{hourlyEvapoCommand.summary?.worstWindowLabel || '-'}</strong>
                        <div style={{ marginTop: '4px', fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>skor {hourlyEvapoCommand.summary?.worstWindowScore ?? 0}</div>
                      </div>
                      <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: '10px', opacity: 0.5 }}>Ogle kaybi</div>
                        <strong style={{ display: 'block', marginTop: '6px', fontSize: '15px' }}>{hourlyEvapoCommand.summary?.middayLossPct == null ? '-' : `%${hourlyEvapoCommand.summary.middayLossPct}`}</strong>
                        <div style={{ marginTop: '4px', fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>Yönteme göre tahmini</div>
                      </div>
                      <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: '10px', opacity: 0.5 }}>En iyi kayıp</div>
                        <strong style={{ display: 'block', marginTop: '6px', fontSize: '15px' }}>{hourlyEvapoCommand.summary?.bestLossPct == null ? '-' : `%${hourlyEvapoCommand.summary.bestLossPct}`}</strong>
                        <div style={{ marginTop: '4px', fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>Slot kayıp tahmini</div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
                      <div>
                        <strong style={{ display: 'block', marginBottom: '8px', fontSize: '15px' }}>En iyi slotlar</strong>
                        <div style={{ display: 'grid', gap: '8px' }}>
                          {hourlyEvapoBestWindows.map((item) => (
                            <div key={item.id} style={{ padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(143,188,69,0.18)', background: 'rgba(143,188,69,0.08)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                                <strong style={{ fontSize: '12px' }}>{item.date} • {item.daypart}</strong>
                                <span style={{ fontSize: '11px', color: 'var(--sprout)' }}>{item.pressureScore}/100</span>
                              </div>
                              <div style={{ marginTop: '6px', fontSize: '11px', color: 'rgba(245,237,216,0.58)' }}>
                                {item.window} • kayıp %{item.methodLossPct} • VPD {item.meanVpdKpa} • rüzgar {item.meanWindKmh} km/h
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <strong style={{ display: 'block', marginBottom: '8px', fontSize: '15px' }}>Kacin slotlar</strong>
                        <div style={{ display: 'grid', gap: '8px' }}>
                          {hourlyEvapoAvoidWindows.map((item) => (
                            <div key={item.id} style={{ padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(224,112,112,0.18)', background: 'rgba(224,112,112,0.08)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                                <strong style={{ fontSize: '12px' }}>{item.date} • {item.daypart}</strong>
                                <span style={{ fontSize: '11px', color: '#f5a0a0' }}>{item.pressureScore}/100</span>
                              </div>
                              <div style={{ marginTop: '6px', fontSize: '11px', color: 'rgba(245,237,216,0.58)' }}>
                                {item.window} • kayıp %{item.methodLossPct} • sıc. {item.meanTempC} C • radyasyon {item.precipTotalMm > 0 ? `${item.precipTotalMm} mm yağış` : `${item.meanWindKmh} km/s rüzgar`}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: '12px' }}>
                    <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                      <strong style={{ display: 'block', marginBottom: '10px', fontSize: '16px' }}>Peak saatler</strong>
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {hourlyEvapoTopHours.map((item) => (
                          <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '94px minmax(0, 1fr) 64px', gap: '10px', alignItems: 'center', padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                            <div>
                              <div style={{ fontSize: '12px', fontWeight: 700 }}>{item.date}</div>
                              <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>{item.time}</div>
                            </div>
                            <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.6)' }}>
                              skor {item.pressureScore} • kayıp %{item.methodLossPct} • VPD {item.vpdKpa ?? '-'} • {item.tempC ?? '-'} C • {item.windKmh ?? '-'} km/h
                            </div>
                            <div style={{ fontSize: '11px', color: '#f5a0a0', textAlign: 'right' }}>peak</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {et0ResearchPack ? (
                <div style={{ display: 'grid', gap: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.05fr) minmax(320px, 0.95fr)', gap: '16px' }}>
                    <div className="bento-card" style={{ padding: '16px', background: 'linear-gradient(145deg, rgba(212,168,67,0.08), rgba(12,24,16,0.68))', border: '1px solid rgba(212,168,67,0.18)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '12px' }}>
                        <div>
                          <div className="tech-badge" style={{ marginBottom: '8px', background: 'rgba(212,168,67,0.14)', color: 'var(--wheat)' }}>ET0 SUNUM PAKETI</div>
                          <strong style={{ display: 'block', fontSize: '20px' }}>{et0ResearchPack.title}</strong>
                          <div style={{ marginTop: '8px', fontSize: '13px', color: 'rgba(245,237,216,0.72)', lineHeight: 1.6 }}>
                            `/Users/yasinkaya/Downloads/ET0_Analizi_v5.pptx` icindeki ana cikarimlar sulama motoruna baglandi.
                          </div>
                        </div>
                        <span className="tech-badge" style={{ background: 'rgba(88,143,180,0.12)', color: 'var(--sky)' }}>
                          FAO-56 + trend + saatlik firsat
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
                        {(et0ResearchPack.cards || []).map((item) => (
                          <div key={item.id} style={{ padding: '12px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ fontSize: '10px', opacity: 0.5 }}>{item.label}</div>
                            <strong style={{ display: 'block', marginTop: '6px', fontSize: '16px' }}>{item.value}</strong>
                            <div style={{ marginTop: '6px', fontSize: '11px', color: 'rgba(245,237,216,0.58)', lineHeight: 1.45 }}>{item.detail}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
                        <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <strong style={{ display: 'block', marginBottom: '8px', fontSize: '15px' }}>Formul notlari</strong>
                          <div style={{ display: 'grid', gap: '6px' }}>
                            {(et0ResearchPack.formulaNotes || []).map((item) => (
                              <div key={item} style={{ fontSize: '12px', color: 'rgba(245,237,216,0.66)', lineHeight: 1.5 }}>
                                • {item}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <strong style={{ display: 'block', marginBottom: '8px', fontSize: '15px' }}>Saatlik firsat</strong>
                          <div style={{ display: 'grid', gap: '6px' }}>
                            {(et0ResearchPack.hourlyOpportunity || []).map((item) => (
                              <div key={item} style={{ fontSize: '12px', color: 'rgba(245,237,216,0.66)', lineHeight: 1.5 }}>
                                • {item}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gap: '12px' }}>
                      <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                        <strong style={{ display: 'block', marginBottom: '10px', fontSize: '16px' }}>Sulama uygulamasi</strong>
                        <div style={{ display: 'grid', gap: '8px' }}>
                          {(et0ResearchPack.irrigationApplications || []).map((item) => (
                            <div key={item} style={{ padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', fontSize: '12px', color: 'rgba(245,237,216,0.66)', lineHeight: 1.5 }}>
                              {item}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                        <strong style={{ display: 'block', marginBottom: '10px', fontSize: '16px' }}>Baraj / su butcesi baglantisi</strong>
                        <div style={{ display: 'grid', gap: '8px' }}>
                          {(et0ResearchPack.reservoirApplications || []).map((item) => (
                            <div key={item} style={{ padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', fontSize: '12px', color: 'rgba(245,237,216,0.66)', lineHeight: 1.5 }}>
                              {item}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                        <strong style={{ display: 'block', marginBottom: '10px', fontSize: '16px' }}>Sunumdan kullanilan slaytlar</strong>
                        <div style={{ display: 'grid', gap: '8px' }}>
                          {(et0ResearchPack.slideHighlights || []).map((item) => (
                            <div key={item.id} style={{ padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                              <div style={{ fontSize: '12px', fontWeight: 700 }}>{item.title}</div>
                              <div style={{ marginTop: '4px', fontSize: '11px', color: 'rgba(245,237,216,0.58)' }}>{item.note}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {(et0TrendSnapshot.length > 0 || et0DecisionHooks.length > 0 || et0SeasonalProfile.length > 0 || et0ScenarioComparison.length > 0 || et0ReservoirCards.length > 0) ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(320px, 0.9fr)', gap: '16px' }}>
                      <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: '16px' }}>Sezonsal ET0 profili</strong>
                          <span className="tech-badge" style={{ background: 'rgba(212,168,67,0.12)', color: 'var(--wheat)' }}>
                            deck -> climatology
                          </span>
                        </div>
                        <div style={{ display: 'grid', gap: '8px' }}>
                          {et0SeasonalProfile.map((item) => {
                            const et0Height = Math.max(12, Math.min(100, (Number(item.et0TotalMm || 0) / 160) * 100));
                            const rainHeight = Math.max(8, Math.min(100, (Number(item.precipTotalMm || 0) / 160) * 100));
                            return (
                              <div key={item.month} style={{ display: 'grid', gridTemplateColumns: '46px 1fr auto', gap: '10px', alignItems: 'center' }}>
                                <div style={{ fontSize: '12px', fontWeight: 700 }}>{item.label}</div>
                                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '44px' }}>
                                  <div style={{ width: '50%', minWidth: '32px', height: `${et0Height}%`, borderRadius: '10px', background: 'linear-gradient(180deg, rgba(212,168,67,0.95), rgba(212,168,67,0.25))' }} />
                                  <div style={{ width: '50%', minWidth: '32px', height: `${rainHeight}%`, borderRadius: '10px', background: 'linear-gradient(180deg, rgba(88,143,180,0.95), rgba(88,143,180,0.24))' }} />
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.54)' }}>ET0 {item.et0TotalMm} mm</div>
                                  <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.54)' }}>açık {item.deficitMm} mm</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gap: '12px' }}>
                        {et0TrendSnapshot.length > 0 ? (
                          <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                            <strong style={{ display: 'block', marginBottom: '10px', fontSize: '16px' }}>Trend snapshot</strong>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '8px' }}>
                              {et0TrendSnapshot.map((item) => (
                                <div key={item.id} style={{ padding: '10px 12px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                  <div style={{ fontSize: '10px', color: 'rgba(245,237,216,0.45)' }}>{item.label}</div>
                                  <strong style={{ display: 'block', marginTop: '6px', fontSize: '15px' }}>{item.value}</strong>
                                  <div style={{ marginTop: '4px', fontSize: '11px', color: 'rgba(245,237,216,0.58)', lineHeight: 1.45 }}>{item.detail}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {et0DecisionHooks.length > 0 ? (
                          <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                            <strong style={{ display: 'block', marginBottom: '10px', fontSize: '16px' }}>ET0 karar ciktisi</strong>
                            <div style={{ display: 'grid', gap: '8px' }}>
                              {et0DecisionHooks.map((item) => (
                                <div key={item.id} style={{ padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: item.tone === 'risk' ? 'rgba(224,112,112,0.08)' : item.tone === 'watch' ? 'rgba(212,168,67,0.08)' : 'rgba(143,188,69,0.08)' }}>
                                  <div style={{ fontSize: '12px', fontWeight: 700 }}>{item.title}</div>
                                  <div style={{ marginTop: '4px', fontSize: '11px', color: 'rgba(245,237,216,0.6)', lineHeight: 1.5 }}>{item.detail}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {et0ScenarioComparison.length > 0 ? (
                          <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                            <strong style={{ display: 'block', marginBottom: '10px', fontSize: '16px' }}>Kuru / normal / nemli yil</strong>
                            <div style={{ display: 'grid', gap: '8px' }}>
                              {et0ScenarioComparison.map((item) => (
                                <div key={item.key} style={{ padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                                    <strong style={{ fontSize: '12px' }}>{item.label}</strong>
                                    <span style={{ fontSize: '11px', color: item.deltaFromNormalM3 > 0 ? '#f2b97b' : item.deltaFromNormalM3 < 0 ? '#7fd3ff' : 'rgba(245,237,216,0.7)' }}>
                                      {item.deltaFromNormalM3 > 0 ? '+' : ''}{item.deltaFromNormalM3} m3
                                    </span>
                                  </div>
                                  <div style={{ marginTop: '4px', fontSize: '11px', color: 'rgba(245,237,216,0.58)' }}>{item.note}</div>
                                  <div style={{ marginTop: '6px', fontSize: '11px', color: 'rgba(245,237,216,0.58)' }}>
                                    sezon {item.seasonGrossM3} m3 • peak {item.peakWeeklyM3} m3 • hafta {item.peakWeekId}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {(et0ReservoirBridge || et0ReservoirCards.length > 0) ? (
                          <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                            <strong style={{ display: 'block', marginBottom: '6px', fontSize: '16px' }}>Rezervuar esleme</strong>
                            {et0ReservoirBridge?.headline ? (
                              <div style={{ marginBottom: '10px', fontSize: '12px', color: 'rgba(245,237,216,0.62)', lineHeight: 1.5 }}>
                                {et0ReservoirBridge.headline}
                              </div>
                            ) : null}
                            <div style={{ display: 'grid', gap: '8px' }}>
                              {et0ReservoirCards.map((item) => (
                                <div key={item.id} style={{ padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                                    <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.5)' }}>{item.label}</span>
                                    <strong style={{ fontSize: '13px' }}>{item.value}</strong>
                                  </div>
                                  <div style={{ marginTop: '4px', fontSize: '11px', color: 'rgba(245,237,216,0.58)', lineHeight: 1.45 }}>{item.detail}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {evapotranspirationProfile ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(320px, 0.9fr)', gap: '16px' }}>
                  <div className="bento-card" style={{ padding: '16px', background: 'linear-gradient(145deg, rgba(88,143,180,0.1), rgba(12,24,16,0.64))', border: '1px solid rgba(88,143,180,0.18)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '12px' }}>
                      <div>
                        <div className="tech-badge" style={{ marginBottom: '8px', background: 'rgba(88,143,180,0.14)', color: 'var(--sky)' }}>EVAPOTRANSPIRASYON COCKPIT</div>
                        <strong style={{ display: 'block', fontSize: '20px' }}>ET0 / ETc talep motoru</strong>
                        <div style={{ marginTop: '8px', fontSize: '13px', color: 'rgba(245,237,216,0.72)', lineHeight: 1.6 }}>
                          Atmosferik talep, bitki katsayisi, VPD ve radyasyon ayni ekranda okunur.
                        </div>
                      </div>
                      <span className="tech-badge" style={{ background: 'rgba(212,168,67,0.14)', color: 'var(--wheat)' }}>
                        {evapotranspirationProfile.summary?.dominantDriver?.label || 'Dengeli'}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
                      <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: '10px', opacity: 0.5 }}>14 gun ET0</div>
                        <strong style={{ display: 'block', marginTop: '6px', fontSize: '17px' }}>{evapotranspirationProfile.summary?.totalEt0Mm ?? 0} mm</strong>
                      </div>
                      <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: '10px', opacity: 0.5 }}>14 gun ETc</div>
                        <strong style={{ display: 'block', marginTop: '6px', fontSize: '17px' }}>{evapotranspirationProfile.summary?.totalEtcMm ?? 0} mm</strong>
                      </div>
                      <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: '10px', opacity: 0.5 }}>Ort. VPD</div>
                        <strong style={{ display: 'block', marginTop: '6px', fontSize: '17px' }}>{evapotranspirationProfile.summary?.meanVpdKpa ?? '-'} kPa</strong>
                      </div>
                      <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: '10px', opacity: 0.5 }}>VPD stres gunu</div>
                        <strong style={{ display: 'block', marginTop: '6px', fontSize: '17px' }}>{evapotranspirationProfile.summary?.highVpdDays ?? 0}</strong>
                      </div>
                      <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: '10px', opacity: 0.5 }}>Yuksek ET gunu</div>
                        <strong style={{ display: 'block', marginTop: '6px', fontSize: '17px' }}>{evapotranspirationProfile.summary?.highEtDays ?? 0}</strong>
                      </div>
                      <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: '10px', opacity: 0.5 }}>Kisa dalga enerji</div>
                        <strong style={{ display: 'block', marginTop: '6px', fontSize: '17px' }}>{evapotranspirationProfile.summary?.totalShortwaveMjM2 ?? 0} MJ/m2</strong>
                      </div>
                    </div>

                    <div style={{ marginTop: '14px', display: 'grid', gap: '8px' }}>
                      {evapotranspirationDaily.slice(0, 6).map((row) => (
                        <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr) 80px', gap: '10px', alignItems: 'center', padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: row.risk === 'high' ? 'rgba(224,112,112,0.07)' : row.risk === 'watch' ? 'rgba(212,168,67,0.08)' : row.risk === 'relief' ? 'rgba(143,188,69,0.08)' : 'rgba(255,255,255,0.02)' }}>
                          <div style={{ fontSize: '12px', fontWeight: 700 }}>{row.dayLabel}</div>
                          <div>
                            <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.68)' }}>
                              ET0 {row.et0Mm} • ETc {row.etcMm} • VPD {row.vpdKpa ?? '-'} • {row.driver}
                            </div>
                            <div style={{ marginTop: '4px', fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>{row.driverNote}</div>
                          </div>
                          <div style={{ fontSize: '11px', color: row.risk === 'high' ? '#f5a0a0' : row.risk === 'watch' ? 'var(--wheat)' : row.risk === 'relief' ? 'var(--sprout)' : 'var(--sky)' }}>
                            {row.risk}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: '12px' }}>
                    <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                      <strong style={{ display: 'block', marginBottom: '10px', fontSize: '16px' }}>Peak ET gunleri</strong>
                      <div style={{ display: 'grid', gap: '8px' }}>
                        <div style={{ padding: '10px 12px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.5)' }}>ET0 piki</div>
                          <strong style={{ display: 'block', marginTop: '6px', fontSize: '15px' }}>{evapotranspirationProfile.summary?.peakEt0Date || '-'} • {evapotranspirationProfile.summary?.peakEt0Mm ?? '-'} mm</strong>
                        </div>
                        <div style={{ padding: '10px 12px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.5)' }}>ETc piki</div>
                          <strong style={{ display: 'block', marginTop: '6px', fontSize: '15px' }}>{evapotranspirationProfile.summary?.peakEtcDate || '-'} • {evapotranspirationProfile.summary?.peakEtcMm ?? '-'} mm</strong>
                        </div>
                      </div>
                    </div>

                    <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                      <strong style={{ display: 'block', marginBottom: '10px', fontSize: '16px' }}>Kc izi</strong>
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {evapotranspirationDaily.filter((row) => Number(row.kc || 0) > 0).slice(0, 6).map((row) => (
                          <div key={`${row.id}-kc`} style={{ display: 'grid', gridTemplateColumns: '84px minmax(0, 1fr) 56px', gap: '8px', alignItems: 'center' }}>
                            <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.62)' }}>{row.dayLabel}</div>
                            <div style={{ height: '8px', borderRadius: '999px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                              <div style={{ width: `${Math.max(4, Math.min(100, row.kc * 100))}%`, height: '100%', background: 'linear-gradient(90deg, rgba(88,143,180,0.7), rgba(143,188,69,0.9))' }} />
                            </div>
                            <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.62)' }}>{row.kc}</div>
                          </div>
                        ))}
                        {!evapotranspirationDaily.some((row) => Number(row.kc || 0) > 0) ? (
                          <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.58)' }}>Sezon disi; Kc egri henuz aktif değil.</div>
                        ) : null}
                      </div>
                    </div>

                    <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                      <strong style={{ display: 'block', marginBottom: '10px', fontSize: '16px' }}>Formul notlari</strong>
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {evapotranspirationExplainers.map((item) => (
                          <div key={item.id} style={{ padding: '10px 12px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', fontSize: '12px', color: 'rgba(245,237,216,0.66)', lineHeight: 1.5 }}>
                            <strong>{item.label}:</strong> {item.detail}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {(irrigationStageBoard.length || irrigationPlantingShiftBoard.length) ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(320px, 0.9fr)', gap: '16px' }}>
                  <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '16px' }}>Fenoloji bazli su butcesi</strong>
                      <span style={{ fontSize: '12px', color: 'rgba(245,237,216,0.56)' }}>Evre bazli ETc ve sulama yuku</span>
                    </div>
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {irrigationStageBoard.map((row) => (
                        <div key={row.id} style={{ padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                            <strong style={{ fontSize: '13px' }}>{row.label}</strong>
                            <span className="tech-badge" style={{ background: 'rgba(88,143,180,0.12)', color: 'var(--sky)' }}>
                              {row.eventCount} event
                            </span>
                          </div>
                          <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px' }}>
                            <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.58)' }}>Gun<br /><strong style={{ fontSize: '14px', color: 'var(--cream)' }}>{row.dayCount}</strong></div>
                            <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.58)' }}>ETc<br /><strong style={{ fontSize: '14px', color: 'var(--cream)' }}>{row.etcMm} mm</strong></div>
                            <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.58)' }}>Brut<br /><strong style={{ fontSize: '14px', color: 'var(--cream)' }}>{row.grossMm} mm</strong></div>
                            <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.58)' }}>Peak gun<br /><strong style={{ fontSize: '14px', color: 'var(--cream)' }}>{row.peakDailyGrossMm} mm</strong></div>
                          </div>
                        </div>
                      ))}
                      {!irrigationStageBoard.length ? (
                        <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.58)' }}>Sezon disi oldugu icin fenoloji dagilimi henuz olusmadi.</div>
                      ) : null}
                    </div>
                  </div>

                  <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '16px' }}>Dikim kaydirma simulesi</strong>
                      <span style={{ fontSize: '12px', color: 'rgba(245,237,216,0.56)' }}>Normal yil bazinda su yukunu karşılastirir</span>
                    </div>
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {irrigationPlantingShiftBoard.map((row) => (
                        <div key={row.id} style={{ padding: '12px', borderRadius: '12px', border: row.isBest ? '1px solid rgba(143,188,69,0.22)' : '1px solid rgba(255,255,255,0.06)', background: row.isBest ? 'rgba(143,188,69,0.08)' : 'rgba(255,255,255,0.02)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                            <strong style={{ fontSize: '13px' }}>{row.label}</strong>
                            <span className="tech-badge" style={{ background: row.isBest ? 'rgba(143,188,69,0.14)' : 'rgba(88,143,180,0.12)', color: row.isBest ? 'var(--sprout)' : 'var(--sky)' }}>
                              {row.shiftDays > 0 ? `+${row.shiftDays}` : row.shiftDays} gun
                            </span>
                          </div>
                          <div style={{ marginTop: '8px', fontSize: '12px', color: 'rgba(245,237,216,0.66)', lineHeight: 1.55 }}>
                            {row.plantingDate} • {row.seasonGrossMm} mm • {row.seasonGrossM3} m3 • peak {row.peakWeekId}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {(irrigationTaskBoard.length || irrigationDepletionTrace.length) ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 0.9fr) minmax(0, 1.1fr)', gap: '16px' }}>
                  <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '16px' }}>Operasyon görev tahtası</strong>
                      <span style={{ fontSize: '12px', color: 'rgba(245,237,216,0.56)' }}>Siradaki saha isleri</span>
                    </div>
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {irrigationTaskBoard.map((item) => (
                        <div key={item.id} style={{ padding: '12px', borderRadius: '12px', border: item.priority === 'high' ? '1px solid rgba(224,112,112,0.22)' : item.priority === 'planning' ? '1px solid rgba(212,168,67,0.22)' : '1px solid rgba(255,255,255,0.06)', background: item.priority === 'high' ? 'rgba(224,112,112,0.08)' : item.priority === 'planning' ? 'rgba(212,168,67,0.08)' : 'rgba(255,255,255,0.02)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                            <strong style={{ fontSize: '13px' }}>{item.title}</strong>
                            <span className="tech-badge" style={{ background: item.priority === 'high' ? 'rgba(224,112,112,0.14)' : item.priority === 'planning' ? 'rgba(212,168,67,0.14)' : 'rgba(88,143,180,0.12)', color: item.priority === 'high' ? '#f5a0a0' : item.priority === 'planning' ? 'var(--wheat)' : 'var(--sky)' }}>
                              {item.priority}
                            </span>
                          </div>
                          <div style={{ marginTop: '6px', fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>{item.date}</div>
                          <div style={{ marginTop: '6px', fontSize: '12px', color: 'rgba(245,237,216,0.66)', lineHeight: 1.5 }}>{item.detail}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '16px' }}>Kok bolgesi izi</strong>
                      <span style={{ fontSize: '12px', color: 'rgba(245,237,216,0.56)' }}>RAW eşiğine göre doluluk takibi</span>
                    </div>
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {irrigationDepletionTrace.map((row) => (
                        <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '94px minmax(0, 1fr) 70px', gap: '10px', alignItems: 'center' }}>
                          <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.62)' }}>{row.dayLabel}</div>
                          <div style={{ height: '10px', borderRadius: '999px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden', position: 'relative' }}>
                            <div style={{ width: `${Math.max(4, Math.min(100, row.depletionPct || 0))}%`, height: '100%', background: row.risk === 'alarm' ? 'linear-gradient(90deg, rgba(224,112,112,0.75), rgba(224,112,112,0.95))' : row.risk === 'watch' ? 'linear-gradient(90deg, rgba(212,168,67,0.75), rgba(212,168,67,0.95))' : 'linear-gradient(90deg, rgba(88,143,180,0.7), rgba(143,188,69,0.9))' }} />
                          </div>
                          <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.62)' }}>{row.depletionMm} mm</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: '12px', fontSize: '11px', color: 'rgba(245,237,216,0.56)', lineHeight: 1.55 }}>
                      Kirmizi: RAW alarmi. Sari: esige yaklasiyor. Mavi/yesil: tampon hala var.
                    </div>
                  </div>
                </div>
              ) : null}

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(280px, 1fr)', gap: '16px' }}>
                <div className="bento-card" style={{ padding: '16px', background: 'linear-gradient(145deg, rgba(88,143,180,0.12), rgba(17,35,28,0.72))', border: '1px solid rgba(88,143,180,0.2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: '11px', opacity: 0.6, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.7px' }}>Operasyon karari</div>
                      <strong style={{ display: 'block', marginTop: '8px', fontSize: '22px', color: 'var(--cream)' }}>
                        {irrigationActionPlan?.headline || 'Takvim hazır'}
                      </strong>
                      <div style={{ marginTop: '8px', fontSize: '13px', lineHeight: 1.6, color: 'rgba(245,237,216,0.74)' }}>
                        {irrigationActionPlan?.detail || 'Sulama penceresi ve basincli gunler burada toplanir.'}
                      </div>
                    </div>
                    <span
                      className="tech-badge"
                      style={{
                        background:
                          irrigationActionPlan?.priority === 'high'
                            ? 'rgba(224,112,112,0.14)'
                            : irrigationActionPlan?.priority === 'relief'
                              ? 'rgba(143,188,69,0.14)'
                              : 'rgba(88,143,180,0.14)',
                        color:
                          irrigationActionPlan?.priority === 'high'
                            ? '#f5a0a0'
                            : irrigationActionPlan?.priority === 'relief'
                              ? 'var(--sprout)'
                              : 'var(--sky)'
                      }}
                    >
                      {irrigationActionPlan?.priority || 'watch'}
                    </span>
                  </div>
                  <div style={{ marginTop: '12px', fontSize: '12px', color: 'rgba(245,237,216,0.56)', lineHeight: 1.55 }}>
                    {irrigationActionPlan?.reason || 'Çok yılli klimatoloji ve 14 günlük tahmin birlikte yorumlanir.'}
                  </div>
                </div>

                <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
                    <strong style={{ fontSize: '16px' }}>Tahmin vs norm</strong>
                    <span
                      className="tech-badge"
                      style={{
                        background:
                          irrigationAnomaly?.level === 'high'
                            ? 'rgba(224,112,112,0.14)'
                            : irrigationAnomaly?.level === 'relief'
                              ? 'rgba(143,188,69,0.14)'
                              : irrigationAnomaly?.level === 'elevated'
                                ? 'rgba(212,168,67,0.14)'
                                : 'rgba(88,143,180,0.14)',
                        color:
                          irrigationAnomaly?.level === 'high'
                            ? '#f5a0a0'
                            : irrigationAnomaly?.level === 'relief'
                              ? 'var(--sprout)'
                              : irrigationAnomaly?.level === 'elevated'
                                ? 'var(--wheat)'
                                : 'var(--sky)'
                      }}
                    >
                      {irrigationAnomaly?.level || 'normal'}
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', color: 'rgba(245,237,216,0.72)', lineHeight: 1.55 }}>
                    {irrigationAnomaly?.headline || 'Çok yılli baz ile fark bekleniyor.'}
                  </div>
                  <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
                    <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '10px' }}>
                      <div style={{ fontSize: '11px', opacity: 0.52 }}>ET0 farki</div>
                      <strong style={{ display: 'block', marginTop: '6px', fontSize: '18px' }}>
                        {irrigationAnomaly?.et0DeltaMm > 0 ? '+' : ''}{irrigationAnomaly?.et0DeltaMm ?? 0} mm
                      </strong>
                    </div>
                    <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '10px' }}>
                      <div style={{ fontSize: '11px', opacity: 0.52 }}>Yagis farki</div>
                      <strong style={{ display: 'block', marginTop: '6px', fontSize: '18px' }}>
                        {irrigationAnomaly?.rainDeltaMm > 0 ? '+' : ''}{irrigationAnomaly?.rainDeltaMm ?? 0} mm
                      </strong>
                    </div>
                    <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '10px' }}>
                      <div style={{ fontSize: '11px', opacity: 0.52 }}>Stresli gun</div>
                      <strong style={{ display: 'block', marginTop: '6px', fontSize: '18px' }}>{irrigationAnomaly?.stressDays ?? 0}</strong>
                    </div>
                    <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '10px' }}>
                      <div style={{ fontSize: '11px', opacity: 0.52 }}>Ort. sicaklik sapmasi</div>
                      <strong style={{ display: 'block', marginTop: '6px', fontSize: '18px' }}>
                        {irrigationAnomaly?.meanTempDeltaC > 0 ? '+' : ''}{irrigationAnomaly?.meanTempDeltaC ?? 0} C
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) minmax(300px, 1fr)', gap: '16px' }}>
                <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.025)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '12px', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '16px' }}>Sezon sonuna kadar event takvimi</strong>
                    <span className="tech-badge" style={{ background: 'rgba(88,143,180,0.12)', color: 'var(--sky)' }}>
                      {irrigationCalendar.crop?.label} • {irrigationCalendar.scope?.locationLabel} • {irrigationSummary?.horizonDays ?? 0} gun
                    </span>
                  </div>
                  <div style={{ display: 'grid', gap: '10px' }}>
                    {irrigationRows.slice(0, 14).map((row) => (
                      <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '110px minmax(0, 1fr) 140px 120px', gap: '10px', alignItems: 'center', padding: '12px', borderRadius: '14px', border: `1px solid ${row.eventType === 'sula' ? 'rgba(88,143,180,0.28)' : 'rgba(255,255,255,0.08)'}`, background: row.eventType === 'sula' ? 'rgba(88,143,180,0.08)' : 'rgba(255,255,255,0.02)' }}>
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 800 }}>{row.dayLabel}</div>
                          <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>{row.date}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 700 }}>{row.stage}</div>
                          <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.62)' }}>
                            ET0 {row.et0Mm} mm • ETc {row.etcMm} mm • Kc {row.kc}
                          </div>
                          <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.52)', marginTop: '4px' }}>{row.reason}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.5)' }}>Yagis / nem</div>
                          <div style={{ fontSize: '13px', fontWeight: 700 }}>{row.precipitationMm} / {row.effectiveRainMm} mm</div>
                          <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.5)' }}>
                            Olasilik {row.precipProbMax == null ? '-' : `%${Math.round(row.precipProbMax)}`} • RAW {row.rawThresholdMm} mm
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="tech-badge" style={{ background: row.eventType === 'sula' ? 'rgba(88,143,180,0.14)' : 'rgba(143,188,69,0.12)', color: row.eventType === 'sula' ? 'var(--sky)' : 'var(--sprout)', marginBottom: '6px' }}>
                            {row.eventType === 'sula' ? 'SULA' : 'IZLE'}
                          </div>
                          <div style={{ fontSize: '12px', fontWeight: 700 }}>{row.irrigationGrossMm ? `${row.irrigationGrossMm} mm` : '-'}</div>
                          <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.52)' }}>{row.irrigationGrossM3 ? `${row.irrigationGrossM3} m3` : row.tempBand}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gap: '12px' }}>
                  <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                    <strong style={{ display: 'block', marginBottom: '10px', fontSize: '16px' }}>Haftalık özet</strong>
                    <div style={{ display: 'grid', gap: '10px' }}>
                      {irrigationWeekly.map((row) => (
                        <div key={row.weekLabel} style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px', fontWeight: 700 }}>{row.weekLabel}</span>
                            <span className="tech-badge" style={{ background: 'rgba(143,188,69,0.12)', color: 'var(--sprout)' }}>
                              {row.irrigationEvents} event
                            </span>
                          </div>
                          <div style={{ marginTop: '8px', fontSize: '12px', color: 'rgba(245,237,216,0.64)', lineHeight: 1.55 }}>
                            ETc {row.etcMm} mm • brüt {row.grossMm} mm • {row.grossM3} m3 • yağış {row.effectiveRainMm} mm
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                    <strong style={{ display: 'block', marginBottom: '10px', fontSize: '16px' }}>Cok yilli referans</strong>
                    {irrigationReference?.periodLabel ? (
                      <div style={{ marginBottom: '10px', fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>
                        Baz donem: {irrigationReference.periodLabel}
                      </div>
                    ) : null}
                    {irrigationReference?.coverage ? (
                      <div style={{ marginBottom: '12px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
                        <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <div style={{ fontSize: '10px', opacity: 0.5 }}>Kapsam</div>
                          <strong style={{ display: 'block', marginTop: '6px', fontSize: '15px' }}>{irrigationReference.coverage.periodStart}-{irrigationReference.coverage.periodEnd}</strong>
                        </div>
                        <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <div style={{ fontSize: '10px', opacity: 0.5 }}>Min veri yili</div>
                          <strong style={{ display: 'block', marginTop: '6px', fontSize: '15px' }}>{irrigationReference.coverage.yearsMin || '-'}</strong>
                        </div>
                        <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <div style={{ fontSize: '10px', opacity: 0.5 }}>Gun kaydi</div>
                          <strong style={{ display: 'block', marginTop: '6px', fontSize: '15px' }}>{irrigationReference.coverage.dayCount || '-'}</strong>
                        </div>
                      </div>
                    ) : null}
                    {irrigationReference?.summary ? (
                      <div style={{ display: 'grid', gap: '8px', fontSize: '12px', color: 'rgba(245,237,216,0.68)' }}>
                        <div>Multi-year gross: <strong>{irrigationReference.summary.seasonGrossMm} mm</strong></div>
                        <div>Peak hafta: <strong>{irrigationReference.summary.peakWeekId || '-'}</strong></div>
                        <div>Peak hacim: <strong>{irrigationReference.summary.peakWeeklyM3} m3</strong></div>
                        <div>Yıllık örnek sayısı: <strong>{irrigationReference.sampleYears || '-'}</strong></div>
                        <div>Validasyon: <strong>{irrigationReference.validation?.allPassed ? 'PASS' : 'CHECK'}</strong></div>
                      </div>
                    ) : (
                      <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.58)' }}>Referans kampanya özeti bulunamadı.</div>
                    )}
                    {irrigationScenarios.length ? (
                      <div style={{ marginTop: '12px', display: 'grid', gap: '8px' }}>
                        {irrigationScenarios.map((row) => (
                          <div key={row.key} style={{ padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: row.key === 'dry' ? 'rgba(224,112,112,0.07)' : row.key === 'wet' ? 'rgba(143,188,69,0.08)' : 'rgba(88,143,180,0.08)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                              <div style={{ fontSize: '12px', fontWeight: 700 }}>{row.label}</div>
                              <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>{row.summary.seasonGrossMm} mm</div>
                            </div>
                            <div style={{ marginTop: '6px', fontSize: '11px', color: 'rgba(245,237,216,0.58)', lineHeight: 1.45 }}>
                              Peak {row.summary.peakWeekId || '-'} • {row.summary.peakWeeklyM3} m3 • {row.note}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {irrigationReference?.weekly?.length ? (
                      <div style={{ marginTop: '12px', display: 'grid', gap: '8px' }}>
                        {irrigationReference.weekly.slice(0, 4).map((row) => (
                          <div key={`${row.weekLabel}-${row.weekStart}`} style={{ padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                            <div style={{ fontSize: '12px', fontWeight: 700 }}>{row.weekLabel}</div>
                            <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>
                              ETc {row.etcMm} mm • brut {row.grossMm} mm • {row.grossM3} m3
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {irrigationReference?.historical1987?.summary ? (
                      <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '11px', color: 'rgba(245,237,216,0.56)', lineHeight: 1.55 }}>
                        1987 benchmark: {irrigationReference.historical1987.summary.seasonGrossMm} mm brut • peak {irrigationReference.historical1987.summary.peakWeekId || '-'}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {irrigationSlides.length ? (
                <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.025)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '16px' }}>Slayt baglami</strong>
                    <span style={{ fontSize: '12px', color: 'rgba(245,237,216,0.58)' }}>Hackhaton ET0 sunumundan seçildi</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                    {irrigationSlides.map((slide) => (
                      <div key={slide.id} style={{ borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', background: 'rgba(255,255,255,0.02)' }}>
                        {slide.image ? (
                          <img
                            src={resolveHackhatonAssetUrl(slide.image)}
                            alt={slide.title}
                            style={{ width: '100%', height: '132px', objectFit: 'cover', display: 'block' }}
                          />
                        ) : null}
                        <div style={{ padding: '12px' }}>
                          <div style={{ fontSize: '13px', fontWeight: 700 }}>{slide.title}</div>
                          <div style={{ marginTop: '6px', fontSize: '11px', color: 'rgba(245,237,216,0.58)', lineHeight: 1.55 }}>{slide.excerpt}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div id="climate-anomaly" className="panel" style={{ background: 'linear-gradient(145deg, rgba(224,112,112,0.06), rgba(12,24,16,0.7))', borderTop: '2px solid rgba(224,112,112,0.2)', scrollMarginTop: '110px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
            <div>
              <div className="tech-badge" style={{ marginBottom: '8px', background: 'rgba(224,112,112,0.12)', color: '#f5a0a0' }}>ANOMALI + HABER INTEL</div>
              <h3 className="section-title" style={{ fontSize: '26px', margin: 0 }}>Anomali <em>merkezi</em></h3>
              <p style={{ margin: '8px 0 0', fontSize: '13px', color: 'rgba(245,237,216,0.68)', maxWidth: '760px', lineHeight: 1.6 }}>
                Hackhaton tarihsel anomali serisi, quant grafikler ve ucretsiz haber kaynaklari ayni pencerede eslestirilir.
              </p>
              <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span className="tech-badge" style={{ background: 'rgba(143,188,69,0.12)', color: 'var(--sprout)' }}>Ucretsiz kaynaklar</span>
                <span className="tech-badge" style={{ background: 'rgba(88,143,180,0.12)', color: 'var(--sky)' }}>Hackhaton + GDELT + LOC</span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(150px, 1fr))', gap: '10px', minWidth: '320px' }}>
              <label style={{ display: 'grid', gap: '6px' }}>
                <span className="bento-head">Degisken</span>
                <select className="input" value={anomalyVariable} onChange={(e) => setAnomalyVariable(e.target.value)}>
                  <option value="all">Tüm değişkenler</option>
                  <option value="temp">Sicaklik</option>
                  <option value="humidity">Nem</option>
                  <option value="precip">Yagis</option>
                  <option value="pressure">Basinc</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: '6px' }}>
                <span className="bento-head">Tarih odagi</span>
                <input className="input" type="date" value={anomalyDate} onChange={(e) => setAnomalyDate(e.target.value)} />
              </label>
            </div>
          </div>

          {anomalyError ? (
            <div style={{ marginBottom: '14px', fontSize: '12px', color: '#f0c26d', background: 'rgba(240,194,109,0.08)', border: '1px solid rgba(240,194,109,0.18)', borderRadius: '12px', padding: '10px 12px' }}>
              {anomalyError}
            </div>
          ) : null}

          {anomalyLoading ? (
            <div className="bento-card" style={{ padding: '18px', background: 'rgba(255,255,255,0.03)' }}>
              Anomali merkezi hesaplanıyor...
            </div>
          ) : null}

          {anomalyIntel ? (
            <div style={{ display: 'grid', gap: '18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                {climateAnomalyVariables.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setAnomalyVariable(item.key)}
                    className="bento-card"
                    style={{
                      padding: '14px',
                      textAlign: 'left',
                      background: anomalyIntel.selectedVariable === item.key ? 'rgba(224,112,112,0.1)' : 'rgba(255,255,255,0.03)',
                      border: anomalyIntel.selectedVariable === item.key ? '1px solid rgba(224,112,112,0.24)' : '1px solid rgba(255,255,255,0.06)'
                    }}
                  >
                    <div style={{ fontSize: '11px', opacity: 0.52, fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.7px' }}>{item.label}</div>
                    <strong style={{ display: 'block', marginTop: '8px', fontSize: '21px', color: 'var(--cream)' }}>{item.anomalyCount}</strong>
                    <div style={{ marginTop: '6px', fontSize: '12px', color: 'rgba(245,237,216,0.62)' }}>
                      En sert tarih: {item.topDate || '-'} • haber hit {item.newsHits}
                    </div>
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(320px, 0.85fr)', gap: '16px' }}>
                <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.025)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    <div>
                      <strong style={{ display: 'block', fontSize: '16px' }}>Secili anomali</strong>
                      <div style={{ marginTop: '6px', fontSize: '12px', color: 'rgba(245,237,216,0.58)' }}>
                        {anomalyIntel.selectedDate || '-'} • {anomalyIntel.selectedAnomaly?.variableLabel || '-'}
                      </div>
                    </div>
                    <span className="tech-badge" style={{ background: 'rgba(224,112,112,0.14)', color: '#f5a0a0' }}>
                      skor {Number(anomalyIntel.selectedAnomaly?.severityScore || 0).toFixed(2)}
                    </span>
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: '900', color: 'var(--cream)' }}>
                    {anomalyIntel.selectedAnomaly?.anomalyType || 'Anomali seçimi yok'}
                  </div>
                  <div style={{ marginTop: '10px', fontSize: '13px', color: 'rgba(245,237,216,0.72)', lineHeight: 1.65 }}>
                    {anomalyIntel.selectedAnomaly?.causeDetails || anomalyIntel.selectedAnomaly?.causePrimary || 'Nedensel açıklama bekleniyor.'}
                  </div>
                  <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
                    <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: '10px', opacity: 0.5 }}>Aktuel</div>
                      <strong style={{ display: 'block', marginTop: '6px', fontSize: '16px' }}>{anomalyIntel.selectedAnomaly?.actual ?? '-'}</strong>
                    </div>
                    <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: '10px', opacity: 0.5 }}>Beklenen</div>
                      <strong style={{ display: 'block', marginTop: '6px', fontSize: '16px' }}>{anomalyIntel.selectedAnomaly?.expected ?? '-'}</strong>
                    </div>
                    <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: '10px', opacity: 0.5 }}>Robust z</div>
                      <strong style={{ display: 'block', marginTop: '6px', fontSize: '16px' }}>{anomalyIntel.selectedAnomaly?.robustZScore ?? '-'}</strong>
                    </div>
                  </div>
                  <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {[anomalyIntel.selectedAnomaly?.globalEventMatch, anomalyIntel.selectedAnomaly?.localPatternHint, anomalyIntel.scope?.note].filter(Boolean).slice(0, 3).map((item) => (
                      <span key={item} className="tech-badge" style={{ background: 'rgba(88,143,180,0.12)', color: 'var(--sky)' }}>{item}</span>
                    ))}
                  </div>
                </div>

                <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                  <strong style={{ display: 'block', marginBottom: '10px', fontSize: '16px' }}>Ust anomaliler</strong>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {climateAnomalyCards.slice(0, 6).map((item) => (
                      <button
                        key={`${item.id}-${item.date}`}
                        type="button"
                        onClick={() => {
                          setAnomalyDate(item.date);
                          setAnomalyVariable(item.variable);
                        }}
                        style={{ textAlign: 'left', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: anomalyIntel.selectedDate === item.date && anomalyIntel.selectedVariable === item.variable ? 'rgba(224,112,112,0.08)' : 'rgba(255,255,255,0.02)', color: 'inherit', cursor: 'pointer' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                          <div style={{ fontSize: '12px', fontWeight: 700 }}>{item.date} • {item.variableLabel}</div>
                          <div style={{ fontSize: '11px', color: '#f5a0a0' }}>{Number(item.severityScore || 0).toFixed(2)}</div>
                        </div>
                        <div style={{ marginTop: '6px', fontSize: '11px', color: 'rgba(245,237,216,0.58)', lineHeight: 1.45 }}>
                          {item.anomalyType} {item.newsTitle ? `• ${item.newsTitle}` : ''}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {climateAnomalyEvidence ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                  {[
                    { label: 'Tarihsel satir', value: climateAnomalyEvidence.historyRows ?? 0, detail: 'Secili degiskene ait kayit' },
                    { label: 'Grafik', value: climateAnomalyEvidence.chartCount ?? 0, detail: 'Hackhaton gorseli' },
                    { label: 'Yerel eslesme', value: climateAnomalyEvidence.localMatchCount ?? 0, detail: 'Anomali-olay baglami' },
                    { label: 'Harici haber', value: (climateAnomalyEvidence.liveNewsCount || 0) + (climateAnomalyEvidence.archiveNewsCount || 0), detail: `güven ${climateAnomalyEvidence.confidence || '-'}` },
                    { label: 'Analog', value: climateAnomalyEvidence.analogCount ?? 0, detail: 'Benzer tarihsel pencere' },
                    { label: 'Olay penceresi', value: climateAnomalyEvidence.contextCount ?? 0, detail: '+/- 60 gun baglam' },
                    { label: 'Bilesik olay', value: climateAnomalyEvidence.compoundCount ?? 0, detail: 'Çoklu degisken pencere' },
                    { label: 'Dekad', value: climateAnomalyEvidence.decadeCount ?? 0, detail: 'Tarihsel kapsama bandi' },
                    { label: 'Tetik', value: climateAnomalyEvidence.triggerCount ?? 0, detail: 'Izleme kurali' },
                    { label: 'Aksiyon', value: climateAnomalyEvidence.queueCount ?? 0, detail: 'Operasyon kuyrugu' }
                  ].map((item) => (
                    <div key={item.label} className="bento-card" style={{ padding: '14px', background: 'rgba(255,255,255,0.03)' }}>
                      <div style={{ fontSize: '11px', opacity: 0.52, fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.7px' }}>{item.label}</div>
                      <strong style={{ display: 'block', marginTop: '8px', fontSize: '22px', color: 'var(--cream)' }}>{item.value}</strong>
                      <div style={{ marginTop: '6px', fontSize: '12px', color: 'rgba(245,237,216,0.58)' }}>{item.detail}</div>
                    </div>
                  ))}
                </div>
              ) : null}

              {climateAnomalyStoryline ? (
                <div className="bento-card" style={{ padding: '16px', background: 'linear-gradient(145deg, rgba(88,143,180,0.1), rgba(12,24,16,0.64))', border: '1px solid rgba(88,143,180,0.18)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div>
                      <div className="tech-badge" style={{ marginBottom: '8px', background: 'rgba(88,143,180,0.14)', color: 'var(--sky)' }}>ANOMALI HIKAYESI</div>
                      <strong style={{ display: 'block', fontSize: '20px' }}>{climateAnomalyStoryline.headline}</strong>
                      <div style={{ marginTop: '10px', fontSize: '13px', color: 'rgba(245,237,216,0.72)', lineHeight: 1.6 }}>
                        {climateAnomalyStoryline.summary}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', maxWidth: '360px', justifyContent: 'flex-end' }}>
                      {climateAnomalyRegimeSignals.slice(0, 4).map((item) => (
                        <span key={item.id} className="tech-badge" style={{ background: 'rgba(212,168,67,0.12)', color: 'var(--wheat)' }}>
                          {item.label} x{item.count}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
                    {(climateAnomalyStoryline.bullets || []).map((item) => (
                      <div key={item} style={{ padding: '12px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', fontSize: '12px', color: 'rgba(245,237,216,0.68)', lineHeight: 1.55 }}>
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {(climateAnomalyDecadeProfile.length || climateAnomalyTriggerBoard.length || climateAnomalySourceBoard.length) ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(320px, 0.95fr)', gap: '16px' }}>
                  <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '16px' }}>Dekad parcasi</strong>
                      <span style={{ fontSize: '12px', color: 'rgba(245,237,216,0.56)' }}>115 yillik tarihte hangi dekadlar yukleniyor</span>
                    </div>
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {climateAnomalyDecadeProfile.length ? climateAnomalyDecadeProfile.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => item.peakDate ? setAnomalyDate(item.peakDate) : undefined}
                          style={{ textAlign: 'left', padding: '12px', borderRadius: '12px', border: item.isSelectedDecade ? '1px solid rgba(224,112,112,0.24)' : '1px solid rgba(255,255,255,0.06)', background: item.isSelectedDecade ? 'rgba(224,112,112,0.08)' : 'rgba(255,255,255,0.02)', color: 'inherit', cursor: item.peakDate ? 'pointer' : 'default' }}
                        >
                          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 82px 82px', gap: '8px', alignItems: 'center' }}>
                            <strong style={{ fontSize: '12px' }}>{item.label}</strong>
                            <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.58)' }}>{item.anomalyCount} olay</span>
                            <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.58)' }}>{item.newsHits} haber</span>
                          </div>
                          <div style={{ marginTop: '6px', fontSize: '11px', color: 'rgba(245,237,216,0.58)' }}>
                            ort. skor {item.meanSeverity} • peak {item.peakDate || '-'} • max {item.maxSeverity}
                          </div>
                        </button>
                      )) : (
                        <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.58)' }}>Dekad kapsami olusmadi.</div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: '12px' }}>
                    <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '16px' }}>Izleme tetikleri</strong>
                        <span style={{ fontSize: '12px', color: 'rgba(245,237,216,0.56)' }}>Anomaliden turetilen kontrol kurallari</span>
                      </div>
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {climateAnomalyTriggerBoard.length ? climateAnomalyTriggerBoard.map((item) => {
                          const tone = getQueueTone(item.priority);
                          return (
                            <div key={item.id} style={{ padding: '12px', borderRadius: '12px', border: `1px solid ${tone.border}`, background: tone.background }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                                <strong style={{ fontSize: '12px' }}>{item.title}</strong>
                                <span className="tech-badge" style={{ background: tone.background, color: tone.color }}>{item.priority}</span>
                              </div>
                              <div style={{ marginTop: '6px', fontSize: '11px', color: 'rgba(245,237,216,0.56)' }}>{item.condition}</div>
                              <div style={{ marginTop: '6px', fontSize: '12px', color: 'rgba(245,237,216,0.68)', lineHeight: 1.5 }}>{item.detail}</div>
                            </div>
                          );
                        }) : (
                          <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.58)' }}>Tetik kurali olusmadi.</div>
                        )}
                      </div>
                    </div>

                    <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '16px' }}>Kaynak kapsama</strong>
                        <span style={{ fontSize: '12px', color: 'rgba(245,237,216,0.56)' }}>Hangi kaynak ne kadar calisti</span>
                      </div>
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {climateAnomalySourceBoard.length ? climateAnomalySourceBoard.map((item) => (
                          <div key={item.id} style={{ padding: '12px', borderRadius: '12px', border: item.status === 'aktif' ? '1px solid rgba(143,188,69,0.22)' : '1px solid rgba(255,255,255,0.06)', background: item.status === 'aktif' ? 'rgba(143,188,69,0.08)' : 'rgba(255,255,255,0.02)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                              <strong style={{ fontSize: '12px' }}>{item.label}</strong>
                              <span className="tech-badge" style={{ background: item.status === 'aktif' ? 'rgba(143,188,69,0.14)' : 'rgba(88,143,180,0.12)', color: item.status === 'aktif' ? 'var(--sprout)' : 'var(--sky)' }}>{item.status}</span>
                            </div>
                            <div style={{ marginTop: '6px', fontSize: '11px', color: 'rgba(245,237,216,0.56)' }}>{item.coverage}</div>
                            <div style={{ marginTop: '6px', fontSize: '12px', color: 'rgba(245,237,216,0.68)', lineHeight: 1.5 }}>
                              {item.note} • count {item.count}
                            </div>
                          </div>
                        )) : (
                          <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.58)' }}>Kaynak kapsami cikmadi.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {(climateAnomalyActionQueue.length || climateAnomalyCompoundEvents.length || climateAnomalyCouplingMatrix.length) ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 0.95fr) minmax(0, 1.05fr)', gap: '16px' }}>
                  <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '16px' }}>Operasyon kuyrugu</strong>
                      <span style={{ fontSize: '12px', color: 'rgba(245,237,216,0.56)' }}>Anomali seçiminden uretilen saha aksiyonlari</span>
                    </div>
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {climateAnomalyActionQueue.length ? climateAnomalyActionQueue.map((item) => {
                        const tone = getQueueTone(item.priority);
                        return (
                          <div key={item.id} style={{ padding: '12px', borderRadius: '12px', border: `1px solid ${tone.border}`, background: tone.background }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                              <strong style={{ fontSize: '12px' }}>{item.title}</strong>
                              <span className="tech-badge" style={{ background: tone.background, color: tone.color }}>{item.priority}</span>
                            </div>
                            <div style={{ marginTop: '6px', fontSize: '11px', color: 'rgba(245,237,216,0.58)' }}>{item.horizon}</div>
                            <div style={{ marginTop: '6px', fontSize: '12px', color: 'rgba(245,237,216,0.68)', lineHeight: 1.5 }}>{item.detail}</div>
                          </div>
                        );
                      }) : (
                        <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.58)' }}>Aksiyon kuyrugu olusmadi.</div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: '12px' }}>
                    <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '16px' }}>Bilesik olay kumeleri</strong>
                        <span style={{ fontSize: '12px', color: 'rgba(245,237,216,0.56)' }}>Secili tarihin +/- 10 gunundeki coklu degisken pencere</span>
                      </div>
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {climateAnomalyCompoundEvents.length ? climateAnomalyCompoundEvents.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setAnomalyDate(item.date)}
                            style={{ textAlign: 'left', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: item.dayOffset === 0 ? 'rgba(224,112,112,0.08)' : 'rgba(255,255,255,0.02)', color: 'inherit', cursor: 'pointer' }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                              <strong style={{ fontSize: '12px' }}>{item.startDate && item.endDate && item.startDate !== item.endDate ? `${item.startDate} -> ${item.endDate}` : item.date}</strong>
                              <span className="tech-badge" style={{ background: 'rgba(212,168,67,0.12)', color: 'var(--wheat)' }}>{item.variableCount} degisken</span>
                            </div>
                            <div style={{ marginTop: '6px', fontSize: '12px', color: 'rgba(245,237,216,0.68)', lineHeight: 1.5 }}>{item.headline}</div>
                            <div style={{ marginTop: '6px', fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>
                              {item.dayOffset > 0 ? `+${item.dayOffset}` : item.dayOffset} gun • skor {item.maxSeverity} • haber {item.newsHits}
                            </div>
                          </button>
                        )) : (
                          <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.58)' }}>Bilesik olay kumesi bulunamadi.</div>
                        )}
                      </div>
                    </div>

                    <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '16px' }}>Degisken eszamanliligi</strong>
                        <span style={{ fontSize: '12px', color: 'rgba(245,237,216,0.56)' }}>Secili degiskene tarihsel eslik oranlari</span>
                      </div>
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {climateAnomalyCouplingMatrix.length ? climateAnomalyCouplingMatrix.map((item) => (
                          <div key={item.id} style={{ padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 76px 76px', gap: '8px', alignItems: 'center' }}>
                              <strong style={{ fontSize: '12px' }}>{item.variableLabel}</strong>
                              <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>%{item.matchRatePct}</span>
                              <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>{item.meanLagDays == null ? '-' : `${item.meanLagDays} gun`}</span>
                            </div>
                            <div style={{ marginTop: '6px', fontSize: '11px', color: 'rgba(245,237,216,0.58)' }}>
                              ort. skor {item.meanSeverity ?? '-'} • guclu eslesme {item.strongestDate || '-'} {item.strongestSeverity != null ? `• ${item.strongestSeverity}` : ''}
                            </div>
                          </div>
                        )) : (
                          <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.58)' }}>Eszamanlilik matrisi olusmadi.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {(climateAnomalyAnalogs.length || climateAnomalyRegimeSignals.length || climateAnomalyMonthProfile.length) ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(300px, 0.9fr)', gap: '16px' }}>
                  <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '16px' }}>Analog yillar</strong>
                      <span style={{ fontSize: '12px', color: 'rgba(245,237,216,0.56)' }}>Secili anomalinin yakin sezon analoglari</span>
                    </div>
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {climateAnomalyAnalogs.length ? climateAnomalyAnalogs.map((item) => (
                        <button
                          key={`${item.id}-${item.date}`}
                          type="button"
                          onClick={() => {
                            setAnomalyDate(item.date);
                            setAnomalyVariable(anomalyIntel.selectedVariable || item.variable || anomalyVariable);
                          }}
                          style={{ textAlign: 'left', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', color: 'inherit', cursor: 'pointer' }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                            <div style={{ fontSize: '12px', fontWeight: 700 }}>{item.date}</div>
                            <div style={{ fontSize: '11px', color: item.sameDirection ? 'var(--sprout)' : '#f5a0a0' }}>
                              {item.sameDirection ? 'ayni yon' : 'ters yon'}
                            </div>
                          </div>
                          <div style={{ marginTop: '6px', fontSize: '11px', color: 'rgba(245,237,216,0.58)', lineHeight: 1.5 }}>
                            {item.anomalyType} • skor {Number(item.severityScore || 0).toFixed(2)} • {item.causePrimary || item.globalEventMatch || '-'}
                          </div>
                        </button>
                      )) : (
                        <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.58)' }}>Bu pencere icin yakin analog bulunamadi.</div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: '12px' }}>
                    <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                      <strong style={{ display: 'block', marginBottom: '10px', fontSize: '16px' }}>Rejim sinyalleri</strong>
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {climateAnomalyRegimeSignals.length ? climateAnomalyRegimeSignals.map((item) => (
                          <div key={item.id} style={{ padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                              <div style={{ fontSize: '12px', fontWeight: 700 }}>{item.label}</div>
                              <div className="tech-badge" style={{ background: 'rgba(212,168,67,0.14)', color: 'var(--wheat)' }}>x{item.count}</div>
                            </div>
                            <div style={{ marginTop: '6px', fontSize: '11px', color: 'rgba(245,237,216,0.56)', lineHeight: 1.45 }}>{item.sample}</div>
                          </div>
                        )) : (
                          <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.58)' }}>Belirgin rejim sinyali ayristirilamadi.</div>
                        )}
                      </div>
                    </div>

                    <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                      <strong style={{ display: 'block', marginBottom: '10px', fontSize: '16px' }}>Mevsimsellik profili</strong>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '8px' }}>
                        {climateAnomalyMonthProfile.map((item) => (
                          <div key={item.month} style={{ padding: '10px', borderRadius: '12px', background: Number(item.month) === Number(String(anomalyIntel.selectedDate || '').slice(5, 7) || 0) ? 'rgba(224,112,112,0.08)' : 'rgba(255,255,255,0.02)', border: Number(item.month) === Number(String(anomalyIntel.selectedDate || '').slice(5, 7) || 0) ? '1px solid rgba(224,112,112,0.24)' : '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ fontSize: '11px', opacity: 0.52, fontWeight: 800 }}>{item.label}</div>
                            <strong style={{ display: 'block', marginTop: '6px', fontSize: '16px' }}>{item.anomalyCount}</strong>
                            <div style={{ marginTop: '4px', fontSize: '10px', color: 'rgba(245,237,216,0.56)' }}>
                              max {Number(item.maxSeverity || 0).toFixed(1)} • haber {item.newsHits}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {climateImpactMatrix.length ? (
                <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '16px' }}>Etki matrisi</strong>
                    <span style={{ fontSize: '12px', color: 'rgba(245,237,216,0.56)' }}>Anomali seçimine göre operasyon etkisi</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                    {climateImpactMatrix.map((item) => (
                      <div key={item.id} style={{ padding: '12px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)', background: item.level === 'kritik' ? 'rgba(224,112,112,0.08)' : item.level === 'yüksek' ? 'rgba(212,168,67,0.08)' : 'rgba(255,255,255,0.02)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                          <div style={{ fontSize: '13px', fontWeight: 700 }}>{item.label}</div>
                          <span className="tech-badge" style={{ background: item.level === 'kritik' ? 'rgba(224,112,112,0.14)' : item.level === 'yüksek' ? 'rgba(212,168,67,0.14)' : 'rgba(88,143,180,0.14)', color: item.level === 'kritik' ? '#f5a0a0' : item.level === 'yüksek' ? 'var(--wheat)' : 'var(--sky)' }}>
                            {item.level}
                          </span>
                        </div>
                        <div style={{ marginTop: '8px', fontSize: '12px', color: 'rgba(245,237,216,0.68)', lineHeight: 1.55 }}>
                          {item.detail}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {climateAnomalyContext.length ? (
                <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '16px' }}>Olay penceresi</strong>
                    <span style={{ fontSize: '12px', color: 'rgba(245,237,216,0.56)' }}>Secili tarihin +/- 60 gun baglami</span>
                  </div>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {climateAnomalyContext.map((item) => (
                      <button
                        key={`${item.id}-${item.date}-${item.variable}`}
                        type="button"
                        onClick={() => {
                          setAnomalyDate(item.date);
                          setAnomalyVariable(item.variable);
                        }}
                        style={{ display: 'grid', gridTemplateColumns: '110px 90px minmax(0, 1fr) 70px', gap: '10px', alignItems: 'center', textAlign: 'left', padding: '10px 12px', borderRadius: '12px', border: item.dayOffset === 0 ? '1px solid rgba(224,112,112,0.24)' : '1px solid rgba(255,255,255,0.06)', background: item.dayOffset === 0 ? 'rgba(224,112,112,0.08)' : 'rgba(255,255,255,0.02)', color: 'inherit', cursor: 'pointer' }}
                      >
                        <div style={{ fontSize: '12px', fontWeight: 700 }}>{item.date}</div>
                        <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.58)' }}>
                          {item.dayOffset > 0 ? `+${item.dayOffset}` : item.dayOffset} gun
                        </div>
                        <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.68)', lineHeight: 1.45 }}>
                          <strong>{item.variableLabel}</strong> • {item.anomalyType} • {item.causePrimary}
                        </div>
                        <div style={{ fontSize: '11px', color: '#f5a0a0' }}>{Number(item.severityScore || 0).toFixed(1)}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {climateAgrobotPlaybook ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 0.9fr) minmax(0, 1.1fr)', gap: '16px' }}>
                  <div className="bento-card" style={{ padding: '16px', background: 'linear-gradient(145deg, rgba(143,188,69,0.1), rgba(12,24,16,0.62))', border: '1px solid rgba(143,188,69,0.18)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <div>
                        <div className="tech-badge" style={{ background: 'rgba(143,188,69,0.14)', color: 'var(--sprout)', marginBottom: '8px' }}>AGROBOT REHBERI</div>
                        <strong style={{ display: 'block', fontSize: '20px' }}>{climateAgrobotPlaybook.stress?.title}</strong>
                        <div style={{ marginTop: '6px', fontSize: '12px', color: 'rgba(245,237,216,0.6)' }}>
                          {climateAgrobotPlaybook.crop?.label} • {climateAgrobotPlaybook.crop?.stage}
                        </div>
                      </div>
                      <span className="tech-badge" style={{ background: 'rgba(224,112,112,0.12)', color: '#f5a0a0' }}>
                        {climateAgrobotPlaybook.stress?.severityTier}
                      </span>
                    </div>
                    <div style={{ marginTop: '10px', fontSize: '13px', color: 'rgba(245,237,216,0.72)', lineHeight: 1.6 }}>
                      {climateAgrobotPlaybook.summary}
                    </div>
                    <div style={{ marginTop: '12px', fontSize: '12px', color: 'rgba(245,237,216,0.58)', lineHeight: 1.55 }}>
                      {climateAgrobotPlaybook.agronomicNote}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }}>
                    <div className="bento-card" style={{ padding: '14px', background: 'rgba(255,255,255,0.03)' }}>
                      <strong style={{ display: 'block', marginBottom: '8px', fontSize: '15px' }}>Bugun yap</strong>
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {(climateAgrobotPlaybook.immediateActions || []).map((item) => (
                          <div key={item} style={{ fontSize: '12px', color: 'rgba(245,237,216,0.68)', lineHeight: 1.5, padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)' }}>
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bento-card" style={{ padding: '14px', background: 'rgba(255,255,255,0.03)' }}>
                      <strong style={{ display: 'block', marginBottom: '8px', fontSize: '15px' }}>Bu hafta</strong>
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {(climateAgrobotPlaybook.weekActions || []).map((item) => (
                          <div key={item} style={{ fontSize: '12px', color: 'rgba(245,237,216,0.68)', lineHeight: 1.5, padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)' }}>
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bento-card" style={{ padding: '14px', background: 'rgba(255,255,255,0.03)' }}>
                      <strong style={{ display: 'block', marginBottom: '8px', fontSize: '15px' }}>Kontrol listesi</strong>
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {(climateAgrobotPlaybook.fieldChecks || []).map((item) => (
                          <div key={item} style={{ fontSize: '12px', color: 'rgba(245,237,216,0.68)', lineHeight: 1.5, padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)' }}>
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {climateAnomalyCharts.length ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
                  {climateAnomalyCharts.map((chart) => (
                    <div key={chart.id} className="bento-card" style={{ padding: '12px', background: 'rgba(255,255,255,0.025)' }}>
                      {chart.asset ? (
                        <img
                          src={resolveHackhatonAssetUrl(chart.asset)}
                          alt={chart.title}
                          style={{ width: '100%', height: '180px', objectFit: 'cover', borderRadius: '12px', display: 'block', marginBottom: '10px' }}
                        />
                      ) : null}
                      <div style={{ fontSize: '13px', fontWeight: 700 }}>{chart.title}</div>
                      <div style={{ marginTop: '4px', fontSize: '11px', color: 'rgba(245,237,216,0.56)' }}>{chart.subtitle}</div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px' }}>
                <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                  <strong style={{ display: 'block', marginBottom: '10px', fontSize: '16px' }}>Yerel / kaydedilmis eslesmeler</strong>
                  <div style={{ display: 'grid', gap: '10px' }}>
                    {climateAnomalyLocalMatches.length ? climateAnomalyLocalMatches.map((item) => (
                      <a
                        key={item.id}
                        href={item.link || '#0'}
                        target={item.link ? '_blank' : undefined}
                        rel={item.link ? 'noreferrer' : undefined}
                        style={{ display: 'block', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', textDecoration: 'none', color: 'inherit' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 700 }}>{item.title}</div>
                          <div style={{ fontSize: '11px', color: 'var(--wheat)' }}>{Number(item.score || 0).toFixed(2)}</div>
                        </div>
                        <div style={{ marginTop: '6px', fontSize: '11px', color: 'rgba(245,237,216,0.56)', lineHeight: 1.5 }}>
                          {item.date} • {item.source} • {item.summary}
                        </div>
                      </a>
                    )) : (
                      <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.58)' }}>Secili pencere icin yerel eslesme bulunamadi.</div>
                    )}
                  </div>
                </div>

                <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                  <strong style={{ display: 'block', marginBottom: '10px', fontSize: '16px' }}>Canli + arsiv haber taramasi</strong>
                  <div style={{ display: 'grid', gap: '10px' }}>
                    {[...climateAnomalyLiveNews, ...climateAnomalyArchiveNews].slice(0, 8).map((item) => (
                      <a
                        key={`${item.provider}-${item.id}`}
                        href={item.link}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: 'block', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', textDecoration: 'none', color: 'inherit' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 700 }}>{item.title}</div>
                          <div className="tech-badge" style={{ background: 'rgba(88,143,180,0.12)', color: 'var(--sky)' }}>{item.provider}</div>
                        </div>
                        <div style={{ marginTop: '6px', fontSize: '11px', color: 'rgba(245,237,216,0.56)', lineHeight: 1.5 }}>
                          {item.date || '-'} • {item.source} • {item.description}
                        </div>
                      </a>
                    ))}
                    {!climateAnomalyLiveNews.length && !climateAnomalyArchiveNews.length ? (
                      <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.58)' }}>Harici haber kaynagi bu pencere icin sonuc donmedi. Yerel Hackhaton eslesmeleri kullaniliyor.</div>
                    ) : null}
                  </div>
                </div>
              </div>

              {climateAnomalyTimeline.length ? (
                <div className="bento-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.025)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '16px' }}>Sürekli seri özeti</strong>
                    <span style={{ fontSize: '12px', color: 'rgba(245,237,216,0.56)' }}>{anomalyIntel.selectedVariable} • son {climateAnomalyTimeline.length} ay</span>
                  </div>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {climateAnomalyTimeline.slice(-18).map((item) => {
                      const isSelected = String(anomalyIntel.selectedDate || '').slice(0, 7) === String(item.month || '').slice(0, 7);
                      return (
                        <button
                          key={`${item.variable}-${item.month}`}
                          type="button"
                          onClick={() => {
                            setAnomalyVariable(item.variable);
                            setAnomalyDate(item.month);
                          }}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '110px 1fr 70px 70px',
                            gap: '10px',
                            alignItems: 'center',
                            padding: '10px',
                            borderRadius: '12px',
                            border: isSelected ? '1px solid rgba(224,112,112,0.24)' : '1px solid rgba(255,255,255,0.04)',
                            background: isSelected ? 'rgba(224,112,112,0.08)' : 'rgba(255,255,255,0.02)',
                            color: 'inherit',
                            cursor: 'pointer',
                            textAlign: 'left'
                          }}
                        >
                          <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.62)' }}>{item.month}</div>
                          <div style={{ height: '8px', borderRadius: '999px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, Math.max(4, item.severityNorm * 70))}%`, height: '100%', background: 'linear-gradient(90deg, rgba(88,143,180,0.7), rgba(224,112,112,0.85))' }} />
                          </div>
                          <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.62)' }}>{item.monthlyEventCount} olay</div>
                          <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.62)' }}>{item.newsCount} haber</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* ═══ SOIL SUGGESTIONS ═══ */}
        {soilSmartSuggestions && soilSmartSuggestions.length > 0 && (
          <div className="panel" style={{ background: 'rgba(143,188,69,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <IconBox icon={Leaf} size={16} color="var(--sprout)" />
              <h3 className="section-title" style={{ fontSize: '24px', margin: 0 }}>Toprak <em>Önerileri</em></h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {soilSmartSuggestions.slice(0, 6).map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '16px', background: 'rgba(245,237,216,0.03)', borderRadius: '12px', border: '1px solid rgba(245,237,216,0.06)' }}>
                  <Leaf size={16} color="var(--sprout)" strokeWidth={2} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <p style={{ fontSize: '13px', color: 'rgba(245,237,216,0.75)', lineHeight: 1.6, margin: 0 }}>{typeof s === 'string' ? s : s.text || s.suggestion}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ NOTIFICATIONS ═══ */}
        <div className="panel" style={{ background: 'linear-gradient(145deg, rgba(26,46,26,0.4), rgba(44,24,16,0.1))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <IconBox icon={Bell} color="var(--wheat)" bg="rgba(212,168,67,0.12)" />
            <h3 className="section-title" style={{ fontSize: '24px', margin: 0 }}>Bildirim <em>Merkezi</em></h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {[
              { icon: Snowflake, label: "Don Uyarısı", desc: "Sıcaklık 2°C altına düştüğünde", key: "frostAlert", color: '#B8D0E8' },
              { icon: CloudRain, label: "Ani Yağış", desc: "Şiddetli fırtına öncesi", key: "rainAlert", color: 'var(--sky)' },
              { icon: Wind, label: "Kuvvetli Rüzgar", desc: "Hız 50 km/s üzerine çıktığında", key: "windAlert", color: 'rgba(245,237,216,0.6)' },
              { icon: AlertTriangle, label: "Zararlı Uyarısı", desc: "Nem + sıcaklık birleşik risk", key: "pestAlert", color: 'var(--wheat)' }
            ].map(({ icon: NIcon, label, desc, key, color }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '14px', background: 'rgba(245,237,216,0.03)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(245,237,216,0.05)' }}>
                <IconBox icon={NIcon} size={16} color={notifSettings[key] ? color : 'rgba(245,237,216,0.2)'} bg={notifSettings[key] ? `${color}15` : 'rgba(245,237,216,0.03)'} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>{label}</p>
                  <p style={{ fontSize: '11px', color: 'rgba(245,237,216,0.35)', margin: '2px 0 0' }}>{desc}</p>
                </div>
                <input type="checkbox" checked={notifSettings[key] || false} onChange={e => setNotifSettings({ ...notifSettings, [key]: e.target.checked })} style={{ width: '20px', height: '20px', accentColor: 'var(--sprout)' }} />
              </div>
            ))}
          </div>
          <button className="btn-primary" style={{ width: '100%', marginTop: '24px' }} onClick={syncNotifications}>
            <Bell size={14} strokeWidth={2} style={{ marginRight: '6px' }} /> AYARLARI SENKRONİZE ET
          </button>
        </div>

        {/* ═══ 7-DAY ═══ */}
        <div className="panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <IconBox icon={Calendar} color="var(--sprout)" />
            <h3 className="section-title" style={{ fontSize: '24px', margin: 0 }}>7 Günlük <em>Projeksiyon</em></h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {forecast?.days?.map((d, i) => {
              const { icon: DIcon, color: dColor } = conditionIcon(d.condition);
              return (
                <div key={i} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'rgba(245,237,216,0.02)', borderRadius: '12px', border: '1px solid rgba(245,237,216,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', width: '100px' }}>
                    <Calendar size={14} color="var(--sprout)" strokeWidth={2} />
                    <strong style={{ fontSize: '14px' }}>{d.day}</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                    <DIcon size={16} color={dColor} strokeWidth={1.8} />
                    <span style={{ fontSize: '12px', color: 'rgba(245,237,216,0.55)' }}>{d.condition}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {d.precipitationMm > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Droplets size={12} color="var(--sky)" strokeWidth={2} />
                        <span style={{ fontSize: '11px', color: 'var(--sky)', fontFamily: 'JetBrains Mono' }}>{d.precipitationMm}mm</span>
                      </div>
                    )}
                    {d.windGustKmh > 20 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Wind size={12} color="rgba(245,237,216,0.35)" strokeWidth={2} />
                        <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.35)', fontFamily: 'JetBrains Mono' }}>{d.windGustKmh}</span>
                      </div>
                    )}
                    <div style={{ width: '90px', textAlign: 'right' }}>
                      <strong style={{ fontSize: '16px', fontFamily: 'JetBrains Mono' }}>{d.min}° / {d.max}°</strong>
                    </div>
                  </div>
                  {d.frost && <div style={{ background: 'rgba(224,112,112,0.1)', color: '#E07070', padding: '4px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 800, marginLeft: '10px', letterSpacing: '0.5px' }}>DON</div>}
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* ═══ 30 GÜNLÜK ÖLÇEKLENMİŞ PROJEKSİYON ═══ */}
      <div id="climate-forecast" className="panel" style={{ background: 'linear-gradient(145deg, rgba(212,168,67,0.05), rgba(26,46,26,0.2))', borderTop: '2px solid rgba(212,168,67,0.2)', scrollMarginTop: '110px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <IconBox icon={LineChart} color="var(--wheat)" bg="rgba(212,168,67,0.12)" glow="rgba(212,168,67,0.15)" />
            <h3 className="section-title" style={{ fontSize: '24px', margin: 0 }}>30 Günlük <em>ölçekli projeksiyon</em></h3>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span className="tech-badge" style={{ background: 'rgba(212,168,67,0.1)', color: 'var(--wheat)' }}>5 günlük tahminden türetildi</span>
            <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '11px' }}><DownloadCloud size={14} /></button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 1fr) 2.5fr', gap: '20px' }}>
          {/* Sol: İstatistikler */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="bento-card" style={{ padding: '20px', background: 'rgba(245,237,216,0.02)' }}>
              <span className="bento-head" style={{ marginBottom: '8px', display: 'block' }}>Beklenen Ortalama</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <h4 style={{ fontSize: '32px', margin: 0, color: 'var(--cream)', fontFamily: 'Playfair Display' }}>{predictiveData.avgTemp == null ? '-' : `${predictiveData.avgTemp}°C`}</h4>
                <span style={{ fontSize: '12px', color: Number(predictiveData.trend) >= 0 ? 'var(--sprout)' : '#E07070', display: 'flex', alignItems: 'center' }}>
                  <TrendingUp size={12} style={{ marginRight: '4px' }} />
                  {predictiveData.trend == null ? 'veri yok' : `%${Number(predictiveData.trend) >= 0 ? '+' : ''}${predictiveData.trend}`}
                </span>
              </div>
              <p style={{ fontSize: '11px', color: 'rgba(245,237,216,0.4)', margin: '8px 0 0' }}>
                {predictiveData.trend == null
                  ? 'Canli tahmin olmadan projeksiyon hesaplanamaz.'
                  : Number(predictiveData.trend) > 0
                    ? '5 günlük tahminden olceklenmis sıcaklik yukselisi.'
                    : '5 günlük tahminden olceklenmis sıcaklik zayiflamasi.'}
              </p>
            </div>

            <div className="bento-card" style={{ padding: '20px', background: 'rgba(245,237,216,0.02)' }}>
              <span className="bento-head" style={{ marginBottom: '8px', display: 'block' }}>Aylık Yağış Rejimi</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <h4 style={{ fontSize: '32px', margin: 0, color: 'var(--sky)', fontFamily: 'Playfair Display' }}>{predictiveData.monthlyRainEstimate == null ? '-' : `${predictiveData.monthlyRainEstimate}mm`}</h4>
              </div>
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.5)' }}>Mevsim Normali</span>
                    <span style={{ fontSize: '11px', color: 'var(--cream)', fontFamily: 'JetBrains Mono' }}>{predictiveData.currentNormal == null ? '-' : `${predictiveData.currentNormal}mm`}</span>
                  </div>
                  <div style={{ width: '100%', height: '4px', background: 'rgba(0,0,0,0.3)', borderRadius: '2px' }}>
                    <div style={{ width: `${Math.min(100, Number(predictiveData.currentNormal || 0))}%`, height: '100%', background: 'rgba(245,237,216,0.3)', borderRadius: '2px' }} />
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--sky)' }}>Bu Dönem (Olcekli)</span>
                    <span style={{ fontSize: '11px', color: 'var(--sky)', fontFamily: 'JetBrains Mono' }}>{predictiveData.monthlyRainEstimate == null ? '-' : `${predictiveData.monthlyRainEstimate}mm`}</span>
                  </div>
                  <div style={{ width: '100%', height: '4px', background: 'rgba(0,0,0,0.3)', borderRadius: '2px' }}>
                    <div style={{ width: `${Math.min(100, Number(predictiveData.monthlyRainEstimate || 0))}%`, height: '100%', background: 'var(--sky)', borderRadius: '2px' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sağ: Chart Görünümü */}
          <div className="bento-card" style={{ padding: '24px', background: 'rgba(26,46,26,0.4)', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '12px', height: '4px', background: 'var(--wheat)', borderRadius: '2px' }} />
                  <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.6)' }}>Sıcaklık (°C)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '12px', height: '12px', background: 'var(--sky)', borderRadius: '2px', opacity: 0.6 }} />
                  <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.6)' }}>Yağış (mm)</span>
                </div>
              </div>
              <span style={{ fontSize: '10px', color: 'rgba(245,237,216,0.3)', fontFamily: 'JetBrains Mono' }}>Kapsam: %{predictiveData.coveragePct || 0}</span>
            </div>

            {/* Dinamik Grafik Alanı */}
            <div style={{ height: '200px', width: '100%', position: 'relative', borderLeft: '1px solid rgba(245,237,216,0.1)', borderBottom: '1px solid rgba(245,237,216,0.1)' }}>
              {/* Arka plan grid çizgileri */}
              <div style={{ position: 'absolute', top: '25%', left: 0, right: 0, borderTop: '1px dashed rgba(245,237,216,0.05)' }} />
              <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, borderTop: '1px dashed rgba(245,237,216,0.05)' }} />
              <div style={{ position: 'absolute', top: '75%', left: 0, right: 0, borderTop: '1px dashed rgba(245,237,216,0.05)' }} />

              {/* Gerçek Yağış Barları */}
              {(forecast?.days || []).map((val, idx) => {
                const height = Math.min((val.precipitationMm || 0) * 8, 100); // Scale 1mm = 8% height
                return (
                  <div key={idx} style={{
                    position: 'absolute', bottom: 0,
                    left: `${(idx / (forecast?.days?.length || 7)) * 100}%`,
                    width: `${80 / (forecast?.days?.length || 7)}%`,
                    height: `${height}%`,
                    background: 'var(--sky)', opacity: 0.4,
                    borderRadius: '2px 2px 0 0', transition: 'height 1s ease'
                  }} />
                )
              })}

              {/* Gerçek Sıcaklık Çizgisi */}
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} preserveAspectRatio="none">
                {(() => {
                  const days = forecast?.days || [];
                  if (days.length < 2) return null;
                  const maxTemp = Math.max(...days.map(d => d.max), 30);
                  const minTemp = Math.min(...days.map(d => d.min), 0);
                  const range = maxTemp - minTemp || 1;

                  const points = days.map((d, i) => {
                    const x = (i / (days.length - 1)) * 600;
                    const y = 200 - ((d.max - minTemp) / range) * 150 - 25; // Scale and offset
                    return `${x},${y}`;
                  }).join(' ');

                  const fillPath = `M0,200 ${points} 600,200 Z`;

                  return (
                    <>
                      <polyline points={points} fill="none" stroke="var(--wheat)" strokeWidth="3" vectorEffect="non-scaling-stroke" style={{ filter: 'drop-shadow(0 4px 6px rgba(212,168,67,0.3))' }} />
                      <path d={fillPath} fill="rgba(212,168,67,0.1)" stroke="none" />
                    </>
                  );
                })()}
              </svg>
            </div>
            {/* X Ekseni Etiketleri */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', padding: '0 4px' }}>
              {(forecast?.days || []).map((d, i) => (
                <span key={i} style={{ fontSize: '9px', color: 'rgba(245,237,216,0.3)', transform: 'rotate(-30deg)', transformOrigin: 'top left' }}>{d.day}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ HACKHATON MODEL SUITE (Climate Model Suite) ═══ */}
      <div id="climate-hackhaton" className="panel" style={{ background: 'linear-gradient(145deg, rgba(143,188,69,0.06), rgba(12,24,16,0.7))', borderTop: '2px solid rgba(143,188,69,0.25)', scrollMarginTop: '110px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <IconBox icon={Cpu} color="var(--sprout)" bg="rgba(143,188,69,0.12)" glow="rgba(143,188,69,0.15)" />
            <h3 className="section-title" style={{ fontSize: '24px', margin: 0 }}>Hackhaton <em>Model Suite</em></h3>
          </div>
          <span className="tech-badge" style={{ background: 'rgba(143,188,69,0.1)', color: 'var(--sprout)' }}>
            {hackhatonModelSuite?.run?.name || 'Model suite'}
          </span>
        </div>
        {hackhatonModelSuiteError ? (
          <div className="bento-card" style={{ padding: '16px', border: '1px solid rgba(224,112,112,0.2)', background: 'rgba(224,112,112,0.05)', color: 'rgba(245,237,216,0.8)' }}>
            {hackhatonModelSuiteError}
          </div>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          {[
            { label: 'Başarılı model', value: suiteSummary?.modelsOk?.length ?? 0, tone: 'var(--sprout)' },
            { label: 'Seçilen model', value: suiteModelCards.length, tone: 'var(--sky)' },
            { label: 'Rapor kartı', value: suiteReportCards.length, tone: 'var(--wheat)' },
            { label: 'Health kontrol', value: suiteHealthCards.filter((item) => item.status === 'ok').length, tone: 'rgba(245,237,216,0.8)' }
          ].map((item) => (
            <div key={item.label} className="bento-card" style={{ padding: '16px', border: `1px solid ${item.tone}30`, background: 'rgba(15,26,15,0.45)' }}>
              <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.45)', marginBottom: '8px' }}>{item.label}</div>
              <strong style={{ fontSize: '28px', color: item.tone, fontFamily: 'JetBrains Mono' }}>{item.value}</strong>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
          {suiteModelCards.map((item) => (
            <div key={item.id} className="bento-card" style={{ padding: '14px', background: 'rgba(15,26,15,0.45)', border: '1px solid rgba(143,188,69,0.16)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '10px', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--sprout)' }}>{item.modelLabel}</div>
                  <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.5)' }}>{item.variableLabel} • {item.frequency}</div>
                </div>
                <span className="tech-badge" style={{ background: 'rgba(88,143,180,0.12)', color: 'var(--sky)' }}>
                  {item.grade || 'grade yok'}
                </span>
              </div>
              {item.chart?.url ? (
                <img
                  src={resolveHackhatonAssetUrl(item.chart)}
                  alt={`${item.modelLabel} ${item.variableLabel}`}
                  style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '12px' }}
                />
              ) : null}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
                <div>
                  <div style={{ fontSize: '10px', color: 'rgba(245,237,216,0.4)' }}>Skor</div>
                  <strong style={{ fontSize: '14px', fontFamily: 'JetBrains Mono' }}>{Number(item.score || 0).toFixed(2)}</strong>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: 'rgba(245,237,216,0.4)' }}>RMSE</div>
                  <strong style={{ fontSize: '14px', fontFamily: 'JetBrains Mono' }}>{Number(item.rmse || 0).toFixed(2)}</strong>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: 'rgba(245,237,216,0.4)' }}>Güven</div>
                  <strong style={{ fontSize: '14px', fontFamily: 'JetBrains Mono' }}>{Number(item.confidence || 0).toFixed(2)}</strong>
                </div>
              </div>
            </div>
          ))}
        </div>

        {suiteReportCards.length > 0 ? (
          <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            {suiteReportCards.map((item) => (
              <div key={item.id} className="bento-card" style={{ padding: '14px', border: '1px solid rgba(88,143,180,0.18)', background: 'rgba(10,22,18,0.52)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}>
                  <strong style={{ fontSize: '14px' }}>{item.variableLabel}</strong>
                  <span className="tech-badge" style={{ background: 'rgba(212,168,67,0.1)', color: 'var(--wheat)' }}>{item.modelLabel}</span>
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.65)', marginBottom: '8px' }}>
                  Coverage {Number(item.coverage || 0).toFixed(2)} • Bias {Number(item.bias || 0).toFixed(2)}
                </div>
                {item.chart?.url ? (
                  <img
                    src={resolveHackhatonAssetUrl(item.chart)}
                    alt={`${item.variableLabel} raporu`}
                    style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}
                  />
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="panel" style={{ background: 'linear-gradient(145deg, rgba(88,143,180,0.08), rgba(12,24,16,0.72))', borderTop: '2px solid rgba(88,143,180,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '18px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <IconBox icon={BarChart2} color="var(--sky)" bg="rgba(88,143,180,0.12)" glow="rgba(88,143,180,0.15)" />
            <div>
              <h3 className="section-title" style={{ fontSize: '24px', margin: 0 }}>Hackhaton <em>Dashboard</em></h3>
              <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.52)' }}>
                {hackhatonDashboard?.hero?.subtitle || 'Chart, rapor ve dokuman vitrini'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span className="tech-badge" style={{ background: 'rgba(88,143,180,0.12)', color: 'var(--sky)' }}>
              {hackhatonDashboard?.scope?.locationLabel || weatherScopeTarget}
            </span>
            <span className="tech-badge" style={{ background: 'rgba(245,237,216,0.07)', color: 'rgba(245,237,216,0.72)' }}>
              sekmeli okuma modu
            </span>
          </div>
        </div>

        {hackhatonDashboardError ? (
          <div className="bento-card" style={{ padding: '16px', border: '1px solid rgba(224,112,112,0.2)', background: 'rgba(224,112,112,0.05)', color: 'rgba(245,237,216,0.8)', marginBottom: '14px' }}>
            {hackhatonDashboardError}
          </div>
        ) : null}

        {dashboardOverviewStats.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '14px' }}>
            {dashboardOverviewStats.map((item) => (
              <div key={item.id} className="bento-card" style={{ padding: '14px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${item.tone}` }}>
                <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.45)', marginBottom: '6px' }}>{item.label}</div>
                <strong style={{ fontSize: '24px', fontFamily: 'JetBrains Mono' }}>{item.value}</strong>
              </div>
            ))}
          </div>
        ) : null}

        {dashboardSectionTabs.length > 0 ? (
          <div className="bento-card" style={{ padding: '10px', marginBottom: '16px', background: 'rgba(10,22,18,0.46)', border: '1px solid rgba(88,143,180,0.14)' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {dashboardSectionTabs.map((item) => (
                <button
                  key={item.id}
                  className="btn-secondary"
                  onClick={() => setHackhatonPanel(item.id)}
                  style={{
                    padding: '10px 14px',
                    borderColor: hackhatonPanel === item.id ? 'rgba(88,143,180,0.35)' : 'rgba(255,255,255,0.08)',
                    background: hackhatonPanel === item.id ? 'rgba(88,143,180,0.18)' : 'rgba(255,255,255,0.03)',
                    color: hackhatonPanel === item.id ? 'var(--sky)' : 'rgba(245,237,216,0.82)'
                  }}
                >
                  <span>{item.label}</span>
                  <span style={{ marginLeft: '8px', fontFamily: 'JetBrains Mono', fontSize: '11px', opacity: 0.75 }}>{item.count}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {hackhatonPanel === 'overview' ? (
          <div style={{ display: 'grid', gap: '16px' }}>
            {dashboardVisuals.length > 0 ? (
              <div className="bento-card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: 700 }}>Canli chart vitrini</div>
                    <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.55)' }}>Model suite içindeki en güçlü grafiklerden kısa özet.</div>
                  </div>
                  <span className="tech-badge" style={{ background: 'rgba(88,143,180,0.12)', color: 'var(--sky)' }}>{dashboardVisuals.length} grafik</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                  {dashboardVisuals.slice(0, 3).map((item) => (
                    <div key={item.id} style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '12px', background: 'rgba(255,255,255,0.03)' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>{item.title}</div>
                      <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.55)', marginBottom: '10px' }}>{item.subtitle}</div>
                      {item.chart?.url ? (
                        <img
                          src={resolveHackhatonAssetUrl(item.chart)}
                          alt={item.title}
                          style={{ width: '100%', height: '160px', objectFit: 'cover', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
              <div className="bento-card" style={{ padding: '16px', background: 'rgba(15,26,15,0.42)', border: '1px solid rgba(143,188,69,0.14)' }}>
                <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px' }}>Raporlar</div>
                <div style={{ display: 'grid', gap: '10px' }}>
                  {dashboardDocuments.map((item) => (
                    <a
                      key={item.id}
                      href={resolveHackhatonAssetUrl(item.asset)}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary"
                      style={{ justifyContent: 'space-between', padding: '12px 14px', textDecoration: 'none' }}
                    >
                      <span>{item.title}</span>
                      <DownloadCloud size={14} />
                    </a>
                  ))}
                </div>
              </div>

              <div className="bento-card" style={{ padding: '16px', background: 'rgba(15,26,15,0.42)', border: '1px solid rgba(212,168,67,0.14)' }}>
                <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px' }}>Yorum katmani</div>
                <div style={{ display: 'grid', gap: '10px' }}>
                  {dashboardNarratives.map((item) => (
                    <div key={item.id} style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '12px', background: 'rgba(255,255,255,0.03)' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>{item.title}</div>
                      <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.65)', lineHeight: 1.6 }}>
                        {item.excerpt || 'Ozet bulunamadi.'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {dashboardDatasetHighlights.length > 0 ? (
              <div className="bento-card" style={{ padding: '16px' }}>
                <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '14px' }}>Veri seti ve validasyon ozetleri</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                  {dashboardDatasetHighlights.map((item) => (
                    <div key={item.id} style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '14px', background: 'rgba(255,255,255,0.03)' }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>{item.title}</div>
                      <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.62)', lineHeight: 1.6, marginBottom: '12px' }}>
                        {item.summary}
                      </div>
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {(item.metrics || []).map((metric) => (
                          <div key={`${item.id}-${metric.label}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                            <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.45)' }}>{metric.label}</span>
                            <strong style={{ fontSize: '12px', fontFamily: 'JetBrains Mono' }}>{metric.value}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {(showLongTerm || showHybrid) ? (
              <div style={{ display: 'grid', gridTemplateColumns: showLongTerm && showHybrid ? 'minmax(0, 1.12fr) minmax(0, 0.88fr)' : 'minmax(0, 1fr)', gap: '16px', alignItems: 'start' }}>
                {showLongTerm ? (
                  <div className="bento-card" style={{ padding: '16px', background: 'linear-gradient(145deg, rgba(24,38,28,0.6), rgba(12,24,16,0.7))', border: '1px solid rgba(143,188,69,0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
                      <div>
                        <div style={{ fontSize: '18px', fontWeight: 700 }}>{longTermTitle}</div>
                        <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.56)' }}>{longTermSubtitle}</div>
                      </div>
                      <span className="tech-badge" style={{ background: 'rgba(212,168,67,0.12)', color: 'var(--wheat)' }}>
                        {dashboardLongTerm.yearCount} yil
                      </span>
                    </div>

                    {dashboardLongTermHighlights.length ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                        {dashboardLongTermHighlights.map((item) => (
                          <div key={item.label} style={{ padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)' }}>
                            <div style={{ fontSize: '10px', color: 'rgba(245,237,216,0.45)' }}>{item.label}</div>
                            <strong style={{ display: 'block', marginTop: '6px', fontSize: '16px' }}>{item.value}</strong>
                            <div style={{ marginTop: '4px', fontSize: '11px', color: 'rgba(245,237,216,0.6)' }}>{item.detail}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {(() => {
                      const years = longTermWindow.years || [];
                      if (isSolarLongTerm) {
                        const sunshine = longTermWindow.sunshineHoursDay || [];
                        const radiation = longTermWindow.radiationDay || [];
                        const clouds = longTermWindow.cloudPct || [];
                        const forecastYears = longTermWindow.forecastYears || [];
                        const forecastSunshine = longTermWindow.forecastSunshine || [];
                        const forecastRadiation = longTermWindow.forecastRadiation || [];
                        const maxCloud = Math.max(1, ...clouds.map((v) => Number(v || 0)));
                        const allSunshine = sunshine.concat(forecastSunshine);
                        const maxSun = Math.max(...allSunshine.map((v) => Number(v || 0)), 1);
                        const minSun = Math.min(...allSunshine.map((v) => Number(v || 0)), 0);
                        const sunRange = maxSun - minSun || 1;
                        const totalSunCount = sunshine.length + forecastSunshine.length;
                        const buildSunPoints = (vals, offset = 0) =>
                          vals
                            .map((val, idx) => {
                              const x = ((idx + offset) / Math.max(1, totalSunCount - 1)) * 600;
                              const y = 140 - ((Number(val || 0) - minSun) / sunRange) * 110 - 15;
                              return `${x},${y}`;
                            })
                            .join(' ');
                        const sunshinePoints = buildSunPoints(sunshine, 0);
                        const sunshineForecastPoints = buildSunPoints(forecastSunshine, sunshine.length - 1);

                        const allRadiation = radiation.concat(forecastRadiation);
                        const maxRad = Math.max(...allRadiation.map((v) => Number(v || 0)), 1);
                        const minRad = Math.min(...allRadiation.map((v) => Number(v || 0)), 0);
                        const radRange = maxRad - minRad || 1;
                        const totalRadCount = radiation.length + forecastRadiation.length;
                        const buildRadPoints = (vals, offset = 0) =>
                          vals
                            .map((val, idx) => {
                              const x = ((idx + offset) / Math.max(1, totalRadCount - 1)) * 600;
                              const y = 140 - ((Number(val || 0) - minRad) / radRange) * 110 - 15;
                              return `${x},${y}`;
                            })
                            .join(' ');
                        const radiationPoints = buildRadPoints(radiation, 0);
                        const radiationForecastPoints = buildRadPoints(forecastRadiation, radiation.length - 1);

                        return (
                          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '14px' }}>
                            <div className="bento-card" style={{ padding: '14px', background: 'rgba(255,255,255,0.03)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                <div style={{ fontSize: '13px', fontWeight: 700 }}>Guneslenme + bulut (son 24 yil)</div>
                                <span style={{ fontSize: '10px', color: 'rgba(245,237,216,0.5)' }}>+ {forecastYears.length} yil tahmin</span>
                              </div>
                              <div style={{ height: '180px', position: 'relative', borderLeft: '1px solid rgba(255,255,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                {clouds.map((val, idx) => (
                                  <div
                                    key={`cloud-${years[idx]}`}
                                    style={{
                                      position: 'absolute',
                                      bottom: 0,
                                      left: `${(idx / Math.max(1, years.length - 1)) * 100}%`,
                                      width: `${80 / Math.max(1, years.length)}%`,
                                      height: `${Math.min(100, (Number(val || 0) / maxCloud) * 100)}%`,
                                      background: 'rgba(88,143,180,0.3)',
                                      borderRadius: '2px 2px 0 0'
                                    }}
                                  />
                                ))}
                                <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} preserveAspectRatio="none">
                                  <polyline points={sunshinePoints} fill="none" stroke="var(--wheat)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
                                  {sunshineForecastPoints ? (
                                    <polyline points={sunshineForecastPoints} fill="none" stroke="var(--wheat)" strokeWidth="3" strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />
                                  ) : null}
                                </svg>
                              </div>
                              <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'rgba(245,237,216,0.4)' }}>
                                <span>{years[0]}</span>
                                <span>{years[years.length - 1]}</span>
                              </div>
                            </div>

                            <div className="bento-card" style={{ padding: '14px', background: 'rgba(255,255,255,0.03)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                <div style={{ fontSize: '13px', fontWeight: 700 }}>Radyasyon MJ/m2/gun (son 24 yil)</div>
                                <span style={{ fontSize: '10px', color: 'rgba(245,237,216,0.5)' }}>+ {forecastYears.length} yil tahmin</span>
                              </div>
                              <div style={{ height: '180px', position: 'relative', borderLeft: '1px solid rgba(255,255,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} preserveAspectRatio="none">
                                  <polyline points={radiationPoints} fill="none" stroke="var(--sprout)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
                                  {radiationForecastPoints ? (
                                    <polyline points={radiationForecastPoints} fill="none" stroke="var(--sprout)" strokeWidth="3" strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />
                                  ) : null}
                                </svg>
                              </div>
                              <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'rgba(245,237,216,0.4)' }}>
                                <span>{years[0]}</span>
                                <span>{years[years.length - 1]}</span>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      const temps = longTermWindow.temps || [];
                      const precip = longTermWindow.precip || [];
                      const forecastYears = longTermWindow.forecastYears || [];
                      const forecastTemp = longTermWindow.forecastTemp || [];
                      const maxPrecip = Math.max(1, ...precip.map((v) => Number(v || 0)));
                      const allTemps = temps.concat(forecastTemp);
                      const maxTemp = Math.max(...allTemps.map((v) => Number(v || 0)), 1);
                      const minTemp = Math.min(...allTemps.map((v) => Number(v || 0)), 0);
                      const tempRange = maxTemp - minTemp || 1;
                      const totalCount = temps.length + forecastTemp.length;
                      const buildPoints = (vals, offset = 0) =>
                        vals
                          .map((val, idx) => {
                            const x = ((idx + offset) / Math.max(1, totalCount - 1)) * 600;
                            const y = 140 - ((Number(val || 0) - minTemp) / tempRange) * 110 - 15;
                            return `${x},${y}`;
                          })
                          .join(' ');

                      const actualPoints = buildPoints(temps, 0);
                      const forecastPoints = buildPoints(forecastTemp, temps.length - 1);
                      return (
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '14px' }}>
                          <div className="bento-card" style={{ padding: '14px', background: 'rgba(255,255,255,0.03)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                              <div style={{ fontSize: '13px', fontWeight: 700 }}>Sicaklik vs Yagis (son 24 yil)</div>
                              <span style={{ fontSize: '10px', color: 'rgba(245,237,216,0.5)' }}>+ {forecastYears.length} yil tahmin</span>
                            </div>
                            <div style={{ height: '180px', position: 'relative', borderLeft: '1px solid rgba(255,255,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                              {precip.map((val, idx) => (
                                <div
                                  key={`precip-${years[idx]}`}
                                  style={{
                                    position: 'absolute',
                                    bottom: 0,
                                    left: `${(idx / Math.max(1, years.length - 1)) * 100}%`,
                                    width: `${80 / Math.max(1, years.length)}%`,
                                    height: `${Math.min(100, (Number(val || 0) / maxPrecip) * 100)}%`,
                                    background: 'rgba(88,143,180,0.45)',
                                    borderRadius: '2px 2px 0 0'
                                  }}
                                />
                              ))}
                              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} preserveAspectRatio="none">
                                <polyline points={actualPoints} fill="none" stroke="var(--wheat)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
                                {forecastPoints ? (
                                  <polyline points={forecastPoints} fill="none" stroke="var(--wheat)" strokeWidth="3" strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />
                                ) : null}
                              </svg>
                            </div>
                            <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'rgba(245,237,216,0.4)' }}>
                              <span>{years[0]}</span>
                              <span>{years[years.length - 1]}</span>
                            </div>
                          </div>

                          <div className="bento-card" style={{ padding: '14px', background: 'rgba(255,255,255,0.03)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                              <div style={{ fontSize: '13px', fontWeight: 700 }}>ET0 ortalama (son 24 yil)</div>
                              <span style={{ fontSize: '10px', color: 'rgba(245,237,216,0.5)' }}>+ {forecastYears.length} yil tahmin</span>
                            </div>
                            {(() => {
                              const et0Vals = longTermWindow.et0Mean || [];
                              const forecastEt0 = longTermWindow.forecastEt0 || [];
                              const allEt0 = et0Vals.concat(forecastEt0);
                              const maxEt0 = Math.max(...allEt0.map((v) => Number(v || 0)), 1);
                              const minEt0 = Math.min(...allEt0.map((v) => Number(v || 0)), 0);
                              const rangeEt0 = maxEt0 - minEt0 || 1;
                              const totalEt0Count = et0Vals.length + forecastEt0.length;
                              const toPoints = (vals, offset = 0) =>
                                vals
                                  .map((val, idx) => {
                                    const x = ((idx + offset) / Math.max(1, totalEt0Count - 1)) * 600;
                                    const y = 140 - ((Number(val || 0) - minEt0) / rangeEt0) * 110 - 15;
                                    return `${x},${y}`;
                                  })
                                  .join(' ');
                              const et0Actual = toPoints(et0Vals, 0);
                              const et0Forecast = toPoints(forecastEt0, et0Vals.length - 1);
                              return (
                                <>
                                  <div style={{ height: '180px', position: 'relative', borderLeft: '1px solid rgba(255,255,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} preserveAspectRatio="none">
                                      <polyline points={et0Actual} fill="none" stroke="var(--sprout)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
                                      {et0Forecast ? (
                                        <polyline points={et0Forecast} fill="none" stroke="var(--sprout)" strokeWidth="3" strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />
                                      ) : null}
                                    </svg>
                                  </div>
                                  <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'rgba(245,237,216,0.4)' }}>
                                    <span>{years[0]}</span>
                                    <span>{years[years.length - 1]}</span>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : null}

                {showHybrid ? (
                  <div className="bento-card" style={{ padding: '16px', background: 'linear-gradient(145deg, rgba(16,26,24,0.75), rgba(12,24,16,0.72))', border: '1px solid rgba(88,143,180,0.18)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
                      <div>
                        <div style={{ fontSize: '18px', fontWeight: 700 }}>Hibrit sıcaklık + yağış paneli</div>
                        <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.56)' }}>
                          {dashboardHybrid?.periodStart || '-'}-{dashboardHybrid?.periodEnd || '-'} arasi tarihsel seri + model-suite projeksiyon
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <span className="tech-badge" style={{ background: 'rgba(88,143,180,0.12)', color: 'var(--sky)' }}>
                          Hibrit
                        </span>
                        {dashboardHybridTrends?.temp?.perDecade != null ? (
                          <span className="tech-badge" style={{ background: 'rgba(212,168,67,0.12)', color: 'var(--wheat)' }}>
                            Trend {dashboardHybridTrends.temp.perDecade > 0 ? '+' : ''}{dashboardHybridTrends.temp.perDecade} {dashboardHybridTrends.temp.unit}/10y
                          </span>
                        ) : null}
                        {dashboardHybridTrends?.precip?.perDecade != null ? (
                          <span className="tech-badge" style={{ background: 'rgba(88,143,180,0.12)', color: 'var(--sky)' }}>
                            Trend {dashboardHybridTrends.precip.perDecade > 0 ? '+' : ''}{dashboardHybridTrends.precip.perDecade} {dashboardHybridTrends.precip.unit}/10y
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {dashboardHybridHighlights.length ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '12px' }}>
                        {dashboardHybridHighlights.map((item) => (
                          <div key={item.label} style={{ padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)' }}>
                            <div style={{ fontSize: '10px', color: 'rgba(245,237,216,0.45)' }}>{item.label}</div>
                            <strong style={{ display: 'block', marginTop: '6px', fontSize: '15px' }}>{item.value}</strong>
                            <div style={{ marginTop: '4px', fontSize: '11px', color: 'rgba(245,237,216,0.6)' }}>{item.detail}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {(() => {
                      const tempYears = dashboardHybridTemp?.years || [];
                      const tempVals = dashboardHybridTemp?.values || [];
                      const tempForecastStart = Number.isFinite(dashboardHybridTemp?.forecastStartIndex) ? dashboardHybridTemp.forecastStartIndex : -1;
                      const precipYears = dashboardHybridPrecip?.years || [];
                      const precipVals = dashboardHybridPrecip?.values || [];
                      const precipForecastStart = Number.isFinite(dashboardHybridPrecip?.forecastStartIndex) ? dashboardHybridPrecip.forecastStartIndex : -1;
                      const tempLast10 = dashboardHybridLast10?.temp || null;
                      const precipLast10 = dashboardHybridLast10?.precip || null;
                      if (!tempYears.length && !precipYears.length) return null;

                      const buildLinePoints = (vals, indices, minVal, range, totalCount) =>
                        indices
                          .map((idx) => {
                            const x = (idx / Math.max(1, totalCount - 1)) * 520;
                            const y = 140 - ((Number(vals[idx] || 0) - minVal) / range) * 105 - 12;
                            return `${x},${y}`;
                          })
                          .join(' ');

                      const tempTotal = tempYears.length;
                      const tempMax = Math.max(...tempVals.map((v) => Number(v || 0)), 1);
                      const tempMin = Math.min(...tempVals.map((v) => Number(v || 0)), 0);
                      const tempRange = tempMax - tempMin || 1;
                      const tempForecastIdx = tempForecastStart >= 0 ? tempForecastStart : tempTotal;
                      const tempActualIdx = Array.from({ length: Math.max(0, tempForecastIdx) }, (_, i) => i);
                      const tempForecastIdxs =
                        tempForecastStart >= 0
                          ? Array.from({ length: Math.max(0, tempTotal - tempForecastIdx + 1) }, (_, i) => i + tempForecastIdx - 1).filter((i) => i >= 0)
                          : [];
                      const tempActualPoints = buildLinePoints(tempVals, tempActualIdx, tempMin, tempRange, tempTotal);
                      const tempForecastPoints = buildLinePoints(tempVals, tempForecastIdxs, tempMin, tempRange, tempTotal);
                      const tempBand = (() => {
                        if (!tempLast10?.years?.length || tempLast10.mean == null || tempLast10.std == null) return null;
                        const startYear = tempLast10.years[0];
                        const endYear = tempLast10.years[tempLast10.years.length - 1];
                        const startIdx = tempYears.findIndex((y) => y === startYear);
                        const endIdx = tempYears.findIndex((y) => y === endYear);
                        if (startIdx < 0 || endIdx < startIdx) return null;
                        const lower = tempLast10.mean - tempLast10.std;
                        const upper = tempLast10.mean + tempLast10.std;
                        const toY = (val) => 140 - ((Number(val || 0) - tempMin) / tempRange) * 105 - 12;
                        const yUpper = toY(upper);
                        const yLower = toY(lower);
                        const bandHeight = Math.max(0, yLower - yUpper);
                        const x = (startIdx / Math.max(1, tempTotal - 1)) * 520;
                        const width = ((endIdx - startIdx) / Math.max(1, tempTotal - 1)) * 520;
                        return { x, y: yUpper, height: bandHeight, width };
                      })();

                      const precipTotal = precipYears.length;
                      const precipMax = Math.max(...precipVals.map((v) => Number(v || 0)), 1);
                      return (
                        <div style={{ display: 'grid', gap: '12px' }}>
                          {tempYears.length ? (
                            <div className="bento-card" style={{ padding: '12px', background: 'rgba(255,255,255,0.03)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <div style={{ fontSize: '13px', fontWeight: 700 }}>Yillik sicaklik (C)</div>
                                <span style={{ fontSize: '10px', color: 'rgba(245,237,216,0.5)' }}>
                                  {tempYears[0]}-{tempYears[tempYears.length - 1]}
                                </span>
                              </div>
                              <div style={{ height: '170px', position: 'relative', borderLeft: '1px solid rgba(255,255,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} preserveAspectRatio="none">
                                  {tempBand ? (
                                    <rect
                                      x={tempBand.x}
                                      y={tempBand.y}
                                      width={tempBand.width}
                                      height={tempBand.height}
                                      fill="rgba(212,168,67,0.16)"
                                      stroke="rgba(212,168,67,0.35)"
                                      strokeDasharray="6 6"
                                    />
                                  ) : null}
                                  <polyline points={tempActualPoints} fill="none" stroke="var(--wheat)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
                                  {tempForecastIdxs.length ? (
                                    <polyline points={tempForecastPoints} fill="none" stroke="var(--wheat)" strokeWidth="3" strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />
                                  ) : null}
                                </svg>
                              </div>
                              {tempLast10?.mean != null ? (
                                <div style={{ marginTop: '6px', fontSize: '10px', color: 'rgba(245,237,216,0.5)' }}>
                                  Son 10 yil bandi: {tempLast10.mean} ± {tempLast10.std} {dashboardHybridTrends?.temp?.unit || 'C'}
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          {precipYears.length ? (
                            <div className="bento-card" style={{ padding: '12px', background: 'rgba(255,255,255,0.03)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <div style={{ fontSize: '13px', fontWeight: 700 }}>Yıllık yağış (mm)</div>
                                <span style={{ fontSize: '10px', color: 'rgba(245,237,216,0.5)' }}>
                                  {precipYears[0]}-{precipYears[precipYears.length - 1]}
                                </span>
                              </div>
                              <div style={{ height: '170px', position: 'relative', borderLeft: '1px solid rgba(255,255,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                {(() => {
                                  if (!precipLast10?.years?.length || precipLast10.mean == null || precipLast10.std == null) return null;
                                  const startYear = precipLast10.years[0];
                                  const endYear = precipLast10.years[precipLast10.years.length - 1];
                                  const startIdx = precipYears.findIndex((y) => y === startYear);
                                  const endIdx = precipYears.findIndex((y) => y === endYear);
                                  if (startIdx < 0 || endIdx < startIdx) return null;
                                  const lower = Math.max(0, precipLast10.mean - precipLast10.std);
                                  const upper = Math.max(lower, precipLast10.mean + precipLast10.std);
                                  const lowerPct = (lower / Math.max(1, precipMax)) * 100;
                                  const upperPct = (upper / Math.max(1, precipMax)) * 100;
                                  const leftPct = (startIdx / Math.max(1, precipTotal - 1)) * 100;
                                  const widthPct = ((endIdx - startIdx) / Math.max(1, precipTotal - 1)) * 100;
                                  return (
                                    <div
                                      style={{
                                        position: 'absolute',
                                        left: `${leftPct}%`,
                                        width: `${widthPct}%`,
                                        bottom: `${lowerPct}%`,
                                        height: `${Math.max(0, upperPct - lowerPct)}%`,
                                        background: 'rgba(88,143,180,0.18)',
                                        border: '1px dashed rgba(88,143,180,0.35)',
                                        borderRadius: '6px'
                                      }}
                                    />
                                  );
                                })()}
                                {precipVals.map((val, idx) => {
                                  const isForecast = precipForecastStart >= 0 && idx >= precipForecastStart;
                                  return (
                                    <div
                                      key={`precip-hybrid-${precipYears[idx]}`}
                                      style={{
                                        position: 'absolute',
                                        bottom: 0,
                                        left: `${(idx / Math.max(1, precipTotal - 1)) * 100}%`,
                                        width: `${80 / Math.max(1, precipTotal)}%`,
                                        height: `${Math.min(100, (Number(val || 0) / precipMax) * 100)}%`,
                                        background: isForecast ? 'rgba(88,143,180,0.25)' : 'rgba(88,143,180,0.5)',
                                        borderRadius: '2px 2px 0 0'
                                      }}
                                    />
                                  );
                                })}
                              </div>
                              {precipLast10?.mean != null ? (
                                <div style={{ marginTop: '6px', fontSize: '10px', color: 'rgba(245,237,216,0.5)' }}>
                                  Son 10 yil bandi: {precipLast10.mean} ± {precipLast10.std} {dashboardHybridTrends?.precip?.unit || 'mm'}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })()}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {hackhatonPanel === 'presentation' ? (
          <div style={{ display: 'grid', gap: '16px' }}>
            {dashboardPresentation ? (
              <div className="bento-card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: 700 }}>{dashboardPresentation.title}</div>
                    <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.55)' }}>
                      {dashboardPresentation.subtitle} • {dashboardPresentation.slideCount || 0} slayt
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {dashboardPresentation.html ? (
                      <a href={resolveHackhatonAssetUrl(dashboardPresentation.html)} target="_blank" rel="noreferrer" className="btn-secondary" style={{ textDecoration: 'none' }}>
                        HTML sunum
                      </a>
                    ) : null}
                    {dashboardPresentation.pdf ? (
                      <a href={resolveHackhatonAssetUrl(dashboardPresentation.pdf)} target="_blank" rel="noreferrer" className="btn-secondary" style={{ textDecoration: 'none' }}>
                        PDF sunum
                      </a>
                    ) : null}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                  {getExpandedItems(dashboardSlides, 'slides', 4).map((item) => (
                    <div key={item.id} style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', overflow: 'hidden', background: 'rgba(255,255,255,0.03)' }}>
                      {item.image?.url ? (
                        <img
                          src={resolveHackhatonAssetUrl(item.image)}
                          alt={item.title}
                          style={{ width: '100%', height: '150px', objectFit: 'cover', display: 'block' }}
                        />
                      ) : null}
                      <div style={{ padding: '12px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>{item.title}</div>
                        <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.6)', lineHeight: 1.5 }}>
                          {item.excerpt || 'Sunum slaydi'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {shouldShowExpand(dashboardSlides, 4) ? (
                  <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center' }}>
                    <button className="btn-secondary" onClick={() => toggleDashboardExpand('slides')}>
                      {dashboardExpand.slides ? 'Daha az göster' : `Tüm slaytları göster (${dashboardSlides.length})`}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {dashboardGemGallery.length > 0 ? (
              <div className="bento-card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: 700 }}>Secilmis grafik galerisi</div>
                    <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.55)' }}>Sunum disindaki en kritik ciktilar. Varsayilan olarak kisa liste gosterilir.</div>
                  </div>
                  <span className="tech-badge" style={{ background: 'rgba(88,143,180,0.12)', color: 'var(--sky)' }}>{dashboardGemGallery.length} grafik</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                  {getExpandedItems(dashboardGemGallery, 'gallery', 4).map((item) => (
                    <div key={item.id} style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', overflow: 'hidden', background: 'rgba(255,255,255,0.03)' }}>
                      <img
                        src={resolveHackhatonAssetUrl(item.asset)}
                        alt={item.title}
                        style={{ width: '100%', height: '150px', objectFit: 'cover', display: 'block' }}
                      />
                      <div style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '6px' }}>
                          <div style={{ fontSize: '13px', fontWeight: 700 }}>{item.title}</div>
                          <span className="tech-badge" style={{ background: 'rgba(88,143,180,0.12)', color: 'var(--sky)' }}>{item.group}</span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.6)' }}>{item.subtitle}</div>
                      </div>
                    </div>
                  ))}
                </div>
                {shouldShowExpand(dashboardGemGallery, 4) ? (
                  <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center' }}>
                    <button className="btn-secondary" onClick={() => toggleDashboardExpand('gallery')}>
                      {dashboardExpand.gallery ? 'Galeriyi daralt' : `Tüm grafikler (${dashboardGemGallery.length})`}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {hackhatonPanel === 'playbooks' ? (
          <div className="bento-card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>Tarım playbook kütüphanesi</div>
                <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.55)' }}>
                  En değerli rehberler burada. Tüm içeriği aynı anda açmak yerine kategori bazlı kartlar kullanılıyor.
                </div>
              </div>
              <span className="tech-badge" style={{ background: 'rgba(143,188,69,0.12)', color: 'var(--sprout)' }}>
                {dashboardPlaybooks.length} rehber
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
              {getExpandedItems(dashboardPlaybooks, 'playbooks', 4).map((item) => (
                <div key={item.id} style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '14px', background: 'rgba(255,255,255,0.03)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '8px', alignItems: 'center' }}>
                    <span className="tech-badge" style={{ background: 'rgba(88,143,180,0.12)', color: 'var(--sky)' }}>{item.category}</span>
                    {item.asset ? (
                      <a href={resolveHackhatonAssetUrl(item.asset)} target="_blank" rel="noreferrer" className="btn-secondary" style={{ textDecoration: 'none', padding: '8px 10px' }}>
                        Ac
                      </a>
                    ) : null}
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>{item.title}</div>
                  <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.68)', lineHeight: 1.55, marginBottom: '10px' }}>
                    {item.subtitle}
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.54)', lineHeight: 1.6, marginBottom: '12px' }}>
                    {item.excerpt}
                  </div>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {(item.metrics || []).map((metric) => (
                      <div key={`${item.id}-${metric.label}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.45)' }}>{metric.label}</span>
                        <strong style={{ fontSize: '12px', fontFamily: 'JetBrains Mono' }}>{metric.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {shouldShowExpand(dashboardPlaybooks, 4) ? (
              <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center' }}>
                <button className="btn-secondary" onClick={() => toggleDashboardExpand('playbooks')}>
                  {dashboardExpand.playbooks ? 'Rehberleri daralt' : `Tüm rehberler (${dashboardPlaybooks.length})`}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {hackhatonPanel === 'drought' && dashboardDroughtIntel ? (
          <div className="bento-card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>{dashboardDroughtIntel.title}</div>
                <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.55)' }}>{dashboardDroughtIntel.subtitle}</div>
              </div>
              <span className="tech-badge" style={{ background: 'rgba(212,168,67,0.12)', color: 'var(--wheat)' }}>
                erken uyarı + rapor
              </span>
            </div>

            {dashboardDroughtCards.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                {dashboardDroughtCards.map((item) => (
                  <div key={item.id} style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '14px', background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.45)', marginBottom: '6px' }}>{item.label}</div>
                    <div style={{ fontSize: '22px', fontWeight: 800, marginBottom: '4px' }}>{item.value}</div>
                    <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>{item.detail}</div>
                  </div>
                ))}
              </div>
            ) : null}

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(320px, 1.05fr)', gap: '14px' }}>
              <div className="bento-card" style={{ padding: '14px', background: 'rgba(15,26,15,0.34)', border: '1px solid rgba(143,188,69,0.14)' }}>
                <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px' }}>Kuraklik raporlari</div>
                <div style={{ display: 'grid', gap: '10px' }}>
                  {dashboardDroughtDocuments.map((item) => (
                    <div key={item.id} style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '12px', background: 'rgba(255,255,255,0.03)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', marginBottom: '6px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700 }}>{item.title}</div>
                        {item.asset ? (
                          <a href={resolveHackhatonAssetUrl(item.asset)} target="_blank" rel="noreferrer" className="btn-secondary" style={{ textDecoration: 'none', padding: '8px 10px' }}>
                            Oku
                          </a>
                        ) : null}
                      </div>
                      <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.5)', marginBottom: '6px' }}>{item.subtitle}</div>
                      <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.62)', lineHeight: 1.55 }}>{item.excerpt}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bento-card" style={{ padding: '14px', background: 'rgba(15,26,15,0.34)', border: '1px solid rgba(212,168,67,0.14)' }}>
                <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px' }}>Aylık erken uyarı takvimi</div>
                <div style={{ display: 'grid', gap: '8px' }}>
                  {dashboardDroughtAlerts.map((item) => (
                    <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '84px 1fr 1fr 1fr', gap: '8px', alignItems: 'center', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '10px 12px', background: 'rgba(255,255,255,0.03)' }}>
                      <strong style={{ fontSize: '12px' }}>{item.month}</strong>
                      <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>risk {item.riskScore}</span>
                      <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>kuru {item.dryProb}</span>
                      <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>sıcak {item.hotProb}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {dashboardDroughtVisuals.length > 0 ? (
              <div style={{ marginTop: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                  {getExpandedItems(dashboardDroughtVisuals, 'droughtVisuals', 3).map((item) => (
                    <div key={item.id} style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', overflow: 'hidden', background: 'rgba(255,255,255,0.03)' }}>
                      <img
                        src={resolveHackhatonAssetUrl(item.asset)}
                        alt={item.title}
                        style={{ width: '100%', height: '150px', objectFit: 'cover', display: 'block' }}
                      />
                      <div style={{ padding: '12px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>{item.title}</div>
                        <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.6)' }}>{item.subtitle}</div>
                      </div>
                    </div>
                  ))}
                </div>
                {shouldShowExpand(dashboardDroughtVisuals, 3) ? (
                  <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center' }}>
                    <button className="btn-secondary" onClick={() => toggleDashboardExpand('droughtVisuals')}>
                      {dashboardExpand.droughtVisuals ? 'Görselleri daralt' : `Tüm kuraklık görselleri (${dashboardDroughtVisuals.length})`}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {(dashboardDroughtRiskYears.length > 0 || dashboardDroughtIndicatorNotes.length > 0) ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(260px, 1fr)', gap: '14px', marginTop: '14px' }}>
                <div className="bento-card" style={{ padding: '14px', background: 'rgba(15,26,15,0.34)', border: '1px solid rgba(224,112,112,0.12)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ fontSize: '16px', fontWeight: 700 }}>En riskli yillar</div>
                    <span className="tech-badge" style={{ background: 'rgba(224,112,112,0.1)', color: '#E07070' }}>{dashboardDroughtRiskYears.length} yil</span>
                  </div>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {getExpandedItems(dashboardDroughtRiskYears, 'droughtYears', 3).map((item) => (
                      <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '64px 1fr 1fr 90px', gap: '8px', alignItems: 'center', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '10px 12px', background: 'rgba(255,255,255,0.03)' }}>
                        <strong style={{ fontSize: '12px' }}>{item.year}</strong>
                        <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>{item.classLabel}</span>
                        <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>{item.droughtClass}</span>
                        <span style={{ fontSize: '11px', fontFamily: 'JetBrains Mono' }}>{item.precip}</span>
                      </div>
                    ))}
                  </div>
                  {shouldShowExpand(dashboardDroughtRiskYears, 3) ? (
                    <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center' }}>
                      <button className="btn-secondary" onClick={() => toggleDashboardExpand('droughtYears')}>
                        {dashboardExpand.droughtYears ? 'Yılları daralt' : `Tüm risk yılları (${dashboardDroughtRiskYears.length})`}
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="bento-card" style={{ padding: '14px', background: 'rgba(15,26,15,0.34)', border: '1px solid rgba(88,143,180,0.14)' }}>
                  <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px' }}>Gosterge notlari</div>
                  <div style={{ display: 'grid', gap: '10px' }}>
                    {dashboardDroughtIndicatorNotes.map((item) => (
                      <div key={item.id} style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '12px', background: 'rgba(255,255,255,0.03)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '6px' }}>
                          <strong style={{ fontSize: '12px' }}>{item.indicator}</strong>
                          <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.48)' }}>{item.baseline} -> {item.future}</span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.62)', lineHeight: 1.55 }}>{item.note}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {hackhatonPanel === 'water' && dashboardWaterDecision ? (
          <div className="bento-card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>{dashboardWaterDecision.title}</div>
                <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.55)' }}>{dashboardWaterDecision.subtitle}</div>
              </div>
              <span className="tech-badge" style={{ background: 'rgba(88,143,180,0.12)', color: 'var(--sky)' }}>
                dashboard + scenario
              </span>
            </div>

            {dashboardWaterCards.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                {dashboardWaterCards.map((item) => (
                  <div key={item.id} style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '14px', background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.45)', marginBottom: '6px' }}>{item.label}</div>
                    <div style={{ fontSize: '22px', fontWeight: 800, marginBottom: '4px' }}>{item.value}</div>
                    <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>{item.detail}</div>
                  </div>
                ))}
              </div>
            ) : null}

            {(dashboardWaterStrategyPulse || dashboardWaterHistorySummary || dashboardWaterScenarioMatrix.length > 0) ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1.1fr) minmax(320px, 1fr)', gap: '14px', marginBottom: '14px' }}>
                <div className="bento-card" style={{ padding: '14px', background: 'rgba(15,26,15,0.34)', border: '1px solid rgba(88,143,180,0.14)' }}>
                  <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px' }}>Baraj kokpiti</div>

                  {dashboardWaterStrategyPulse ? (
                    <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '12px', background: 'rgba(255,255,255,0.03)', marginBottom: '12px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Model seçim nabzi</div>
                      <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.62)', lineHeight: 1.55, marginBottom: '10px' }}>{dashboardWaterStrategyPulse.headline}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px' }}>
                        {[
                          { label: 'RMSE lift', value: dashboardWaterStrategyPulse.rmseLift },
                          { label: 'MAE lift', value: dashboardWaterStrategyPulse.maeLift },
                          { label: 'SMAPE lift', value: dashboardWaterStrategyPulse.smapeLift },
                          { label: 'Ensemble payi', value: dashboardWaterStrategyPulse.ensembleShare },
                          { label: 'Seri', value: dashboardWaterStrategyPulse.seriesCount },
                          { label: 'Recent RMSE', value: dashboardWaterStrategyPulse.recentRmse }
                        ].map((metric) => (
                          <div key={metric.label} style={{ borderRadius: '10px', padding: '10px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <div style={{ fontSize: '10px', color: 'rgba(245,237,216,0.45)', marginBottom: '4px' }}>{metric.label}</div>
                            <div style={{ fontSize: '14px', fontWeight: 700 }}>{metric.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {dashboardWaterHistorySummary ? (
                    <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '12px', background: 'rgba(255,255,255,0.03)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700 }}>Gecmis + beklenen doluluk</div>
                        <span style={{ fontSize: '10px', color: 'rgba(245,237,216,0.45)' }}>{dashboardWaterHistorySummary.reportWindow}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', marginBottom: '12px' }}>
                        {[
                          { label: `Son gozlem (${dashboardWaterHistorySummary.latestObservedMonth})`, value: dashboardWaterHistorySummary.latestObserved },
                          { label: 'Tarihsel ortalama', value: dashboardWaterHistorySummary.historicalMean },
                          { label: `Tarihsel dip (${dashboardWaterHistorySummary.historicalMinMonth})`, value: dashboardWaterHistorySummary.historicalMin },
                          { label: `Beklenen dip (${dashboardWaterHistorySummary.outlookMinMonth})`, value: dashboardWaterHistorySummary.outlookMin },
                          { label: 'Beklenen ortalama', value: dashboardWaterHistorySummary.outlookAvg },
                          { label: 'Ortalamaya kayma', value: dashboardWaterHistorySummary.outlookDelta }
                        ].map((metric) => (
                          <div key={metric.label} style={{ borderRadius: '10px', padding: '10px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <div style={{ fontSize: '10px', color: 'rgba(245,237,216,0.45)', marginBottom: '4px' }}>{metric.label}</div>
                            <div style={{ fontSize: '14px', fontWeight: 700 }}>{metric.value}</div>
                          </div>
                        ))}
                      </div>

                      {dashboardWaterHistoryTimeline.length > 0 ? (
                        <div style={{ marginBottom: '10px' }}>
                          <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.5)', marginBottom: '6px' }}>Son 18 aylik gozlem izi</div>
                          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '72px' }}>
                            {dashboardWaterHistoryTimeline.map((item) => (
                              <div
                                key={item.id}
                                title={`${item.month} • ${item.fillPct}%`}
                                style={{
                                  flex: 1,
                                  minWidth: '8px',
                                  height: `${Math.max(14, Math.min(100, item.fillPct))}%`,
                                  borderRadius: '999px',
                                  background: 'linear-gradient(180deg, rgba(88,143,180,0.95), rgba(88,143,180,0.25))'
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {dashboardWaterOutlookTimeline.length > 0 ? (
                        <div>
                          <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.5)', marginBottom: '6px' }}>Onumuzdeki 12 ay beklenen iz</div>
                          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '72px' }}>
                            {dashboardWaterOutlookTimeline.map((item) => (
                              <div
                                key={item.id}
                                title={`${item.month} • ${item.fillPct}%`}
                                style={{
                                  flex: 1,
                                  minWidth: '8px',
                                  height: `${Math.max(14, Math.min(100, item.fillPct))}%`,
                                  borderRadius: '999px',
                                  background: 'linear-gradient(180deg, rgba(212,168,67,0.95), rgba(212,168,67,0.25))'
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="bento-card" style={{ padding: '14px', background: 'rgba(15,26,15,0.34)', border: '1px solid rgba(212,168,67,0.14)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ fontSize: '16px', fontWeight: 700 }}>Senaryo baskı matrisi</div>
                    <span style={{ fontSize: '10px', color: 'rgba(245,237,216,0.45)' }}>high x2 + medium</span>
                  </div>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {getExpandedItems(dashboardWaterScenarioMatrix, 'waterScenarioMatrix', 4).map((item) => {
                      const tone = getWaterRiskTone(item.topRiskLevel);
                      return (
                        <div key={item.id} style={{ border: `1px solid ${tone.border}`, borderRadius: '12px', padding: '10px 12px', background: tone.background }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 86px 92px', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                            <strong style={{ fontSize: '12px' }}>{item.scenario}</strong>
                            <span style={{ fontSize: '11px', fontFamily: 'JetBrains Mono', color: tone.color }}>Puan {item.pressureScore}</span>
                            <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.62)' }}>H {item.high} / M {item.medium} / L {item.low}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.6)' }}>{item.topSeries} • {item.topWorstMonth}</span>
                            <span style={{ fontSize: '11px', fontFamily: 'JetBrains Mono' }}>{item.topWorstFill}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {shouldShowExpand(dashboardWaterScenarioMatrix, 4) ? (
                    <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center' }}>
                      <button className="btn-secondary" onClick={() => toggleDashboardExpand('waterScenarioMatrix')}>
                        {dashboardExpand.waterScenarioMatrix ? 'Senaryoları daralt' : `Tüm senaryoları aç (${dashboardWaterScenarioMatrix.length})`}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(320px, 1fr)', gap: '14px' }}>
              <div className="bento-card" style={{ padding: '14px', background: 'rgba(15,26,15,0.34)', border: '1px solid rgba(88,143,180,0.14)' }}>
                <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px' }}>HTML panolar + raporlar</div>
                <div style={{ display: 'grid', gap: '10px', marginBottom: '12px' }}>
                  {dashboardWaterDashboards.map((item) => (
                    <a
                      key={item.id}
                      href={resolveHackhatonAssetUrl(item.asset)}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary"
                      style={{ justifyContent: 'space-between', padding: '12px 14px', textDecoration: 'none' }}
                    >
                      <span>{item.title}</span>
                      <DownloadCloud size={14} />
                    </a>
                  ))}
                </div>
                <div style={{ display: 'grid', gap: '10px' }}>
                  {dashboardWaterDocuments.map((item) => (
                    <div key={item.id} style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '12px', background: 'rgba(255,255,255,0.03)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', marginBottom: '6px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700 }}>{item.title}</div>
                        {item.asset ? (
                          <a href={resolveHackhatonAssetUrl(item.asset)} target="_blank" rel="noreferrer" className="btn-secondary" style={{ textDecoration: 'none', padding: '8px 10px' }}>
                            Oku
                          </a>
                        ) : null}
                      </div>
                      <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.5)', marginBottom: '6px' }}>{item.subtitle}</div>
                      <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.62)', lineHeight: 1.55 }}>{item.excerpt}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bento-card" style={{ padding: '14px', background: 'rgba(15,26,15,0.34)', border: '1px solid rgba(212,168,67,0.14)' }}>
                <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px' }}>Senaryo agirliklari</div>
                <div style={{ display: 'grid', gap: '8px', marginBottom: '14px' }}>
                  {dashboardWaterScenarioWeights.map((item) => (
                    <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 60px', gap: '8px', alignItems: 'center', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '10px 12px', background: 'rgba(255,255,255,0.03)' }}>
                      <strong style={{ fontSize: '12px' }}>{item.scenario}</strong>
                      <span style={{ fontSize: '11px', fontFamily: 'JetBrains Mono' }}>{item.weight}</span>
                      <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>{item.score}</span>
                    </div>
                  ))}
                </div>

                <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px' }}>Kalibrasyon</div>
                <div style={{ display: 'grid', gap: '8px' }}>
                  {dashboardWaterDecision.calibration ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.45)' }}>AUC 40</span>
                        <strong style={{ fontSize: '12px', fontFamily: 'JetBrains Mono' }}>{dashboardWaterDecision.calibration.auc40}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.45)' }}>Brier 40</span>
                        <strong style={{ fontSize: '12px', fontFamily: 'JetBrains Mono' }}>{dashboardWaterDecision.calibration.brier40}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.45)' }}>Coverage gap</span>
                        <strong style={{ fontSize: '12px', fontFamily: 'JetBrains Mono' }}>{dashboardWaterDecision.calibration.intervalGap}</strong>
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.55)' }}>Kalibrasyon özeti bulunamadı.</div>
                  )}
                </div>
              </div>
            </div>

            {(dashboardWaterStrategyBoard.length > 0 || dashboardWaterWatchlist.length > 0) ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(280px, 1fr)', gap: '14px', marginTop: '14px' }}>
                <div className="bento-card" style={{ padding: '14px', background: 'rgba(15,26,15,0.34)', border: '1px solid rgba(88,143,180,0.14)' }}>
                  <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px' }}>Secilen strateji panosu</div>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {dashboardWaterStrategyBoard.map((item) => (
                      <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 96px 72px 72px', gap: '8px', alignItems: 'center', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '10px 12px', background: 'rgba(255,255,255,0.03)' }}>
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 700 }}>{item.series}</div>
                          <div style={{ fontSize: '10px', color: 'rgba(245,237,216,0.5)' }}>{item.strategy}</div>
                        </div>
                        <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>score {item.score}</span>
                        <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>rmse {item.rmse}</span>
                        <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>rec {item.recent}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bento-card" style={{ padding: '14px', background: 'rgba(15,26,15,0.34)', border: '1px solid rgba(224,112,112,0.12)' }}>
                  <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px' }}>Yakindan izlenecek rezervuarlar</div>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {dashboardWaterWatchlist.map((item) => (
                      <div key={item.id} style={{ border: '1px solid rgba(224,112,112,0.14)', borderRadius: '12px', padding: '10px 12px', background: 'rgba(224,112,112,0.06)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', marginBottom: '4px' }}>
                          <strong style={{ fontSize: '12px' }}>{item.series}</strong>
                          <span style={{ fontSize: '11px', fontFamily: 'JetBrains Mono' }}>score {item.score}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '11px', color: 'rgba(245,237,216,0.62)' }}>
                          <span>{item.strategy}</span>
                          <span>RMSE {item.rmse}</span>
                          <span>SMAPE {item.smape}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {dashboardWaterVisuals.length > 0 ? (
              <div style={{ marginTop: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                  {getExpandedItems(dashboardWaterVisuals, 'waterVisuals', 3).map((item) => (
                    <div key={item.id} style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', overflow: 'hidden', background: 'rgba(255,255,255,0.03)' }}>
                      <img
                        src={resolveHackhatonAssetUrl(item.asset)}
                        alt={item.title}
                        style={{ width: '100%', height: '150px', objectFit: 'cover', display: 'block' }}
                      />
                      <div style={{ padding: '12px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>{item.title}</div>
                        <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.6)' }}>{item.subtitle}</div>
                      </div>
                    </div>
                  ))}
                </div>
                {shouldShowExpand(dashboardWaterVisuals, 3) ? (
                  <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center' }}>
                    <button className="btn-secondary" onClick={() => toggleDashboardExpand('waterVisuals')}>
                      {dashboardExpand.waterVisuals ? 'Görselleri daralt' : `Tüm su görselleri (${dashboardWaterVisuals.length})`}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {(dashboardWaterAlertsFeed.length > 0 || dashboardWaterDropEvents.length > 0) ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(260px, 1fr)', gap: '14px', marginTop: '14px' }}>
                <div className="bento-card" style={{ padding: '14px', background: 'rgba(15,26,15,0.34)', border: '1px solid rgba(224,112,112,0.12)' }}>
                  <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px' }}>Aktif alarm akisı</div>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {getExpandedItems(dashboardWaterAlertsFeed, 'waterAlertsFeed', 4).map((item) => {
                      const tone = getWaterRiskTone(item.riskLevel);
                      return (
                        <div key={item.id} style={{ border: `1px solid ${tone.border}`, borderRadius: '12px', padding: '10px 12px', background: tone.background }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 82px', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                            <strong style={{ fontSize: '12px' }}>{item.series}</strong>
                            <span style={{ fontSize: '11px', color: tone.color }}>{item.riskLevel}</span>
                            <span style={{ fontSize: '11px', fontFamily: 'JetBrains Mono' }}>{item.worstFill}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '11px', color: 'rgba(245,237,216,0.6)' }}>
                            <span>{item.meanRisk}</span>
                            <span>{item.worstMonth}</span>
                            <span>{item.monthsBelow40} ay &lt;40</span>
                            <span>{item.strategy}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {shouldShowExpand(dashboardWaterAlertsFeed, 4) ? (
                    <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center' }}>
                      <button className="btn-secondary" onClick={() => toggleDashboardExpand('waterAlertsFeed')}>
                        {dashboardExpand.waterAlertsFeed ? 'Alarm listesini daralt' : `Tüm alarm akışını aç (${dashboardWaterAlertsFeed.length})`}
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="bento-card" style={{ padding: '14px', background: 'rgba(15,26,15,0.34)', border: '1px solid rgba(88,143,180,0.14)' }}>
                  <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px' }}>Baraj olay arsivi</div>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {getExpandedItems(dashboardWaterDropEvents, 'waterDropEvents', 4).map((item) => (
                      <div key={item.id} style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '10px 12px', background: 'rgba(255,255,255,0.03)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', marginBottom: '6px' }}>
                          <strong style={{ fontSize: '12px' }}>{item.title}</strong>
                          <span style={{ fontSize: '10px', color: 'rgba(245,237,216,0.45)' }}>{item.eventDate}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '11px', color: 'rgba(245,237,216,0.58)', marginBottom: '6px' }}>
                          <span>{item.kind}</span>
                          <span>{item.source}</span>
                          <span>{item.hazard}</span>
                          <span>{item.dropScore}</span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'rgba(245,237,216,0.62)', lineHeight: 1.5 }}>{item.summary}</div>
                        {item.url ? (
                          <div style={{ marginTop: '8px' }}>
                            <a href={item.url} target="_blank" rel="noreferrer" className="btn-secondary" style={{ textDecoration: 'none', padding: '8px 10px' }}>
                              Kaynagi ac
                            </a>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  {shouldShowExpand(dashboardWaterDropEvents, 4) ? (
                    <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center' }}>
                      <button className="btn-secondary" onClick={() => toggleDashboardExpand('waterDropEvents')}>
                        {dashboardExpand.waterDropEvents ? 'Olayları daralt' : `Tüm olay arşivini aç (${dashboardWaterDropEvents.length})`}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {(dashboardWaterCriticalSeries.length > 0 || dashboardWaterAlertSeries.length > 0) ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(260px, 1fr)', gap: '14px', marginTop: '14px' }}>
                <div className="bento-card" style={{ padding: '14px', background: 'rgba(15,26,15,0.34)', border: '1px solid rgba(224,112,112,0.12)' }}>
                  <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px' }}>Beklenen kritik seriler</div>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {getExpandedItems(dashboardWaterCriticalSeries, 'waterCriticalSeries', 3).map((item) => (
                      <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px', gap: '8px', alignItems: 'center', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '10px 12px', background: 'rgba(255,255,255,0.03)' }}>
                        <strong style={{ fontSize: '12px' }}>{item.series}</strong>
                        <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>{item.expectedRisk}</span>
                        <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>{item.meanFill}</span>
                        <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>{item.highRisk}</span>
                      </div>
                    ))}
                  </div>
                  {shouldShowExpand(dashboardWaterCriticalSeries, 3) ? (
                    <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center' }}>
                      <button className="btn-secondary" onClick={() => toggleDashboardExpand('waterCriticalSeries')}>
                        {dashboardExpand.waterCriticalSeries ? 'Kritik serileri daralt' : `Tüm kritik serileri aç (${dashboardWaterCriticalSeries.length})`}
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="bento-card" style={{ padding: '14px', background: 'rgba(15,26,15,0.34)', border: '1px solid rgba(88,143,180,0.14)' }}>
                  <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px' }}>Uyari siralamasi</div>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {getExpandedItems(dashboardWaterAlertSeries, 'waterAlertSeries', 3).map((item) => (
                      <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 54px 88px 74px 78px', gap: '8px', alignItems: 'center', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '10px 12px', background: 'rgba(255,255,255,0.03)' }}>
                        <strong style={{ fontSize: '12px' }}>{item.series}</strong>
                        <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>{item.monthsLt40}</span>
                        <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>{item.meanRisk}</span>
                        <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>{item.worstMonth}</span>
                        <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.55)' }}>{item.worstFill}</span>
                      </div>
                    ))}
                  </div>
                  {shouldShowExpand(dashboardWaterAlertSeries, 3) ? (
                    <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center' }}>
                      <button className="btn-secondary" onClick={() => toggleDashboardExpand('waterAlertSeries')}>
                        {dashboardExpand.waterAlertSeries ? 'Uyarı listesini daralt' : `Tüm uyarı sıralamasını aç (${dashboardWaterAlertSeries.length})`}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ═══ MIKROKLIMA GRID ORNEK HARITASI ═══ */}
      <div id="climate-sensors" className="panel" style={{ background: 'linear-gradient(145deg, rgba(88,143,180,0.05), rgba(26,36,46,0.3))', borderTop: '2px solid rgba(88,143,180,0.2)', scrollMarginTop: '110px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <IconBox icon={Wifi} color="#588FB4" bg="rgba(88,143,180,0.12)" glow="rgba(88,143,180,0.15)" />
            <h3 className="section-title" style={{ fontSize: '24px', margin: 0 }}>Mikroklima <em>grid ornekleri</em></h3>
          </div>
          <span className="tech-badge" style={{ background: 'rgba(88,143,180,0.1)', color: '#588FB4' }}>{onlineSensorCount}/{mikroNodes.length} örnek nokta</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '20px' }}>
          {/* Grid Ornek Listesi */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '350px', overflowY: 'auto', paddingRight: '8px', position: 'relative' }} className="custom-scrollbar">
            {mikroLoading && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,46,26,0.6)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, borderRadius: '12px' }}>
                <span style={{ fontSize: '13px', color: 'var(--sprout)' }}>Open-Meteo grid verisi guncelleniyor...</span>
              </div>
            )}
            {mikroNodes.map((node, idx) => (
              <div key={idx} style={{ padding: '16px', background: 'rgba(245,237,216,0.02)', borderRadius: '12px', border: node.stat === 'limited' ? '1px solid rgba(212,168,67,0.24)' : '1px solid rgba(88,143,180,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="pulse-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', background: node.stat === 'online' ? 'var(--sprout)' : 'var(--wheat)' }} />
                    <strong style={{ fontSize: '13px' }}>{node.id}</strong>
                  </div>
                  <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.5)', display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={10} /> {node.loc}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Thermometer size={14} color="var(--wheat)" />
                      <span style={{ fontSize: '12px', fontFamily: 'JetBrains Mono', color: 'var(--cream)' }}>{node.temp}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Droplets size={14} color="var(--sky)" />
                      <span style={{ fontSize: '12px', fontFamily: 'JetBrains Mono', color: 'var(--cream)' }}>{node.hum}</span>
                    </div>
                  </div>
                  <span style={{ fontSize: '10px', color: node.stat === 'online' ? 'var(--sprout)' : 'var(--wheat)' }}>{node.source}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Harita / Render Yeri */}
          <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', border: '1px solid rgba(88,143,180,0.2)', minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at 30% 30%, rgba(88,143,180,0.22), transparent 32%), radial-gradient(circle at 70% 62%, rgba(143,188,69,0.2), transparent 28%), linear-gradient(145deg, rgba(9,16,12,0.94), rgba(16,28,20,0.9))' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(145deg, rgba(26,46,26,0.4), rgba(15,26,15,0.7))' }} />

            {/* Grid sample points on map */}
            <div style={{ position: 'absolute', top: '20%', left: '30%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div className="pulse-dot" style={{ width: '12px', height: '12px', background: 'var(--sprout)', borderRadius: '50%', border: '2px solid rgba(245,237,216,0.9)', boxShadow: '0 0 10px var(--sprout)' }} />
              <span style={{ fontSize: '9px', background: 'rgba(0,0,0,0.8)', padding: '2px 6px', borderRadius: '4px', marginTop: '4px', fontFamily: 'JetBrains Mono' }}>{mikroNodes[0].id} ({mikroNodes[0].temp})</span>
            </div>

            <div style={{ position: 'absolute', top: '35%', left: '60%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div className="pulse-dot" style={{ width: '12px', height: '12px', background: 'var(--sprout)', borderRadius: '50%', border: '2px solid rgba(245,237,216,0.9)', boxShadow: '0 0 10px var(--sprout)' }} />
              <span style={{ fontSize: '9px', background: 'rgba(0,0,0,0.8)', padding: '2px 6px', borderRadius: '4px', marginTop: '4px', fontFamily: 'JetBrains Mono' }}>{mikroNodes[1].id} ({mikroNodes[1].temp})</span>
            </div>

            <div style={{ position: 'absolute', top: '70%', left: '45%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div className="pulse-dot" style={{ width: '12px', height: '12px', background: 'var(--sprout)', borderRadius: '50%', border: '2px solid rgba(245,237,216,0.9)', boxShadow: '0 0 10px var(--sprout)' }} />
              <span style={{ fontSize: '9px', background: 'rgba(0,0,0,0.8)', padding: '2px 6px', borderRadius: '4px', marginTop: '4px', fontFamily: 'JetBrains Mono' }}>{mikroNodes[2].id} ({mikroNodes[2].temp})</span>
            </div>

            <div style={{ position: 'absolute', top: '65%', left: '25%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div className="pulse-dot" style={{ width: '12px', height: '12px', background: 'var(--wheat)', borderRadius: '50%', border: '2px solid rgba(245,237,216,0.9)', boxShadow: '0 0 10px var(--wheat)' }} />
              <span style={{ fontSize: '9px', background: 'rgba(0,0,0,0.8)', padding: '2px 6px', borderRadius: '4px', marginTop: '4px', fontFamily: 'JetBrains Mono', color: 'var(--wheat)' }}>{mikroNodes[3].id} ({mikroNodes[3].temp})</span>
            </div>

            <div style={{ position: 'absolute', top: '45%', left: '15%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div className="pulse-dot" style={{ width: '12px', height: '12px', background: 'var(--sprout)', borderRadius: '50%', border: '2px solid rgba(245,237,216,0.9)', boxShadow: '0 0 10px var(--sprout)' }} />
              <span style={{ fontSize: '9px', background: 'rgba(0,0,0,0.8)', padding: '2px 6px', borderRadius: '4px', marginTop: '4px', fontFamily: 'JetBrains Mono', color: 'var(--sprout)' }}>{mikroNodes[4].id} ({mikroNodes[4].temp})</span>
            </div>

            {/* UI Overlay Controls */}
            <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', gap: '8px' }}>
              <button className="btn-secondary" style={{ padding: '8px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}><Maximize2 size={14} /></button>
              <button className="btn-secondary" style={{ padding: '8px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}><Layers size={14} /></button>
            </div>

            <div style={{ position: 'absolute', bottom: '16px', left: '16px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(88,143,180,0.3)' }}>
              <h5 style={{ margin: '0 0 8px 0', fontSize: '11px', color: 'rgba(245,237,216,0.7)' }}>Özet İstatistikler</h5>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div>
                  <span style={{ fontSize: '10px', color: 'var(--wheat)', display: 'block' }}>Grid nokta</span>
                  <strong style={{ fontSize: '14px', fontFamily: 'JetBrains Mono' }}>{mikroNodes.length}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '10px', color: 'var(--sky)', display: 'block' }}>Kaynak</span>
                  <strong style={{ fontSize: '14px', fontFamily: 'JetBrains Mono' }}>{mikroLoading ? 'Güncelleniyor...' : 'Open-Meteo'}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ SU / TOPRAK SINYALLERI ═══ */}
      <div className="panel" style={{ background: 'linear-gradient(145deg, rgba(88,143,180,0.05), rgba(26,46,26,0.3))', borderTop: '2px solid rgba(88,143,180,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <IconBox icon={Waves} color="var(--sky)" bg="rgba(88,143,180,0.12)" glow="rgba(88,143,180,0.15)" />
            <h3 className="section-title" style={{ fontSize: '24px', margin: 0 }}>Su + toprak <em>sinyalleri</em></h3>
          </div>
          <span className="tech-badge" style={{ background: 'rgba(88,143,180,0.1)', color: 'var(--sky)' }}>
            {hydroData.live ? 'Open-Meteo soil signals' : 'Canli sinyal yok'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '20px' }}>
          {/* Nem Gozlem Cubugu */}
          <div className="bento-card" style={{ padding: '24px', background: 'rgba(26,46,26,0.5)', display: 'flex', gap: '24px' }}>
            <div style={{ width: '60px', height: '100%', background: 'rgba(245,237,216,0.05)', borderRadius: '30px', position: 'relative', overflow: 'hidden', border: '1px solid rgba(88,143,180,0.2)' }}>
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: `${Math.max(6, Math.min(100, Number(hydroData.moistureTopPct || 0)))}%`,
                  background: 'linear-gradient(to top, var(--sky), rgba(88,143,180,0.4))',
                  borderRadius: '30px',
                  transition: 'height 1s ease'
                }}
              />
              <div style={{ position: 'absolute', top: '50%', left: '-10px', right: '-10px', height: '1px', borderTop: '2px dashed rgba(240,194,109,0.6)' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, justifyContent: 'center' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.4)', display: 'block' }}>Ust katman nemi</span>
                <strong style={{ fontSize: '24px', color: 'var(--sky)', fontFamily: 'Playfair Display' }}>
                  {hydroData.moistureTopPct == null ? '-' : `%${hydroData.moistureTopPct}`}
                </strong>
                <p style={{ fontSize: '11px', color: hydroData.moistureStatus === 'Kuru' ? '#E07070' : hydroData.moistureStatus === 'Islak' ? 'var(--wheat)' : 'var(--sprout)', margin: '4px 0 0' }}>
                  {hydroData.moistureStatus}
                </p>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.4)', display: 'block' }}>Alt katman nemi</span>
                <strong style={{ fontSize: '18px', color: 'var(--wheat)', fontFamily: 'JetBrains Mono' }}>
                  {hydroData.moistureMidPct == null ? '-' : `%${hydroData.moistureMidPct}`}
                </strong>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {[
              { title: 'Evapotranspirasyon', val: hydroData.etc == null ? '-' : `${hydroData.etc} mm/gun`, stat: hydroData.etcStatus, color: 'var(--wheat)', icon: ThermometerSun },
              { title: 'Sulama ihtiyaci', val: hydroData.irrigationNeed == null ? '-' : `${hydroData.irrigationNeed} mm`, stat: hydroData.irrigationStatus, color: hydroData.irrigationStatus === 'Acil' ? '#E07070' : 'var(--sky)', icon: CloudRain },
              { title: 'Yuzey sıcakligi', val: hydroData.topTemp == null ? '-' : `${hydroData.topTemp}°C`, stat: hydroData.topTemp == null ? 'Veri yok' : 'Canli', color: 'var(--sprout)', icon: Droplet },
              { title: 'Katman farki', val: hydroData.heatGradient == null ? '-' : `${hydroData.heatGradient}°C`, stat: hydroData.heatGradient == null ? 'Veri yok' : 'Yuzey - 6cm', color: 'var(--sky)', icon: Waves }
            ].map((hydro, idx) => (
              <div key={idx} className="bento-card" style={{ padding: '16px', background: 'rgba(245,237,216,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <hydro.icon size={18} color={hydro.color} />
                  <span style={{ fontSize: '10px', background: `${hydro.color}15`, color: hydro.color, padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>{hydro.stat}</span>
                </div>
                <span className="bento-head">{hydro.title}</span>
                <strong style={{ fontSize: '20px', display: 'block', marginTop: '4px', fontFamily: 'JetBrains Mono', color: 'var(--cream)' }}>{hydro.val}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ METEOROLOJIK KOSUL RADARI ═══ */}
      <div className="panel" style={{ background: 'linear-gradient(145deg, rgba(224,112,112,0.05), rgba(46,26,26,0.3))', borderTop: '2px solid rgba(224,112,112,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <IconBox icon={Radar} color="#E07070" bg="rgba(224,112,112,0.12)" glow="rgba(224,112,112,0.15)" />
            <h3 className="section-title" style={{ fontSize: '24px', margin: 0 }}>Meteorolojik koşul <em>radarı</em></h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="pulse-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', background: pestData.totalDetections > 0 ? '#E07070' : 'var(--sprout)' }} />
            <span style={{ fontSize: '11px', color: pestData.totalDetections > 0 ? '#E07070' : 'var(--sprout)', fontWeight: 600 }}>{pestData.totalDetections > 0 ? `${pestData.totalDetections} yerel koşul sinyali` : 'Belirgin stres sinyali yok'}</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 1fr) 2fr', gap: '20px' }}>
          {/* Radar Animasyonlu Alan */}
          <div className="bento-card" style={{ padding: '24px', background: 'rgba(26,15,15,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', minHeight: '250px' }}>
            <div style={{ width: '200px', height: '200px', borderRadius: '50%', border: '1px solid rgba(224,112,112,0.3)', position: 'absolute' }} />
            <div style={{ width: '140px', height: '140px', borderRadius: '50%', border: '1px solid rgba(224,112,112,0.4)', position: 'absolute' }} />
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: '1px solid rgba(224,112,112,0.5)', position: 'absolute', background: 'rgba(224,112,112,0.1)' }} />
            <div style={{ width: '100px', height: '100px', borderRight: '2px solid #E07070', background: 'linear-gradient(45deg, transparent 50%, rgba(224,112,112,0.3) 100%)', position: 'absolute', top: '50%', left: '50%', transformOrigin: 'top left', borderRadius: '0 100px 0 0', animation: 'spin 4s linear infinite' }} />
            {pestData.pests.map((p, i) => (
              <div key={i} style={{ position: 'absolute', top: `${30 + i * 20}%`, left: `${25 + i * 15}%`, width: '6px', height: '6px', background: p.risk === 'Kritik' ? '#E07070' : 'var(--wheat)', borderRadius: '50%', boxShadow: `0 0 8px ${p.risk === 'Kritik' ? '#E07070' : 'var(--wheat)'}` }} />
            ))}
            <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {pestData.pests.length > 0 ? pestData.pests.map((pest, idx) => (
              <div key={idx} className="list-item" style={{ display: 'flex', gap: '16px', padding: '16px', background: 'rgba(245,237,216,0.02)', borderRadius: '12px', border: '1px solid rgba(224,112,112,0.1)', alignItems: 'center' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: pest.risk === 'Kritik' ? 'rgba(224,112,112,0.15)' : 'rgba(212,168,67,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {pest.icon === 'Bug' ? <Bug size={20} color={pest.risk === 'Kritik' ? '#E07070' : 'var(--wheat)'} /> : <Target size={20} color={pest.risk === 'Kritik' ? '#E07070' : 'var(--wheat)'} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <strong style={{ fontSize: '14px', color: 'var(--cream)' }}>{pest.name}</strong>
                    <span style={{ fontSize: '10px', background: pest.risk === 'Kritik' ? 'rgba(224,112,112,0.15)' : pest.risk === 'Yüksek' ? 'rgba(212,168,67,0.15)' : 'rgba(143,188,69,0.15)', color: pest.risk === 'Kritik' ? '#E07070' : pest.risk === 'Yüksek' ? 'var(--wheat)' : 'var(--sprout)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>{pest.risk}</span>
                  </div>
                  <div style={{ display: 'grid', gap: '4px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.65)' }}>{pest.detail}</span>
                    <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.4)', fontFamily: 'JetBrains Mono' }}>{pest.basis}</span>
                  </div>
                  <div style={{ width: '100%', height: '4px', background: 'rgba(0,0,0,0.3)', borderRadius: '2px' }}>
                    <div style={{ width: `${pest.pct}%`, height: '100%', background: pest.risk === 'Kritik' ? '#E07070' : pest.risk === 'Yüksek' ? 'var(--wheat)' : 'var(--sprout)', borderRadius: '2px', transition: 'width 1s ease' }} />
                  </div>
                </div>
              </div>
            )) : (
              <div style={{ padding: '30px', textAlign: 'center', background: 'rgba(143,188,69,0.05)', borderRadius: '12px', border: '1px solid rgba(143,188,69,0.1)' }}>
                <CheckCircle2 size={32} color="var(--sprout)" style={{ marginBottom: '10px' }} />
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--sprout)' }}>Belirgin koşul sinyali yok</p>
                <p style={{ fontSize: '12px', color: 'rgba(245,237,216,0.5)' }}>Canli hava verisi kritik meteorolojik stres gostermiyor.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ ACİL DURUM EYLEM PROTOKOLLERİ (Extreme Weather Action Protocols) ═══ */}
      <div className="panel" style={{ background: 'linear-gradient(145deg, rgba(212,168,67,0.05), rgba(46,26,26,0.3))', borderTop: '2px solid rgba(212,168,67,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <IconBox icon={AlertOctagon} color="var(--wheat)" bg="rgba(212,168,67,0.12)" glow="rgba(212,168,67,0.15)" />
            <h3 className="section-title" style={{ fontSize: '24px', margin: 0 }}>Acil Durum <em>Protokolleri</em></h3>
          </div>
          <span className="tech-badge" style={{ background: 'rgba(212,168,67,0.1)', color: 'var(--wheat)' }}>Canli sinyallerden turetildi</span>
        </div>

        <p style={{ fontSize: '13px', color: 'rgba(245,237,216,0.6)', lineHeight: 1.6, margin: '0 0 20px 0' }}>Kartlar canlı meteoroloji ve toprak sinyallerinden üretilir. Kritik eşik yoksa stabil operasyon kartı gösterilir.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
          {responseProtocols.map((prot) => (
            <div key={prot.tag} className="bento-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', background: 'rgba(245,237,216,0.02)', border: '1px solid rgba(245,237,216,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <prot.icon size={16} color={prot.color} />
                  <span style={{ fontSize: '11px', color: prot.color, fontWeight: 600 }}>{prot.tag}</span>
                </div>
                <span style={{ fontSize: '10px', color: 'rgba(245,237,216,0.4)', fontFamily: 'JetBrains Mono' }}>{prot.trigger}</span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--cream)', lineHeight: 1.5, margin: '0 0 16px 0', flex: 1 }}>{prot.action}</p>
              <div style={{ width: '100%', fontSize: '11px', background: 'rgba(143,188,69,0.08)', color: 'var(--sprout)', border: '1px solid rgba(143,188,69,0.14)', borderRadius: '10px', padding: '10px 12px', textAlign: 'center', fontWeight: 600 }}>Operasyon notu hazır</div>
            </div>
          ))}
        </div>
      </div>

    </div >
  );
}
