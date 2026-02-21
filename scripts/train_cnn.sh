#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PY_BIN="${PY_BIN:-.venv/bin/python}"
if [[ ! -x "$PY_BIN" ]]; then
  PY_BIN="${PY_BIN_FALLBACK:-python3}"
fi

if ! "$PY_BIN" - <<'PY' >/dev/null 2>&1
import importlib.util
ok = bool(importlib.util.find_spec("torch")) and bool(importlib.util.find_spec("torchvision"))
raise SystemExit(0 if ok else 1)
PY
then
  echo "Torch/torchvision bulunamadi. Once su komutu calistir:"
  echo "  .venv/bin/pip install -r ml/requirements.txt"
  exit 1
fi

OUT_DIR="${OUT_DIR:-ml/artifacts/cnn_latest}"
DATA_DIR="${DATA_DIR:-ml/data/plantvillage}"
MODEL="${MODEL:-agro_cnn_l}"

exec "$PY_BIN" ml/train.py \
  --data-dir "$DATA_DIR" \
  --epochs "${EPOCHS:-24}" \
  --batch-size "${BATCH_SIZE:-12}" \
  --img-size "${IMG_SIZE:-256}" \
  --model "$MODEL" \
  --balanced-sampler \
  --sampler-power "${SAMPLER_POWER:-0.8}" \
  --mixup "${MIXUP:-0.2}" \
  --mixup-end "${MIXUP_END:-0.05}" \
  --cutmix "${CUTMIX:-0.2}" \
  --cutmix-end "${CUTMIX_END:-0.05}" \
  --target-encoding onehot \
  --loss soft_ce \
  --class-weight-method effective \
  --early-stop "${EARLY_STOP:-8}" \
  --min-epochs "${MIN_EPOCHS:-8}" \
  --tta "${TTA:-2}" \
  --deterministic \
  --save-metrics \
  --out-dir "$OUT_DIR"
