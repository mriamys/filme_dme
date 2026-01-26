import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional

from rezka_client import RezkaClient

# Создаём экземпляр клиента для работы с HDRezka
client = RezkaClient()

# Инициализируем FastAPI приложение
app = FastAPI()

# Читаем идентификаторы категорий из переменных окружения
CAT_WATCHING = os.getenv("REZKA_CAT_WATCHING")
CAT_LATER = os.getenv("REZKA_CAT_LATER")
CAT_WATCHED = os.getenv("REZKA_CAT_WATCHED")

# Количество страниц, которые следует обходить при загрузке закладок.
# По умолчанию берём 5, чтобы не перегружать сервис.
MAX_PAGES = int(os.getenv("REZKA_PAGES", "5"))


class AddRequest(BaseModel):
    """Структура запроса для добавления фильма или сериала в закладки."""

    post_id: str
    category: str


class WatchRequest(BaseModel):
    """Структура запроса для переключения статуса просмотра серии."""

    global_id: str


class DeleteRequest(BaseModel):
    """Структура запроса для удаления фильма/сериала из закладок."""

    post_id: str
    category: str


@app.get("/api/watching")
def get_watching():
    """Возвращает список сериалов/фильмов из категории «Смотрю» с учётом пагинации."""
    return client.get_category_items_paginated(CAT_WATCHING, MAX_PAGES)


@app.get("/api/later")
def get_later():
    """Возвращает список элементов из категории «Позже» c учётом пагинации."""
    return client.get_category_items_paginated(CAT_LATER, MAX_PAGES)


@app.get("/api/watched")
def get_watched():
    """Возвращает список элементов из категории «Архив» c учётом пагинации."""
    return client.get_category_items_paginated(CAT_WATCHED, MAX_PAGES)


@app.get("/api/details")
def get_details(url: str):
    """Получает подробности о сериале или фильме по его URL."""
    return client.get_series_details(url)


@app.get("/api/search")
def search(q: str):
    """Поиск сериалов и фильмов по названию."""
    return client.search(q)


@app.get("/api/franchise")
def get_franchise(url: str):
    """Возвращает список элементов на странице франшизы."""
    return client.get_franchise_items(url)


@app.post("/api/add")
def add_item(req: AddRequest):
    """Добавляет элемент в указанную категорию закладок."""
    cat_id = CAT_WATCHING
    if req.category == "later":
        cat_id = CAT_LATER
    elif req.category == "watched":
        cat_id = CAT_WATCHED
    success = client.add_favorite(req.post_id, cat_id)
    return {"success": success}


@app.post("/api/delete")
def delete_item(req: DeleteRequest):
    """Удаляет элемент из указанной категории закладок."""
    cat_id = CAT_WATCHING
    if req.category == "later":
        cat_id = CAT_LATER
    elif req.category == "watched":
        cat_id = CAT_WATCHED
    success = client.remove_favorite(req.post_id, cat_id)
    return {"success": success}


@app.post("/api/toggle")
def toggle_status(req: WatchRequest):
    """Переключает статус просмотра для определённого эпизода."""
    success = client.toggle_watch(req.global_id)
    return {"success": success}


# Настраиваем отдачу статики. Если директория static не существует — создаём её.
if not os.path.exists("static"):
    os.makedirs("static")
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def serve_webapp():
    """Отдаёт главную страницу приложения."""
    return FileResponse("static/index.html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8080)