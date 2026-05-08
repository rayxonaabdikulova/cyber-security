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
import logging
import os
import re
import socket
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from pydantic import BaseModel, Field
from starlette.responses import JSONResponse
from starlette.staticfiles import StaticFiles

WEB_MAX_UPLOAD_BYTES = 100 * 1024 * 1024
TELEGRAM_MAX_UPLOAD_BYTES = 30 * 1024 * 1024

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cyberlab")


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


TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_WEBHOOK_SECRET = os.environ.get("TELEGRAM_WEBHOOK_SECRET", "").strip()
TELEGRAM_WEBHOOK_URL = os.environ.get("TELEGRAM_WEBHOOK_URL", "").strip()
TELEGRAM_API_BASE = (
    f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"
    if TELEGRAM_BOT_TOKEN
    else ""
)
TELEGRAM_FILE_BASE = (
    f"https://api.telegram.org/file/bot{TELEGRAM_BOT_TOKEN}"
    if TELEGRAM_BOT_TOKEN
    else ""
)
WEB_UPLOAD_URL = os.environ.get("WEB_UPLOAD_URL", "https://cyber-security-k77o.onrender.com").strip()


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


def build_scan_file_response(name: str, raw: bytes) -> ScanFileResponse:
    if len(raw) > WEB_MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Fayl juda katta. Maksimum: {WEB_MAX_UPLOAD_BYTES} bayt.",
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


@app.post("/api/scan-file", response_model=ScanFileResponse)
async def api_scan_file(file: UploadFile = File(...)) -> ScanFileResponse:
    raw = await file.read()
    name = file.filename or "upload"
    return build_scan_file_response(name, raw)


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


async def tg_api_post(method: str, payload: dict[str, Any]) -> None:
    if not TELEGRAM_API_BASE:
        return
    async with httpx.AsyncClient(timeout=20.0) as client:
        await client.post(f"{TELEGRAM_API_BASE}/{method}", json=payload)


async def tg_send_message(chat_id: int, text: str) -> None:
    await tg_api_post(
        "sendMessage",
        {
            "chat_id": chat_id,
            "text": text,
            "disable_web_page_preview": True,
        },
    )


async def tg_send_message_safe(chat_id: int, text: str) -> None:
    """Best-effort yuborish: xatoda webhook oqimini yiqitmaydi."""
    try:
        await tg_send_message(chat_id, text)
    except Exception:
        logger.exception("Telegram sendMessage failed")


def _tg_err_code(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8].upper()}"


async def tg_api_get(method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    if not TELEGRAM_API_BASE:
        raise HTTPException(status_code=503, detail="Telegram bot token sozlanmagan.")
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(f"{TELEGRAM_API_BASE}/{method}", params=params or {})
            resp.raise_for_status()
            data = resp.json()
            if not data.get("ok"):
                raise HTTPException(status_code=502, detail=f"Telegram API xatoligi: {data}")
            return data
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=504,
            detail="Telegram API timeout: server Telegram bilan ulana olmadi.",
        ) from exc
    except httpx.HTTPStatusError as exc:
        body = ""
        if exc.response is not None:
            body = (exc.response.text or "").strip()
        raise HTTPException(
            status_code=502,
            detail=(
                "Telegram API HTTP xatoligi: "
                f"{exc.response.status_code if exc.response is not None else '?'}"
                + (f" | {body[:300]}" if body else "")
            ),
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Telegram API ulanish xatoligi: {type(exc).__name__}",
        ) from exc


def _extract_chat_id(update: dict[str, Any]) -> int | None:
    msg = update.get("message") or update.get("edited_message") or {}
    chat = msg.get("chat") or {}
    cid = chat.get("id")
    return cid if isinstance(cid, int) else None


def _human_bytes(num_bytes: int) -> str:
    if num_bytes >= 1024 * 1024:
        return f"{num_bytes / (1024 * 1024):.2f} MB"
    if num_bytes >= 1024:
        return f"{num_bytes / 1024:.2f} KB"
    return f"{num_bytes} B"


def _tg_command(text: str) -> str:
    # Telegram command can include bot username: /start@my_bot
    first = (text or "").strip().split(" ", 1)[0].lower()
    if "@" in first:
        first = first.split("@", 1)[0]
    return first


@app.get("/api/telegram/health")
def telegram_health() -> dict[str, Any]:
    return {
        "enabled": bool(TELEGRAM_BOT_TOKEN),
        "telegram_max_upload_bytes": TELEGRAM_MAX_UPLOAD_BYTES,
        "web_max_upload_bytes": WEB_MAX_UPLOAD_BYTES,
        "webhook_secret_set": bool(TELEGRAM_WEBHOOK_SECRET),
        "webhook_url_set": bool(TELEGRAM_WEBHOOK_URL),
    }


@app.post("/api/telegram/set-webhook")
async def telegram_set_webhook() -> dict[str, Any]:
    if not TELEGRAM_BOT_TOKEN:
        raise HTTPException(status_code=503, detail="TELEGRAM_BOT_TOKEN yo‘q.")
    if not TELEGRAM_WEBHOOK_URL:
        raise HTTPException(status_code=400, detail="TELEGRAM_WEBHOOK_URL yo‘q.")

    params: dict[str, Any] = {"url": TELEGRAM_WEBHOOK_URL}
    if TELEGRAM_WEBHOOK_SECRET:
        params["secret_token"] = TELEGRAM_WEBHOOK_SECRET

    data = await tg_api_get("setWebhook", params=params)
    return {"ok": True, "telegram": data.get("result", True)}


@app.get("/api/telegram/webhook-info")
async def telegram_webhook_info() -> dict[str, Any]:
    data = await tg_api_get("getWebhookInfo")
    return {"ok": True, "result": data.get("result", {})}


@app.post("/api/telegram/delete-webhook")
async def telegram_delete_webhook() -> dict[str, Any]:
    data = await tg_api_get("deleteWebhook", params={"drop_pending_updates": False})
    return {"ok": True, "telegram": data.get("result", True)}


@app.post("/api/telegram/webhook")
async def telegram_webhook(request: Request, update: dict[str, Any]) -> dict[str, bool]:
    # Bot sozlanmagan bo‘lsa endpoint jim chiqadi (saytga ta'sir qilmaydi).
    if not TELEGRAM_BOT_TOKEN:
        return {"ok": True}
    if TELEGRAM_WEBHOOK_SECRET:
        recv_secret = request.headers.get("x-telegram-bot-api-secret-token", "")
        if recv_secret != TELEGRAM_WEBHOOK_SECRET:
            raise HTTPException(status_code=401, detail="Invalid webhook secret.")

    message = update.get("message") or update.get("edited_message") or {}
    chat_id = _extract_chat_id(update)
    if not chat_id:
        return {"ok": True}

    text = str(message.get("text") or "").strip()
    cmd = _tg_command(text)
    if cmd in {"/start", "/help"}:
        await tg_send_message(
            chat_id,
            (
                "Salom! APK tekshiruv boti ishga tayyor.\n"
                "- Telegramdagi APK faylni shu botga forward qiling.\n"
                "- Men faylni serverda tahlil qilib natijani yuboraman.\n"
                f"- Telegram orqali maksimal hajm: {_human_bytes(TELEGRAM_MAX_UPLOAD_BYTES)}.\n"
                f"- { _human_bytes(TELEGRAM_MAX_UPLOAD_BYTES) } dan katta fayl uchun: {WEB_UPLOAD_URL}\n"
                "- Qo‘shimcha buyruqlar: /status, /about"
            ),
        )
        return {"ok": True}
    if cmd == "/status":
        await tg_send_message(
            chat_id,
            (
                "Bot holati: ONLINE\n"
                f"Telegram maksimal yuklash: {_human_bytes(TELEGRAM_MAX_UPLOAD_BYTES)}\n"
                f"Sayt orqali maksimal yuklash: {_human_bytes(WEB_MAX_UPLOAD_BYTES)}\n"
                f"Webhook URL sozlangan: {'ha' if bool(TELEGRAM_WEBHOOK_URL) else 'yo‘q'}\n"
                f"Webhook secret sozlangan: {'ha' if bool(TELEGRAM_WEBHOOK_SECRET) else 'yo‘q'}"
            ),
        )
        return {"ok": True}
    if cmd == "/about":
        await tg_send_message(
            chat_id,
            (
                "Bu bot APK fayllarni xavfsizlik bo‘yicha tezkor tekshiradi.\n"
                "- Yuborish: .apk ni document qilib yuboring.\n"
                "- Natija: SHA-256, hajm, holat va tavsiya.\n"
                f"- Telegram limitdan katta fayllar uchun sayt: {WEB_UPLOAD_URL}\n"
                "- Eslatma: shubhali ilovalarni asosiy qurilmaga o‘rnatmang."
            ),
        )
        return {"ok": True}

    document = message.get("document") or {}
    file_id = document.get("file_id")
    file_name = str(document.get("file_name") or "telegram-upload")
    if not file_id:
        await tg_send_message(
            chat_id,
            "Iltimos, APK faylni hujjat sifatida yuboring yoki forward qiling.",
        )
        return {"ok": True}

    if not file_name.lower().endswith(".apk"):
        await tg_send_message(
            chat_id,
            "Faqat .apk fayllar qo‘llanadi. Iltimos, APK yuboring.",
        )
        return {"ok": True}

    file_size = int(document.get("file_size") or 0)
    if file_size > TELEGRAM_MAX_UPLOAD_BYTES:
        await tg_send_message(
            chat_id,
            "Fayl Telegram bot limiti uchun katta.\n"
            f"Telegram limit: {_human_bytes(TELEGRAM_MAX_UPLOAD_BYTES)}.\n"
            f"Iltimos, bu APK ni sayt orqali yuklang: {WEB_UPLOAD_URL}",
        )
        return {"ok": True}

    try:
        await tg_send_message_safe(chat_id, "Qabul qilindi. APK tekshirilmoqda...")
        # Telegram faylni yuklab olish sekin ketishi mumkin, shuning uchun
        # timeout ni uzoqroq qilyapmiz (lekin baribir cheklangan).
        timeout = httpx.Timeout(connect=20.0, read=160.0, write=20.0, pool=20.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            file_meta = await client.get(
                f"{TELEGRAM_API_BASE}/getFile",
                params={"file_id": file_id},
            )
            file_meta.raise_for_status()
            meta_payload = file_meta.json()
            if not meta_payload.get("ok"):
                raise HTTPException(
                    status_code=502,
                    detail="Telegram getFile API xatoligi.",
                )

            file_path = meta_payload.get("result", {}).get("file_path", "")
            if not file_path:
                await tg_send_message_safe(
                    chat_id, "Fayl manzili olinmadi. Qayta urinib ko‘ring."
                )
                return {"ok": True}

            file_resp = await client.get(f"{TELEGRAM_FILE_BASE}/{file_path}")
            file_resp.raise_for_status()
            raw = file_resp.content
            if not raw:
                raise HTTPException(
                    status_code=502,
                    detail="Telegram fayli bo‘sh yoki yuklab olinmadi.",
                )

        result = build_scan_file_response(file_name, raw)
        status_lower = str(result.status).lower()
        is_safe = ("safe" in status_lower) or ("toza" in status_lower)
        verdict_emoji = "✅" if is_safe else "⚠️"
        advice = (
            "Tavsiya: fayl normal ko‘rinadi, baribir rasmiy manbadan yuklang."
            if is_safe
            else "Tavsiya: bu APK ni o‘rnatmang, avval sandbox/antivirusda tekshiring."
        )
        await tg_send_message_safe(
            chat_id,
            (
                f"{verdict_emoji} Tekshiruv yakuni:\n"
                f"Fayl: {result.filename}\n"
                f"SHA-256: {result.sha256_hash}\n"
                f"Hajm: {result.size_human}\n"
                f"Holat: {result.status}\n"
                f"Amal: {result.action}\n"
                f"{advice}"
            ),
        )
    except HTTPException as exc:
        logger.exception("Telegram HTTPException in webhook flow")
        code = _tg_err_code("TG-APP")
        await tg_send_message_safe(
            chat_id, f"Xatolik ({code}): {exc.detail}"
        )
    except httpx.TimeoutException as exc:
        logger.exception("Telegram webhook timeout")
        code = _tg_err_code("TG-TIMEOUT")
        await tg_send_message_safe(
            chat_id,
            "Texnik xatolik "
            f"({code}): Telegram faylni yuklab olish vaqti tugadi. "
            "Iltimos, birozdan keyin qayta urinib ko‘ring.",
        )
    except httpx.HTTPStatusError as exc:
        logger.exception("Telegram HTTP status error")
        code = _tg_err_code("TG-HTTP")
        status_code = exc.response.status_code if exc.response is not None else "?"
        body = ""
        if exc.response is not None:
            try:
                body = (exc.response.text or "").strip()
            except Exception:
                body = ""
        body_l = body.lower()
        detail_tail = ""
        if body:
            detail_tail = " Detal: " + body[:220]
        if status_code == 400 and "file is too big" in body_l:
            await tg_send_message_safe(
                chat_id,
                "Texnik xatolik "
                f"({code}): Telegram bu faylni bot uchun yuklab bera olmadi "
                "(file is too big). "
                f"Telegram limit: {_human_bytes(TELEGRAM_MAX_UPLOAD_BYTES)}. "
                f"Katta APK uchun saytga yuklang: {WEB_UPLOAD_URL}",
            )
            return {"ok": True}
        await tg_send_message_safe(
            chat_id,
            "Texnik xatolik "
            f"({code}): Telegram serveridan noto‘g‘ri javob olindi "
            f"(HTTP {status_code}). Iltimos, keyinroq qayta urinib ko‘ring."
            + detail_tail,
        )
    except httpx.HTTPError as exc:
        logger.exception("Telegram HTTP error")
        code = _tg_err_code("TG-NET")
        await tg_send_message_safe(
            chat_id,
            "Texnik xatolik "
            f"({code}): Telegram faylni yuklab bo‘lmadi. Sabab: "
            f"{type(exc).__name__}. Iltimos, keyinroq qayta urinib ko‘ring.",
        )
    except Exception as exc:
        logger.exception("Telegram webhook unexpected error")
        code = _tg_err_code("TG-UNEXPECTED")
        await tg_send_message_safe(
            chat_id,
            "Texnik xatolik yuz berdi "
            f"({code}, {type(exc).__name__}). Iltimos, keyinroq qayta urinib ko‘ring.",
        )

    return {"ok": True}


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
