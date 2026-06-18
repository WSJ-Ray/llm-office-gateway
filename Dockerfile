FROM python:3.12-slim

WORKDIR /app

# 仅在依赖变化时重新安装，利用 Docker 层缓存
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY gateway.py .

EXPOSE 4000

CMD ["uvicorn", "gateway:app", "--host", "0.0.0.0", "--port", "4000"]
