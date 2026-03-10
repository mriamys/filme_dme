import os
import asyncio
from contextlib import asynccontextmanager
from typing import Optional
import hmac
import hashlib
import json
from urllib.parse import parse_qs

# Импортируем Response для картинок
from fastapi import FastAPI, Response, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# ИМПОРТИРУЕМ ОБЕ ЗАДАЧИ
from bot import client, bot, dp, check_updates_task, check_collections_task, logger
import time

load_dotenv()

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")


# === 🔐 TELEGRAM INIT DATA ВАЛІДАЦІЯ ===
def validate_telegram_init_data(init_data_raw: str, bot_token: str) -> dict | None:
    try:
        parsed = dict(parse_qs(init_data_raw, keep_blank_values=True))
        parsed = {k: v[0] for k, v in parsed.items()}
        if "hash" not in parsed:
            return None
        received_hash = parsed.pop("hash")
        data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))
        secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
        calculated_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
        if calculated_hash != received_hash:
            return None
        if "user" in parsed:
            parsed["user"] = json.loads(parsed["user"])
        return parsed
    except Exception as e:
        print(f"⚠️ initData validation error: {e}")
        return None


def get_user_from_request(request: Request) -> int | None:
    init_data = request.headers.get("X-Telegram-Init-Data", "")
    if not init_data:
        return None
    data = validate_telegram_init_data(init_data, BOT_TOKEN)
    if not data or "user" not in data:
        return None
    user_id = data["user"].get("id")
    if not user_id:
        return None
    # Перевіряємо що user_id = CHAT_ID (дозволений користувач)
    if str(user_id) != str(CHAT_ID):
        print(f"🔐 AUTH: user {user_id} != CHAT_ID {CHAT_ID}")
        return None
    return user_id


AUTH_DENIED = JSONResponse(status_code=403, content={"message": "Unauthorized"})

# --- ИЗМЕНЕНО: Увеличил лимит страниц с 5 до 30 (хватит на ~1000+ фильмов) ---
CAT_WATCHING = os.getenv("REZKA_CAT_WATCHING")
CAT_LATER = os.getenv("REZKA_CAT_LATER")
CAT_WATCHED = os.getenv("REZKA_CAT_WATCHED")
MAX_PAGES = int(os.getenv("REZKA_PAGES", "30")) 

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- ЗАПУСК ---
    polling_task = None
    update_task = None
    collection_task = None # Новая задача
    
    if bot:
        print("🚀 Запуск Telegram бота и фоновых задач...")
        polling_task = asyncio.create_task(dp.start_polling(bot))
        update_task = asyncio.create_task(check_updates_task())
        collection_task = asyncio.create_task(check_collections_task()) # <-- Запуск мониторинга коллекций
    
    yield
    
    # --- ОСТАНОВКА ---
    print("🛑 Остановка сервисов...")
    
    if polling_task:
        polling_task.cancel()
        try: await polling_task 
        except: pass

    if update_task:
        update_task.cancel()
        try: await update_task 
        except: pass

    if collection_task:
        collection_task.cancel()
        try: await collection_task 
        except: pass
            
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

# Разрешаем CORS
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

# --- ЭНДПОИНТЫ ---

MAX_RETRIES = 3
RETRY_DELAY = 2  # секунды между попытками

async def fetch_category_with_retry(cat_id: str, sort: str, label: str) -> list:
    """Загружает список категории с автоповтором при пустом ответе (как в mod.js)."""
    for attempt in range(1, MAX_RETRIES + 1):
        items = await asyncio.to_thread(
            client.get_category_items_paginated, cat_id, MAX_PAGES, sort
        )
        if items:
            print(f"[API] {label}: {len(items)} элементов (sort={sort}, попытка {attempt})")
            return items
        if attempt < MAX_RETRIES:
            print(f"[API] {label}: пустой ответ, повтор {attempt}/{MAX_RETRIES - 1} через {RETRY_DELAY}с...")
            await asyncio.sleep(RETRY_DELAY)
    print(f"[API] {label}: список пуст после {MAX_RETRIES} попыток")
    return []

@app.get("/api/watching")
async def get_watching(request: Request, sort: str = "added"):
    if not get_user_from_request(request): return AUTH_DENIED
    return await fetch_category_with_retry(CAT_WATCHING, sort, "📋 Смотрю")

@app.get("/api/later")
async def get_later(request: Request, sort: str = "added"):
    if not get_user_from_request(request): return AUTH_DENIED
    return await fetch_category_with_retry(CAT_LATER, sort, "⏳ Позже")

@app.get("/api/watched")
async def get_watched(request: Request, sort: str = "added"):
    if not get_user_from_request(request): return AUTH_DENIED
    return await fetch_category_with_retry(CAT_WATCHED, sort, "✅ Архив")

@app.get("/api/details")
def get_details(request: Request, url: str):
    if not get_user_from_request(request): return AUTH_DENIED
    return client.get_series_details(url)

@app.get("/api/search")
def search(request: Request, q: str):
    if not get_user_from_request(request): return AUTH_DENIED
    return client.search(q)

@app.get("/api/franchise")
def get_franchise(request: Request, url: str):
    if not get_user_from_request(request): return AUTH_DENIED
    return client.get_franchise_items(url)

class EpisodeUpdateRequest(BaseModel):
    url: str
    season: str
    episode: str

@app.post("/api/episode/mark")
def mark_episode_watched(req: EpisodeUpdateRequest, request: Request):
    if not get_user_from_request(request): return AUTH_DENIED
    """Отмечает конкретную серию как просмотренную"""
    try:
        # Получаем детали сериала
        details = client.get_series_details(req.url)
        
        if not details or "seasons" not in details:
            return {"success": False, "error": "Failed to get series details"}
        
        # Ищем нужную серию
        seasons = details["seasons"]
        if req.season not in seasons:
            return {"success": False, "error": f"Season {req.season} not found"}
        
        episodes = seasons[req.season]
        target_episode = None
        
        for ep in episodes:
            if ep["episode"] == req.episode:
                target_episode = ep
                break
        
        if not target_episode:
            return {"success": False, "error": f"Episode {req.episode} not found"}
        
        # Отмечаем как просмотренную
        global_id = target_episode["global_id"]
        success = client.toggle_watch(global_id, req.url)
        
        return {"success": success, "watched": not target_episode["watched"]}
    except Exception as e:
        logger.error(f"Error marking episode: {e}")
        return {"success": False, "error": str(e)}

@app.post("/api/episode/mark-range")
def mark_episodes_range(req: dict, request: Request):
    if not get_user_from_request(request): return AUTH_DENIED
    """Отмечает диапазон серий как просмотренные"""
    try:
        url = req.get("url")
        season = req.get("season")
        from_episode = int(req.get("from_episode", 1))
        to_episode = int(req.get("to_episode", 999))
        
        details = client.get_series_details(url)
        if not details or "seasons" not in details:
            return {"success": False, "error": "Failed to get series details"}
        
        seasons = details["seasons"]
        if season not in seasons:
            return {"success": False, "error": f"Season {season} not found"}
        
        episodes = seasons[season]
        marked_count = 0
        
        for ep in episodes:
            ep_num = int(ep["episode"])
            if from_episode <= ep_num <= to_episode:
                if not ep["watched"]:
                    global_id = ep["global_id"]
                    if client.toggle_watch(global_id, url):
                        marked_count += 1
                        time.sleep(0.3)  # Небольшая задержка между запросами
        
        return {"success": True, "marked": marked_count}
    except Exception as e:
        logger.error(f"Error marking episode range: {e}")
        return {"success": False, "error": str(e)}

# --- ПРОКСИ ДЛЯ КАРТИНОК (ОБЯЗАТЕЛЬНО) ---
@app.get("/api/img")
def proxy_img(request: Request, url: str):
    if not get_user_from_request(request): return AUTH_DENIED
    if not url: 
        print("[IMG] ❌ Нет URL")
        return Response(status_code=404)
    
    print(f"[IMG] 📥 Запрос картинки: {url}")
    
    try:
        r = client.session.get(url, timeout=10)
        print(f"[IMG] ✅ Статус: {r.status_code}")
        print(f"[IMG] 📦 Размер: {len(r.content)} байт")
        
        content_type = r.headers.get("content-type", "image/jpeg")
        print(f"[IMG] 🎨 Тип: {content_type}")
        
        return Response(content=r.content, media_type=content_type)
    except Exception as e:
        print(f"[IMG] ❌ Ошибка: {e}")
        return Response(status_code=404)
# -----------------------------------------

@app.post("/api/add")
def add_item(req: AddRequest, request: Request):
    if not get_user_from_request(request): return AUTH_DENIED
    cat_id = CAT_WATCHING
    if req.category == "later": cat_id = CAT_LATER
    elif req.category == "watched": cat_id = CAT_WATCHED
    success = client.add_favorite(req.post_id, cat_id)
    return {"success": success}

@app.post("/api/delete")
def delete_item(req: DeleteRequest, request: Request):
    if not get_user_from_request(request): return AUTH_DENIED
    cat_id = CAT_WATCHING
    if req.category == "later": cat_id = CAT_LATER
    elif req.category == "watched": cat_id = CAT_WATCHED
    success = client.remove_favorite(req.post_id, cat_id)
    return {"success": success}

@app.post("/api/toggle")
def toggle_status(req: WatchRequest, request: Request):
    if not get_user_from_request(request): return AUTH_DENIED
    success = client.toggle_watch(req.global_id, req.referer)
    return {"success": success}

class MoveRequest(BaseModel):
    post_id: str
    from_category: str
    to_category: str

@app.post("/api/move")
def move_item(req: MoveRequest, request: Request):
    if not get_user_from_request(request): return AUTH_DENIED
    # Сначала добавляем в новую категорию
    to_cat_id = CAT_WATCHING
    if req.to_category == "later": to_cat_id = CAT_LATER
    elif req.to_category == "watched": to_cat_id = CAT_WATCHED
    
    success_add = client.add_favorite(req.post_id, to_cat_id)
    if not success_add:
        return {"success": False, "error": "Failed to add to new category"}
    
    # Потом удаляем из старой категории
    from_cat_id = CAT_WATCHING
    if req.from_category == "later": from_cat_id = CAT_LATER
    elif req.from_category == "watched": from_cat_id = CAT_WATCHED
    
    success_remove = client.remove_favorite(req.post_id, from_cat_id)
    return {"success": success_add and success_remove}

# --- СТАТИКА ---
if not os.path.exists("static"):
    os.makedirs("static")

if not os.path.exists("plugin"):
    os.makedirs("plugin")

@app.get("/plugin/{file_path:path}")
async def serve_plugin_dynamic(file_path: str):
    full_path = f"plugin/{file_path}"
    
    if not os.path.exists(full_path):
        return Response(status_code=404)

    # Если запрашивают mod.js, делаем подмену данных
    if file_path == "mod.js":
        try:
            with open(full_path, "r", encoding="utf-8") as f:
                content = f.read()
            
            # Получаем данные из .env
            # rstrip("/") убирает слеш в конце ссылки, если он там есть, чтобы не было двойных //
            public_url = os.getenv("PUBLIC_URL", "http://127.0.0.1:8080").rstrip("/")
            tmdb_key = os.getenv("TMDB_API_KEY", "")
            
            # Подменяем метки на реальные значения
            content = content.replace("__API_URL__", public_url)
            content = content.replace("__TMDB_KEY__", tmdb_key)
            
            # Отдаем как Javascript
            response = Response(content=content, media_type="application/javascript")
            # Отключаем кэширование, чтобы изменения применялись сразу
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Access-Control-Allow-Origin"] = "*"
            return response
        except Exception as e:
            print(f"Error serving plugin file: {e}")
            return Response(status_code=500)

    # Для остальных файлов в папке plugin отдаем как есть
    response = FileResponse(full_path)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response

@app.get("/static/{file_path:path}")
async def serve_static_no_cache(file_path: str):
    response = FileResponse(f"static/{file_path}")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response

@app.get("/")
def serve_webapp():
    response = FileResponse("static/index.html")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response

@app.get("/api/check_status")
def check_status(request: Request, post_id: str):
    if not get_user_from_request(request): return AUTH_DENIED
    # Это упрощенная логика. В идеале клиент Rezka должен уметь быстро проверять ID.
    # Но так как у тебя пагинация и нет базы данных, это может быть медленно.
    # Поэтому пока можно просто возвращать "unknown" или реализовать кэш на сервере.
    # Если хочешь, я напишу реализацию с кэшем.
    return {"status": "unknown"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)