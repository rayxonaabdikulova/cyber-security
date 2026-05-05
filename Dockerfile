# Loyiha ildizi (index.html + api/) — bitta konteynerda FastAPI + statik sahifa
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

COPY api/requirements.txt ./api/requirements.txt
RUN pip install --no-cache-dir -r api/requirements.txt

COPY . .

WORKDIR /app/api

EXPOSE 8000

# PORT — bulut; proxy-headers — domen ostidagi HTTPS (X-Forwarded-Proto) uchun
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
