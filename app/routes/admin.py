"""管理后台 API：提供商管理、模型映射、统计数据、请求日志、模型预览。"""
import time
from typing import AsyncIterator

import httpx
from fastapi import APIRouter, Request, HTTPException

from .. import db
from ..auth import verify_auth
from ..schemas import (
    ProviderIn,
    ProviderUpdate,
    MappingIn,
    MappingUpdate,
    PreviewModelsIn,
)
from ..providers import REGISTRY

router = APIRouter(prefix="/admin")


def _mask_key(p: dict) -> dict:
    """返回列表时掩码处理 api_key，仅显示前后各 4 位。"""
    out = dict(p)
    k = out.get("api_key") or ""
    if len(k) > 8:
        out["api_key"] = k[:4] + "*" * (len(k) - 8) + k[-4:]
    elif k:
        out["api_key"] = "*" * len(k)
    return out


@router.get("/providers")
async def list_providers(request: Request):
    verify_auth(request)
    return {"data": [_mask_key(p) for p in db.list_providers()]}


@router.post("/providers")
async def create_provider(payload: ProviderIn, request: Request):
    verify_auth(request)
    data = payload.model_dump()
    if data.get("is_default"):
        # 确保默认提供商唯一性（由更新流程中的 set_default 保证）
        pass
    pid = db.create_provider(data)
    if data.get("is_default"):
        db.set_default_provider(pid)
    return {"id": pid}


@router.put("/providers/{pid}")
async def update_provider(pid: int, payload: ProviderUpdate, request: Request):
    verify_auth(request)
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not db.get_provider(pid):
        raise HTTPException(404, "Provider not found")
    db.update_provider(pid, data)
    if data.get("is_default"):
        db.set_default_provider(pid)
    return {"ok": True}


@router.delete("/providers/{pid}")
async def delete_provider(pid: int, request: Request):
    verify_auth(request)
    db.delete_provider(pid)
    return {"ok": True}


@router.post("/providers/{pid}/test")
async def test_provider(pid: int, request: Request):
    """测试连通性：调用提供商的 list_models 端点验证连接。"""
    verify_auth(request)
    p = db.get_provider(pid)
    if not p:
        raise HTTPException(404, "Provider not found")
    from ..providers import get_adapter
    t0 = time.time()
    try:
        adapter = get_adapter(p)
        models = await adapter.list_models()
        return {"ok": True, "models": len(models), "latency_ms": int((time.time() - t0) * 1000)}
    except Exception as e:
        raise HTTPException(502, f"Test failed: {e}")


@router.get("/providers/{pid}/models")
async def provider_models(pid: int, request: Request):
    """拉取该提供商的上游模型 ID 列表，供模型映射页面快速选用。"""
    verify_auth(request)
    p = db.get_provider(pid)
    if not p:
        raise HTTPException(404, "Provider not found")
    from ..providers import get_adapter
    try:
        adapter = get_adapter(p)
        models = await adapter.list_models()
        return {"ok": True, "models": [m["id"] for m in models if m.get("id")]}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200], "models": []}


@router.post("/providers/preview-models")
async def preview_models(payload: PreviewModelsIn, request: Request):
    """使用草稿状态的提供商配置（尚未保存）解析上游模型列表。"""
    verify_auth(request)
    fmt = payload.format
    if fmt not in REGISTRY:
        raise HTTPException(400, f"Unsupported format: {fmt}")
    from ..providers import get_adapter
    cfg = {
        "id": 0,
        "name": "preview",
        "format": fmt,
        "base_url": payload.base_url,
        "api_key": payload.api_key,
        "enabled": True,
        "is_default": False,
        "extra_config": payload.extra_config,
        "created_at": "",
    }
    t0 = time.time()
    try:
        adapter = get_adapter(cfg)
        models = await adapter.list_models()
        return {
            "ok": True,
            "models": [m["id"] for m in models],
            "latency_ms": int((time.time() - t0) * 1000),
        }
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}


@router.get("/mappings")
async def list_mappings(request: Request):
    verify_auth(request)
    return {"data": db.list_mappings()}


@router.post("/mappings")
async def create_mapping(payload: MappingIn, request: Request):
    verify_auth(request)
    cm = (payload.client_model or "").lower()
    if not any(t in cm for t in ("sonnet", "opus", "haiku")):
        raise HTTPException(400, "client_model 须包含 sonnet / opus / haiku 之一")
    mid = db.create_mapping(payload.model_dump())
    return {"id": mid}


@router.put("/mappings/{mid}")
async def update_mapping(mid: int, payload: MappingUpdate, request: Request):
    verify_auth(request)
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "client_model" in data:
        cm = data["client_model"].lower()
        if not any(t in cm for t in ("sonnet", "opus", "haiku")):
            raise HTTPException(400, "client_model 须包含 sonnet / opus / haiku 之一")
    db.update_mapping(mid, data)
    return {"ok": True}


@router.delete("/mappings/{mid}")
async def delete_mapping(mid: int, request: Request):
    verify_auth(request)
    db.delete_mapping(mid)
    return {"ok": True}


@router.get("/stats")
async def stats(request: Request):
    verify_auth(request)
    return {
        "summary": db.stats_summary(),
        "providers": [
            {"id": p["id"], "name": p["name"], "format": p["format"], "enabled": p["enabled"]}
            for p in db.list_providers()
        ],
        "mappings_count": len(db.list_mappings()),
        "hourly": db.stats_hourly(24),
        "by_provider": db.stats_by_provider(),
        "recent": db.list_logs(limit=8, offset=0),
    }


@router.get("/logs")
async def logs(request: Request, limit: int = 100, offset: int = 0):
    verify_auth(request)
    return {"data": db.list_logs(limit=min(limit, 500), offset=max(offset, 0))}
