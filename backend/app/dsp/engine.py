from gnuradio import blocks, gr


def run_dsp_self_test() -> dict:
    """
    Run a small GNU Radio flowgraph entirely in memory.

    This is a development self-test. It does not require
    an SDR device or RF hardware.
    """

    input_samples = [
        1 + 1j,
        2 + 2j,
        3 + 3j,
    ]

    flowgraph = gr.top_block()

    source = blocks.vector_source_c(
        input_samples,
        repeat=False,
    )

    sink = blocks.vector_sink_c()

    flowgraph.connect(source, sink)

    flowgraph.run()

    output_samples = sink.data()

    return {
        "status": "ok",
        "input_count": len(input_samples),
        "output_count": len(output_samples),
        "samples": [
            {
                "real": sample.real,
                "imag": sample.imag,
            }
            for sample in output_samples
        ],
    }