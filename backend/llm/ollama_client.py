"""Standalone connectivity check for the local Ollama model.

Kept separate from FastAPI so a broken Ollama HTTP contract (wrong URL,
model not pulled, service not running) shows up here first, isolated from
any web-framework noise. Run directly: `python llm/ollama_client.py`
"""
import requests

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL = "qwen3:8b"


def chat(messages: list[dict], tools: list[dict] | None = None) -> str:
    """Send a full message history to the local Ollama model and return its reply.

    `tools` is unused for now — accepted so Week 2's tool-calling enforcement
    can be wired in without changing this function's signature.
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
    return response.json()["message"]["content"]


def main() -> None:
    reply = chat(
        [{"role": "user", "content": "In one sentence, what is a parcel tracking number?"}]
    )
    print(reply)


if __name__ == "__main__":
    main()
