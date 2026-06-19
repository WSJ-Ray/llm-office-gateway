"""Shared utilities for provider adapters."""
from urllib.parse import urlparse


def model_list_urls(base: str) -> list[str]:
    """Generate candidate model-list URLs for an upstream base URL.

    Many Anthropic-compatible endpoints (e.g. DeepSeek ``/anthropic``) don't
    expose ``/v1/models`` themselves, but the model list lives on the same
    host at an OpenAI-style endpoint.  We try several candidates:

    1. ``{base}/v1/models``
    2. ``{base}/models``
    3. parent-path ``/v1/models``  (strips one path segment from base)
    4. parent-path ``/models``

    Deduplicates while preserving order.
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
    seen: set[str] = set()
    out: list[str] = []
    for u in urls:
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out
