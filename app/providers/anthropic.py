"""Anthropic-native adapter.

Behaves as a transparent proxy to Anthropic-compatible endpoints such as
DeepSeek's /anthropic, Moonshot /anthropic, etc. Performs only minimal
pre-processing (strip tools.type=custom) and passes through requests/responses.
"""
import json
import time
from typing import AsyncIterator
from urllib.parse import urlparse

import httpx

from .base import BaseProvider


def _strip_tool_type(body: dict) -> None:
    tools = body.get("tools")
    if tools:
        for t in tools:
            t.pop("type", None)
    tc = body.get("tool_choice")
    if isinstance(tc, dict) and tc.get("type") == "custom":
        tc.pop("type", None)


def _empty_usage() -> dict:
    return {"input_tokens": 0, "output_tokens": 0, "cache_w": 0, "cache_r": 0}


def _extract_usage(block: bytes, usage: dict) -> None:
    """从一段 SSE 事件块中提取 usage，原地更新 ``usage``。

    Anthropic 流式 SSE 在 ``message_start`` 携带 input/cache 字段，
    在 ``message_delta`` 携带最终 output_tokens。解析失败或非相关事件时静默跳过。
    """
    data: bytes | None = None
    for line in block.split(b"\n"):
        line = line.strip()
        if line.startswith(b"data:"):
            data = line[5:].strip()
            break
    if not data:
        return
    try:
        obj = json.loads(data)
    except Exception:
        return
    etype = obj.get("type")
    if etype == "message_start":
        u = (obj.get("message") or {}).get("usage") or {}
        if u.get("input_tokens"):
            usage["input_tokens"] = u["input_tokens"]
        if u.get("cache_creation_input_tokens"):
            usage["cache_w"] = u["cache_creation_input_tokens"]
        if u.get("cache_read_input_tokens"):
            usage["cache_r"] = u["cache_read_input_tokens"]
        if u.get("output_tokens"):
            usage["output_tokens"] = u["output_tokens"]
    elif etype == "message_delta":
        u = obj.get("usage") or {}
        if u.get("output_tokens") is not None:
            usage["output_tokens"] = u["output_tokens"]


def _model_list_urls(base: str) -> list[str]:
    """生成候选模型列表 URL。

    许多 Anthropic 兼容端点（如 DeepSeek 的 /anthropic）本身不提供 /v1/models，
    而是把模型列表挂在同主机的 OpenAI 风格端点上。因此除 {base}/v1/models 外，
    还回退到父路径的 /v1/models 与 /models。
    """
    urls = [f"{base}/v1/models", f"{base}/models"]
    parsed = urlparse(base)
    path = parsed.path.rstrip("/")
    if "/" in path:
        parent_path = path.rsplit("/", 1)[0]
        parent = f"{parsed.scheme}://{parsed.netloc}{parent_path}"
    else:
        parent = f"{parsed.scheme}://{parsed.netloc}"
    urls.append(f"{parent}/v1/models")
    urls.append(f"{parent}/models")
    # 去重保序
    seen: set[str] = set()
    out: list[str] = []
    for u in urls:
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


class AnthropicAdapter(BaseProvider):
    format = "anthropic"

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def list_models(self) -> list[dict]:
        """尝试候选端点拉取模型列表。

        任一候选返回 2xx 即解析返回；全部失败时抛 RuntimeError，
        以便 preview/test 端点如实反映"端点不可用"而非伪报成功。
        """
        last_status: int | None = None
        async with httpx.AsyncClient(timeout=30.0) as client:
            for url in _model_list_urls(self.base_url):
                try:
                    resp = await client.get(url, headers=self._headers())
                except Exception:
                    continue
                last_status = resp.status_code
                if resp.status_code >= 400:
                    continue
                try:
                    data = resp.json()
                except Exception:
                    continue
                return [
                    {
                        "id": m.get("id", ""),
                        "type": "model",
                        "display_name": m.get("display_name", m.get("id", "")),
                        "created_at": m.get("created_at", ""),
                    }
                    for m in data.get("data", [])
                ]
        raise RuntimeError(f"模型列表端点不可用 (HTTP {last_status})")


    async def send(self, body: dict) -> tuple[bytes, str, dict, int]:
        _strip_tool_type(body)
        payload = json.dumps(body).encode("utf-8")
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{self.base_url}/v1/messages",
                content=payload,
                headers=self._headers(),
            )
        ct = resp.headers.get("content-type", "application/json")
        usage = _empty_usage()
        try:
            rj = resp.json()
            u = rj.get("usage", {}) or {}
            usage = {
                "input_tokens": u.get("input_tokens", 0),
                "output_tokens": u.get("output_tokens", 0),
                "cache_w": u.get("cache_creation_input_tokens", 0),
                "cache_r": u.get("cache_read_input_tokens", 0),
            }
        except Exception:
            pass
        return resp.content, ct, usage, resp.status_code

    async def stream(self, body: dict) -> AsyncIterator[tuple[bytes, dict | None]]:
        _strip_tool_type(body)
        payload = json.dumps(body).encode("utf-8")
        usage = _empty_usage()
        t0 = time.time()
        first = True
        buf = b""
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/v1/messages",
                content=payload,
                headers=self._headers(),
            ) as resp:
                if resp.status_code >= 400:
                    err = await resp.aread()
                    yield err, {"status": resp.status_code, "error": err[:500].decode("utf-8", "ignore")}
                    return
                async for chunk in resp.aiter_bytes():
                    if first and chunk:
                        first = False
                    # 透传原始字节的同时，按 SSE 事件边界解析 usage
                    buf += chunk
                    while b"\n\n" in buf:
                        event_block, buf = buf.split(b"\n\n", 1)
                        _extract_usage(event_block, usage)
                    yield chunk, None
        # 流结束后解析残余缓冲，兜底捕获末尾事件
        if buf:
            _extract_usage(buf, usage)
        yield b"", {**usage, "_eof": True, "ttft_ms": int((time.time() - t0) * 1000) if not first else 0}
