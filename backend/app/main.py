from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api.routes import router


app = FastAPI(
    title="SAGE-RF",
    description=(
        "Signal Analysis and Geospatial/Radio "
        "Frequency Intelligence platform."
    ),
    version="0.1.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(router)


@app.get("/")
def root() -> dict:
    return {
        "service": "SAGE-RF",
        "status": "online",
        "version": "0.1.0",
    }