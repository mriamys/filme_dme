import os
from fastapi import FastAPI
from rezka_api import client

app = FastAPI()

# ID твоих категорий (берем из переменных окружения)
CAT_WATCHING = os.getenv("REZKA_CAT_WATCHING")  # 878207 (Незаконченные)
CAT_LATER = os.getenv("REZKA_CAT_LATER")        # 1266725 (Смотреть позже)
CAT_WATCHED = os.getenv("REZKA_CAT_WATCHED")    # 1266727 (Уже смотрел)

@app.get("/")
def read_root():
    return {"status": "OK", "service": "Rezka API Proxy"}

@app.get("/api/watching")
def get_watching():
    return client.get_category_items(CAT_WATCHING)

@app.get("/api/later")
def get_later():
    return client.get_category_items(CAT_LATER)

@app.get("/api/watched")
def get_watched():
    return client.get_category_items(CAT_WATCHED)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)