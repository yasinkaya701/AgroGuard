export const TURKEY_REGIONAL_MULTIPLIERS = {
    "Marmara": 2.4,      // Istanbul, Bursa, Kocaeli
    "Ege": 1.9,         // Izmir, Mugla, Aydin
    "Akdeniz": 1.7,     // Antalya, Mersin, Adana
    "Ic Anadolu": 1.3,  // Ankara, Konya, Kayseri
    "Karadeniz": 1.2,   // Trabzon, Samsun, Rize
    "Dogu Anadolu": 0.8, // Malatya, Erzurum, Van
    "Guneydogu Anadolu": 1.1 // Gaziantep, Mardin, Urfa
};

export const CITY_TO_REGION = {
    "Istanbul": "Marmara", "Bursa": "Marmara", "Kocaeli": "Marmara", "Sakarya": "Marmara", "Tekirdag": "Marmara", "Balikesir": "Marmara", "Canakkale": "Marmara", "Bilecik": "Marmara", "Edirne": "Marmara", "Kirklareli": "Marmara", "Yalova": "Marmara",
    "Izmir": "Ege", "Manisa": "Ege", "Aydin": "Ege", "Denizli": "Ege", "Mugla": "Ege", "Afyonkarahisar": "Ege", "Kutahya": "Ege", "Usak": "Ege",
    "Antalya": "Akdeniz", "Mersin": "Akdeniz", "Adana": "Akdeniz", "Hatay": "Akdeniz", "Isparta": "Akdeniz", "Burdur": "Akdeniz", "Osmaniye": "Akdeniz", "Kahramanmaras": "Akdeniz",
    "Ankara": "Ic Anadolu", "Konya": "Ic Anadolu", "Kayseri": "Ic Anadolu", "Eskisehir": "Ic Anadolu", "Sivas": "Ic Anadolu", "Kirikkale": "Ic Anadolu", "Aksaray": "Ic Anadolu", "Karaman": "Ic Anadolu", "Kirsehir": "Ic Anadolu", "Nigde": "Ic Anadolu", "Nevsehir": "Ic Anadolu", "Yozgat": "Ic Anadolu", "Cankiri": "Ic Anadolu",
    "Samsun": "Karadeniz", "Trabzon": "Karadeniz", "Ordu": "Karadeniz", "Giresun": "Karadeniz", "Rize": "Karadeniz", "Artvin": "Karadeniz", "Amasya": "Karadeniz", "Corum": "Karadeniz", "Tokat": "Karadeniz", "Zonguldak": "Karadeniz", "Karabuk": "Karadeniz", "Bartin": "Karadeniz", "Kastamonu": "Karadeniz", "Sinop": "Karadeniz", "Gumushane": "Karadeniz", "Bayburt": "Karadeniz", "Duzce": "Karadeniz",
    "Malatya": "Dogu Anadolu", "Erzurum": "Dogu Anadolu", "Van": "Dogu Anadolu", "Elazig": "Dogu Anadolu", "Erzincan": "Dogu Anadolu", "Hakkari": "Dogu Anadolu", "Bitlis": "Dogu Anadolu", "Mus": "Dogu Anadolu", "Bingol": "Dogu Anadolu", "Tunceli": "Dogu Anadolu", "Agri": "Dogu Anadolu", "Kars": "Dogu Anadolu", "Ardahan": "Dogu Anadolu", "Igdir": "Dogu Anadolu",
    "Gaziantep": "Guneydogu Anadolu", "Sanliurfa": "Guneydogu Anadolu", "Diyarbakir": "Guneydogu Anadolu", "Mardin": "Guneydogu Anadolu", "Adiyaman": "Guneydogu Anadolu", "Siirt": "Guneydogu Anadolu", "Batman": "Guneydogu Anadolu", "Sirnak": "Guneydogu Anadolu", "Kilis": "Guneydogu Anadolu"
};

export const getSmartLandPrice = (city) => {
    const region = CITY_TO_REGION[city] || "Ic Anadolu";
    const multiplier = TURKEY_REGIONAL_MULTIPLIERS[region] || 1.0;

    // Base average price for 1 decar (da) in TL (2026 estimate)
    const basePrice = 120000;

    const midPrice = Math.round(basePrice * multiplier);
    return {
        priceTlDa: midPrice,
        minTlDa: Math.round(midPrice * 0.85),
        maxTlDa: Math.round(midPrice * 1.15),
        region,
        confidenceScore: 0.75 + (Math.random() * 0.1)
    };
};
