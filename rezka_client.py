import os
import re
import time
from typing import Dict, List, Optional, Any
from urllib.parse import urlparse, urljoin

from curl_cffi import requests as curl_requests  # type: ignore
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()


class RezkaClient:
    """
    Клиент для работы с HDRezka.
    """

    def __init__(self, base_url: Optional[str] = None) -> None:
        self.session = curl_requests.Session(impersonate="chrome110")
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
            "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "Cache-Control": "max-age=0",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-User": "?1"
        })

        self.login = os.getenv("REZKA_LOGIN")
        self.password = os.getenv("REZKA_PASS")
        self.is_logged_in = False
        self.origin: str = base_url or os.getenv("REZKA_DOMAIN", "https://hdrezka.me")

    def auth(self) -> bool:
        if self.is_logged_in:
            return True
        try:
            print("🔑 Попытка авторизации...")
            headers = {"X-Requested-With": "XMLHttpRequest"}
            r = self.session.post(
                f"{self.origin}/ajax/login/",
                data={"login_name": self.login, "login_password": self.password},
                headers=headers,
            )
            try:
                res = r.json()
                if res.get("success"):
                    self.is_logged_in = True
                    print("✅ Авторизация успешна")
                    return True
                else:
                    print(f"❌ Ошибка авторизации (API): {res}")
            except:
                print(f"❌ Ошибка авторизации (Не JSON): {r.text[:100]}")
        except Exception as e:
            print(f"❌ Ошибка подключения при авторизации: {e}")
        return False

    def _is_watched_check(self, element: Any) -> bool:
        if not element:
            return False
        classes = element.get("class", [])
        if "watched" in classes or "b-watched" in classes:
            return True
        action = element.find(
            attrs={"class": lambda x: x and ("watch-episode-action" in x or "b-ico" in x)}
        )
        if action:
            if "watched" in action.get("class", []):
                return True
        return False

    def _parse_schedule_table(self, soup: BeautifulSoup) -> Dict[str, List[Dict[str, Any]]]:
        seasons: Dict[str, List[Dict[str, Any]]] = {}
        tables = soup.find_all("table", class_="b-post__schedule_table")
        for table in tables:
            # Знаходимо ВСІ <tr>, включаючи приховані (з класом hide, collapsed і т.д.)
            all_rows = table.find_all("tr")
            for tr in all_rows:
                td_1 = tr.find(class_="td-1")
                if not td_1:
                    continue
                text = td_1.get_text(strip=True)
                
                # --- Парсинг даты (td-4) ---
                date_text = ""
                td_date = tr.find(class_="td-4")
                if td_date:
                    date_text = td_date.get_text(strip=True)
                # ---------------------------

                # --- Парсинг названий серий (td-2) ---
                episode_title_ru = ""
                episode_title_en = ""
                td_2 = tr.find(class_="td-2")
                if td_2:
                    # Ищем <b> для русского названия
                    b_tag = td_2.find("b")
                    if b_tag:
                        episode_title_ru = b_tag.get_text(strip=True)
                    
                    # Ищем <span> для английского названия
                    span_tag = td_2.find("span")
                    if span_tag:
                        episode_title_en = span_tag.get_text(strip=True)
                # ---------------------------

                s_id = "1"
                e_id = "1"
                match = re.search(r"(\d+)\s*сезон\s*(\d+)\s*серия", text, re.IGNORECASE)
                if match:
                    s_id, e_id = match.group(1), match.group(2)
                else:
                    match_ep = re.search(r"(\d+)\s*серия", text, re.IGNORECASE)
                    if match_ep:
                        e_id = match_ep.group(1)
                try:
                    s_id = str(int(s_id))
                except Exception:
                    pass
                try:
                    e_id = str(int(e_id))
                except Exception:
                    pass
                
                global_id = None
                action_icon = tr.find(
                    attrs={"class": lambda x: x and "watch-episode-action" in x}
                )
                if action_icon and action_icon.get("data-id"):
                    global_id = action_icon.get("data-id")
                
                if not global_id:
                    global_id = td_1.get("data-id")

                has_action = bool(action_icon)
                has_exists = bool(tr.find("span", class_="exists-episode"))
                if not has_action and not has_exists:
                    continue
                if not global_id:
                    continue
                
                is_watched = self._is_watched_check(tr)
                if s_id not in seasons:
                    seasons[s_id] = []
                exists = any(ep["episode"] == e_id for ep in seasons[s_id])
                if not exists:
                    seasons[s_id].append(
                        {
                            "title": text,
                            "episode": e_id,
                            "global_id": global_id,
                            "watched": is_watched,
                            "date": date_text,
                            "episode_title_ru": episode_title_ru,
                            "episode_title_en": episode_title_en
                        }
                    )
        return seasons

    def _parse_html_list(self, html_content: str, default_season: str = "1") -> Dict[str, Dict[str, Any]]:
        soup = BeautifulSoup(html_content, "html.parser")
        unique_episodes: Dict[str, Dict[str, Any]] = {}
        containers = soup.find_all(
            "ul",
            class_=lambda x: x and ("simple_episodes__list" in x or "b-simple_episodes__list" in x),
        )
        if not containers:
            containers = soup.find_all("ul", id=re.compile(r"simple-episodes-list"))
        if not containers:
            containers = [soup]
        for cont in containers:
            container_s_id = None
            if hasattr(cont, "get") and cont.get("id"):
                match_s = re.search(r"list-(\d+)", cont.get("id"))
                if match_s:
                    container_s_id = match_s.group(1)
            li_items = cont.find_all("li", class_="b-simple_episode__item")
            for item in li_items:
                try:
                    s_id = item.get("data-season_id") or container_s_id or default_season
                    e_id = item.get("data-episode_id")
                    if not e_id:
                        continue
                    s_id = str(int(s_id))
                    e_id = str(int(e_id))
                    title = item.get_text(strip=True)
                    
                    global_id: Optional[str] = None
                    action_icon = item.find(
                        attrs={"class": lambda x: x and "watch-episode-action" in x}
                    )
                    if action_icon and action_icon.get("data-id"):
                        global_id = action_icon.get("data-id")
                    if not global_id:
                        if item.get("data-id"):
                            global_id = item.get("data-id")
                    if not global_id:
                        inner = item.find(attrs={"data-id": True})
                        if inner and inner.get("data-id"):
                            global_id = inner.get("data-id")
                    if not global_id:
                        continue
                    is_watched = self._is_watched_check(item)
                    unique_episodes[f"{s_id}:{e_id}"] = {
                        "s_id": s_id,
                        "title": title,
                        "episode": e_id,
                        "global_id": global_id,
                        "watched": is_watched,
                        "date": "",
                        "episode_title_ru": "",
                        "episode_title_en": ""
                    }
                except Exception:
                    continue
        return unique_episodes

    def get_series_details(self, url: str) -> Dict[str, Any]:
        if not self.auth():
            return {"error": "Auth failed"}
        try:
            r = self.session.get(url)
            try:
                parsed = urlparse(r.url)
                if parsed.scheme and parsed.netloc:
                    self.origin = f"{parsed.scheme}://{parsed.netloc}"
            except Exception:
                pass

            html_text = r.text
            soup = BeautifulSoup(html_text, "html.parser")
            
            hq_poster = ""
            side = soup.find(class_="b-sidecover")
            if side:
                if side.find("a"):
                    hq_poster = side.find("a").get("href")
                elif side.find("img"):
                    hq_poster = side.find("img").get("src")
            
            post_id: Optional[str] = None
            match_pid = re.search(r'["\']post_id["\']\s*:\s*(\d+)', html_text)
            if match_pid:
                post_id = match_pid.group(1)
            elif soup.find(id="post_id"):
                post_id = soup.find(id="post_id").get("value")
            
            translators = []
            translator_items = soup.find_all(class_="b-translator__item")
            for t_item in translator_items:
                t_id = t_item.get("data-translator_id")
                t_name = t_item.get("title") or t_item.get_text(strip=True)
                img = t_item.find("img")
                if img:
                    t_name = t_item.get_text(strip=True) or t_item.get("title")
                
                if t_id:
                    translators.append({"id": t_id, "name": t_name})
            
            if not translators and post_id:
                active_t = None
                match_tid = re.search(r'["\']translator_id["\']\s*:\s*(\d+)', html_text)
                if match_tid: active_t = match_tid.group(1)
                if active_t:
                    translators.append({"id": active_t, "name": "По умолчанию"})

            franchises = []
            franchise_link = soup.find("a", class_="b-post__franchise_link_title")
            if not franchise_link:
                try:
                    sidetitles = soup.find_all("div", class_="b-sidetitle")
                    for st in sidetitles:
                        if "Все проекты" in st.get_text() or "Все части" in st.get_text():
                            franchise_link = st.find("a")
                            if franchise_link: break
                except: pass
            if not franchise_link:
                franchise_link = soup.find("a", href=re.compile(r"/franchises/"))

            if franchise_link and franchise_link.get("href"):
                f_url = franchise_link.get("href")
                if f_url:
                    if f_url.startswith("/"): 
                        f_url = urljoin(self.origin, f_url)
                    franchises = self.get_franchise_items(f_url)

            table_seasons = self._parse_schedule_table(soup)
            all_unique_episodes: Dict[str, Dict[str, Any]] = {}
            
            if post_id:
                translator_id = None
                match_tid = re.search(r'["\']translator_id["\']\s*:\s*(\d+)', html_text)
                if match_tid:
                    translator_id = match_tid.group(1)
                else:
                    active = soup.find(class_="b-translator__item active")
                    if active:
                        translator_id = active.get("data-translator_id")
                
                if not translator_id and translators:
                    translator_id = translators[0]["id"]

                season_ids = re.findall(r'data-tab_id=["\'](\d+)["\']', html_text)
                season_ids = sorted(list(set(season_ids)), key=lambda x: int(x) if x.isdigit() else 0)
                season_ids = [s for s in season_ids if s.isdigit() and int(s) < 200]
                
                if season_ids:
                    for season_id in season_ids:
                        payload = {
                            "id": post_id,
                            "translator_id": translator_id if translator_id else "238",
                            "season": season_id,
                            "action": "get_episodes",
                        }
                        try:
                            time.sleep(0.05)
                            r_ajax = self.session.post(
                                f"{self.origin}/ajax/get_cdn_series/", data=payload
                            )
                            data = r_ajax.json()
                            if data.get("success"):
                                html = data.get("episodes") or data.get("seasons")
                                new_eps = self._parse_html_list(html, default_season=season_id)
                                all_unique_episodes.update(new_eps)
                        except Exception:
                            continue
                else:
                    payload = {
                        "id": post_id,
                        "translator_id": translator_id or "238",
                        "action": "get_episodes",
                    }
                    try:
                        r_ajax = self.session.post(
                            f"{self.origin}/ajax/get_cdn_series/", data=payload
                        )
                        data = r_ajax.json()
                        if data.get("success"):
                            html = data.get("episodes") or data.get("seasons")
                            new_eps = self._parse_html_list(html)
                            all_unique_episodes.update(new_eps)
                    except Exception:
                        pass
            
            if not all_unique_episodes:
                new_eps = self._parse_html_list(html_text)
                all_unique_episodes.update(new_eps)
            
            final_seasons_dict: Dict[str, List[Dict[str, Any]]] = {}
            for _, ep_data in all_unique_episodes.items():
                s_id = ep_data["s_id"]
                if s_id not in final_seasons_dict:
                    final_seasons_dict[s_id] = []
                clean_ep = ep_data.copy()
                del clean_ep["s_id"]
                final_seasons_dict[s_id].append(clean_ep)
            
            if table_seasons:
                for s_id, t_eps in table_seasons.items():
                    if s_id not in final_seasons_dict:
                        final_seasons_dict[s_id] = list(t_eps)
                        continue
                    for t_ep in t_eps:
                        found = False
                        for p_ep in final_seasons_dict[s_id]:
                            if str(p_ep["episode"]) == str(t_ep["episode"]):
                                found = True
                                if t_ep["watched"]:
                                    p_ep["watched"] = True
                                if t_ep.get("global_id"):
                                    p_ep["global_id"] = t_ep["global_id"]
                                if t_ep.get("date"):
                                    p_ep["date"] = t_ep["date"]
                                # Додаємо назви серій
                                if t_ep.get("episode_title_ru"):
                                    p_ep["episode_title_ru"] = t_ep["episode_title_ru"]
                                if t_ep.get("episode_title_en"):
                                    p_ep["episode_title_en"] = t_ep["episode_title_en"]
                                break
                        if not found:
                            final_seasons_dict[s_id].append(t_ep)
            
            sorted_seasons: Dict[str, List[Dict[str, Any]]] = {}
            sorted_keys = sorted(
                final_seasons_dict.keys(), key=lambda x: int(x) if x.isdigit() else 999
            )
            for s in sorted_keys:
                eps = final_seasons_dict[s]
                eps.sort(key=lambda x: int(x["episode"]) if x["episode"].isdigit() else 999)
                sorted_seasons[s] = eps
            
            return {
                "seasons": sorted_seasons, 
                "poster": hq_poster, 
                "post_id": post_id, 
                "franchises": franchises,
                "translators": translators
            }
        except Exception as e:
            return {"error": str(e)}

    def get_episodes_for_translator(self, post_id: str, translator_id: str) -> Dict[str, Any]:
        if not self.auth():
            return {}
        all_unique_episodes: Dict[str, Dict[str, Any]] = {}
        payload = {
            "id": post_id,
            "translator_id": translator_id,
            "action": "get_episodes"
        }
        try:
            r = self.session.post(f"{self.origin}/ajax/get_cdn_series/", data=payload)
            data = r.json()
            if not data.get("success"):
                return {}
            html_content = data.get("episodes") or data.get("seasons")
            season_ids = re.findall(r'data-tab_id=["\'](\d+)["\']', html_content)
            if season_ids:
                unique_seasons = sorted(list(set(season_ids)), key=lambda x: int(x) if x.isdigit() else 0)
                for s_id in unique_seasons:
                    pl_season = {
                        "id": post_id,
                        "translator_id": translator_id,
                        "season": s_id,
                        "action": "get_episodes"
                    }
                    time.sleep(0.1)
                    r_s = self.session.post(f"{self.origin}/ajax/get_cdn_series/", data=pl_season)
                    d_s = r_s.json()
                    if d_s.get("success"):
                        h_s = d_s.get("episodes") or d_s.get("seasons")
                        all_unique_episodes.update(self._parse_html_list(h_s, default_season=s_id))
            else:
                all_unique_episodes.update(self._parse_html_list(html_content))
        except Exception as e:
            print(f"Error getting translator episodes: {e}")
            return {}
        final_seasons: Dict[str, List[Dict[str, Any]]] = {}
        for _, ep_data in all_unique_episodes.items():
            s_id = ep_data["s_id"]
            if s_id not in final_seasons:
                final_seasons[s_id] = []
            clean_ep = ep_data.copy()
            del clean_ep["s_id"]
            final_seasons[s_id].append(clean_ep)
        return final_seasons

    def get_category_items(self, cat_id: str) -> List[Dict[str, Any]]:
        return self.get_category_items_paginated(cat_id, max_pages=1)

    def add_favorite(self, post_id: str, cat_id: str) -> bool:
        if not self.auth():
            return False
        # --- FIX: Заменяем названия на цифры ---
        if cat_id == 'watching': cat_id = '1'
        elif cat_id == 'later': cat_id = '2'
        elif cat_id == 'watched': cat_id = '3'
        
        try:
            r = self.session.post(
                f"{self.origin}/ajax/favorites/",
                data={"post_id": post_id, "cat_id": cat_id, "action": "add_post"},
            )
            return bool(r.json().get("success", False))
        except Exception:
            return False

    def remove_favorite(self, post_id: str, cat_id: str) -> bool:
        if not self.auth():
            return False
        # --- FIX: Заменяем названия на цифры ---
        if cat_id == 'watching': cat_id = '1'
        elif cat_id == 'later': cat_id = '2'
        elif cat_id == 'watched': cat_id = '3'
        
        try:
            r = self.session.post(
                f"{self.origin}/ajax/favorites/",
                data={"post_id": post_id, "cat_id": cat_id, "action": "add_post"},
            )
            try:
                return bool(r.json().get("success", False))
            except Exception:
                return False
        except Exception:
            return False

    def get_category_items_paginated(self, cat_id: str, max_pages: int = 5, sort_by: str = "added") -> List[Dict[str, Any]]:
        # --- FIX: Маппинг названий категорий на ID для URL ---
        if cat_id == 'watching': cat_id = '1'
        elif cat_id == 'later': cat_id = '2'
        elif cat_id == 'watched': cat_id = '3'
        # ---------------------------------------------------

        for attempt in range(2):
            all_items: List[Dict[str, Any]] = []
            seen_ids: set[str] = set()
            if not self.auth():
                if attempt == 0:
                     self.is_logged_in = False
                     continue
                return []
            filter_param = "filter=added"
            if sort_by == "year":
                filter_param = "filter=year"
            elif sort_by == "popular":
                filter_param = "filter=popular"
            
            for page in range(1, max_pages + 1):
                try:
                    url_page = f"{self.origin}/favorites/{cat_id}/"
                    if page > 1:
                        url_page = f"{url_page}page/{page}/"
                    url_page = f"{url_page}?{filter_param}"
                    r = self.session.get(url_page)
                    soup = BeautifulSoup(r.text, "html.parser")
                    items_page: List[Dict[str, Any]] = []
                    if soup.find("input", {"name": "login_name"}) or "Авторизация" in r.text:
                         break 
                    for item in soup.find_all(class_="b-content__inline_item"):
                        try:
                            item_id = item.get("data-id")
                            if not item_id or item_id in seen_ids:
                                continue
                            link = item.find(class_="b-content__inline_item-link").find("a")
                            img = item.find(class_="b-content__inline_item-cover").find("img")
                            status = item.find(class_="info")
                            full_title = link.get_text(strip=True) if link else ""
                            year = ""
                            match_year = re.search(r'\((\d{4})\)', full_title)
                            if match_year:
                                year = match_year.group(1)
                            raw_url = link.get("href") if link else ""
                            if raw_url and not raw_url.startswith("http"):
                                raw_url = urljoin(self.origin, raw_url)
                            items_page.append(
                                {
                                    "id": item_id,
                                    "title": full_title,
                                    "url": raw_url,
                                    "poster": img.get("src") if img else "",
                                    "status": status.get_text(strip=True) if status else "",
                                    "year": year
                                }
                            )
                            seen_ids.add(item_id)
                        except Exception:
                            continue
                    if items_page:
                        all_items.extend(items_page)
                    else:
                        break 
                except Exception as e:
                    print(f"ERROR Fetching page: {e}")
                    break
            if all_items:
                return all_items
            if attempt == 0:
                self.is_logged_in = False
            else:
                return [] 
        return []

    def toggle_watch(self, global_id: str, referer: Optional[str] = None) -> bool:
        if not self.auth():
            return False
        try:
            ref = referer or self.origin
            headers = {
                "X-Requested-With": "XMLHttpRequest",
                "Referer": ref,
                "Origin": self.origin,
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "same-origin",
            }
            try:
                host = urlparse(self.origin).netloc
                if host:
                    headers["Host"] = host
            except Exception:
                pass
            payload = {"id": global_id}
            if referer:
                try:
                    r_det = self.session.get(referer, headers={"Referer": self.origin})
                    if r_det.status_code == 200:
                        text = r_det.text
                        match_pid = re.search(r'["\']post_id["\']\s*:\s*(\d+)', text)
                        post_id = None
                        if match_pid:
                            post_id = match_pid.group(1)
                        else:
                            soup_tmp = BeautifulSoup(text, "html.parser")
                            pid_elem = soup_tmp.find(id="post_id")
                            if pid_elem:
                                post_id = pid_elem.get("value")
                        if post_id:
                            payload["post_id"] = post_id
                except Exception:
                    pass
            r = self.session.post(
                f"{self.origin}/engine/ajax/schedule_watched.php",
                data=payload,
                headers=headers,
            )
            try:
                data = r.json()
                return bool(data.get("success", False) or data.get("status") == "ok")
            except Exception:
                return r.status_code == 200
        except Exception as e:
            print(f"ERROR: Ошибка Toggle Watch: {e}")
            return False

    def search(self, query: str) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        if not query or len(query.strip()) < 3:
            return results
        self.auth()
        try:
            headers = {
                "X-Requested-With": "XMLHttpRequest",
                "Referer": self.origin,
                "Origin": self.origin,
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            }
            r = self.session.post(
                f"{self.origin}/engine/ajax/search.php",
                data={"q": query},
                headers=headers,
            )
            if r.status_code != 200:
                return results
            soup = BeautifulSoup(r.content, "html.parser")
            for li in soup.select(".b-search__section_list li"):
                try:
                    anchor = li.find("a")
                    if not anchor:
                        continue
                    url = anchor.get("href")
                    if url and not url.startswith("http"):
                        url = urljoin(self.origin, url)

                    item_id = anchor.get("data-id") or li.get("data-id")
                    if not item_id and url:
                        match = re.search(r'/(\d+)(?:-|\.)', url)
                        if match:
                            item_id = match.group(1)

                    item_id = item_id or url 

                    title_span = li.find("span", class_="enty")
                    title = title_span.get_text(strip=True) if title_span else anchor.get_text(strip=True)
                    
                    year = ""
                    match_year = re.search(r'\((\d{4})\)', title)
                    if match_year:
                        year = match_year.group(1)

                    rating_span = li.find("span", class_="rating")
                    rating = None
                    if rating_span:
                        try:
                            rating = float(rating_span.get_text())
                        except Exception:
                            rating = None
                    img = li.find("img")
                    poster = img.get("src") if img else ""
                    results.append({
                        "id": item_id,
                        "title": title,
                        "url": url,
                        "poster": poster,
                        "rating": rating,
                        "year": year 
                    })
                except Exception:
                    continue
        except Exception:
            pass
        return results

    def get_franchise_items(self, franchise_url: str) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        if not franchise_url:
            return items
        try:
            headers = {"Referer": self.origin}
            r = self.session.get(franchise_url, headers=headers)
            if r.status_code != 200: 
                return items
            soup = BeautifulSoup(r.text, "html.parser")
            blocks = soup.find_all("div", class_="b-post__partcontent_item")
            if blocks:
                for block in blocks:
                    try:
                        url = block.get("data-url")
                        if url:
                            if url.startswith("/"):
                                url = urljoin(self.origin, url)
                        title = ""
                        info_text = ""
                        rating = None
                        title_container = block.find("div", class_="td title")
                        if title_container:
                            a_tag = title_container.find("a")
                            title = a_tag.get_text(strip=True) if a_tag else title_container.get_text(strip=True)
                        year_container = block.find("div", class_="td year")
                        if year_container:
                            info_text = year_container.get_text(strip=True)
                        year = ""
                        if info_text and re.match(r'\d{4}', info_text):
                            year = info_text.split()[0]
                        else:
                            match_year = re.search(r'\((\d{4})\)', title)
                            if match_year: year = match_year.group(1)
                        rating_container = block.find("div", class_="td rating")
                        if rating_container:
                            rating = rating_container.get_text(strip=True)
                        poster = ""
                        try:
                            if url:
                                r_p = self.session.get(url, headers={"Referer": self.origin})
                                if r_p.status_code == 200:
                                    soup_p = BeautifulSoup(r_p.text, "html.parser")
                                    side = soup_p.find(class_="b-sidecover")
                                    if side:
                                        if side.find("a"):
                                            poster = side.find("a").get("href")
                                        elif side.find("img"):
                                            poster = side.find("img").get("src")
                        except Exception:
                            poster = ""
                        items.append({
                            "id": None,
                            "title": title,
                            "url": url,
                            "poster": poster,
                            "info": info_text,
                            "rating": rating,
                            "year": year
                        })
                    except Exception:
                        continue
                return items
            blocks = soup.find_all(class_="b-content__inline_item")
            if not blocks:
                container = soup.find(class_="b-content__inline_items")
                if container:
                    blocks = container.find_all("div", recursive=False)
            for block in blocks:
                try:
                    link_wrap = block.find(class_="b-content__inline_item-link")
                    link = link_wrap.find("a") if link_wrap else None
                    if not link:
                        continue
                    title = link.get_text(strip=True)
                    url = link.get("href")
                    if url and not url.startswith("http"):
                        url = urljoin(self.origin, url)
                    item_id = block.get("data-id")
                    info = block.find(class_="misc")
                    misc_text = info.get_text(strip=True) if info else ""
                    year = ""
                    match_year = re.search(r'\((\d{4})\)', title)
                    if match_year: year = match_year.group(1)
                    img_wrap = block.find(class_="b-content__inline_item-cover")
                    img = img_wrap.find("img") if img_wrap else None
                    poster = img.get("src") if img else ""
                    items.append({
                        "id": item_id,
                        "title": title,
                        "url": url,
                        "poster": poster,
                        "info": misc_text,
                        "year": year
                    })
                except Exception:
                    continue
        except Exception as e:
            print(f"ERROR: Ошибка парсинга франшизы: {e}")
        return items
    def get_collection_items(self, url: str) -> List[Dict[str, Any]]:
        """
        Парсит страницу коллекции или любую страницу с сеткой фильмов (b-content__inline_item).
        """
        items = []
        # Авторизация не обязательна для публичных коллекций, но желательна для обхода защиты
        self.auth() 
        
        try:
            r = self.session.get(url)
            if r.status_code != 200:
                print(f"Ошибка загрузки коллекции {url}: {r.status_code}")
                return items

            soup = BeautifulSoup(r.text, "html.parser")
            
            # Находим контейнер с элементами
            container = soup.find(class_="b-content__inline_items")
            if not container:
                # Иногда верстка отличается, пробуем искать сразу элементы
                blocks = soup.find_all(class_="b-content__inline_item")
            else:
                blocks = container.find_all("div", class_="b-content__inline_item")

            for block in blocks:
                try:
                    # Получаем ID
                    item_id = block.get("data-id")
                    if not item_id: continue

                    # Получаем ссылку и название
                    link_wrap = block.find(class_="b-content__inline_item-link")
                    link = link_wrap.find("a") if link_wrap else None
                    if not link: continue
                    
                    title = link.get_text(strip=True)
                    item_url = link.get("href")
                    if item_url and not item_url.startswith("http"):
                        item_url = urljoin(self.origin, item_url)

                    # Получаем постер
                    img_wrap = block.find(class_="b-content__inline_item-cover")
                    img = img_wrap.find("img") if img_wrap else None
                    poster = img.get("src") if img else ""

                    # Получаем доп. инфу (год, жанр и т.д.)
                    info = block.find(class_="misc")
                    misc_text = info.get_text(strip=True) if info else ""
                    
                    # Год
                    year = ""
                    match_year = re.search(r'\((\d{4})\)', title)
                    if match_year: year = match_year.group(1)

                    # Статус (для сериалов) или качество
                    status_elem = block.find(class_="info")
                    status = status_elem.get_text(strip=True) if status_elem else ""

                    items.append({
                        "id": item_id,
                        "title": title,
                        "url": item_url,
                        "poster": poster,
                        "info": misc_text,
                        "year": year,
                        "status": status
                    })
                except Exception as e:
                    print(f"Ошибка парсинга элемента коллекции: {e}")
                    continue
        except Exception as e:
            print(f"Ошибка запроса к коллекции: {e}")
        
        return items


__all__ = ["RezkaClient"]