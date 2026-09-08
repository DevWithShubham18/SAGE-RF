from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.app.auth.dependencies import get_current_user
from backend.app.services.llm import (
    AssistantProviderError,
    get_assistant_configuration,
    request_assistant_reply,
)


MAX_MESSAGES = 24
MAX_MESSAGE_CHARACTERS = 8_000
MAX_CONTEXT_CHARACTERS = 32_000
MAX_REQUEST_CHARACTERS = 64_000

router = APIRouter(
    prefix="/api/assistant",
    tags=["AI Assistant"],
)


class AssistantMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARACTERS)

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        content = value.strip()
        if not content:
            raise ValueError("Message content cannot be empty.")
        return content


class AssistantChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    messages: list[AssistantMessage]

    @field_validator("messages")
    @classmethod
    def validate_messages(
        cls,
        messages: list[AssistantMessage],
    ) -> list[AssistantMessage]:
        if not messages:
            raise ValueError("At least one message is required.")

        if len(messages) > MAX_MESSAGES:
            raise ValueError("Conversation contains too many messages.")

        if messages[-1].role != "user":
            raise ValueError("The newest message must be from the user.")

        if sum(len(message.content) for message in messages) > MAX_REQUEST_CHARACTERS:
            raise ValueError("Conversation request is too large.")

        return messages


class AssistantChatResponse(BaseModel):
    message: AssistantMessage
    provider: str
    model: str


def trim_context(messages: list[AssistantMessage]) -> list[dict[str, str]]:
    selected: list[AssistantMessage] = []
    total_characters = 0

    for message in reversed(messages):
        next_size = len(message.content)
        if selected and total_characters + next_size > MAX_CONTEXT_CHARACTERS:
            break
        selected.append(message)
        total_characters += next_size

    selected.reverse()
    return [message.model_dump() for message in selected]


@router.get("/status")
async def assistant_status(
    _current_user: dict = Depends(get_current_user),
) -> dict[str, str | bool]:
    configuration = get_assistant_configuration()
    return {
        "provider": configuration.provider,
        "model": configuration.model,
        "configured": configuration.configured,
        "verified": False,
    }


@router.post("/chat", response_model=AssistantChatResponse)
async def assistant_chat(
    payload: AssistantChatRequest,
    _current_user: dict = Depends(get_current_user),
) -> AssistantChatResponse:
    try:
        reply = await request_assistant_reply(trim_context(payload.messages))
    except AssistantProviderError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail=exc.safe_message,
        ) from exc

    return AssistantChatResponse(
        message=AssistantMessage(role="assistant", content=reply.content),
        provider=reply.provider,
        model=reply.model,
    )
