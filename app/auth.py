from fastapi import Request, HTTPException
from .config import GATEWAY_TOKEN


def verify_auth(request: Request) -> str:
    """Return the token if valid, raise 401 otherwise."""
    auth = request.headers.get("Authorization", "")
    x_api_key = request.headers.get("x-api-key", "")
    token = auth.replace("Bearer ", "") if auth.startswith("Bearer ") else x_api_key
    if token != GATEWAY_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid token")
    return token
