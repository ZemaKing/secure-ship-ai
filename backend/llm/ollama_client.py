"""Standalone connectivity check for the local Ollama model.

Kept separate from FastAPI so a broken Ollama HTTP contract (wrong URL,
model not pulled, service not running) shows up here first, isolated from
any web-framework noise. Run directly: `python llm/ollama_client.py`
"""
import os
from dataclasses import dataclass

import requests

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_URL = f"{OLLAMA_HOST}/api/chat"
MODEL = "qwen3:8b"


@dataclass
class ToolCall:
    name: str
    arguments: dict


@dataclass
class ChatCompletionResult:
    content: str | None
    tool_calls: list[ToolCall]


def chat(messages: list[dict], tools: list[dict] | None = None) -> ChatCompletionResult:
    """Send a full message history to the local Ollama model and return its reply.

    `tools` is passed through to Ollama's tool-calling contract when given;
    the caller is responsible for executing any `tool_calls` in the result.
    """
    payload = {
        "model": MODEL,
        "messages": messages,
        "stream": False,
    }
    if tools is not None:
        payload["tools"] = tools

    response = requests.post(OLLAMA_URL, json=payload)
    response.raise_for_status()
    message = response.json()["message"]
    tool_calls = [
        ToolCall(name=call["function"]["name"], arguments=call["function"].get("arguments") or {})
        for call in message.get("tool_calls") or []
    ]
    return ChatCompletionResult(content=message.get("content") or None, tool_calls=tool_calls)


def main() -> None:
    result = chat(
        [{"role": "user", "content": "In one sentence, what is a parcel tracking number?"}]
    )
    print(result.content)


if __name__ == "__main__":
    main()
