import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from rezka_client import RezkaClient
client = RezkaClient()


app = FastAPI()

CAT_WATCHING = os.getenv("REZKA_CAT_WATCHING")
CAT_LATER = os.getenv("REZKA_CAT_LATER")
CAT_WATCHED = os.getenv("REZKA_CAT_WATCHED")

class AddRequest(BaseModel):
    post_id: str
    category: str 

class WatchRequest(BaseModel):
    global_id: str

@app.get("/api/watching")
def get_watching(): return client.get_category_items(CAT_WATCHING)

@app.get("/api/later")
def get_later(): return client.get_category_items(CAT_LATER)

@app.get("/api/watched")
def get_watched(): return client.get_category_items(CAT_WATCHED)

@app.get("/api/details")
def get_details(url: str): 
    # Вызываем наш новый "умный" метод
    return client.get_series_details(url)

@app.get("/api/search")
def search(q: str): return client.search(q)

@app.post("/api/add")
def add_item(req: AddRequest):
    cat_id = CAT_WATCHING
    if req.category == 'later': cat_id = CAT_LATER
    elif req.category == 'watched': cat_id = CAT_WATCHED
    success = client.add_favorite(req.post_id, cat_id)
    return {"success": success}

@app.post("/api/toggle")
def toggle_status(req: WatchRequest):
    success = client.toggle_watch(req.global_id)
    return {"success": success}

if not os.path.exists("static"): os.makedirs("static")
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def serve_webapp(): return FileResponse("static/index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)