from .base import BaseProvider
from .anthropic import AnthropicAdapter
from .openai_chat import OpenAIChatAdapter

REGISTRY: dict[str, type[BaseProvider]] = {
    "anthropic": AnthropicAdapter,
    "openai_chat": OpenAIChatAdapter,
}


def get_adapter(provider: dict) -> BaseProvider:
    fmt = provider["format"]
    cls = REGISTRY.get(fmt)
    if not cls:
        raise ValueError(f"Unsupported provider format: {fmt}")
    return cls(provider)


__all__ = ["BaseProvider", "AnthropicAdapter", "OpenAIChatAdapter", "get_adapter", "REGISTRY"]
