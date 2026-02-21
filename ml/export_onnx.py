import argparse
import json
from pathlib import Path

import torch
from model_factory import build_model


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--img-size", type=int, default=224)
    parser.add_argument("--out", default="ml/artifacts/model.onnx")
    args = parser.parse_args()

    ckpt = torch.load(args.checkpoint, map_location="cpu")
    classes = ckpt["classes"]
    arch = ckpt["arch"]

    model = build_model(arch, len(classes), pretrained=False)
    model.load_state_dict(ckpt["model"])
    model.eval()

    dummy = torch.randn(1, 3, args.img_size, args.img_size)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    torch.onnx.export(
        model,
        dummy,
        out_path,
        input_names=["input"],
        output_names=["logits"],
        dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=17,
        dynamo=False,
    )

    labels_path = out_path.parent / "labels.json"
    with open(labels_path, "w") as f:
        json.dump(classes, f, indent=2)

    meta_path = out_path.parent / "model_meta.json"
    meta = {
        "arch": arch,
        "img_size": args.img_size,
        "num_classes": len(classes),
        "norm_mean": ckpt.get("norm_mean", [0.485, 0.456, 0.406]),
        "norm_std": ckpt.get("norm_std", [0.229, 0.224, 0.225])
    }
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)

    print(f"exported: {out_path}")
    print(f"labels: {labels_path}")
    print(f"meta: {meta_path}")


if __name__ == "__main__":
    main()
