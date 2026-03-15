import argparse
import json
import math
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.optim.swa_utils import AveragedModel, SWALR, update_bn
from torch.utils.data import DataLoader, WeightedRandomSampler
from torchvision import datasets, transforms
from tqdm import tqdm
from model_factory import MODEL_CHOICES, build_model


def set_seed(seed: int):
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def set_deterministic_mode(enabled: bool):
    if not enabled:
        return
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False
    try:
        torch.use_deterministic_algorithms(True, warn_only=True)
    except Exception:
        pass


def seed_worker(worker_id):
    # Ensure each dataloader worker has deterministic numpy/python seeds.
    worker_seed = torch.initial_seed() % (2**32)
    np.random.seed(worker_seed)


def build_transforms(img_size: int, randaugment_level: int = 2):
    train_ops = [
        transforms.RandomResizedCrop(img_size, scale=(0.75, 1.0)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomVerticalFlip(p=0.15),
        transforms.RandomRotation(12),
        transforms.ColorJitter(brightness=0.25, contrast=0.25, saturation=0.2),
        transforms.RandomPerspective(distortion_scale=0.2, p=0.2),
    ]
    if randaugment_level > 0:
        train_ops.append(transforms.RandAugment(num_ops=2, magnitude=randaugment_level))
    train_ops.extend(
        [
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
            transforms.RandomErasing(p=0.2, scale=(0.02, 0.12), ratio=(0.3, 3.3)),
        ]
    )
    train_tf = transforms.Compose(
        train_ops
    )
    val_tf = transforms.Compose(
        [
            transforms.Resize((img_size, img_size)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )
    return train_tf, val_tf


def build_progressive_sizes(base_size: int, final_size: int):
    base = int(base_size)
    final = int(final_size)
    if final <= base:
        return [base]
    mid = int(round((base + final) / 2))
    return sorted(list({base, mid, final}))


def linear_schedule(start, end, progress):
    p = max(0.0, min(1.0, float(progress)))
    return float(start) + (float(end) - float(start)) * p


def one_hot_encode(indices, num_classes):
    return torch.nn.functional.one_hot(indices.long(), num_classes=num_classes).float()


def save_label_artifacts(classes, out_dir: Path):
    class_to_idx = {name: idx for idx, name in enumerate(classes)}
    with open(out_dir / "labels.json", "w") as f:
        json.dump(classes, f, indent=2)
    labels_meta = {
        "encoding": "onehot",
        "num_classes": len(classes),
        "classes": classes,
        "class_to_idx": class_to_idx,
        "idx_to_class": {str(idx): name for name, idx in class_to_idx.items()},
        "one_hot_vectors": {
            name: [1 if i == idx else 0 for i in range(len(classes))]
            for name, idx in class_to_idx.items()
        },
    }
    with open(out_dir / "labels_meta.json", "w") as f:
        json.dump(labels_meta, f, indent=2)


def save_training_checkpoint(
    path,
    epoch,
    model,
    optimizer,
    scheduler,
    scaler,
    ema,
    best_acc,
    best_macro_f1,
    best_val_loss,
    best_epoch,
    args,
):
    payload = {
        "epoch": int(epoch),
        "model": {k: v.detach().cpu() for k, v in model.state_dict().items()},
        "optimizer": optimizer.state_dict() if optimizer is not None else None,
        "scheduler": scheduler.state_dict() if scheduler is not None else None,
        "scaler": scaler.state_dict() if scaler is not None else None,
        "ema_shadow": {k: v.detach().cpu() for k, v in ema.shadow.items()} if ema is not None else None,
        "best_acc": float(best_acc),
        "best_macro_f1": float(best_macro_f1),
        "best_val_loss": float(best_val_loss),
        "best_epoch": int(best_epoch),
        "args": vars(args),
    }
    torch.save(payload, path)


def compute_class_weights(dataset, method="inverse", beta=0.999, power=1.0):
    counts = np.bincount(dataset.targets).astype(np.float64)
    method = str(method or "inverse").lower()
    if method == "none":
        return None
    if method == "effective":
        beta = float(max(0.0, min(beta, 0.999999)))
        effective_num = 1.0 - np.power(beta, counts)
        weights = (1.0 - beta) / np.clip(effective_num, 1e-12, None)
    else:
        weights = 1.0 / np.power(counts + 1e-6, max(0.0, float(power)))
    weights = weights / np.clip(weights.mean(), 1e-12, None)
    return torch.tensor(weights, dtype=torch.float32)


def build_sampler(dataset):
    counts = np.bincount(dataset.targets)
    weights = 1.0 / (counts + 1e-6)
    sample_weights = weights[dataset.targets]
    return WeightedRandomSampler(sample_weights, num_samples=len(sample_weights), replacement=True)


def build_sampler_with_power(dataset, power=1.0):
    counts = np.bincount(dataset.targets)
    weights = 1.0 / np.power(counts + 1e-6, max(0.0, float(power)))
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
    k = max(1, min(int(k), int(outputs.size(1))))
    _, pred = outputs.topk(k, 1, True, True)
    correct = pred.eq(targets.view(-1, 1).expand_as(pred))
    return correct.any(dim=1).float().mean().item()


class EMA:
    def __init__(self, model, decay=0.995):
        self.decay = decay
        self.shadow = {k: v.detach().clone() for k, v in model.state_dict().items()}

    def update(self, model, decay=None):
        active_decay = self.decay if decay is None else float(decay)
        with torch.no_grad():
            for k, v in model.state_dict().items():
                if k not in self.shadow:
                    self.shadow[k] = v.detach().clone()
                    continue
                src = v.detach()
                dst = self.shadow[k]
                # Non-floating buffers (e.g. BN num_batches_tracked) cannot be EMA-updated.
                if not torch.is_floating_point(src):
                    self.shadow[k] = src.clone()
                    continue
                if not torch.is_floating_point(dst):
                    dst = dst.float()
                self.shadow[k] = dst.mul(active_decay).add(src, alpha=1 - active_decay)

    def apply_to(self, model):
        model.load_state_dict(self.shadow, strict=False)


class FocalLoss(nn.Module):
    def __init__(self, gamma=2.0, alpha=1.0, weight=None):
        super().__init__()
        self.gamma = gamma
        self.alpha = alpha
        self.weight = weight

    def forward(self, logits, targets):
        ce = nn.functional.cross_entropy(logits, targets, weight=self.weight, reduction="none")
        pt = torch.exp(-ce)
        focal = self.alpha * ((1 - pt) ** self.gamma) * ce
        return focal.mean()


class SoftTargetCrossEntropy(nn.Module):
    def __init__(self, class_weight=None):
        super().__init__()
        self.class_weight = class_weight

    def forward(self, logits, soft_targets):
        log_probs = nn.functional.log_softmax(logits, dim=1)
        targets = soft_targets
        if self.class_weight is not None:
            w = self.class_weight.view(1, -1)
            targets = targets * w
            norm = targets.sum(dim=1, keepdim=True).clamp(min=1e-8)
            targets = targets / norm
        loss = -(targets * log_probs).sum(dim=1)
        return loss.mean()


def compute_loss(criterion, outputs, targets_a, targets_b, lam, target_encoding, num_classes):
    if target_encoding == "onehot":
        targets_a = one_hot_encode(targets_a, num_classes=num_classes).to(outputs.device)
        if targets_b is not None:
            targets_b = one_hot_encode(targets_b, num_classes=num_classes).to(outputs.device)
            return lam * criterion(outputs, targets_a) + (1 - lam) * criterion(outputs, targets_b)
        return criterion(outputs, targets_a)
    if targets_b is not None:
        return lam * criterion(outputs, targets_a) + (1 - lam) * criterion(outputs, targets_b)
    return criterion(outputs, targets_a)


def set_backbone_trainable(model, trainable: bool):
    for name, param in model.named_parameters():
        if "classifier" in name or name.startswith("fc.") or name.startswith("head."):
            param.requires_grad = True
        else:
            param.requires_grad = trainable


def is_norm_param_name(name: str):
    name = name.lower()
    return any(token in name for token in ["norm", "bn", "ln", "gn"])


def is_head_param_name(name: str):
    return ("classifier" in name) or name.startswith("fc.") or name.startswith("head.")


def build_param_groups(model, lr, weight_decay, backbone_lr_mult=0.6, head_lr_mult=1.0):
    groups = {
        "backbone_decay": {"params": [], "lr": lr * backbone_lr_mult, "weight_decay": weight_decay},
        "backbone_nodecay": {"params": [], "lr": lr * backbone_lr_mult, "weight_decay": 0.0},
        "head_decay": {"params": [], "lr": lr * head_lr_mult, "weight_decay": weight_decay},
        "head_nodecay": {"params": [], "lr": lr * head_lr_mult, "weight_decay": 0.0},
    }
    for name, param in model.named_parameters():
        if not param.requires_grad:
            continue
        is_head = is_head_param_name(name)
        no_decay = name.endswith(".bias") or is_norm_param_name(name)
        key = ("head_" if is_head else "backbone_") + ("nodecay" if no_decay else "decay")
        groups[key]["params"].append(param)
    return [cfg for cfg in groups.values() if cfg["params"]]


def rand_bbox(size, lam):
    h, w = size[2], size[3]
    cut_ratio = np.sqrt(1.0 - lam)
    cut_w = int(w * cut_ratio)
    cut_h = int(h * cut_ratio)

    cx = np.random.randint(0, w)
    cy = np.random.randint(0, h)

    x1 = np.clip(cx - cut_w // 2, 0, w)
    y1 = np.clip(cy - cut_h // 2, 0, h)
    x2 = np.clip(cx + cut_w // 2, 0, w)
    y2 = np.clip(cy + cut_h // 2, 0, h)
    return x1, y1, x2, y2


def apply_mixup_or_cutmix(images, labels, mixup_alpha, cutmix_alpha, cutmix_prob):
    use_cutmix = cutmix_alpha > 0 and np.random.rand() < cutmix_prob
    if use_cutmix:
        lam = np.random.beta(cutmix_alpha, cutmix_alpha)
        idx = torch.randperm(images.size(0), device=images.device)
        x1, y1, x2, y2 = rand_bbox(images.size(), lam)
        images[:, :, y1:y2, x1:x2] = images[idx, :, y1:y2, x1:x2]
        lam = 1 - ((x2 - x1) * (y2 - y1) / (images.size(-1) * images.size(-2)))
        return images, labels, labels[idx], lam
    return mixup_batch(images, labels, mixup_alpha)


def build_warmup_cosine_scheduler(optimizer, total_steps, warmup_steps):
    def lr_lambda(step):
        if step < warmup_steps:
            return float(step + 1) / float(max(1, warmup_steps))
        progress = float(step - warmup_steps) / float(max(1, total_steps - warmup_steps))
        return 0.5 * (1.0 + math.cos(math.pi * progress))

    return torch.optim.lr_scheduler.LambdaLR(optimizer, lr_lambda=lr_lambda)


def train_one_epoch(
    model,
    loader,
    criterion,
    optimizer,
    device,
    scaler,
    mixup_alpha,
    cutmix_alpha,
    cutmix_prob,
    grad_accum,
    ema=None,
    ema_active=True,
    ema_decay=None,
    scheduler=None,
    target_encoding="index",
    num_classes=1,
):
    model.train()
    running_loss = 0.0
    correct = 0
    total = 0
    optimizer.zero_grad(set_to_none=True)

    for step_idx, (images, labels) in enumerate(tqdm(loader, desc="train", leave=False), start=1):
        images = images.to(device)
        labels = labels.to(device)

        images, targets_a, targets_b, lam = apply_mixup_or_cutmix(
            images, labels, mixup_alpha, cutmix_alpha, cutmix_prob
        )
        with torch.cuda.amp.autocast(enabled=scaler is not None):
            outputs = model(images)
            raw_loss = compute_loss(
                criterion=criterion,
                outputs=outputs,
                targets_a=targets_a,
                targets_b=targets_b,
                lam=lam,
                target_encoding=target_encoding,
                num_classes=num_classes,
            )
            loss = raw_loss / max(1, grad_accum)

        if scaler:
            scaler.scale(loss).backward()
        else:
            loss.backward()
        is_update_step = (step_idx % max(1, grad_accum) == 0) or (step_idx == len(loader))
        if is_update_step:
            if scaler:
                scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            if scaler:
                scaler.step(optimizer)
                scaler.update()
            else:
                optimizer.step()
            if ema is not None and ema_active:
                ema.update(model, decay=ema_decay)
            optimizer.zero_grad(set_to_none=True)
            if scheduler is not None:
                scheduler.step()

        running_loss += raw_loss.item() * images.size(0)
        _, preds = torch.max(outputs, 1)
        correct += (preds == labels).sum().item()
        total += labels.size(0)

    return running_loss / total, correct / total


@torch.no_grad()
def evaluate(model, loader, criterion, device, tta=1, target_encoding="index", num_classes=1):
    model.eval()
    running_loss = 0.0
    correct = 0
    total = 0
    top3 = 0.0
    confusion = None

    def build_tta_batch(images, view_idx):
        # Deterministic multi-view TTA set (0: original, 1: hflip, 2: vflip, 3: hvflip).
        if view_idx == 1:
            return torch.flip(images, dims=[3])
        if view_idx == 2:
            return torch.flip(images, dims=[2])
        if view_idx == 3:
            return torch.flip(images, dims=[2, 3])
        return images

    for images, labels in tqdm(loader, desc="val", leave=False):
        images = images.to(device)
        labels = labels.to(device)
        outputs = model(images)
        if tta > 1:
            views = max(1, min(int(tta), 4))
            logits_sum = outputs
            for view_idx in range(1, views):
                logits_sum = logits_sum + model(build_tta_batch(images, view_idx))
            outputs = logits_sum / float(views)
        if target_encoding == "onehot":
            loss = criterion(outputs, one_hot_encode(labels, num_classes=num_classes).to(device))
        else:
            loss = criterion(outputs, labels)

        running_loss += loss.item() * images.size(0)
        _, preds = torch.max(outputs, 1)
        correct += (preds == labels).sum().item()
        total += labels.size(0)
        top3 += accuracy_topk(outputs, labels, k=3) * labels.size(0)

        num_classes = outputs.shape[1]
        if confusion is None:
            confusion = torch.zeros((num_classes, num_classes), dtype=torch.int64)
        for t, p in zip(labels.detach().cpu(), preds.detach().cpu()):
            confusion[t.long(), p.long()] += 1
    if confusion is None:
        macro_f1 = 0.0
    else:
        tp = confusion.diag().float()
        precision = tp / confusion.sum(0).clamp(min=1).float()
        recall = tp / confusion.sum(1).clamp(min=1).float()
        f1 = (2 * precision * recall) / (precision + recall).clamp(min=1e-8)
        macro_f1 = float(f1.mean().item())

    return running_loss / total, correct / total, top3 / total, macro_f1


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--epochs", type=int, default=25)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--img-size", type=int, default=224)
    parser.add_argument("--model", default="agro_cnn_v2", choices=MODEL_CHOICES)
    parser.add_argument("--out-dir", default="ml/artifacts")
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--pretrained", action="store_true")
    parser.add_argument("--label-smoothing", type=float, default=0.05)
    parser.add_argument(
        "--class-weight-method", choices=["inverse", "effective", "none"], default="inverse"
    )
    parser.add_argument("--class-weight-beta", type=float, default=0.999)
    parser.add_argument("--class-weight-power", type=float, default=1.0)
    parser.add_argument("--loss", choices=["ce", "focal", "bce", "soft_ce"], default="soft_ce")
    parser.add_argument("--target-encoding", choices=["index", "onehot"], default="onehot")
    parser.add_argument("--focal-gamma", type=float, default=2.0)
    parser.add_argument("--focal-alpha", type=float, default=1.0)
    parser.add_argument("--mixup", type=float, default=0.3)
    parser.add_argument("--mixup-end", type=float, default=0.0)
    parser.add_argument("--cutmix", type=float, default=0.3)
    parser.add_argument("--cutmix-end", type=float, default=0.0)
    parser.add_argument("--cutmix-prob", type=float, default=0.5)
    parser.add_argument("--mixup-off-epochs", type=int, default=3)
    parser.add_argument("--early-stop", type=int, default=6)
    parser.add_argument("--early-stop-min-delta", type=float, default=0.0015)
    parser.add_argument("--min-epochs", type=int, default=8)
    parser.add_argument("--overfit-gap-threshold", type=float, default=0.12)
    parser.add_argument("--overfit-patience", type=int, default=2)
    parser.add_argument("--overfit-lr-decay", type=float, default=0.7)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--deterministic", action="store_true")
    parser.add_argument("--balanced-sampler", action="store_true")
    parser.add_argument("--sampler-power", type=float, default=1.0)
    parser.add_argument("--freeze-epochs", type=int, default=2)
    parser.add_argument("--warmup-epochs", type=int, default=2)
    parser.add_argument("--grad-accum", type=int, default=1)
    parser.add_argument("--randaugment-level", type=int, default=8)
    parser.add_argument("--ema-decay", type=float, default=0.995)
    parser.add_argument("--ema-decay-start", type=float, default=0.97)
    parser.add_argument("--ema-warmup-epochs", type=int, default=1)
    parser.add_argument("--backbone-lr-mult", type=float, default=0.6)
    parser.add_argument("--head-lr-mult", type=float, default=1.0)
    parser.add_argument("--tta", type=int, default=1)
    parser.add_argument("--channels-last", action="store_true")
    parser.add_argument("--torch-compile", action="store_true")
    parser.add_argument("--swa-start", type=int, default=16)
    parser.add_argument("--swa-lr", type=float, default=1e-5)
    parser.add_argument("--progressive-resize", action="store_true")
    parser.add_argument("--final-img-size", type=int, default=320)
    parser.add_argument("--resize-switch-epoch", type=int, default=8)
    parser.add_argument("--resume", default="")
    parser.add_argument("--save-every", type=int, default=0)
    parser.add_argument("--save-metrics", action="store_true")
    parser.add_argument("--workers", type=int, default=0)
    args = parser.parse_args()

    set_seed(args.seed)
    set_deterministic_mode(bool(args.deterministic))

    data_dir = Path(args.data_dir)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    with open(out_dir / "run_config.json", "w") as f:
        json.dump(
            {
                "args": vars(args),
                "torch_version": torch.__version__,
                "cuda_available": torch.cuda.is_available(),
                "device": "cuda" if torch.cuda.is_available() else "cpu",
            },
            f,
            indent=2,
        )

    train_tf, val_tf = build_transforms(args.img_size, randaugment_level=args.randaugment_level)
    train_set = datasets.ImageFolder(data_dir / "train", transform=train_tf)
    val_set = datasets.ImageFolder(data_dir / "val", transform=val_tf)

    num_classes = len(train_set.classes)
    save_label_artifacts(train_set.classes, out_dir)

    if torch.cuda.is_available():
        device = "cuda"
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        device = "mps"
    else:
        device = "cpu"
    num_workers = max(0, int(args.workers))
    pin_memory = device == "cuda"
    data_gen = torch.Generator()
    data_gen.manual_seed(int(args.seed))

    sampler = (
        build_sampler_with_power(train_set, power=args.sampler_power)
        if args.balanced_sampler
        else None
    )
    train_loader = DataLoader(
        train_set,
        batch_size=args.batch_size,
        shuffle=sampler is None,
        sampler=sampler,
        num_workers=num_workers,
        pin_memory=pin_memory,
        persistent_workers=bool(num_workers > 0),
        worker_init_fn=seed_worker if args.deterministic else None,
        generator=data_gen if args.deterministic else None,
    )
    val_loader = DataLoader(
        val_set,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=pin_memory,
        persistent_workers=bool(num_workers > 0),
        worker_init_fn=seed_worker if args.deterministic else None,
        generator=data_gen if args.deterministic else None,
    )

    model = build_model(args.model, num_classes, pretrained=False).to(device)
    if args.channels_last:
        model = model.to(memory_format=torch.channels_last)
    if args.torch_compile and hasattr(torch, "compile"):
        model = torch.compile(model)

    class_weights = compute_class_weights(
        train_set,
        method=args.class_weight_method,
        beta=args.class_weight_beta,
        power=args.class_weight_power,
    )
    if class_weights is not None:
        class_weights = class_weights.to(device)
    if args.target_encoding == "onehot" and args.loss in {"ce", "focal"}:
        print("warning: onehot encoding ile CE/Focal uyumsuz; loss otomatik soft_ce yapildi.")
        args.loss = "soft_ce"
    if args.loss == "focal":
        criterion = FocalLoss(gamma=args.focal_gamma, alpha=args.focal_alpha, weight=class_weights)
    elif args.loss == "soft_ce":
        criterion = SoftTargetCrossEntropy(class_weight=class_weights)
    elif args.loss == "bce":
        criterion = nn.BCEWithLogitsLoss(pos_weight=class_weights)
    else:
        criterion = nn.CrossEntropyLoss(weight=class_weights, label_smoothing=args.label_smoothing)
    param_groups = build_param_groups(
        model,
        lr=args.lr,
        weight_decay=args.weight_decay,
        backbone_lr_mult=args.backbone_lr_mult,
        head_lr_mult=args.head_lr_mult,
    )
    optimizer = torch.optim.AdamW(param_groups, lr=args.lr, weight_decay=args.weight_decay)
    updates_per_epoch = int(math.ceil(len(train_loader) / max(1, args.grad_accum)))
    total_steps = args.epochs * max(1, updates_per_epoch)
    warmup_steps = args.warmup_epochs * max(1, updates_per_epoch)
    scheduler = build_warmup_cosine_scheduler(optimizer, total_steps=total_steps, warmup_steps=warmup_steps)
    scaler = torch.cuda.amp.GradScaler() if device == "cuda" else None
    ema = EMA(model, decay=args.ema_decay) if args.ema_decay > 0 else None
    swa_enabled = args.swa_start >= 0 and args.swa_start < args.epochs
    swa_model = AveragedModel(model) if swa_enabled else None
    swa_scheduler = SWALR(optimizer, swa_lr=args.swa_lr) if swa_enabled else None

    best_acc = 0.0
    best_macro_f1 = 0.0
    best_val_loss = float("inf")
    best_epoch = 0
    patience = 0
    overfit_patience = 0
    metrics = []
    progressive_sizes = build_progressive_sizes(args.img_size, args.final_img_size)
    start_epoch = 0

    if args.resume:
        ckpt_path = Path(args.resume)
        if ckpt_path.exists():
            resume = torch.load(ckpt_path, map_location="cpu")
            if "model" in resume:
                model.load_state_dict(resume["model"], strict=False)
            if resume.get("optimizer") is not None:
                optimizer.load_state_dict(resume["optimizer"])
            if resume.get("scheduler") is not None and scheduler is not None:
                scheduler.load_state_dict(resume["scheduler"])
            if resume.get("scaler") is not None and scaler is not None:
                scaler.load_state_dict(resume["scaler"])
            if resume.get("ema_shadow") is not None and ema is not None:
                ema.shadow = {k: v.clone() for k, v in resume["ema_shadow"].items()}
            start_epoch = int(resume.get("epoch", -1)) + 1
            best_acc = float(resume.get("best_acc", 0.0))
            best_macro_f1 = float(resume.get("best_macro_f1", 0.0))
            best_val_loss = float(resume.get("best_val_loss", float("inf")))
            best_epoch = int(resume.get("best_epoch", 0))
            print(f"resume loaded: {ckpt_path} (start_epoch={start_epoch})")
        else:
            print(f"resume checkpoint not found: {ckpt_path}")

    for epoch in range(start_epoch, args.epochs):
        swa_phase = bool(swa_enabled and epoch >= args.swa_start)
        strong_aug_on = not (args.mixup_off_epochs > 0 and epoch >= args.epochs - args.mixup_off_epochs)
        ema_active = epoch >= max(0, int(args.ema_warmup_epochs))
        progress = (epoch / max(1, args.epochs - 1)) if args.epochs > 1 else 1.0
        mixup_alpha_epoch = linear_schedule(args.mixup, args.mixup_end, progress)
        cutmix_alpha_epoch = linear_schedule(args.cutmix, args.cutmix_end, progress)
        ema_decay_epoch = linear_schedule(args.ema_decay_start, args.ema_decay, progress)
        set_backbone_trainable(model, epoch >= args.freeze_epochs)
        if args.progressive_resize and len(progressive_sizes) > 1:
            stage = 0
            if epoch >= args.resize_switch_epoch:
                stage = 1
            if epoch >= max(args.resize_switch_epoch + 4, int(args.epochs * 0.65)):
                stage = 2
            stage = min(stage, len(progressive_sizes) - 1)
            current_size = progressive_sizes[stage]
            epoch_train_tf, epoch_val_tf = build_transforms(
                current_size, randaugment_level=args.randaugment_level
            )
            train_set.transform = epoch_train_tf
            val_set.transform = epoch_val_tf

        train_loss, train_acc = train_one_epoch(
            model,
            train_loader,
            criterion,
            optimizer,
            device,
            scaler,
            mixup_alpha_epoch if strong_aug_on else 0.0,
            cutmix_alpha_epoch if strong_aug_on else 0.0,
            args.cutmix_prob,
            args.grad_accum,
            ema=ema,
            ema_active=ema_active,
            ema_decay=ema_decay_epoch,
            scheduler=None if swa_phase else scheduler,
            target_encoding=args.target_encoding,
            num_classes=num_classes,
        )
        if swa_phase and swa_model is not None and swa_scheduler is not None:
            swa_model.update_parameters(model)
            swa_scheduler.step()

        if ema:
            ema_model = build_model(args.model, num_classes, False).to(device)
            ema.apply_to(ema_model)
            val_loss, val_acc, val_top3, val_macro_f1 = evaluate(
                ema_model,
                val_loader,
                criterion,
                device,
                tta=max(1, args.tta),
                target_encoding=args.target_encoding,
                num_classes=num_classes,
            )
        else:
            val_loss, val_acc, val_top3, val_macro_f1 = evaluate(
                model,
                val_loader,
                criterion,
                device,
                tta=max(1, args.tta),
                target_encoding=args.target_encoding,
                num_classes=num_classes,
            )

        metrics.append(
            {
                "epoch": epoch + 1,
                "strong_aug": bool(strong_aug_on),
                "mixup_alpha": float(mixup_alpha_epoch if strong_aug_on else 0.0),
                "cutmix_alpha": float(cutmix_alpha_epoch if strong_aug_on else 0.0),
                "ema_decay": float(ema_decay_epoch if ema_active else 0.0),
                "img_size": train_set.transform.transforms[0].size
                if hasattr(train_set.transform.transforms[0], "size")
                else args.img_size,
                "train_loss": train_loss,
                "train_acc": train_acc,
                "val_loss": val_loss,
                "val_acc": val_acc,
                "val_top3": val_top3,
                "val_macro_f1": val_macro_f1,
                "generalization_gap": (train_acc - val_acc),
            }
        )

        print(
            f"epoch {epoch + 1}/{args.epochs} "
            f"train_loss={train_loss:.4f} train_acc={train_acc:.4f} "
            f"val_loss={val_loss:.4f} val_acc={val_acc:.4f} val_top3={val_top3:.4f} val_macro_f1={val_macro_f1:.4f}"
        )

        selection_score = val_acc * 0.7 + val_macro_f1 * 0.3
        best_selection_score = best_acc * 0.7 + best_macro_f1 * 0.3
        improved = selection_score > (best_selection_score + float(args.early_stop_min_delta))
        if improved:
            best_acc = val_acc
            best_macro_f1 = val_macro_f1
            best_val_loss = min(best_val_loss, val_loss)
            best_epoch = epoch + 1
            patience = 0
            torch.save(
                {
                    "model": {k: v.detach().cpu() for k, v in (ema.shadow if ema else model.state_dict()).items()},
                    "classes": train_set.classes,
                    "img_size": args.img_size,
                    "arch": args.model,
                    "best_acc": best_acc,
                    "best_top3": val_top3,
                    "best_macro_f1": best_macro_f1,
                    "norm_mean": [0.485, 0.456, 0.406],
                    "norm_std": [0.229, 0.224, 0.225],
                    "target_encoding": args.target_encoding,
                    "class_to_idx": train_set.class_to_idx,
                },
                out_dir / "best.pt",
            )
        else:
            patience += 1
            best_val_loss = min(best_val_loss, val_loss)

        generalization_gap = float(train_acc - val_acc)
        overfit_signal = (
            (epoch + 1) >= int(args.min_epochs)
            and generalization_gap >= float(args.overfit_gap_threshold)
            and val_loss > best_val_loss * (1.0 + float(args.early_stop_min_delta))
        )
        if overfit_signal:
            overfit_patience += 1
            for param_group in optimizer.param_groups:
                param_group["lr"] = max(1e-6, float(param_group["lr"]) * float(args.overfit_lr_decay))
            print(
                f"overfit_guard: gap={generalization_gap:.4f} "
                f"best_val_loss={best_val_loss:.4f} current_val_loss={val_loss:.4f} "
                f"lr_decay={args.overfit_lr_decay}"
            )
        else:
            overfit_patience = 0

        save_training_checkpoint(
            out_dir / "last_training.pt",
            epoch=epoch,
            model=model,
            optimizer=optimizer,
            scheduler=scheduler,
            scaler=scaler,
            ema=ema,
            best_acc=best_acc,
            best_macro_f1=best_macro_f1,
            best_val_loss=best_val_loss,
            best_epoch=best_epoch,
            args=args,
        )
        if args.save_every and (epoch + 1) % max(1, args.save_every) == 0:
            save_training_checkpoint(
                out_dir / f"epoch_{epoch + 1}.pt",
                epoch=epoch,
                model=model,
                optimizer=optimizer,
                scheduler=scheduler,
                scaler=scaler,
                ema=ema,
                best_acc=best_acc,
                best_macro_f1=best_macro_f1,
                best_val_loss=best_val_loss,
                best_epoch=best_epoch,
                args=args,
            )

        if args.early_stop and (epoch + 1) >= int(args.min_epochs) and patience >= args.early_stop:
            print("early_stop triggered")
            break
        if int(args.overfit_patience) > 0 and overfit_patience >= int(args.overfit_patience):
            print("early_stop triggered by overfit_guard")
            break

    if args.save_metrics:
        with open(out_dir / "metrics.json", "w") as f:
            json.dump(metrics, f, indent=2)

    if swa_enabled and swa_model is not None:
        update_bn(train_loader, swa_model, device=device)
        swa_loss, swa_acc, swa_top3, swa_macro_f1 = evaluate(
            swa_model,
            val_loader,
            criterion,
            device,
            tta=max(1, args.tta),
            target_encoding=args.target_encoding,
            num_classes=num_classes,
        )
        print(
            f"swa_val_loss={swa_loss:.4f} swa_val_acc={swa_acc:.4f} "
            f"swa_val_top3={swa_top3:.4f} swa_val_macro_f1={swa_macro_f1:.4f}"
        )
        swa_selection_score = swa_acc * 0.7 + swa_macro_f1 * 0.3
        best_selection_score = best_acc * 0.7 + best_macro_f1 * 0.3
        if swa_selection_score >= best_selection_score:
            best_acc = swa_acc
            best_macro_f1 = swa_macro_f1
            best_epoch = args.epochs
            torch.save(
                {
                    "model": {k: v.detach().cpu() for k, v in swa_model.state_dict().items()},
                    "classes": train_set.classes,
                    "img_size": args.img_size,
                    "arch": args.model,
                    "best_acc": best_acc,
                    "best_top3": swa_top3,
                    "best_macro_f1": best_macro_f1,
                    "norm_mean": [0.485, 0.456, 0.406],
                    "norm_std": [0.229, 0.224, 0.225],
                    "swa": True,
                    "target_encoding": args.target_encoding,
                    "class_to_idx": train_set.class_to_idx,
                },
                out_dir / "best.pt",
            )

    print(f"best_val_acc={best_acc:.4f} at epoch {best_epoch}")


if __name__ == "__main__":
    main()
