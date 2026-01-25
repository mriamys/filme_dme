import os
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from rezka_api import client

app = FastAPI()

# Переменные из .env
CAT_WATCHING = os.getenv("REZKA_CAT_WATCHING")
CAT_LATER = os.getenv("REZKA_CAT_LATER")
CAT_WATCHED = os.getenv("REZKA_CAT_WATCHED")

# Модель для получения данных от WebApp
class WatchRequest(BaseModel):
    global_id: str

# --- API ---

@app.get("/api/watching")
def get_watching(): return client.get_category_items(CAT_WATCHING)

@app.get("/api/later")
def get_later(): return client.get_category_items(CAT_LATER)

@app.get("/api/watched")
def get_watched(): return client.get_category_items(CAT_WATCHED)

@app.get("/api/details")
def get_details(url: str):
    """Возвращает список серий для конкретного фильма"""
    return client.get_series_episodes(url)

@app.post("/api/toggle")
def toggle_status(req: WatchRequest):
    """Ставит галочку"""
    success = client.toggle_watch(req.global_id)
    return {"success": success}

# --- WEB APP ---
# Создадим папку static для HTML/CSS
if not os.path.exists("static"):
    os.makedirs("static")

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def serve_webapp():
    # Отдаем главную страницу
    return FileResponse("static/index.html")

if __name__ == "__main__":
    import uvicorn
    # Запускаем на 8080
    uvicorn.run(app, host="0.0.0.0", port=8080)