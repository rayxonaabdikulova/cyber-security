# CyberLab — DPI / IDS / IPS moduli

**Jonli demo (Render):** [https://cyber-security-k77o.onrender.com/#kirish](https://cyber-security-k77o.onrender.com/#kirish)

Loyiha: FastAPI `/api/scan-file` va statik sahifa (`index.html`). Mahalliy ishga tushirish: `api` papkasidan `uvicorn`.

## Telegram APK bot integratsiyasi

Backend endi Telegram webhook orqali `.apk` fayllarni qabul qilib, mavjud skaner logikasi bilan tekshiradi.

### 1) Backend env o‘zgaruvchilar

`api` server ishga tushadigan muhitga quyidagilarni qo‘ying:

- `TELEGRAM_BOT_TOKEN` — BotFather bergan bot token
- `TELEGRAM_WEBHOOK_URL` — webhook endpoint to‘liq URL (masalan: `https://your-domain.com/api/telegram/webhook`)
- `TELEGRAM_WEBHOOK_SECRET` — ixtiyoriy, lekin tavsiya etiladi (xavfsizlik uchun)

### 2) BotFather’da nima qilish kerak

- Bot yarating: `/newbot`
- Olingan tokenni `TELEGRAM_BOT_TOKEN` ga qo‘ying
- Bot username tayyor bo‘lsa, botga `.apk` ni hujjat (`document`) sifatida yuborish/forward qilish mumkin

### 3) Webhookni ulash (endi API ichidan)

Server ishga tushgach:

- `POST /api/telegram/set-webhook` — webhookni o‘rnatadi
- `GET /api/telegram/webhook-info` — holatini ko‘rsatadi
- `POST /api/telegram/delete-webhook` — webhookni o‘chiradi

Sog‘lik tekshiruvi:

- `GET /api/telegram/health`

### 4) Ishlash tartibi

- Foydalanuvchi botga `.apk` yuboradi yoki forward qiladi
- Backend Telegram’dan faylni olib tahlil qiladi
- Bot chatga natijani qaytaradi (`SHA-256`, hajm, holat, action)
