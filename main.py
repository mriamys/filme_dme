import os
import asyncio
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from dotenv import load_dotenv

# ИМПОРТИРУЕМ ВСЁ ИЗ ФАЙЛА BOT.PY
# Это позволяет запустить и сайт, и бота одной командой
from bot import client, bot, dp, check_updates_task

load_dotenv()

# Настройки категорий
CAT_WATCHING = os.getenv("REZKA_CAT_WATCHING")
CAT_LATER = os.getenv("REZKA_CAT_LATER")
CAT_WATCHED = os.getenv("REZKA_CAT_WATCHED")
MAX_PAGES = int(os.getenv("REZKA_PAGES", "5"))

# --- LIFESPAN (ЗАПУСК БОТА ВМЕСТЕ С САЙТОМ) ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # При старте сервера запускаем бота и проверку обновлений
    polling_task = None
    update_task = None
    
    if bot:
        print("🚀 Запуск Telegram бота...")
        polling_task = asyncio.create_task(dp.start_polling(bot))
        update_task = asyncio.create_task(check_updates_task())
    
    yield
    
    # При остановке чистим за собой
    print("🛑 Остановка бота...")
    if polling_task: polling_task.cancel()
    if update_task: update_task.cancel()
    if bot: await bot.session.close()

app = FastAPI(lifespan=lifespan)

# --- МОДЕЛИ ЗАПРОСОВ ---
class AddRequest(BaseModel):
    post_id: str
    category: str

class WatchRequest(BaseModel):
    global_id: str
    referer: Optional[str] = None

class DeleteRequest(BaseModel):
    post_id: str
    category: str

# --- API РОУТЫ ---
# Используем объект client, который импортировали из bot.py

@app.get("/api/watching")
def get_watching():
    return client.get_category_items_paginated(CAT_WATCHING, MAX_PAGES)

@app.get("/api/later")
def get_later():
    return client.get_category_items_paginated(CAT_LATER, MAX_PAGES)

@app.get("/api/watched")
def get_watched():
    return client.get_category_items_paginated(CAT_WATCHED, MAX_PAGES)

@app.get("/api/details")
def get_details(url: str):
    return client.get_series_details(url)

@app.get("/api/search")
def search(q: str):
    return client.search(q)

@app.get("/api/franchise")
def get_franchise(url: str):
    return client.get_franchise_items(url)

@app.post("/api/add")
def add_item(req: AddRequest):
    cat_id = CAT_WATCHING
    if req.category == "later": cat_id = CAT_LATER
    elif req.category == "watched": cat_id = CAT_WATCHED
    success = client.add_favorite(req.post_id, cat_id)
    return {"success": success}

@app.post("/api/delete")
def delete_item(req: DeleteRequest):
    cat_id = CAT_WATCHING
    if req.category == "later": cat_id = CAT_LATER
    elif req.category == "watched": cat_id = CAT_WATCHED
    success = client.remove_favorite(req.post_id, cat_id)
    return {"success": success}

@app.post("/api/toggle")
def toggle_status(req: WatchRequest):
    success = client.toggle_watch(req.global_id, req.referer)
    return {"success": success}

# --- СТАТИКА ---
if not os.path.exists("static"):
    os.makedirs("static")
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def serve_webapp():
    return FileResponse("static/index.html")

if __name__ == "__main__":
    import uvicorn
    # Запускаем сервер
    uvicorn.run(app, host="0.0.0.0", port=8080)