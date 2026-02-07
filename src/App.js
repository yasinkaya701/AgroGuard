import React, { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileImage,
  Leaf,
  LeafyGreen,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  X
} from "lucide-react";
import "./App.css";
import {
  handbookSections,
  careProtocols,
  cropEncyclopedia,
  diseaseLibrary,
  glossary,
  greenhouseRisks,
  greenhouseTips,
  irrigationTips,
  irrigationMethods,
  seasonalPlanner,
  nutrientGuide,
  organicPractices,
  postHarvest,
  fertilizerSchedule,
  harvestGuide,
  ipmSteps,
  weatherActions,
  diseasePrevention,
  commonMistakes,
  seedSaving,
  storageGuide,
  troubleshooting,
  pestLifecycle,
  rotationGuide,
  seedStartGuide,
  pestGuide,
  farmerChecklists,
  safetyNotes,
  soilTesting,
  soilTypes,
  symptomDictionary
} from "./data/guideData";
import { cropYieldKgDa, cropLabelMap, defaultCosts } from "./data/economicsData";

const API_BASE =
  process.env.REACT_APP_API_BASE || (window?.Capacitor ? "http://localhost:5051" : "");
const apiUrl = (path) => `${API_BASE}${path}`;

const CONSULT_EMAIL = "gs7016903@gmail.com";

const steps = [
  { title: "Gorsel yukle", detail: "Yaprak veya govdeye odaklan." },
  { title: "Hizli analiz", detail: "Bulut servisimiz saniyeler icinde." },
  { title: "Bakim plani", detail: "Adim adim uygulama adimlari." }
];

const highlights = [
  { label: "Tarla odakli", value: "Uretim sahasi merkezde" },
  { label: "Hizli teshis", value: "Dakikalar icinde karar" },
  { label: "Saha aksiyonu", value: "Net ve uygulanabilir plan" }
];

const features = [
  {
    title: "Sezon odakli rehber",
    detail: "Ekim, budama ve sulama zamanlarini tek bakista gor."
  },
  {
    title: "Hastalik & zararli takibi",
    detail: "Sorunlari kaydet, ayni belirtiyi tekrar yakala."
  },
  {
    title: "Organik + kimyasal cozum",
    detail: "Ilac ve uygulama onerileri etikete uygun sekilde ayrilir."
  },
  {
    title: "Sulama ve besin plan",
    detail: "Bitki tipine gore sulama ve besin ritmini netlestir."
  },
  {
    title: "Alan bazli notlar",
    detail: "Sera, tarla ya da bahce icin notlarini sakla."
  },
  {
    title: "Risk sinyali",
    detail: "Nem ve isik dengesi bozulunca uyar."
  }
];

const demoHighlights = [
  {
    title: "AI saha raporu",
    detail:
      "Teshis, risk ve uygulama adimlarini tek sayfalik rapora donusturur. Parsel bazli arşiv ve paylasim akisi ile desteklenir.",
    tag: "Raporlama"
  },
  {
    title: "Kimyasal zamanlama + kayit",
    detail:
      "Etiket odakli uygulama takvimi, PHI/REI hatirlatmasi ve kayit sablonlari ile saha uygunlugunu guclendirir.",
    tag: "Uygunluk"
  }
];

const demoCompactItems = [
  {
    title: "Canli video + sesli asistan",
    detail: "Mobil kamerada canli analiz, sesli soru-cevap ve seans raporu."
  },
  {
    title: "Hastalik risk haritasi",
    detail: "Parsel bazli risk skorlarini tek ekranda gosterir."
  },
  {
    title: "Parsel arsivi",
    detail: "Gecmis teshisler, uygulamalar ve trend notlari."
  },
  {
    title: "Verim tahminleme",
    detail: "Sezon ortasi aralik tahminleri ve trend karsilastirma."
  },
  {
    title: "Gunluk saha brifingi",
    detail: "Sabah-oglen-aksam operasyon akisi."
  },
  {
    title: "Girdi ve stok yonetimi",
    detail: "Tohum, gubre, ilac stoklari ve planlanan kullanim."
  }
];

const demoScorecards = [
  { title: "Saha sagligi", value: "82/100", detail: "Nem + besin dengesi iyi." },
  { title: "Risk endeksi", value: "Orta", detail: "Ruzgar ve nem dalgasi." },
  { title: "Uygulama uyumu", value: "Yuksek", detail: "Planla uyumlu ilerliyor." }
];

const demoTimeline = [
  { day: "Bugun", task: "Yaprak alti kontrolu" },
  { day: "Yarin", task: "Damla hat kontrolu" },
  { day: "+2 gun", task: "Yaprak leke taramasi" },
  { day: "+3 gun", task: "Koruyucu uygulama" }
];



const demoHistory = [
  { time: "09:00", score: 72 },
  { time: "12:00", score: 78 },
  { time: "15:00", score: 69 },
  { time: "18:00", score: 81 }
];
const demoTrend = [
  { label: "Hafta 1", value: 52 },
  { label: "Hafta 2", value: 61 },
  { label: "Hafta 3", value: 58 },
  { label: "Hafta 4", value: 70 }
];
const demoDiseaseScenarios = [
  { id: "mild", label: "Hafif yayilim", note: "Leke yayilimi sinirli, erken mudahale yeterli." },
  { id: "medium", label: "Orta yayilim", note: "Risk artiyor, uygulama takvimini siklastir." },
  { id: "high", label: "Agir yayilim", note: "Acil uygulama + izolasyon gerekir." }
];

const faqItems = [
  {
    title: "Analiz ne kadar surer?",
    detail: "Gorsel yukunune ve cihazina gore degisir, genelde saniyeler icinde tamamlanir."
  },
  {
    title: "Hangi bitkiler destekleniyor?",
    detail: "Desteklenen bitkiler modelin labels.json kapsamina baglidir. Yeni siniflar egitimle eklenir."
  },
  {
    title: "Sonuclar kesin mi?",
    detail: "Hayir. Erken teshis icin yardimci bir arac; sahada uzman onayi onerilir."
  },
  {
    title: "Neden bazen yeniden fotograf istiyor?",
    detail: "Dusuk guven veya siniflar arasi fark dusukse, model daha net goruntu ister."
  },
  {
    title: "Neden bitki uyumsuz diyor?",
    detail: "Secilen bitkiyle uyusmayan siniflar engellenir. Bitki secimini kontrol et."
  },
  {
    title: "IPM nedir?",
    detail: "IPM; izleme, esik, onleme ve kontrol adimlarini birlestiren resmi yaklasimdir."
  },
  {
    title: "PlantVillage neden saha performansinda dusuyor?",
    detail: "Veri seti kontrollu arka planli. Sahada isik/arka plan degisir; bu nedenle ek goruntuyle fine-tune gerekir."
  },
  {
    title: "Action threshold ne demek?",
    detail: "IPM'de mudahale karari, zararlinin riskli seviyeye ulasmasiyla verilir. Esik asilmadan kimyasal onerilmez."
  },
  {
    title: "Sahada neden farkli sonuclar gorulebilir?",
    detail: "Veri seti kontrollu ortamdan geldigi icin saha gorsellerinde arka plan ve isik farki sonucu etkileyebilir."
  },
  {
    title: "PlantVillage kapsamı nedir?",
    detail: "PlantVillage yaklasik 54K gorsel, 38 sinif ve 14 bitki turu icerir; bu kapsam labels.json ile belirlenir."
  },

  {
    title: "Hangi fotograf en iyi sonucu verir?",
    detail: "Yapraga yakin plan, net odak ve sade arka plan en iyi sonucu verir."
  },
  {
    title: "Kamera ile cekim mi yoksa galeriden mi?",
    detail: "Kamera daha taze ve net cekim saglar; galeriden de netlik yuksekse analiz edilir."
  },
  {
    title: "Isik nasil olmali?",
    detail: "Gunesli ama patlamayan isik idealdir. Dusuk isikta guven dusabilir."
  },
  {
    title: "Neden guven dusuk cikti?",
    detail: "Goruntu kalitesi dusuk, siniflar birbirine yakin veya bitki dogrulama zayif olabilir."
  },
  {
    title: "Bitki secmeden analiz olur mu?",
    detail: "Hayir. Bitki secimi zorunludur; model filtreyi buna gore uygular."
  },
  {
    title: "Etiket/PHI/REI ne demek?",
    detail: "Etiket uygulama dozu ve zamani icin resmi kaynaktir. PHI: hasat oncesi bekleme, REI: giris kisitlamasi suresidir."
  },
  {
    title: "Organik cozumler neden bazen yeterli degil?",
    detail: "Yayilim ileri seviyedeyse kimyasal/cozum rotasyonu gerekir; IPM bunu dengeler."
  },
  {
    title: "Neden model ayni hastaligi tekrar veriyor?",
    detail: "Bitki secimi, goruntu acisi ve kalite benzerse model ayni sonucu tekrar edebilir."
  },
];

const turkeyGuidePlants = [
  {
    name: "Domates",
    summary:
      "Sicak ve gunesli alanlari sever. Duzenli sulama ve iyi havalanan toprakla yuksek verim verir.",
    link: "https://www.rhs.org.uk/vegetables/tomatoes/grow-your-own"
  },
  {
    name: "Biber (tatli)",
    summary:
      "Ilik ve korunakli ortamda daha iyi meyve verir. Toprak nemini dengede tutmak onemlidir.",
    link: "https://www.rhs.org.uk/vegetables/peppers/grow-your-own"
  },
  {
    name: "Salatalik",
    summary:
      "Ilik, gunesli ve duzenli sulanan ortamlarda hizli gelisir. Dikey destekle alanda tasarruf saglar.",
    link: "https://www.rhs.org.uk/vegetables/cucumbers/grow-your-own"
  },
  {
    name: "Patlican",
    summary:
      "Sicagi sever; duzenli nem ve besinle daha iyi meyve baglar. Sezon boyu takip ister.",
    link: "https://www.rhs.org.uk/advice/grow-your-own/vegetables/aubergines"
  },
  {
    name: "Kabak (sakiz)",
    summary:
      "Gunesli alanda hizli buyur, bol su ister. Erken hasat daha lezzetli urun verir.",
    link: "https://www.rhs.org.uk/vegetables/courgettes/grow-your-own"
  },
  {
    name: "Sogan (kuru)",
    summary:
      "Iyi drene toprakta kolay yetisir. Set soganlar ilkbaharda pratik ekim saglar.",
    link: "https://www.rhs.org.uk/vegetables/onions/grow-your-own"
  },
  {
    name: "Lahana",
    summary:
      "Duzenli sulama ve zararli korumasi ister. Soguga dayanikli cesitler yaygindir.",
    link: "https://www.rhs.org.uk/advice/grow-your-own/vegetables/cabbages"
  },
  {
    name: "Marul",
    summary:
      "Kisa surede hasat verir. Sicak havada acilanma olmamasi icin nem dengesi onemli.",
    link: "https://www.rhs.org.uk/vegetables/lettuce/grow-your-own"
  },
  {
    name: "Taze fasulye",
    summary:
      "Gunesli alanda hizli buyur ve surekli hasatla verimi artar. Dikey cesitler destek ister.",
    link: "https://www.rhs.org.uk/vegetables/french-beans/grow-your-own"
  },
  {
    name: "Mantar (kultur)",
    summary:
      "Temiz ve kontrollu ortam ister. Uygun substrat ve hijyen basarinin anahtari.",
    link: "https://extension.usu.edu/yardandgarden/research/a-beginners-guide-to-growing-mushrooms-at-home.php"
  }
];

const basePlantProfiles = [
  {
    id: "apple",
    name: "Elma",
    climate: "Ilik, serin kis",
    water: "Orta, duzenli",
    soil: "Iyi drene, organik",
    tip: "Hava akisini sagla, budamayi ihmal etme."
  },
  {
    id: "blueberry",
    name: "Yaban mersini",
    climate: "Ilik, nemli",
    water: "Duzenli, nemli",
    soil: "Asidik, organik",
    tip: "pH dusuk tutulmali, organik mulc kullan."
  },
  {
    id: "cherry",
    name: "Kiraz",
    climate: "Ilik, hava akisi iyi",
    water: "Orta",
    soil: "Iyi drene",
    tip: "Budama ile hava akisini artir."
  },
  {
    id: "corn",
    name: "Misir",
    climate: "Sicak, gunesli",
    water: "Duzenli",
    soil: "Derin, besinli",
    tip: "Sira arasi havalandirmayi koru."
  },
  {
    id: "grape",
    name: "Uzum",
    climate: "Ilik, gunesli",
    water: "Az-orta",
    soil: "Iyi drene",
    tip: "Yapraklari kuru tut, duzenli buda."
  },
  {
    id: "orange",
    name: "Portakal",
    climate: "Ilik, don yok",
    water: "Duzenli",
    soil: "Iyi drene, organik",
    tip: "Don riskine karsi onlem al."
  },
  {
    id: "peach",
    name: "Seftali",
    climate: "Ilik",
    water: "Orta",
    soil: "Drenajli",
    tip: "Yaprak islanmasini azalt."
  },
  {
    id: "pepper",
    name: "Biber",
    climate: "Ilik, korunakli",
    water: "Orta, dengeli",
    soil: "Besinli, hafif nemli",
    tip: "Sicakta meyve baglama icin nemi dengede tut."
  },
  {
    id: "potato",
    name: "Patates",
    climate: "Ilik",
    water: "Duzenli",
    soil: "Gevsek, drenajli",
    tip: "Toprak nemini dengede tut."
  },
  {
    id: "raspberry",
    name: "Ahududu",
    climate: "Serin-ilik",
    water: "Orta",
    soil: "Organik, nemli",
    tip: "Sira arasi hava akisina dikkat."
  },
  {
    id: "soybean",
    name: "Soya",
    climate: "Ilik-sicak",
    water: "Orta",
    soil: "Iyi drene, besinli",
    tip: "Asiri sulamadan kacin."
  },
  {
    id: "squash",
    name: "Kabak",
    climate: "Sicak, gunesli",
    water: "Yuksek",
    soil: "Organik, nem tutan",
    tip: "Yaprak islanmasini azalt."
  },
  {
    id: "strawberry",
    name: "Cilek",
    climate: "Ilik",
    water: "Duzenli",
    soil: "Organik, hafif asidik",
    tip: "Mulc ile meyveyi topraktan ayir."
  },
  {
    id: "tomato",
    name: "Domates",
    climate: "Sicak, gunesli",
    water: "Duzenli, toprak nemli",
    soil: "Iyi drene, humuslu",
    tip: "Yapraklari kuru tut, sabah sulama yap."
  }
];

const plantNameOverrides = {
  apple: "Elma",
  blueberry: "Yaban mersini",
  cherry: "Kiraz",
  corn: "Misir",
  grape: "Uzum",
  orange: "Portakal",
  peach: "Seftali",
  pepper: "Biber",
  potato: "Patates",
  raspberry: "Ahududu",
  soybean: "Soya",
  squash: "Kabak",
  strawberry: "Cilek",
  tomato: "Domates"
};

const titleCase = (value) =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");


const quickActions = [
  { title: "Sulama hatirlatici", detail: "Bitki turune gore gunluk/haftalik plan." },
  { title: "Toprak kontrol", detail: "Nem, pH ve havalandirma icin kontrol listesi." },
  { title: "Hasat notu", detail: "Hasat tarihlerini ve verimi kaydet." }
];

const riskMatrix = [
  { label: "Drenaj zayif", impact: "Yuksek", action: "Toprak yapisini iyilestir" },
  { label: "Sik dikim", impact: "Orta", action: "Bitkiler arasi mesafeyi ac" },
  { label: "Dusuk hava akisi", impact: "Yuksek", action: "Havalandirmayi artir" },
  { label: "Yaprak islanmasi", impact: "Orta", action: "Sabah sulama uygula" }
];

const diseaseScouting = [
  { day: "Pazartesi", task: "Yaprak alti kontrolu" },
  { day: "Carsamba", task: "Leke ve kloroz takibi" },
  { day: "Cuma", task: "Meyve ve govde kontrolu" }
];

const supplyChecklist = [
  "Budama makasi",
  "Eldiven",
  "Nem olcer",
  "Yapiskan tuzak",
  "Organik kompost"
];

const yieldTracker = [
  { crop: "Domates", target: "4-6 kg/bitki", note: "Sicak sezonda yuksek verim." },
  { crop: "Biber", target: "2-4 kg/bitki", note: "Sulama dengesi kritik." },
  { crop: "Patlican", target: "3-5 kg/bitki", note: "Besin destegi onemli." }
];

const costPlanner = [
  { item: "Tohum/Fide", note: "Sezon basi alimi planla." },
  { item: "Gubre", note: "Azot + potasyum dengesi." },
  { item: "Ilaclama", note: "Etiket dozlari ve araliklari." },
  { item: "Isgucu", note: "Budama ve hasat gunleri." }
];

const marketingTips = [
  { title: "Pazar zamani", detail: "Hasadi haftasonuna denk getir." },
  { title: "Ambalaj", detail: "Kucuk kasalarda fiyat algisi artar." },
  { title: "Kalite", detail: "Uniform boyut ve temizlik satisi artirir." }
];

const irrigationChecklist = [
  "Hatlarin tikanikligini kontrol et",
  "Damla uclarini temizle",
  "Su deposu seviyesini takip et"
];

const starterChecklist = [
  { title: "Toprak hazirligi", detail: "Organik madde ve drenaji kontrol et." },
  { title: "Fide sagligi", detail: "Lekesiz, canli yaprak sec." },
  { title: "Hastalik onlemi", detail: "Aletleri temizle, hijyeni koru." }
];

function App() {
  const fileInputRef = useRef(null);
  const [activeTab, setActiveTab] = useState("diagnosis");
  const [selectedPlant, setSelectedPlant] = useState(null);
  const [selectedPlantId, setSelectedPlantId] = useState("");
  const [plantDiseaseData, setPlantDiseaseData] = useState(null);
  const [plantDiseaseError, setPlantDiseaseError] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [note, setNote] = useState("");
  const [todos, setTodos] = useState({});
  const [alerts, setAlerts] = useState({
    moisture: "denge",
    light: "denge",
    airflow: "denge",
    temperature: "denge",
    humidity: "denge",
    soilPh: "denge",
    salinity: "denge",
    leafWetness: "denge",
    pestPressure: "denge",
    nutrientBalance: "denge"
  });
  const [routine, setRoutine] = useState([]);
  const [routineInput, setRoutineInput] = useState("");
  const [reminders, setReminders] = useState({
    wateringTime: "08:00",
    enabled: false
  });
  const [fieldLocation, setFieldLocation] = useState({
    name: "",
    coords: "",
    notes: ""
  });
  const [city, setCity] = useState("Malatya");
  const [cityQuery, setCityQuery] = useState("");
  const [weather, setWeather] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [metricsError, setMetricsError] = useState("");
  const [contactForm, setContactForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [contactStatus, setContactStatus] = useState("");
  const [econArea, setEconArea] = useState(1);
  const [econYield, setEconYield] = useState(0);
  const [econPrice, setEconPrice] = useState(0);
  const [econLandValue, setEconLandValue] = useState(0);
  const [econCosts, setEconCosts] = useState({ ...defaultCosts });
  const [econCrop, setEconCrop] = useState("");
  const [demoReport, setDemoReport] = useState("");
  const [demoReportStatus, setDemoReportStatus] = useState("");
  const [demoScenario, setDemoScenario] = useState({ crop: "domates", risk: 35, price: 20, yieldBoost: 0 });
  const [demoFlags, setDemoFlags] = useState({
    frost: false,
    pest: false,
    irrigation: false,
    wind: false
  });
  const [demoDisease, setDemoDisease] = useState("medium");
  const [demoCost, setDemoCost] = useState({ area: 10, price: 18, cost: 12000 });
  const [demoCompare, setDemoCompare] = useState({ a: 18, b: 22 });
  const [demoFeedback, setDemoFeedback] = useState({ score: 4, note: "" });
  const [forecast, setForecast] = useState(null);
  const [weatherError, setWeatherError] = useState("");
  const [forecastError, setForecastError] = useState("");
  const [soilReport, setSoilReport] = useState(null);
  const [soilLoading, setSoilLoading] = useState(false);
  const [soilError, setSoilError] = useState("");
  const [soilQuestion, setSoilQuestion] = useState("");
  const [soilAnswer, setSoilAnswer] = useState("");
  const [sources, setSources] = useState([]);
  const [sourcesError, setSourcesError] = useState("");
  const [sourceQuery, setSourceQuery] = useState("");
  const [sourceCategory, setSourceCategory] = useState("all");
  const [sourcesUpdatedAt, setSourcesUpdatedAt] = useState("");
  const [modelPlants, setModelPlants] = useState([]);
  const [error, setError] = useState("");
  const [geoStatus, setGeoStatus] = useState("");
  const [weatherRefreshKey, setWeatherRefreshKey] = useState(0);
  const [apiStatus, setApiStatus] = useState({ state: "checking", message: "" });
  const [handbookQuery, setHandbookQuery] = useState("");
  const [handbookCategory, setHandbookCategory] = useState("all");
  const [handbookFocus, setHandbookFocus] = useState("all");
  const [faqQuery, setFaqQuery] = useState("");
  const [faqFocus, setFaqFocus] = useState("all");
  const [featureTab, setFeatureTab] = useState("core");
  const strictPlantFilter = true;
  const [showQualityGate, setShowQualityGate] = useState(false);
  const [showQuickModal, setShowQuickModal] = useState(null);
  const [showOverflow, setShowOverflow] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [drawerTab, setDrawerTab] = useState("operations");
  const [showFullDemo, setShowFullDemo] = useState(false);
  const [showAllPlants, setShowAllPlants] = useState(false);
  const [showAllHandbook, setShowAllHandbook] = useState(false);

  const fileMeta = useMemo(() => {
    if (!file) return null;
    return `${Math.round(file.size / 1024)} KB • ${file.type || "image"}`;
  }, [file]);
  const hasPlant = Boolean(selectedPlant);
  const hasFile = Boolean(file);

  const computedPlantProfiles = useMemo(() => {
    const list = [...basePlantProfiles];
    const existing = new Set(basePlantProfiles.map((item) => item.id));
    if (modelPlants.length) {
      modelPlants.forEach((id) => {
        if (!existing.has(id)) {
          list.push({
            id,
            name: plantNameOverrides[id] || titleCase(id),
            climate: "Veri seti bitkisi",
            water: "Orta",
            soil: "Dengeli",
            tip: "Model veri setine gore tespit edilir."
          });
        }
      });
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [modelPlants]);

  const plantNameMap = useMemo(() => {
    const map = new Map();
    computedPlantProfiles.forEach((item) => map.set(item.id, item.name));
    return map;
  }, [computedPlantProfiles]);

  const filteredPlantProfiles = useMemo(() => {
    if (!modelPlants.length) return computedPlantProfiles;
    return modelPlants
      .map((id) => computedPlantProfiles.find((item) => item.id === id))
      .filter(Boolean);
  }, [modelPlants, computedPlantProfiles]);

  React.useEffect(() => {
    if (!selectedPlantId) return;
    const match = filteredPlantProfiles.find((item) => item.id === selectedPlantId);
    if (match && (!selectedPlant || selectedPlant.id !== match.id)) {
      setSelectedPlant(match);
    }
  }, [selectedPlantId, filteredPlantProfiles, selectedPlant]);

  const handbookFocusMap = useMemo(
    () => ({
      all: null,
      diagnosis: [
        "tarla",
        "izleme-esik",
        "kimyasal-zamanlama",
        "sertifikasyon-kayit",
        "ipm-cekirdek",
        "ipm-esik",
        "ipm-etl",
        "belirti-sozlugu",
        "saha-uyari",
        "dataset-kaynaklari"
      ],
      irrigation: ["sulama", "tarla", "ciftci", "saha-uyari"],
      compliance: [
        "sertifikasyon-kayit",
        "kimyasal-zamanlama",
        "izleme-esik",
        "ipm-esik",
        "ipm-etl",
        "kayit-sablon"
      ],
      greenhouse: ["tarla", "sulama", "ciftci", "saha-uyari"]
    }),
    []
  );

  const faqGroups = useMemo(() => {
    const groups = [
      { key: "model", label: "Model ve teshis", items: faqItems.slice(0, 4) },
      { key: "data", label: "Veri seti ve sahadaki fark", items: faqItems.slice(4, 8) },
      { key: "ipm", label: "IPM ve karar mantigi", items: faqItems.slice(8) }
    ];
    const q = faqQuery.trim().toLowerCase();
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          !q || `${item.title} ${item.detail}`.toLowerCase().includes(q)
        )
      }))
      .filter((group) => (faqFocus === "all" || group.key === faqFocus) && group.items.length);
  }, [faqQuery, faqFocus]);

  const filteredHandbook = useMemo(() => {
    const q = handbookQuery.trim().toLowerCase();
    const focusIds = handbookFocusMap[handbookFocus] || null;
    const sections = handbookSections.filter((section) => {
      const categoryMatch = handbookCategory === "all" ? true : section.id === handbookCategory;
      const focusMatch = focusIds ? focusIds.includes(section.id) : true;
      return categoryMatch && focusMatch;
    });
    if (!q) return sections;
    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter(
          (item) =>
            item.title.toLowerCase().includes(q) ||
            item.detail.toLowerCase().includes(q)
        )
      }))
      .filter((section) => section.items.length);
  }, [handbookQuery, handbookCategory, handbookFocus, handbookFocusMap]);

  const visibleHandbookSections = useMemo(() => {
    if (showAllHandbook) return filteredHandbook;
    return filteredHandbook.slice(0, 3);
  }, [filteredHandbook, showAllHandbook]);

  const handbookStats = useMemo(() => {
    const sectionCount = filteredHandbook.length;
    const itemCount = filteredHandbook.reduce((acc, section) => acc + section.items.length, 0);
    return { sectionCount, itemCount };
  }, [filteredHandbook]);

  const resetAll = () => {
    setFile(null);
    setPreview("");
    setResult(null);
    setError("");
    setLoading(false);
  };

  const openConsultMail = (context = "") => {
    const subject = encodeURIComponent("AgroGuard Danismanlik Talebi");
    const base = `Merhaba,

${context || "Danismanlik talep ediyorum."}

`;
    const meta = `Secilen bitki: ${selectedPlant?.name || "-"}
` +
      `Tespit: ${result?.diagnosis?.name || "-"}
` +
      `Guven: ${result?.diagnosis?.confidence ? Math.round((result.diagnosis.confidencePct ?? (result.diagnosis.confidence * 100))) + "%" : "-"}
` +
      `Konum: ${fieldLocation?.coords || "-"}
` +
      `Not: ${fieldLocation?.notes || "-"}
`;
    const body = encodeURIComponent(base + meta);
    window.location.href = `mailto:${CONSULT_EMAIL}?subject=${subject}&body=${body}`;
  };

  const submitContact = async () => {
    setContactStatus("");
    if (!contactForm.name || !contactForm.email || !contactForm.message) {
      setContactStatus("Lutfen ad, e-posta ve mesaji doldurun.");
      return;
    }
    const subject = contactForm.subject
      ? `Danismanlik: ${contactForm.subject}`
      : "AgroGuard Danismanlik Talebi";
    const body = `Ad: ${contactForm.name}
E-posta: ${contactForm.email}

${contactForm.message}`;
    const mail = `mailto:${CONSULT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mail;
    setContactStatus("Mail uygulamasi acildi. Gonderim kullanicida tamamlanir.");
  };
  const generateDemoReport = () => {
    const risk = weatherSummary?.riskTags?.join(" • ") || "Normal";
    const plant = selectedPlant?.name || "Bitki";
    const soil = soilReport?.soilType || "Toprak bilinmiyor";
    const score = fieldScore?.score || 0;
    const flags = [
      demoFlags.frost ? "Don riski" : null,
      demoFlags.pest ? "Zararli alarmi" : null,
      demoFlags.irrigation ? "Sulama kritik" : null,
      demoFlags.wind ? "Ruzgar siniri" : null
    ].filter(Boolean);
    const flagText = flags.length ? ` • Demo uyarilar: ${flags.join(", ")}` : "";
    const note = `Saha skoru ${score}/100. Hava riski: ${risk}. ${plant} icin toprak: ${soil}.${flagText}`;
    setDemoReport(note);
    setDemoReportStatus("Rapor guncellendi.");
  };

  const downloadDemoReport = () => {
    const content = demoReport || "Demo raporu olusturulmadi.";
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "agroguard_demo_rapor.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyDemoReport = async () => {
    if (!demoReport) {
      setDemoReportStatus("Once rapor olustur.");
      return;
    }
    try {
      await navigator.clipboard.writeText(demoReport);
      setDemoReportStatus("Rapor kopyalandi.");
    } catch (err) {
      setDemoReportStatus("Kopyalama basarisiz.");
    }
  };

  const buildDemoShare = () => {
    const payload = {
      score: demoFeedback.score,
      note: demoFeedback.note || "-",
      plant: selectedPlant?.name || "Bitki",
      risk: weatherSummary?.riskTags?.join("|") || "normal"
    };
    return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  };


  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus("Tarayici konum destegi yok.");
      return;
    }
    setGeoStatus("Konum aliniyor...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
        setFieldLocation((prev) => ({ ...prev, coords }));
        setGeoStatus("Konum alindi.");
      },
      () => {
        setGeoStatus("Konum izni reddedildi veya alinamadi.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const mapLink = useMemo(() => {
    const coords = fieldLocation.coords?.trim();
    if (!coords) return "";
    return `https://maps.google.com/?q=${encodeURIComponent(coords)}`;
  }, [fieldLocation.coords]);

  const parsedCoords = useMemo(() => {
    const raw = fieldLocation.coords?.trim();
    if (!raw) return null;
    const parts = raw.split(",").map((item) => Number(item.trim()));
    if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) {
      return null;
    }
    const [lat, lon] = parts;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat, lon };
  }, [fieldLocation.coords]);

  const coordsValid = Boolean(parsedCoords);

  const econYieldAuto = useMemo(() => {
    const key = econCrop || selectedPlant?.id || "";
    const cityKey = city || "";
    if (!key || !cropYieldKgDa[key]) return 0;
    const data = cropYieldKgDa[key];
    return data.provincesKgDa?.[cityKey] || data.nationalKgDa || 0;
  }, [econCrop, selectedPlant, city]);

  React.useEffect(() => {
    if (!econYield) {
      setEconYield(econYieldAuto || 0);
    }
  }, [econYieldAuto, econYield]);

  const econTotals = useMemo(() => {
    const area = Number(econArea) || 0;
    const yieldKg = Number(econYield) || 0;
    const price = Number(econPrice) || 0;
    const revenue = area * yieldKg * price;
    const cost = Object.values(econCosts).reduce((acc, val) => acc + (Number(val) || 0), 0);
    const landValue = (Number(econLandValue) || 0) * area;
    return {
      area,
      revenue,
      cost,
      landValue,
      net: revenue - cost,
      roi: cost > 0 ? Math.round(((revenue - cost) / cost) * 100) : 0
    };
  }, [econArea, econYield, econPrice, econCosts, econLandValue]);

  const demoScenarioSummary = useMemo(() => {
    const baseYield = cropYieldKgDa[demoScenario.crop]?.nationalKgDa || 0;
    const adjustedYield = baseYield * (1 + (Number(demoScenario.yieldBoost) || 0) / 100);
    const revenue = adjustedYield * (Number(demoScenario.price) || 0);
    const riskPenalty = Math.max(0, 100 - (Number(demoScenario.risk) || 0));
    return {
      adjustedYield: Math.round(adjustedYield),
      revenue: Math.round(revenue),
      score: Math.round((revenue / 1000) + riskPenalty)
    };
  }, [demoScenario]);

  const weatherSummary = useMemo(() => {
    if (!weather) return null;
    const humidity = weather.humidity ?? 0;
    const wind = weather.windKmh ?? 0;
    const gust = weather.windGustKmh ?? 0;
    const precip = weather.precipitationMm ?? 0;
    const frost = weather.frostRisk;
    const riskTags = [];
    if (frost) riskTags.push("Don riski");
    if (humidity >= 80) riskTags.push("Mantar riski");
    if (wind >= 20 || gust >= 35) riskTags.push("Ruzgar stresi");
    if (precip >= 10) riskTags.push("Asiri yagis");
    if (!riskTags.length) riskTags.push("Normal");
    const score = Math.min(
      100,
      (frost ? 40 : 0) +
        (humidity >= 80 ? 30 : 0) +
        (wind >= 20 || gust >= 35 ? 20 : 0) +
        (precip >= 10 ? 20 : 0)
    );
    const actions = [];
    if (frost) actions.push("Don icin ortu/bariyer hazirla.");
    if (humidity >= 80) actions.push("Havalandirmayi artir, yaprak islatsiz sulama.");
    if (wind >= 20 || gust >= 35) actions.push("Ruzgar kirici ve baglama kontrol et.");
    if (precip >= 10) actions.push("Yogun yagis: drenaj ve su birikimini kontrol et.");
    if (!actions.length) actions.push("Rutin izlemeye devam et.");
    return { riskTags, score, actions };
  }, [weather]);

  const forecastSummary = useMemo(() => {
    if (!forecast?.days?.length) return null;
    const days = forecast.days;
    const mins = days.map((d) => (typeof d.min === "number" ? d.min : 99));
    const maxs = days.map((d) => (typeof d.max === "number" ? d.max : -99));
    const precips = days.map((d) => (typeof d.precipitationMm === "number" ? d.precipitationMm : 0));
    const frostDays = days.filter((d) => d.frost).length;
    const rainyDays = precips.filter((val) => val >= 10).length;
    const maxPrecip = precips.length ? Math.max(...precips) : 0;
    return {
      frostDays,
      rainyDays,
      minTemp: Math.min(...mins),
      maxTemp: Math.max(...maxs),
      maxPrecip
    };
  }, [forecast]);

  const maxWindKmh = useMemo(() => {
    if (forecast?.hourly?.length) {
      return Math.max(
        ...forecast.hourly.map((h) => Math.max(h.windKmh ?? 0, h.windGustKmh ?? 0))
      );
    }
    return Math.max(weather?.windKmh ?? 0, weather?.windGustKmh ?? 0);
  }, [forecast, weather]);

  const diseaseTrends = useMemo(() => {
    if (!history.length) return [];
    const counts = history.reduce((acc, item) => {
      const key = item.name || "Bilinmeyen";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const total = history.length;
    return Object.entries(counts)
      .map(([name, count]) => ({ name, pct: Math.round((count / total) * 100) }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 3);
  }, [history]);

  const frostOutlook = useMemo(() => {
    if (!forecast?.days?.length) return [];
    return forecast.days.slice(0, 3).map((day) => {
      const min = day.min ?? 0;
      const level = min <= 0 ? "high" : min <= 2 ? "mid" : "low";
      return {
        day: day.day || "Gün",
        min,
        level
      };
    });
  }, [forecast]);

  const nextHours = useMemo(() => {
    if (!forecast?.hourly?.length) return [];
    return forecast.hourly.slice(0, 6).map((item) => ({
      ...item,
      label: new Date(item.time).toLocaleTimeString("tr-TR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: forecast.timeZone || undefined
      })
    }));
  }, [forecast]);

  const weatherAlerts = useMemo(() => {
    if (!weather) return [];
    const alerts = [];
    if (weather.frostRisk) alerts.push({ level: "danger", text: "Don riski: hassas bitkileri koru." });
    if ((weather.precipitationMm ?? 0) >= 15) {
      alerts.push({ level: "danger", text: "Asiri yagis: drenaj ve su birikimi riskini kontrol et." });
    } else if ((weather.precipitationMm ?? 0) >= 8) {
      alerts.push({ level: "warning", text: "Yagis artiyor: mantar riski icin onlem al." });
    }
    if ((weather.windGustKmh ?? 0) >= 40) {
      alerts.push({ level: "danger", text: "Ruzgar esintisi yuksek: baglama ve bariyerleri guclendir." });
    } else if ((weather.windKmh ?? 0) >= 20) {
      alerts.push({ level: "warning", text: "Ruzgar stresi: hassas yapraklari kontrol et." });
    }
    const fiveDay = forecast?.days || [];
    const frostDays = fiveDay.filter((d) => d.frost).length;
    const rainDays = fiveDay.filter((d) => (d.precipitationMm ?? 0) >= 10).length;
    const heavyRainDays = fiveDay.filter((d) => (d.precipitationMm ?? 0) >= 20).length;
    const windDays = fiveDay.filter((d) => (d.windGustKmh ?? 0) >= 35).length;
    if (frostDays >= 2) {
      alerts.push({ level: "danger", text: `5 gunluk tahminde ${frostDays} gun don riski var.` });
    }
    if (rainDays >= 2) {
      alerts.push({ level: "warning", text: `5 gunluk tahminde ${rainDays} gun yogun yagis gorunuyor.` });
    }
    if (heavyRainDays >= 1) {
      alerts.push({ level: "danger", text: `5 gun icinde ${heavyRainDays} gun asiri yagis bekleniyor.` });
    }
    if (windDays >= 2) {
      alerts.push({ level: "warning", text: `5 gunluk tahminde ${windDays} gun ruzgar stresi bekleniyor.` });
    }
    return alerts.slice(0, 4);
  }, [weather, forecast]);

  const hourlyAlerts = useMemo(() => {
    if (!forecast?.hourly?.length) return [];
    const alerts = [];
    const next = forecast.hourly.slice(0, 6);
    const gustPeak = Math.max(...next.map((h) => h.windGustKmh ?? 0));
    const rainPeak = Math.max(...next.map((h) => h.precipitationMm ?? 0));
    if (gustPeak >= 45) {
      alerts.push({ level: "danger", text: "Onumuzdeki 6 saatte kuvvetli esinti bekleniyor." });
    } else if (gustPeak >= 35) {
      alerts.push({ level: "warning", text: "Onumuzdeki 6 saatte esinti artisi var." });
    }
    if (rainPeak >= 8) {
      alerts.push({ level: "warning", text: "Onumuzdeki 6 saatte yagis artisi bekleniyor." });
    }
    return alerts;
  }, [forecast]);

  const analysisState = useMemo(() => {
    if (!result) return null;
    if (result.decision?.status) return result.decision.status;
    if (result.filter?.blocked) return "blocked";
    if (result.qualityGate) return "review";
    if (result.modelMetrics?.lowConfidence) return "review";
    if (result.diagnosis?.confidenceTier === "low") return "review";
    return "ok";
  }, [result]);

  const warningCount = useMemo(() => {
    if (!result) return 0;
    let count = 0;
    if (result.warnings?.length) count += result.warnings.length;
    if (result.filter?.blocked) count += 1;
    if (result.qualityGate) count += 1;
    if (result.retrySuggested) count += 1;
    if (analysisState) count += 1;
    return count;
  }, [result, analysisState]);

  const showCarePlan =
    result && analysisState !== "blocked" && !(result.qualityGate && result.diagnosis?.confidence < 0.35);

  const diagnosisSummary = useMemo(() => {
    if (!result?.diagnosis) return "";
    const plant = result.detectedPlant || selectedPlant?.name || "Bitki";
    const status = result.diagnosis.status === "healthy" ? "saglikli" : "riskli";
    const conf = Math.round((result.diagnosis.confidence || 0) * 100);
    const area = result.diagnosis.problemArea || "belirsiz bolge";
    return `${plant} icin ${status} durum • ${conf}% guven • ${area}`;
  }, [result, selectedPlant]);

  React.useEffect(() => {
    const stored = localStorage.getItem("agroguard-history");
    if (stored) {
      setHistory(JSON.parse(stored));
    }
    const storedTodos = localStorage.getItem("agroguard-todos");
    if (storedTodos) {
      setTodos(JSON.parse(storedTodos));
    }
    const storedNote = localStorage.getItem("agroguard-note");
    if (storedNote) {
      setNote(storedNote);
    }
    const storedAlerts = localStorage.getItem("agroguard-alerts");
    if (storedAlerts) {
      setAlerts(JSON.parse(storedAlerts));
    }
    const storedRoutine = localStorage.getItem("agroguard-routine");
    if (storedRoutine) {
      setRoutine(JSON.parse(storedRoutine));
    }
    const storedReminders = localStorage.getItem("agroguard-reminders");
    if (storedReminders) {
      setReminders(JSON.parse(storedReminders));
    }
    const storedField = localStorage.getItem("agroguard-field");
    if (storedField) {
      setFieldLocation(JSON.parse(storedField));
    }
    const storedTab = localStorage.getItem("agroguard-active-tab");
    if (storedTab) {
      setActiveTab(storedTab);
    }
    const storedAdvanced = localStorage.getItem("agroguard-show-advanced");
    if (storedAdvanced) {
      setShowAdvanced(storedAdvanced === "true");
    }
    const storedPlantId = localStorage.getItem("agroguard-selected-plant");
    if (storedPlantId) {
      setSelectedPlantId(storedPlantId);
    }
    const storedHandbookQuery = localStorage.getItem("agroguard-handbook-query");
    if (storedHandbookQuery) {
      setHandbookQuery(storedHandbookQuery);
    }
    const storedHandbookCategory = localStorage.getItem("agroguard-handbook-category");
    if (storedHandbookCategory) {
      setHandbookCategory(storedHandbookCategory);
    }
    const storedHandbookFocus = localStorage.getItem("agroguard-handbook-focus");
    if (storedHandbookFocus) {
      setHandbookFocus(storedHandbookFocus);
    }
    const storedCity = localStorage.getItem("agroguard-city");
    if (storedCity) {
      setCity(storedCity);
    }
    const storedDrawerTab = localStorage.getItem("agroguard-drawer-tab");
    if (storedDrawerTab) {
      setDrawerTab(storedDrawerTab);
    }
  }, []);

  React.useEffect(() => {
    let isActive = true;
    setPlantDiseaseError("");
    if (!selectedPlant?.id) {
      setPlantDiseaseData(null);
      return () => {
        isActive = false;
      };
    }
    fetch(apiUrl(`/api/plant-diseases?plant=${encodeURIComponent(selectedPlant.id)}`))
      .then((res) => res.json())
      .then((data) => {
        if (isActive) setPlantDiseaseData(data);
      })
      .catch(() => {
        if (isActive) setPlantDiseaseError("Bitki hastalik listesi yuklenemedi.");
      });
    return () => {
      isActive = false;
    };
  }, [selectedPlant]);

  React.useEffect(() => {
    let isActive = true;
    setApiStatus({ state: "checking", message: "" });
    fetch(apiUrl("/api/health"))
      .then((res) => {
        if (!res.ok) throw new Error("health_failed");
        return res.json();
      })
      .then(() => {
        if (isActive) setApiStatus({ state: "ok", message: "Sunucu baglantisi hazir." });
      })
      .catch(() => {
        if (isActive)
          setApiStatus({
            state: "down",
            message: "Sunucuya ulasilamadi. Backend acik degil gibi gorunuyor."
          });
      });
    return () => {
      isActive = false;
    };
  }, []);

  React.useEffect(() => {
    if (result?.retrySuggested) {
      setShowQualityGate(true);
    }
  }, [result]);

  React.useEffect(() => {
    localStorage.setItem("agroguard-history", JSON.stringify(history));
  }, [history]);

  React.useEffect(() => {
    localStorage.setItem("agroguard-active-tab", activeTab);
  }, [activeTab]);

  React.useEffect(() => {
    localStorage.setItem("agroguard-show-advanced", String(showAdvanced));
  }, [showAdvanced]);

  React.useEffect(() => {
    localStorage.setItem("agroguard-todos", JSON.stringify(todos));
  }, [todos]);

  React.useEffect(() => {
    localStorage.setItem("agroguard-note", note);
  }, [note]);

  React.useEffect(() => {
    localStorage.setItem("agroguard-alerts", JSON.stringify(alerts));
  }, [alerts]);

  React.useEffect(() => {
    localStorage.setItem("agroguard-routine", JSON.stringify(routine));
  }, [routine]);

  React.useEffect(() => {
    localStorage.setItem("agroguard-reminders", JSON.stringify(reminders));
  }, [reminders]);

  React.useEffect(() => {
    localStorage.setItem("agroguard-field", JSON.stringify(fieldLocation));
  }, [fieldLocation]);

  React.useEffect(() => {
    localStorage.setItem("agroguard-selected-plant", selectedPlant?.id || "");
  }, [selectedPlant]);

  const handbookIds = useMemo(() => handbookSections.map((section) => section.id), []);

  React.useEffect(() => {
    localStorage.setItem("agroguard-handbook-query", handbookQuery);
  }, [handbookQuery]);

  React.useEffect(() => {
    if (handbookCategory !== "all" && !handbookIds.includes(handbookCategory)) {
      setHandbookCategory("all");
      return;
    }
    localStorage.setItem("agroguard-handbook-category", handbookCategory);
  }, [handbookCategory, handbookIds]);

  React.useEffect(() => {
    localStorage.setItem("agroguard-handbook-focus", handbookFocus);
  }, [handbookFocus]);

  React.useEffect(() => {
    localStorage.setItem("agroguard-city", city);
  }, [city]);

  React.useEffect(() => {
    localStorage.setItem("agroguard-drawer-tab", drawerTab);
  }, [drawerTab]);

  const applyCityQuery = () => {
    const value = cityQuery.trim();
    if (!value) return;
    setCity(value);
    setCityQuery("");
  };

  React.useEffect(() => {
    const timer = setInterval(() => {
      setWeatherRefreshKey((prev) => prev + 1);
    }, 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);


  React.useEffect(() => {
    let isActive = true;
    const query = coordsValid
      ? `coords=${encodeURIComponent(`${parsedCoords.lat},${parsedCoords.lon}`)}`
      : `city=${encodeURIComponent(city)}`;
    const cachedWeather = localStorage.getItem("agroguard-weather-cache");
    setWeatherError("");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    fetch(apiUrl(`/api/weather?${query}`), { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (!isActive) return;
        setWeather(data);
        localStorage.setItem("agroguard-weather-cache", JSON.stringify(data));
      })
      .catch(() => {
        if (!isActive) return;
        if (cachedWeather) {
          setWeather(JSON.parse(cachedWeather));
          setWeatherError("Canli veri kesildi, son alinan veri gosteriliyor.");
        } else {
          setWeather(null);
          setWeatherError("Hava durumu yuklenemedi.");
        }
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      isActive = false;
      clearTimeout(timeout);
    };
  }, [city, parsedCoords, coordsValid, weatherRefreshKey]);

  React.useEffect(() => {
    let isActive = true;
    const query = coordsValid
      ? `coords=${encodeURIComponent(`${parsedCoords.lat},${parsedCoords.lon}`)}`
      : `city=${encodeURIComponent(city)}`;
    const cachedForecast = localStorage.getItem("agroguard-forecast-cache");
    setForecastError("");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    fetch(apiUrl(`/api/forecast?${query}`), { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (!isActive) return;
        setForecast(data);
        localStorage.setItem("agroguard-forecast-cache", JSON.stringify(data));
      })
      .catch(() => {
        if (!isActive) return;
        if (cachedForecast) {
          setForecast(JSON.parse(cachedForecast));
          setForecastError("Canli tahmin kesildi, son alinan veri gosteriliyor.");
        } else {
          setForecast(null);
          setForecastError("Tahmin verisi yuklenemedi.");
        }
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      isActive = false;
      clearTimeout(timeout);
    };
  }, [city, parsedCoords, coordsValid, weatherRefreshKey]);

  React.useEffect(() => {
    let isActive = true;
    const query = coordsValid
      ? `coords=${encodeURIComponent(`${parsedCoords.lat},${parsedCoords.lon}`)}`
      : `city=${encodeURIComponent(city)}`;
    setSoilLoading(true);
    setSoilError("");
    fetch(apiUrl(`/api/soil?${query}`))
      .then((res) => res.json())
      .then((data) => {
        if (isActive) setSoilReport(data);
      })
      .catch(() => {
        if (isActive) setSoilError("Toprak verisi yuklenemedi.");
      })
      .finally(() => {
        if (isActive) setSoilLoading(false);
      });
    return () => {
      isActive = false;
    };
  }, [city, parsedCoords, coordsValid, weatherRefreshKey]);

  React.useEffect(() => {
    let isActive = true;
    fetch(apiUrl("/api/sources"))
      .then((res) => res.json())
      .then((data) => {
        if (isActive) {
          setSources(data.sources || []);
          setSourcesUpdatedAt(data.updatedAt || "");
        }
      })
      .catch(() => {
        if (isActive) setSourcesError("Kaynaklar yuklenemedi.");
      });
    return () => {
      isActive = false;
    };
  }, []);

  React.useEffect(() => {
    let isActive = true;
    setMetricsError("");
    fetch(apiUrl("/api/metrics"))
      .then((res) => res.json())
      .then((data) => {
        if (isActive) setMetrics(data);
      })
      .catch(() => {
        if (isActive) setMetricsError("Metrikler yuklenemedi.");
      });
    return () => {
      isActive = false;
    };
  }, []);

  const sourceCategories = useMemo(() => {
    const set = new Set();
    sources.forEach((item) => set.add(item.category));
    return ["all", ...Array.from(set).sort()];
  }, [sources]);

  const filteredSources = useMemo(() => {
    const q = sourceQuery.trim().toLowerCase();
    return sources.filter((item) => {
      const categoryMatch = sourceCategory === "all" ? true : item.category === sourceCategory;
      const textMatch =
        !q ||
        `${item.title} ${item.summary}`.toLowerCase().includes(q);
      return categoryMatch && textMatch;
    });
  }, [sources, sourceQuery, sourceCategory]);

  const sourceStats = useMemo(() => {
    const total = sources.length;
    const categories = new Set(sources.map((item) => item.category)).size;
    const handbookCount = handbookSections.reduce((acc, section) => acc + section.items.length, 0);
    return { total, categories, handbookCount };
  }, [sources]);

  const researchHighlights = useMemo(() => sources.slice(0, 3), [sources]);

  React.useEffect(() => {
    let isActive = true;
    fetch(apiUrl("/api/plants"))
      .then((res) => res.json())
      .then((data) => {
        if (isActive) setModelPlants(data.plants || []);
      })
      .catch(() => {
        if (isActive) setModelPlants([]);
      });
    return () => {
      isActive = false;
    };
  }, []);

  const onSelectFile = (selected) => {
    if (!selected) return;
    if (!selected.type.startsWith("image/")) {
      setError("Lutfen bir gorsel dosyasi secin.");
      return;
    }
    setError("");
    setResult(null);
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  };

  const handleDrop = (event) => {
    event.preventDefault();
    onSelectFile(event.dataTransfer.files[0]);
  };

  const analyze = async () => {
    if (!selectedPlant) {
      setError("Once bitki secmelisiniz.");
      return;
    }
    if (!file) {
      setError("Analiz icin once bir gorsel yukleyin.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const previewSnapshot = preview;
      const formData = new FormData();
      formData.append("image", file);
      if (selectedPlant) {
        formData.append("plant", selectedPlant.id || selectedPlant.name || "");
      }
      formData.append("strictPlant", strictPlantFilter ? "1" : "0");

      const response = await fetch(apiUrl("/api/diagnose"), {
        method: "POST",
        body: formData
      });

      let data = null;
      if (!response.ok) {
        try {
          data = await response.json();
        } catch (parseErr) {
          data = null;
        }
        const reason = data?.error
          ? `Analiz basarisiz: ${data.error}${data?.detail ? ` (${data.detail})` : ""}`
          : "Analiz basarisiz oldu.";
        throw new Error(reason);
      }

      data = await response.json();
      setResult(data);
      setHistory((prev) =>
        [
          {
            id: data.id,
            name: data.diagnosis?.name,
            confidence: data.diagnosis?.confidence,
            time: new Date().toLocaleString("tr-TR"),
            preview: previewSnapshot
          },
          ...prev
        ].slice(0, 6)
      );
    } catch (err) {
      const message =
        err?.message?.includes("Failed to fetch") || err?.message?.includes("NetworkError")
          ? "Sunucuya baglanti kurulamadi. Backend acik mi kontrol edin."
          : err?.message || "Analiz sirasinda bir hata olustu. Lutfen tekrar deneyin.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const alertRecommendation = () => {
    if (alerts.moisture === "dusuk") return "Toprak kuru: sulamayi sabaha al.";
    if (alerts.moisture === "yuksek") return "Asiri nem: drenaji kontrol et.";
    if (alerts.light === "dusuk") return "Isik az: bitkiyi daha aydinlik alana al.";
    if (alerts.light === "yuksek") return "Isik fazla: golgeleme kullan.";
    if (alerts.airflow === "dusuk") return "Hava akisina dikkat: havalandirma ac.";
    if (alerts.airflow === "yuksek") return "Ruzgar stresi: destek ve bariyer kullan.";
    if (alerts.temperature === "dusuk") return "Sicaklik dusuk: don riski icin onlem al.";
    if (alerts.temperature === "yuksek") return "Sicaklik yuksek: sulama araligini kisalt.";
    if (alerts.humidity === "yuksek") return "Nem yuksek: yaprak islanmasini azalt.";
    if (alerts.humidity === "dusuk") return "Nem dusuk: bitki stresi icin sulamayi ayarla.";
    if (alerts.soilPh === "dusuk") return "pH dusuk: kirec veya uygun duzenleyici kullan.";
    if (alerts.soilPh === "yuksek") return "pH yuksek: organik madde ile dengele.";
    if (alerts.salinity === "yuksek") return "Tuzluluk yuksek: yikama sulamasi planla.";
    if (alerts.leafWetness === "yuksek") return "Yaprak islakligi yuksek: sabah sulama ve havalandirma.";
    if (alerts.pestPressure === "yuksek") return "Zararlı baskisi yuksek: yapiskan tuzak ve takip.";
    if (alerts.nutrientBalance === "dusuk") return "Besin dengesi dusuk: yaprak analizi ve gubre plani.";
    return "Dengeler iyi: duzenli kontrolu surdur.";
  };

  const urgentActions =
    result?.carePlan?.length && result.diagnosis?.status !== "healthy"
      ? result.carePlan.slice(0, 2)
      : [];
  const actionPlan = result?.carePlan?.length
    ? {
        today: result.carePlan.slice(0, 2),
        week: result.carePlan.slice(2, 4),
        monitor: ["Yapraklari takip et", "Yeni leke var mi kontrol et"]
      }
    : null;
  const isHandbook = activeTab === "handbook";
  const showDiagnosisResult = result && !result.filter?.blocked;

  const handleFeatureTab = (key) => {
    setFeatureTab(key);
    const anchorMap = {
      core: "diagnosis",
      operations: "operations",
      intelligence: "intelligence",
      commerce: "commerce",
      compliance: "compliance",
      learning: "learning"
    };
    if (key !== "all" && anchorMap[key]) {
      document.getElementById(anchorMap[key])?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const featureSummaries = {
    core: [
      { title: "Teshis", value: "Gorsel analiz + plan" },
      { title: "Guven", value: "Top3 tahmin" },
      { title: "Aksiyon", value: "Bugun/Bu hafta" }
    ],
    operations: [
      { title: "Tarla", value: "Konum + hava" },
      { title: "Toprak", value: "Profil + oneriler" },
      { title: "Sulama", value: "Alarm + kontrol" }
    ],
    intelligence: [
      { title: "AI", value: "Risk sinyalleri" },
      { title: "Rapor", value: "Otomatik dokum" },
      { title: "Skor", value: "Saha skoru" }
    ],
    commerce: [
      { title: "Fiyat", value: "Pazar trend" },
      { title: "Lojistik", value: "Rota plan" },
      { title: "Gelir", value: "Finansal ozet" }
    ],
    compliance: [
      { title: "PHI", value: "Etiket uyumu" },
      { title: "Izlenebilirlik", value: "Parti bazli" },
      { title: "Denetim", value: "Sertifikasyon" }
    ],
    learning: [
      { title: "Kilavuz", value: "Tarim referans" },
      { title: "Ders", value: "Mikro egitim" },
      { title: "Sozluk", value: "Belirti rehberi" }
    ],
    all: [
      { title: "Superapp", value: "Tum moduller" },
      { title: "Saha", value: "Operasyon + AI" },
      { title: "Pazar", value: "Fiyat + kalite" }
    ]
  };
  const summaryCards = featureSummaries[featureTab] || featureSummaries.all;

  const statusItems = [
    {
      label: "Hava",
      value: weather
        ? `${weather.temp ?? "-"}°C · ${weather.condition} · Ruzgar ${weather.windKmh ?? "-"} km/sa`
        : "Yukleniyor"
    },
    {
      label: "Toprak",
      value: soilReport ? `${soilReport.soilType} · pH ${soilReport.ph}` : "Bekleniyor"
    },
    {
      label: "Don",
      value: weather?.frostRisk ? "Risk var" : "Risk yok"
    },
    {
      label: "Ruzgar",
      value: weather
        ? `${weather.windKmh ?? "-"} km/sa${weather.windGustKmh ? ` / Esinti ${weather.windGustKmh} km/sa` : ""}`
        : "Bekleniyor"
    },
    {
      label: "Bitki",
      value: selectedPlant?.name || "Secilmedi"
    }
  ];

  const statusPalette = {
    Hava: "sky",
    Toprak: "soil",
    Don: weather?.frostRisk ? "alert" : "safe",
    Ruzgar: (weather?.windGustKmh ?? 0) >= 40 || (weather?.windKmh ?? 0) >= 20 ? "alert" : "safe",
    Bitki: selectedPlant ? "plant" : "muted"
  };

  const soilFit = (() => {
    if (!soilReport || !selectedPlant) return null;
    const name = selectedPlant.name;
    const recommended = (soilReport.recommended || []).map((item) => item.toLowerCase());
    const risky = (soilReport.risky || []).map((item) => item.toLowerCase());
    if (recommended.some((item) => item.includes(name.toLowerCase()))) {
      return { level: "good", label: "Uygun", detail: `${name} bu toprak icin uygun gorunuyor.` };
    }
    if (risky.some((item) => item.includes(name.toLowerCase()))) {
      return { level: "risk", label: "Riskli", detail: `${name} icin riskli bir profil.` };
    }
    return { level: "mid", label: "Dikkat", detail: `${name} ekilecekse su ve hastalik takibi artirilmali.` };
  })();

  const fieldScore = useMemo(() => {
    const weatherPenalty = weatherSummary?.score ?? 0;
    const soilPenalty = soilFit?.level === "risk" ? 20 : soilFit?.level === "mid" ? 10 : 0;
    const modelPenalty = analysisState === "review" ? 10 : analysisState === "blocked" ? 20 : 0;
    const score = Math.max(40, Math.min(95, 100 - weatherPenalty * 0.6 - soilPenalty - modelPenalty));
    const priorities = [];
    if (weatherSummary?.riskTags?.includes("Don riski")) priorities.push("Don onlemi planla");
    if (weatherSummary?.riskTags?.includes("Asiri yagis")) priorities.push("Drenaj ve su birikimini kontrol et");
    if (weatherSummary?.riskTags?.includes("Ruzgar stresi")) priorities.push("Ruzgar kirici ve baglama kontrolu");
    if (soilFit?.level === "risk") priorities.push("Toprak uygunlugunu yeniden degerlendir");
    if (analysisState === "review") priorities.push("Yeni fotografla teshisi dogrula");
    if (!priorities.length) priorities.push("Rutin izlemeye devam et");
    return { score: Math.round(score), priorities };
  }, [weatherSummary, soilFit, analysisState]);

  const soilInsights = useMemo(() => {
    if (!soilReport || soilReport.source !== "soilgrids") return null;
    const ph = Number(soilReport.ph);
    const organic = Number(soilReport.organic);
    const phLabel = Number.isNaN(ph)
      ? "Bilinmiyor"
      : ph < 5.5
        ? "Asidik"
        : ph <= 7.3
          ? "Nötr"
          : "Bazik";
    const organicLabel = Number.isNaN(organic)
      ? "Bilinmiyor"
      : organic < 1
        ? "Düsük organik"
        : organic < 2.5
          ? "Orta organik"
          : "Yüksek organik";
    return { phLabel, organicLabel };
  }, [soilReport]);

  const buildSoilAnswer = () => {
    if (!soilReport) return "Toprak verisi olmadan net yorum yapamam. Once konumu sec.";
    const area = soilReport.coords ? `Koordinat: ${soilReport.coords}` : `Sehir: ${soilReport.city}`;
    const rec = (soilReport.recommended || []).slice(0, 4).join(", ");
    const risk = (soilReport.diseaseRisk || []).slice(0, 2).join(", ");
    return `${area}. Toprak tipi ${soilReport.soilType}, pH ${soilReport.ph}. Iklem ${soilReport.climate}. Oncelikli oneriler: ${rec || "-"}. Riskli hastaliklar: ${risk || "-"}.`;
  };

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-shapes">
          <span />
          <span />
          <span />
        </div>
        <div className="hero-top">
          <div className="logo">
            <Leaf size={22} />
            <span>AgroGuard</span>
          </div>
          <div className="hero-top-meta">
            <div className="hero-badge">
              {isHandbook ? "Tarim el kilavuzu" : "Tarim el kilavuzu + teshis"}
            </div>
            <div className={`api-indicator ${apiStatus.state}`}>
              <span>API</span>
              <strong>
                {apiStatus.state === "ok"
                  ? "Hazir"
                  : apiStatus.state === "down"
                    ? "Baglanti yok"
                    : "Kontrol ediliyor"}
              </strong>
            </div>
          </div>
        </div>
        <div className="hero-grid">
          <div className="hero-copy">
            <span className="pill">
              <Sparkles size={14} /> Yesil odakli akilli bakim asistani
            </span>
            <h1>
              {isHandbook
                ? "Tarim el kilavuzu: sahada hizli karar al."
                : "Tarim superapp: hastalik tespiti ve saha aksiyonu."}
            </h1>
            <p>
              {isHandbook
                ? "Tarla yonetimi, sulama, besleme ve hastalik onleme icin net protokoller. Referanslari takip et, sahada uygulanabilir adimlarla ilerle."
                : "AgroGuard; tarla, sera ve uretim alanlari icin gorsel analiz, dogru bakim adimlari ve uygulama protokollerini tek yerde toplar. Bitki sec, fotograf yukle, sonucu gor, aksiyonlari hizla uygula."}
            </p>
            <div className="hero-actions" />
            <details className="accordion compact">
              <summary>Saha ozetleri</summary>
              <div className="status-strip">
                {statusItems.map((item) => (
                  <div key={item.label} className={`status-card ${statusPalette[item.label] || ""}`}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    {item.label === "Hava" && weather?.source && (
                      <em className="status-badge live">
                        Canli
                      </em>
                    )}
                  </div>
                ))}
              </div>
              <div className="hero-highlights">
                {highlights.map((item) => (
                  <div key={item.label}>
                    <strong>{item.value}</strong>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </details>
            <div className="primary-nav">
              <button
                className={activeTab === "diagnosis" ? "active" : ""}
                onClick={() => setActiveTab("diagnosis")}
              >
                Hastalik tespiti
              </button>
              <button
                className={activeTab === "handbook" ? "active" : ""}
                onClick={() => setActiveTab("handbook")}
              >
                El kilavuzu
              </button>
              <button
                className={activeTab === "faq" ? "active" : ""}
                onClick={() => setActiveTab("faq")}
              >
                Sik sorulanlar
              </button>
              <button
                className={activeTab === "stats" ? "active" : ""}
                onClick={() => setActiveTab("stats")}
              >
                Istatistikler
              </button>
            </div>
            <div className="cta-card">
              <div>
                <strong>{isHandbook ? "Kilavuza odaklan" : "Hastalik tespiti merkezde"}</strong>
                <p>
                  {isHandbook
                    ? "Referanslarla ekip planini hizla, sonra teshise don."
                    : "Once bitkiyi sec, sonra gorsel yukle ve sonucu al."}
                </p>
              </div>
              <button
                className="primary"
                onClick={() => {
                  setActiveTab("diagnosis");
                }}
              >
                {isHandbook ? "Teshise don" : "Tespit baslat"}
              </button>
            </div>
          </div>
          {!isHandbook && <div className="panel">
            {activeTab === "diagnosis" && (
              <div className="workflow-strip">
                <div className={`workflow-step ${hasPlant ? "done" : ""}`}>
                  <span>1</span>
                  <div>
                    <strong>Bitki sec</strong>
                    <small>{hasPlant ? "Secildi" : "Zorunlu adim"}</small>
                  </div>
                </div>
                <div className={`workflow-step ${hasFile ? "done" : ""}`}>
                  <span>2</span>
                  <div>
                    <strong>Gorsel yukle</strong>
                    <small>{hasFile ? "Hazir" : "PNG/JPG"}</small>
                  </div>
                </div>
                <div className={`workflow-step ${hasPlant && hasFile ? "done" : ""}`}>
                  <span>3</span>
                  <div>
                    <strong>Analiz</strong>
                    <small>{hasPlant && hasFile ? "Baslatilabilir" : "Bekliyor"}</small>
                  </div>
                </div>
              </div>
            )}
            {activeTab === "diagnosis" && !selectedPlant && (
              <div className="plant-gate">
                <div>
                  <h3>Once bitkiyi sec</h3>
                  <p>
                    En iyi sonucu almak icin once analiz edilecek bitkiyi secmelisin. Bu,
                    modeli dogru sinifa odaklar.
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={() => document.querySelector(".plant-select select")?.focus()}
                >
                  Bitki sec
                </button>
              </div>
            )}

            <div
              className={`upload-card ${preview ? "has-preview" : ""} ${
                selectedPlant ? "" : "disabled"
              } ${loading ? "loading" : ""}`}
              onClick={() => selectedPlant && fileInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              style={{ display: activeTab === "diagnosis" ? "grid" : "none" }}
            >
              {!preview ? (
                <>
                  <FileImage size={38} />
                  <h3>{selectedPlant ? "Gorsel ekle" : "Once bitki sec"}</h3>
                  <p>PNG, JPG, HEIC desteklenir. Maksimum 8 MB.</p>
                  <div className="quality-hint">
                    <span>Ipucu:</span> Net yaprak, tek odak, sade arka plan.
                  </div>
                  <div className="quality-grid">
                    <span>Yaprak net gorunsun</span>
                    <span>Arka plan sade olsun</span>
                    <span>Isik patlamasin</span>
                    <span>Yaprak kadrajin %60-80'i olsun</span>
                  </div>
                  <div className="upload-cta">
                    {selectedPlant ? "Dosya sec veya surukle" : "Bitki secimi gerekli"}
                  </div>
                </>
              ) : (
                <>
                  <img src={preview} alt="Secilen bitki" />
                  <div className="preview-meta">
                    <span>{file?.name}</span>
                    <span>{fileMeta}</span>
                  </div>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => onSelectFile(event.target.files[0])}
              />
            </div>

            <div className="panel-actions" style={{ display: activeTab === "diagnosis" ? "flex" : "none" }}>
              <div className="plant-select">
                <label>Bitki sec</label>
                <select
                  value={selectedPlant?.id || ""}
                  onChange={(event) => setSelectedPlantId(event.target.value)}
                >
                  <option value="">Bitki seciniz</option>
                  {filteredPlantProfiles.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <small className="muted">
                  Model kapsamı: {filteredPlantProfiles.length} bitki
                </small>
                {filteredPlantProfiles.length <= 3 && (
                  <small className="muted warning-text">
                    Model sinirli bitkiyi destekliyor. Tum PlantVillage modeli gelince genisleyecek.
                  </small>
                )}
                <div className="info-banner">
                  Not: Model su an sadece labels.json icindeki bitkileri taniyor.
                </div>
                <div className="filter-badge">Bitki filtresi zorunlu</div>
                <details className="accordion compact">
                  <summary>Bitki listesi</summary>
                  <div className="plant-grid">
                    {(showAllPlants
                      ? filteredPlantProfiles
                      : filteredPlantProfiles.slice(0, 12)
                    ).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`plant-chip ${item.id} ${
                          selectedPlant?.id === item.id ? "active" : ""
                        }`}
                        onClick={() => setSelectedPlantId(item.id)}
                      >
                        <div className="chip-head">
                          <span className="chip-dot" />
                          <strong>{item.title || item.name}</strong>
                        </div>
                        <span>{item.climate}</span>
                      </button>
                    ))}
                  </div>
                  {filteredPlantProfiles.length > 12 && (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setShowAllPlants((prev) => !prev)}
                    >
                      {showAllPlants ? "Daha az goster" : "Tum bitkileri goster"}
                    </button>
                  )}
                </details>
              </div>
              {!selectedPlant && (
                <div className="plant-mini inline">
                  <strong>Once bitki sec</strong>
                  <span>Bitki secimi zorunlu</span>
                </div>
              )}
              {selectedPlant && (
                <div className="plant-mini inline">
                  <strong>Secilen bitki: {selectedPlant.name}</strong>
                  <span>{selectedPlant.tip}</span>
                </div>
              )}
              {selectedPlant && (
                <details className="accordion compact">
                  <summary>Bitki bakim ozeti</summary>
                  <div className="plant-mini detail">
                    <div>
                      <strong>{selectedPlant.name}</strong>
                      <p>Iklem: {selectedPlant.climate}</p>
                      <p>Sulama: {selectedPlant.water}</p>
                      <p>Toprak: {selectedPlant.soil}</p>
                    </div>
                    <span>{selectedPlant.tip}</span>
                  </div>
                </details>
              )}
              {selectedPlant && (
                <details className="accordion compact">
                  <summary>PlantVillage hastalik listesi</summary>
                  <div className="plant-mini detail">
                    {plantDiseaseData?.diseases?.length ? (
                      <ul className="compact-list">
                        {plantDiseaseData.diseases.map((item) => (
                          <li key={item.label}>
                            <strong>{item.name}</strong>
                            {item.summary ? <span>{item.summary}</span> : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">Bu bitki icin hastalik listesi bulunamadi.</p>
                    )}
                    {plantDiseaseData?.healthy && (
                      <small className="muted">Saglikli sinif: {plantDiseaseData.healthy}</small>
                    )}
                    {plantDiseaseError && <small className="muted">{plantDiseaseError}</small>}
                  </div>
                </details>
              )}
              <div className="action-stack">
                <button
                  className={`primary ${loading ? "loading" : ""}`}
                  onClick={analyze}
                  disabled={loading || !selectedPlant || !file}
                  title={
                    !selectedPlant
                      ? "Once bitki secin"
                      : !file
                        ? "Once gorsel yukleyin"
                        : ""
                  }
                >
                  {loading ? <Loader2 size={16} className="spin" /> : <ShieldCheck size={16} />}
                  {loading ? "Analiz ediliyor" : "Analizi baslat"}
                </button>
                <button className="ghost" onClick={resetAll} disabled={loading}>
                  <X size={16} /> Temizle
                </button>
              </div>
              {loading && (
                <div className="analysis-progress">
                  <div className="progress-bar">
                    <span />
                  </div>
                  <small className="muted">
                    Gorsel hazirlaniyor • Model calisiyor • Rapor olusuyor
                  </small>
                </div>
              )}
            </div>

            {apiStatus.state === "down" && activeTab === "diagnosis" && (
              <div className="alert warning">
                <AlertCircle size={16} />
                {apiStatus.message} API adresi: <strong>{API_BASE || "/"}</strong>
              </div>
            )}

            {error && activeTab === "diagnosis" && (
              <div className="alert error">
                <AlertCircle size={16} /> {error}
              </div>
            )}

            {result && activeTab === "diagnosis" && (
              <div className="result-card compact">
                <div className="result-header">
                  <CheckCircle2 size={18} />
                  <div>
                    <h3>{showDiagnosisResult ? result.diagnosis.name : "Bitki uyumsuz"}</h3>
                    {showDiagnosisResult && diagnosisSummary && (
                      <p className="typewriter" key={diagnosisSummary}>
                        {diagnosisSummary}
                      </p>
                    )}
                    <span>
                      {showDiagnosisResult
                        ? `Guven ${Math.round((result.diagnosis.confidencePct ?? (result.diagnosis.confidence * 100)))}% • ${result.diagnosis.severity}`
                        : "Secilen bitkiye uyan sinif bulunamadi."}
                    </span>
                    {showDiagnosisResult && (
                      <small className="muted">
                        {result.diagnosis.status === "healthy"
                          ? "Bitki saglikli gorunuyor; koruyucu plana odaklan."
                          : "Belirti gorunuyor; plana gore uygulama yap."}
                      </small>
                    )}
                  </div>
                </div>
                {showDiagnosisResult && (
                  <>
                    <div className="result-badges">
                      <span className={`badge ${result.diagnosis.status || "issue"}`}>
                        {result.diagnosis.status === "healthy" ? "Saglikli" : "Riskli"}
                      </span>
                      <span className="badge subtle">
                        Problem bolgesi: {result.diagnosis.problemArea || "Belirsiz"}
                      </span>
                      {selectedPlant && result.detectedPlant && (
                        <span className={`badge ${result.plantMatch ? "safe" : "issue"}`}>
                          Bitki uyumu: {result.plantMatch ? "Uyumlu" : "Uyumsuz"}
                        </span>
                      )}
                      {result.diagnosis.confidenceTier && (
                        <span className={`badge tier ${result.diagnosis.confidenceTier}`}>
                          {result.diagnosis.confidenceTier === "high"
                            ? "Yuksek guven"
                            : result.diagnosis.confidenceTier === "medium"
                              ? "Orta guven"
                              : "Dusuk guven"}
                        </span>
                      )}
                      {result.modelMetrics?.lowConfidence && (
                        <span className="badge tier low">Belirsiz</span>
                      )}
                    </div>
                    <div className="confidence-meter">
                      <div className="confidence-track">
                        <div
                          className="confidence-fill"
                          style={{ width: `${Math.round((result.diagnosis.confidencePct ?? (result.diagnosis.confidence * 100)))}%` }}
                        />
                      </div>
                      <span>{Math.round((result.diagnosis.confidencePct ?? (result.diagnosis.confidence * 100)))}% guven</span>
                    </div>
                    <details className="accordion compact">
                      <summary>Detaylar</summary>
                      {result.modelMetrics && (
                        <div className="model-insight">
                          <div>
                            <strong>Karar gucu</strong>
                            <p>
                              Top1 {Math.round((result.modelMetrics.top1 || 0) * 100)}% • Top2{" "}
                              {Math.round((result.modelMetrics.top2 || 0) * 100)}% • Fark{" "}
                              {Math.round((result.modelMetrics.margin || 0) * 100)}%
                            </p>
                          </div>
                          <span className={result.modelMetrics.lowConfidence ? "risk" : "ok"}>
                            {result.modelMetrics.lowConfidence ? "Kararsiz" : "Net"}
                          </span>
                        </div>
                      )}
                      {result.model && (
                        <div className="model-meta">
                          <span>Model: {result.model.source?.toUpperCase() || "N/A"}</span>
                          <span>Sinif: {result.model.labels || "-"}</span>
                          <span>TTA: {result.model.tta ? "Acik" : "Kapali"}</span>
                          <span>Filtre: {result.filter?.strict ? "Sert" : "Normal"}</span>
                        </div>
                      )}
                      {result.quality && (
                        <div className="quality-score">
                          <div>
                            <strong>Goruntu kalitesi</strong>
                            <p>
                              Skor {Math.round((result.quality.score || 0) * 100)} / 100 • Isik{" "}
                              {Math.round((result.quality.brightness || 0) * 100)} • Kontrast{" "}
                              {Math.round((result.quality.contrast || 0) * 100)}
                            </p>
                          </div>
                          {result.qualityGate && <span className="risk">Dusuk kalite</span>}
                        </div>
                      )}
                      {result.plantCheck && (
                        <div className="model-insight">
                          <div>
                            <strong>Bitki dogrulama</strong>
                            <p>{result.plantCheck.reason}</p>
                          </div>
                          <span
                            className={
                              result.plantCheck.score < 0.25
                                ? "risk"
                                : result.plantCheck.score < 0.45
                                  ? "warn"
                                  : "ok"
                            }
                          >
                            {result.plantCheck.label.toUpperCase()}
                          </span>
                        </div>
                      )}
                    </details>
                  </>
                )}
                {result.detectedPlant && (
                  <div className="result-meta">
                    Tespit edilen bitki:{" "}
                    <strong>{plantNameMap.get(result.detectedPlant) || result.detectedPlant}</strong>
                  </div>
                )}
                {(result.warnings?.length ||
                  result.filter?.blocked ||
                  result.qualityGate ||
                  result.retrySuggested ||
                  analysisState) && (
                  <details
                    className="accordion compact"
                    open={
                      Boolean(
                        result.filter?.blocked ||
                          result.retrySuggested ||
                          result.qualityGate ||
                          result.modelMetrics?.lowConfidence
                      )
                    }
                  >
                    <summary>Uyarilar ve yonlendirme ({warningCount})</summary>
                    {result.warnings?.length ? (
                      <div className="alert warning">
                        <AlertCircle size={16} />
                        <div>
                          <strong>Uyari</strong>
                          <ul>
                            {result.warnings.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ) : null}
                    {result.filter?.blocked && (
                      <div className="alert info">
                        <AlertCircle size={16} />
                        <div>
                          <strong>Bitki filtresi aktif</strong>
                          <p>
                            Secilen bitkiyle eslesen sinif bulunamadi. Yeni bir fotografla
                            tekrar deneyin veya bitki secimini guncelleyin.
                          </p>
                          {result.suggestedPlant && (
                            <button
                              className="ghost"
                              onClick={() => {
                                const suggested = filteredPlantProfiles.find(
                                  (item) => item.id === result.suggestedPlant
                                );
                                if (suggested) {
                                  setSelectedPlant(suggested);
                                }
                              }}
                            >
                              Onerilen bitkiye gec:{" "}
                              {plantNameMap.get(result.suggestedPlant) || result.suggestedPlant}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    {result.qualityGate && (
                      <div className="alert warning">
                        <AlertCircle size={16} />
                        <div>
                          <strong>Fotograf kalitesi dusuk</strong>
                          <p>Isik/kontrast yetersiz. Daha net bir cekimle dene.</p>
                        </div>
                      </div>
                    )}
                    {result.retrySuggested && (
                      <div className="retry-card">
                        <div>
                          <strong>Yeniden fotograf onerisi</strong>
                          <p>Daha net sonuc icin hizli bir tekrar deneyin.</p>
                        </div>
                        <ul>
                          {result.retryTips?.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                        <button className="ghost" onClick={resetAll}>
                          Yeniden dene
                        </button>
                      </div>
                    )}
                    {analysisState && (
                      <div className={`analysis-state ${analysisState}`}>
                        <strong>
                          {analysisState === "ok"
                            ? "Analiz net"
                            : analysisState === "review"
                              ? "Analiz destek istiyor"
                              : "Bitki eslesmesi yok"}
                        </strong>
                        <p>
                          {analysisState === "ok"
                            ? "Planlari uygulamaya gecirebilirsin."
                            : analysisState === "review"
                              ? "Bir ek fotograf veya aci ile guveni artir."
                              : "Bitki secimini kontrol edip yeniden dene."}
                        </p>
                        {result.decision?.flags?.length ? (
                          <div className="analysis-flags">
                            {result.decision.flags.map((flag) => (
                              <span key={flag}>
                                {flag === "plant_filter_no_match"
                                  ? "Bitki uyusmadi"
                                  : flag === "low_quality"
                                    ? "Dusuk kalite"
                                    : flag === "low_confidence"
                                      ? "Dusuk guven"
                                      : flag === "low_margin"
                                        ? "Siniflar yakin"
                                        : flag === "non_plant_suspected"
                                          ? "Bitki degil gibi"
                                        : flag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )}
                    {analysisState && (
                      <div className="next-actions">
                        <button className="ghost" onClick={resetAll}>
                          Yeni gorsel yukle
                        </button>
                        <button
                          className="ghost"
                          onClick={() => document.querySelector(".plant-select select")?.focus()}
                        >
                          Bitkiyi degistir
                        </button>
                        <button className="ghost" onClick={() => setActiveTab("handbook")}>
                          Kilavuzda bak
                        </button>
                      </div>
                    )}
                  </details>
                )}
                {showDiagnosisResult && (result.reasons?.length || result.diagnosis?.confidenceTier) ? (
                  <details className="accordion compact result-accordion">
                    <summary>Analiz aciklamasi</summary>
                    {result.reasons?.length ? (
                      <div className="result-section">
                        <h4>Bu sonucu neden verdi?</h4>
                        <ul>
                          {result.reasons.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {result.diagnosis?.confidenceTier && (
                      <div className="result-section confidence-story">
                        <h4>Guven hikayesi</h4>
                        <p>
                          {result.diagnosis.confidenceTier === "high"
                            ? "Model belirgin desenler yakaladi. Bu nedenle guven yuksek ve aksiyon planini uygulamak icin uygun."
                            : result.diagnosis.confidenceTier === "medium"
                              ? "Goruntude benzer belirtiler var fakat sinirlar net degil. Ek bir fotografla guveni artirabilirsin."
                              : "Goruntu net degil veya sinyaller zayif. Aydinlik ve yakin planla tekrar dene."}
                        </p>
                        {result.filter?.applied && (
                          <p className="muted">
                            Bitki filtresi {result.filter.matched ? "eslesme buldu" : "eslesme bulamadi"}.
                          </p>
                        )}
                      </div>
                    )}
                  </details>
                ) : null}
                {result.diagnosis.status === "healthy" ? (
                  <div className="result-hero safe">
                    <LeafyGreen size={18} />
                    <div>
                      <strong>Koruma onerileri</strong>
                      <p>Bitki saglikli. Duzenli kontrol ve dengeyi koru.</p>
                    </div>
                  </div>
                ) : (
                  <div className="result-hero danger">
                    <ShieldAlert size={18} />
                    <div>
                      <strong>Acil yapilacaklar</strong>
                      <p>
                        Enfekte yapraklari temizle, havalandirmayi artir ve uygun
                        cozumleri hemen uygula.
                      </p>
                    </div>
                  </div>
                )}
                {urgentActions.length ? (
                  <div className="urgent-list">
                    {urgentActions.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                ) : null}
                <p className="result-summary">{result.diagnosis.summary}</p>
                <details className="accordion compact">
                  <summary>Model + kalite detaylari</summary>
                  <div className="result-section quality">
                    <h4>Gorsel kalite analizi</h4>
                    {result.quality ? (
                      <>
                        <div className="quality-grid">
                          <div>
                            <span>Kalite skoru</span>
                            <strong>{Math.round(result.quality.score * 100)}%</strong>
                          </div>
                          <div>
                            <span>Isik</span>
                            <strong>{Math.round(result.quality.brightness * 100)}%</strong>
                          </div>
                          <div>
                            <span>Kontrast</span>
                            <strong>{Math.round(result.quality.contrast * 100)}%</strong>
                          </div>
                        </div>
                        {result.quality.warnings?.length ? (
                          <ul className="quality-warnings">
                            {result.quality.warnings.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="muted">Goruntu kalitesi iyi gorunuyor.</p>
                        )}
                      </>
                    ) : (
                      <p className="muted">Goruntu kalitesi hesaplanamadi.</p>
                    )}
                  </div>
                  <div className="result-section">
                    <h4>Model bilgisi</h4>
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
                    </div>
                  </div>
                  <div className="result-section">
                    <h4>Problem bolgesi</h4>
                    <div className="area-icons">
                      <span className={`area-icon ${result.diagnosis.problemArea === "Yaprak" ? "active" : ""}`}>
                        <Leaf size={16} /> Yaprak
                      </span>
                      <span className={`area-icon ${result.diagnosis.problemArea === "Govde" ? "active" : ""}`}>
                        <Stethoscope size={16} /> Govde
                      </span>
                      <span className={`area-icon ${result.diagnosis.problemArea === "Meyve" ? "active" : ""}`}>
                        <LeafyGreen size={16} /> Meyve
                      </span>
                      <span className={`area-icon ${result.diagnosis.problemArea === "Yaprak alti" ? "active" : ""}`}>
                        <ShieldCheck size={16} /> Yaprak alti
                      </span>
                    </div>
                  </div>
                </details>
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
                <h3>{selectedPlant.name} bakim ozeti</h3>
                <div className="plant-grid">
                  <div>
                    <strong>Iklem</strong>
                    <span>{selectedPlant.climate}</span>
                  </div>
                  <div>
                    <strong>Sulama</strong>
                    <span>{selectedPlant.water}</span>
                  </div>
                  <div>
                    <strong>Toprak</strong>
                    <span>{selectedPlant.soil}</span>
                  </div>
                  <div>
                    <strong>Ipucu</strong>
                    <span>{selectedPlant.tip}</span>
                  </div>
                </div>
                <div className="plant-tip">
                  <strong>Hizli ipucu</strong>
                  <p>{selectedPlant.tip}</p>
                </div>
              </div>
            )}

            {activeTab === "faq" && (
              <div className="handbook-panel">
                <h3>Sik sorulanlar</h3>
                <div className="faq-toolbar">
                  <div className="search-input">
                    <input
                      type="text"
                      value={faqQuery}
                      onChange={(event) => setFaqQuery(event.target.value)}
                      placeholder="SSS icinde ara"
                    />
                    {faqQuery && (
                      <button
                        type="button"
                        className="clear-button"
                        onClick={() => setFaqQuery("")}
                      >
                        Temizle
                      </button>
                    )}
                  </div>
                  <div className="chip-row">
                    {[
                      { key: "all", label: "Hepsi" },
                      { key: "model", label: "Model" },
                      { key: "data", label: "Veri" },
                      { key: "ipm", label: "IPM" }
                    ].map((item) => (
                      <button
                        key={item.key}
                        className={`chip ${faqFocus === item.key ? "active" : ""}`}
                        onClick={() => setFaqFocus(item.key)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
                {faqGroups.length ? (
                  faqGroups.map((group) => (
                    <div key={group.key} className="faq-group">
                      <h4>{group.label}</h4>
                      <div className="step-grid">
                        {group.items.map((item) => (
                          <div key={item.title} className="step-card">
                            <h3>{item.title}</h3>
                            <p>{item.detail}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="muted">Sonuc bulunamadi.</p>
                )}
              </div>
            )}
            {activeTab === "stats" && (
              <div className="handbook-panel">
                <h3>Istatistik ozetleri</h3>
                <p>Model ve saha kararlarini destekleyen hizli veri notlari.</p>
                <div className="stats-highlight">
                  <strong>Hizli ozet</strong>
                  <span>PlantVillage kapsami + IPM esik mantigi + saha gercekleri</span>
                </div>
                <div className="step-grid">
                  <div className="step-card">
                    <h3>PlantVillage kapsami</h3>
                    <p>Yaklasik 54K gorsel, 38 sinif ve 14 bitki turu kapsar.</p>
                    <a
                      className="stat-link"
                      href="https://meta-album.github.io/datasets/PLT_VIL.html"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Kaynak: Meta-Album
                    </a>
                  </div>
                  <div className="step-card">
                    <h3>Kontrollu veri notu</h3>
                    <p>Gorseller kontrollu ortamdan geldigi icin sahada ek takip onemlidir.</p>
                    <a
                      className="stat-link"
                      href="https://www.innovatiana.com/en/datasets/plantvillage"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Kaynak: Innovatiana
                    </a>
                  </div>
                  <div className="step-card">
                    <h3>IPM odagi</h3>
                    <p>Izleme ve esik temelli mudahale, maliyeti ve riski azaltir.</p>
                    <a
                      className="stat-link"
                      href="https://www.epa.gov/ipm/introduction-integrated-pest-management"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Kaynak: EPA IPM
                    </a>
                  </div>
                  <div className="step-card">
                    <h3>Action threshold</h3>
                    <p>Esik, mudahale kararini belirler; riskli seviyede uygulama gerekir.</p>
                    <a
                      className="stat-link"
                      href="https://www.epa.gov/ipm/introduction-integrated-pest-management"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Kaynak: EPA
                    </a>
                  </div>
                  <div className="step-card">
                    <h3>Hastalik dagilimi</h3>
                    <p>Veri setinde mantar, bakteri, viral ve oomycete hastaliklari ile akar kaynakli bir sinif bulunur.</p>
                    <a
                      className="stat-link"
                      href="https://github.com/gabrieldgf4/PlantVillage-Dataset"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Kaynak: PlantVillage Dataset
                    </a>
                  </div>
                  <div className="step-card">
                    <h3>Hastalik turleri</h3>
                    <p>17 mantar, 4 bakteri, 2 oomycete, 2 viral ve 1 akar kaynakli hastalik turu bulunur.</p>
                    <a
                      className="stat-link"
                      href="https://github.com/gabrieldgf4/PlantVillage-Dataset"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Kaynak: PlantVillage Dataset
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>}
        </div>
      </header>

      <div className="section-divider" />

      {activeTab === "diagnosis" && (
        <section className="pro-highlights">
          <div className="steps-header">
            <h2>AgroGuard Pro</h2>
            <p>Demo icinden en guclu iki ozelligi ana akisa tasidik.</p>
          </div>
          <div className="pro-grid">
            {demoHighlights.map((item) => (
              <div key={item.title} className="pro-card">
                <div className="pro-tag">{item.tag}</div>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
                <button className="ghost" onClick={() => setShowAdvanced(true)}>
                  Demo detaylarini ac
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === "handbook" && (
        <section className="handbook-page">
          <div className="handbook-hero">
            <div>
              <h2>Tarim El Kilavuzu</h2>
              <p>
                Tarla yonetimi, sulama, besleme, hastalik onleme ve hasat
                surecleri icin sahada uygulanabilir adimlar. Arama kutusuyla
                belirti, hastalik veya uygulama basligi bulun.
              </p>
              <p className="muted">
                Not: Bu bolum sahada uygulanabilir IPM prensipleri ve hastalik siniflandirmasina gore
                duzenlenmistir.
              </p>
              <div className="handbook-stats">
                <span className="handbook-stat">
                  {handbookStats.sectionCount} bolum
                </span>
                <span className="handbook-stat">
                  {handbookStats.itemCount} madde
                </span>
                <span className="handbook-stat">
                  Arastirma guncel: {sourcesUpdatedAt || "hazirlaniyor"}
                </span>
              </div>
            </div>
            <div className="search-row">
              <div className="search-input">
                <input
                  type="text"
                  value={handbookQuery}
                  onChange={(event) => setHandbookQuery(event.target.value)}
                  placeholder="Kilavuzda ara (ornegin: sari yaprak, damla sulama)"
                />
                {handbookQuery && (
                  <button
                    type="button"
                    className="clear-button"
                    onClick={() => setHandbookQuery("")}
                  >
                    Temizle
                  </button>
                )}
              </div>
              <details className="accordion compact">
                <summary>Filtreler</summary>
                <div className="chip-row handbook-focus">
                  {[
                    { key: "all", label: "Hepsi" },
                    { key: "diagnosis", label: "Teshis & IPM" },
                    { key: "irrigation", label: "Sulama" },
                    { key: "compliance", label: "Uygunluk" },
                    { key: "greenhouse", label: "Sera" }
                  ].map((item) => (
                    <button
                      key={item.key}
                      className={`chip ${handbookFocus === item.key ? "active" : ""}`}
                      onClick={() => setHandbookFocus(item.key)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <select
                  value={handbookCategory}
                  onChange={(event) => setHandbookCategory(event.target.value)}
                >
                  <option value="all">Tum basliklar</option>
                  <option value="tarla">Tarla yonetimi</option>
                  <option value="sulama">Sulama</option>
                  <option value="kimyasal-zamanlama">Kimyasal zamanlama</option>
                  <option value="izleme-esik">Izleme / esik</option>
                  <option value="sertifikasyon-kayit">Sertifikasyon</option>
                  <option value="hastalik-siniflari">Hastalik siniflari</option>
                  <option value="belirti-sozlugu">Belirti sozlugu</option>
                  <option value="ipm-cekirdek">IPM cekirdek</option>
                  <option value="ipm-etl">IPM ETL</option>
                  <option value="kayit-sablon">Kayit sablonu</option>
                  <option value="dataset-notu">PlantVillage notu</option>
                  <option value="dataset-kaynaklari">Veri kaynaklari</option>
                  <option value="saha-uyari">Saha uyarilari</option>
                  <option value="saha-gercekleri">Saha gercekleri</option>
                </select>
                <small className="muted">
                  Ornek: kulleme, azot eksikligi, dusuk nem • {handbookStats.sectionCount} bolum /{" "}
                  {handbookStats.itemCount} madde
                </small>
              </details>
            </div>
            {researchHighlights.length ? (
              <div className="research-strip">
                <div>
                  <strong>Arastirma notlari</strong>
                  <span className="muted">
                    En guncel kaynak ozeti • {sourcesUpdatedAt || "guncelleniyor"}
                  </span>
                </div>
                <div className="research-list">
                  {researchHighlights.map((item) => (
                    <a
                      key={item.title}
                      className="research-card"
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>{item.category}</span>
                      <strong>{item.title}</strong>
                      <em>{item.summary}</em>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="handbook-grid">
            <div className="handbook-section">
              <h3>Temel saha rehberleri</h3>
              <div className="step-grid">
                {visibleHandbookSections.map((section) => (
                  <div key={section.id} className="step-card">
                    <h3>{section.title}</h3>
                    <ul>
                  {section.items.map((item) => (
                    <li key={item.title}>
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                      {item.link && (
                        <em>
                          <a href={item.link} target="_blank" rel="noreferrer">
                            Kaynak
                          </a>
                        </em>
                      )}
                    </li>
                  ))}
                    </ul>
                  </div>
                ))}
              </div>
              {filteredHandbook.length > 3 && (
                <button
                  className="ghost"
                  type="button"
                  onClick={() => setShowAllHandbook((prev) => !prev)}
                >
                  {showAllHandbook ? "Daha az goster" : "Tum bolumleri goster"}
                </button>
              )}
            </div>
            <div className="handbook-section">
              <h3>Bilgi bankasi</h3>
              <div className="step-grid">
                <div className="step-card">
                  <h3>Bitki ansiklopedisi</h3>
                  <ul>
                    {cropEncyclopedia.map((item) => (
                      <li key={item.name}>
                        <strong>{item.title || item.name}</strong>
                        <span>{item.desc || item.focus || ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Hastalik kutuphanesi</h3>
                  <ul>
                    {diseaseLibrary.map((item) => (
                      <li key={item.name}>
                        <strong>{item.title || item.name}</strong>
                        <span>{item.detail || item.signs || ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Bakim protokolleri</h3>
                  <ul>
                    {careProtocols.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail || (item.steps ? item.steps.join(" • ") : "")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Terimler sozlugu</h3>
                  <ul>
                    {glossary.map((item) => (
                      <li key={item.term}>
                        <strong>{item.term}</strong>
                        <span>{item.meaning}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
            <div className="handbook-section">
              <h3>Isletme destek paketleri</h3>
              <div className="step-grid">
                <div className="step-card">
                  <h3>Tohumdan yetistirme</h3>
                  <ul>
                    {seedStartGuide.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Sera rehberi</h3>
                  <ul>
                    {greenhouseTips.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Hasat sonrasi</h3>
                  <ul>
                    {postHarvest.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Organik uygulamalar</h3>
                  <ul>
                    {organicPractices.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
            <div className="handbook-section">
              <h3>Teknik kutuphanesi</h3>
              <div className="step-grid">
                <div className="step-card">
                  <h3>Belirti sozlugu</h3>
                  <ul>
                    {symptomDictionary
                      .filter((item) =>
                        `${item.name} ${item.causes}`.toLowerCase().includes(handbookQuery.toLowerCase())
                      )
                      .map((item) => (
                        <li key={item.name}>
                          <strong>{item.title || item.name}</strong>
                          <span>{item.causes}</span>
                        </li>
                      ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Besin eksikligi rehberi</h3>
                  <ul>
                    {nutrientGuide.map((item) => (
                      <li key={item.name}>
                        <strong>{item.title || item.name}</strong>
                        <span>{item.sign}</span>
                        <em>{item.fix}</em>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Zararli rehberi</h3>
                  <ul>
                    {pestGuide.map((item) => (
                      <li key={item.name}>
                        <strong>{item.title || item.name}</strong>
                        <span>{item.detail || item.sign || ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Sulama ipuclari</h3>
                  <ul>
                    {irrigationTips.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Toprak tipleri</h3>
                  <ul>
                    {soilTypes.map((item) => (
                      <li key={item.name}>
                        <strong>{item.title || item.name}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Ilac guvenligi</h3>
                  <ul>
                    {safetyNotes.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Rotasyon rehberi</h3>
                  <ul>
                    {rotationGuide.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Gubreleme takvimi</h3>
                  <ul>
                    {fertilizerSchedule.map((item) => (
                      <li key={item.stage}>
                        <strong>{item.stage}</strong>
                        <span>{item.detail || item.action || ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Sulama yontemleri</h3>
                  <ul>
                    {irrigationMethods.map((item) => (
                      <li key={item.name}>
                        <strong>{item.title || item.name}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Toprak testleri</h3>
                  <ul>
                    {soilTesting.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Zararli dongusu</h3>
                  <ul>
                    {pestLifecycle.map((item) => (
                      <li key={item.name}>
                        <strong>{item.title || item.name}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Sera riskleri</h3>
                  <ul>
                    {greenhouseRisks.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Hasat rehberi</h3>
                  <ul>
                    {harvestGuide.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Mevsim plani</h3>
                  <ul>
                    {seasonalPlanner.map((item) => (
                      <li key={item.month}>
                        <strong>{item.season || item.month}</strong>
                        <span>{item.focus || (item.tasks ? item.tasks.join(" • ") : "")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Hava durumu aksiyonlari</h3>
                  <ul>
                    {weatherActions.map((item) => (
                      <li key={item.condition}>
                        <strong>{item.condition}</strong>
                        <span>{item.detail || item.action || ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Hastalik onleme</h3>
                  <ul>
                    {diseasePrevention.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Yaygin hatalar</h3>
                  <ul>
                    {commonMistakes.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Depolama rehberi</h3>
                  <ul>
                    {storageGuide.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Entegre zararli yonetimi</h3>
                  <ul>
                    {ipmSteps.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Tohum saklama</h3>
                  <ul>
                    {seedSaving.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Sorun giderme</h3>
                  <ul>
                    {troubleshooting.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Kucuk ciftci kontrol listesi</h3>
                  <ul>
                    {farmerChecklists.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
          <div className="steps-header">
            <h2>Kaynaklar ve referanslar</h2>
            <p>Guvenilir kurum ve veri tabanlarindan derlenmis kaynak listesi.</p>
          </div>
          <div className="research-strip">
            <div>
              <strong>Arastirma ozeti</strong>
              <p>
                {sourceStats.total} kaynak • {sourceStats.categories} kategori •{" "}
                {sourceStats.handbookCount} kilavuz maddesi
              </p>
            </div>
            <span>
              {sourcesUpdatedAt
                ? `Guncelleme: ${new Date(sourcesUpdatedAt).toLocaleDateString("tr-TR")}`
                : "Guncelleme: -"}
            </span>
          </div>
          <details className="accordion">
            <summary>Kaynaklar ve referanslar</summary>
            <div className="source-controls">
              <input
                type="text"
                value={sourceQuery}
                onChange={(event) => setSourceQuery(event.target.value)}
                placeholder="Kaynak ara (ornegin: IPM, FAO, EPPO)"
              />
              <select
                value={sourceCategory}
                onChange={(event) => setSourceCategory(event.target.value)}
              >
                {sourceCategories.map((item) => (
                  <option key={item} value={item}>
                    {item === "all" ? "Tum kategoriler" : item}
                  </option>
                ))}
              </select>
            </div>
            <div className="source-grid">
              {filteredSources.map((item) => (
                <div key={item.title} className="source-card">
                  <div className="source-meta">
                    <strong>{item.title}</strong>
                    <span>{item.category}</span>
                  </div>
                  <p>{item.summary}</p>
                  <a href={item.url} target="_blank" rel="noreferrer">
                    Kaynagi ac
                  </a>
                </div>
              ))}
              {!filteredSources.length && !sourcesError && <p>Kaynak bulunamadi.</p>}
              {!sources.length && !sourcesError && <p>Kaynaklar yukleniyor...</p>}
              {sourcesError && <p className="muted">{sourcesError}</p>}
            </div>
          </details>

          <details className="accordion">
            <summary>Turkiye’de yaygin yetistirilen 10 bitki</summary>
            <div className="guide-grid">
              <div className="guide-column">
                <div className="guide-cards">
                  {turkeyGuidePlants.map((item) => (
                    <div key={item.name} className="guide-card">
                      <div>
                        <h4>{item.name}</h4>
                        <p>{item.summary}</p>
                      </div>
                      <a href={item.link} target="_blank" rel="noreferrer">
                        Bakim rehberi
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </details>
        </section>
      )}

      {activeTab !== "handbook" && (
        <>
          <div className="control-rail">
            <div className="rail-grid">
              <a className="rail-pill" href="#diagnosis">
                Teshis
                <span>Analiz & rapor</span>
              </a>
              <button
                className="rail-more"
                onClick={() => setShowOverflow((prev) => !prev)}
                aria-label="Diger ozellikler"
              >
                ⋯
              </button>
            </div>
            {showOverflow && (
              <div className="rail-menu">
                <div className="summary-strip">
                  {summaryCards.map((item) => (
                    <div key={item.title} className="summary-card">
                      <strong>{item.title}</strong>
                      <span>{item.value}</span>
                    </div>
                  ))}
                </div>
                <div className="rail-links">
                  {[
                    { key: "core", label: "Teshis & Ozet", icon: ShieldCheck, href: "#diagnosis" },
                    { key: "operations", label: "Saha", icon: Leaf, href: "#operations" },
                    { key: "intelligence", label: "AI", icon: Sparkles, href: "#intelligence" },
                    { key: "commerce", label: "Pazar", icon: FileImage, href: "#commerce" },
                    { key: "compliance", label: "Uygunluk", icon: Stethoscope, href: "#compliance" },
                    { key: "learning", label: "Ogrenme", icon: LeafyGreen, href: "#learning" }
                  ].map((item) => (
                    <a
                      key={item.key}
                      className="rail-link"
                      href={item.href}
                      onClick={() => setShowOverflow(false)}
                    >
                      <item.icon size={14} />
                      {item.label}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {showOverflow && (
            <div className="feature-tabs compact-tabs">
              {[
                { key: "core", label: "Teshis & Ozet", icon: ShieldCheck },
                { key: "operations", label: "Saha", icon: Leaf },
                { key: "intelligence", label: "AI", icon: Sparkles },
                { key: "commerce", label: "Pazar", icon: FileImage },
                { key: "compliance", label: "Uygunluk", icon: Stethoscope },
                { key: "learning", label: "Ogrenme", icon: LeafyGreen }
              ].map((item) => (
                <button
                  key={item.key}
                  className={featureTab === item.key ? "active" : ""}
                  onClick={() => handleFeatureTab(item.key)}
                >
                  <item.icon size={14} />
                  {item.label}
                </button>
              ))}
            </div>
          )}

          <div id="diagnosis" className="section-anchor" />
          <div id="demo" className="section-anchor" />
          <div className="advanced-toggle">
            <div className="demo-note">
              <strong>Demo / Ar-Ge alani</strong>
              <p>Gelistirme asamasindaki ozellikler burada toplanir.</p>
            </div>
            <div className="demo-actions">
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
            <button className="ghost" onClick={() => setShowAdvanced(true)}>
              Demo ozelliklerini ac
            </button>
          </div>
          {showAdvanced && (
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
          {showAdvanced && !showFullDemo && (
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

          {showFullDemo && (
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

          {showFullDemo && (
            <>
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


          {showFullDemo && (
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

          <section className="features">
            <div className="steps-header">
              <h2>Hastalik risk haritasi</h2>
              <p>Parsel bazli riskleri renklerle takip et.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
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

          <section className="features">
            <div className="steps-header">
              <h2>Parsel arsivi</h2>
              <p>Her parsel icin teshis ve uygulama gecmisi.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
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
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Ekonomi planlayici</h2>
              <p>Donum bazli verim, maliyet ve gelir hesaplari. Verim verisi mevcutsa otomatik gelir.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Urun & bolge</h3>
                <label className="plant-select">
                  <span>Urun</span>
                  <select
                    value={econCrop || selectedPlant?.id || ""}
                    onChange={(event) => setEconCrop(event.target.value)}
                  >
                    <option value="">Urun sec</option>
                    {Object.keys(cropLabelMap).map((key) => (
                      <option key={key} value={key}>{cropLabelMap[key]}</option>
                    ))}
                  </select>
                </label>
                <label className="plant-select">
                  <span>Sehir</span>
                  <input value={city} disabled />
                </label>
                <small className="muted">
                  Verim kaynagi: {econCrop && cropYieldKgDa[econCrop]?.source?.title ? cropYieldKgDa[econCrop].source.title : "Veri yok"}
                </small>
              </div>
              <div className="step-card">
                <h3>Alan & verim</h3>
                <label className="plant-select">
                  <span>Alan (donum)</span>
                  <input type="number" min="0" value={econArea} onChange={(e) => setEconArea(e.target.value)} />
                </label>
                <label className="plant-select">
                  <span>Verim (kg/da)</span>
                  <input type="number" min="0" value={econYield} onChange={(e) => setEconYield(e.target.value)} />
                </label>
                <label className="plant-select">
                  <span>Fiyat (TL/kg)</span>
                  <input type="number" min="0" value={econPrice} onChange={(e) => setEconPrice(e.target.value)} />
                </label>
                {econYieldAuto ? (
                  <small className="muted">Otomatik verim: {econYieldAuto} kg/da</small>
                ) : null}
              </div>
              <div className="step-card">
                <h3>Maliyet kalemleri (TL)</h3>
                {Object.keys(econCosts).map((key) => (
                  <label key={key} className="plant-select">
                    <span>{key}</span>
                    <input
                      type="number"
                      min="0"
                      value={econCosts[key]}
                      onChange={(e) =>
                        setEconCosts((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                    />
                  </label>
                ))}
              </div>
              <div className="step-card">
                <h3>Arsa degeri</h3>
                <label className="plant-select">
                  <span>Arsa bedeli (TL/da)</span>
                  <input type="number" min="0" value={econLandValue} onChange={(e) => setEconLandValue(e.target.value)} />
                </label>
                <div className="score-pill">Toplam arsa: {econTotals.landValue.toLocaleString("tr-TR")} TL</div>
              </div>
              <div className="step-card">
                <h3>Hesap ozet</h3>
                <p>Toplam gelir: {econTotals.revenue.toLocaleString("tr-TR")} TL</p>
                <p>Toplam maliyet: {econTotals.cost.toLocaleString("tr-TR")} TL</p>
                <div className="score-pill">Net: {econTotals.net.toLocaleString("tr-TR")} TL</div>
                <small className="muted">ROI: %{econTotals.roi}</small>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Ortalama verim (kg/da)</h2>
              <p>Il bazli veya ulusal ortalama verimler (rapor kaynakli).</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>{city}</h3>
                {(() => {
                  const key = econCrop || selectedPlant?.id || "";
                  const profile = cropYieldKgDa[key];
                  const local = profile?.provincesKgDa?.[city];
                  const national = profile?.nationalKgDa;
                  const label = cropLabelMap[key] || selectedPlant?.name || "Bitki";
                  if (!profile) {
                    return <p>Bu bitki icin verim verisi bulunamadi.</p>;
                  }
                  return (
                    <>
                      <div className="score-line">
                        <strong>{label}</strong>
                        <span>{local ? `${local} kg/da (il)` : "Il verisi yok"}</span>
                      </div>
                      <div className="score-line">
                        <span>Ulusal ortalama</span>
                        <span>{national ? `${national} kg/da` : "Yok"}</span>
                      </div>
                      {profile?.source?.title && (
                        <small className="muted">
                          Kaynak: {profile.source.title}
                        </small>
                      )}
                    </>
                  );
                })()}
              </div>
              <div className="step-card">
                <h3>Yorum ve oneriler</h3>
                <p>Verim ve fiyat artisi icin hedefli plan.</p>
                <ul>
                  <li>Verim ulusalin altindaysa sulama ve besin kalemlerini gozden gecir.</li>
                  <li>Il verisi yoksa ulusal ortalamayi hedef kabul et.</li>
                  <li>Verim artsin diye fenolojik evreye gore sulama planla.</li>
                </ul>
              </div>
            </div>
          </section>



          <section className="features">
            <div className="steps-header">
              <h2>Yedek parca ve servis</h2>
              <p>Makine ve ekipman servis gecmisi.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Son servis</h3>
                <ul>
                  <li>Pompa bakimi: 3 ay once</li>
                  <li>Nozul degisimi: 1 ay once</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Planlanan</h3>
                <ul>
                  <li>Damla hat yenileme: 2 ay sonra</li>
                  <li>Depo temizligi: 1 ay sonra</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Stokta</h3>
                <ul>
                  <li>Nozul: 12 adet</li>
                  <li>Filtre: 6 adet</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Hedef ve OKR paneli</h2>
              <p>Sezon hedefleri ve ilerleme durumlari.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Hedef: Hastalik azalimi</h3>
                <p>Hedef: -%20</p>
                <div className="score-pill">Ilerleme: %11</div>
              </div>
              <div className="step-card">
                <h3>Hedef: Verim artisi</h3>
                <p>Hedef: +%15</p>
                <div className="score-pill">Ilerleme: %8</div>
              </div>
              <div className="step-card">
                <h3>Hedef: Su tasarrufu</h3>
                <p>Hedef: -%10</p>
                <div className="score-pill">Ilerleme: %5</div>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Danisman agi</h2>
              <p>Uretici, ziraat muhendisi ve teknik destek ile hizli baglanti.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Danismanlik formu</h3>
                <p>Formu doldur, mail uygulamasi acilsin. Ek dosya mail istemcisi uzerinden eklenir.</p>
                <div className="contact-grid">
                  <input
                    type="text"
                    placeholder="Ad Soyad"
                    value={contactForm.name}
                    onChange={(event) =>
                      setContactForm((prev) => ({ ...prev, name: event.target.value }))
                    }
                  />
                  <input
                    type="email"
                    placeholder="E-posta"
                    value={contactForm.email}
                    onChange={(event) =>
                      setContactForm((prev) => ({ ...prev, email: event.target.value }))
                    }
                  />
                  <input
                    type="text"
                    placeholder="Konu (opsiyonel)"
                    value={contactForm.subject}
                    onChange={(event) =>
                      setContactForm((prev) => ({ ...prev, subject: event.target.value }))
                    }
                  />
                  <textarea
                    placeholder="Mesaj"
                    value={contactForm.message}
                    onChange={(event) =>
                      setContactForm((prev) => ({ ...prev, message: event.target.value }))
                    }
                  />
                  <button className="primary" onClick={submitContact}>Gonder</button>
                  {contactStatus && <small className="muted">{contactStatus}</small>}
                </div>
              </div>
              <div className="step-card">
                <h3>Teknik destek</h3>
                <p>Ortalama yanit: 2 saat</p>
                <button className="primary" onClick={() => openConsultMail("Teknik destek icin danismanlik talebi.")}>Danismana baglan</button>
              </div>
              <div className="step-card">
                <h3>Saha ziyareti</h3>
                <p>Planli ziyaretler ile yerinde teshis.</p>
                <button className="ghost" onClick={() => openConsultMail("Saha ziyareti icin randevu talebi.")}>Randevu al</button>
              </div>
              <div className="step-card">
                <h3>Topluluk forumu</h3>
                <p>Benzer sorunlari yasayan ureticilerle paylas.</p>
                <button className="ghost" onClick={() => openConsultMail("Topluluk forumu daveti talebi.")}>Forum</button>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Senaryo simulatörü</h2>
              <p>"Sunu ekersem ne olur?" sorusuna 3 senaryo.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Senaryo A</h3>
                <p>Domates ekimi: Yuksek gelir, orta hastalik riski.</p>
                <div className="score-pill">Tahmin: +%12</div>
              </div>
              <div className="step-card">
                <h3>Senaryo B</h3>
                <p>Biber ekimi: Orta gelir, dusuk hastalik riski.</p>
                <div className="score-pill">Tahmin: +%7</div>
              </div>
              <div className="step-card">
                <h3>Senaryo C</h3>
                <p>Marul ekimi: Hizli nakit, yuksek fiyat riski.</p>
                <div className="score-pill">Tahmin: +%3</div>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Senaryo simulatoru (interaktif)</h2>
              <p>Urun, risk ve fiyat varsayimi ile sonuc uretir.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Senaryo ayarlari</h3>
                <label className="plant-select">
                  <span>Urun</span>
                  <select value={demoScenario.crop} onChange={(e) => setDemoScenario((prev) => ({ ...prev, crop: e.target.value }))}>
                    {Object.keys(cropLabelMap).map((key) => (
                      <option key={key} value={key}>{cropLabelMap[key]}</option>
                    ))}
                  </select>
                </label>
                <label className="plant-select">
                  <span>Risk (%)</span>
                  <input type="number" min="0" max="100" value={demoScenario.risk} onChange={(e) => setDemoScenario((prev) => ({ ...prev, risk: e.target.value }))} />
                </label>
                <label className="plant-select">
                  <span>Fiyat (TL/kg)</span>
                  <input type="number" min="0" value={demoScenario.price} onChange={(e) => setDemoScenario((prev) => ({ ...prev, price: e.target.value }))} />
                </label>
                <label className="plant-select">
                  <span>Verim artisi (%)</span>
                  <input type="number" min="-30" max="30" value={demoScenario.yieldBoost} onChange={(e) => setDemoScenario((prev) => ({ ...prev, yieldBoost: e.target.value }))} />
                </label>
              </div>
              <div className="step-card">
                <h3>Sonuc</h3>
                <p>Ayarlanmis verim: {demoScenarioSummary.adjustedYield} kg/da</p>
                <p>Gelir (da): {demoScenarioSummary.revenue} TL</p>
                <div className="score-pill">Skor: {demoScenarioSummary.score}</div>
              </div>
              <div className="step-card">
                <h3>Yorum</h3>
                <p>Risk dusukse ve fiyat yuksekse senaryo daha avantajlidir.</p>
              </div>
            </div>
          </section>


          <section className="features">
            <div className="steps-header">
              <h2>Hasat kalite kontrol</h2>
              <p>Pazara cikmadan once kalite standartlari.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Siniflama</h3>
                <ul>
                  <li>Boy ve renk standardi</li>
                  <li>Hasar ayiklama</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Kalite puani</h3>
                <p>Ortalama: 86/100</p>
                <div className="score-pill">Hedef: 90/100</div>
              </div>
              <div className="step-card">
                <h3>Fire oranı</h3>
                <p>%4.2</p>
                <div className="score-pill">Hedef: %3</div>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Deprem - afet hazirlik</h2>
              <p>Acik alan ve tesis icin temel hazirlik listesi.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Acil durum plani</h3>
                <ul>
                  <li>Su ve yakit stoklari</li>
                  <li>Ilk yardim seti</li>
                  <li>Alternatif sulama planı</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Sigorta kontrolu</h3>
                <ul>
                  <li>Tarim sigortasi poliçesi</li>
                  <li>Hasar bildirim sureci</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Veri yedegi</h3>
                <ul>
                  <li>Gunluk rapor yedegi</li>
                  <li>Offline liste</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Zararlı erken uyarı</h2>
              <p>Populasyon artışı ve risk seviyeleri.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Beyaz sinek</h3>
                <div className="risk-meter mid">Orta risk</div>
                <p>Tuzak kontrolünü artır.</p>
              </div>
              <div className="step-card">
                <h3>Trips</h3>
                <div className="risk-meter high">Yüksek risk</div>
                <p>Yaprak altı kontrol ve izolasyon.</p>
              </div>
              <div className="step-card">
                <h3>Yaprak biti</h3>
                <div className="risk-meter low">Düşük risk</div>
                <p>Rutin izleme yeterli.</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Kalite ve sertifikasyon</h2>
              <p>Organik, iyi tarım ve denetim kontrol listeleri.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Iyi tarim</h3>
                <ul>
                  <li>Girdi kayıtları</li>
                  <li>Izlenebilirlik formları</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Organik</h3>
                <ul>
                  <li>Sertifikalı girdi kontrolü</li>
                  <li>Uygulama kayıtları</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Denetim</h3>
                <ul>
                  <li>Rapor ve belge arşivi</li>
                  <li>Numune kayıtları</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Ar-Ge ve deneme parselleri</h2>
              <p>Yeni çeşitler ve uygulamalar için test alanı.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Deneme 1</h3>
                <p>Yeni domates çeşidi, düşük sulama.</p>
                <div className="score-pill">Sonuç: +%5</div>
              </div>
              <div className="step-card">
                <h3>Deneme 2</h3>
                <p>Organik gübre, orta verim.</p>
                <div className="score-pill">Sonuç: +%2</div>
              </div>
              <div className="step-card">
                <h3>Deneme 3</h3>
                <p>Yeni sulama paterni, risk düşük.</p>
                <div className="score-pill">Sonuç: +%6</div>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Isletme notlari</h2>
              <p>Sezonun kritik kararları ve gözlemleri.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <textarea
                  className="note"
                  placeholder="Orn: yeni deneme, yeni pazar, yeni ekipman"
                />
              </div>
              <div className="step-card">
                <h3>Not ipuçları</h3>
                <p>Verim, maliyet, risk ve ekip notlarını düzenli gir.</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Karar kutusu</h2>
              <p>Bugun yapilacak 3 kritik karar.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Ilaclama zamani</h3>
                <p>Ruzgar 12 km/sa altinda, uygulama icin uygun.</p>
              </div>
              <div className="step-card">
                <h3>Sulama karari</h3>
                <p>Toprak nemi dusuk, aksam sulamasi onerilir.</p>
              </div>
              <div className="step-card">
                <h3>Hasat planlamasi</h3>
                <p>Pazar fiyat trendi yukseliyor, erken hasat dusun.</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Uretim saglik skoru</h2>
              <p>Toprak, hastalik ve iklim verilerinden tek skor.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Toplam skor</h3>
                <div className="score-pill">78 / 100</div>
                <p>Hedef: 85+</p>
              </div>
              <div className="step-card">
                <h3>Zayif alan</h3>
                <p>Nem dengesizligi ve mantar riski.</p>
              </div>
              <div className="step-card">
                <h3>Guçlu alan</h3>
                <p>Toprak besini iyi, bitki gelisimi stabil.</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Sezon kontrol paneli</h2>
              <p>Sezonun kritik metrikleri tek satırda.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Hedef verim</h3>
                <p>4.5 ton/da</p>
              </div>
              <div className="step-card">
                <h3>Gerceklesen</h3>
                <p>3.1 ton/da</p>
              </div>
              <div className="step-card">
                <h3>Kalan sure</h3>
                <p>42 gun</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Gozlem paneli</h2>
              <p>Bugun sahadan gelen kritik sinyaller.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Yaprak analizi</h3>
                <p>Son 24 saatte 8 yeni leke bildirimi.</p>
                <div className="score-pill">Trend: +%9</div>
              </div>
              <div className="step-card">
                <h3>Nem dengesi</h3>
                <p>3 parselde nem yuksek.</p>
                <div className="risk-meter mid">Orta risk</div>
              </div>
              <div className="step-card">
                <h3>Hizli oneri</h3>
                <p>Bu gece sulamayi azalt, sabah havalandirma ac.</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Topraktan sofraya izlenebilirlik</h2>
              <p>Parti bazli izlenebilirlik ve QR etiket kurgusu.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Parti kodu</h3>
                <p>2026-02-04 / Parsel A / Domates</p>
              </div>
              <div className="step-card">
                <h3>Etiketleme</h3>
                <p>QR ile uretim tarihi, uygulama ve tarla bilgisi.</p>
              </div>
              <div className="step-card">
                <h3>Denetim gecmisi</h3>
                <p>2 kontrol basarili, 1 dusuk risk notu.</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Dagitim ve rota planlama</h2>
              <p>Hasat sonrasi lojistik ve rota optimizasyonu.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Rota 1</h3>
                <p>Malatya Hal -> 2 saat 15 dk</p>
                <div className="score-pill">Yakıt: 14 L</div>
              </div>
              <div className="step-card">
                <h3>Rota 2</h3>
                <p>Perakende zinciri -> 3 saat 10 dk</p>
                <div className="score-pill">Yakıt: 18 L</div>
              </div>
              <div className="step-card">
                <h3>Rota 3</h3>
                <p>Yerel pazar -> 1 saat 20 dk</p>
                <div className="score-pill">Yakıt: 9 L</div>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Enerji ve maliyet optimizasyonu</h2>
              <p>Pompalar ve soguk zincir icin enerji takibi.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Elektrik kullanimi</h3>
                <p>Gunluk 120 kWh</p>
                <div className="score-pill">Hedef: 95 kWh</div>
              </div>
              <div className="step-card">
                <h3>Gunes enerji oranı</h3>
                <p>%32</p>
                <div className="score-pill">Hedef: %40</div>
              </div>
              <div className="step-card">
                <h3>Enerji tavsiyesi</h3>
                <p>Gece tarife ile sulama planla.</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>AI risk sinyalleri</h2>
              <p>Hava, toprak ve hastalik verilerini birlestiren sinyaller.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Mantar riski</h3>
                <div className="risk-meter high">Yuksek</div>
                <p>Nem + yaprak islakligi artiyor.</p>
              </div>
              <div className="step-card">
                <h3>Su stresi</h3>
                <div className="risk-meter mid">Orta</div>
                <p>Toprak nemi dalgalaniyor.</p>
              </div>
              <div className="step-card">
                <h3>Besin eksikligi</h3>
                <div className="risk-meter low">Dusuk</div>
                <p>Bitki gelisimi stabil.</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Gorsel kalite skoru</h2>
              <p>Yaprak ve meyve goruntulerinden kalite puani.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Yaprak kalitesi</h3>
                <div className="score-pill">89 / 100</div>
              </div>
              <div className="step-card">
                <h3>Meyve kalitesi</h3>
                <div className="score-pill">84 / 100</div>
              </div>
              <div className="step-card">
                <h3>Goruntu guvenirligi</h3>
                <div className="score-pill">92%</div>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Alarm paneli</h2>
              <p>Oncelik sirasina gore kritik alarmlar.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Kritik</h3>
                <ul>
                  <li>Parsel 1: Mantar riski (kirmizi)</li>
                  <li>Parsel 2: Don riski (kirmizi)</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Orta</h3>
                <ul>
                  <li>Parsel 3: Tuzluluk artiyor</li>
                  <li>Parsel 4: Nem dengesizligi</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Dusuk</h3>
                <ul>
                  <li>Parsel 5: Izleme</li>
                  <li>Parsel 6: Denge stabil</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Yapay zeka saha asistani</h2>
              <p>Gorus, teshis ve aksiyon cikarmayi tek akista birlestir.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Konusma akisi</h3>
                <ul>
                  <li>Durum sorusu ("Toprak nasil?")</li>
                  <li>Analiz ve cevap</li>
                  <li>Uygulama planina ekle</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Oneri jeneratörü</h3>
                <p>Hava + toprak + hastalik sinyalleriyle otomatik plan.</p>
                <div className="score-pill">Guven: %82</div>
              </div>
              <div className="step-card">
                <h3>Takip listesi</h3>
                <p>AI tarafindan olusturulan 5 gunluk takip akisi.</p>
                <span className="badge subtle">Takvimde ac</span>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Urun kalite standardi</h2>
              <p>Pazara cikmadan once kalite kontrol puanlari.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Boy standardi</h3>
                <p>%92 uyum</p>
              </div>
              <div className="step-card">
                <h3>Renk standardi</h3>
                <p>%88 uyum</p>
              </div>
              <div className="step-card">
                <h3>Hasar standardi</h3>
                <p>%95 uyum</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Hastalik kalkanı</h2>
              <p>Sezon boyunca koruyucu adimlari planla.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Onleyici rutin</h3>
                <ul>
                  <li>Haftalik yaprak kontrolu</li>
                  <li>Hava akis testi</li>
                  <li>Riskli alan dezenfeksiyonu</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Kimyasal plan</h3>
                <ul>
                  <li>Bakirli koruyucu (14 gun)</li>
                  <li>Donemsel fungisit</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Organik plan</h3>
                <ul>
                  <li>Neem + sabunlu su</li>
                  <li>Bitki bagisikligi guclendirici</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Tek tus mod</h2>
              <p>Tum kritik durumlari tek ekranda gosterir.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Bugun</h3>
                <ul>
                  <li>Nem: Yuksek</li>
                  <li>Don riski: Orta</li>
                  <li>Zararli baskisi: Orta</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Oncelik</h3>
                <ul>
                  <li>Havalandirma ac</li>
                  <li>Yaprak alti kontrol</li>
                  <li>Sulama saatini guncelle</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Hizli aksiyon</h3>
                <button className="primary">Aksiyonlari baslat</button>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Akilli bildirimler</h2>
              <p>Mobilde kritik degisikliklerde otomatik bildirim.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Don bildirimi</h3>
                <p>Hava 2°C altina dustugunde uyar.</p>
              </div>
              <div className="step-card">
                <h3>Hastalik alarmi</h3>
                <p>Yeni leke gorulurse hizli uyar.</p>
              </div>
              <div className="step-card">
                <h3>Su tasarruf bildirimi</h3>
                <p>Gunluk su tuketimi hedefi asarsa uyar.</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Otomatik rapor paketi</h2>
              <p>Gunluk ve haftalik raporlari otomatik olustur.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Gunluk rapor</h3>
                <p>Hava + hastalik + uygulama ozetleri.</p>
              </div>
              <div className="step-card">
                <h3>Haftalik rapor</h3>
                <p>Risk trendleri + aksiyon basarisi.</p>
              </div>
              <div className="step-card">
                <h3>Paylasim</h3>
                <p>PDF, e-posta, danisman paylasimi.</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>AI ciftlik gunlugu</h2>
              <p>Gunluk olaylari otomatik ozetleyen akilli gunluk.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Bugunun ozeti</h3>
                <p>Nem artisi +2, yeni leke bildirimi 3 adet.</p>
                <div className="score-pill">Ozet: Dengeli</div>
              </div>
              <div className="step-card">
                <h3>En kritik olay</h3>
                <p>Parsel 1'de yaprak islakligi yuksek.</p>
              </div>
              <div className="step-card">
                <h3>Not ekle</h3>
                <textarea className="note" placeholder="Bugun ne oldu?" />
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Saha gorev panosu</h2>
              <p>Yapilacaklar, devam edenler ve tamamlananlar.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Yapilacak</h3>
                <ul>
                  <li>Damla hat temizligi</li>
                  <li>Yaprak alti kontrol</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Devam eden</h3>
                <ul>
                  <li>Budama calismasi</li>
                  <li>Besin destegi</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Tamamlandi</h3>
                <ul>
                  <li>Toprak testi</li>
                  <li>Hava sensörü kalibrasyonu</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Mikro iklim sensor hub</h2>
              <p>Saha sensorlerinden gelen anlik veri paneli.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Sensor 1</h3>
                <p>Nem: %72 • Isik: 430 lux</p>
              </div>
              <div className="step-card">
                <h3>Sensor 2</h3>
                <p>Sicaklik: 19°C • Ruzgar: 9 km/sa</p>
              </div>
              <div className="step-card">
                <h3>Sensor 3</h3>
                <p>Toprak pH: 7.2 • Tuzluluk: Dusuk</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Zararli tarama haritasi</h2>
              <p>Parsel bazli zararlı yogunluk göstergesi.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Parsel A</h3>
                <div className="risk-meter mid">Orta yogunluk</div>
              </div>
              <div className="step-card">
                <h3>Parsel B</h3>
                <div className="risk-meter high">Yuksek yogunluk</div>
              </div>
              <div className="step-card">
                <h3>Parsel C</h3>
                <div className="risk-meter low">Dusuk yogunluk</div>
              </div>
            </div>
          </section>



          <div id="learning" className="section-anchor" />

                      <section className="features">
            <div className="steps-header">
              <h2>Tarim mikro dersler</h2>
              <p>5 dakikalik mini egitim modulleri.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Hastalik teshisi 101</h3>
                <p>Yaprakta 5 temel belirtiyi ayirt et.</p>
              </div>
              <div className="step-card">
                <h3>Sulama stratejisi</h3>
                <p>Hangi gun, ne kadar sulama?</p>
              </div>
              <div className="step-card">
                <h3>Toprak sagligi</h3>
                <p>pH ve organik maddeyi koruma.</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Don erken uyari</h2>
              <p>Onumuzdeki 48 saat icin olasi don senaryolari.</p>
            </div>
            <div className="step-grid">
              {frostOutlook.length ? (
                frostOutlook.map((item) => (
                  <div key={item.day} className="step-card">
                    <h3>{item.day}</h3>
                    <div className={`risk-meter ${item.level}`}>
                      {item.level === "high" ? "Yuksek risk" : item.level === "mid" ? "Orta risk" : "Dusuk risk"}
                    </div>
                    <p>Minimum {item.min}°C.</p>
                  </div>
                ))
              ) : (
                <div className="step-card">
                  <h3>Tahmin bekleniyor</h3>
                  <p>Don uyarisi icin hava verisi yukleniyor.</p>
                </div>
              )}
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Akilli aksiyon motoru</h2>
              <p>Toprak, hava, risk ve hastalik verisini birlestirir.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Otomatik skor</h3>
                <p>Nem + isik + risk + hastalik sinyali ile saha skoru.</p>
                <div className="score-pill">Saha Skoru: {fieldScore.score} / 100</div>
              </div>
              <div className="step-card">
                <h3>Onceliklendirme</h3>
                <ul>
                  {fieldScore.priorities.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="step-card">
                <h3>Kritik uyarilar</h3>
                <div className="chip-row">
                  {(weatherSummary?.riskTags || ["Veri bekleniyor"]).map((tag) => (
                    <span key={tag} className={`chip ${tag !== "Normal" ? "warning" : ""}`}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="step-card">
                <h3>Saha aksiyon listesi</h3>
                <p>Sonuclar netse gune yayilmis aksiyonlar.</p>
                {analysisState === "ok" ? (
                  <ul>
                    {(result?.carePlan || []).slice(0, 4).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p>Oncelikle teshisi netlestir. Ardindan aksiyon listesi olusur.</p>
                )}
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>AI oturum planlayici</h2>
              <p>Sesli ve goruntulu teshis icin adim adim akisi gor.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Oturum akisi</h3>
                <ul>
                  <li>Bitki secimi yap</li>
                  <li>Kamera ile leke/zarar bolgesini goster</li>
                  <li>Sesli sorunu kaydet</li>
                  <li>Otomatik rapor + ilac/uygulama planini al</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Izin ve guvenlik</h3>
                <ul>
                  <li>Kamera izni: sadece teshis icin</li>
                  <li>Mikrofon izni: soru-cevap icin</li>
                  <li>Kayit kontrolu: tek tusla silme</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Onerilen kullanim</h3>
                <ul>
                  <li>Gunes acisinda net goruntu</li>
                  <li>Yaprak alti + ustu ayri goster</li>
                  <li>2-3 dk icinde sonuc</li>
                </ul>
              </div>
            </div>
          </section>


          <section className="features">
                <div className="steps-header">
                  <h2>Yesil odakli ozellikler</h2>
                  <p>Tarla ve sera icin pratik ve guvenilir cozumler.</p>
                </div>
                <div className="step-grid">
                  {features.map((item) => (
                    <div key={item.title} className="step-card">
                      <h3>{item.title}</h3>
                      <p>{item.detail}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="features">
                <div className="steps-header">
                  <h2>Hizli aksiyonlar</h2>
                  <p>Gunluk kullanima uygun kisa ve net adimlar.</p>
                </div>
                <div className="step-grid">
                  {quickActions.map((item) => (
                    <div key={item.title} className="step-card">
                      <h3>{item.title}</h3>
                      <p>{item.detail}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="features">
                <div className="steps-header">
                  <h2>Hizli uyari karti</h2>
                  <p>Nem, isik ve hava akisini hizlica kontrol et.</p>
                </div>
                <div className="step-grid">
                  {[
                    { key: "moisture", label: "Toprak nemi" },
                    { key: "light", label: "Isik duzeyi" },
                    { key: "airflow", label: "Hava sirkulasyonu" },
                    { key: "temperature", label: "Sicaklik" },
                    { key: "humidity", label: "Ortam nemi" },
                    { key: "soilPh", label: "Toprak pH" },
                    { key: "salinity", label: "Tuzluluk" },
                    { key: "leafWetness", label: "Yaprak islakligi" },
                    { key: "pestPressure", label: "Zararli baskisi" },
                    { key: "nutrientBalance", label: "Besin dengesi" }
                  ].map((item) => (
                    <div key={item.key} className="step-card">
                      <h3>{item.label}</h3>
                      <div className="pill-row">
                        {["dusuk", "denge", "yuksek"].map((value) => (
                          <button
                            key={value}
                            className={`pill-btn ${alerts[item.key] === value ? "active" : ""}`}
                            onClick={() => setAlerts((prev) => ({ ...prev, [item.key]: value }))}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="step-card">
                    <h3>Hizli oneri</h3>
                    <p>{alertRecommendation()}</p>
                  </div>
                </div>
              </section>

              <section className="features">
                <div className="steps-header">
                  <h2>Sulama alarmi</h2>
                  <p>Hatirlatici saatini belirle, rutinini aksatma.</p>
                </div>
                <div className="step-grid">
                  <div className="step-card">
                    <label className="todo">
                      <input
                        type="checkbox"
                        checked={reminders.enabled}
                        onChange={(event) =>
                          setReminders((prev) => ({ ...prev, enabled: event.target.checked }))
                        }
                      />
                      <span>
                        <strong>Hatirlatici aktif</strong>
                        <em>Mobil uygulamada bildirim olarak gelecek.</em>
                      </span>
                    </label>
                  </div>
                  <div className="step-card">
                    <h3>Sulama saati</h3>
                    <input
                      className="time-input"
                      type="time"
                      value={reminders.wateringTime}
                      onChange={(event) =>
                        setReminders((prev) => ({ ...prev, wateringTime: event.target.value }))
                      }
                    />
                  </div>
                </div>
              </section>


            </>
          )}
          <div id="operations" className="section-anchor" />

                      <section className="features">
            <div className="steps-header">
              <h2>Tarla konumu + hava durumu</h2>
              <p>Konumu gir, hava riski ve don tahminlerini birlikte gor.</p>
            </div>
            <div className="step-grid">
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
                  <div className="city-list">
                    {[
                      "Malatya",
                      "Ankara",
                      "Istanbul",
                      "Izmir",
                      "Manisa",
                      "Sanliurfa",
                      "Konya",
                      "Bursa",
                      "Adana",
                      "Antalya",
                      "Kayseri",
                      "Eskisehir",
                      "Bolu",
                      "Biga",
                      "Eregli",
                      "Kocaeli",
                      "Van",
                      "Samsun",
                      "Gaziantep",
                      "Mersin"
                    ]
                      .filter((item) => item.toLowerCase().includes(cityQuery.toLowerCase()))
                      .map((item) => (
                        <button
                          key={item}
                          className={city === item ? "active" : ""}
                          onClick={() => {
                            setCity(item);
                            setCityQuery("");
                          }}
                        >
                          {item}
                        </button>
                      ))}
                  </div>
                </label>
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
                      {weather.frostRisk ? "Don riski var" : "Don riski yok"}
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

          <section className="features">
            <div className="steps-header">
              <h2>Toprak + iklim danismani</h2>
              <p>Bulundugun bolgeye gore toprak profili ve ekim onerileri.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Toprak profili</h3>
                {soilLoading ? (
                  <p>Toprak verisi yukleniyor...</p>
                ) : soilReport ? (
                  <>
                    <p>Tip: {soilReport.soilType}</p>
                    <p>pH: {soilReport.ph} • Organik: {soilReport.organic}</p>
                    <details className="accordion compact">
                      <summary>Detaylari ac</summary>
                      {soilReport.source === "soilgrids" ? (
                        <>
                          <p>Kil: {soilReport.clay} • Kum: {soilReport.sand} • Silt: {soilReport.silt}</p>
                          <p>Azot: {soilReport.nitrogen} • CEC: {soilReport.cec}</p>
                          <p>Hacim agirligi: {soilReport.bulkDensity}</p>
                          {soilInsights && (
                            <div className="chip-row">
                              <span className="chip">{soilInsights.phLabel}</span>
                              <span className="chip">{soilInsights.organicLabel}</span>
                            </div>
                          )}
                          <small className="muted">Kaynak: SoilGrids</small>
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
              <div className="step-card">
                <h3>Ne ekilir?</h3>
                {soilReport?.recommended?.length ? (
                  <ul>
                    {soilReport.recommended.map((item) => (
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

          {showFullDemo && (
            <>
            <section className="features">
              <div className="steps-header">
                <h2>Saha ozeti</h2>
                <p>Tarla, hava ve bitki bilgilerini tek kartta gor.</p>
              </div>
              <div className="step-grid">
                <div className="step-card">
                  <h3>Tarla bilgisi</h3>
                  <p>{fieldLocation.name || "Tarla adi girilmedi"}</p>
                  <p>{fieldLocation.coords || "Koordinat yok"}</p>
                  <p>{fieldLocation.notes || "Not yok"}</p>
                </div>
                <div className="step-card">
                  <h3>Hava durumu</h3>
                  <p>{weather?.city || city}</p>
                  <p>{weather?.temp ?? "-"}°C • {weather?.condition || "veri yok"}</p>
                  <p>Nem: {weather?.humidity ?? "-"}% • Ruzgar: {weather?.windKmh ?? "-"} km/sa</p>
                </div>
                <div className="step-card">
                  <h3>Bitki secimi</h3>
                  <p>{selectedPlant?.name || "Bitki secilmedi"}</p>
                  <p>{selectedPlant?.tip || "Bakim ipucu yok"}</p>
                </div>
                <div className="step-card">
                  <h3>Toprak kaynagi</h3>
                  <p>{soilReport?.source === "soilgrids" ? "SoilGrids (canli)" : "Yerel/Demo"}</p>
                  <p>pH: {soilReport?.ph ?? "-"}</p>
                  <p>Organik: {soilReport?.organic ?? "-"}</p>
                </div>
              </div>
            </section>

                        <section className="features">
              <div className="steps-header">
                <h2>Demo kontrol paneli</h2>
                <p>Senaryo uyarilarini ac/kapat, rapora islet.</p>
              </div>
              <div className="step-grid">
                <div className="step-card">
                  <label className="todo">
                    <input type="checkbox" checked={demoFlags.frost} onChange={() => setDemoFlags((prev) => ({ ...prev, frost: !prev.frost }))} />
                    <span>Don riski uyarisi</span>
                  </label>
                  <label className="todo">
                    <input type="checkbox" checked={demoFlags.pest} onChange={() => setDemoFlags((prev) => ({ ...prev, pest: !prev.pest }))} />
                    <span>Zararli alarmi</span>
                  </label>
                  <label className="todo">
                    <input type="checkbox" checked={demoFlags.irrigation} onChange={() => setDemoFlags((prev) => ({ ...prev, irrigation: !prev.irrigation }))} />
                    <span>Sulama kritik</span>
                  </label>
                  <label className="todo">
                    <input type="checkbox" checked={demoFlags.wind} onChange={() => setDemoFlags((prev) => ({ ...prev, wind: !prev.wind }))} />
                    <span>Ruzgar siniri</span>
                  </label>
                </div>
                <div className="step-card">
                  <h3>Ozet</h3>
                  <p>Rapor olustur dugmesine bastiginda bu uyarilar rapora eklenir.</p>
                  <div className="chip-row">
                    {demoFlags.frost && <span className="chip warning">Don</span>}
                    {demoFlags.pest && <span className="chip warning">Zararli</span>}
                    {demoFlags.irrigation && <span className="chip warning">Sulama</span>}
                    {demoFlags.wind && <span className="chip warning">Ruzgar</span>}
                    {!demoFlags.frost && !demoFlags.pest && !demoFlags.irrigation && !demoFlags.wind && (
                      <span className="chip">Uyari yok</span>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="features">
              <div className="steps-header">
                <h2>Demo KPI panosu</h2>
                <p>Gosterim amacli saha metrikleri ve karar kartlari.</p>
              </div>
              <div className="step-grid">
                {demoScorecards.map((item) => (
                  <div key={item.title} className="step-card">
                    <h3>{item.title}</h3>
                    <div className="score-pill">{item.value}</div>
                    <p>{item.detail}</p>
                  </div>
                ))}
              </div>
            </section>

                        <section className="features">
              <div className="steps-header">
                <h2>Demo hastalik simulasyonu</h2>
                <p>Yayilim senaryosuna gore aksiyon tavsiyesi.</p>
              </div>
              <div className="step-grid">
                <div className="step-card">
                  <label className="plant-select">
                    <span>Senaryo</span>
                    <select value={demoDisease} onChange={(e) => setDemoDisease(e.target.value)}>
                      {demoDiseaseScenarios.map((item) => (
                        <option key={item.id} value={item.id}>{item.label}</option>
                      ))}
                    </select>
                  </label>
                  <div className="note-block">
                    <strong>Oneri</strong>
                    <p>{demoDiseaseScenarios.find((item) => item.id === demoDisease)?.note}</p>
                  </div>
                </div>
                <div className="step-card">
                  <h3>Hizli aksiyon</h3>
                  <ul>
                    <li>Enfekte yapraklari temizle</li>
                    <li>Yaprak islakligini azalt</li>
                    <li>Koruyucu uygulama araligini kisalt</li>
                  </ul>
                </div>
              </div>
            </section>

            <section className="features">
              <div className="steps-header">
                <h2>Demo maliyet simulasyonu</h2>
                <p>Donum, fiyat ve maliyetle net kâri tahmin et.</p>
              </div>
              <div className="step-grid">
                <div className="step-card">
                  <label className="plant-select">
                    <span>Alan (da)</span>
                    <input type="number" min="1" value={demoCost.area} onChange={(e) => setDemoCost((prev) => ({ ...prev, area: e.target.value }))} />
                  </label>
                  <label className="plant-select">
                    <span>Fiyat (TL/kg)</span>
                    <input type="number" min="0" value={demoCost.price} onChange={(e) => setDemoCost((prev) => ({ ...prev, price: e.target.value }))} />
                  </label>
                  <label className="plant-select">
                    <span>Toplam maliyet (TL)</span>
                    <input type="number" min="0" value={demoCost.cost} onChange={(e) => setDemoCost((prev) => ({ ...prev, cost: e.target.value }))} />
                  </label>
                </div>
                <div className="step-card">
                  <h3>Hizli sonuc</h3>
                  <p>Varsayilan verim: {demoScenarioSummary.adjustedYield} kg/da</p>
                  <p>Toplam gelir: {Math.round((Number(demoCost.area) || 0) * demoScenarioSummary.adjustedYield * (Number(demoCost.price) || 0)).toLocaleString('tr-TR')} TL</p>
                  <div className="score-pill">Net: {Math.round(((Number(demoCost.area) || 0) * demoScenarioSummary.adjustedYield * (Number(demoCost.price) || 0)) - (Number(demoCost.cost) || 0)).toLocaleString('tr-TR')} TL</div>
                </div>
              </div>
            </section>

            <section className="features">
              <div className="steps-header">
                <h2>Demo trend panosu</h2>
                <p>Son 4 haftanin verim/performans trendi (demo).</p>
              </div>
              <div className="step-grid">
                <div className="step-card">
                  <div className="demo-chart">
                    {demoTrend.map((item) => (
                      <div key={item.label} className="demo-bar">
                        <div className="bar" style={{ height: `${item.value}%` }} />
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="step-card">
                  <h3>Yorum</h3>
                  <p>Hafta 4'te plan uyumu arttigi icin trend yukselmis gorunuyor.</p>
                  <div className="score-pill">Trend +12 puan</div>
                </div>
              </div>
            </section>

            <section className="features">
              <div className="steps-header">
                <h2>Demo A/B senaryo karsilastirma</h2>
                <p>Fiyat degisimi ile gelir etkisini karsilastir.</p>
              </div>
              <div className="step-grid">
                <div className="step-card">
                  <label className="plant-select">
                    <span>Senaryo A fiyat (TL/kg)</span>
                    <input type="number" min="0" value={demoCompare.a} onChange={(e) => setDemoCompare((prev) => ({ ...prev, a: e.target.value }))} />
                  </label>
                  <label className="plant-select">
                    <span>Senaryo B fiyat (TL/kg)</span>
                    <input type="number" min="0" value={demoCompare.b} onChange={(e) => setDemoCompare((prev) => ({ ...prev, b: e.target.value }))} />
                  </label>
                </div>
                <div className="step-card">
                  <h3>Sonuc</h3>
                  <p>A geliri: {Math.round((Number(demoCost.area) || 0) * demoScenarioSummary.adjustedYield * (Number(demoCompare.a) || 0)).toLocaleString('tr-TR')} TL</p>
                  <p>B geliri: {Math.round((Number(demoCost.area) || 0) * demoScenarioSummary.adjustedYield * (Number(demoCompare.b) || 0)).toLocaleString('tr-TR')} TL</p>
                  <div className="score-pill">Fark: {Math.round((((Number(demoCost.area) || 0) * demoScenarioSummary.adjustedYield * (Number(demoCompare.b) || 0)) - ((Number(demoCost.area) || 0) * demoScenarioSummary.adjustedYield * (Number(demoCompare.a) || 0)))).toLocaleString('tr-TR')} TL</div>
                </div>
              </div>
            </section>

            <section className="features">
              <div className="steps-header">
                <h2>Demo geri bildirim</h2>
                <p>Uygulama ve rapor kalitesini hizlica puanla.</p>
              </div>
              <div className="step-grid">
                <div className="step-card">
                  <label className="plant-select">
                    <span>Skor (1-5)</span>
                    <input type="range" min="1" max="5" value={demoFeedback.score} onChange={(e) => setDemoFeedback((prev) => ({ ...prev, score: e.target.value }))} />
                  </label>
                  <div className="score-pill">{demoFeedback.score} / 5</div>
                </div>
                <div className="step-card">
                  <h3>Kisa not</h3>
                  <textarea
                    className="note"
                    value={demoFeedback.note}
                    onChange={(e) => setDemoFeedback((prev) => ({ ...prev, note: e.target.value }))}
                    placeholder="Rapor net, ancak sulama adimlari daha detayli olabilir."
                  />
                  <div className="demo-actions">
                    <button className="ghost" onClick={() => setDemoFeedback({ score: 4, note: "" })}>Temizle</button>
                  </div>
                </div>
              </div>
            </section>

            <section className="features">
              <div className="steps-header">
                <h2>Demo paylasim ozeti</h2>
                <p>Paylasim linki yerine demo token uretilir.</p>
              </div>
              <div className="step-grid">
                <div className="step-card">
                  <h3>Token</h3>
                  <p className="muted">{buildDemoShare().slice(0, 48)}...</p>
                  <div className="demo-actions">
                    <button className="ghost" onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(buildDemoShare());
                        setDemoReportStatus("Demo token kopyalandi.");
                      } catch (err) {
                        setDemoReportStatus("Token kopyalanamadi.");
                      }
                    }}>Token kopyala</button>
                  </div>
                </div>
                <div className="step-card">
                  <h3>Ozet kart</h3>
                  <p>Bitki: {selectedPlant?.name || "Secilmedi"}</p>
                  <p>Skor: {demoFeedback.score}/5</p>
                  <p>Not: {demoFeedback.note || "-"}</p>
                </div>
              </div>
            </section>

            <section className="features">
              <div className="steps-header">
                <h2>Demo QR paylasimi</h2>
                <p>Token QR olarak gosterilir (demo).</p>
              </div>
              <div className="step-grid">
                <div className="step-card">
                  <div className="demo-qr">
                    <div className="qr-box">QR</div>
                    <p className="muted">Token: {buildDemoShare().slice(0, 16)}...</p>
                  </div>
                </div>
                <div className="step-card">
                  <h3>Kullanim</h3>
                  <p>Demo QR, saha raporu paylasimi icin kullanilir.</p>
                  <span className="badge subtle">Demo</span>
                </div>
              </div>
            </section>

            <section className="features">
              <div className="steps-header">
                <h2>Demo gecmis skorlar</h2>
                <p>Gun ici saha skor hareketi (demo).</p>
              </div>
              <div className="step-grid">
                {demoHistory.map((item) => (
                  <div key={item.time} className="step-card">
                    <h3>{item.time}</h3>
                    <div className="score-pill">{item.score}/100</div>
                    <p>Yuzey nemi ve risk etkisi.</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="features">
              <div className="steps-header">
                <h2>Demo sesli not</h2>
                <p>Saha notlarini hizli kaydet (demo).</p>
              </div>
              <div className="step-grid">
                <div className="step-card">
                  <h3>Kayit</h3>
                  <p>Mobilde tek tusla sesli not alinir.</p>
                  <div className="demo-actions">
                    <button className="ghost">Kaydi baslat (demo)</button>
                    <button className="ghost">Duraklat</button>
                  </div>
                </div>
                <div className="step-card">
                  <h3>Transkript</h3>
                  <p className="muted">"Yaprak altinda sari lekeler goruldu..."</p>
                  <span className="badge subtle">Demo</span>
                </div>
              </div>
            </section>

            <section className="features">
              <div className="steps-header">
                <h2>Demo saha checklist</h2>
                <p>Gunun kontrol listesi (demo).</p>
              </div>
              <div className="step-grid">
                <div className="step-card">
                  <label className="todo">
                    <input type="checkbox" />
                    <span>Yaprak alti kontrolu tamamlandi</span>
                  </label>
                  <label className="todo">
                    <input type="checkbox" />
                    <span>Damla hat tikaniklik kontrolu</span>
                  </label>
                  <label className="todo">
                    <input type="checkbox" />
                    <span>Koruyucu uygulama planlandi</span>
                  </label>
                </div>
                <div className="step-card">
                  <h3>Notlar</h3>
                  <p className="muted">Checklist verisi demo modda saklanir.</p>
                </div>
              </div>
            </section>

<section className="features">
              <div className="steps-header">
                <h2>Demo aksiyon takvimi</h2>
                <p>3-4 gunluk uygulama planini tek bakista gor.</p>
              </div>
              <div className="step-grid">
                {demoTimeline.map((item) => (
                  <div key={item.day} className="step-card">
                    <h3>{item.day}</h3>
                    <p>{item.task}</p>
                    <div className="progress-bar soft"><span /></div>
                  </div>
                ))}
              </div>
            </section>

<section className="features">
              <div className="steps-header">
                <h2>Demo saha raporu</h2>
                <p>Tek tusla ozet rapor (demo). Gercek rapor icin saha verisi gerekir.</p>
              </div>
              <div className="step-grid">
                <div className="step-card">
                  <h3>Rapor olustur</h3>
                  <p>Hava + toprak + teshis sinyallerini birlestirir.</p>
                  <div className="demo-actions">
                    <button className="primary" onClick={generateDemoReport}>Raporu olustur</button>
                    <button className="ghost" onClick={downloadDemoReport}>Raporu indir</button>
                    <button className="ghost" onClick={copyDemoReport}>Kopyala</button>
                  </div>
                  {demoReport && <p className="muted">{demoReport}</p>}
                  {demoReportStatus && <small className="muted">{demoReportStatus}</small>}
                </div>
                <div className="step-card">
                  <h3>Rapor paylasimi</h3>
                  <p>PDF ve link olarak paylas (demo).</p>
                  <div className="score-pill">Paylasima hazir</div>
                </div>
                <div className="step-card">
                  <h3>Risk notlari</h3>
                  <ul>
                    <li>Don riski: {weather?.frostRisk ? "Var" : "Yok"}</li>
                    <li>Ruzgar: {weather?.windKmh ?? "-"} km/sa</li>
                    <li>Toprak: {soilReport?.soilType || "-"}</li>
                  </ul>
                </div>
              </div>
            </section>
            </>
          )}

          {showFullDemo && (
            <>
          <section className="features">
            <div className="steps-header">
              <h2>Risk matrisi</h2>
              <p>Verim ve hastalik risklerini hizlica degerlendir.</p>
            </div>
            <div className="step-grid">
              {riskMatrix.map((item) => (
                <div key={item.label} className="step-card">
                  <h3>{item.label}</h3>
                  <p>Etki: {item.impact}</p>
                  <p>Onlem: {item.action}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Hastalik gozlem programi</h2>
              <p>Haftalik saha kontrol rutini.</p>
            </div>
            <div className="step-grid">
              {diseaseScouting.map((item) => (
                <div key={item.day} className="step-card">
                  <h3>{item.day}</h3>
                  <p>{item.task}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Ekipman kontrol listesi</h2>
              <p>Sezon boyunca temel ekipmanlarini hazir tut.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <ul>
                  {supplyChecklist.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Verim takip ozeti</h2>
              <p>Hedef verim ve notlari izlemek icin hizli tablo.</p>
            </div>
            <div className="step-grid">
              {yieldTracker.map((item) => (
                <div key={item.crop} className="step-card">
                  <h3>{item.crop}</h3>
                  <p>Hedef: {item.target}</p>
                  <p>{item.note}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Maliyet planlayici</h2>
              <p>Sezon giderlerini kontrol altinda tut.</p>
            </div>
            <div className="step-grid">
              {costPlanner.map((item) => (
                <div key={item.item} className="step-card">
                  <h3>{item.item}</h3>
                  <p>{item.note}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Pazarlama ipuclari</h2>
              <p>Kucuk uretici icin pratik satis onerileri.</p>
            </div>
            <div className="step-grid">
              {marketingTips.map((item) => (
                <div key={item.title} className="step-card">
                  <h3>{item.title}</h3>
                  <p>{item.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Sulama hat kontrolu</h2>
              <p>Basit kontrollerle su kaybini azalt.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <ul>
                  {irrigationChecklist.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Baslangic kontrol listesi</h2>
              <p>Tarla ve sera icin temel kontrol noktalar.</p>
            </div>
            <div className="step-grid">
              {starterChecklist.map((item) => (
                <div key={item.title} className="step-card">
                  <label className="todo">
                    <input
                      type="checkbox"
                      checked={!!todos[item.title]}
                      onChange={(event) =>
                        setTodos((prev) => ({ ...prev, [item.title]: event.target.checked }))
                      }
                    />
                    <span>
                      <strong>{item.title}</strong>
                      <em>{item.detail}</em>
                    </span>
                  </label>
                </div>
              ))}
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Bahce notlari</h2>
              <p>Kisa notlar, sulama araliklari ve gozlemler.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <textarea
                  className="note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Bugun ne yaptin? (ornegin: sabah sulama, yaprak kontrolu)"
                />
              </div>
              <div className="step-card">
                <h3>Not ipuclari</h3>
                <p>Toprak nemi, yeni leke, hasat tarihi, ilac uygulama gibi detaylar.</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Haftalik rutin</h2>
              <p>Tekrarlanan isleri ekle, bitirince isaretle.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <div className="routine-input">
                  <input
                    type="text"
                    value={routineInput}
                    onChange={(event) => setRoutineInput(event.target.value)}
                    placeholder="Orn: Pazartesi sulama"
                  />
                  <button
                    className="primary"
                    onClick={() => {
                      if (!routineInput.trim()) return;
                      setRoutine((prev) => [
                        ...prev,
                        { id: `${Date.now()}-${prev.length}`, text: routineInput, done: false }
                      ]);
                      setRoutineInput("");
                    }}
                  >
                    Ekle
                  </button>
                </div>
              </div>
              <div className="step-card">
                {routine.length ? (
                  routine.map((item) => (
                    <label key={item.id} className="todo">
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={(event) =>
                          setRoutine((prev) =>
                            prev.map((entry) =>
                              entry.id === item.id ? { ...entry, done: event.target.checked } : entry
                            )
                          )
                        }
                      />
                      <span>
                        <strong>{item.text}</strong>
                        <em>{item.done ? "Tamamlandi" : "Bekliyor"}</em>
                      </span>
                    </label>
                  ))
                ) : (
                  <>
                    <p>Henuz rutin eklenmedi. Asagidaki oneri butonlariyla ekleyebilirsin.</p>
                    <div className="routine-suggestions">
                      {[
                        "Pazartesi sulama",
                        "Carsamba zararlı kontrolu",
                        "Cuma budama + hijyen"
                      ].map((text) => (
                        <button
                          key={text}
                          onClick={() =>
                            setRoutine((prev) => [
                              ...prev,
                              { id: `${Date.now()}-${prev.length}`, text, done: false }
                            ])
                          }
                        >
                          {text}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
            </>
          )}
      )}

      {showQualityGate && (
        <div className="quality-overlay">
          <div className="quality-modal">
            <h3>Fotograf kalite kontrol</h3>
            <p>
              Daha dogru teshis icin gorselin net olmasi gerekiyor. Asagidaki
              onerileri uygularsan guven artar.
            </p>
            <ul>
              <li>Yapraga yakinlas, net odakla.</li>
              <li>Isigi dengeli yap, patlamayi onle.</li>
              <li>Arka plan sade olsun.</li>
              <li>Birden fazla aci dene.</li>
            </ul>
            <div className="quality-actions">
              <button className="ghost" onClick={() => setShowQualityGate(false)}>
                Simdi degil
              </button>
              <button
                className="primary"
                onClick={() => {
                  setShowQualityGate(false);
                  resetAll();
                }}
              >
                Yeniden fotograf cek
              </button>
            </div>
            <div className="quality-examples">
              <h4>Ornek dogru cekim</h4>
              <div className="quality-example-grid">
                <div className="quality-example-card">
                  <div className="example-thumb closeup" />
                  <strong>Yakin plan</strong>
                  <p>Belirti olan yapragi kadraja al.</p>
                </div>
                <div className="quality-example-card">
                  <div className="example-thumb light" />
                  <strong>Dengeli isik</strong>
                  <p>Gunes altinda patlama yapma.</p>
                </div>
                <div className="quality-example-card">
                  <div className="example-thumb clean" />
                  <strong>Temiz arka plan</strong>
                  <p>Arka plani sade tut.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {showQuickModal && (
        <div className="quality-overlay">
          <div className="quality-modal">
            {showQuickModal === "plan" && (
              <>
                <h3>Bakim planini kaydet</h3>
                <p>Bu plani notlara eklemek ister misin?</p>
                <button
                  className="primary"
                  onClick={() => {
                    setNote((prev) => `${prev ? prev + "\\n" : ""}${result?.carePlan?.join(", ") || ""}`);
                    setShowQuickModal(null);
                  }}
                >
                  Notlara ekle
                </button>
              </>
            )}
            {showQuickModal === "treatment" && (
              <>
                <h3>Ilac listesi</h3>
                <ul>
                  {(result?.treatments?.organic || []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                  {(result?.treatments?.chemical || []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <button className="ghost" onClick={() => setShowQuickModal(null)}>
                  Kapat
                </button>
              </>
            )}
            {showQuickModal === "alert" && (
              <>
                <h3>Acil aksiyon</h3>
                <p>Ilk 2 adimi simdi uygulayalim:</p>
                <ul>
                  {(result?.carePlan || []).slice(0, 2).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <button className="primary" onClick={() => setShowQuickModal(null)}>
                  Tamam
                </button>
              </>
            )}
          </div>
        </div>
      )}

          {showFullDemo && (
            <>
              <section className="features">
                <div className="steps-header">
                  <h2>Foto arsivi</h2>
                  <p>Son analizlerde yuklenen gorsellerin kisa galerisi.</p>
                </div>
                <div className="photo-grid">
                  {history.length ? (
                    history.map((item) => (
                      <div key={item.id} className="photo-card">
                        {item.preview ? <img src={item.preview} alt={item.name} /> : <div className="photo-placeholder" />}
                        <div>
                          <strong>{item.name || "Bilinmeyen"}</strong>
                          <span>%{Math.round((item.confidence || 0) * 100)}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="step-card">
                      <h3>Foto arsivi bos</h3>
                      <p>Ilk analizi yapinca burada listelenir.</p>
                    </div>
                  )}
                </div>
              </section>

              <section className="features">
                <div className="steps-header">
                  <h2>Son analizler</h2>
                  <p>En son yuklenen gorsellerden hizli bir ozet.</p>
                </div>
                <div className="step-grid">
                  {history.length ? (
                    history.map((item) => (
                      <div key={item.id} className="step-card">
                        <h3>{item.name || "Bilinmeyen"}</h3>
                        <p>Guven: %{Math.round((item.confidence || 0) * 100)}</p>
                        <p>{item.time}</p>
                      </div>
                    ))
                  ) : (
                    <div className="step-card">
                      <h3>Henuz analiz yok</h3>
                      <p>Ilk gorseli yukleyip analiz baslat.</p>
                    </div>
                  )}
                </div>
              </section>
            </>
          )}

        </>
      )}


      <section className="developer">
        <div className="developer-card">
          <div>
            <h2>Gelistirici</h2>
            <p>
              Mehmet Yasin Kaya • Bogazici Bilgisayar
            </p>
          </div>
          <div className="developer-links">
            <span>E-posta: gs7016903@gmail.com</span>
          </div>
        </div>
      </section>
    </div>
  );
}

export default App;
