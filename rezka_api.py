import os
from curl_cffi import requests as curl_requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

class RezkaClient:
    def __init__(self):
        # Маскируемся под Chrome 110
        self.session = curl_requests.Session(impersonate="chrome110")
        self.login = os.getenv("REZKA_LOGIN")
        self.password = os.getenv("REZKA_PASS")
        self.is_logged_in = False

    def auth(self):
        if self.is_logged_in: return True
        print("🔑 Авторизация...")
        url = "https://hdrezka.me/ajax/login/"
        data = {"login_name": self.login, "login_password": self.password}
        try:
            r = self.session.post(url, data=data)
            res = r.json()
            if res.get('success'):
                self.is_logged_in = True
                print(f"✅ Успешно! Привет, {res.get('name')}")
                return True
            else:
                print(f"❌ Ошибка входа: {res.get('message')}")
        except Exception as e:
            print(f"Ошибка соединения: {e}")
        return False

    def get_category_items(self, cat_id):
        if not self.auth(): return []
        
        print(f"📂 Запрашиваю категорию {cat_id}...")
        url = f"https://hdrezka.me/favorites/{cat_id}/"
        try:
            r = self.session.get(url)
            soup = BeautifulSoup(r.text, 'html.parser')
            items = []
            
            # Парсинг списка
            for item in soup.find_all(class_="b-content__inline_item"):
                try:
                    link_node = item.find(class_="b-content__inline_item-link").find("a")
                    cover_node = item.find(class_="b-content__inline_item-cover").find("img")
                    info_node = item.find(class_="b-content__inline_item-link").find("div")
                    status_node = item.find(class_="info")

                    data = {
                        "id": item.get("data-id"),
                        "title": link_node.text.strip(),
                        "url": link_node.get("href"),
                        "poster": cover_node.get("src") if cover_node else "",
                        "info": info_node.text.strip() if info_node else "",
                        "status": status_node.text.strip() if status_node else ""
                    }
                    items.append(data)
                except:
                    continue
            return items
        except Exception as e:
            print(f"Ошибка парсинга: {e}")
            return []

client = RezkaClient()