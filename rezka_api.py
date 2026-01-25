import os
import re
from curl_cffi import requests as curl_requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

class RezkaClient:
    def __init__(self):
        self.session = curl_requests.Session(impersonate="chrome110")
        self.login = os.getenv("REZKA_LOGIN")
        self.password = os.getenv("REZKA_PASS")
        self.is_logged_in = False
        self.origin = "https://hdrezka.me"

    def auth(self):
        if self.is_logged_in: return True
        print("🔑 Авторизация...")
        try:
            r = self.session.post(f"{self.origin}/ajax/login/", 
                                data={"login_name": self.login, "login_password": self.password})
            if r.json().get('success'):
                self.is_logged_in = True
                print("✅ Успешно!")
                return True
        except: pass
        print("❌ Ошибка входа")
        return False

    def get_category_items(self, cat_id):
        if not self.auth(): return []
        print(f"📂 Категория {cat_id}")
        try:
            r = self.session.get(f"{self.origin}/favorites/{cat_id}/")
            soup = BeautifulSoup(r.text, 'html.parser')
            items = []
            for item in soup.find_all(class_="b-content__inline_item"):
                try:
                    link = item.find(class_="b-content__inline_item-link").find("a")
                    img = item.find(class_="b-content__inline_item-cover").find("img")
                    info = item.find(class_="b-content__inline_item-link").find("div")
                    status = item.find(class_="info")
                    
                    items.append({
                        "id": item.get("data-id"),
                        "title": link.text.strip(),
                        "url": link.get("href"),
                        "poster": img.get("src") if img else "",
                        "info": info.text.strip() if info else "",
                        "status": status.text.strip() if status else ""
                    })
                except: continue
            return items
        except Exception as e:
            print(f"Error: {e}")
            return []

    def get_series_episodes(self, url):
        """Парсит сезоны и серии сериала"""
        if not self.auth(): return {}
        try:
            r = self.session.get(url)
            soup = BeautifulSoup(r.text, 'html.parser')
            
            # 1. Ищем ID сериала и озвучки
            post_id = soup.find(id="post_id").get("value")
            
            # Ищем активную озвучку (или дефолтную)
            translator_id = None
            active_trans = soup.find(class_="b-translator__item active")
            if active_trans:
                translator_id = active_trans.get("data-translator_id")
            
            # Если нет активной, ищем в JS (для сериалов без выбора озвучки)
            if not translator_id:
                match = re.search(r'["\']translator_id["\']\s*:\s*(\d+)', r.text)
                if match: translator_id = match.group(1)

            if not post_id or not translator_id:
                return {"error": "Не нашел ID сериала/озвучки"}

            # 2. Запрашиваем список серий через AJAX
            r_ajax = self.session.post(f"{self.origin}/ajax/get_cdn_series/", data={
                "id": post_id,
                "translator_id": translator_id,
                "action": "get_episodes"
            })
            
            data = r_ajax.json()
            if not data.get('success'): return {"error": "Ошибка API серий"}
            
            html = data.get('seasons') or data.get('episodes')
            ep_soup = BeautifulSoup(html, 'html.parser')
            
            seasons = {}
            # Парсим серии и проверяем класс "b-watched" (смотрел или нет)
            for item in ep_soup.find_all(class_="b-simple_episode__item"):
                s_id = item.get("data-season_id")
                e_id = item.get("data-episode_id")
                ep_id_global = item.get("data-id") # Глобальный ID для галочки
                is_watched = "watched" in item.get("class", [])
                
                if s_id not in seasons: seasons[s_id] = []
                seasons[s_id].append({
                    "episode": e_id,
                    "global_id": ep_id_global,
                    "watched": is_watched,
                    "title": item.text.strip()
                })
                
            return {"seasons": seasons, "post_id": post_id}

        except Exception as e:
            return {"error": str(e)}

    def toggle_watch(self, global_id):
        """Ставит/убирает галочку"""
        if not self.auth(): return False
        try:
            # Запрос к schedule_watched.php (то, что мы нашли ранее)
            r = self.session.post(f"{self.origin}/engine/ajax/schedule_watched.php", 
                                data={"id": global_id})
            return r.status_code == 200
        except: return False

client = RezkaClient()