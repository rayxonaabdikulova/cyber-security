"""
CyberLab DPI skaner — FastAPI backend + loyiha sahifasini bir portda berish.

Ishga tushirish (faqat localhost):
    cd api
    pip install -r requirements.txt
    uvicorn main:app --reload --host 127.0.0.1 --port 8000

Internet (domen / VPS / bulut) — boshqa qurilmalar ulanishi uchun:
    cd api && uvicorn main:app --host 0.0.0.0 --port 8000
    yoki Dockerfile (PORT). HTTPS odatda nginx/Caddy/platforma terminating qiladi:
    konteynerda --proxy-headers (Dockerfile da bor) kerak.

Ixtiyoriy muhit: ALLOWED_HOSTS=cyberlab.uz,www.cyberlab.uz — faqat shu Host sarlavhalari.

Brauzerda oching (diskdan emas): http://127.0.0.1:8000
Shunda HTML/CSS/JS va POST /api/scan-file bir xil manzildan — «Failed to fetch» yo‘qoladi.

Form maydoni nomi: ``file`` (multipart/form-data).
"""

from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from pydantic import BaseModel, Field
from starlette.staticfiles import StaticFiles

MAX_UPLOAD_BYTES = 50 * 1024 * 1024


def _ext(name: str) -> str:
    return os.path.splitext(name or "")[1].lower()


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def format_size_kb_mb(size_bytes: int) -> dict[str, Any]:
    kb = round(size_bytes / 1024, 3) if size_bytes else 0.0
    mb = round(size_bytes / (1024 * 1024), 6) if size_bytes else 0.0
    if size_bytes >= 1024 * 1024:
        human = f"{mb} MB ({size_bytes} bayt)"
    else:
        human = f"{kb} KB ({size_bytes} bayt)"
    return {
        "size_bytes": size_bytes,
        "size_kb": kb,
        "size_mb": mb,
        "size_human": human,
    }


THREAT_EXT = frozenset({".exe", ".apk", ".bat"})
THREAT_NAME = re.compile(r"(virus|malware)", re.IGNORECASE)


def mock_dpi_ips_threat(filename: str) -> bool:
    ext = _ext(filename)
    if ext in THREAT_EXT:
        return True
    base = os.path.basename(filename or "")
    if THREAT_NAME.search(base):
        return True
    return False


class ScanFileResponse(BaseModel):
    filename: str
    extension: str
    sha256_hash: str
    size_bytes: int
    size_kb: float
    size_mb: float
    size_human: str = Field(description="O‘qiladigan hajm (KB yoki MB)")
    status: str
    action: str


app = FastAPI(title="CyberLab DPI Scanner", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Oxirgi qo‘shilgan tepada ishlaydi — noto‘g‘ri Host shu bilan darhol kesiladi.
_allowed_hosts = os.environ.get("ALLOWED_HOSTS", "").strip()
if _allowed_hosts:
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=[
            h.strip() for h in _allowed_hosts.split(",") if h.strip()
        ],
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/scan-file", response_model=ScanFileResponse)
async def api_scan_file(file: UploadFile = File(...)) -> ScanFileResponse:
    raw = await file.read()
    name = file.filename or "upload"

    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Fayl juda katta. Maksimum: {MAX_UPLOAD_BYTES} bayt.",
        )

    digest = sha256_hex(raw)
    ext = _ext(name)
    sizes = format_size_kb_mb(len(raw))

    if mock_dpi_ips_threat(name):
        return ScanFileResponse(
            filename=name,
            extension=ext if ext else "",
            sha256_hash=digest,
            status="🚨 XAVF ANIQILANDI (Malicious)",
            action="IPS tomonidan bloklandi",
            **sizes,
        )

    return ScanFileResponse(
        filename=name,
        extension=ext if ext else "",
        sha256_hash=digest,
        status="✅ Fayl toza (Safe)",
        action="IPS: fayl yuklamasi ruxsat etildi (simulyatsiya)",
        **sizes,
    )


# Loyiha ildizi (api papkasining ustidagi Cb): index.html, style.css, script.js
_FRONTEND_DIR = Path(__file__).resolve().parent.parent
if (_FRONTEND_DIR / "index.html").is_file():
    app.mount(
        "/",
        StaticFiles(directory=str(_FRONTEND_DIR), html=True),
        name="frontend",
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
