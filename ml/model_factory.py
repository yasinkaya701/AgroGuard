from typing import List

import torch
import torch.nn as nn
from torchvision import models


MODEL_CHOICES: List[str] = [
    "agro_cnn_s",
    "agro_cnn",
    "agro_cnn_l",
    "mobilenet_v3_small",
    "efficientnet_v2_s",
    "efficientnet_v2_m",
    "efficientnet_v2_l",
    "convnext_tiny",
    "convnext_base",
    "convnext_large",
    "resnet50",
    "resnet101",
]


def _conv_bn_act(in_ch, out_ch, kernel=3, stride=1, groups=1):
    pad = kernel // 2
    return nn.Sequential(
        nn.Conv2d(in_ch, out_ch, kernel, stride=stride, padding=pad, groups=groups, bias=False),
        nn.BatchNorm2d(out_ch),
        nn.SiLU(inplace=True),
    )


class DropPath(nn.Module):
    def __init__(self, drop_prob: float = 0.0):
        super().__init__()
        self.drop_prob = float(max(0.0, drop_prob))

    def forward(self, x):
        if self.drop_prob == 0.0 or not self.training:
            return x
        keep_prob = 1.0 - self.drop_prob
        shape = (x.shape[0],) + (1,) * (x.ndim - 1)
        random_tensor = keep_prob + torch.rand(shape, dtype=x.dtype, device=x.device)
        random_tensor.floor_()
        return x.div(keep_prob) * random_tensor


class SEBlock(nn.Module):
    def __init__(self, channels: int, reduction: int = 8):
        super().__init__()
        hidden = max(8, channels // reduction)
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.fc = nn.Sequential(
            nn.Conv2d(channels, hidden, 1),
            nn.SiLU(inplace=True),
            nn.Conv2d(hidden, channels, 1),
            nn.Sigmoid(),
        )

    def forward(self, x):
        scale = self.fc(self.pool(x))
        return x * scale


class MBConvBlock(nn.Module):
    def __init__(
        self,
        in_ch: int,
        out_ch: int,
        stride: int = 1,
        expansion: int = 4,
        se_reduction: int = 8,
        drop_path: float = 0.0,
    ):
        super().__init__()
        mid = int(in_ch * expansion)
        self.use_skip = stride == 1 and in_ch == out_ch
        self.expand = _conv_bn_act(in_ch, mid, kernel=1, stride=1)
        self.depthwise = _conv_bn_act(mid, mid, kernel=3, stride=stride, groups=mid)
        self.se = SEBlock(mid, reduction=se_reduction)
        self.project = nn.Sequential(
            nn.Conv2d(mid, out_ch, 1, bias=False),
            nn.BatchNorm2d(out_ch),
        )
        self.drop_path = DropPath(drop_path) if drop_path > 0 else nn.Identity()

    def forward(self, x):
        out = self.expand(x)
        out = self.depthwise(out)
        out = self.se(out)
        out = self.project(out)
        if self.use_skip:
            out = x + self.drop_path(out)
        return out


class AgroCNN(nn.Module):
    def __init__(
        self,
        num_classes: int = 4,
        width: float = 1.0,
        depth_mult: float = 1.0,
        dropout: float = 0.25,
        drop_path_rate: float = 0.12,
    ):
        super().__init__()
        c1 = max(16, int(32 * width))
        c2 = max(24, int(48 * width))
        c3 = max(40, int(96 * width))
        c4 = max(64, int(160 * width))
        c5 = max(96, int(224 * width))
        repeats = [max(1, int(round(x * depth_mult))) for x in (2, 3, 3)]

        self.stem = nn.Sequential(
            _conv_bn_act(3, c1, kernel=3, stride=2),
            _conv_bn_act(c1, c2, kernel=3, stride=2),
        )
        total_blocks = sum(repeats)
        drop_values = torch.linspace(0.0, drop_path_rate, steps=total_blocks).tolist()
        d_idx = 0

        self.stage1 = self._make_stage(
            in_ch=c2, out_ch=c3, blocks=repeats[0], stride=2, expansion=3, drop_values=drop_values[d_idx : d_idx + repeats[0]]
        )
        d_idx += repeats[0]
        self.stage2 = self._make_stage(
            in_ch=c3, out_ch=c4, blocks=repeats[1], stride=2, expansion=4, drop_values=drop_values[d_idx : d_idx + repeats[1]]
        )
        d_idx += repeats[1]
        self.stage3 = self._make_stage(
            in_ch=c4, out_ch=c5, blocks=repeats[2], stride=2, expansion=4, drop_values=drop_values[d_idx : d_idx + repeats[2]]
        )

        self.avg_pool = nn.AdaptiveAvgPool2d(1)
        self.max_pool = nn.AdaptiveMaxPool2d(1)
        self.head = nn.Sequential(nn.Dropout(dropout), nn.Linear(c5 * 2, num_classes))
        self._init_weights()

    def _make_stage(self, in_ch, out_ch, blocks, stride, expansion, drop_values):
        layers = [MBConvBlock(in_ch, out_ch, stride=stride, expansion=expansion, drop_path=drop_values[0] if drop_values else 0.0)]
        for i in range(1, blocks):
            layers.append(MBConvBlock(out_ch, out_ch, stride=1, expansion=expansion, drop_path=drop_values[i] if i < len(drop_values) else 0.0))
        return nn.Sequential(*layers)

    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Conv2d):
                nn.init.kaiming_normal_(m.weight, mode="fan_out", nonlinearity="relu")
            elif isinstance(m, (nn.BatchNorm2d, nn.GroupNorm)):
                nn.init.ones_(m.weight)
                nn.init.zeros_(m.bias)
            elif isinstance(m, nn.Linear):
                nn.init.normal_(m.weight, 0, 0.01)
                nn.init.zeros_(m.bias)

    def forward(self, x):
        x = self.stem(x)
        x = self.stage1(x)
        x = self.stage2(x)
        x = self.stage3(x)
        avg_feat = torch.flatten(self.avg_pool(x), 1)
        max_feat = torch.flatten(self.max_pool(x), 1)
        feat = torch.cat([avg_feat, max_feat], dim=1)
        return self.head(feat)


def build_model(name: str, num_classes: int, pretrained: bool):
    if name == "agro_cnn_s":
        return AgroCNN(num_classes=num_classes, width=0.85, depth_mult=0.9, dropout=0.2, drop_path_rate=0.08)
    if name == "agro_cnn":
        return AgroCNN(num_classes=num_classes, width=1.0, depth_mult=1.0, dropout=0.25, drop_path_rate=0.12)
    if name == "agro_cnn_l":
        return AgroCNN(num_classes=num_classes, width=1.2, depth_mult=1.2, dropout=0.3, drop_path_rate=0.15)
    if name.startswith("efficientnet_v2_"):
        fn = getattr(models, name, None)
        if fn is None:
            raise ValueError(f"Unsupported model on this torchvision build: {name}")
        model = fn(weights="DEFAULT" if pretrained else None)
        in_features = model.classifier[1].in_features
        model.classifier[1] = nn.Linear(in_features, num_classes)
        return model
    if name.startswith("convnext_"):
        fn = getattr(models, name, None)
        if fn is None:
            raise ValueError(f"Unsupported model on this torchvision build: {name}")
        model = fn(weights="DEFAULT" if pretrained else None)
        in_features = model.classifier[2].in_features
        model.classifier[2] = nn.Linear(in_features, num_classes)
        return model
    if name == "mobilenet_v3_small":
        model = models.mobilenet_v3_small(weights="DEFAULT" if pretrained else None)
        in_features = model.classifier[3].in_features
        model.classifier[3] = nn.Linear(in_features, num_classes)
        return model
    if name.startswith("resnet"):
        fn = getattr(models, name, None)
        if fn is None:
            raise ValueError(f"Unsupported model on this torchvision build: {name}")
        model = fn(weights="DEFAULT" if pretrained else None)
        in_features = model.fc.in_features
        model.fc = nn.Linear(in_features, num_classes)
        return model
    raise ValueError(f"Unknown model: {name}")
