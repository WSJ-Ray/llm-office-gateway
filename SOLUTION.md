# 前端日志时差与缓存统计问题解决方案

## 📋 问题诊断

### 问题 1：时差问题（UTC vs UTC+8）
- **现象**：Dashboard 和日志页面的时间戳比北京时间慢 8 小时
- **根因**：SQLite `CURRENT_TIMESTAMP` 使用 UTC，后端 `stats_hourly()` 使用 `datetime.utcnow()`，前端直接显示
- **影响**：小时趋势图 X 轴标签、日志列表时间戳均为 UTC

### 问题 2：缓存统计缺失
- **现象**：Dashboard 小时趋势图和按提供商分布无缓存数据
- **根因**：`stats_hourly()` 和 `stats_by_provider()` SQL 未聚合 `cache_w`/`cache_r` 字段
- **影响**：无法观察缓存命中趋势，虽然单条日志有记录

---

## ✅ 推荐方案：后端统一转换为 UTC+8

**优势**：
- 集中处理，前端无需改动
- 适合中国用户单一时区场景
- 数据库 `ts` 字段仍为 UTC（标准），仅在查询/展示时转换

**实现步骤**：

### 1️⃣ 修改 `app/db.py` 统计函数

#### 修改 `stats_hourly()` — 增加缓存统计 + UTC+8 转换

```python
def stats_hourly(hours: int = 24) -> list[dict]:
    """按小时聚合最近 hours 小时的请求量、错误数、token 与缓存用量。

    SQLite CURRENT_TIMESTAMP 以 UTC 存储，但在查询时转换为 UTC+8 以匹配前端展示。
    返回按时间正序排列的 [{hour, count, errors, input_tokens, output_tokens,
    cache_w, cache_r}]，缺失的小时补零。
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
            "cache_w": 0,
            "cache_r": 0,
        }
    with _lock, get_conn() as conn:
        # SQLite 时间转换：datetime(ts, '+8 hours') 将 UTC 转为 UTC+8
        rows = conn.execute(
            "SELECT substr(datetime(ts, '+8 hours'), 1, 13) h, COUNT(*) c, "
            "SUM(CASE WHEN status>=400 OR error IS NOT NULL THEN 1 ELSE 0 END) e, "
            "COALESCE(SUM(input_tokens), 0) i, COALESCE(SUM(output_tokens), 0) o, "
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
            buckets[r["h"]]["cache_w"] = r["cw"]
            buckets[r["h"]]["cache_r"] = r["cr"]
    return list(buckets.values())
```

**核心改动**：
1. 使用 `timezone(timedelta(hours=8))` 生成 UTC+8 时间基准
2. SQL 中用 `datetime(ts, '+8 hours')` 将 UTC 转为 UTC+8
3. 新增 `cache_w` / `cache_r` 聚合

---

#### 修改 `stats_by_provider()` — 增加缓存统计

```python
def stats_by_provider() -> list[dict]:
    """按提供商聚合请求量、错误数、token 与缓存用量。"""
    with _lock, get_conn() as conn:
        rows = conn.execute(
            "SELECT provider_name, COUNT(*) c, "
            "SUM(CASE WHEN status>=400 OR error IS NOT NULL THEN 1 ELSE 0 END) e, "
            "COALESCE(SUM(input_tokens), 0) i, COALESCE(SUM(output_tokens), 0) o, "
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
            "cache_w": r["cw"],
            "cache_r": r["cr"],
            "avg_ttft_ms": int(r["t"] or 0),
        }
        for r in rows
    ]
```

---

#### 新增 `list_logs()` 时间转换 — 日志列表显示 UTC+8

```python
def list_logs(limit: int = 100, offset: int = 0) -> list[dict]:
    with _lock, get_conn() as conn:
        rows = conn.execute(
            # 使用 datetime(ts, '+8 hours') 将 UTC 转为 UTC+8 后展示
            "SELECT id, datetime(ts, '+8 hours') AS ts, provider_id, provider_name, "
            "client_model, upstream_model, stream, status, duration_ms, ttft_ms, "
            "input_tokens, output_tokens, cache_w, cache_r, error "
            "FROM request_logs ORDER BY id DESC LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
    return [dict(r) for r in rows]
```

---

### 2️⃣ 修改前端展示缓存数据（可选）

虽然后端已返回 `cache_w`/`cache_r`，前端目前未在小时趋势图展示。可以选择：

#### 选项 A：仅在 tooltip 中显示（最小改动）

修改 [Dashboard.jsx:21](web/src/pages/Dashboard.jsx#L21) 的 `Bar` 组件 `title` 属性：

```jsx
const Bar = ({ h, max }) => {
  const pct = max > 0 ? (h.count / max) * 100 : 0
  const hasErr = h.errors > 0
  const cacheTotal = (h.cache_r || 0) + (h.cache_w || 0)
  return (
    <div 
      className="flex-1 flex flex-col items-center gap-1 group relative" 
      title={`${h.hour} · ${h.count} 次${h.errors ? `（${h.errors} 错误）` : ''}${cacheTotal > 0 ? ` · 缓存 ${cacheTotal}` : ''}`}
    >
      {/* ... 原有渲染逻辑 */}
    </div>
  )
}
```

#### 选项 B：在按提供商卡片显示缓存命中率

修改 [Dashboard.jsx:139-151](web/src/pages/Dashboard.jsx#L139) 的提供商卡片：

```jsx
{byProvider.map((p) => {
  const pct = (p.count / maxProv) * 100
  const errPct = p.count > 0 ? (p.errors / p.count) * 100 : 0
  const cacheHit = p.input_tokens > 0 
    ? ((p.cache_r / p.input_tokens) * 100).toFixed(1) + '%'
    : '—'
  return (
    <div key={p.name} className="space-y-1.5">
      {/* ... 原有标题与进度条 */}
      <div className="text-[10px] text-text-muted font-mono">
        入 {fmtNum(p.input_tokens)} · 出 {fmtNum(p.output_tokens)} · TTFT {fmtMs(p.avg_ttft_ms)}
        {p.cache_r > 0 && <span className="text-success"> · 缓存 {cacheHit}</span>}
      </div>
    </div>
  )
})}
```

---

## 🔍 验证步骤

### 1. 时区验证
```bash
# 1. 启动服务
python gateway.py

# 2. 发送一个测试请求，观察控制台日志时间
# 3. 访问 Dashboard，检查"最近请求"卡片的时间戳是否为 UTC+8（北京时间）
# 4. 观察小时趋势图 X 轴：当前时间应该落在图表右侧，而非提前 8 小时
```

### 2. 缓存统计验证
```bash
# 1. 在 provider extra_config 中启用 enable_prompt_caching: true
# 2. 发送多次相同的请求（触发缓存读取）
# 3. Dashboard 按提供商分布应显示 cache_r > 0
# 4. 日志页面 "缓存 r/w" 列应为绿色数字
```

---

## 🎯 预期效果

### 修改前
```
Dashboard 小时趋势图 X 轴：  00:00 ... 08:00（实际是北京时间 08:00 - 16:00）
日志时间戳：                  2026-06-20 02:15:43（实际是北京时间 10:15:43）
按提供商分布：                无缓存数据
```

### 修改后
```
Dashboard 小时趋势图 X 轴：  08:00 ... 16:00（北京时间）
日志时间戳：                  2026-06-20 10:15:43（北京时间）
按提供商分布：                显示 "入 12.5K · 出 3.2K · 缓存 95.2%"
```

---

## 🔄 备选方案：前端动态时区转换（国际化场景）

若未来需要支持多时区用户，可改为前端转换：

### 后端：返回 UTC + 时区偏移量
```python
# app/routes/admin.py
@router.get("/admin/stats")
async def get_stats(request: Request):
    return {
        "summary": db.stats_summary(),
        "hourly": db.stats_hourly(),
        "timezone_offset": 8,  # 服务器时区偏移（小时）
        # ...
    }
```

### 前端：使用 date-fns 转换
```jsx
import { addHours, format } from 'date-fns'

const fmtTime = (utcTs, offset) => {
  const local = addHours(new Date(utcTs), offset)
  return format(local, 'HH:mm:ss')
}

// 使用
<span>{fmtTime(l.ts, stats?.timezone_offset || 0)}</span>
```

**权衡**：灵活但复杂，仅在真正需要多时区时采用。

---

## 📝 总结

| 问题 | 解决方式 | 改动文件 |
|------|----------|----------|
| 时差 8 小时 | SQL 中用 `datetime(ts, '+8 hours')` 转换 | `app/db.py` |
| 缓存统计缺失 | 聚合函数增加 `SUM(cache_w)` / `SUM(cache_r)` | `app/db.py` |
| 前端显示优化 | （可选）在 tooltip / 卡片显示缓存命中率 | `web/src/pages/Dashboard.jsx` |

**实施建议**：
1. 先修改后端 `app/db.py`（必需）
2. 重启服务验证时区与缓存统计
3. 根据需求选择性优化前端展示

**兼容性**：
- SQLite 原生支持 `datetime(ts, '+8 hours')` 函数
- 数据库无需迁移，`ts` 字段保持 UTC 存储
- 前端代码与后端 API 完全兼容
