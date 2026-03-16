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

Hizli baseline:

```bash
python ml/train.py \
  --data-dir ml/data/plantvillage \
  --epochs 12 \
  --batch-size 32 \
  --img-size 224 \
  --model mobilenet_v3_small \
  --pretrained \
  --out-dir ml/artifacts
```

Ozellestirilmis CNN (yeni `agro_cnn`):

```bash
python ml/train.py \
  --data-dir ml/data/plantvillage \
  --epochs 30 \
  --batch-size 32 \
  --img-size 256 \
  --model agro_cnn \
  --balanced-sampler \
  --sampler-power 0.8 \
  --mixup 0.2 \
  --cutmix 0.2 \
  --target-encoding onehot \
  --loss soft_ce \
  --class-weight-method effective \
  --early-stop 8 \
  --early-stop-min-delta 0.0015 \
  --min-epochs 8 \
  --overfit-gap-threshold 0.12 \
  --overfit-patience 2 \
  --overfit-lr-decay 0.7 \
  --deterministic \
  --save-metrics \
  --out-dir ml/artifacts
```

Not:
- Egitim ciktilarinda `labels.json` ile birlikte `labels_meta.json` uretilir.
- `labels_meta.json` icinde sinif->index ve one-hot vektorleri bulunur.
- `agro_cnn_s`, `agro_cnn`, `agro_cnn_l` secenekleriyle hiz/kalite dengesi kurulabilir.

Yuksek dogruluk CNN (onerilen):

```bash
python ml/train.py \
  --data-dir ml/data/plantvillage \
  --epochs 24 \
  --batch-size 8 \
  --grad-accum 2 \
  --img-size 320 \
  --model convnext_large \
  --pretrained \
  --balanced-sampler \
  --sampler-power 0.8 \
  --freeze-epochs 2 \
  --warmup-epochs 2 \
  --randaugment-level 2 \
  --mixup 0.2 \
  --mixup-end 0.05 \
  --cutmix 0.3 \
  --cutmix-end 0.1 \
  --cutmix-prob 0.5 \
  --mixup-off-epochs 3 \
  --loss focal \
  --class-weight-method effective \
  --class-weight-beta 0.999 \
  --focal-gamma 2.0 \
  --tta 2 \
  --channels-last \
  --swa-start 16 \
  --swa-lr 1e-5 \
  --ema-decay-start 0.97 \
  --ema-warmup-epochs 1 \
  --backbone-lr-mult 0.6 \
  --head-lr-mult 1.0 \
  --progressive-resize \
  --img-size 256 \
  --final-img-size 384 \
  --resize-switch-epoch 8 \
  --save-every 4 \
  --label-smoothing 0.06 \
  --lr 2e-4 \
  --weight-decay 8e-5 \
  --save-metrics \
  --out-dir ml/artifacts
```

Egitimi kaldigi yerden devam ettirmek icin:

```bash
python ml/train.py \
  --data-dir ml/data/plantvillage \
  --resume ml/artifacts/last_training.pt \
  --epochs 24 \
  --out-dir ml/artifacts
```

Tutarlilik denemeleri (farkli seed ile):

```bash
python ml/run_trials.py \
  --data-dir ml/data/plantvillage \
  --base-out-dir ml/artifacts/trials \
  --seeds 41,42,43 \
  --train-args "--epochs 24 --model agro_cnn --img-size 256 --batch-size 16 --grad-accum 2 --tta 2 --target-encoding onehot --loss soft_ce --class-weight-method effective --deterministic --save-every 0"
```

Rapor: `ml/artifacts/trials/consistency_report.json`

Profil arama (fast/balanced/max) ve en tutarli profili secme:

```bash
python ml/run_profile_search.py \
  --data-dir ml/data/plantvillage \
  --base-out-dir ml/artifacts/trials \
  --seeds 41,42,43
```

Rapor: `ml/artifacts/trials/profile_search_report.json`

Not:
- `convnext_large` en guclu secenektir fakat daha fazla GPU bellegi ister.
- Bellek yetmezse `--model convnext_base --img-size 288 --batch-size 16` kullan.

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
server/model/labels_meta.json
server/model/model_meta.json
```

- `labels.json`: Sinif isimleri listesi (model cikti indeksiyle ayni sirada olmali).
- `labels_meta.json`: Sinif bazli Turkce aciklama, severity, actions (bakim adimlari).
- `model_meta.json`: img_size, norm_mean, norm_std, bitki/esik ayarlari (min_confidence, min_margin).

### Uretim modeli senkronu

Tek bir “production” artifact klasoru kullanip backend’i oradan beslemek onerilir:

1. Egitim sonrasi: `ml/artifacts/<run_id>/` altinda `model.onnx`, `labels.json`, `labels_meta.json`, `run_config.json`, `metrics.json` uretilir.
2. Uretim icin secilen run’in bu dosyalarini `server/model/` klasorune kopyalayin (elle veya `scripts/deploy_model.sh` ile).
3. `server/model/labels.json` ile `ml/artifacts` icindeki secili run’in `labels.json` icerigi birebir ayni olmali; aksi halde tahmin indeksleri yanlis eslesir.
