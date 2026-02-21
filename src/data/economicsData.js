export const cropYieldKgDa = {
  domates: {
    nationalKgDa: 7870,
    provincesKgDa: {
      Malatya: 8000,
      Bursa: 8290,
      Manisa: 9180,
      Konya: 7340,
      Nigde: 9680
    },
    source: {
      title: "TEPGE Domates Urun Raporu 2024",
      url: "https://arastirma.tarimorman.gov.tr/tepge/Belgeler/PDF%20%C3%9Cr%C3%BCn%20Raporlar%C4%B1/2024%20%C3%9Cr%C3%BCn%20Raporlar%C4%B1/Domates%20%C3%9Cr%C3%BCn%20Raporu%202024-396%20TEPGE.pdf",
      note: "Verimler ton/ha tablosundan kg/da'ya cevrildi (1 ha = 10 da)."
    }
  },
  patates: {
    nationalKgDa: 3525,
    provincesKgDa: {
      Nigde: 3458,
      Kayseri: 4338,
      Konya: 3525,
      Bitlis: 4361,
      Adana: 4054
    },
    source: {
      title: "TEPGE Patates Urun Raporu 2025",
      url: "https://arastirma.tarimorman.gov.tr/tepge/Belgeler/PDF%20%C3%9Cr%C3%BCn%20Raporlar%C4%B1/2025%20%C3%9Cr%C3%BCn%20Raporu/Patates%20%C3%9Cr%C3%BCn%20Raporu%202025-415%20TEPGE.pdf",
      note: "Rapor verileri kg/da olarak verilir."
    }
  }
};

export const cropLabelMap = {
  domates: "Domates",
  patates: "Patates",
  biber: "Biber",
  bugday: "Bugday",
  arpa: "Arpa",
  misir: "Misir",
  aycicegi: "Aycicegi",
  pamuk: "Pamuk",
  sekerpancari: "Seker pancari"
};

export const cropPriceTlKg = {
  domates: 12.5,
  patates: 8.2,
  biber: 19.5,
  bugday: 11.2,
  arpa: 9.4,
  misir: 8.7,
  aycicegi: 17.3,
  pamuk: 24.0,
  sekerpancari: 2.2
};

export const defaultCosts = {
  tohum: 0,
  fide: 0,
  gubre: 0,
  ilac: 0,
  sulama: 0,
  iscilik: 0,
  yakit: 0,
  diger: 0
};

export const landDemoBenchmarks = {
  malatya: {
    zonePremium: {
      ova: 1.08,
      gecis: 1.0,
      yamaç: 0.92
    },
    notes: "Kayisi odakli pazarda ova parselleri primli seyreder."
  },
  konya: {
    zonePremium: {
      ova: 1.06,
      gecis: 1.0,
      yamaç: 0.9
    },
    notes: "Sulama altyapisina yakin alanlar daha hizli degerlenir."
  },
  antalya: {
    zonePremium: {
      ova: 1.1,
      gecis: 1.0,
      yamaç: 0.9
    },
    notes: "Sebze-sera koridorunda ova segmenti yuksek talep gorur."
  }
};
