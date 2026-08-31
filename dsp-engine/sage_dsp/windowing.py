from __future__ import annotations

from typing import Iterator

import numpy as np

from sage_dsp.core.signal import Signal


def iter_blocks(
    signal: Signal,
    block_size: int,
    hop_size: int | None = None,
) -> Iterator[Signal]:
    """
    Iterate through a signal using fixed-size overlapping blocks.

    block_size:
        Number of samples in each block.

    hop_size:
        Number of samples to advance between blocks.
        Defaults to block_size (no overlap).
    """

    if block_size <= 0:
        raise ValueError("block_size must be greater than zero.")

    if hop_size is None:
        hop_size = block_size

    if hop_size <= 0:
        raise ValueError("hop_size must be greater than zero.")

    samples = signal.samples

    for start in range(
        0,
        max(samples.size - block_size + 1, 0),
        hop_size,
    ):
        block = samples[start:start + block_size]

        yield Signal(
            samples=block,
            sample_rate=signal.sample_rate,
            center_frequency_hz=signal.center_frequency_hz,
            metadata={
                **signal.metadata,
                "block_start_sample": start,
                "block_start_seconds": (
                    start / signal.sample_rate
                ),
            },
        )
