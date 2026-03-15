export const handbookSections = [
  {
    id: "tarla",
    title: "Tarla Yönetimi Rehberi",
    items: [
      {
        title: "Ekim plani",
        detail:
          "Parsel bazli ekim desenini, sulama hatlarini ve servis yollarini sezon basinda netlestir; boylece is gucu ve girdi planlamasi tutarli olur."
      },
      {
        title: "Günlük kontrol",
        detail:
          "Sabah erken saatlerde yaprak, toprak ve zararli kontrolu yap; sıcaklik artmadan once belirtiler daha net gorunur."
      },
      {
        title: "Budama ve hijyen",
        detail:
          "Hasarli yapraklari temizle, aletleri her kullanimdan sonra dezenfekte et; hastalik tasinmasi azalir."
      }
    ]
  },
  {
    id: "sulama",
    title: "Sulama Hatlari Kontrolu",
    items: [
      {
        title: "Hat tikanikligi",
        detail:
          "Filtreleri ve hat uclarini kontrol et; tikaniklik varsa temizle ki basinc kaybi olusmasin."
      },
      {
        title: "Basinc dengesi",
        detail:
          "Hat boyunca basinc dengesini kontrol et; düşük noktalari iyılestir."
      },
      {
        title: "Damla ucu testi",
        detail:
          "Rastgele secimle damla ucu debisini olc; dagitim uniform mu bak."
      }
    ]
  },
  {
    id: "kimyasal-zamanlama",
    title: "Kimyasal Uygulama Zamanlamasi",
    items: [
      {
        title: "PHI ve REI",
        detail:
          "PHI (hasat oncesi bekleme) ve REI (giriş kisitlama) etiket talimatinda belirtilir; uygulamada onceliklidir.",
        link: "https://www.epa.gov/pesticide-worker-safety/restrictions-protect-workers-after-pesticide-applications"
      },
      {
        title: "Etiket standardi",
        detail:
          "Doz ve zaman için tek doğru kaynak etikettir; başka tavsiyelerle karıştırma.",
        link: "https://www.epa.gov/pesticide-worker-safety"
      },
      {
        title: "Direnc yönetimi",
        detail:
          "Aynı etki mekanizmasini arka arkaya kullanma; sezon boyunca MoA rotasyonu uygula.",
        link: "https://www.fao.org/pest-and-pesticide-management/ipm/integrated-pest-management/en/"
      }
    ]
  },
  {
    id: "izleme-esik",
    title: "Saha Izleme ve Esik Örnekleri",
    items: [
      {
        title: "ETL prensibi",
        detail:
          "Ekonomik esik (ETL) gecilmedikce kimyasal uygulamayi ertele; maliyet/zarar dengesi esas.",
        link: "https://www.fao.org/4/Y4611E/y4611e0a.htm"
      },
      {
        title: "Haftalik tarama",
        detail:
          "Aynı parcellerde haftalik tarama yap ve gözlem notlarini karşılaştır."
      },
      {
        title: "Tuzak + gözlem",
        detail:
          "Zararli tuzaklariyla yaprak gözlemini birlikte kullan; karar kalitesi artar."
      }
    ]
  },
  {
    id: "sertifikasyon-kayit",
    title: "Sertifikasyon ve Kayıt Sistemi",
    items: [
      {
        title: "Zorunlu kayit alanlari",
        detail:
          "Bitki koruma uygulamalari, sulama, gübreleme ve hasat kayitlari standard formda tutulur.",
        link: "https://pp1.eppo.int/"
      },
      {
        title: "Kayıt suresi",
        detail:
          "Saha kayitlari belirli programlara göre en az iki yıl saklanir."
      },
      {
        title: "Uygulama formati",
        detail:
          "Tarih, urun, doz, hava kosulu, operator ve notlar standard tabloda tutulur."
      }
    ]
  },
  {
    id: "saha-uyari",
    title: "Saha Uyari Listesi",
    items: [
      {
        title: "Yaprak islakligi",
        detail:
          "Uzun sureli islaklik mantar ve mildiyo riskini arttirir; sulamayi sabaha cekmek koruyucudur."
      },
      {
        title: "Rüzgar ve yağış",
        detail:
          "Rüzgarli hava uygulama kalitesini dusurur; yağış oncesi uygulama etkinligi azalir."
      }
    ]
  },
  {
    id: "ipm-cekirdek",
    title: "IPM Cekirdek Prensipleri",
    items: [
      {
        title: "Onleme",
        detail:
          "Dirençli çeşit, hijyen, rotasyon ve toprak sağlığı riskleri azaltir."
      },
      {
        title: "Izleme",
        detail:
          "Gozlem, tuzak ve meteoroloji verisini bir arada kullan."
      },
      {
        title: "Hedefli mudahale",
        detail:
          "Gerektiginde hedefli uygulama yap; genis spektrumlu uygulamayi azalt."
      }
    ]
  },
  {
    id: "ipm-etl",
    title: "IPM Ekonomik Esik (ETL)",
    items: [
      {
        title: "ETL nedir?",
        detail:
          "ETL, mudahale maliyeti ile verim kaybi esitlendiginde olusan esiktir; karar ekonomik analize dayanir.",
        link: "https://www.fao.org/agriculture/crops/thematic-sitemap/theme/spi/scpi-home/managing-ecosystems/integrated-pest-management/ipm-how/en/"
      },
      {
        title: "Nasil kullanilir?",
        detail:
          "Kontrol maliyeti, urun degeri ve zarar katsayisi birlikte degerlendirilir; esik asilmadan uygulama yapilmaz.",
        link: "https://www.fao.org/agriculture/crops/thematic-sitemap/theme/spi/scpi-home/managing-ecosystems/integrated-pest-management/ipm-how/en/"
      }
    ]
  },
  {
    id: "hastalik-siniflari",
    title: "Hastalik Siniflari",
    items: [
      { title: "Mantar", detail: "Lekeler, küf, mildiyö; nem ve sık dikimle artar." },
      { title: "Bakteriyel", detail: "Su toplamaya yakın lekeler, hızlı yayılım." },
      { title: "Viral", detail: "Mozaik desen, kuculme ve kivrilma." }
    ]
  },
  {
    id: "belirti-sozlugu",
    title: "Belirti Sozlugu",
    items: [
      { title: "Kloroz", detail: "Yapraklar arasi sararma; besin veya stres kaynakli olabilir." },
      { title: "Nekroz", detail: "Kahverengi, olu doku; mantar veya besin eksikligi." },
      { title: "Mozaik", detail: "Duzenli/duzensiz desen; viral etken dusun." }
    ]
  },
  {
    id: "kayit-sablon",
    title: "Kayıt Sablonu",
    items: [
      { title: "Parsel", detail: "Parsel kodu, uretim alanı, ekim tarihi" },
      { title: "Uygulama", detail: "Urun adi, doz, hedef, operatör, hava kosulu" },
      { title: "Sonuc", detail: "Etki, tekrar gerekliligi, notlar" }
    ]
  },
  {
    id: "dataset-notu",
    title: "PlantVillage Notu",
    items: [
      {
        title: "Kapsam",
        detail:
          "PlantVillage yaprak bazlı sınıflara odaklanır; saha koşullarında ek görsel kalite kontrol gerekir."
      },
      {
        title: "Domain farki",
        detail:
          "Saha goruntuleri daha gurbuzdur; modelde domain farki riskini dusurmek icin yeni veri toplanir."
      }
    ]
  },
  {
    id: "dataset-kaynaklari",
    title: "Kaynaklar",
    items: [
      { title: "PlantVillage", detail: "Kamu açık veri seti", link: "https://github.com/spMohanty/PlantVillage-Dataset" },
      { title: "FAO IPM", detail: "IPM prensipleri ve uyarilar", link: "https://www.fao.org/" },
      { title: "EPPO", detail: "Bitki koruma standardlari", link: "https://www.eppo.int/" }
    ]
  },
  {
    id: "saha-gercekleri",
    title: "Saha Gercekleri",
    items: [
      { title: "Isik", detail: "Asiri gunes gunlerinde yaprakta yanik gorulebilir." },
      { title: "Nem", detail: "Yüksek nem mantar riskini hizla arttirir." },
      { title: "Rüzgar", detail: "Uygulama sapmasina neden olur; hedefli ilaçlama önemli." }
    ]
  }
];

export const careProtocols = [
  { title: "Erken belirti taramasi", detail: "Haftada en az 2 kez hedefli tarama." },
  { title: "Hijyen protokolu", detail: "Alet temizligi ve aralar arasi hijyen." },
  { title: "Izleme kaydi", detail: "Gozlem ve uygulama kaydini tek formatta tut." }
];

export const cropEncyclopedia = [
  { name: "Domates", desc: "Sıcak, nemli ortamda mantar riski yüksek. Yaprak alti gözlem ve duzenli havalandirma kritik." },
  { name: "Biber", desc: "Bakteriyel lekeler, trips ve solgünlük etkenleri izlenmeli. Sulama dalgalanmasi meyve kalitesini dusurur." },
  { name: "Patates", desc: "Mildiyo ve erken yanik icin serin-nemli donemlerde tarama siklastirilir." },
  { name: "Salatalik", desc: "Kulleme ve mildiyo riski yüksek. Yaprak islaklik suresini kisaltmak gerekir." },
  { name: "Patlican", desc: "Kirmizi orumcek ve beyazsinek baskisi sıcak donemde artar." },
  { name: "Sogan", desc: "Trips ve yaprak yaniklari gorulebilir; duzenli tarla hijyeni gerekir." },
  { name: "Sarmisak", desc: "Kok bölgesinde asiri nem fungal riski arttirir; drenaj onceliklidir." },
  { name: "Marul", desc: "Yüksek sıcaklikta sap kalkmasi, nemde yaprak hastaliklari artar." },
  { name: "Lahana", desc: "Larva zararlıları ve bakteriyel yumuşak çürüklük için yakın takip gerekir." },
  { name: "Bugday", desc: "Pas hastaliklari ve septorya icin erken sezon takibi verim kaybini azaltir." },
  { name: "Arpa", desc: "Yaprak leke hastaliklari ve yatma riski icin azot ve sulama dengesi önemlidir." },
  { name: "Misir", desc: "Koçan doldurma doneminde su stresi verimi dogrudan dusurur." },
  { name: "Nohut", desc: "Antraknoz ve kök bogazi curuklugu icin rotasyon ve sertifikali tohum önemli." },
  { name: "Mercimek", desc: "Yabanci ot baskisi erken donemde kontrol edilmezse verim hizla duser." },
  { name: "Ayçiçeği", desc: "Mildiyo ve canavar otu riskine karşı parsel geçmişi izlenmelidir." },
  { name: "Uzum", desc: "Mildiyo, kulleme ve salkim curuklugu icin fenolojik takvimle mudahale gerekir." },
  { name: "Elma", desc: "Karalekeye karşı tomurcuk döneminden itibaren koruyucu program izlenir." },
  { name: "Kayisi", desc: "Monilya ve dal yaniklari icin budama hijyeni ve yara yeri korumasi gerekir." },
  { name: "Kiraz", desc: "Meyve catlamasi ve monilya riskinde sulama ritmi ile taç havalanmasi kritik." },
  { name: "Cilek", desc: "Yüksek nemde botrytis riski artar; malc ve hava akisi kaliteyi korur." }
];

export const diseaseLibrary = [
  { name: "Erken yanik", detail: "Koyu lekeler ve halka desenleri. Alt yapraklardan baslar, stresle hizlanir." },
  { name: "Gec yanik", detail: "Hizli yayılan koyu leke, serin-nemli kosullar. Kisa surede parseli etkileyebilir." },
  { name: "Bakteriyel leke", detail: "Su toplama benzeri kucuk leke, ileride nekroza doner." },
  { name: "Kulleme", detail: "Yaprakta beyaz pudramsi tabaka. Sıcak-günlük dalgali iklimde yayılim hizlanir." },
  { name: "Mildiyo", detail: "Yaprak altinda grimsi tabaka, ustte sararma. Uzun sureli yaprak islakliginda artar." },
  { name: "Antraknoz", detail: "Çokuk koyu lekeler ve doku bozulmasi. Sıcak-nemli donemde siddetlenir." },
  { name: "Fusarium solgunlugu", detail: "Iletim demetlerinde kararma ve tek tarafli solma. Toprak kökenli etken." },
  { name: "Verticillium solgunlugu", detail: "Gun ici solma, serin saatlerde toparlama. Vaskuler iletim bozuklugu." },
  { name: "Monilya", detail: "Çiçek, dal ve meyvede çürüklük. Özellikle çekirdekli meyvelerde kritik." },
  { name: "Karaleke", detail: "Elma yaprak ve meyvede siyahimsi lekeler; kalite kaybi olusturur." },
  { name: "Pas hastaliklari", detail: "Yaprakta pas rengi pustuller; bugday ve arpada verimi azaltir." },
  { name: "Yumuşak çürüklük", detail: "Meyvede hızlı doku yumuşaması ve kökü; depolamada yayılabilir." }
];

export const glossary = [
  { term: "PHI", meaning: "Hasat oncesi bekleme suresi." },
  { term: "REI", meaning: "Uygulama sonrasi giriş kisitlama suresi." },
  { term: "ETL", meaning: "Ekonomik zarar esigi." },
  { term: "IPM", meaning: "Entegre zararli yönetimi; onleme, izleme, esik ve hedefli mudahale yaklasimi." },
  { term: "MoA", meaning: "Etki mekanizmasi sinifi; direnç yönetiminde rotasyon icin kullanilir." },
  { term: "NDVI", meaning: "Bitki yesillik/vigor endeksi; uydu takibinde kullanilir." },
  { term: "CEC", meaning: "Katyon degisim kapasitesi; topragin besin tutma potansiyelini ifade eder." },
  { term: "EC", meaning: "Elektriksel iletkenlik; tuzluluk duzeyi hakkinda bilgi verir." },
  { term: "Brix", meaning: "Suda cozulmus madde olcumu; meyve olgunlugu/kalite gostergesi." },
  { term: "Fenoloji", meaning: "Bitkinin gelişim evreleri (çıkış, çiçek, meyve vb.) takvimi." }
];

export const greenhouseRisks = [
  { title: "Yüksek nem", detail: "Mantar ve bakteriyel risk artar." },
  { title: "Yetersiz havalandirma", detail: "Hastalik baskisi yukselir." },
  { title: "Gece-gunduz sıcaklik farki", detail: "Kondens ve yaprak islakligi suresi uzar." },
  { title: "Asiri azot", detail: "Yumusak doku olusur, hastalik ve zararli baskisi artabilir." },
  { title: "Duzensiz sulama", detail: "Meyve catlamasi, kalite dususu ve kök stresi olusturur." }
];

export const greenhouseTips = [
  { title: "Havalandirma", detail: "Gunde iki kez sirkulasyon kontrolu." },
  { title: "Nem takibi", detail: "Sabah ve aksam nem/kondens kontrolu." },
  { title: "Hijyen zonu", detail: "Sera girişinde ayak banyosu ve ekipman dezenfeksiyonu uygula." },
  { title: "Yaprak seyreltme", detail: "Hava akisini arttirmak icin alt yaprak temizligini planli yap." },
  { title: "Mikroiklim sensoru", detail: "Sera icinde farkli noktalarda nem-sıcaklik farkini izle." }
];

export const irrigationTips = [
  { title: "Sabah sulama", detail: "Yaprak ıslaklığı hızlı kurur." },
  { title: "Damla sulama", detail: "Hastalik riskini azaltir." },
  { title: "Kademeli sulama", detail: "Tek seferde yüksek su yerine bolunmus periyotlar stresi azaltir." },
  { title: "Toprak nem takibi", detail: "Nem sensori veya tensiyometreyle karar ver, takvimle sinirli kalma." },
  { title: "Tuz birikimi kontrolu", detail: "Periyodik yikama sulamasi ve EC takibi ile kök bölgesini koru." }
];

export const irrigationMethods = [
  { title: "Damla", detail: "Verimli ve hedefli sulama." },
  { title: "Yagmur", detail: "Yaprak islakligini artirir; riskli olabilir." },
  { title: "Mini spring", detail: "Orta ölçekli alanlarda homojen dağılım sağlar." },
  { title: "Salma", detail: "Su kaybı yüksek olabilir; eğim ve toprak yapısına bağlı risk taşır." },
  { title: "Mikro damla", detail: "Fide/duyarlik yüksek donemlerde hassas uygulama sunar." }
];

export const seasonalPlanner = [
  { season: "İlkbahar", focus: "Fide, toprak hazirligi, erken gözlem" },
  { season: "Yaz", focus: "Sulama ritmi, hastalik baskisi" },
  { season: "Sonbahar", focus: "Hasat ve depolama" }
];

export const nutrientGuide = [
  { name: "Azot (N)", sign: "Soluk yesil yapraklar", fix: "Dengeli gübreleme" },
  { name: "Fosfor (P)", sign: "Morumsu yapraklar", fix: "Fosfor takviyesi" },
  { name: "Potasyum (K)", sign: "Yaprak kenar yanigi", fix: "Potasyum destegi" },
  { name: "Demir", sign: "Damar arasi kloroz", fix: "Demir kelati" }
];

export const organicPractices = [
  { title: "Kompost", detail: "Toprak biyolojisini destekler." },
  { title: "Malc", detail: "Nemi tutar ve ot baskilar." },
  { title: "Yesil gübre", detail: "Topraga organik madde ve biyolojik aktivite kazandirir." },
  { title: "Biyolojik preparat", detail: "Yararlı mikroorganizma destegiyle kök bölgesi direncini arttirir." }
];

export const postHarvest = [
  { title: "Hizli sogutma", detail: "Raf omru uzar." },
  { title: "Hasarli ayiklama", detail: "Curume yayılimini azaltir." },
  { title: "Parti kodlama", detail: "Urun izlenebilirligi ve geri cagirmanin yönetimi kolaylasir." },
  { title: "Hijyenli paketleme", detail: "Mikrobiyal yuk ve mekanik hasar riski duser." }
];

export const fertilizerSchedule = [
  { stage: "Fide", detail: "Düşük doz dengeli gübre" },
  { stage: "Cicek", detail: "Potasyum agirlikli" },
  { stage: "Meyve", detail: "Dengeli besin" }
];

export const harvestGuide = [
  { title: "Olgünlük", detail: "Renk ve sertlik kontrolu" },
  { title: "Hasat hijyeni", detail: "Temiz kasalar, hızlı taşıma" },
  { title: "Serin saat hasadi", detail: "Sabah hasadiyla su kaybi ve solma azaltilir." },
  { title: "Alet bakimi", detail: "Kesici aletlerin temiz ve keskin olmasi doku zararini azaltir." }
];

export const ipmSteps = [
  { step: "Onleme", detail: "Dirençli çeşit + hijyen" },
  { step: "Izleme", detail: "Tuzak + saha gözlemi" },
  { step: "Esik analizi", detail: "Ekonomik zarar esigi altinda kimyasal uygulamayi ertele" },
  { step: "Mudale", detail: "Esik asildiysa hedefli uygulama" },
  { step: "Degerlendirme", detail: "Uygulama sonrasi etkiyi kayit altina alip programi güncelle" }
];

export const weatherActions = [
  { condition: "Yağış oncesi", action: "Uygulamayi ertele" },
  { condition: "Rüzgar 30+ km/s", action: "Puskurtmeyi durdur" },
  { condition: "Don riski (0C alti)", action: "Gece sulama/ortuleme ve hassas fidede koruma planini aktive et" },
  { condition: "Asiri sıcak (35C+)", action: "Gun ortasi uygulamadan kacin, su stresi yönetimini artir" },
  { condition: "Uzun nemli periyot", action: "Mantar risk taramasini siklastir, yaprak islaklik suresini azalt" }
];

export const diseasePrevention = [
  { title: "Alan hijyeni", detail: "Hastalikli yapraklari imha et" },
  { title: "Hava akisi", detail: "Bitki arasi mesafe" },
  { title: "Tohum/fide sağlığı", detail: "Sertifikali materyal kullan ve girişte kontrol yap" },
  { title: "Sulama zamani", detail: "Aksam sulamasini sinirla, sabah erken periyotlari tercih et" },
  { title: "Alet dezenfeksiyonu", detail: "Budama ve hasat aletlerini parseller arasi temizle" }
];

export const commonMistakes = [
  { title: "Asiri sulama", detail: "Kok curuklugunu tetikler" },
  { title: "Yanlis doz", detail: "Direnc riskini arttirir" },
  { title: "Aynı etki mekanizmasi", detail: "Art arda ayni MoA kullanimi direnç gelisimini hizlandirir" },
  { title: "Gec teşhis", detail: "Belirtiyi gec fark etmek alan bazli yayılimi arttirir" }
];

export const seedSaving = [
  { title: "Secim", detail: "Saglikli bitkilerden tohum al" },
  { title: "Kurutma", detail: "Serin ve kuru ortam" }
];

export const storageGuide = [
  { title: "Isik", detail: "Gunes gormeyen ortam" },
  { title: "Nem", detail: "Düşük nem seviyesinde sakla" },
  { title: "Sıcaklik stabilitesi", detail: "Ani sıcaklik degisimi yogusma ve kalite kaybi yapar" },
  { title: "Hava sirkulasyonu", detail: "Depoda noktasal nem birikimini engellemek icin fan/akim kullan" }
];

export const troubleshooting = [
  { title: "Yaprak sarariyor", detail: "Sulama ve besin dengesini kontrol et" },
  { title: "Yaprak dusuyor", detail: "Isik ve sıcaklik stresine bak" },
  { title: "Yavaş gelisim", detail: "Toprak besini ve kök sağlığı" },
  { title: "Meyve kucuk kaliyor", detail: "Su/kalium dengesi ve bitki yuku optimize edilmeli" },
  { title: "Lekeler hizla yayıliyor", detail: "Nem, hava akisi ve bulaş kaynaklarini acil kontrol et" }
];

export const pestLifecycle = [
  { title: "Yumurta", detail: "Kisa sureli" },
  { title: "Larva", detail: "En zararli evre" },
  { title: "Pupa", detail: "Gecis evresi; hedef disi donemde izleme gerektirir" },
  { title: "Ergin", detail: "Ucak ve yayılim" }
];

export const rotationGuide = [
  { title: "Solanaceae", detail: "Ust uste ekim hastalik riskini artirir" },
  { title: "Baklagil", detail: "Topraga azot kazandirir" },
  { title: "Tahil gecisi", detail: "Toprak kökenli patojen baskisini kirar" },
  { title: "3 yıllık dongu", detail: "Aynı familyayi en az 3 sezon arayla tekrarla" }
];

export const seedStartGuide = [
  { title: "Nem", detail: "Toprak nemini stabil tut" },
  { title: "Isik", detail: "Fidelerde yeterli isik" },
  { title: "Havalandirma", detail: "Fide ortaminda fungus riskini azaltir" },
  { title: "Sertlestirme", detail: "Dikim oncesi dis ortama kademeli alistirma yap" }
];

export const pestGuide = [
  { name: "Aphid", detail: "Yaprak altinda koloni, tatlimsi salgi ve kivrilma olusturur" },
  { name: "Whitefly", detail: "Yaprak sararmasi ve virus tasima riski" },
  { name: "Trips", detail: "Yaprakta gumusumsu iz ve meyvede deformasyon" },
  { name: "Kırmızı örümcek", detail: "Sıcak-kuru koşullarda hızlı artış, yaprakta bronzlaşma" },
  { name: "Yaprak galerisi", detail: "Yaprak icinde tünel izi ve fotosentez kaybi" },
  { name: "Tuta absoluta", detail: "Domateste yaprak ve meyvede deliklenme, yüksek kayıp riski" }
];

export const farmerChecklists = [
  { title: "Günlük", detail: "Yaprak + toprak kontrolu" },
  { title: "Haftalik", detail: "Tuzak ve nem takibi" },
  { title: "Aylık", detail: "Sulama verimliliği, EC/pH, girdi-kullanım raporu" },
  { title: "Sezonluk", detail: "Verim, kalite, maliyet ve hastalik analizi kapanis raporu" }
];

export const safetyNotes = [
  { title: "KKD", detail: "Uygulamada maske ve eldiven" },
  { title: "Depolama", detail: "Kimyasallari kilitli sakla" },
  { title: "Etiket uyumu", detail: "Doz, PHI ve REI talimatlarini etikete göre uygula" },
  { title: "Karisim guvenligi", detail: "Etikette izin verilmeyen karisimlardan kacin" }
];

export const soilTesting = [
  { title: "pH", detail: "6.0-7.0 araligi" },
  { title: "Organik madde", detail: "%2+ hedef" },
  { title: "EC", detail: "Tuzluluk kontrolu icin duzenli olcum" },
  { title: "Azot/Fosfor/Potasyum", detail: "Bitki talebine göre parsel bazli planlama" },
  { title: "Mikro element", detail: "Demir, cinko, bor eksikligi belirtileriyle birlikte degerlendirilir" }
];

export const soilTypes = [
  { name: "Tinali", detail: "Su tutma iyi, drenaj orta" },
  { name: "Kumlu", detail: "Drenaj iyi, su tutma düşük" },
  { name: "Killi", detail: "Su tutma yüksek, havalanma ve işleme zorlugu olabilir" },
  { name: "Tinli-kumlu", detail: "Iyi drenaj + orta su tutma dengesi" },
  { name: "Tınlı-killi", detail: "Besin tutma iyi, sıkismaya karşı organik madde önemli" },
  { name: "Kirecli", detail: "Mikro element alimi sinirlanabilir, pH yönetimi gerekir" }
];

export const symptomDictionary = [
  { name: "Kivrilma", causes: "Sıcak stresi, virusler, su dengesizligi" },
  { name: "Beyaz toz", causes: "Kulleme hastaligi" },
  { name: "Delikli yaprak", causes: "Zararlilar, yaprak yiyen bocekler" },
  { name: "Solgünlük", causes: "Susuzluk, kök sorunu, sıcak stresi" },
  { name: "Koku curume", causes: "Kok curuklugu, fazla sulama" },
  { name: "Meyve catlamasi", causes: "Ani sulama, nem degisimi" },
  { name: "Damar arasi sararma", causes: "Demir/magnezyum eksikligi veya kök stresi" },
  { name: "Yaprak ucu yanigi", causes: "Tuz stresi, potasyum dengesizligi, su stresi" },
  { name: "Gumusumsu leke", causes: "Trips zarari veya yaprak yuzeyi hasari" },
  { name: "Mozaik desen", causes: "Viral etkenler ve vektor zararlilar" },
  { name: "Cicek dokumu", causes: "Isi stresi, su dengesizligi, besin dengesizligi" },
  { name: "Meyvede sekel", causes: "Trips, don hasari veya dengesiz sulama" }
];
