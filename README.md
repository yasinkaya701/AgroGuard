# AgroGuard: Dijital Tarım Komuta Merkezi

AgroGuard, sıradan bir bitki hastalık teşhis uygulamasının ötesinde, tarımsal riskleri yönetmek, finansal öngörüler oluşturmak ve iklim belirsizliklerine karşı proaktif aksiyonlar almak üzere tasarlanmış kapsamlı bir **Dijital Tarım Komuta Merkezi**'dir.

Bitki hastalık teşhisi, 3 Boyutlu Dijital Arazi İkizi (Digital Twin), Makine Öğrenmesi destekli arsa değerleme modeli, Arbitraj Radarı ve Hackathon Çıktılarına dayalı derin iklim analizleri sunar.

## Temel Özellikler (Komuta Merkezi Katmanları)

### 1. Akıllı Teşhis & AgroBot (AI Danışman)
- **Hızlı Teşhis:** Kameradan veya galeriden yüklenen yaprak fotoğraflarıyla anında hastalık teşhisi.
- **AgroBot AI:** Doğal dilde tarımsal soruları yanıtlayan, teşhis sonuçlarına göre çözüm üreten yapay zeka asistanı.
- **Entegre Bilgi Bankası:** Yüzlerce hastalık, zararlı ve tedavi yöntemini içeren geniş offline/online veri havuzu.

### 2. Parsel Dijital İkiz (Digital Twin) & Değerleme
- **3D Arazi Simülasyonu:** Arazinizin toprak sağlığı, nem oranı ve ph değeri gibi sensör benzeri verilerinin 3 boyutlu görselleştirilmesi.
- **ML Tabanlı Değerleme:** Emsal ilanlar, toprak kalitesi ve lojistik faktörlere dayanarak arazinizin güncel makine öğrenmesi destekli fiyat tahmini.
- **Yatırım Getirisi (ROI) Hesaplayıcı:** Arazinin yıllık maliyet-gelir analizini yaparak geri dönüş süresini tahmin etme.

### 3. Market Terminali & Arbitraj Radarı
- **Canlı Borsa Akışı:** Ürün fiyatlarındaki anlık değişimleri gösteren terminal ekranı.
- **Akıllı Fiyatlama (Smart Sell):** ML tahminlerine dayalı optimum satış fiyatı ve zamanlaması tavsiyesi.
- **Bölgesel Arbitraj Radarı:** Farklı illerdeki (Hal/Market) fiyat makaslarını (Arbitraj fırsatlarını) analiz ederek en kârlı pazar yerini bulma.

### 4. İklim Zekâsı & Kuraklık Önleme (Hackathon Çıktıları)
- **Derin İklim Geçmişi:** Hackathon yarışma çıktılarına ve açık veri setlerine dayalı kapsamlı iklim ve kuraklık analizleri.
- **Mikroklima Modellemeleri:** Özel gridasyon yöntemleriyle arazinize en yakın hiper-yerel iklim tahminleri.
- **Sulama ve Evapotranspirasyon (ET0):** Bitkinin günlük su tüketimine dayalı, ürün bazlı dinamik sulama takvimleri oluşturma.

---

## 🚀 Başlangıç ve Basit Kurulum

Projeyi bilgisayarınızda kendi başınıza çalıştırmak çok kolaydır. Aşağıdaki 4 adımı izleyerek uygulamayı hemen kullanmaya başlayabilirsiniz.

### Bölüm 1: Gerekli Programların Kurulması

Uygulamanın çalışması için bilgisayarınızda **Node.js** adında bir programın yüklü olması gerekir.

1. **[Node.js İndirme Sayfasına](https://nodejs.org/)** gidin.
2. Karşınıza çıkan ekrandan **"LTS"** (Recommended for Most Users - Çoğu Kullanıcı İçin Önerilen) yazan yeşil butona tıklayın.
3. İnen dosyayı açın ve hep "İleri" (Next) diyerek standart kurulumu tamamlayın. *(Özel bir ayar yapmanıza gerek yoktur).*

### Bölüm 2: Proje Dosyalarını İndirmek

Bu projenin kodlarını bilgisayarınıza almanız gerekiyor.

1. Sayfanın en üstünde yer alan yeşil renkli **"Code"** butonuna tıklayın.
2. Açılan küçük pencerede **"Download ZIP"** seçeneğine tıklayın.
3. İnen ZIP dosyasını bilgisayarınızda bulmak istediğiniz bir klasöre (Örneğin: Masaüstü) çıkartın.

### Bölüm 3: Projeyi Bilgisayarda Açmak ve Hazırlamak

Projeyi çalıştırmak için bir Terminal (Komut İstemcisi) kullanacağız. Gözünüz korkmasın, sadece iki basit komut yazacağız.

1. ZIP'ten çıkardığınız proje klasörünü açın.
2. Klasörün tam içindeyken:
   - **Windows kullanıyorsanız:** Klasör içindeyken üstteki adres çubuğuna tıklayın, oradaki yazıyı silip `cmd` yazın ve `Enter`'a basın. Siyah bir ekran açılacak.
   - **Mac kullanıyorsanız:** Klasördeyken alt menüden veya sağ tıklayarak "Terminal'de Aç" (New Terminal at Folder) seçeneğini seçin.
3. Açılan o siyah (veya beyaz) ekrana şu komutu yazın ve klavyenizdeki `Enter` tuşuna basın:
   ```bash
   npm install
   ```
   *Not: Bu işlem uygulamanın ihtiyaç duyduğu ek paketleri internetten indirecektir. İnternet hızınıza göre 1-2 dakika sürebilir. Yazıların akmasını bekleyin.*

### Bölüm 4: Projeyi Çalıştırmak

Kurulum bittikten sonra, yine aynı siyah ekrana şu komutu yazıp `Enter`'a basın:

```bash
npm start
```

- Biraz bekledikten sonra uygulamanız hazır hale gelecek ve bilgisayarınızın internet tarayıcısında (Google Chrome vb.) otomatik olarak **`http://localhost:3000`** adresinde açılacaktır.
- Artık AgroGuard Dijital Tarım Komuta Merkezi'ni kullanmaya başlayabilirsiniz! 🎉

> **İpucu:** Uygulamayı kapatmak isterseniz, o siyah ekrana gelip klavyenizden `Ctrl + C` (Mac için `Control + C`) tuşlarına aynı anda basabilirsiniz.

---

## 🛠 Kullanılan Teknolojiler

- **Arayüz (Frontend):** React.js, Tailwind CSS konseptli özel Vanilla CSS, Lucide Icons, React-Leaflet
- **Makine Öğrenmesi (ML Katmanı):** TensorFlow.js (İstemci taraflı bitki hastalık modellemesi)
- **Simülasyon Verisi:** Proje içi statik JSON veri setleri ve dinamik JavaScript modelleri (Borsa, İklim, Hackathon veri setleri)
