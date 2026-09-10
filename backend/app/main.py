from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api.routes import router
from backend.app.api.assistant import router as assistant_router
from backend.app.db.database import initialize_database


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Initialize durable application resources before serving requests."""

    initialize_database()
    yield


app = FastAPI(
    title="SAGE-RF",
    description=(
        "Signal Analysis and Geospatial/Radio "
        "Frequency Intelligence platform."
    ),
    version="0.1.0",
    lifespan=lifespan,
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(router)
app.include_router(assistant_router)


@app.get("/")
def root() -> dict:
    return {
        "service": "SAGE-RF",
        "status": "online",
        "version": "0.1.0",
    }
