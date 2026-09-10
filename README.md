# SAGE-RF — RF Signal Workstation

SAGE-RF is an authenticated RF and audio signal-analysis workstation for importing IQ or WAV recordings, running a DSP analysis pipeline, and inspecting the results through a professional browser-based interface.

## 1. Project Information

| Field | Details |
| --- | --- |
| Project Title | **SAGE-RF / RF Signal Workstation** |
| SIH Problem Statement ID | **26147** |
| SIH Problem Statement Title | **Automated model for analysis of .IQ and .wav files along with signal parameter extraction** |
| Category | **Software** |
| Theme | **Space Technology** |
| Frontend | [sage-rf.vercel.app](https://sage-rf.vercel.app) |
| Backend API | [sage-rf-api.onrender.com](https://sage-rf-api.onrender.com) |

## 2. Problem Statement

RF and audio recordings often contain useful frequency, power, bandwidth, modulation, and time-domain information, but extracting it can require several fragmented tools and substantial signal-processing expertise. This makes it difficult for students, engineers, and analysts to move efficiently from a raw IQ/WAV recording to an understandable and reviewable set of signal insights.

SAGE-RF addresses the need for a unified, authenticated workstation that combines signal ingestion, DSP processing, technical visualization, history, and reporting in one workflow.

## 3. Proposed Solution

SAGE-RF provides an integrated web workstation where authenticated users can:

1. Import an IQ or WAV recording.
2. Submit it to an authenticated FastAPI analysis endpoint.
3. Run spectral analysis, waterfall generation, signal detection, per-signal analysis, and modulation estimation.
4. Inspect time-domain and frequency-domain results, including Fourier and Laplace output when the WAV-only SAGE DSP adapter produces it, through interactive workstation tools.
5. Review compact analysis history and generate authenticated PDF reports.
6. Ask general RF, DSP, and engineering questions through a backend-connected LLM assistant.

The LLM assistant is intentionally isolated from uploaded recordings and analysis arrays. It does not receive signal data unless a user explicitly includes information in their message.

## 4. Key Features

- Firebase email/password registration, login, session tracking, and logout.
- Firebase ID-token verification on protected FastAPI endpoints.
- IQ and WAV recording ingestion with sample-rate support for raw IQ files.
- Power spectral density, spectrogram/waterfall, peak-frequency, SNR, and occupied-bandwidth analysis.
- Adaptive spectral signal detection and per-signal modulation classification evidence.
- Analysis workspace with spectrum, waterfall, detected-signal selection, and signal metrics.
- Waveform editor with playback, seeking, volume, mute, loop, playback-rate, zoom, and viewport controls.
- Detected-signal mixer and Signal Lab diagnostic views.
- SAGE DSP Fourier and Laplace analysis views for WAV results, with playback-linked navigation.
- Firestore-backed compact user analysis history.
- SQLite-backed compact server history used by authenticated history and PDF-report endpoints.
- PDF analysis reports generated with ReportLab.
- Real OpenAI or local Ollama AI Assistant selected through backend environment configuration.
- Responsive dark precision-instrument interface with keyboard-visible focus and reduced-motion support.
- Production memory safeguards: streamed uploads, bounded response matrices, and a configurable analysis sample window.

## 5. Technology Stack

| Area | Technologies |
| --- | --- |
| Frontend | React 19, Vite 8, JavaScript, CSS |
| Visualization and UI | Recharts, Three.js, React Three Fiber, Drei, Lucide React, SVG/canvas-based workstation views |
| Backend API | Python, FastAPI, Uvicorn, Pydantic |
| DSP and signal processing | NumPy, SciPy, bundled SAGE DSP modules, GNU Radio integration/self-test module |
| SAGE DSP | Signal abstraction, block/window utilities, Fourier analysis, Laplace analysis |
| Authentication | Firebase Authentication, Firebase Admin SDK/public-certificate ID-token verification |
| Data | Cloud Firestore for frontend user history; SQLAlchemy with SQLite for compact backend history |
| Reporting | ReportLab PDF generation |
| AI | OpenAI Responses API through the official server-side SDK; configurable local Ollama chat provider |
| Deployment | Vercel frontend, Render FastAPI backend, existing Firebase project |
| Testing | Pytest, FastAPI TestClient |

> **GNU Radio runtime note:** `backend/app/dsp/engine.py` contains the GNU Radio integration and self-test. The currently deployed Render service installs the NumPy/SciPy/SAGE DSP API dependencies and does not install GNU Radio. Install GNU Radio locally to run the GNU Radio-specific module and test.

## 6. Architecture

```text
                                  +--------------------------+
                                  | Firebase Authentication  |
                                  | email/password + ID token|
                                  +------------+-------------+
                                               |
                                               v
+------+       +-------------------------------+------------------------------+
| User | ----> | React 19 / Vite Frontend                                     |
+------+       | Home, Analysis, Editor, Mixer, Signal Lab, Fourier, Laplace,  |
               | Project, Settings, AI Assistant                               |
               +----------------+-----------------------------+----------------+
                                |                             |
                    Firestore user history           Bearer ID token + /api
                                |                             |
                                v                             v
                       +-----------------+       +-----------------------------+
                       | Cloud Firestore |       | Authenticated FastAPI API  |
                       +-----------------+       +--------------+--------------+
                                                               |
                   +----------------------+--------------------+------------------+
                   |                      |                    |                  |
                   v                      v                    v                  v
        +----------------------+  +------------------+  +--------------+  +----------------+
        | NumPy/SciPy analysis |  | SAGE DSP        |  | SQLite       |  | AI providers   |
        | PSD, waterfall,      |  | Fourier/Laplace |  | compact      |  | OpenAI/Ollama  |
        | detection/modulation|  +------------------+  | history      |  +----------------+
        +----------------------+                         +------+-------+
                |                                             |
                | GNU Radio local integration/self-test       v
                +------------------------------------> +---------------+
                                                      | PDF reports   |
                                                      | (ReportLab)   |
                                                      +---------------+
```

Production requests use Vercel rewrites to forward `/api/*` from the frontend domain to the Render backend. Firestore access occurs through the Firebase client using the current authenticated user, while FastAPI independently verifies Firebase bearer tokens before analysis, server history, reports, or assistant requests. The standalone SAGE DSP adapter currently runs Fourier and Laplace processing for WAV input; IQ input continues through the main NumPy/SciPy analysis pipeline without that adapter.

## 7. Repository Structure

```text
SAGE-RF/
├── README.md
├── .env.example                 # Safe backend configuration template
├── .gitignore                   # Secrets, databases, captures and build artifacts
├── render.yaml                  # Render backend service definition
├── backend/
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py              # FastAPI application and database startup
│   │   ├── api/
│   │   │   ├── routes.py         # Analysis, history, health and PDF routes
│   │   │   └── assistant.py      # Authenticated AI Assistant routes/models
│   │   ├── analysis/
│   │   │   ├── features.py       # PSD, waterfall and global signal features
│   │   │   └── signal_analysis.py # Per-signal metrics and modulation analysis
│   │   ├── auth/
│   │   │   ├── dependencies.py   # Bearer-token FastAPI dependency
│   │   │   └── firebase_admin.py  # Firebase token verification
│   │   ├── db/
│   │   │   ├── database.py       # SQLite engine, session and schema startup
│   │   │   └── models.py         # SQLAlchemy analysis-history model
│   │   ├── dsp/
│   │   │   ├── detector.py       # Spectral signal detection
│   │   │   ├── modulation.py     # Modulation features/classification
│   │   │   └── engine.py         # Optional GNU Radio integration/self-test
│   │   ├── io/readers.py          # IQ/WAV readers
│   │   ├── reports/pdf_report.py  # ReportLab PDF generation
│   │   ├── schemas/signal.py      # Pydantic signal schemas
│   │   └── services/llm/service.py # OpenAI/Ollama provider abstraction
│   └── tests/                   # Backend, auth and deployment-safety tests
├── dsp-engine/
│   └── sage_dsp/                # Signal, Fourier, Laplace, transforms and windowing
└── frontend/
    ├── package.json
    ├── vite.config.js           # Local /api proxy
    ├── vercel.json              # Production /api rewrite
    ├── public/                  # Public icons and favicon
    └── src/
        ├── App.jsx              # Main application workflow and dashboard
        ├── auth/AuthGate.jsx    # Authentication gate
        ├── firebase/            # Firebase client, user and history functions
        ├── components/          # Workstation, charts, waveform, mixer and assistant
        └── styles.css            # Shared SAGE-RF visual system
```

Local databases, RF captures, `.env` files, credentials, virtual environments, `node_modules`, build output, and caches are intentionally excluded from this structure and from Git.

## 8. Final Presentation

**Final presentation:** https://drive.google.com/file/d/1aPwGH8uhEV4-Bm3ZENZNxyTExXAlRvlS/view?usp=sharing

## 9. Demo Video

**Demo video:** https://drive.google.com/drive/folders/1ephr9Ybae7dNTOUCiZfyBbRhSoPE65Ri?usp=drive_link


## 10. Screenshots / Prototype Photos

**Screenshot paths:** <img width="1466" height="795" alt="image" src="https://github.com/user-attachments/assets/b782d7f8-534e-4c13-bdf2-ac6f2ac4b696" />


## 11. Installation

### 11.1 Prerequisites

- Node.js and npm compatible with Vite 8
- Python 3.12 recommended
- Git
- A Firebase project with Authentication and Firestore configured
- An OpenAI API key **or** a locally running Ollama model for the AI Assistant
- GNU Radio when running the GNU Radio integration/self-test locally

### 11.2 Clone the repository

```bash
git clone https://github.com/DevWithShubham18/SAGE-RF.git
cd SAGE-RF
git checkout save-current-work
```

### 11.3 Backend environment

GNU Radio is most reliably installed through Conda/Miniforge. One suitable local setup is:

```bash
conda create -n sage-rf -c conda-forge python=3.12 gnuradio numpy scipy
conda activate sage-rf
python -m pip install -r backend/requirements.txt
```

To run the repository's Pytest suite, also install its test-only tools:

```bash
python -m pip install pytest httpx
```

Create the local backend configuration from the safe template:

```bash
cp .env.example .env
```

Configure only the provider you intend to use:

| Variable | Purpose |
| --- | --- |
| `FIREBASE_PROJECT_ID` | Firebase project used to validate ID-token audience and issuer |
| `FIREBASE_SERVICE_ACCOUNT` | Optional local path to a service-account JSON file |
| `LLM_PROVIDER` | `openai` or `ollama` |
| `OPENAI_API_KEY` | Server-side OpenAI credential; required for the OpenAI provider |
| `OPENAI_MODEL` | Configured OpenAI model |
| `OLLAMA_BASE_URL` | Local Ollama server URL |
| `OLLAMA_MODEL` | Installed local Ollama model name |
| `SAGE_RF_MAX_ANALYSIS_SAMPLES` | Optional deployment memory-safety analysis window |

### 11.4 Frontend environment

```bash
cd frontend
npm install
```

Create `frontend/.env.local` with the Firebase web-client configuration:

```dotenv
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

Firebase web configuration is used by the browser client. OpenAI keys and Firebase service-account credentials must never use a `VITE_` variable or appear in frontend files.

### 11.5 Deployment

- **Frontend:** Vercel builds `frontend/` and serves [sage-rf.vercel.app](https://sage-rf.vercel.app).
- **Backend:** Render runs the FastAPI service described by `render.yaml` at [sage-rf-api.onrender.com](https://sage-rf-api.onrender.com).
- **API routing:** `frontend/vercel.json` forwards production `/api/*` requests to Render.
- **Firebase:** the existing Firebase project supplies Authentication and Firestore.
- **OpenAI:** the API key is configured only in the Render backend environment.


## 12. Run

Open two terminals from the repository root.

### 12.1 Start the backend

```bash
conda activate sage-rf
python -m uvicorn backend.app.main:app --env-file .env --reload --host 127.0.0.1 --port 8000
```

Useful local endpoints:

- API root: `http://127.0.0.1:8000/`
- Health: `http://127.0.0.1:8000/api/health`
- Interactive API documentation: `http://127.0.0.1:8000/docs`

### 12.2 Start the frontend

```bash
cd frontend
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`. The Vite configuration proxies `/api` requests to `http://localhost:8000`.

### 12.3 Verification commands

```bash
# From the repository root with the Python environment active
python -m pytest backend/tests -q
python -m compileall -q backend dsp-engine

# From frontend/
npm run build
```

## 13. Future Scope

- Move production backend history from ephemeral SQLite storage to a durable managed database or persistent volume.
- Add queued/background analysis for long recordings and higher concurrent workloads.
- Expand memory-efficient full-recording processing beyond the current configurable analysis window.
- Package the complete GNU Radio runtime for production deployments that require GNU Radio flowgraphs.
- Add explicit, permission-controlled assistant tools for selected analysis summaries without automatically sharing recordings or raw DSP arrays.
- Add real response streaming for supported LLM providers.
- Add broader automated browser, accessibility, and end-to-end deployment tests.
- Add export formats and report visualizations beyond the current PDF summary.

