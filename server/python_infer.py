import argparse
import json
from pathlib import Path

import torch
from PIL import Image
from torchvision import models, transforms


def build_model(name: str, num_classes: int):
    if name == "efficientnet_v2_s":
        model = models.efficientnet_v2_s(weights=None)
        in_features = model.classifier[1].in_features
        model.classifier[1] = torch.nn.Linear(in_features, num_classes)
        return model
    if name == "convnext_tiny":
        model = models.convnext_tiny(weights=None)
        in_features = model.classifier[2].in_features
        model.classifier[2] = torch.nn.Linear(in_features, num_classes)
        return model
    if name == "mobilenet_v3_small":
        model = models.mobilenet_v3_small(weights=None)
        in_features = model.classifier[3].in_features
        model.classifier[3] = torch.nn.Linear(in_features, num_classes)
        return model
    raise ValueError(f"Unknown model: {name}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--checkpoint", required=True)
    args = parser.parse_args()

    ckpt = torch.load(args.checkpoint, map_location="cpu")
    classes = ckpt["classes"]
    arch = ckpt["arch"]
    img_size = ckpt.get("img_size", 224)

    model = build_model(arch, len(classes))
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
