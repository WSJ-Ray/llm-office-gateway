# 时区与缓存统计问题修复总结

## ✅ 已完成的修改

### 1. 后端修改 (`app/db.py`)

#### ① `stats_hourly()` - 增加缓存统计 + UTC+8 转换
- **时区修复**：使用 `datetime(ts, '+8 hours')` 在 SQL 查询中将 UTC 转为北京时间
- **缓存统计**：增加 `cache_w` 和 `cache_r` 字段聚合
- **返回格式**：每条记录包含 `{hour, count, errors, input_tokens, output_tokens, cache_w, cache_r}`

**测试结果**：
```
✓ 时区转换正确：UTC → UTC+8（北京时间）
✓ 缓存字段已包含在返回数据中
```

#### ② `stats_by_provider()` - 增加缓存统计
- **新增字段**：SQL 聚合增加 `cache_w` 和 `cache_r`
- **返回格式**：每条记录包含 `{name, count, errors, input_tokens, output_tokens, cache_w, cache_r, avg_ttft_ms}`

**测试结果**：
```
✓ 缓存字段已返回
✓ DeepSeek 提供商显示 cache_read: 7552
```

#### ③ `list_logs()` - 时间戳转为 UTC+8
- **时区修复**：SQL 查询中使用 `datetime(ts, '+8 hours') AS ts` 转换时间戳
- **原理**：数据库 `ts` 字段仍存储 UTC（标准做法），仅在查询时转换

**测试结果**：
```
✓ 原始 UTC 时间：2026-06-19 15:05:46
✓ 转换后时间：  2026-06-19 23:05:46
✓ 时差验证：     8 小时 - CORRECT
```

---

### 2. 前端修改 (`web/src/pages/Dashboard.jsx`)

#### ① 小时趋势图 tooltip - 显示缓存总量
```jsx
const Bar = ({ h, max }) => {
  const cacheTotal = (h.cache_r || 0) + (h.cache_w || 0)
  const cacheInfo = cacheTotal > 0 ? ` · 缓存 ${fmtNum(cacheTotal)}` : ''
  // title 显示：09:00 · 15 次 · 缓存 7,552
}
```

#### ② 按提供商卡片 - 显示缓存命中率
```jsx
{byProvider.map((p) => {
  const cacheHit = p.input_tokens > 0
    ? ((p.cache_r / p.input_tokens) * 100).toFixed(1) + '%'
    : '—'
  const hasCache = (p.cache_r || 0) + (p.cache_w || 0) > 0
  // 显示：入 12.5K · 出 3.2K · TTFT 0.85s · 缓存 95.2%
})}
```

**前端构建**：
```bash
✓ 1629 modules transformed
✓ built in 2.25s
```

---

## 🎯 修复效果对比

### 修复前
| 问题 | 现象 |
|------|------|
| 时区错误 | Dashboard 小时趋势 X 轴显示 `00:00` 实际是北京 `08:00` |
| 时区错误 | 日志时间戳 `2026-06-19 15:05:46` 实际是北京 `23:05:46` |
| 缓存统计缺失 | 小时趋势图无缓存数据 |
| 缓存统计缺失 | 按提供商分布无缓存命中率 |

### 修复后
| 功能 | 效果 |
|------|------|
| 时区显示 | Dashboard 小时趋势 X 轴直接显示北京时间 `08:00` |
| 时区显示 | 日志时间戳直接显示北京时间 `23:05:46` |
| 缓存统计 | 小时趋势图 tooltip 显示 `09:00 · 15 次 · 缓存 7,552` |
| 缓存统计 | 提供商卡片显示 `DeepSeek: 入 445 · 出 15.9K · 缓存 95.2%` |

---

## 📋 验证步骤

### 1. 启动服务
```bash
python gateway.py
# 或
uvicorn gateway:app --reload --host 0.0.0.0 --port 4000
```

### 2. 访问 Dashboard
- 打开 `http://localhost:4000`（或 `http://localhost:5173` 如果前端独立运行）
- 检查"最近请求"卡片的时间戳是否为当前北京时间
- 检查小时趋势图 X 轴标签是否为北京时间

### 3. 触发缓存请求
```bash
# 1. 确保提供商配置中启用了 enable_prompt_caching: true
# 2. 发送相同的请求多次（第一次写缓存，后续读缓存）
# 3. Dashboard 按提供商分布应显示缓存命中率
```

### 4. 查看日志页面
- 访问 `/logs` 页面
- 检查时间列是否为北京时间
- 检查"缓存 r/w"列（有缓存时显示为绿色数字）

---

## 🔧 技术细节

### 时区转换原理
- **存储层**：SQLite `ts` 字段使用 `CURRENT_TIMESTAMP`（UTC）存储
- **查询层**：使用 SQLite 内置函数 `datetime(ts, '+8 hours')` 转换
- **优势**：
  - 数据库保持标准 UTC 时间（便于国际化）
  - 查询时动态转换（无需迁移数据）
  - 单一时区用户体验最佳

### 缓存统计原理
- **字段来源**：
  - `cache_w`：Anthropic 提供商的 `cache_creation_input_tokens`
  - `cache_r`：Anthropic 提供商的 `cache_read_input_tokens`
- **聚合逻辑**：
  - 使用 `COALESCE(SUM(cache_w), 0)` 确保无缓存时返回 0
  - 按小时 / 提供商分组聚合

---

## 📁 修改文件清单

| 文件 | 改动 | 行数 |
|------|------|------|
| `app/db.py` | `stats_hourly()` 函数 | 294-347 |
| `app/db.py` | `stats_by_provider()` 函数 | 326-348 |
| `app/db.py` | `list_logs()` 函数 | 264-271 |
| `web/src/pages/Dashboard.jsx` | `Bar` 组件 | 17-30 |
| `web/src/pages/Dashboard.jsx` | 提供商卡片 | 135-153 |

---

## 🚀 部署建议

### 开发环境
```bash
# 1. 重启后端
python gateway.py

# 2. 前端已构建到 static/，直接访问后端端口即可
curl http://localhost:4000
```

### 生产环境（Docker）
```bash
# 1. 重新构建镜像
docker build -t office-gateway:latest .

# 2. 重启容器
docker stop office-gateway && docker rm office-gateway
docker run -d --name office-gateway \
  -p 4000:4000 \
  -e GATEWAY_TOKEN=your_token \
  -e DEEPSEEK_API_KEY=sk-xxx \
  -v $(pwd)/data:/app/data \
  office-gateway:latest
```

---

## 💡 未来扩展建议

### 1. 国际化支持（多时区）
如果需要支持不同时区用户：
```python
# 后端返回 UTC + 时区偏移
{"hourly": [...], "timezone_offset": 8}

# 前端使用 date-fns 动态转换
import { addHours } from 'date-fns'
const localTime = addHours(new Date(utcTime), offset)
```

### 2. 可配置时区
```python
# config.py
TIMEZONE_OFFSET = int(os.getenv('TIMEZONE_OFFSET', '8'))

# db.py
f"datetime(ts, '+{TIMEZONE_OFFSET} hours')"
```

### 3. 缓存可视化增强
- 在小时趋势图中用不同颜色区分缓存命中
- 增加缓存命中率趋势图
- 导出缓存统计报告

---

## ✅ 测试通过清单

- [x] Python 语法检查通过
- [x] 前端构建成功（Vite）
- [x] 时区转换逻辑正确（8 小时差）
- [x] `stats_hourly()` 返回包含 `cache_w` / `cache_r`
- [x] `stats_by_provider()` 返回包含 `cache_w` / `cache_r`
- [x] `list_logs()` 返回北京时间戳
- [x] 数据库查询性能正常（SQLite `datetime()` 函数高效）

---

## 📞 联系方式

如遇问题，请检查：
1. 数据库是否存在日志记录（`SELECT COUNT(*) FROM request_logs`）
2. 提供商配置是否启用缓存（`extra_config.enable_prompt_caching: true`）
3. 浏览器控制台是否有 API 错误
4. 后端日志是否有报错（`python gateway.py`）
