# 🌱 AgroGuard: Yapay Zekâ Destekli Dijital Tarım Sistemi

Merhaba! **AgroGuard** projesine hoş geldin. Bu proje, bilgisayarların bitkilerdeki hastalıkları fotoğraflara bakarak anlamasını sağlayan, aynı zamanda çiftçilerin ürünlerini alıp satabileceği dijital bir pazar sunan akıllı bir sistemdir.

Eğer hayatınızda daha önce hiç kod yazmadıysanız veya bilgisayarınıza böyle bir program kurmadıysanız, hiç endişelenmeyin! Bu rehber size **adım adım, en basit haliyle** bu sistemi bilgisayarınızda nasıl çalıştıracağınızı anlatacak.

---

## 🛠️ Bölüm 1: Bilgisayarımızı Hazırlayalım (Gereksinimler)

Bu projenin çalışabilmesi için bilgisayarımıza iki tane küçük program (araç) kurmamız gerekiyor. Bu programlar tamamen ücretsiz ve güvenilirdir.

### 1. Node.js (Bilgisayarın Kodları Anlama Motoru)
Node.js, bilgisayarınızın bizim yazdığımız özellikleri çalıştırabilmesini sağlayan bir motordur.
*   **Nasıl Kurulur?** [Buraya tıklayarak Node.js resmi sitesine gidin (https://nodejs.org)](https://nodejs.org/). Karşınıza çıkan yeşil renkli düğmelerden **"LTS" (Uzun Süreli Destek - Önerilen)** yazan butona tıklayıp indirin.
*   İndirdiğiniz dosyayı normal bir program kurar gibi (`İleri -> İleri -> Kabul Ediyorum -> Kur`) diyerek bilgisayarınıza kurun.

### 2. Git (Dosyaları Bilgisayarımıza İndirme Aracı)
Git, internetteki (GitHub üzerindeki) bu projenin dosyalarını sizin bilgisayarınıza kolayca çekip getirmemizi (klonlamamızı) sağlar.
*   **Nasıl Kurulur?** [Buraya tıklayarak Git resmi sitesine gidin (https://git-scm.com/downloads)](https://git-scm.com/downloads). "Download for Windows" veya "Download for Mac" butonuna basarak indirin.
*   Normal bir program gibi hep "İleri" (Next) diyerek kurulumu tamamlayın, hiçbir ayarı değiştirmenize gerek yok.

*Harika! Artık bilgisayarınız hazır, hadi projemizi çalıştıralım.* 🎉

---

## 📥 Bölüm 2: Projeyi Bilgisayarımıza İndirmek

Artık siyah bir "Komut Ekranı" kullanacağız. Bilgisayara komutlar vererek işlemleri çok daha hızlı yapacağız.

1.  **Terminal (Komut İstemi) Açmak:**
    *   **Windows Kullanıyorsanız:** Klavyenizden `Windows (Başlat)` tuşuna basın, arama yerine `cmd` veya `Terminal` yazın ve "Komut İstemi" uygulamasını açın. Siyah bir kutu açılacak.
    *   **Mac Kullanıyorsanız:** Klavyenizdeki `Command (⌘) + Boşluk (Space)` tuşlarına aynı anda basın. Açılan arama çubuğuna `Terminal` yazın ve `Enter`'a basın.

2.  Siyah ekrana şu cümleyi kopyalayıp yapıştırın (veya yazın) ve **Enter** tuşuna basın:
    ```bash
    git clone https://github.com/yasinkaya701/AgroGuard.git
    ```
    *Bu komut, AgroGuard dosyalarını internetten bilgisayarınıza indirecektir. Yüzde dolana kadar birkaç saniye bekleyin.*

3.  Şimdi indirdiğimiz klasörün içine (odasına) girmeliyiz. Şu komutu yazıp **Enter**'a basın:
    ```bash
    cd AgroGuard
    ```
    *Tebrikler, artık projenin içindesiniz!* 👏

---

## ⚙️ Bölüm 3: Gerekli Malzemelerin Yüklenmesi

Projenin içinde sayfaların tasarımları, haritalar, tuşlar gibi önceden hazırlanmış birçok parça kullanıyoruz. Bu parçaları tek bir komutla fabrikasından getirmemiz lazım.

1. Aynı siyah ekranda (Terminal'de) şu komutu yazın ve **Enter**'a basın:
    ```bash
    npm install
    ```
    *(Buradaki npm, "Bana gerekli malzemeleri getir" demektir).*
2.  Bu işlem bilgisayarınızın ve internetinizin hızına bağlı olarak **1-3 dakika** sürebilir. Ekranda harflerin / çubukların dolduğunu göreceksiniz. Sabırla bitmesini ve tekrar o siyah ekrandaki imlecin yanıp sönmesini bekleyin.

---

## 🚀 Bölüm 4: Sistemi Çalıştıralım! Hazırız!

Her şey kuruldu, odanın içine girdik, eşyaları da yerleştirdik. Şimdi tek yapmamız gereken motorun düğmesine basmak.

1. Tekrar aynı siyah ekrana şu son büyülü kelimeyi yazın ve **Enter**'a basın:
    ```bash
    npm start
    ```
2.  **Lütfen siyah ekranı kapatmayın!** Arka planda çalışmaya devam edecek. 
3.  Bilgisayarınız biraz çalışacak, ardından Google Chrome, Safari veya kullandığınız internet tarayıcısı **kendi kendine açılacak** ve karşınıza **http://localhost:3000** adresinde AgroGuard sitesi gelecektir!

**(Eğer kendi kendine açılmazsa:** Siyah ekranda `Compiled successfully!` yazısını gördükten sonra, tarayıcınızın (Chrome vb.) en üstündeki arama yerine `localhost:3000` yazıp Enter tuşuna basmanız yeterlidir.)

---
Aramıza Hoş Geldiniz! Artık sistemi kurcalayabilir, hastalığını merak ettiğiniz yaprak fotoğraflarını yükleyebilir ve Market sekmesindeki dijital arsa pazarını gezebilirsiniz. 😊🚜🌿

---

---

> 👇 **BİLİŞİM UZMANLARI VE GELİŞTİRİCİLER İÇİN TEKNİK DETAYLAR** 👇

*(Aşağıdaki bölümler yalnızca projeyi kodlamak, kendi veritabanını kurmak veya Makine Öğrenmesi (ML) modelini eğitmek isteyen geliştiriciler (developer) içindir).*

## 🧩 Sistem Özellikleri (Teknik)
- **Frontend:** React SPA, Lucide-React, Capacitor (Hybrid Mobil hazırlığı).
- **Backend:** Node.js, Express, Multer, Göreceli JSON veri yapısı (`server/data`).
- **Makine Öğrenmesi (ML):** PyTorch ile eğitilmiş, ONNX formatına dönüştürülmüş model altyapısı (`/ml` dizini altından yönetilir).

## 📡 Backend API Uçları (Geliştirici)
Geliştirme portu varsayılan olarak `5051` (veya `.env` dosyasındaki değer) olarak ayarlanır (`npm start` iki portu da paralel ayağa kaldırır).
- `POST /api/diagnose`: Gövdede form-data içerisinde `image` bekleyen ONNX çıkarım ucu.
- `GET /api/weather`: İklim ve Open-Meteo tahmini don riski modeli.
- `GET /api/trade/listings`: Pazar / İlan GET uçları.

## ⚖️ Lisans
Bu proje geliştirici dostu **MIT Lisansı** ile sunulmaktadır. Daha fazla bilgi için `LICENSE` dosyasına bakınız.

## 🎓 TEKNOFEST Bağlamı
Yapay Zekâ ve Görüntü İşleme Sistemleri yarışması için yayınlanmış olan *"AGROGUARD: Yapay Zekâ Destekli Multispektral Görüntü Analizi ve Dijital Tarım Destek Sistemi"* prototipidir. Herhangi bir akademik ihlali bulunmamakta olup, modüler ve geliştirilebilir bir yapı üzerine tasarlanmıştır.
