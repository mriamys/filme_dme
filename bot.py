import asyncio
import json
import logging
import os
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from aiogram.types import WebAppInfo
from dotenv import load_dotenv

# Импортируем клиент, чтобы использовать его и в боте, и в main.py
from rezka_client import RezkaClient

load_dotenv()

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- КОНФИГУРАЦИЯ ---
BOT_TOKEN = os.getenv("BOT_TOKEN")
WEBAPP_URL = os.getenv("WEBAPP_URL", "http://127.0.0.1:8080")
CAT_WATCHING = os.getenv("REZKA_CAT_WATCHING")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")
STATE_FILE = "series_state.json"

# --- ИНИЦИАЛИЗАЦИЯ ---
if not BOT_TOKEN:
    logger.error("❌ Ошибка: Не задан BOT_TOKEN в .env")

# Создаем объекты здесь, чтобы main.py мог их импортировать
client = RezkaClient()
bot = Bot(token=BOT_TOKEN) if BOT_TOKEN else None
dp = Dispatcher()

# --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
def load_state():
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r", encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_state(state):
    try:
        with open(STATE_FILE, "w", encoding='utf-8') as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Ошибка сохранения состояния: {e}")

# --- ХЕНДЛЕРЫ БОТА ---
@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    global TELEGRAM_CHAT_ID
    # Запоминаем ID чата, если он не задан в .env
    if not TELEGRAM_CHAT_ID:
        TELEGRAM_CHAT_ID = str(message.chat.id)
        logger.info(f"✅ Chat ID установлен: {TELEGRAM_CHAT_ID}")

    markup = types.InlineKeyboardMarkup(inline_keyboard=[
        [types.InlineKeyboardButton(text="🎬 Открыть HDRezka", web_app=WebAppInfo(url=WEBAPP_URL))]
    ])
    await message.answer(
        "👋 Привет! Я буду присылать уведомления о новых сериях из раздела 'Смотрю'.\n"
        "Нажми кнопку ниже, чтобы открыть библиотеку.",
        reply_markup=markup
    )

# --- ФОНОВАЯ ЗАДАЧА ---
async def check_updates_task():
    """Периодически проверяет выход новых серий."""
    if not bot:
        return

    logger.info("⏳ Фоновая проверка обновлений запущена...")
    await asyncio.sleep(5)  # Ждем старта сервера

    while True:
        try:
            if not TELEGRAM_CHAT_ID:
                await asyncio.sleep(30)
                continue

            if not CAT_WATCHING:
                logger.warning("⚠️ Не задан REZKA_CAT_WATCHING")
                await asyncio.sleep(60)
                continue

            logger.info("🔄 Проверка новых серий...")
            state = load_state()
            
            # Получаем список "Смотрю" (запускаем синхронный код в потоке)
            watchlist = await asyncio.to_thread(client.get_category_items, CAT_WATCHING)
            
            for item in watchlist:
                try:
                    url = item.get("url")
                    title = item.get("title")
                    item_id = item.get("id")
                    
                    if not url or not item_id: continue

                    # Загружаем детали (в потоке)
                    details = await asyncio.to_thread(client.get_series_details, url)
                    if not details or "seasons" not in details:
                        continue

                    seasons = details["seasons"]
                    max_season = -1
                    max_episode = -1
                    
                    # Ищем последнюю серию
                    for s_id, eps in seasons.items():
                        if not eps: continue
                        try:
                            s_num = int(s_id)
                        except: s_num = 0
                        
                        if eps:
                            last_ep = eps[-1]
                            try:
                                e_num = int(last_ep["episode"])
                            except: e_num = 0
                            
                            if s_num > max_season:
                                max_season = s_num
                                max_episode = e_num
                            elif s_num == max_season and e_num > max_episode:
                                max_episode = e_num

                    if max_season == -1: continue

                    current_tag = f"S{max_season}E{max_episode}"
                    prev_tag = state.get(str(item_id))
                    
                    if not prev_tag:
                        state[str(item_id)] = current_tag
                    elif prev_tag != current_tag:
                        msg = (
                            f"🔥 <b>Вышла новая серия!</b>\n\n"
                            f"🎬 <b>{title}</b>\n"
                            f"Сезон {max_season}, Серия {max_episode}\n\n"
                            f"<a href='{url}'>Смотреть на сайте</a>"
                        )
                        try:
                            await bot.send_message(TELEGRAM_CHAT_ID, msg, parse_mode="HTML")
                            logger.info(f"🔔 Уведомление: {title} {current_tag}")
                            state[str(item_id)] = current_tag
                        except Exception as e:
                            logger.error(f"Ошибка отправки: {e}")

                except Exception as e:
                    logger.error(f"Ошибка проверки {item.get('title')}: {e}")
                    continue
                
                await asyncio.sleep(2) # Пауза между запросами

            save_state(state)
            logger.info("✅ Проверка завершена.")

        except Exception as e:
            logger.error(f"Глобальная ошибка проверки: {e}")

        # Проверка раз в 20 минут
        await asyncio.sleep(1200)