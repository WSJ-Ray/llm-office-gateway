"""
DeepSeek Gateway for Claude Office Add-in (v2)
Transparent proxy to DeepSeek's native Anthropic API endpoint.
"""
import os
import json
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
import httpx

DEEPSEEK_API_KEY = "sk-replaced"
GATEWAY_TOKEN = "123"
DEEPSEEK_ANTHROPIC_BASE = "https://api.deepseek.com/anthropic"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://pivot.claude.ai"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def verify_auth(request: Request):
    auth = request.headers.get("Authorization", "")
    x_api_key = request.headers.get("x-api-key", "")
    token = auth.replace("Bearer ", "") if auth.startswith("Bearer ") else x_api_key
    if token != GATEWAY_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid token")


@app.get("/v1/models")
async def list_models(request: Request):
    verify_auth(request)
    return {
        "data": [
            {"id": "claude-sonnet-4-5-20250929", "type": "model", "display_name": "DeepSeek via Claude Sonnet", "created_at": "2025-09-29T00:00:00Z"},
            {"id": "claude-opus-4-5-20250929", "type": "model", "display_name": "DeepSeek via Claude Opus", "created_at": "2025-09-29T00:00:00Z"},
        ],
        "has_more": False,
        "first_id": "claude-sonnet-4-5-20250929",
        "last_id": "claude-opus-4-5-20250929",
    }


@app.post("/v1/messages")
async def proxy_messages(request: Request):
    verify_auth(request)
    body = await request.body()
    data = json.loads(body)

    # Strip 'type' field from tools - DeepSeek only supports web_search types
    tools = data.get("tools")
    if tools:
        for t in tools:
            t.pop("type", None)
        tc = data.get("tool_choice")
        if isinstance(tc, dict) and tc.get("type") == "custom":
            tc.pop("type", None)

    body = json.dumps(data).encode("utf-8")
    stream = data.get("stream", False)
    print(f"[REQ] model={data.get('model')} stream={stream} len={len(body)} tools={len(tools) if tools else 0}", flush=True)

    ds_headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
    }

    if stream:
        return StreamingResponse(
            _proxy_stream(body, ds_headers),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
        )

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{DEEPSEEK_ANTHROPIC_BASE}/v1/messages",
            content=body, headers=ds_headers,
        )
        if resp.status_code >= 400:
            print(f"[ERR] DeepSeek {resp.status_code}: {resp.text[:500]}", flush=True)
            return Response(content=resp.content, status_code=resp.status_code,
                          media_type=resp.headers.get("content-type", "application/json"))

    return Response(content=resp.content, status_code=resp.status_code,
                  media_type=resp.headers.get("content-type", "application/json"))


async def _proxy_stream(body, ds_headers):
    """Stream bytes from DeepSeek directly to client, start sending immediately."""
    yield b""  # Send empty chunk immediately to prevent timeout

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST", f"{DEEPSEEK_ANTHROPIC_BASE}/v1/messages",
            content=body, headers=ds_headers,
        ) as resp:
            if resp.status_code >= 400:
                err = await resp.aread()
                print(f"[ERR] Stream DeepSeek {resp.status_code}: {err[:500]}", flush=True)
                yield err
                return

            async for chunk in resp.aiter_bytes():
                yield chunk


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=4000)
