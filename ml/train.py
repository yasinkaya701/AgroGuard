import argparse
import json
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, WeightedRandomSampler
from torchvision import datasets, models, transforms
from tqdm import tqdm


def set_seed(seed: int):
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def build_transforms(img_size: int):
    train_tf = transforms.Compose(
        [
            transforms.RandomResizedCrop(img_size, scale=(0.75, 1.0)),
            transforms.RandomHorizontalFlip(),
            transforms.RandomVerticalFlip(p=0.15),
            transforms.RandomRotation(12),
            transforms.ColorJitter(brightness=0.25, contrast=0.25, saturation=0.2),
            transforms.RandomPerspective(distortion_scale=0.2, p=0.2),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
            transforms.RandomErasing(p=0.2, scale=(0.02, 0.12), ratio=(0.3, 3.3)),
        ]
    )
    val_tf = transforms.Compose(
        [
            transforms.Resize((img_size, img_size)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )
    return train_tf, val_tf


def build_model(name: str, num_classes: int, pretrained: bool):
    if name == "efficientnet_v2_s":
        weights = "DEFAULT" if pretrained else None
        model = models.efficientnet_v2_s(weights=weights)
        in_features = model.classifier[1].in_features
        model.classifier[1] = nn.Linear(in_features, num_classes)
        return model
    if name == "convnext_tiny":
        weights = "DEFAULT" if pretrained else None
        model = models.convnext_tiny(weights=weights)
        in_features = model.classifier[2].in_features
        model.classifier[2] = nn.Linear(in_features, num_classes)
        return model
    if name == "mobilenet_v3_small":
        weights = "DEFAULT" if pretrained else None
        model = models.mobilenet_v3_small(weights=weights)
        in_features = model.classifier[3].in_features
        model.classifier[3] = nn.Linear(in_features, num_classes)
        return model
    raise ValueError(f"Unknown model: {name}")


def compute_class_weights(dataset):
    counts = np.bincount(dataset.targets)
    weights = 1.0 / (counts + 1e-6)
    weights = weights / weights.mean()
    return torch.tensor(weights, dtype=torch.float32)


def build_sampler(dataset):
    counts = np.bincount(dataset.targets)
    weights = 1.0 / (counts + 1e-6)
    sample_weights = weights[dataset.targets]
    return WeightedRandomSampler(sample_weights, num_samples=len(sample_weights), replacement=True)


def mixup_batch(images, labels, alpha):
    if alpha <= 0:
        return images, labels, None, 1.0
    lam = np.random.beta(alpha, alpha)
    idx = torch.randperm(images.size(0), device=images.device)
    mixed = lam * images + (1 - lam) * images[idx]
    return mixed, labels, labels[idx], lam


def accuracy_topk(outputs, targets, k=3):
    _, pred = outputs.topk(k, 1, True, True)
    correct = pred.eq(targets.view(-1, 1).expand_as(pred))
    return correct.any(dim=1).float().mean().item()


class EMA:
    def __init__(self, model, decay=0.995):
        self.decay = decay
        self.shadow = {k: v.detach().clone() for k, v in model.state_dict().items()}

    def update(self, model):
        with torch.no_grad():
            for k, v in model.state_dict().items():
                self.shadow[k].mul_(self.decay).add_(v.detach(), alpha=1 - self.decay)

    def apply_to(self, model):
        model.load_state_dict(self.shadow, strict=False)


def set_backbone_trainable(model, trainable: bool):
    for name, param in model.named_parameters():
        if "classifier" in name:
            param.requires_grad = True
        else:
            param.requires_grad = trainable


def train_one_epoch(model, loader, criterion, optimizer, device, scaler, mixup_alpha):
    model.train()
    running_loss = 0.0
    correct = 0
    total = 0

    for images, labels in tqdm(loader, desc="train", leave=False):
        images = images.to(device)
        labels = labels.to(device)

        optimizer.zero_grad(set_to_none=True)
        images, targets_a, targets_b, lam = mixup_batch(images, labels, mixup_alpha)
        with torch.cuda.amp.autocast(enabled=scaler is not None):
            outputs = model(images)
            if targets_b is not None:
                loss = lam * criterion(outputs, targets_a) + (1 - lam) * criterion(outputs, targets_b)
            else:
                loss = criterion(outputs, targets_a)

        if scaler:
            scaler.scale(loss).backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            scaler.step(optimizer)
            scaler.update()
        else:
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()

        running_loss += loss.item() * images.size(0)
        _, preds = torch.max(outputs, 1)
        correct += (preds == labels).sum().item()
        total += labels.size(0)

    return running_loss / total, correct / total


@torch.no_grad()
def evaluate(model, loader, criterion, device):
    model.eval()
    running_loss = 0.0
    correct = 0
    total = 0
    top3 = 0.0

    for images, labels in tqdm(loader, desc="val", leave=False):
        images = images.to(device)
        labels = labels.to(device)
        outputs = model(images)
        loss = criterion(outputs, labels)

        running_loss += loss.item() * images.size(0)
        _, preds = torch.max(outputs, 1)
        correct += (preds == labels).sum().item()
        total += labels.size(0)
        top3 += accuracy_topk(outputs, labels, k=3) * labels.size(0)

    return running_loss / total, correct / total, top3 / total


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--epochs", type=int, default=18)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--img-size", type=int, default=224)
    parser.add_argument("--model", default="efficientnet_v2_s")
    parser.add_argument("--out-dir", default="ml/artifacts")
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--pretrained", action="store_true")
    parser.add_argument("--label-smoothing", type=float, default=0.05)
    parser.add_argument("--mixup", type=float, default=0.2)
    parser.add_argument("--early-stop", type=int, default=6)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--balanced-sampler", action="store_true")
    parser.add_argument("--freeze-epochs", type=int, default=2)
    parser.add_argument("--ema-decay", type=float, default=0.995)
    parser.add_argument("--save-metrics", action="store_true")
    args = parser.parse_args()

    set_seed(args.seed)

    data_dir = Path(args.data_dir)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    train_tf, val_tf = build_transforms(args.img_size)
    train_set = datasets.ImageFolder(data_dir / "train", transform=train_tf)
    val_set = datasets.ImageFolder(data_dir / "val", transform=val_tf)

    num_classes = len(train_set.classes)
    with open(out_dir / "labels.json", "w") as f:
        json.dump(train_set.classes, f, indent=2)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    num_workers = 4 if device == "cuda" else 0
    pin_memory = device == "cuda"

    sampler = build_sampler(train_set) if args.balanced_sampler else None
    train_loader = DataLoader(
        train_set,
        batch_size=args.batch_size,
        shuffle=sampler is None,
        sampler=sampler,
        num_workers=num_workers,
        pin_memory=pin_memory,
    )
    val_loader = DataLoader(
        val_set,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=pin_memory,
    )

    model = build_model(args.model, num_classes, args.pretrained).to(device)

    class_weights = compute_class_weights(train_set).to(device)
    criterion = nn.CrossEntropyLoss(weight=class_weights, label_smoothing=args.label_smoothing)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    scaler = torch.cuda.amp.GradScaler() if device == "cuda" else None
    ema = EMA(model, decay=args.ema_decay) if args.ema_decay > 0 else None

    best_acc = 0.0
    best_epoch = 0
    patience = 0
    metrics = []

    for epoch in range(args.epochs):
        set_backbone_trainable(model, epoch >= args.freeze_epochs)

        train_loss, train_acc = train_one_epoch(
            model, train_loader, criterion, optimizer, device, scaler, args.mixup
        )

        if ema:
            ema.update(model)
            ema_model = build_model(args.model, num_classes, False).to(device)
            ema.apply_to(ema_model)
            val_loss, val_acc, val_top3 = evaluate(ema_model, val_loader, criterion, device)
        else:
            val_loss, val_acc, val_top3 = evaluate(model, val_loader, criterion, device)

        scheduler.step()

        metrics.append(
            {
                "epoch": epoch + 1,
                "train_loss": train_loss,
                "train_acc": train_acc,
                "val_loss": val_loss,
                "val_acc": val_acc,
                "val_top3": val_top3,
            }
        )

        print(
            f"epoch {epoch + 1}/{args.epochs} "
            f"train_loss={train_loss:.4f} train_acc={train_acc:.4f} "
            f"val_loss={val_loss:.4f} val_acc={val_acc:.4f} val_top3={val_top3:.4f}"
        )

        if val_acc > best_acc:
            best_acc = val_acc
            best_epoch = epoch + 1
            patience = 0
            torch.save(
                {
                    "model": model.state_dict(),
                    "classes": train_set.classes,
                    "img_size": args.img_size,
                    "arch": args.model,
                    "best_acc": best_acc,
                    "best_top3": val_top3,
                    "norm_mean": [0.485, 0.456, 0.406],
                    "norm_std": [0.229, 0.224, 0.225],
                },
                out_dir / "best.pt",
            )
        else:
            patience += 1

        if args.early_stop and patience >= args.early_stop:
            print("early_stop triggered")
            break

    if args.save_metrics:
        with open(out_dir / "metrics.json", "w") as f:
            json.dump(metrics, f, indent=2)

    print(f"best_val_acc={best_acc:.4f} at epoch {best_epoch}")


if __name__ == "__main__":
    main()
