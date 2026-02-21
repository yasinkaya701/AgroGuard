import argparse
import json
import statistics
import subprocess
import sys
from pathlib import Path


PROFILE_ARGS = {
    "fast": "--epochs 8 --model agro_cnn_s --img-size 224 --batch-size 16 --grad-accum 1 --target-encoding onehot --loss soft_ce --class-weight-method effective --deterministic --save-every 0",
    "balanced": "--epochs 16 --model agro_cnn --img-size 256 --batch-size 16 --grad-accum 2 --mixup 0.2 --mixup-end 0.05 --cutmix 0.2 --cutmix-end 0.05 --target-encoding onehot --loss soft_ce --class-weight-method effective --progressive-resize --final-img-size 320 --tta 2 --deterministic --save-every 0",
    "max": "--epochs 24 --model agro_cnn_l --img-size 256 --batch-size 12 --grad-accum 2 --mixup 0.25 --mixup-end 0.05 --cutmix 0.25 --cutmix-end 0.05 --target-encoding onehot --loss soft_ce --class-weight-method effective --progressive-resize --final-img-size 384 --tta 2 --ema-decay 0.996 --swa-start 16 --swa-lr 1e-5 --deterministic --save-every 0",
}


def parse_seed_list(raw: str):
    items = []
    for token in str(raw or "").split(","):
        token = token.strip()
        if not token:
            continue
        items.append(int(token))
    if not items:
        raise ValueError("At least one seed is required.")
    return items


def read_metrics(path: Path):
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text())
    except Exception:
        return None
    if not isinstance(data, list) or not data:
        return None
    best = max(
        data,
        key=lambda row: float(row.get("val_acc", 0.0)) * 0.7 + float(row.get("val_macro_f1", 0.0)) * 0.3,
    )
    return {
        "best_epoch": int(best.get("epoch", 0)),
        "val_acc": float(best.get("val_acc", 0.0)),
        "val_macro_f1": float(best.get("val_macro_f1", 0.0)),
        "val_top3": float(best.get("val_top3", 0.0)),
        "selection_score": float(best.get("val_acc", 0.0)) * 0.7 + float(best.get("val_macro_f1", 0.0)) * 0.3,
    }


def summarize(rows):
    accs = [row["val_acc"] for row in rows]
    f1s = [row["val_macro_f1"] for row in rows]
    scores = [row["selection_score"] for row in rows]
    result = {
        "trials": len(rows),
        "val_acc_mean": statistics.mean(accs),
        "val_acc_std": statistics.pstdev(accs) if len(accs) > 1 else 0.0,
        "val_macro_f1_mean": statistics.mean(f1s),
        "val_macro_f1_std": statistics.pstdev(f1s) if len(f1s) > 1 else 0.0,
        "selection_score_mean": statistics.mean(scores),
        "selection_score_std": statistics.pstdev(scores) if len(scores) > 1 else 0.0,
        "consistency_index": max(0.0, 1.0 - (statistics.pstdev(scores) if len(scores) > 1 else 0.0)),
    }
    return result


def parse_extra_args(profile: str, train_args: str):
    base = PROFILE_ARGS.get(profile, "")
    merged = " ".join([base, str(train_args or "").strip()]).strip()
    return [token for token in merged.split(" ") if token.strip()]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--base-out-dir", default="ml/artifacts/trials")
    parser.add_argument("--seeds", default="41,42,43")
    parser.add_argument("--profile", choices=["fast", "balanced", "max"], default="balanced")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--train-args", default="")
    args = parser.parse_args()

    seeds = parse_seed_list(args.seeds)
    base_out = Path(args.base_out_dir)
    base_out.mkdir(parents=True, exist_ok=True)

    extra_args = parse_extra_args(args.profile, args.train_args)
    trial_rows = []
    failed_trials = []

    for seed in seeds:
        out_dir = base_out / f"{args.profile}_seed_{seed}"
        out_dir.mkdir(parents=True, exist_ok=True)
        cmd = [
            sys.executable,
            "ml/train.py",
            "--data-dir",
            args.data_dir,
            "--out-dir",
            str(out_dir),
            "--seed",
            str(seed),
            "--save-metrics",
            *extra_args,
        ]
        print(f"[{args.profile}] trial command:", " ".join(cmd))
        if args.dry_run:
            continue
        proc = subprocess.run(cmd, check=False)
        if proc.returncode != 0:
            print(f"trial failed for seed={seed} (code={proc.returncode})")
            failed_trials.append({"seed": seed, "returncode": proc.returncode})
            continue
        metrics = read_metrics(out_dir / "metrics.json")
        if not metrics:
            print(f"metrics missing for seed={seed}")
            continue
        metrics["seed"] = seed
        trial_rows.append(metrics)

    if args.dry_run:
        print("dry-run complete")
        return

    if not trial_rows:
        payload = {
            "profile": args.profile,
            "summary": {
                "trials": 0,
                "val_acc_mean": 0.0,
                "val_acc_std": 0.0,
                "val_macro_f1_mean": 0.0,
                "val_macro_f1_std": 0.0,
                "selection_score_mean": 0.0,
                "selection_score_std": 0.0,
                "consistency_index": 0.0,
            },
            "trials": [],
            "failed_trials": failed_trials,
            "note": "no_successful_trial",
        }
        report_path = base_out / f"consistency_report_{args.profile}.json"
        report_path.write_text(json.dumps(payload, indent=2))
        (base_out / "consistency_report.json").write_text(json.dumps(payload, indent=2))
        print("no successful trial")
        print(f"report saved: {report_path}")
        return

    summary = summarize(trial_rows)
    payload = {"profile": args.profile, "summary": summary, "trials": trial_rows, "failed_trials": failed_trials}
    report_path = base_out / f"consistency_report_{args.profile}.json"
    report_path.write_text(json.dumps(payload, indent=2))
    (base_out / "consistency_report.json").write_text(json.dumps(payload, indent=2))
    print(json.dumps(payload, indent=2))
    print(f"report saved: {report_path}")


if __name__ == "__main__":
    main()
