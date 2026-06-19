from fastapi import Request, HTTPException
from .config import GATEWAY_TOKEN


def verify_auth(request: Request) -> str:
    """验证请求令牌，有效时返回 token，否则抛出 401。"""
    auth = request.headers.get("Authorization", "")
    x_api_key = request.headers.get("x-api-key", "")
    token = auth.replace("Bearer ", "") if auth.startswith("Bearer ") else x_api_key
    if token != GATEWAY_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid token")
    return token
