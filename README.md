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

### 3. Machine Learning (ML Pipeline)
- **PyTorch** kullanılarak geliştirilmiş eğitim scriptleri (`ml/train.py`, `ml/model_factory.py`).
- Eğitilen modellerin sisteme **ONNX formatında** dönüştürülüp entegre edilmesi (`server/model/`).

---

## ⚙️ Kurulum & Çalıştırma

### 📌 Gereksinimler
Projenin sisteminizde sorunsuz çalışabilmesi için aşağıdakilerin yüklü olması gerekir:
- [Node.js](https://nodejs.org/) (Önerilen: LTS sürümü)
- [npm](https://www.npmjs.com/) veya [Yarn](https://yarnpkg.com/)
- [Python 3.x](https://www.python.org/) (Makine öğrenmesi modellerini kendiniz eğitmek isterseniz önerilir, standart kullanım için zorunlu değildir)
- [Git](https://git-scm.com/)

### 📥 Kurulum Adımları
Aşağıdaki adımları sırasıyla uygulayarak projeyi yerel bilgisayarınıza kurabilirsiniz:

1. **Projeyi Klonlayın:**
```bash
git clone https://github.com/yasinkaya701/AgroGuard.git
cd AgroGuard
```

2. **Bağımlılıkları Yükleyin:**
Projeyi çalıştırmak için gerekli olan Node paketlerini kurun:
```bash
npm install
```

---

## 🚀 Çalıştırma

### Geliştirme Ortamı (Development)
Proje aynı anda hem Frontend hem de Backend servislerini başlatacak şekilde yapılandırılmıştır. Terminal ekranında aşağıdaki komutu çalıştırmanız yeterlidir:

```bash
npm start
```
Bu komut, uygulamanızı **http://localhost:3000** portunda (Arayüz), Backend servisini ise varsayılan olarak **http://localhost:5051** portunda ayağa kaldırır.

### Üretim Ortamı (Production Build)
Uygulamayı bir sunucu ortamında (Vercel, Netlify, Nginx vb.) yayınlamak üzere optimize edilmiş statik dosyalar oluşturmak isterseniz:

```bash
npm run build
```
Bu işlem sonunda Frontend çıktılarınız `build/` dizini altında oluşturulacaktır.

---

## 🔗 Temel API Uçları (Endpoints)

Hızlı entegrasyon ve kontrol için Backend üzerinde bulunan en temel HTTP servisleri şu şekildedir:

* **🩺 Bitki Teşhisi:** `POST /api/diagnose` - Fotoğraf analizi ile hastalık tespiti.
* **⛅️ Hava Durumu:** `GET /api/weather` - Bölgesel, mikroklima hava verisi.
* **🌱 Toprak Analizi:** `GET /api/soil` - Koordinatlara bağlı toprak sağlığı parametreleri.
* **💹 Pazar İşlemleri:** `GET /api/trade/listings`, `POST /api/trade/listings` - İlan arama ve ilan oluşturma servisleri.

Daha kapsamlı arsa fiyatlandırma ve kargo sağlayıcısı (shipping adapter) yapılandırmaları için çevre değişkenleri (ENV Variables) kullanılmaktadır.

---

## 🎓 TEKNOFEST Bağlamı
Yapay Zekâ ve Görüntü İşleme Sistemleri odağıyla hazırlanan bu yazılım, "AGROGUARD: Yapay Zekâ Destekli Multispektral Görüntü Analizi ve Dijital Tarım Destek Sistemi" vizyonunu temsil etmektedir. Çalışmanın akademik yayın çerçevesindeki kurallara tabi olarak hazırlandığı kabul edilmiştir.

---
**AgroGuard** ile Dijital ve Bilinçli Tarım! 🚜🌾
