"""Provider adapter registry."""
from .base import BaseProvider
from .anthropic import AnthropicAdapter
from .openai_chat import OpenAIChatAdapter
from .url_adaptive import URLAdaptiveAdapter

REGISTRY: dict[str, type[BaseProvider]] = {
    "anthropic": AnthropicAdapter,
    "openai_chat": OpenAIChatAdapter,
    "url_adaptive": URLAdaptiveAdapter,
}


def get_adapter(provider: dict) -> BaseProvider:
    fmt = provider["format"]
    cls = REGISTRY.get(fmt)
    if not cls:
        raise ValueError(f"Unsupported provider format: {fmt}")
    return cls(provider)


__all__ = ["BaseProvider", "AnthropicAdapter", "OpenAIChatAdapter", "URLAdaptiveAdapter", "get_adapter", "REGISTRY"]
