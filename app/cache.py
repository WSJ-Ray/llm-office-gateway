import time
import threading


class ModelListCache:
    """线程安全的内存缓存，存储上游模型列表。

    按 provider_id 或配置 key 索引，TTL 过期自动淘汰，超出容量上限时淘汰最旧条目。
    """

    def __init__(self, ttl: int = 300, max_size: int = 200):
        self._ttl = ttl
        self._max_size = max_size
        self._lock = threading.Lock()
        self._store: dict[int, dict] = {}      # provider_id → {models, ts}
        self._preview: dict[str, dict] = {}    # key → {models, ts}

    def _evict(self) -> None:
        """容量超出上限时淘汰最旧条目（调用方已持有锁）。"""
        while len(self._store) + len(self._preview) > self._max_size:
            oldest_id = None
            oldest_key = None
            oldest_ts = float("inf")
            for pid, entry in self._store.items():
                if entry["ts"] < oldest_ts:
                    oldest_ts = entry["ts"]
                    oldest_id = pid
                    oldest_key = None
            for key, entry in self._preview.items():
                if entry["ts"] < oldest_ts:
                    oldest_ts = entry["ts"]
                    oldest_id = None
                    oldest_key = key
            if oldest_id is not None:
                del self._store[oldest_id]
            elif oldest_key is not None:
                del self._preview[oldest_key]
            else:
                break

    def _expired(self, entry: dict) -> bool:
        return time.time() - entry["ts"] > self._ttl

    def get(self, provider_id: int) -> list[str] | None:
        with self._lock:
            entry = self._store.get(provider_id)
            if entry is None:
                return None
            if self._expired(entry):
                del self._store[provider_id]
                return None
            return entry["models"]

    def set(self, provider_id: int, models: list[str]) -> None:
        with self._lock:
            self._store[provider_id] = {"models": models, "ts": time.time()}
            self._evict()

    def get_preview(self, key: str) -> list[str] | None:
        with self._lock:
            entry = self._preview.get(key)
            if entry is None:
                return None
            if self._expired(entry):
                del self._preview[key]
                return None
            return entry["models"]

    def set_preview(self, key: str, models: list[str]) -> None:
        with self._lock:
            self._preview[key] = {"models": models, "ts": time.time()}
            self._evict()

    def invalidate(self, provider_id: int) -> None:
        with self._lock:
            self._store.pop(provider_id, None)

    def flush(self) -> None:
        with self._lock:
            self._store.clear()
            self._preview.clear()


model_cache = ModelListCache()
