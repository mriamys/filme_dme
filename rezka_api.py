import os
import re
import json
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
        try:
            print("🔑 Auth...")
            headers = {"X-Requested-With": "XMLHttpRequest"}
            r = self.session.post(f"{self.origin}/ajax/login/", 
                                data={"login_name": self.login, "login_password": self.password},
                                headers=headers)
            if r.json().get('success'):
                self.is_logged_in = True
                print("✅ Auth Success")
                return True
        except: pass
        return False

    def _is_watched(self, tag):
        """Проверяет класс watched на элементе или его детях"""
        if not tag: return False
        # 1. Сам тег
        if "watched" in tag.get("class", []) or "b-watched" in tag.get("class", []):
            return True
        # 2. Дети (ищем <i class="watched">)
        if tag.find(class_="watched") or tag.find(class_="b-watched"):
            return True
        return False

    def _parse_schedule_table(self, soup):
        """Парсит таблицу графика выхода серий (где часто прячутся галочки)"""
        seasons = {}
        table = soup.find("table", class_="b-post__schedule_table")
        if not table: return {}

        print("📊 Нашел таблицу графика! Сканирую...")
        
        for tr in table.find_all("tr"):
            # Ячейка с номером (1 сезон 9 серия)
            td_1 = tr.find(class_="td-1")
            # Ячейка с кнопкой просмотра
            td_3 = tr.find(class_="td-3")
            
            if not td_1: continue
            
            text = td_1.text.strip()
            # Ищем цифры: "1 сезон 9 серия"
            match = re.search(r'(\d+)\s*сезон\s*(\d+)\s*серия', text)
            if not match: continue
            
            s_id = match.group(1)
            e_id = match.group(2)
            global_id = td_1.get("data-id")
            
            # Проверяем галочку в 3-й ячейке
            is_watched = False
            if td_3 and self._is_watched(td_3):
                is_watched = True
            
            if s_id not in seasons: seasons[s_id] = []
            
            seasons[s_id].append({
                "title": text,
                "episode": e_id,
                "global_id": global_id,
                "watched": is_watched,
                "source": "schedule"
            })
            
            if is_watched:
                print(f"   ✅ [Таблица] S{s_id}E{e_id} - Просмотрено!")

        return seasons

    def _parse_player_list(self, soup):
        """Парсит список из плеера"""
        seasons = {}
        items = soup.find_all("li", class_="b-simple_episode__item")
        if not items: return {}
        
        print(f"▶ Нашел список плеера ({len(items)} серий)")

        for item in items:
            try:
                s_id = item.get("data-season_id", "1")
                e_id = item.get("data-episode_id", "1")
                global_id = item.get("data-id")
                
                # Если ID нет на li, ищем внутри
                if not global_id:
                    inner = item.find(attrs={"data-id": True})
                    if inner: global_id = inner.get("data-id")

                is_watched = self._is_watched(item)
                
                if s_id not in seasons: seasons[s_id] = []
                seasons[s_id].append({
                    "title": item.text.strip(),
                    "episode": e_id, 
                    "global_id": global_id, 
                    "watched": is_watched,
                    "source": "player"
                })
            except: continue
        return seasons

    def get_category_items(self, cat_id):
        if not self.auth(): return []
        try:
            r = self.session.get(f"{self.origin}/favorites/{cat_id}/")
            soup = BeautifulSoup(r.text, 'html.parser')
            items = []
            for item in soup.find_all(class_="b-content__inline_item"):
                try:
                    link = item.find(class_="b-content__inline_item-link").find("a")
                    img = item.find(class_="b-content__inline_item-cover").find("img")
                    status = item.find(class_="info")
                    items.append({
                        "id": item.get("data-id"),
                        "title": link.text.strip(),
                        "url": link.get("href"),
                        "poster": img.get("src") if img else "",
                        "status": status.text.strip() if status else ""
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
                            "title": title, "url": url
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
        if not self.auth(): return {"error": "Auth failed"}
        try:
            print(f"🔎 {url}")
            r = self.session.get(url)
            soup = BeautifulSoup(r.text, 'html.parser')
            
            hq_poster = ""
            side = soup.find(class_="b-sidecover")
            if side:
                if side.find('a'): hq_poster = side.find('a').get('href')
                elif side.find('img'): hq_poster = side.find('img').get('src')

            post_id = None
            if soup.find(id="post_id"): post_id = soup.find(id="post_id").get("value")
            else:
                match = re.search(r'["\']post_id["\']\s*:\s*(\d+)', r.text)
                if match: post_id = match.group(1)

            # --- ГИБРИДНЫЙ ПАРСИНГ ---
            # 1. Берем данные из таблицы графика (там часто точнее статус)
            schedule_data = self._parse_schedule_table(soup)
            
            # 2. Берем данные из плеера (там больше серий для старых сериалов)
            player_data = self._parse_player_list(soup)
            
            # 3. Объединяем (Приоритет: если в таблице сказано "просмотрено" - верим таблице)
            final_seasons = player_data.copy()
            
            # Если плеера нет, берем таблицу
            if not final_seasons:
                final_seasons = schedule_data
            
            # Если есть и то и то, накладываем таблицу поверх плеера (для галочек)
            elif schedule_data:
                for s_id, eps in schedule_data.items():
                    if s_id in final_seasons:
                        # Проходим по сериям из таблицы
                        for sched_ep in eps:
                            # Ищем такую же серию в плеере
                            for play_ep in final_seasons[s_id]:
                                if play_ep['episode'] == sched_ep['episode']:
                                    # Если в таблице стоит галочка - переносим её
                                    if sched_ep['watched']:
                                        play_ep['watched'] = True
                                    # Если ID нет в плеере, берем из таблицы
                                    if not play_ep['global_id']:
                                        play_ep['global_id'] = sched_ep['global_id']

            if final_seasons:
                return {"seasons": final_seasons, "poster": hq_poster, "post_id": post_id}

            # Если всё пусто - пробуем API (крайний случай)
            # ... (код API, если нужен, но таблица обычно спасает) ...
            
            return {"error": "Серии не найдены", "poster": hq_poster, "post_id": post_id}

        except Exception as e:
            return {"error": str(e)}

    def toggle_watch(self, global_id):
        if not self.auth(): return False
        try:
            r = self.session.post(f"{self.origin}/engine/ajax/schedule_watched.php", data={"id": global_id})
            return r.status_code == 200
        except: return False

client = RezkaClient()