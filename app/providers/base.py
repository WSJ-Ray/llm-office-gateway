from abc import ABC, abstractmethod
from typing import AsyncIterator


class BaseProvider(ABC):
    format: str = ""

    def __init__(self, cfg: dict):
        self.base_url = cfg["base_url"].rstrip("/")
        self.api_key = cfg["api_key"]
        self.extra = cfg.get("extra_config") or {}

    @abstractmethod
    async def list_models(self) -> list[dict]:
        """Return Anthropic-format model list: [{id, type, display_name, created_at}, ...]"""

    @abstractmethod
    async def send(self, body: dict) -> tuple[bytes, str, dict, int]:
        """Non-streaming send.

        Returns (response_bytes, content_type, usage, status).
        status >= 400 表示上游失败，调用方可据此触发故障转移。
        usage keys: input_tokens, output_tokens, cache_w, cache_r.
        """

    @abstractmethod
    async def stream(self, body: dict) -> AsyncIterator[tuple[bytes, dict | None]]:
        """Streaming send. Yields (chunk_bytes, usage_or_None).

        The adapter is responsible for emitting Anthropic-format SSE events.
        The final yielded item is a tuple (b"", usage_dict) marking end of stream.
        """
