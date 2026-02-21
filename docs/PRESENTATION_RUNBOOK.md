# Presentation Runbook

## 1) Quick readiness

```bash
npm run presentation:check
```

Output: `reports/presentation-check.json`

## 2) Full demo startup

```bash
npm run server
npm run start:web
```

Frontend: `http://localhost:3000`  
API: `http://127.0.0.1:5051`

## 3) Investor flow in UI

1. Open `Demo` tab.
2. Open `Yatirimci sunum modulu`.
3. Run:
   - `Yatirimci vitrinini calistir`
   - `Preflight kontrolu`
   - `Sunum moduna gec`
4. Export:
   - `Yatirimci ozeti indir`
   - `Deck HTML indir`

## 4) CNN consistency trials

```bash
python ml/run_trials.py \
  --data-dir ml/data/plantvillage \
  --base-out-dir ml/artifacts/trials \
  --seeds 41,42,43 \
  --train-args "--epochs 18 --model convnext_large --pretrained --img-size 320 --batch-size 8 --grad-accum 2 --tta 2 --progressive-resize --final-img-size 384 --save-every 0"
```

Report: `ml/artifacts/trials/consistency_report.json`
