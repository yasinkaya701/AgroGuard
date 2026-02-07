import argparse
import random
import shutil
from pathlib import Path


def ensure_dir(path: Path):
    path.mkdir(parents=True, exist_ok=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-dir", required=True, help="Ham dataset klasoru")
    parser.add_argument("--out-dir", required=True, help="Cikti klasoru")
    parser.add_argument("--val-ratio", type=float, default=0.2)
    parser.add_argument(
        "--include-prefix",
        action="append",
        default=[],
        help="Sadece belirli sinif on eklerini dahil et (or: Tomato_).",
    )
    parser.add_argument("--max-per-class", type=int, default=0)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    random.seed(args.seed)
    raw_dir = Path(args.raw_dir)
    out_dir = Path(args.out_dir)

    if not raw_dir.exists():
        raise FileNotFoundError(f"raw-dir not found: {raw_dir}")

    classes = [p for p in raw_dir.iterdir() if p.is_dir()]
    if args.include_prefix:
        classes = [
            p for p in classes if any(p.name.startswith(prefix) for prefix in args.include_prefix)
        ]
    if not classes:
        raise RuntimeError("raw-dir icinde sinif klasoru bulunamadi.")

    for cls_dir in classes:
        images = [p for p in cls_dir.iterdir() if p.is_file()]
        if not images:
            continue

        random.shuffle(images)
        if args.max_per_class > 0:
            images = images[: args.max_per_class]
        split = int(len(images) * (1 - args.val_ratio))
        train_images = images[:split]
        val_images = images[split:]

        train_out = out_dir / "train" / cls_dir.name
        val_out = out_dir / "val" / cls_dir.name
        ensure_dir(train_out)
        ensure_dir(val_out)

        for img in train_images:
            shutil.copy2(img, train_out / img.name)
        for img in val_images:
            shutil.copy2(img, val_out / img.name)

    print(f"hazir: {out_dir}")


if __name__ == "__main__":
    main()
