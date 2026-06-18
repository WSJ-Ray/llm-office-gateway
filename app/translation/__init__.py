"""Anthropic request -> OpenAI Chat Completions request translation."""
from typing import Any


def _tool_to_openai(t: dict) -> dict:
    """Convert Anthropic tool def to OpenAI function tool def.

    Anthropic: {name, description, input_schema}
    OpenAI:    {type:"function", function:{name, description, parameters}}
    """
    return {
        "type": "function",
        "function": {
            "name": t.get("name", ""),
            "description": t.get("description", ""),
            "parameters": t.get("input_schema") or {"type": "object", "properties": {}},
        },
    }


def _content_to_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        out = []
        for b in content:
            if isinstance(b, dict) and b.get("type") == "text":
                out.append(b.get("text", ""))
            elif isinstance(b, dict) and b.get("type") == "tool_result":
                c = b.get("content")
                if isinstance(c, list):
                    out.append("\n".join(x.get("text", "") for x in c if x.get("type") == "text"))
                else:
                    out.append(str(c))
        return "\n".join(out)
    return str(content or "")


def anthropic_to_openai_request(body: dict) -> dict:
    """Translate an Anthropic Messages request to OpenAI Chat Completions request."""
    out: dict = {"model": body["model"]}

    messages: list[dict] = []

    # system: string OR list[{type:text,text}, ...]
    system = body.get("system")
    if system:
        if isinstance(system, str):
            messages.append({"role": "system", "content": system})
        elif isinstance(system, list):
            sys_text = "\n".join(
                b.get("text", "") for b in system if b.get("type") == "text"
            )
            if sys_text:
                messages.append({"role": "system", "content": sys_text})

    for m in body.get("messages", []):
        role = m.get("role")
        content = m.get("content")
        if role == "user":
            if isinstance(content, str):
                messages.append({"role": "user", "content": content})
            else:
                # collect tool_result blocks as 'tool' messages, rest as 'user' text
                user_parts: list[str] = []
                for b in (content or []):
                    btype = b.get("type")
                    if btype == "text":
                        user_parts.append(b.get("text", ""))
                    elif btype == "tool_result":
                        tr_content = b.get("content")
                        if isinstance(tr_content, list):
                            tr_text = "\n".join(
                                x.get("text", "") for x in tr_content if x.get("type") == "text"
                            )
                        else:
                            tr_text = str(tr_content or "")
                        messages.append(
                            {
                                "role": "tool",
                                "tool_call_id": b.get("tool_use_id", ""),
                                "content": tr_text,
                            }
                        )
                if user_parts:
                    messages.append({"role": "user", "content": "\n".join(user_parts)})
        elif role == "assistant":
            if isinstance(content, str):
                messages.append({"role": "assistant", "content": content})
            else:
                text_parts: list[str] = []
                tool_calls: list[dict] = []
                for b in (content or []):
                    btype = b.get("type")
                    if btype == "text":
                        text_parts.append(b.get("text", ""))
                    elif btype == "tool_use":
                        import json
                        tool_calls.append(
                            {
                                "id": b.get("id", ""),
                                "type": "function",
                                "function": {
                                    "name": b.get("name", ""),
                                    "arguments": json.dumps(b.get("input") or {}),
                                },
                            }
                        )
                msg: dict = {"role": "assistant"}
                msg["content"] = "\n".join(text_parts) if text_parts else None
                if tool_calls:
                    msg["tool_calls"] = tool_calls
                messages.append(msg)
    out["messages"] = messages

    if "max_tokens" in body:
        out["max_tokens"] = body["max_tokens"]
    for k in ("temperature", "top_p", "stop_sequences", "stream"):
        if k in body:
            out[k] = body[k]

    tools = body.get("tools")
    if tools:
        out["tools"] = [_tool_to_openai(t) for t in tools if t.get("name")]
    tc = body.get("tool_choice")
    if tc is not None:
        if isinstance(tc, str):
            out["tool_choice"] = tc  # "auto" | "any" | "none"
        elif isinstance(tc, dict):
            kind = tc.get("type")
            if kind == "tool":
                out["tool_choice"] = {"type": "function", "function": {"name": tc.get("name", "")}}
            else:
                out["tool_choice"] = "auto"

    return out
