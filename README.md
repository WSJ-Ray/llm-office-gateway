# DeepSeek Office Gateway

让 Claude for Excel / PowerPoint / Word / Outlook 插件接入 DeepSeek 模型。

## 原理

```
Claude Office 插件 (Anthropic API 格式)
      │
      ▼  http://127.0.0.1:4000/v1/messages
      │
本地网关 (gateway.py) ─── 透明代理 ─── DeepSeek Anthropic API
                                           │
                              https://api.deepseek.com/anthropic
```

DeepSeek 原生支持 Anthropic Messages API，网关只做两件事：
1. 去掉 tools 里的 `type: "custom"` 字段（DeepSeek 只认 web_search 类型）
2. 流式请求走真正的流式转发，避免超时

## 快速开始

### 1. 启动网关

双击 `启动网关.bat`，会出现一个 PowerShell 窗口，显示网关启动日志。

### 2. 配置 Office 插件

打开 Excel / PowerPoint / Word / Outlook，找到 Claude 插件，选择 **Enterprise gateway** 登录：

| 配置项 | 值 |
|--------|-----|
| Gateway URL | `http://127.0.0.1:4000` |
| API Token | `deepseek-office-key-2024` |
| 模型 | 自动选择（网关返回 `claude-sonnet-4-5-20250929`） |

### 3. 开始使用

连接成功后即可正常对话、读写文档。

## 模型映射

DeepSeek 自动映射 Claude 模型名：

| 插件使用的模型 | DeepSeek 实际模型 |
|---------------|------------------|
| claude-sonnet-* | deepseek-v4-flash |
| claude-opus-* | deepseek-v4-pro |
| claude-haiku-* | deepseek-v4-flash |

## 文件说明

| 文件 | 用途 |
|------|------|
| `启动网关.bat` | 一键启动，双击即可 |
| `start_gateway.ps1` | 网关启动脚本（bat 内部调用） |
| `gateway.py` | 网关主程序 |
| `gateway_log.txt` | 实时请求日志 |
| `litellm_config.yaml` | 废弃（之前用的 LiteLLM 配置，已替换） |
| `start_all.ps1` / `start_litellm.ps1` | 废弃的启动脚本 |
| `tunnel_*.txt` / `lt_*.txt` | 废弃的隧道日志 |

## 修改配置

### 更换 API Key

编辑 `start_gateway.ps1`，修改以下两行：

```powershell
$env:DEEPSEEK_API_KEY = "你的DeepSeek API Key"
$env:GATEWAY_TOKEN = "你的自定义网关令牌"
```

然后同步修改 Office 插件里的 API Token。

### 更换端口

编辑 `gateway.py` 最后一行：

```python
uvicorn.run(app, host="0.0.0.0", port=4000)  # 改这里的端口
```

同时在 `start_gateway.ps1` 中不需要修改（脚本不关心端口）。

## 常见问题

**Q: 提示 "Connection error"？**

A: 确认 `启动网关.bat` 打开的窗口还在运行，没有关闭或报错。

**Q: 能聊天但不能读写文档？**

A: 确认网关是最新版（当前版本已修复）。先关闭旧窗口，重新双击 `启动网关.bat`。

**Q: 提示 "StreamFirstByteTimeoutError"？**

A: 网关版本过旧，重新双击 `启动网关.bat` 启动最新版。

**Q: 想在公司其他电脑也用？**

A: 把网关部署到一台有公网 IP 的服务器上，其他电脑改成该服务器的地址即可。注意修改 `gateway.py` 的 CORS 白名单。

## 依赖

- Python 3.10+
- 依赖库：`fastapi`, `httpx`, `uvicorn`, `python-multipart`

安装命令：

```powershell
pip install fastapi httpx uvicorn python-multipart
```

## 参考

- [DeepSeek Anthropic API 文档](https://api-docs.deepseek.com/zh-cn/guides/anthropic_api)
- [Claude Office 插件第三方平台配置](https://support.claude.com/en/articles/13945233-use-claude-in-excel-and-powerpoint-with-an-llm-gateway)
