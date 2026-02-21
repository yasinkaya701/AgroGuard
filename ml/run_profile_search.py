import argparse
import json
import subprocess
import sys
from pathlib import Path


PROFILES = ["fast", "balanced", "max"]


def load_report(path: Path):
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except Exception:
        return None


def score(report):
    if not report:
        return -1.0
    s = report.get("summary", {})
    if int(s.get("trials", 0)) <= 0:
        return -1.0
    mean = float(s.get("selection_score_mean", 0.0))
    std = float(s.get("selection_score_std", 1.0))
    # Higher mean, lower std is preferred.
    return mean - 0.5 * std


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--base-out-dir", default="ml/artifacts/trials")
    parser.add_argument("--seeds", default="41,42,43")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--train-args", default="")
    args = parser.parse_args()

    base_out = Path(args.base_out_dir)
    base_out.mkdir(parents=True, exist_ok=True)

    results = []
    for profile in PROFILES:
        cmd = [
            sys.executable,
            "ml/run_trials.py",
            "--data-dir",
            args.data_dir,
            "--base-out-dir",
            str(base_out),
            "--profile",
            profile,
            "--seeds",
            args.seeds,
        ]
        if args.train_args.strip():
            cmd += ["--train-args", args.train_args]
        if args.dry_run:
            cmd += ["--dry-run"]
        print("profile command:", " ".join(cmd))
        proc = subprocess.run(cmd, check=False)
        rep = load_report(base_out / f"consistency_report_{profile}.json")
        results.append(
            {
                "profile": profile,
                "returncode": proc.returncode,
                "report": rep,
                "ranking_score": score(rep),
            }
        )

    ranked = sorted(results, key=lambda x: float(x.get("ranking_score", -1)), reverse=True)
    winner = ranked[0]["profile"] if ranked and ranked[0].get("ranking_score", -1.0) >= 0 else None
    payload = {
        "winner": winner,
        "ranked": [
            {
                "profile": row["profile"],
                "returncode": row["returncode"],
                "ranking_score": row["ranking_score"],
                "summary": (row.get("report") or {}).get("summary", {}),
            }
            for row in ranked
        ],
    }
    out = base_out / "profile_search_report.json"
    out.write_text(json.dumps(payload, indent=2))
    print(json.dumps(payload, indent=2))
    print(f"report saved: {out}")


if __name__ == "__main__":
    main()
