"""OpenAI Chat Completions adapter.

Translates Anthropic-format requests/responses to/from OpenAI Chat Completions
including streaming SSE and tool calling.
"""
import json
import time
from typing import AsyncIterator

import httpx

from .base import BaseProvider
from ..translation import anthropic_to_openai_request
from ..translation.o2a import openai_to_anthropic_response, openai_stream_to_anthropic_sse


class OpenAIChatAdapter(BaseProvider):
    format = "openai_chat"

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def list_models(self) -> list[dict]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                resp = await client.get(f"{self.base_url}/models", headers=self._headers())
            except Exception:
                return []
            if resp.status_code >= 400:
                return []
        try:
            data = resp.json()
        except Exception:
            return []
        out = []
        for m in data.get("data", []):
            mid = m.get("id", "")
            out.append(
                {
                    "id": mid,
                    "type": "model",
                    "display_name": mid,
                    "created_at": "",
                }
            )
        return out

    async def send(self, body: dict) -> tuple[bytes, str, dict, int]:
        oa_body = anthropic_to_openai_request({**body, "stream": False})
        payload = json.dumps(oa_body).encode("utf-8")
        model = body.get("model", "")
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{self.base_url}/chat/completions",
                content=payload,
                headers=self._headers(),
            )
        ct = resp.headers.get("content-type", "application/json")
        if resp.status_code >= 400:
            return resp.content, ct, {
                "input_tokens": 0, "output_tokens": 0, "cache_w": 0, "cache_r": 0,
            }, resp.status_code
        try:
            oa = resp.json()
        except Exception:
            return resp.content, ct, {"input_tokens": 0, "output_tokens": 0, "cache_w": 0, "cache_r": 0}, resp.status_code
        anth = openai_to_anthropic_response(oa, model)
        usage = anth.get("usage", {})
        return json.dumps(anth).encode("utf-8"), "application/json", {
            "input_tokens": usage.get("input_tokens", 0),
            "output_tokens": usage.get("output_tokens", 0),
            "cache_w": 0,
            "cache_r": 0,
        }, resp.status_code

    async def stream(self, body: dict) -> AsyncIterator[tuple[bytes, dict | None]]:
        oa_body = anthropic_to_openai_request({**body, "stream": True})
        payload = json.dumps(oa_body).encode("utf-8")
        model = body.get("model", "")
        t0 = time.time()
        first_byte = False
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/chat/completions",
                content=payload,
                headers=self._headers(),
            ) as resp:
                if resp.status_code >= 400:
                    err = await resp.aread()
                    yield err, {
                        "status": resp.status_code,
                        "error": err[:500].decode("utf-8", "ignore"),
                    }
                    return

                async def _iter():
                    async for c in resp.aiter_bytes():
                        nonlocal first_byte
                        if not first_byte and c:
                            first_byte = True
                        yield c

                final_usage: dict | None = None
                async for sse_chunk, u in openai_stream_to_anthropic_sse(_iter(), model):
                    if u is not None and "input_tokens" in u and "status" not in u:
                        final_usage = u
                    yield sse_chunk, None
        if final_usage is None:
            final_usage = {"input_tokens": 0, "output_tokens": 0, "cache_w": 0, "cache_r": 0}
        ttft_ms = int((time.time() - t0) * 1000) if first_byte else 0
        yield b"", {**final_usage, "_eof": True, "ttft_ms": ttft_ms}
