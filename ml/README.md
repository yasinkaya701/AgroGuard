# ML Pipeline (Bitki Hastalik Tespiti)

Bu klasor, modeli egitmek ve ONNX olarak disari aktarmak icin gerekli scriptleri icerir.

## 1) Gereksinimler

Python 3.10+ onerilir.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r ml/requirements.txt
```

## 2) Veri Indirme

```bash
bash ml/download_plantvillage.sh
```

## 3) Veri Hazirligi

Beklenen veri klasor yapisi:

```
ml/data/plantvillage/
  train/
    Tomato___healthy/
    Tomato___Early_blight/
    Tomato___Late_blight/
    Tomato___Septoria_leaf_spot/
  val/
    Tomato___healthy/
    Tomato___Early_blight/
    Tomato___Late_blight/
    Tomato___Septoria_leaf_spot/
```

Ham dataset hazirsa su sekilde bol:

```bash
python ml/prepare_data.py \
  --raw-dir ml/data/raw \
  --out-dir ml/data/plantvillage \
  --val-ratio 0.2
```

Notlar:
- Bu MVP icin 4 sinifla basliyoruz (domates alt kumesi).
- Daha sonra baska siniflar eklemek icin sadece klasorleri genisletmen yeterli.

Sadece belirli sinif on ekleriyle calismak icin:

```bash
python ml/prepare_data.py \
  --raw-dir ml/data/raw \
  --out-dir ml/data/plantvillage \
  --val-ratio 0.2 \
  --include-prefix Tomato_ \
  --max-per-class 600
```

## 4) Egitim

```bash
python ml/train.py \
  --data-dir ml/data/plantvillage \
  --epochs 12 \
  --batch-size 32 \
  --img-size 224 \
  --model mobilenet_v3_small \
  --out-dir ml/artifacts
```

## 5) ONNX Export

```bash
python ml/export_onnx.py \
  --checkpoint ml/artifacts/best.pt \
  --img-size 224 \
  --out ml/artifacts/model.onnx
```

## 6) Backend Entegrasyonu

Export edilen modeli buraya kopyala:

```
server/model/model.onnx
server/model/labels.json
```

`labels.json` icinde sinif isimleri ve bakim adimlari bulunur.
