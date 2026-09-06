from __future__ import annotations

from io import BytesIO
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


def _safe_number(value: Any, decimals: int = 3) -> str:
    if value is None:
        return "N/A"

    try:
        return f"{float(value):.{decimals}f}"
    except (TypeError, ValueError):
        return str(value)


def _safe_int(value: Any) -> str:
    if value is None:
        return "N/A"

    try:
        return f"{int(value):,}"
    except (TypeError, ValueError):
        return str(value)


def generate_analysis_pdf(result: dict[str, Any]) -> BytesIO:
    """
    Generate a PDF report from an existing SAGE-RF
    analysis result dictionary.

    This function does NOT perform DSP analysis.
    It only converts existing analysis results into PDF.
    """

    output = BytesIO()

    document = SimpleDocTemplate(
        output,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title="SAGE-RF Signal Analysis Report",
        author="SAGE-RF",
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "SageTitle",
        parent=styles["Title"],
        fontSize=22,
        leading=26,
        alignment=TA_CENTER,
        spaceAfter=8,
    )

    subtitle_style = ParagraphStyle(
        "SageSubtitle",
        parent=styles["Normal"],
        fontSize=9,
        leading=12,
        alignment=TA_CENTER,
        textColor=colors.grey,
        spaceAfter=20,
    )

    heading_style = ParagraphStyle(
        "SageHeading",
        parent=styles["Heading2"],
        fontSize=14,
        leading=18,
        spaceBefore=12,
        spaceAfter=8,
    )

    normal_style = ParagraphStyle(
        "SageNormal",
        parent=styles["Normal"],
        fontSize=9,
        leading=13,
    )

    story = []

    # =========================================================
    # HEADER
    # =========================================================

    story.append(
        Paragraph(
            "SAGE-RF",
            title_style,
        )
    )

    story.append(
        Paragraph(
            "Signal Analysis Report",
            subtitle_style,
        )
    )

    filename = result.get(
        "filename",
        "Unknown recording",
    )

    story.append(
        Paragraph(
            f"<b>Recording:</b> {filename}",
            normal_style,
        )
    )

    story.append(Spacer(1, 8))

    # =========================================================
    # RECORDING INFORMATION
    # =========================================================

    story.append(
        Paragraph(
            "1. Recording Information",
            heading_style,
        )
    )

    metadata = result.get(
        "metadata",
        {},
    )

    metadata_table = Table(
        [
            ["Parameter", "Value"],
            [
                "Source format",
                str(
                    metadata.get(
                        "source_format",
                        "N/A",
                    )
                ),
            ],
            [
                "Sample rate",
                (
                    f"{_safe_number(metadata.get('sample_rate'), 0)} Hz"
                    if metadata.get("sample_rate") is not None
                    else "N/A"
                ),
            ],
            [
                "Sample count",
                _safe_int(
                    metadata.get(
                        "sample_count"
                    )
                ),
            ],
            [
                "Duration",
                (
                    f"{_safe_number(metadata.get('duration_seconds'), 3)} s"
                    if metadata.get("duration_seconds") is not None
                    else "N/A"
                ),
            ],
            [
                "Peak amplitude",
                _safe_number(
                    metadata.get(
                        "peak_amplitude"
                    )
                ),
            ],
            [
                "Mean power",
                _safe_number(
                    metadata.get(
                        "mean_power"
                    )
                ),
            ],
        ],
        colWidths=[
            65 * mm,
            100 * mm,
        ],
    )

    metadata_table.setStyle(
        TableStyle(
            [
                (
                    "BACKGROUND",
                    (0, 0),
                    (-1, 0),
                    colors.lightgrey,
                ),
                (
                    "FONTNAME",
                    (0, 0),
                    (-1, 0),
                    "Helvetica-Bold",
                ),
                (
                    "FONTNAME",
                    (0, 1),
                    (0, -1),
                    "Helvetica-Bold",
                ),
                (
                    "GRID",
                    (0, 0),
                    (-1, -1),
                    0.5,
                    colors.grey,
                ),
                (
                    "PADDING",
                    (0, 0),
                    (-1, -1),
                    6,
                ),
            ]
        )
    )

    story.append(metadata_table)

    # =========================================================
    # SPECTRUM ANALYSIS
    # =========================================================

    story.append(
        Paragraph(
            "2. Spectrum Analysis",
            heading_style,
        )
    )

    spectrum = result.get(
        "spectrum",
        {},
    )

    spectrum_table = Table(
        [
            ["Parameter", "Value"],
            [
                "Peak frequency",
                (
                    f"{_safe_number(spectrum.get('peak_frequency_hz'))} Hz"
                    if spectrum.get("peak_frequency_hz") is not None
                    else "N/A"
                ),
            ],
            [
                "Peak power",
                (
                    f"{_safe_number(spectrum.get('peak_power_db'))} dB"
                    if spectrum.get("peak_power_db") is not None
                    else "N/A"
                ),
            ],
            [
                "Noise floor",
                (
                    f"{_safe_number(spectrum.get('noise_floor_db'))} dB"
                    if spectrum.get("noise_floor_db") is not None
                    else "N/A"
                ),
            ],
            [
                "SNR",
                (
                    f"{_safe_number(spectrum.get('snr_db'))} dB"
                    if spectrum.get("snr_db") is not None
                    else "N/A"
                ),
            ],
            [
                "Occupied bandwidth",
                (
                    f"{_safe_number(spectrum.get('occupied_bandwidth_hz'))} Hz"
                    if spectrum.get("occupied_bandwidth_hz") is not None
                    else "N/A"
                ),
            ],
            [
                "Frequency resolution",
                (
                    f"{_safe_number(spectrum.get('frequency_resolution_hz'))} Hz"
                    if spectrum.get("frequency_resolution_hz") is not None
                    else "N/A"
                ),
            ],
        ],
        colWidths=[
            65 * mm,
            100 * mm,
        ],
    )

    spectrum_table.setStyle(
        TableStyle(
            [
                (
                    "BACKGROUND",
                    (0, 0),
                    (-1, 0),
                    colors.lightgrey,
                ),
                (
                    "FONTNAME",
                    (0, 0),
                    (-1, 0),
                    "Helvetica-Bold",
                ),
                (
                    "FONTNAME",
                    (0, 1),
                    (0, -1),
                    "Helvetica-Bold",
                ),
                (
                    "GRID",
                    (0, 0),
                    (-1, -1),
                    0.5,
                    colors.grey,
                ),
                (
                    "PADDING",
                    (0, 0),
                    (-1, -1),
                    6,
                ),
            ]
        )
    )

    story.append(spectrum_table)

    # =========================================================
    # MODULATION
    # =========================================================

    story.append(
        Paragraph(
            "3. Modulation Analysis",
            heading_style,
        )
    )

    modulation = result.get(
        "modulation"
    ) or {}

    modulation_name = modulation.get(
        "modulation",
        "Unclassified",
    )

    modulation_confidence = modulation.get(
        "confidence"
    )

    confidence = (
        f"{float(modulation_confidence) * 100:.2f}%"
        if modulation_confidence is not None
        else "N/A"
    )

    modulation_table = Table(
        [
            ["Parameter", "Value"],
            [
                "Classification",
                str(modulation_name),
            ],
            [
                "Confidence",
                confidence,
            ],
        ],
        colWidths=[
            65 * mm,
            100 * mm,
        ],
    )

    modulation_table.setStyle(
        TableStyle(
            [
                (
                    "BACKGROUND",
                    (0, 0),
                    (-1, 0),
                    colors.lightgrey,
                ),
                (
                    "FONTNAME",
                    (0, 0),
                    (-1, 0),
                    "Helvetica-Bold",
                ),
                (
                    "FONTNAME",
                    (0, 1),
                    (0, -1),
                    "Helvetica-Bold",
                ),
                (
                    "GRID",
                    (0, 0),
                    (-1, -1),
                    0.5,
                    colors.grey,
                ),
                (
                    "PADDING",
                    (0, 0),
                    (-1, -1),
                    6,
                ),
            ]
        )
    )

    story.append(modulation_table)

    # =========================================================
    # DETECTED RF SIGNALS
    # =========================================================

    story.append(
        Paragraph(
            "4. Detected RF Signals",
            heading_style,
        )
    )

    detections = result.get(
        "detections",
        {},
    )

    candidates = detections.get(
        "candidates",
        [],
    )

    story.append(
        Paragraph(
            f"<b>Detected signal count:</b> {len(candidates)}",
            normal_style,
        )
    )

    story.append(Spacer(1, 8))

    if candidates:
        detection_rows = [
            [
                "#",
                "Center (Hz)",
                "Bandwidth (Hz)",
                "Peak (Hz)",
                "SNR (dB)",
                "Modulation",
            ]
        ]

        for index, candidate in enumerate(
            candidates,
            start=1,
        ):
            detection_rows.append(
                [
                    str(index),
                    _safe_number(
                        candidate.get(
                            "center_frequency_hz"
                        )
                    ),
                    _safe_number(
                        candidate.get(
                            "bandwidth_hz"
                        )
                    ),
                    _safe_number(
                        candidate.get(
                            "peak_frequency_hz"
                        )
                    ),
                    _safe_number(
                        candidate.get(
                            "snr_db"
                        )
                    ),
                    str(
                        candidate.get(
                            "modulation",
                            "N/A",
                        )
                    ),
                ]
            )

        detection_table = Table(
            detection_rows,
            repeatRows=1,
            colWidths=[
                10 * mm,
                31 * mm,
                31 * mm,
                28 * mm,
                25 * mm,
                35 * mm,
            ],
        )

        detection_table.setStyle(
            TableStyle(
                [
                    (
                        "BACKGROUND",
                        (0, 0),
                        (-1, 0),
                        colors.lightgrey,
                    ),
                    (
                        "FONTNAME",
                        (0, 0),
                        (-1, 0),
                        "Helvetica-Bold",
                    ),
                    (
                        "GRID",
                        (0, 0),
                        (-1, -1),
                        0.5,
                        colors.grey,
                    ),
                    (
                        "FONTSIZE",
                        (0, 0),
                        (-1, -1),
                        7,
                    ),
                    (
                        "PADDING",
                        (0, 0),
                        (-1, -1),
                        4,
                    ),
                ]
            )
        )

        story.append(detection_table)

    else:
        story.append(
            Paragraph(
                "No RF candidates were detected.",
                normal_style,
            )
        )

    # =========================================================
    # DIAGNOSTICS
    # =========================================================

    story.append(
        Paragraph(
            "5. Analysis Pipeline",
            heading_style,
        )
    )

    diagnostics = result.get(
        "diagnostics",
        {},
    )

    diagnostic_rows = [
        ["Component", "Method"],
        [
            "Signal detector",
            str(
                diagnostics.get(
                    "signal_detector",
                    "N/A",
                )
            ),
        ],
        [
            "Per-signal analysis",
            str(
                diagnostics.get(
                    "per_signal_analysis",
                    "N/A",
                )
            ),
        ],
        [
            "Modulation classifier",
            str(
                diagnostics.get(
                    "per_signal_modulation",
                    "N/A",
                )
            ),
        ],
    ]

    diagnostic_table = Table(
        diagnostic_rows,
        colWidths=[
            65 * mm,
            100 * mm,
        ],
    )

    diagnostic_table.setStyle(
        TableStyle(
            [
                (
                    "BACKGROUND",
                    (0, 0),
                    (-1, 0),
                    colors.lightgrey,
                ),
                (
                    "FONTNAME",
                    (0, 0),
                    (-1, 0),
                    "Helvetica-Bold",
                ),
                (
                    "FONTNAME",
                    (0, 1),
                    (0, -1),
                    "Helvetica-Bold",
                ),
                (
                    "GRID",
                    (0, 0),
                    (-1, -1),
                    0.5,
                    colors.grey,
                ),
                (
                    "PADDING",
                    (0, 0),
                    (-1, -1),
                    6,
                ),
            ]
        )
    )

    story.append(diagnostic_table)

    # =========================================================
    # NOTE
    # =========================================================

    story.append(Spacer(1, 20))

    story.append(
        Paragraph(
            "<b>SAGE-RF analysis note:</b> "
            "Modulation classification is currently based on "
            "the existing analysis pipeline and should be "
            "interpreted together with the other signal metrics.",
            normal_style,
        )
    )

    # Build PDF
    document.build(story)

    output.seek(0)

    return output
