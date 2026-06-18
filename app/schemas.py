from typing import Optional, Literal
from pydantic import BaseModel, Field

Format = Literal["anthropic", "openai_chat", "openai_responses", "vertex"]


class ProviderIn(BaseModel):
    name: str
    format: Format
    base_url: str
    api_key: str
    enabled: bool = True
    is_default: bool = False
    extra_config: dict = Field(default_factory=dict)


class ProviderUpdate(BaseModel):
    name: Optional[str] = None
    format: Optional[Format] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    enabled: Optional[bool] = None
    is_default: Optional[bool] = None
    extra_config: Optional[dict] = None


class ProviderOut(BaseModel):
    id: int
    name: str
    format: str
    base_url: str
    api_key: str
    enabled: bool
    is_default: bool
    extra_config: dict
    created_at: str


class MappingIn(BaseModel):
    provider_id: int
    client_model: str
    upstream_model: str
    enabled: bool = True
    priority: Optional[int] = None


class MappingUpdate(BaseModel):
    provider_id: Optional[int] = None
    client_model: Optional[str] = None
    upstream_model: Optional[str] = None
    enabled: Optional[bool] = None
    priority: Optional[int] = None


class MappingOut(BaseModel):
    id: int
    provider_id: int
    client_model: str
    upstream_model: str
    enabled: bool
    provider_name: str
    provider_format: str


class PreviewModelsIn(BaseModel):
    format: Format
    base_url: str
    api_key: str
    extra_config: dict = Field(default_factory=dict)
    timeout: int = 30
