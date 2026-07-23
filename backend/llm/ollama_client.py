"""Standalone connectivity check for the local Ollama model.

Kept separate from FastAPI so a broken Ollama HTTP contract (wrong URL,
model not pulled, service not running) shows up here first, isolated from
any web-framework noise. Run directly: `python llm/ollama_client.py`
"""
import requests

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL = "qwen3:8b"


def main() -> None:
    response = requests.post(
        OLLAMA_URL,
        json={
            "model": MODEL,
            "messages": [
                {"role": "user", "content": "In one sentence, what is a parcel tracking number?"}
            ],
            "stream": False,
        },
    )
    response.raise_for_status()
    reply = response.json()["message"]["content"]
    print(reply)


if __name__ == "__main__":
    main()
