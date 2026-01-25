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

    def _is_watched_check(self, tag):
        """Проверяет класс watched везде (на элементе и внутри)"""
        if not tag: return False
        
        # 1. Прямой класс
        classes = tag.get("class", [])
        if "watched" in classes or "b-watched" in classes:
            return True
            
        # 2. Ищем иконку внутри
        # <i class="watch-episode-action watched"> или <i class="b-ico">
        icon = tag.find(class_=lambda x: x and ("watch-episode-action" in x or "b-ico" in x))
        if icon:
            icon_classes = icon.get("class", [])
            if "watched" in icon_classes or "b-watched" in icon_classes:
                return True
        return False

    def _parse_schedule_table(self, soup):
        """Парсит таблицу графика (дополнительный источник галочек)"""
        seasons = {}
        table = soup.find("table", class_="b-post__schedule_table")
        if not table: return {}

        rows = table.find_all("tr")
        for tr in rows:
            td_1 = tr.find(class_="td-1")
            if not td_1: continue
            
            text = td_1.text.strip()
            match = re.search(r'(\d+)\s*сезон\s*(\d+)\s*серия', text)
            if not match: continue
            
            s_id = match.group(1)
            e_id = match.group(2)
            global_id = td_1.get("data-id")
            
            # Проверяем галочку в таблице
            is_watched = False
            action_icon = tr.find(class_="watch-episode-action")
            
            if action_icon:
                if action_icon.get("data-id"): global_id = action_icon.get("data-id")
                if "watched" in action_icon.get("class", []): is_watched = True
            elif self._is_watched_check(tr):
                is_watched = True

            if s_id not in seasons: seasons[s_id] = []
            seasons[s_id].append({
                "title": text, "episode": e_id, 
                "global_id": global_id, "watched": is_watched
            })
        return seasons

    def _parse_html_list(self, html_content):
        """Парсит стандартный список серий"""
        soup = BeautifulSoup(html_content, 'html.parser')
        seasons = {}
        items = soup.find_all("li", class_="b-simple_episode__item")
        
        for item in items:
            try:
                s_id = item.get("data-season_id", "1")
                e_id = item.get("data-episode_id", "1")
                title = item.text.strip()
                global_id = item.get("data-id")
                
                if not global_id:
                    inner = item.find(attrs={"data-id": True})
                    if inner: global_id = inner.get("data-id")

                is_watched = self._is_watched_check(item)

                if s_id not in seasons: seasons[s_id] = []
                seasons[s_id].append({
                    "title": title, "episode": e_id, 
                    "global_id": global_id, "watched": is_watched
                })
            except: continue
        return seasons

    def get_series_details(self, url):
        if not self.auth(): return {"error": "Auth failed"}
        try:
            print(f"🔎 {url}")
            r = self.session.get(url)
            soup = BeautifulSoup(r.text, 'html.parser')
            
            # Постер
            hq_poster = ""
            side = soup.find(class_="b-sidecover")
            if side:
                if side.find('a'): hq_poster = side.find('a').get('href')
                elif side.find('img'): hq_poster = side.find('img').get('src')

            # ID Поста
            post_id = None
            if soup.find(id="post_id"): post_id = soup.find(id="post_id").get("value")
            else:
                match = re.search(r'["\']post_id["\']\s*:\s*(\d+)', r.text)
                if match: post_id = match.group(1)

            # === 1. ПАРСИМ ТАБЛИЦУ (для подстраховки) ===
            table_seasons = self._parse_schedule_table(soup)
            
            # === 2. ВСЕГДА ЗАПРАШИВАЕМ API (Чтобы получить ВСЕ сезоны) ===
            player_seasons = {}
            
            if post_id:
                # Ищем ID озвучки
                translator_id = None
                active = soup.find(class_="b-translator__item active")
                if active: translator_id = active.get("data-translator_id")
                else:
                    match = re.search(r'["\']translator_id["\']\s*:\s*(\d+)', r.text)
                    if match: translator_id = match.group(1)

                print(f"🚀 Запрашиваю ВСЕ сезоны через API (ID: {post_id}, Trans: {translator_id})...")
                
                payload = {
                    "id": post_id, 
                    "translator_id": translator_id if translator_id else "238",
                    "action": "get_episodes"
                }
                try:
                    r_ajax = self.session.post(f"{self.origin}/ajax/get_cdn_series/", data=payload)
                    data = r_ajax.json()
                    if data.get('success'):
                        html = data.get('seasons') or data.get('episodes')
                        player_seasons = self._parse_html_list(html)
                        print(f"✅ API вернул полную структуру: {len(player_seasons)} сезонов")
                except Exception as e:
                    print(f"⚠️ Ошибка API: {e}")

            # Если API не сработал (например, фильм), берем то, что было на странице
            if not player_seasons:
                print("⚠️ API пуст, парсим текущую страницу...")
                player_seasons = self._parse_html_list(r.text)

            # === 3. ОБЪЕДИНЯЕМ ТАБЛИЦУ И ПЛЕЕР ===
            # Таблица часто содержит более точные галочки для новых серий
            final_seasons = player_seasons.copy()
            
            if table_seasons:
                print("🔄 Синхронизация с таблицей графика...")
                for s_id, t_eps in table_seasons.items():
                    if s_id in final_seasons:
                        for t_ep in t_eps:
                            for p_ep in final_seasons[s_id]:
                                if p_ep['episode'] == t_ep['episode']:
                                    if t_ep['watched']: p_ep['watched'] = True
                                    if not p_ep['global_id']: p_ep['global_id'] = t_ep['global_id']

            if final_seasons:
                return {"seasons": final_seasons, "poster": hq_poster, "post_id": post_id}
            
            return {"error": "Это фильм или сериал еще не вышел", "poster": hq_poster, "post_id": post_id}

        except Exception as e:
            return {"error": str(e)}

    # ... Остальные методы без изменений ...
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

    def toggle_watch(self, global_id):
        if not self.auth(): return False
        try:
            r = self.session.post(f"{self.origin}/engine/ajax/schedule_watched.php", data={"id": global_id})
            return r.status_code == 200
        except: return False

client = RezkaClient()