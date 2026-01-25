import os
import re
import time
from datetime import datetime
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

    def _is_watched_check(self, element):
        """Проверка статуса просмотра"""
        if not element: return False
        
        # Ищем иконку с классом watched
        icon = element.find("i", class_="watched")
        if icon:
            return True
        
        # Ищем элемент с data-text-unwatch
        action = element.find(class_="watch-episode-action")
        if action:
            classes = action.get("class", [])
            title = action.get("title", "")
            
            if "watched" in classes:
                return True
            if "Удалить" in title:
                return True
        
        return False

    def _is_episode_released(self, tr_element):
        """Проверка, вышла ли серия (доступна для просмотра)"""
        if not tr_element:
            return False
        
        # Проверка 1: Есть ли дата в будущем?
        td_date = tr_element.find(class_="td-2")
        if td_date:
            date_text = td_date.text.strip()
            # Ищем паттерн даты: "26 января" или "26.01"
            
            # Пытаемся распарсить дату
            try:
                # Месяцы на русском
                months_ru = {
                    'января': 1, 'февраля': 2, 'марта': 3, 'апреля': 4,
                    'мая': 5, 'июня': 6, 'июля': 7, 'августа': 8,
                    'сентября': 9, 'октября': 10, 'ноября': 11, 'декабря': 12
                }
                
                # Паттерн: "26 января"
                for month_name, month_num in months_ru.items():
                    if month_name in date_text.lower():
                        day_match = re.search(r'(\d+)', date_text)
                        if day_match:
                            day = int(day_match.group(1))
                            # Предполагаем текущий или следующий год
                            year = datetime.now().year
                            ep_date = datetime(year, month_num, day)
                            
                            # Если дата в будущем - серия не вышла
                            if ep_date > datetime.now():
                                print(f"    📅 Дата в будущем: {date_text}")
                                return False
            except:
                pass
        
        # Проверка 2: Есть ли ссылка на плеер?
        # Если серия вышла, должна быть возможность её посмотреть
        play_link = tr_element.find("a", href=True)
        if not play_link:
            # Нет ссылки = серия не вышла
            print(f"    🔗 Нет ссылки для просмотра")
            return False
        
        # Проверка 3: Класс "not-released" или подобное
        classes = tr_element.get("class", [])
        if "not-released" in classes or "soon" in classes:
            print(f"    🚫 Класс 'не вышла': {classes}")
            return False
        
        return True

    def _parse_schedule_table(self, soup):
        """Парсинг таблицы расписания"""
        seasons = {}
        table = soup.find("table", class_="b-post__schedule_table")
        if not table: 
            print("  ⚠️ Таблица расписания не найдена")
            return {}

        rows = table.find_all("tr")
        print(f"  📊 Найдено строк в таблице: {len(rows)}")
        
        for tr in rows:
            td_1 = tr.find(class_="td-1")
            if not td_1: continue
            
            text = td_1.text.strip()
            s_id = "1"
            e_id = "1"
            
            # Парсинг номера сезона и серии
            match = re.search(r'(\d+)\s*сезон\s*(\d+)\s*серия', text)
            if match:
                s_id = match.group(1)
                e_id = match.group(2)
            else:
                match_ep = re.search(r'(\d+)\s*серия', text)
                if match_ep: 
                    e_id = match_ep.group(1)
            
            # Получаем global_id
            global_id = td_1.get("data-id")
            
            # Проверка иконки
            action_icon = tr.find(class_="watch-episode-action")
            if action_icon:
                if action_icon.get("data-id"): 
                    global_id = action_icon.get("data-id")
            
            print(f"  🔍 Серия {s_id}x{e_id}: text='{text[:30]}...', id={global_id}")
            
            # ФИЛЬТР 1: Нет ID
            if not global_id:
                print(f"    ⏭️ Пропущена (нет ID)")
                continue
            
            # ФИЛЬТР 2: Серия ещё не вышла
            if not self._is_episode_released(tr):
                print(f"    ⏭️ Пропущена (не вышла)")
                continue
            
            # Проверка просмотра
            is_watched = self._is_watched_check(tr)
            
            print(f"    {'✅' if is_watched else '⬜'} Watched={is_watched}")
            
            if s_id not in seasons: 
                seasons[s_id] = []
            
            # Избегаем дубликатов
            exists = False
            for ep in seasons[s_id]:
                if ep['episode'] == e_id: 
                    exists = True
                    break
                    
            if not exists:
                seasons[s_id].append({
                    "title": text, 
                    "episode": e_id, 
                    "global_id": global_id, 
                    "watched": is_watched
                })
                
        return seasons

    def _parse_html_list(self, html_content):
        """Парсинг списка серий из HTML плеера"""
        soup = BeautifulSoup(html_content, 'html.parser')
        seasons = {}
        items = soup.find_all("li", class_="b-simple_episode__item")
        
        print(f"  📺 Найдено элементов в плеере: {len(items)}")
        
        for item in items:
            try:
                s_id = item.get("data-season_id", "1")
                e_id = item.get("data-episode_id", "1")
                title = item.text.strip()
                
                # Получаем global_id
                global_id = item.get("data-id")
                if not global_id:
                    inner = item.find(attrs={"data-id": True})
                    if inner: 
                        global_id = inner.get("data-id")

                print(f"  🎬 Плеер {s_id}x{e_id}: title='{title[:30]}...', id={global_id}")

                # Пропускаем серии без ID
                if not global_id:
                    print(f"    ⏭️ Пропущена (нет ID)")
                    continue

                # Проверка просмотра
                is_watched = self._is_watched_check(item)
                print(f"    {'✅' if is_watched else '⬜'} Watched={is_watched}")
                
                if s_id not in seasons: 
                    seasons[s_id] = []
                    
                seasons[s_id].append({
                    "title": title, 
                    "episode": e_id, 
                    "global_id": global_id, 
                    "watched": is_watched
                })
            except Exception as e:
                print(f"    ❌ Ошибка парсинга: {e}")
                continue
                
        return seasons

    def get_series_details(self, url):
        if not self.auth(): return {"error": "Auth failed"}
        try:
            print(f"\n🔎 {url}")
            r = self.session.get(url)
            html_text = r.text
            soup = BeautifulSoup(html_text, 'html.parser')
            
            # Получаем HQ постер
            hq_poster = ""
            side = soup.find(class_="b-sidecover")
            if side:
                if side.find('a'): 
                    hq_poster = side.find('a').get('href')
                elif side.find('img'): 
                    hq_poster = side.find('img').get('src')

            # ID Поста
            post_id = None
            match_pid = re.search(r'["\']post_id["\']\s*:\s*(\d+)', html_text)
            if match_pid: 
                post_id = match_pid.group(1)
            else: 
                if soup.find(id="post_id"): 
                    post_id = soup.find(id="post_id").get("value")
            
            print(f"📌 Post ID: {post_id}")

            # 1. ТАБЛИЦА РАСПИСАНИЯ
            print("\n📋 === ПАРСИНГ ТАБЛИЦЫ ===")
            table_seasons = self._parse_schedule_table(soup)
            
            # 2. ПЛЕЕР
            player_seasons = {}
            if post_id:
                # ID Озвучки
                translator_id = None
                match_tid = re.search(r'["\']translator_id["\']\s*:\s*(\d+)', html_text)
                if match_tid: 
                    translator_id = match_tid.group(1)
                else:
                    active = soup.find(class_="b-translator__item active")
                    if active: 
                        translator_id = active.get("data-translator_id")
                
                print(f"📌 Translator ID: {translator_id}")

                # Поиск сезонов
                season_ids = re.findall(r'data-tab_id=["\'](\d+)["\']', html_text)
                season_ids = sorted(list(set(season_ids)), key=int)
                season_ids = [sid for sid in season_ids if int(sid) < 100]

                if season_ids:
                    print(f"\n🎬 === ЗАГРУЗКА ПЛЕЕРА (сезоны: {season_ids}) ===")
                    for season_id in season_ids:
                        payload = {
                            "id": post_id, 
                            "translator_id": translator_id if translator_id else "238",
                            "season": season_id,
                            "action": "get_episodes"
                        }
                        try:
                            r_ajax = self.session.post(f"{self.origin}/ajax/get_cdn_series/", data=payload)
                            response = r_ajax.json()
                            
                            if response.get('success'):
                                html = response.get('seasons') or response.get('episodes')
                                print(f"\n  === Сезон {season_id} ===")
                                season_data = self._parse_html_list(html)
                                for s, eps in season_data.items():
                                    if s not in player_seasons: 
                                        player_seasons[s] = []
                                    player_seasons[s].extend(eps)
                            else:
                                print(f"  ⚠️ Ответ API: {response}")
                        except Exception as e:
                            print(f"  ❌ Ошибка AJAX: {e}")
                        time.sleep(0.05)

            # 3. ОБЪЕДИНЕНИЕ
            print("\n🔄 === ОБЪЕДИНЕНИЕ ===")
            final_seasons = player_seasons.copy()
            
            if not final_seasons:
                print("  ℹ️ Плеер пуст, используем только таблицу")
                final_seasons = table_seasons
            elif table_seasons:
                print("  🔀 Синхронизация с таблицей...")
                for s_id, t_eps in table_seasons.items():
                    if s_id not in final_seasons:
                        print(f"    + Добавлен сезон {s_id} из таблицы")
                        final_seasons[s_id] = t_eps
                        continue
                    
                    for t_ep in t_eps:
                        found = False
                        for p_ep in final_seasons[s_id]:
                            if p_ep['episode'] == t_ep['episode']:
                                found = True
                                # Приоритет статуса из таблицы
                                if t_ep['watched'] and not p_ep['watched']:
                                    print(f"    ✅ {s_id}x{t_ep['episode']}: обновлен статус watched")
                                    p_ep['watched'] = True
                                break
                        
                        if not found:
                            print(f"    + {s_id}x{t_ep['episode']}: добавлена из таблицы")
                            final_seasons[s_id].append(t_ep)

            # Финальная фильтрация
            print("\n🧹 === ОЧИСТКА ===")
            for s_id in list(final_seasons.keys()):
                before = len(final_seasons[s_id])
                final_seasons[s_id] = [
                    ep for ep in final_seasons[s_id] 
                    if ep.get('global_id')
                ]
                after = len(final_seasons[s_id])
                if before != after:
                    print(f"  Сезон {s_id}: удалено {before - after} серий без ID")
                
                if not final_seasons[s_id]:
                    print(f"  Сезон {s_id}: пуст, удален")
                    del final_seasons[s_id]

            if final_seasons:
                total_eps = sum(len(eps) for eps in final_seasons.values())
                watched_eps = sum(sum(1 for ep in eps if ep.get('watched')) for eps in final_seasons.values())
                print(f"\n✅ Итого: {total_eps} серий ({watched_eps} просмотрено)")
                return {
                    "seasons": final_seasons, 
                    "poster": hq_poster, 
                    "post_id": post_id
                }
            
            return {
                "error": "Серии не найдены", 
                "poster": hq_poster, 
                "post_id": post_id
            }

        except Exception as e:
            print(f"❌ Критическая ошибка: {str(e)}")
            import traceback
            traceback.print_exc()
            return {"error": str(e)}

    def get_category_items(self, cat_id):
        """Получение списка из категории избранного"""
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
                except: 
                    continue
            return items
        except: 
            return []

    def search(self, query):
        """Поиск по названию"""
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
                            "url": url
                        })
                except: 
                    continue
            return results
        except: 
            return []

    def add_favorite(self, post_id, cat_id):
        """Добавление в избранное"""
        if not self.auth(): return False
        try:
            r = self.session.post(f"{self.origin}/ajax/favorites/", data={
                "post_id": post_id, 
                "cat_id": cat_id, 
                "action": "add_post"
            })
            return r.json().get('success', False)
        except: 
            return False

    def toggle_watch(self, global_id):
        """Переключение статуса просмотра серии"""
        if not self.auth(): return False
        try:
            r = self.session.post(
                f"{self.origin}/engine/ajax/schedule_watched.php", 
                data={"id": global_id}
            )
            return r.status_code == 200
        except: 
            return False

client = RezkaClient()
