# 真实问题：NewAPI 响应格式兼容性

经过对 NewAPI（QuantumNous/new-api）源代码的深入分析，我发现了问题的真正根因。

## 🔍 官方 Anthropic API 格式

根据 [Anthropic 官方文档](https://platform.claude.com/docs/en/api/messages)，`usage` 字段格式如下：

```json
{
  "input_tokens": 2095,
  "output_tokens": 503,
  "cache_creation_input_tokens": 2051,
  "cache_read_input_tokens": 2051,
  "cache_creation": {                           // 新版：按 TTL 细分
    "ephemeral_1h_input_tokens": 0,
    "ephemeral_5m_input_tokens": 2051
  }
}
```

## 🔍 NewAPI 实际返回格式

来自 [QuantumNous/new-api/dto/claude.go](https://github.com/QuantumNous/new-api/blob/main/dto/claude.go)：

```go
type ClaudeUsage struct {
    InputTokens              int                       `json:"input_tokens"`
    CacheCreationInputTokens int                       `json:"cache_creation_input_tokens"`
    CacheReadInputTokens     int                       `json:"cache_read_input_tokens"`
    OutputTokens             int                       `json:"output_tokens"`
    CacheCreation            *ClaudeCacheCreationUsage `json:"cache_creation,omitempty"`
    ClaudeCacheCreation5mTokens int                     `json:"claude_cache_creation_5_m_tokens"`
    ClaudeCacheCreation1hTokens int                     `json:"claude_cache_creation_1_h_tokens"`
    ServerToolUse               *ClaudeServerToolUse    `json:"server_tool_use,omitempty"`
}
```

**关键差异**：
- NewAPI 在标准的 `cache_creation_input_tokens` 之外，还提供了两个**平铺字段**：
  - `claude_cache_creation_5_m_tokens` （5分钟缓存 token 数）
  - `claude_cache_creation_1_h_tokens` （1小时缓存 token 数）
- 字段名是 `5_m` / `1_h`（带下划线），不是 `5m` / `1h`
- 当 NewAPI 上游直接代理 Anthropic 时，标准字段 `cache_creation_input_tokens` 可能是 0，但平铺字段会有值

## 🐛 原始代码的两个 Bug

### Bug 1：使用 `if u.get(...)` 跳过 0 值

```python
# 原始代码（app/providers/anthropic.py:51-56）
if u.get("input_tokens"):
    usage["input_tokens"] = u["input_tokens"]
if u.get("cache_creation_input_tokens"):
    usage["cache_w"] = u["cache_creation_input_tokens"]
```

**问题**：
- 当 `cache_creation_input_tokens: 0`（无缓存写入）时，分支不执行
- 但 `usage` 是跨请求复用的对象，导致**前一次请求的 cache_w 残留**
- 同样的问题影响 `input_tokens`、`cache_r`、`output_tokens`

### Bug 2：不识别 NewAPI 平铺字段

```python
# 原始代码只识别官方字段
if u.get("cache_creation_input_tokens"):
    usage["cache_w"] = u["cache_creation_input_tokens"]
```

**问题**：
- 当 NewAPI 只在平铺字段中返回缓存数（标准字段为 0）时，会被错误地视为"无缓存"
- 漏掉了 `claude_cache_creation_5_m_tokens` + `claude_cache_creation_1_h_tokens`
- 也漏掉了嵌套对象 `cache_creation.ephemeral_5m_input_tokens` + `ephemeral_1h_input_tokens`

## ✅ 修复方案

修改 [`app/providers/anthropic.py`](app/providers/anthropic.py) 的 `_extract_usage()` 和 `send()`：

### 1. 修复 Bug 1：总是覆盖字段

```python
usage["input_tokens"] = u.get("input_tokens", 0) or 0
usage["cache_w"] = cache_w or 0
usage["cache_r"] = u.get("cache_read_input_tokens", 0) or 0
```

### 2. 修复 Bug 2：兼容 NewAPI 字段

按优先级解析缓存写入：

```python
# 优先级 1: 标准字段
cache_w = u.get("cache_creation_input_tokens", 0)

# 优先级 2: NewAPI 平铺字段 (5m + 1h)
if not cache_w:
    cache_w = (
        u.get("claude_cache_creation_5_m_tokens", 0)
        + u.get("claude_cache_creation_1_h_tokens", 0)
    )

# 优先级 3: NewAPI 嵌套对象
if not cache_w:
    cc = u.get("cache_creation") or {}
    cache_w = (
        cc.get("ephemeral_5m_input_tokens", 0)
        + cc.get("ephemeral_1h_input_tokens", 0)
    )
```

## 📊 验证测试

`test_newapi_format.py` 包含 6 个测试场景：

| # | 场景 | 验证点 |
|---|------|--------|
| 1 | 官方 Anthropic 格式 | `cache_creation_input_tokens: 256` → cache_w=256 |
| 2 | NewAPI 嵌套格式 | `cache_creation.ephemeral_5m_input_tokens: 256` → cache_w=256 |
| 3 | NewAPI 平铺格式 | `claude_cache_creation_5_m_tokens + 1_h_tokens` → cache_w=256 |
| 4 | **0 值覆盖** | 第二次请求 cache_w=0 时，正确覆盖前一次的 256 |
| 5 | message_delta 事件 | `output_tokens` 从 0 更新到 150 |
| 6 | 真实缓存读取 | `cache_read_input_tokens: 256` → cache_r=256 |

**结果**：✅ 全部通过

## 🎯 实际影响

修复前的症状：
- **缓存写入（cache_w）始终为 0 或错误值**：因为 NewAPI 的平铺字段未被识别
- **缓存统计看起来"丢失"**：单次看是对的，但跨请求会累积污染
- **输入 token 统计不准**：0 值不覆盖导致前一次的值残留

修复后：
- ✅ 缓存写入能正确捕获（兼容三种字段位置）
- ✅ 跨请求状态干净（0 值总是覆盖）
- ✅ 与官方 Anthropic 行为完全一致

## 📁 相关文件

- [`app/providers/anthropic.py`](app/providers/anthropic.py) - 主要修复
- [`app/db.py`](app/db.py) - 时区转换 + 缓存统计（之前已修复）
- [`test_newapi_format.py`](test_newapi_format.py) - 6 个验证测试

## 🔗 参考资料

- [Anthropic Messages API 文档](https://platform.claude.com/docs/en/api/messages)
- [Anthropic Streaming Messages 文档](https://platform.claude.com/docs/en/api/messages-streaming)
- [NewAPI GitHub 仓库](https://github.com/QuantumNous/new-api)
- [NewAPI ClaudeUsage 定义](https://github.com/QuantumNous/new-api/blob/main/dto/claude.go)

---

## 💡 后续改进建议

### 1. 也支持 OpenAI Chat 适配器中的 NewAPI 字段

[`app/providers/openai_chat.py`](app/providers/openai_chat.py) 当前只读取 `prompt_tokens_cached`，
没有读取 cache 写入字段。但 OpenAI Chat Completions 标准协议本身没有 prompt caching，
所以这其实是 NewAPI 扩展字段，需要在适配器中显式处理。

### 2. 增加更多诊断日志

在解析失败时打印原始 usage 字段，便于后续诊断其他格式问题：

```python
try:
    rj = resp.json()
    u = rj.get("usage", {}) or {}
    # ... 解析逻辑
except Exception as e:
    print(f"[WARN] Failed to parse usage: {e}, raw={resp.text[:500]}")
```

### 3. 单元测试覆盖率

为 `_extract_usage` 添加更多边界测试：
- 空 usage 字段
- 负数 token（异常情况）
- 浮点类型（部分 mock 返回）