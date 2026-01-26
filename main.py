import os
import asyncio
from contextlib import asynccontextmanager
from typing import Optional

# Импорты для FastAPI и Response
from fastapi import FastAPI, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Твои файлы
from bot import client, bot, dp, check_updates_task

load_dotenv()

CAT_WATCHING = os.getenv("REZKA_CAT_WATCHING")
CAT_LATER = os.getenv("REZKA_CAT_LATER")
CAT_WATCHED = os.getenv("REZKA_CAT_WATCHED")
MAX_PAGES = int(os.getenv("REZKA_PAGES", "5"))

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Запуск бота
    polling_task = None
    update_task = None
    if bot:
        print("🚀 [SERVER] Запуск Telegram бота...")
        polling_task = asyncio.create_task(dp.start_polling(bot))
        update_task = asyncio.create_task(check_updates_task())
    yield
    # Остановка
    print("🛑 [SERVER] Остановка...")
    if polling_task: polling_task.cancel()
    if update_task: update_task.cancel()
    if bot: await bot.session.close()
    try:
        client.session.close()
        client.is_logged_in = False
    except: pass

app = FastAPI(lifespan=lifespan)

# CORS: Разрешаем всё, чтобы Лампа не ругалась
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- API ЭНДПОИНТЫ ---

@app.get("/api/watching")
def get_watching():
    print(f"📥 [API] Запрос списка Watching")
    return client.get_category_items_paginated(CAT_WATCHING, MAX_PAGES)

# --- ОТЛАДОЧНЫЙ ПРОКСИ ДЛЯ КАРТИНОК ---
@app.get("/api/img")
def proxy_img(url: str):
    """
    Скачивает картинку с Rezka и отдает её Лампе.
    """
    if not url: 
        return Response(status_code=404)
    try:
        # Логируем запрос картинки
        print(f"🖼 [IMG] Проксируем: {url[:30]}...") 
        
        r = client.session.get(url)
        # Определяем тип (jpg/webp)
        content_type = r.headers.get("content-type", "image/jpeg")
        
        return Response(content=r.content, media_type=content_type)
    except Exception as e:
        print(f"❌ [IMG] Ошибка: {e}")
        return Response(status_code=404)
# --------------------------------------

# Стандартные эндпоинты
@app.get("/api/search")
def search(q: str):
    return client.search(q)

# Раздача статики (файла плагина)
if not os.path.exists("static"): os.makedirs("static")

@app.get("/static/{file_path:path}")
async def serve_static_no_cache(file_path: str):
    # Отключаем кэш, чтобы правки в JS применялись сразу
    response = FileResponse(f"static/{file_path}")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response

if __name__ == "__main__":
    import uvicorn
    # Запускаем на всех интерфейсах
    uvicorn.run(app, host="0.0.0.0", port=8080)