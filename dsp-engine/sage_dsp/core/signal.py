from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np


@dataclass
class Signal:
    """Common complex-baseband signal representation."""

    samples: np.ndarray
    sample_rate: float
    center_frequency_hz: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.samples = np.asarray(self.samples, dtype=np.complex64).ravel()

        if self.samples.size == 0:
            raise ValueError("Signal cannot contain zero samples.")

        if self.sample_rate <= 0:
            raise ValueError("sample_rate must be greater than zero.")

    @property
    def sample_count(self) -> int:
        return int(self.samples.size)

    @property
    def duration_seconds(self) -> float:
        return float(self.sample_count / self.sample_rate)

    @property
    def power(self) -> float:
        return float(np.mean(np.abs(self.samples) ** 2))
