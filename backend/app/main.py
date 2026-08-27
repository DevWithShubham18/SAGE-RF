from fastapi import FastAPI

app = FastAPI(
    title="SAGE-RF",
    description="Signal Analysis and Generalized Extraction for RF",
    version="0.1.0",
)


@app.get("/")
async def root():
    return {
        "name": "SAGE-RF",
        "status": "online",
        "version": "0.1.0",
        "engine": "GNU Radio + Python DSP",
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "sage-rf-backend",
    }