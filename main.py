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
from bot import client, bot, dp, check_updates_task

load_dotenv()

# Настройки категорий
CAT_WATCHING = os.getenv("REZKA_CAT_WATCHING")
CAT_LATER = os.getenv("REZKA_CAT_LATER")
CAT_WATCHED = os.getenv("REZKA_CAT_WATCHED")
MAX_PAGES = int(os.getenv("REZKA_PAGES", "5"))

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Запуск
    polling_task = None
    update_task = None
    
    if bot:
        print("🚀 Запуск Telegram бота и фоновых задач...")
        # Запускаем поллинг и проверку обновлений
        polling_task = asyncio.create_task(dp.start_polling(bot))
        update_task = asyncio.create_task(check_updates_task())
    
    yield
    
    # Остановка (корректный выход по Ctrl+C)
    print("🛑 Остановка сервисов...")
    
    if polling_task:
        polling_task.cancel()
        try:
            await polling_task
        except asyncio.CancelledError:
            pass

    if update_task:
        update_task.cancel()
        try:
            await update_task
        except asyncio.CancelledError:
            pass
            
    if bot:
        await bot.session.close()

    # Закрываем HTTP‑сессию клиента Rezka и очищаем cookies.
    try:
        # Закрываем сессию и очищаем cookies, чтобы после перезапуска не остались старые куки/токены
        client.session.close()
        # На всякий случай очищаем cookie jar
        if hasattr(client.session, "cookies"):
            client.session.cookies.clear()
        # Сбрасываем флаг логина
        client.is_logged_in = False
        print("✅ HTTP‑сессия HDRezka закрыта и очищена")
    except Exception as e:
        print(f"⚠️ Не удалось закрыть сессию Rezka: {e}")
    
    print("✅ Сервер остановлен.")

app = FastAPI(lifespan=lifespan)

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

# Отключение кэширования для статики (чтобы изменения сразу были видны)
if not os.path.exists("static"):
    os.makedirs("static")

# Этот трюк заставляет браузер не кэшировать файлы (для разработки)
@app.get("/static/{file_path:path}")
async def serve_static_no_cache(file_path: str):
    response = FileResponse(f"static/{file_path}")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

@app.get("/")
def serve_webapp():
    response = FileResponse("static/index.html")
    # Также отключаем кэш для главной страницы
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)