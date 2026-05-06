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

Hudud bloklash (ixtiyoriy): ALLOWED_COUNTRIES=UZ — bo‘sh yoki * bo‘lsa yopiq blok yo‘q (Render kabi
hostingda country header bo‘lmasa shu rejim kerak).

Brauzerda oching (diskdan emas): http://127.0.0.1:8000
Shunda HTML/CSS/JS va POST /api/scan-file bir xil manzildan — «Failed to fetch» yo‘qoladi.

Form maydoni nomi: ``file`` (multipart/form-data).
"""

from __future__ import annotations

import hashlib
import ipaddress
import os
import re
import socket
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from pydantic import BaseModel, Field
from starlette.responses import JSONResponse
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


class UrlScanRequest(BaseModel):
    url: str = Field(min_length=4, max_length=2048)


class UrlScanResponse(BaseModel):
    url: str
    final_url: str
    status: str
    risk_score: int
    verdict: str
    reasons: list[str]
    recommendations: list[str]


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

# Bo‘sh yoki "*" = yopiq blok yo‘q (Render/VPS uchun default). Hudud blokini yoqish:
# ALLOWED_COUNTRIES=UZ  va reverse proxy dan mamlakat headeri kerak (masalan cf-ipcountry).
_allowed_countries_raw = os.environ.get("ALLOWED_COUNTRIES", "").strip()
if not _allowed_countries_raw or _allowed_countries_raw == "*":
    ALLOWED_COUNTRIES: frozenset[str] = frozenset()
else:
    ALLOWED_COUNTRIES = frozenset(
        c.strip().upper()
        for c in _allowed_countries_raw.split(",")
        if c.strip()
    )
COUNTRY_HEADERS = ("cf-ipcountry", "x-country-code", "x-vercel-ip-country")
LOCALHOST_IPS = {"127.0.0.1", "::1", "localhost"}


@app.middleware("http")
async def country_gate(request, call_next):
    if not ALLOWED_COUNTRIES:
        return await call_next(request)

    client_ip = (request.client.host if request.client else "").strip()
    if client_ip in LOCALHOST_IPS:
        return await call_next(request)

    country = ""
    for header in COUNTRY_HEADERS:
        value = request.headers.get(header, "").strip()
        if value:
            country = value.upper()
            break

    if not country:
        return JSONResponse(
            status_code=403,
            content={
                "detail": (
                    "Mamlakat aniqlanmadi. Ruxsat yo‘q. "
                    "Reverse proxy'da country header yoqing."
                )
            },
        )

    if country not in ALLOWED_COUNTRIES:
        return JSONResponse(
            status_code=403,
            content={
                "detail": (
                    f"Ushbu hududdan kirish bloklangan ({country}). "
                    f"Ruxsat etilgan hududlar: {sorted(ALLOWED_COUNTRIES)}."
                )
            },
        )

    return await call_next(request)


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


SUSPICIOUS_HOST_KEYWORDS = (
    "login",
    "verify",
    "secure",
    "account",
    "bank",
    "wallet",
)
SUSPICIOUS_PATH_KEYWORDS = (
    "signin",
    "verify",
    "reset-password",
    "update-account",
    "download",
    "invoice",
)
URL_SHORTENERS = {"bit.ly", "tinyurl.com", "t.co", "rb.gy"}
SUSPICIOUS_TLDS = {".zip", ".top", ".click", ".country", ".gq"}
DANGEROUS_FILE_EXT_RE = re.compile(
    r"\.(exe|apk|msi|bat|cmd|scr|js|vbs)(?:$|[?#])",
    re.IGNORECASE,
)


def _is_ip_host(hostname: str) -> bool:
    try:
        ipaddress.ip_address(hostname)
        return True
    except ValueError:
        return False


def _looks_like_localhost(hostname: str) -> bool:
    if hostname in {"localhost", "127.0.0.1", "::1"}:
        return True
    if hostname.endswith(".local"):
        return True
    return False


def analyze_url_risk(raw_url: str) -> UrlScanResponse:
    url = (raw_url or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL bo‘sh bo‘lishi mumkin emas.")

    if not re.match(r"^[a-zA-Z][a-zA-Z0-9+\-.]*://", url):
        url = f"https://{url}"

    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="Faqat http/https URL qo‘llanadi.")
    if not parsed.netloc:
        raise HTTPException(status_code=400, detail="URL noto‘g‘ri formatda.")

    host = (parsed.hostname or "").lower()
    if not host:
        raise HTTPException(status_code=400, detail="Host aniqlanmadi.")

    risk = 0
    reasons: list[str] = []
    recs: list[str] = []

    if parsed.scheme != "https":
        risk += 25
        reasons.append("HTTPS yo‘q (trafik shifrlanmagan bo‘lishi mumkin).")
        recs.append("HTTPS ishlatadigan rasmiy domenni tanlang.")

    if "@" in parsed.netloc:
        risk += 30
        reasons.append("URL ichida '@' bor (obfuscation/phishing belgisi).")

    if _looks_like_localhost(host):
        risk += 10
        reasons.append("Lokal host manzili (internet sayti emas).")
    elif _is_ip_host(host):
        risk += 20
        reasons.append("Domen o‘rniga to‘g‘ridan-to‘g‘ri IP ishlatilgan.")

    if host.startswith("xn--"):
        risk += 15
        reasons.append("Punycode domen (vizual spoof ehtimoli bor).")

    host_parts = host.split(".")
    if len(host_parts) >= 5:
        risk += 12
        reasons.append("Juda chuqur subdomain zanjiri kuzatildi.")

    tld = "." + host_parts[-1] if len(host_parts) > 1 else ""
    if tld in SUSPICIOUS_TLDS:
        risk += 15
        reasons.append(f"Shubhali TLD aniqlandi: {tld}.")

    if host in URL_SHORTENERS:
        risk += 18
        reasons.append("Qisqartirilgan link xizmati (asl manzil yashirilgan bo‘lishi mumkin).")

    host_word_hits = [w for w in SUSPICIOUS_HOST_KEYWORDS if w in host]
    if host_word_hits:
        risk += 10
        reasons.append(
            f"Hostda ijtimoiy muhandislikka xos so‘zlar bor: {', '.join(host_word_hits)}."
        )

    path_l = (parsed.path or "").lower()
    path_hits = [w for w in SUSPICIOUS_PATH_KEYWORDS if w in path_l]
    if path_hits:
        risk += 10
        reasons.append(
            f"Path shubhali yo‘nalishlarni o‘z ichiga oladi: {', '.join(path_hits)}."
        )

    full_lower = url.lower()
    if DANGEROUS_FILE_EXT_RE.search(full_lower):
        risk += 35
        reasons.append("URL bajariladigan yoki skript faylga yo‘naltiryapti.")
        recs.append("Bunday faylni yuklab olmang, sandboxsiz ishga tushirmang.")

    if len(url) > 180:
        risk += 8
        reasons.append("URL juda uzun va chalg‘ituvchi bo‘lishi mumkin.")

    risk = min(risk, 100)
    if risk >= 65:
        status = "MALICIOUS"
        verdict = "XAVFLI"
    elif risk >= 35:
        status = "SUSPICIOUS"
        verdict = "EHTIYOT"
    else:
        status = "SAFE"
        verdict = "XAVFSIZ"

    if not reasons:
        reasons.append("Jiddiy shubhali belgi topilmadi (heuristic tekshiruv).")
    if not recs:
        recs.append("Muhim akkaunt ma'lumotini kiritishdan oldin domenni qo‘lda tekshiring.")
        recs.append("Noma'lum manbalardan fayl yuklab olmaslik tavsiya etiladi.")

    return UrlScanResponse(
        url=raw_url,
        final_url=url,
        status=status,
        risk_score=risk,
        verdict=verdict,
        reasons=reasons,
        recommendations=recs,
    )


@app.post("/api/scan-url", response_model=UrlScanResponse)
async def api_scan_url(payload: UrlScanRequest) -> UrlScanResponse:
    try:
        return analyze_url_risk(payload.url)
    except (socket.gaierror, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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
