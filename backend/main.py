from fastapi import FastAPI

app = FastAPI(title="SecureShip Backend")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
