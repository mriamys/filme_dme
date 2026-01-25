import os
import re
import json
from curl_cffi import requests as curl_requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

class RezkaClient:
    def __init__(self):
        # Маскируемся под обычный браузер
        self.session = curl_requests.Session(impersonate="chrome110")
        self.login = os.getenv("REZKA_LOGIN")
        self.password = os.getenv("REZKA_PASS")
        self.is_logged_in = False
        self.origin = "https://hdrezka.me"

    def auth(self):
        if self.is_logged_in: return True
        try:
            print("🔑 Авторизация...")
            # Важный момент: заголовки для AJAX
            headers = {
                "X-Requested-With": "XMLHttpRequest",
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
            }
            r = self.session.post(f"{self.origin}/ajax/login/", 
                                data={"login_name": self.login, "login_password": self.password},
                                headers=headers)
            res = r.json()
            if res.get('success'):
                self.is_logged_in = True
                print(f"✅ Успешно: {res.get('name')}")
                return True
            print(f"❌ Ошибка входа: {res.get('message')}")
        except Exception as e:
            print(f"Ошибка соединения: {e}")
        return False

    def _parse_episodes_from_html(self, soup):
        """Вспомогательная функция: вытаскивает серии из HTML-супа"""
        seasons = {}
        
        # Ищем элементы списка серий
        # Класс b-simple_episode__item - стандартный для Резки
        items = soup.find_all("li", class_="b-simple_episode__item")
        
        if not items:
            return None

        for item in items:
            try:
                # Атрибуты
                s_id = item.get("data-season_id", "1")
                e_id = item.get("data-episode_id", "1")
                global_id = item.get("data-id") # Самое важное для галочки!
                
                # Название
                title = item.text.strip()
                
                # Статус просмотра
                # Класс может быть 'b-simple_episode__item watched' или просто 'watched'
                classes = item.get("class", [])
                is_watched = "watched" in classes or "b-watched" in classes

                if s_id not in seasons: seasons[s_id] = []
                
                seasons[s_id].append({
                    "title": title,
                    "episode": e_id,
                    "global_id": global_id,
                    "watched": is_watched
                })
            except:
                continue
        
        return seasons

    def get_category_items(self, cat_id):
        if not self.auth(): return []
        try:
            r = self.session.get(f"{self.origin}/favorites/{cat_id}/")
            soup = BeautifulSoup(r.text, 'html.parser')
            items = []
            for item in soup.find_all(class_="b-content__inline_item"):
                try:
                    link_node = item.find(class_="b-content__inline_item-link").find("a")
                    img_node = item.find(class_="b-content__inline_item-cover").find("img")
                    status_node = item.find(class_="info")

                    items.append({
                        "id": item.get("data-id"),
                        "title": link_node.text.strip(),
                        "url": link_node.get("href"),
                        "poster": img_node.get("src") if img_node else "",
                        "status": status_node.text.strip() if status_node else ""
                    })
                except: continue
            return items
        except: return []

    def search(self, query):
        if not self.auth(): return []
        try:
            r = self.session.post(f"{self.origin}/engine/ajax/search.php", data={"q": query})
            soup = BeautifulSoup(r.content, 'html.parser')
            results = []
            for item in soup.select('.b-search__section_list li'):
                try:
                    link = item.find('a')
                    title = item.find('span', class_='enty').get_text().strip()
                    url = link.attrs['href']
                    match = re.search(r'/(\d+)-', url)
                    if match:
                        results.append({
                            "id": match.group(1),
                            "title": title,
                            "url": url,
                            # Заглушка, можно заменить на дефолтную картинку
                            "poster": "https://static.hdrezka.ac/templates/hdrezka/images/noposter.png"
                        })
                except: continue
            return results
        except: return []

    def add_favorite(self, post_id, cat_id):
        if not self.auth(): return False
        try:
            r = self.session.post(f"{self.origin}/ajax/favorites/", data={
                "post_id": post_id, "cat_id": cat_id, "action": "add_post"
            })
            return r.json().get('success', False)
        except: return False

    def get_series_details(self, url):
        """Главный метод получения данных о сериале"""
        if not self.auth(): return {"error": "Auth failed"}
        try:
            print(f"🔎 Загружаю страницу: {url}")
            r = self.session.get(url)
            soup = BeautifulSoup(r.text, 'html.parser')
            
            # --- 1. Постер (HD) ---
            hq_poster = ""
            side = soup.find(class_="b-sidecover")
            if side:
                if side.find('a'): hq_poster = side.find('a').get('href')
                elif side.find('img'): hq_poster = side.find('img').get('src')

            # --- 2. ID Поста (нужен для кнопок) ---
            post_id = None
            if soup.find(id="post_id"): 
                post_id = soup.find(id="post_id").get("value")
            else:
                match = re.search(r'["\']post_id["\']\s*:\s*(\d+)', r.text)
                if match: post_id = match.group(1)

            # --- 3. ПОПЫТКА А: Парсим серии прямо со страницы ---
            print("Trying Strategy A: Direct HTML parsing...")
            seasons = self._parse_episodes_from_html(soup)
            
            if seasons:
                print(f"✅ Strategy A Success: Found {len(seasons)} seasons")
                return {"seasons": seasons, "poster": hq_poster, "post_id": post_id}

            # --- 4. ПОПЫТКА Б: API (Если на странице пусто) ---
            print("⚠️ Strategy A Failed (Empty list). Trying Strategy B: API call...")
            
            # Ищем translator_id
            translator_id = None
            active = soup.find(class_="b-translator__item active")
            if active: 
                translator_id = active.get("data-translator_id")
            else:
                match = re.search(r'["\']translator_id["\']\s*:\s*(\d+)', r.text)
                if match: translator_id = match.group(1)

            if post_id:
                payload = {"id": post_id, "action": "get_episodes"}
                if translator_id: payload["translator_id"] = translator_id
                
                r_ajax = self.session.post(f"{self.origin}/ajax/get_cdn_series/", data=payload)
                data = r_ajax.json()
                
                if data.get('success'):
                    html_content = data.get('seasons') or data.get('episodes')
                    ep_soup = BeautifulSoup(html_content, 'html.parser')
                    seasons = self._parse_episodes_from_html(ep_soup)
                    
                    if seasons:
                        print(f"✅ Strategy B Success: Found {len(seasons)} seasons via API")
                        return {"seasons": seasons, "poster": hq_poster, "post_id": post_id}

            return {"error": "Не удалось загрузить список серий", "poster": hq_poster, "post_id": post_id}

        except Exception as e:
            print(f"CRITICAL ERROR: {e}")
            return {"error": str(e)}

    def toggle_watch(self, global_id):
        if not self.auth(): return False
        try:
            # Тот самый запрос, который ты отловил
            url = f"{self.origin}/engine/ajax/schedule_watched.php"
            r = self.session.post(url, data={"id": global_id})
            return r.status_code == 200
        except: return False

# Экземпляр клиента
client = RezkaClient()