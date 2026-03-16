# AgroGuard: Yapay Zekâ Destekli Dijital Tarım Destek Sistemi

AgroGuard, **bitki hastalık teşhisi**, **multispektral (drone + uydu) analiz** ve **iklim/market/arsa verisi** katmanlarını birleştiren, modüler bir **dijital tarım destek sistemi**dir.

Bu proje, TEKNOFEST kapsamında geliştirilen **web + mobil (Capacitor)** uygulama, **Node/Express backend** ve **PyTorch/ONNX tabanlı ML eğitim ve çıkarım pipeline’ını** içermektedir.

---

## 🚀 Özellikler

### 🌿 Bitki Hastalık Teşhisi (CNN + ONNX)
- Mobil veya web arayüzünden yaprak/gövde fotoğrafı yükleyerek teşhis yapabilme.
- Hem sunucu hem de cihaz üzerinde çalışabilen **ONNX** modeli ile hızlı ve isabetli sınıflandırma.
- Her hastalık için **güven skoru**, önleyici tedbir önerileri ve Türkçe özet teşhis sonuçları.

### 🌤 İklim ve Risk İzleme
- Open-Meteo verileri ile don riski, ani sıcaklık değişimleri gibi durumlara karşı **kısa vadeli tahmini uyarılar**.
- Bölgesel mikroklima analizi ve toprak nemi / sıcaklığı entegrasyonu.

### 💼 Dijital Pazar & Land Terminal (Ticaret Ağı)
- Çiftçiler ve tedarikçiler arası pazar: **İlan oluşturma**, **teklif sunma** ve **sipariş takip** akışları.
- Arsa değerleme, fiyat tahminleri ve pazar derinliği/trend göstergeleri.

### 📈 Planlanan/Geliştirilen Diğer Modüller
- **Drone & Multispektral Analiz:** NDVI, NDRE, NIR indeksleriyle parsel bazlı bitki gelişim haritaları.
- **Toprak & Mahsul Uygunluk Önerileri:** Toprak analizi (pH, organik madde) ile bölgesel mahsul projeksiyonları.
- **Verim Tahmini:** İklim ve spektral verilere dayalı sezon sonu verim tahmin modeli.

---

## 🛠 Mimari Genel Bakış

### 1. Frontend (İstemci)
- **React** tabanlı dinamik tek sayfalık uygulama (SPA).
- **Capacitor** entegrasyonu sayesinde kod tabanını iOS ve Android native mobil uygulamalara kolayca dönüştürme imkanı.
- Beş ana sekme: `Ana Sayfa`, `Arsa (Land)`, `Pazar (Market)`, `Hava Durumu (Weather)`, ve `Demolar`.

### 2. Backend (Sunucu)
- **Node.js & Express.js** API sunucusu.
- Rest API uçlarıyla görüntü işleme (ONNX çıkarım), hava, toprak ve pazar verilerini sağlama.
- Geliştirme kolaylığı için harici bağlantı gerektirmeyen gömülü `JSON` tabanlı depo sistemi (`server/data/*.json`).

### 3. Machine Learning (ML Pipeline)
- **PyTorch** kullanılarak geliştirilmiş eğitim scriptleri (`ml/train.py`, `ml/model_factory.py`).
- Eğitilen modellerin sisteme **ONNX formatında** dönüştürülüp entegre edilmesi (`server/model/`).

---

## ⚙️ Detaylı Kurulum & Çalıştırma Rehberi

Aşağıdaki adımlar, projeyi ilk defa ayağa kaldıracak bir geliştirici için detaylıca hazırlanmıştır.

### 📌 Adım 1: Sistem Gereksinimlerini Sağlayın
Projenin bilgisayarınızda sorunsuz çalışması için temel yazılımlara ihtiyaç vardır:
1. **[Node.js (LTS Sürümü)](https://nodejs.org/tr/):** V8 JavaScript motorudur (Front-End & Back-End). Komut isteminde `node -v` çalıştırarak kurulu olduğundan emin olun (Önerilen: 18.x veya üzeri).
2. **Paket Yöneticisi:** Node.js kurduğunuzda **npm** otomatik kurulur (`npm -v` ile kontrol edin).
3. **[Git](https://git-scm.com/):** Versiyon kontrol sistemi.
4. *(Opsiyonel)* **[Python 3.x](https://www.python.org/):** Makine öğrenmesi modellerini (`/ml` dizinindeki eğitim dosyalarını) kullanmak isterseniz yüklemelisiniz. 

---

### 📥 Adım 2: Projeyi Bilgisayarınıza Klonlayın

Aşağıdaki komutları herhangi bir terminal veya komut isteminde (CMD/PowerShell) çalıştırın:
```bash
# Projeyi GitHub üzerinden klonlayın
git clone https://github.com/yasinkaya701/AgroGuard.git

# Projenin oluşturulduğu ana dizine geçin
cd AgroGuard
```

---

### 📦 Adım 3: Gerekli Paketleri (Bağımlılıkları) Yükleyin

Proje hem React tabanlı ön yüzü hem de Node/Express arka yüzü aynı klasör içinde barındırır. Bütün eklentileri yüklemek için:
```bash
# AgroGuard dizini altındayken bu komutu çalıştırın
npm install
```
*Not: Bu işlem internet hızınıza bağlı olarak birkaç dakika sürebilir. Dosyalar `node_modules` isimli klasöre indirilecektir.*

---

### 🚀 Adım 4: Geliştirme Ortamını (Dev Server) Başlatın

Proje `concurrently` paketini kullandığı için **ön yüz (React)** ve **arka yüz (Express.js)** aynı anda tek komutla başlatılır.

Terminalde şu komutu çalıştırın:
```bash
npm start
```

**Ne beklemeliyim?**
- Komutu çalıştırdıktan sonra terminal **iki farklı renkte log basmaya başlar.** (Genelde biri API, diğeri WEB loglarıdır).
- **Backend (Arka Yüz)** `http://localhost:5051` (veya uygun görülen ilk port) üzerinde aktif olur.
- **Frontend (Ön Yüz)** terminalde başarılı bir şekilde derlendikten sonra tarayıcınız otomatik olarak açılacak ve **http://localhost:3000** sekmesinde `AgroGuard` arayüzü belirecektir.

*(Port dolu uyarısı alırsanız sistem otomatik olarak port numarasını 3001 gibi artırarak React'ı başlatacaktır.)*

---

### 🌍 (Opsiyonel) Çevre Değişkenleri ve Konfigürasyon
Projeyi denemek için harici bir veritabanı veya API anahtarına ihtiyacınız **yoktur**. Tüm pazar ve arazi verileri `server/data/` altındaki `JSON` dosyalarından okunur. 

Ancak gelişmiş kargo (Shipping) ve arsa fiyatı (Land Price) senaryoları tasarlamayı düşünüyorsanız `.env` dosyası oluşturabilirsiniz:
1. Proje ana dizininde (AgroGuard) yeni bir `.env` (başı noktalı) dosyası oluşturun.
2. Özel parametrelerinizi tanımlayın (Örn: `API_PORT=5051`, `LAND_DISCOVERY_ENABLED=true`).

---

### 🏗 Adım 5: Üretim (Production) Sürümünü Hazırlama
Eğer bilgisayarınızda bir ürün sunucusu yapılandıracak veya Vercel/Netlify/Firebase gibi yerlere dosyaları atacaksanız:
```bash
npm run build
```
Bu adım, `src/` içindeki React kodunu küçültür (minify) ve statik dosyaları `build/` klasöründe yayınlamaya hazır hale getirir.

---

## 🔗 Temel API Uçları (Endpoints)

Eğer sadece Backend servislerini Postman veya benzeri bir araçla test etmek isterseniz (Proje çalışırken):

* **🩺 Bitki Teşhisi:** `POST http://localhost:5051/api/diagnose` - Fotoğraf yükleyerek tahmin alma servisidir. Gövdeden "image" parametresi gönderilir.
* **⛅️ Hava Durumu:** `GET http://localhost:5051/api/weather?lat=39.9&lon=32.8` - Koordinat bazlı iklim raporu.
* **🌱 Toprak Analizi:** `GET http://localhost:5051/api/soil?lat=39.9&lon=32.8` - Koordinatlara bağlı toprak sağlığı parametreleri.
* **💹 Pazar Listesi:** `GET http://localhost:5051/api/trade/listings` - Pazaryerine eklenmiş güncel mahsul veya arsa ilanları.

---

## ⚖️ Lisans
Bu proje **MIT Lisansı** altında açık kaynak olarak dağıtılmaktadır. Detaylar için ana dizindeki `LICENSE` dosyasına göz atabilirsiniz.

---

## 🎓 TEKNOFEST Bağlamı
Yapay Zekâ ve Görüntü İşleme Sistemleri odağıyla hazırlanan bu yazılım, "AGROGUARD: Yapay Zekâ Destekli Multispektral Görüntü Analizi ve Dijital Tarım Destek Sistemi" vizyonunu temsil etmektedir. Çalışmanın akademik yayın çerçevesindeki kurallara tabi olarak hazırlandığı kabul edilmiştir.

---
**AgroGuard** ile Dijital ve Bilinçli Tarım! 🚜🌾
