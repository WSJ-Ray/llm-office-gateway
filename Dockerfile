# ====== 阶段 1：构建前端 ======
FROM node:20-alpine AS web-build
WORKDIR /src/web
COPY web/package.json web/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY web/ ./
RUN npm run build
# 构建产物输出到 /src/static

# ====== 阶段 2：Python 运行时 ======
FROM python:3.12-slim
WORKDIR /app

# 仅在依赖变化时重新安装
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制后端代码与前端构建产物
COPY gateway.py .
COPY app/ ./app/
COPY --from=web-build /src/static/ ./static/

EXPOSE 4000

CMD ["uvicorn", "gateway:app", "--host", "0.0.0.0", "--port", "4000"]
