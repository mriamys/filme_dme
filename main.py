import os
import asyncio
from contextlib import asynccontextmanager
from typing import Optional

# Импортируем Response для картинок
from fastapi import FastAPI, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from bot import client, bot, dp, check_updates_task

load_dotenv()

CAT_WATCHING = os.getenv("REZKA_CAT_WATCHING")
CAT_LATER = os.getenv("REZKA_CAT_LATER")
CAT_WATCHED = os.getenv("REZKA_CAT_WATCHED")
MAX_PAGES = int(os.getenv("REZKA_PAGES", "5"))

@asynccontextmanager
async def lifespan(app: FastAPI):
    polling_task = None
    update_task = None
    
    if bot:
        print("🚀 Запуск Telegram бота и фоновых задач...")
        polling_task = asyncio.create_task(dp.start_polling(bot))
        update_task = asyncio.create_task(check_updates_task())
    
    yield
    
    print("🛑 Остановка сервисов...")
    if polling_task:
        polling_task.cancel()
        try:
            await polling_task
        except:
            pass

    if update_task:
        update_task.cancel()
        try:
            await update_task
        except:
            pass
            
    if bot:
        await bot.session.close()

    try:
        client.session.close()
        if hasattr(client.session, "cookies"):
            client.session.cookies.clear()
        client.is_logged_in = False
        print("✅ HTTP‑сессия HDRezka закрыта")
    except Exception as e:
        print(f"⚠️ Ошибка закрытия сессии: {e}")
    
    print("✅ Сервер остановлен.")

app = FastAPI(lifespan=lifespan)

# Разрешаем CORS для Лампы
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AddRequest(BaseModel):
    post_id: str
    category: str

class WatchRequest(BaseModel):
    global_id: str
    referer: Optional[str] = None

class DeleteRequest(BaseModel):
    post_id: str
    category: str

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

# --- ВОТ ЭТОЙ ФУНКЦИИ НЕ ХВАТАЛО ДЛЯ КАРТИНОК ---
@app.get("/api/img")
def proxy_img(url: str):
    """Проксирует картинки с Rezka для обхода защиты."""
    if not url: return Response(status_code=404)
    try:
        # Скачиваем картинку сервером и отдаем Лампе
        r = client.session.get(url)
        content_type = r.headers.get("content-type", "image/jpeg")
        return Response(content=r.content, media_type=content_type)
    except Exception as e:
        print(f"Ошибка картинки: {e}")
        return Response(status_code=404)
# -----------------------------------------------

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

if not os.path.exists("static"):
    os.makedirs("static")

@app.get("/static/{file_path:path}")
async def serve_static_no_cache(file_path: str):
    response = FileResponse(f"static/{file_path}")
    # Отключаем кэш, чтобы JS обновлялся сразу
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response

@app.get("/")
def serve_webapp():
    response = FileResponse("static/index.html")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)