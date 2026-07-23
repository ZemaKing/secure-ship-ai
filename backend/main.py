from fastapi import FastAPI

from routes.chat import router as chat_router

app = FastAPI(title="SecureShip Backend")

app.include_router(chat_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
