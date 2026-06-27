import sqlite3
import json
import threading
from contextlib import contextmanager
from typing import Optional

from .config import DB_PATH

_lock = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    format TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    is_default INTEGER NOT NULL DEFAULT 0,
    extra_config TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS model_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id INTEGER NOT NULL,
    client_model TEXT NOT NULL,
    upstream_model TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    priority INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
    UNIQUE (provider_id, client_model)
);

CREATE TABLE IF NOT EXISTS request_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    provider_id INTEGER,
    provider_name TEXT,
    client_model TEXT,
    upstream_model TEXT,
    stream INTEGER NOT NULL DEFAULT 0,
    status INTEGER,
    duration_ms INTEGER,
    ttft_ms INTEGER,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    total_input_tokens INTEGER DEFAULT 0,
    cache_w INTEGER DEFAULT 0,
    cache_r INTEGER DEFAULT 0,
    error TEXT
);
"""


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with _lock, get_conn() as conn:
        conn.executescript(SCHEMA)
        _migrate(conn)


def _migrate(conn) -> None:
    """为旧库补齐 priority 列并按 client_model 分组回填优先级。"""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(model_mappings)")}
    if "priority" not in cols:
        conn.execute(
            "ALTER TABLE model_mappings ADD COLUMN priority INTEGER NOT NULL DEFAULT 0"
        )
        # 按 client_model 分组、id 升序赋 0,1,2... 作为初始优先级
        conn.execute(
            "UPDATE model_mappings SET priority = ("
            " SELECT COUNT(*) FROM model_mappings m2 "
            " WHERE m2.client_model = model_mappings.client_model AND m2.id < model_mappings.id)"
        )


def _migrate_total_input_tokens() -> None:
    """为旧库补齐 total_input_tokens 列，并回填已有数据。"""
    with _lock, get_conn() as conn:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(request_logs)")}
        if "total_input_tokens" in cols:
            return
        conn.execute("ALTER TABLE request_logs ADD COLUMN total_input_tokens INTEGER DEFAULT 0")
        # 回填已有数据：total = input_tokens + output_tokens + cache_w + cache_r
        conn.execute(
            "UPDATE request_logs SET total_input_tokens = "
            "(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0) + COALESCE(cache_w, 0) + COALESCE(cache_r, 0))"
        )


def _row_to_provider(row) -> dict:
    d = dict(row)
    d["enabled"] = bool(d["enabled"])
    d["is_default"] = bool(d["is_default"])
    d["extra_config"] = json.loads(d.get("extra_config") or "{}")
    return d


def list_providers() -> list[dict]:
    with _lock, get_conn() as conn:
        rows = conn.execute("SELECT * FROM providers ORDER BY id").fetchall()
    return [_row_to_provider(r) for r in rows]


def get_provider(provider_id: int) -> Optional[dict]:
    with _lock, get_conn() as conn:
        row = conn.execute("SELECT * FROM providers WHERE id=?", (provider_id,)).fetchone()
    return _row_to_provider(row) if row else None


def get_default_provider() -> Optional[dict]:
    with _lock, get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM providers WHERE is_default=1 AND enabled=1 LIMIT 1"
        ).fetchone()
    return _row_to_provider(row) if row else None


def create_provider(p: dict) -> int:
    with _lock, get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO providers(name, format, base_url, api_key, enabled, is_default, extra_config) "
            "VALUES(?,?,?,?,?,?,?)",
            (
                p["name"], p["format"], p["base_url"], p["api_key"],
                int(p.get("enabled", True)),
                int(p.get("is_default", False)),
                json.dumps(p.get("extra_config") or {}),
            ),
        )
        return cur.lastrowid


def update_provider(provider_id: int, p: dict) -> None:
    fields = []
    values = []
    for k in ("name", "format", "base_url", "api_key", "enabled", "is_default", "extra_config"):
        if k in p:
            if k == "extra_config":
                values.append(json.dumps(p[k]))
            elif k in ("enabled", "is_default"):
                values.append(int(p[k]))
            else:
                values.append(p[k])
            fields.append(f"{k}=?")
    if not fields:
        return
    values.append(provider_id)
    with _lock, get_conn() as conn:
        conn.execute(f"UPDATE providers SET {', '.join(fields)} WHERE id=?", values)


def delete_provider(provider_id: int) -> None:
    with _lock, get_conn() as conn:
        conn.execute("DELETE FROM providers WHERE id=?", (provider_id,))


def set_default_provider(provider_id: int) -> None:
    with _lock, get_conn() as conn:
        conn.execute("UPDATE providers SET is_default=0")
        conn.execute("UPDATE providers SET is_default=1 WHERE id=?", (provider_id,))


def list_mappings() -> list[dict]:
    with _lock, get_conn() as conn:
        rows = conn.execute(
            "SELECT m.*, p.name AS provider_name, p.format AS provider_format "
            "FROM model_mappings m JOIN providers p ON m.provider_id=p.id "
            "ORDER BY m.client_model, m.priority ASC, m.id"
        ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["enabled"] = bool(d["enabled"])
        out.append(d)
    return out


def find_mappings_by_client_model(client_model: str) -> list[dict]:
    """返回该 client_model 的全部启用映射，按优先级升序（故障转移队列）。"""
    with _lock, get_conn() as conn:
        rows = conn.execute(
            "SELECT m.*, p.name AS provider_name, p.format AS provider_format "
            "FROM model_mappings m JOIN providers p ON m.provider_id=p.id "
            "WHERE m.client_model=? AND m.enabled=1 AND p.enabled=1 "
            "ORDER BY m.priority ASC, m.id ASC",
            (client_model,),
        ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["enabled"] = bool(d["enabled"])
        out.append(d)
    return out


def next_priority(client_model: str) -> int:
    """该 client_model 分组内的下一个优先级（追加到队尾）。"""
    with _lock, get_conn() as conn:
        row = conn.execute(
            "SELECT COALESCE(MAX(priority), -1) mp FROM model_mappings WHERE client_model=?",
            (client_model,),
        ).fetchone()
    return int(row["mp"]) + 1


def create_mapping(m: dict) -> int:
    with _lock, get_conn() as conn:
        prio = m.get("priority")
        if prio is None:
            row = conn.execute(
                "SELECT COALESCE(MAX(priority), -1) mp FROM model_mappings WHERE client_model=?",
                (m["client_model"],),
            ).fetchone()
            prio = int(row["mp"]) + 1
        cur = conn.execute(
            "INSERT INTO model_mappings(provider_id, client_model, upstream_model, enabled, priority) "
            "VALUES(?,?,?,?,?)",
            (
                m["provider_id"], m["client_model"], m["upstream_model"],
                int(m.get("enabled", True)), int(prio),
            ),
        )
        return cur.lastrowid


def update_mapping(mapping_id: int, m: dict) -> None:
    fields, values = [], []
    for k in ("provider_id", "client_model", "upstream_model", "enabled", "priority"):
        if k in m and m[k] is not None:
            if k in ("enabled", "priority"):
                values.append(int(m[k]))
            else:
                values.append(m[k])
            fields.append(f"{k}=?")
    if not fields:
        return
    values.append(mapping_id)
    with _lock, get_conn() as conn:
        conn.execute(f"UPDATE model_mappings SET {', '.join(fields)} WHERE id=?", values)


def delete_mapping(mapping_id: int) -> None:
    with _lock, get_conn() as conn:
        conn.execute("DELETE FROM model_mappings WHERE id=?", (mapping_id,))


def insert_log(log: dict) -> int:
    with _lock, get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO request_logs(provider_id, provider_name, client_model, upstream_model, "
            "stream, status, duration_ms, ttft_ms, input_tokens, output_tokens, total_input_tokens, "
            "cache_w, cache_r, error) "
            "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                log.get("provider_id"), log.get("provider_name"),
                log.get("client_model"), log.get("upstream_model"),
                int(log.get("stream", False)),
                log.get("status"), log.get("duration_ms"), log.get("ttft_ms"),
                log.get("input_tokens", 0), log.get("output_tokens", 0),
                log.get("input_tokens", 0) + log.get("output_tokens", 0) + log.get("cache_w", 0) + log.get("cache_r", 0),
                log.get("cache_w", 0), log.get("cache_r", 0),
                log.get("error"),
            ),
        )
        return cur.lastrowid


def list_logs(limit: int = 100, offset: int = 0) -> list[dict]:
    with _lock, get_conn() as conn:
        # 使用 datetime(ts, '+8 hours') 将 UTC 转为 UTC+8 后展示
        rows = conn.execute(
            "SELECT id, datetime(ts, '+8 hours') AS ts, provider_id, provider_name, "
            "client_model, upstream_model, stream, status, duration_ms, ttft_ms, "
            "input_tokens, output_tokens, total_input_tokens, cache_w, cache_r, error "
            "FROM request_logs ORDER BY id DESC LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
    return [dict(r) for r in rows]


def stats_summary() -> dict:
    with _lock, get_conn() as conn:
        total = conn.execute("SELECT COUNT(*) c FROM request_logs").fetchone()["c"]
        errors = conn.execute("SELECT COUNT(*) c FROM request_logs WHERE status>=400 OR error IS NOT NULL").fetchone()["c"]
        agg = conn.execute(
            "SELECT COALESCE(SUM(input_tokens),0) i, COALESCE(SUM(output_tokens),0) o, "
            "COALESCE(SUM(total_input_tokens),0) ti, COALESCE(AVG(ttft_ms),0) t, COALESCE(AVG(duration_ms),0) d, "
            "COALESCE(SUM(cache_w),0) cw, COALESCE(SUM(cache_r),0) cr FROM request_logs"
        ).fetchone()
    return {
        "total": total,
        "errors": errors,
        "input_tokens": agg["i"],
        "output_tokens": agg["o"],
        "total_input_tokens": agg["ti"],
        "avg_ttft_ms": int(agg["t"] or 0),
        "avg_duration_ms": int(agg["d"] or 0),
        "cache_w": agg["cw"],
        "cache_r": agg["cr"],
    }


def stats_hourly(hours: int = 24) -> list[dict]:
    """按小时聚合最近 hours 小时的请求量、错误数、token 与缓存用量。

    SQLite CURRENT_TIMESTAMP 以 UTC 存储，但在查询时转换为 UTC+8 以匹配前端展示。
    返回按时间正序排列的 [{hour, count, errors, input_tokens, output_tokens,
    total_input_tokens, cache_w, cache_r}]，缺失的小时补零。
    """
    from datetime import datetime, timedelta, timezone
    # 使用 UTC+8 生成 bucket 键
    tz = timezone(timedelta(hours=8))
    now = datetime.now(tz)
    buckets: dict[str, dict] = {}
    for i in range(hours - 1, -1, -1):
        t = now - timedelta(hours=i)
        key = t.strftime("%Y-%m-%d %H")
        buckets[key] = {
            "hour": t.strftime("%H:00"),
            "count": 0,
            "errors": 0,
            "input_tokens": 0,
            "output_tokens": 0,
            "total_input_tokens": 0,
            "cache_w": 0,
            "cache_r": 0,
        }
    with _lock, get_conn() as conn:
        # SQLite 时间转换：datetime(ts, '+8 hours') 将 UTC 转为 UTC+8
        rows = conn.execute(
            "SELECT substr(datetime(ts, '+8 hours'), 1, 13) h, COUNT(*) c, "
            "SUM(CASE WHEN status>=400 OR error IS NOT NULL THEN 1 ELSE 0 END) e, "
            "COALESCE(SUM(input_tokens), 0) i, COALESCE(SUM(output_tokens), 0) o, "
            "COALESCE(SUM(total_input_tokens), 0) ti, "
            "COALESCE(SUM(cache_w), 0) cw, COALESCE(SUM(cache_r), 0) cr "
            "FROM request_logs WHERE datetime(ts, '+8 hours') >= ? GROUP BY h",
            ((now - timedelta(hours=hours)).strftime("%Y-%m-%d %H:00:00"),),
        ).fetchall()
    for r in rows:
        if r["h"] in buckets:
            buckets[r["h"]]["count"] = r["c"]
            buckets[r["h"]]["errors"] = r["e"]
            buckets[r["h"]]["input_tokens"] = r["i"]
            buckets[r["h"]]["output_tokens"] = r["o"]
            buckets[r["h"]]["total_input_tokens"] = r["ti"]
            buckets[r["h"]]["cache_w"] = r["cw"]
            buckets[r["h"]]["cache_r"] = r["cr"]
    return list(buckets.values())


def stats_by_provider() -> list[dict]:
    """按提供商聚合请求量、错误数、token 与缓存用量。"""
    with _lock, get_conn() as conn:
        rows = conn.execute(
            "SELECT provider_name, COUNT(*) c, "
            "SUM(CASE WHEN status>=400 OR error IS NOT NULL THEN 1 ELSE 0 END) e, "
            "COALESCE(SUM(input_tokens), 0) i, COALESCE(SUM(output_tokens), 0) o, "
            "COALESCE(SUM(total_input_tokens), 0) ti, "
            "COALESCE(SUM(cache_w), 0) cw, COALESCE(SUM(cache_r), 0) cr, "
            "COALESCE(AVG(ttft_ms), 0) t "
            "FROM request_logs WHERE provider_name IS NOT NULL "
            "GROUP BY provider_name ORDER BY c DESC"
        ).fetchall()
    return [
        {
            "name": r["provider_name"],
            "count": r["c"],
            "errors": r["e"],
            "input_tokens": r["i"],
            "output_tokens": r["o"],
            "total_input_tokens": r["ti"],
            "cache_w": r["cw"],
            "cache_r": r["cr"],
            "avg_ttft_ms": int(r["t"] or 0),
        }
        for r in rows
    ]
