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
    Клиент для работы с HDRezka. Содержит методы для авторизации,
    получения информации о сериалах, работе с закладками, франшизами
    и изменением статуса эпизодов.
    """

    def __init__(self, base_url: Optional[str] = None) -> None:
        """
        Создаёт сессию для работы с HDRezka. Принимает необязательный base_url,
        который используется в качестве основного домена. Если base_url не
        указан, будет взят из переменной окружения REZKA_DOMAIN или
        по умолчанию "https://hdrezka.me".
        """
        # Инициализируем curl session с маскировкой Chrome
        self.session = curl_requests.Session(impersonate="chrome110")
        self.login = os.getenv("REZKA_LOGIN")
        self.password = os.getenv("REZKA_PASS")
        self.is_logged_in = False
        # Основной домен для запросов. Берём из аргумента либо переменной окружения.
        self.origin: str = base_url or os.getenv("REZKA_DOMAIN", "https://hdrezka.me")

    def auth(self) -> bool:
        """Авторизация на HDRezka. Возвращает True при успехе."""
        if self.is_logged_in:
            return True
        try:
            headers = {"X-Requested-With": "XMLHttpRequest"}
            r = self.session.post(
                f"{self.origin}/ajax/login/",
                data={"login_name": self.login, "login_password": self.password},
                headers=headers,
            )
            if r.json().get("success"):
                self.is_logged_in = True
                return True
        except Exception:
            pass
        return False

    # ------------------------
    # Внутренние методы парсинга
    # ------------------------
    def _is_watched_check(self, element: Any) -> bool:
        """Определяет, отмечен ли элемент как просмотренный."""
        if not element:
            return False
        classes = element.get("class", [])
        # Класс watched / b-watched в строке
        if "watched" in classes or "b-watched" in classes:
            return True
        # Или класс watched на иконке
        action = element.find(
            attrs={"class": lambda x: x and ("watch-episode-action" in x or "b-ico" in x)}
        )
        if action:
            if "watched" in action.get("class", []):
                return True
        return False

    def _parse_schedule_table(self, soup: BeautifulSoup) -> Dict[str, List[Dict[str, Any]]]:
        """
        Парсит все таблицы расписания на странице сериала. Возвращает
        словарь сезонов со списками эпизодов, каждый содержит
        идентификатор, номер серии и флаг просмотра.
        """
        seasons: Dict[str, List[Dict[str, Any]]] = {}
        tables = soup.find_all("table", class_="b-post__schedule_table")
        for table in tables:
            for tr in table.find_all("tr"):
                td_1 = tr.find(class_="td-1")
                if not td_1:
                    continue
                text = td_1.get_text(strip=True)
                # По умолчанию
                s_id = "1"
                e_id = "1"
                # Извлекаем "2 сезон 5 серия" или просто "15 серия"
                match = re.search(r"(\d+)\s*сезон\s*(\d+)\s*серия", text, re.IGNORECASE)
                if match:
                    s_id, e_id = match.group(1), match.group(2)
                else:
                    match_ep = re.search(r"(\d+)\s*серия", text, re.IGNORECASE)
                    if match_ep:
                        e_id = match_ep.group(1)
                # Нормализация
                try:
                    s_id = str(int(s_id))
                except Exception:
                    pass
                try:
                    e_id = str(int(e_id))
                except Exception:
                    pass
                # Определяем глобальный id
                global_id = td_1.get("data-id")
                action_icon = tr.find(
                    attrs={"class": lambda x: x and "watch-episode-action" in x}
                )
                if action_icon and action_icon.get("data-id"):
                    global_id = action_icon.get("data-id")
                # Доступность: если нет action и нет exists-episode, пропускаем
                has_action = bool(action_icon)
                has_exists = bool(tr.find("span", class_="exists-episode"))
                if not has_action and not has_exists:
                    continue
                if not global_id:
                    continue
                is_watched = self._is_watched_check(tr)
                if s_id not in seasons:
                    seasons[s_id] = []
                # избегаем дублей
                exists = any(ep["episode"] == e_id for ep in seasons[s_id])
                if not exists:
                    seasons[s_id].append(
                        {
                            "title": text,
                            "episode": e_id,
                            "global_id": global_id,
                            "watched": is_watched,
                        }
                    )
        return seasons

    def _parse_html_list(self, html_content: str) -> Dict[str, Dict[str, Any]]:
        """
        Парсит список эпизодов из HTML, возвращая уникальные эпизоды.
        """
        soup = BeautifulSoup(html_content, "html.parser")
        unique_episodes: Dict[str, Dict[str, Any]] = {}
        # Ищем UL контейнеры эпизодов
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
                    s_id = item.get("data-season_id") or container_s_id or "1"
                    e_id = item.get("data-episode_id")
                    if not e_id:
                        continue
                    s_id = str(int(s_id))
                    e_id = str(int(e_id))
                    title = item.get_text(strip=True)
                    global_id = item.get("data-id")
                    if not global_id:
                        inner = item.find(attrs={"data-id": True})
                        if inner:
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
                    }
                except Exception:
                    continue
        return unique_episodes

    # ------------------------
    # Получение информации о сериалах
    # ------------------------
    def get_series_details(self, url: str) -> Dict[str, Any]:
        """
        Загружает страницу сериала, возвращает информацию о сезонах и эпизодах.
        Статус просмотра определяется по таблице расписания и данным API.
        """
        if not self.auth():
            return {"error": "Auth failed"}
        try:
            r = self.session.get(url)
            # Если страница ведёт на другой домен (например, .sh), обновляем origin
            try:
                parsed = urlparse(url)
                if parsed.scheme and parsed.netloc:
                    self.origin = f"{parsed.scheme}://{parsed.netloc}"
            except Exception:
                pass
            html_text = r.text
            soup = BeautifulSoup(html_text, "html.parser")
            # Постер
            hq_poster = ""
            side = soup.find(class_="b-sidecover")
            if side:
                if side.find("a"):
                    hq_poster = side.find("a").get("href")
                elif side.find("img"):
                    hq_poster = side.find("img").get("src")
            # post_id
            post_id: Optional[str] = None
            match_pid = re.search(r'["\']post_id["\']\s*:\s*(\d+)', html_text)
            if match_pid:
                post_id = match_pid.group(1)
            elif soup.find(id="post_id"):
                post_id = soup.find(id="post_id").get("value")
            # Таблица расписания
            table_seasons = self._parse_schedule_table(soup)
            all_unique_episodes: Dict[str, Dict[str, Any]] = {}
            if post_id:
                translator_id: Optional[str] = None
                match_tid = re.search(r'["\']translator_id["\']\s*:\s*(\d+)', html_text)
                if match_tid:
                    translator_id = match_tid.group(1)
                else:
                    active = soup.find(class_="b-translator__item active")
                    if active:
                        translator_id = active.get("data-translator_id")
                # ID сезонов
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
                                new_eps = self._parse_html_list(html)
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
            # fallback
            if not all_unique_episodes:
                new_eps = self._parse_html_list(html_text)
                all_unique_episodes.update(new_eps)
            # Объединяем таблицу и список
            final_seasons_dict: Dict[str, List[Dict[str, Any]]] = {}
            # Сначала из player
            for _, ep_data in all_unique_episodes.items():
                s_id = ep_data["s_id"]
                if s_id not in final_seasons_dict:
                    final_seasons_dict[s_id] = []
                clean_ep = ep_data.copy()
                del clean_ep["s_id"]
                final_seasons_dict[s_id].append(clean_ep)
            # Обновляем статусами из таблицы
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
                                if not p_ep.get("global_id"):
                                    p_ep["global_id"] = t_ep["global_id"]
                                break
                        if not found:
                            final_seasons_dict[s_id].append(t_ep)
            # Сортируем
            sorted_seasons: Dict[str, List[Dict[str, Any]]] = {}
            sorted_keys = sorted(final_seasons_dict.keys(), key=lambda x: int(x) if x.isdigit() else 999)
            for s in sorted_keys:
                eps = final_seasons_dict[s]
                eps.sort(key=lambda x: int(x["episode"]) if x["episode"].isdigit() else 999)
                sorted_seasons[s] = eps
            # Пытаемся найти ссылку на страницу франшизы/серии, если она есть
            franchise_url: Optional[str] = None
            try:
                link_fr = soup.find("a", href=re.compile(r"/franchises/"))
                if link_fr and link_fr.get("href"):
                    franchise_url = urljoin(self.origin, link_fr.get("href"))
                else:
                    heading = soup.find(
                        lambda tag: tag.name in ["h2", "h3", "div"]
                        and tag.get_text().strip().lower().startswith("все проекты")
                    )
                    if heading:
                        next_link = heading.find_next("a", href=True)
                        if next_link:
                            franchise_url = urljoin(self.origin, next_link.get("href"))
            except Exception:
                franchise_url = None
            if sorted_seasons:
                return {
                    "seasons": sorted_seasons,
                    "poster": hq_poster,
                    "post_id": post_id,
                    "franchise_url": franchise_url,
                }
            return {
                "error": "Нет серий",
                "poster": hq_poster,
                "post_id": post_id,
                "franchise_url": franchise_url,
            }
        except Exception as e:
            return {"error": str(e)}

    # ------------------------
    # Работа с закладками
    # ------------------------
    def get_category_items(self, cat_id: str) -> List[Dict[str, Any]]:
        """
        Возвращает список элементов из одной страницы закладок категории `cat_id`.
        Если необходимо собрать несколько страниц, используйте
        `get_category_items_paginated`.
        """
        if not self.auth():
            return []
        try:
            r = self.session.get(f"{self.origin}/favorites/{cat_id}/")
            soup = BeautifulSoup(r.text, "html.parser")
            items: List[Dict[str, Any]] = []
            for item in soup.find_all(class_="b-content__inline_item"):
                try:
                    link = item.find(class_="b-content__inline_item-link").find("a")
                    img = item.find(class_="b-content__inline_item-cover").find("img")
                    status = item.find(class_="info")
                    items.append(
                        {
                            "id": item.get("data-id"),
                            "title": link.get_text(strip=True),
                            "url": link.get("href"),
                            "poster": img.get("src") if img else "",
                            "status": status.get_text(strip=True) if status else "",
                        }
                    )
                except Exception:
                    continue
            return items
        except Exception:
            return []

    def add_favorite(self, post_id: str, cat_id: str) -> bool:
        """Добавляет фильм/сериал в закладки."""
        if not self.auth():
            return False
        try:
            r = self.session.post(
                f"{self.origin}/ajax/favorites/",
                data={"post_id": post_id, "cat_id": cat_id, "action": "add_post"},
            )
            return bool(r.json().get("success", False))
        except Exception:
            return False

    def remove_favorite(self, post_id: str, cat_id: str) -> bool:
        """Удаляет фильм/сериал из закладок категории."""
        if not self.auth():
            return False
        try:
            r = self.session.post(
                f"{self.origin}/ajax/favorites/",
                data={"post_id": post_id, "cat_id": cat_id, "action": "del_post"},
            )
            try:
                return bool(r.json().get("success", False))
            except Exception:
                return False
        except Exception:
            return False

    def get_category_items_paginated(self, cat_id: str, max_pages: int = 5) -> List[Dict[str, Any]]:
        """
        Собирает элементы из нескольких страниц закладок. Использует
        `/favorites/<cat_id>/page/<n>/` для обхода страниц.
        """
        all_items: List[Dict[str, Any]] = []
        seen_ids: set[str] = set()
        if not self.auth():
            return []
        for page in range(1, max_pages + 1):
            try:
                url_page = f"{self.origin}/favorites/{cat_id}/"
                if page > 1:
                    url_page = f"{url_page}page/{page}/"
                r = self.session.get(url_page)
                soup = BeautifulSoup(r.text, "html.parser")
                items_page: List[Dict[str, Any]] = []
                for item in soup.find_all(class_="b-content__inline_item"):
                    try:
                        item_id = item.get("data-id")
                        if not item_id or item_id in seen_ids:
                            continue
                        link = item.find(class_="b-content__inline_item-link").find("a")
                        img = item.find(class_="b-content__inline_item-cover").find("img")
                        status = item.find(class_="info")
                        items_page.append(
                            {
                                "id": item_id,
                                "title": link.get_text(strip=True) if link else "",
                                "url": link.get("href") if link else "",
                                "poster": img.get("src") if img else "",
                                "status": status.get_text(strip=True) if status else "",
                            }
                        )
                        seen_ids.add(item_id)
                    except Exception:
                        continue
                if not items_page:
                    break
                all_items.extend(items_page)
            except Exception:
                break
        return all_items

    # ------------------------
    # Работа с эпизодами
    # ------------------------
    def toggle_watch(self, global_id: str) -> bool:
        """
        Переключает статус просмотра для указанного эпизода.

        Добавлены заголовки и проверка JSON, чтобы убедиться, что
        сервер принял запрос.
        """
        if not self.auth():
            return False
        try:
            headers = {"X-Requested-With": "XMLHttpRequest"}
            r = self.session.post(
                f"{self.origin}/engine/ajax/schedule_watched.php",
                data={"id": global_id},
                headers=headers,
            )
            try:
                data = r.json()
                return bool(data.get("success", False) or data.get("status") == "ok")
            except Exception:
                return r.status_code == 200
        except Exception:
            return False

    # ------------------------
    # Работа с франшизами
    # ------------------------
    def get_franchise_items(self, franchise_url: str) -> List[Dict[str, Any]]:
        """
        Возвращает список фильмов/сериалов на странице франшизы.
        """
        items: List[Dict[str, Any]] = []
        if not franchise_url:
            return items
        try:
            r = self.session.get(franchise_url)
            soup = BeautifulSoup(r.text, "html.parser")
            for block in soup.find_all(class_="b-content__inline_item"):
                try:
                    link = block.find(class_="b-content__inline_item-link").find("a")
                    title = link.get_text(strip=True)
                    url = link.get("href")
                    item_id = block.get("data-id")
                    poster = ""
                    img = block.find(class_="b-content__inline_item-cover").find("img")
                    if img:
                        poster = img.get("src")
                    year = None
                    info = block.find(class_="info")
                    if info:
                        year_match = re.search(r"\d{4}", info.get_text())
                        if year_match:
                            year = year_match.group(0)
                    items.append(
                        {
                            "id": item_id,
                            "title": title,
                            "url": url,
                            "poster": poster,
                            "year": year,
                        }
                    )
                except Exception:
                    continue
        except Exception:
            pass
        return items

__all__ = ["RezkaClient"]