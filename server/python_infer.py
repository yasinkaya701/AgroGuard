import argparse
import json
import sys
from pathlib import Path

import torch
from PIL import Image
from torchvision import transforms

ROOT_DIR = Path(__file__).resolve().parents[1]
ML_DIR = ROOT_DIR / "ml"
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

from model_factory import build_model


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--checkpoint", required=True)
    args = parser.parse_args()

    ckpt = torch.load(args.checkpoint, map_location="cpu")
    classes = ckpt["classes"]
    arch = ckpt["arch"]
    img_size = ckpt.get("img_size", 224)

    model = build_model(arch, len(classes), pretrained=False)
    model.load_state_dict(ckpt["model"])
    model.eval()

    tf = transforms.Compose(
        [
            transforms.Resize((img_size, img_size)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )

    image = Image.open(args.image).convert("RGB")
    tensor = tf(image).unsqueeze(0)

    with torch.no_grad():
        logits = model(tensor)
        probs = torch.softmax(logits, dim=1)[0]

    conf, idx = torch.max(probs, dim=0)
    result = {"label": classes[int(idx)], "confidence": float(conf)}
    print(json.dumps(result))


if __name__ == "__main__":
    main()
