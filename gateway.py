"""
DeepSeek 网关（面向 Claude Office 插件，v2 版本）。
透明代理至 DeepSeek 原生 Anthropic API 端点。
"""
import os
import json
import time
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
import httpx

DEEPSEEK_API_KEY = "sk-replaced"
GATEWAY_TOKEN = "123"
DEEPSEEK_ANTHROPIC_BASE = "https://api.deepseek.com/anthropic"


def _fmt_usage(usage: dict) -> str:
    """简要汇总 token 与缓存统计：入/出/缓存写/缓存读。"""
    i = usage.get("input_tokens", 0)
    o = usage.get("output_tokens", 0)
    cw = usage.get("cache_creation_input_tokens", 0)
    cr = usage.get("cache_read_input_tokens", 0)
    return f"in={i} out={o} cache_w={cw} cache_r={cr}"

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

    # 移除工具中的 'type' 字段 —— DeepSeek 仅支持 web_search 类型
    tools = data.get("tools")
    if tools:
        for t in tools:
            t.pop("type", None)
        tc = data.get("tool_choice")
        if isinstance(tc, dict) and tc.get("type") == "custom":
            tc.pop("type", None)

    body = json.dumps(data).encode("utf-8")
    stream = data.get("stream", False)
    print(f"[REQ] {time.strftime('%H:%M:%S')} model={data.get('model')} stream={stream} "
          f"len={len(body)} tools={len(tools) if tools else 0}", flush=True)

    ds_headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
    }

    if stream:
        return StreamingResponse(
            _proxy_stream(body, ds_headers, data.get("model")),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
        )

    t0 = time.time()
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{DEEPSEEK_ANTHROPIC_BASE}/v1/messages",
            content=body, headers=ds_headers,
        )
        if resp.status_code >= 400:
            print(f"[ERR] {time.strftime('%H:%M:%S')} DeepSeek {resp.status_code}: {resp.text[:500]}", flush=True)
            return Response(content=resp.content, status_code=resp.status_code,
                          media_type=resp.headers.get("content-type", "application/json"))

    # 解析响应以提取 token 与缓存统计
    usage = {}
    try:
        usage = json.loads(resp.content).get("usage", {})
    except Exception:
        pass
    print(f"[OK] {time.strftime('%H:%M:%S')} {time.time() - t0:.2f}s {_fmt_usage(usage)}", flush=True)
    return Response(content=resp.content, status_code=resp.status_code,
                  media_type=resp.headers.get("content-type", "application/json"))


async def _proxy_stream(body, ds_headers, model=""):
    """将 DeepSeek 的字节流直接转发给客户端，立即开始发送。"""
    yield b""  # 立即发送一个空数据块，防止超时

    t0 = time.time()
    first_byte = None
    usage = {}
    buf = b""  # 累积待解析的尾部，用于从最后一个 message_delta 提取 usage

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST", f"{DEEPSEEK_ANTHROPIC_BASE}/v1/messages",
            content=body, headers=ds_headers,
        ) as resp:
            if resp.status_code >= 400:
                err = await resp.aread()
                print(f"[ERR] {time.strftime('%H:%M:%S')} Stream DeepSeek {resp.status_code}: {err[:500]}", flush=True)
                yield err
                return

            async for chunk in resp.aiter_bytes():
                if first_byte is None:
                    first_byte = time.time() - t0
                # 缓存最近的数据，便于结束后解析 usage
                buf = (buf + chunk)[-4096:]
                yield chunk

    # 尝试从流末尾提取 usage（Anthropic 流式在 message_delta 事件中返回）
    try:
        text = buf.decode("utf-8", errors="ignore")
        for line in text.splitlines():
            if line.startswith("data:"):
                payload = json.loads(line[5:].strip())
                if payload.get("type") == "message_delta":
                    u = payload.get("usage", {})
                    usage = {k: v for k, v in u.items() if k}
    except Exception:
        pass

    ttft = f"{first_byte:.2f}s" if first_byte else "-"
    print(f"[OK] {time.strftime('%H:%M:%S')} ttft={ttft} total={time.time() - t0:.2f}s "
          f"model={model} {_fmt_usage(usage)}", flush=True)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=4000)
