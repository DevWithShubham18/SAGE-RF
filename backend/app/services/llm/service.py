from __future__ import annotations

import asyncio
import json
import logging
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Literal, TypedDict


logger = logging.getLogger(__name__)

DEFAULT_OPENAI_MODEL = "gpt-5.6-luna"
DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434"
PROVIDER_TIMEOUT_SECONDS = 60.0
MAX_OUTPUT_TOKENS = 1200

SYSTEM_PROMPT = """You are the SAGE-RF technical assistant. Be concise by default and technically useful. You can explain RF, DSP, FFT and Fourier analysis, Laplace transforms, modulation, signal processing, spectrum analysis, waterfall plots, frequency-domain concepts, and general software or engineering questions.

Never claim that you can see live SAGE-RF measurements, recordings, analysis results, user history, or application state unless the user explicitly includes that information in the conversation. Never invent measurements or claim to have executed DSP calculations. Clearly distinguish facts supplied by the user, general technical knowledge, and assumptions. Ask for missing details when a reliable answer depends on them."""


class ChatMessage(TypedDict):
    role: Literal["user", "assistant"]
    content: str


@dataclass(frozen=True)
class AssistantConfiguration:
    provider: str
    model: str
    configured: bool


@dataclass(frozen=True)
class AssistantReply:
    content: str
    provider: str
    model: str


class AssistantProviderError(Exception):
    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.safe_message = message
        self.status_code = status_code


def get_assistant_configuration() -> AssistantConfiguration:
    provider = os.getenv("LLM_PROVIDER", "openai").strip().lower()

    if provider == "openai":
        model = os.getenv("OPENAI_MODEL", DEFAULT_OPENAI_MODEL).strip()
        return AssistantConfiguration(
            provider="openai",
            model=model or DEFAULT_OPENAI_MODEL,
            configured=bool(os.getenv("OPENAI_API_KEY", "").strip()),
        )

    if provider == "ollama":
        model = os.getenv("OLLAMA_MODEL", "").strip()
        return AssistantConfiguration(
            provider="ollama",
            model=model,
            configured=bool(model),
        )

    return AssistantConfiguration(
        provider=provider or "unknown",
        model="",
        configured=False,
    )


async def request_assistant_reply(
    messages: list[ChatMessage],
) -> AssistantReply:
    configuration = get_assistant_configuration()

    if configuration.provider == "openai":
        return await _request_openai(messages, configuration)

    if configuration.provider == "ollama":
        return await _request_ollama(messages, configuration)

    raise AssistantProviderError(
        "The configured LLM provider is not supported.",
        status_code=503,
    )


async def _request_openai(
    messages: list[ChatMessage],
    configuration: AssistantConfiguration,
) -> AssistantReply:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()

    if not api_key:
        raise AssistantProviderError(
            "OpenAI is not configured on the server.",
            status_code=503,
        )

    try:
        from openai import AsyncOpenAI
        from openai import (
            APIConnectionError,
            APIStatusError,
            APITimeoutError,
            AuthenticationError,
            RateLimitError,
        )
    except ImportError as exc:
        logger.error("OpenAI provider selected but the server SDK is unavailable")
        raise AssistantProviderError(
            "OpenAI support is not installed on the server.",
            status_code=503,
        ) from exc

    client = AsyncOpenAI(
        api_key=api_key,
        timeout=PROVIDER_TIMEOUT_SECONDS,
        max_retries=1,
    )

    try:
        response = await client.responses.create(
            model=configuration.model,
            instructions=SYSTEM_PROMPT,
            input=messages,
            max_output_tokens=MAX_OUTPUT_TOKENS,
            store=False,
        )
    except AuthenticationError as exc:
        logger.warning("OpenAI rejected the configured credential")
        raise AssistantProviderError(
            "OpenAI authentication failed. Check the server configuration.",
            status_code=502,
        ) from exc
    except RateLimitError as exc:
        logger.warning("OpenAI rate limit reached")
        raise AssistantProviderError(
            "The OpenAI service is currently rate limited. Please try again later.",
            status_code=429,
        ) from exc
    except APITimeoutError as exc:
        logger.warning("OpenAI model request timed out")
        raise AssistantProviderError(
            "The model request timed out.",
            status_code=504,
        ) from exc
    except APIConnectionError as exc:
        logger.warning("OpenAI connection failed: %s", type(exc).__name__)
        raise AssistantProviderError(
            "The OpenAI service is currently unavailable.",
            status_code=503,
        ) from exc
    except APIStatusError as exc:
        logger.warning("OpenAI API request failed with status %s", exc.status_code)
        raise AssistantProviderError(
            "The OpenAI model request failed.",
            status_code=502,
        ) from exc
    except Exception as exc:
        logger.exception("Unexpected OpenAI provider failure")
        raise AssistantProviderError(
            "The OpenAI model request failed.",
            status_code=502,
        ) from exc
    finally:
        try:
            await client.close()
        except Exception:
            pass

    content = (response.output_text or "").strip()

    if not content:
        raise AssistantProviderError(
            "The model returned an empty response.",
            status_code=502,
        )

    return AssistantReply(
        content=content,
        provider="openai",
        model=getattr(response, "model", None) or configuration.model,
    )


async def _request_ollama(
    messages: list[ChatMessage],
    configuration: AssistantConfiguration,
) -> AssistantReply:
    if not configuration.model:
        raise AssistantProviderError(
            "No local Ollama model is configured.",
            status_code=503,
        )

    base_url = os.getenv(
        "OLLAMA_BASE_URL",
        DEFAULT_OLLAMA_BASE_URL,
    ).strip().rstrip("/")

    payload = json.dumps(
        {
            "model": configuration.model,
            "stream": False,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                *messages,
            ],
            "options": {"num_predict": MAX_OUTPUT_TOKENS},
        }
    ).encode("utf-8")

    request = urllib.request.Request(
        f"{base_url}/api/chat",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    def execute_request() -> dict:
        with urllib.request.urlopen(
            request,
            timeout=PROVIDER_TIMEOUT_SECONDS,
        ) as response:
            return json.loads(response.read().decode("utf-8"))

    try:
        data = await asyncio.to_thread(execute_request)
    except urllib.error.HTTPError as exc:
        logger.warning("Ollama request failed with status %s", exc.code)
        message = (
            "The configured Ollama model is not installed."
            if exc.code == 404
            else "Local Ollama model is unavailable."
        )
        raise AssistantProviderError(message, status_code=503) from exc
    except (
        urllib.error.URLError,
        TimeoutError,
        json.JSONDecodeError,
    ) as exc:
        logger.warning("Ollama connection failed: %s", type(exc).__name__)
        raise AssistantProviderError(
            "Local Ollama model is unavailable.",
            status_code=503,
        ) from exc
    except Exception as exc:
        logger.exception("Unexpected Ollama provider failure")
        raise AssistantProviderError(
            "Local Ollama model is unavailable.",
            status_code=503,
        ) from exc

    content = str(data.get("message", {}).get("content", "")).strip()

    if not content:
        raise AssistantProviderError(
            "The local model returned an empty response.",
            status_code=502,
        )

    return AssistantReply(
        content=content,
        provider="ollama",
        model=str(data.get("model") or configuration.model),
    )
