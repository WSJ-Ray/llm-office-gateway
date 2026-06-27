from fastapi import Request, HTTPException
from app import db


def verify_auth(request: Request) -> str:
    """验证请求令牌，有效时返回 token，否则抛出 401。

    若 DB 中未配置网关令牌（首次启动），放行所有请求以允许访问设置页。
    """
    token = db.get_gateway_token()
    if not token:
        return ""

    auth = request.headers.get("Authorization", "")
    x_api_key = request.headers.get("x-api-key", "")
    req_token = auth.replace("Bearer ", "") if auth.startswith("Bearer ") else x_api_key
    if req_token != token:
        raise HTTPException(status_code=401, detail="Invalid token")
    return req_token