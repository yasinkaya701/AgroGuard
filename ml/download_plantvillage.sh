#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RAW_DIR="$ROOT_DIR/ml/data/raw"
TMP_DIR="$ROOT_DIR/ml/data/.plantvillage_tmp"

echo "Preparing directories..."
mkdir -p "$RAW_DIR"
rm -rf "$TMP_DIR"

echo "Cloning PlantVillage dataset (this can be large)..."
git clone --depth 1 https://github.com/spMohanty/PlantVillage-Dataset "$TMP_DIR"

SRC_DIR="$TMP_DIR/raw/color"
if [[ ! -d "$SRC_DIR" ]]; then
  echo "ERROR: Expected dataset not found at $SRC_DIR"
  exit 1
fi

echo "Copying dataset to $RAW_DIR ..."
rsync -a --delete "$SRC_DIR/" "$RAW_DIR/"

echo "Cleaning up..."
rm -rf "$TMP_DIR"

echo "Done. Raw data ready at $RAW_DIR"
