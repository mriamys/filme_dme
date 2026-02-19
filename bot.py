import asyncio
import json
import logging
import os
import time
import math
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import WebAppInfo, InlineKeyboardMarkup, InlineKeyboardButton, ReplyKeyboardMarkup, KeyboardButton
from dotenv import load_dotenv

from rezka_client import RezkaClient

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- КОНФИГУРАЦИЯ ---
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN") 
WEBAPP_URL = os.getenv("WEBAPP_URL", "http://127.0.0.1:8080")
CAT_WATCHING = os.getenv("REZKA_CAT_WATCHING")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")
STATE_FILE = "series_state.json"
SEEN_COLLECTIONS_FILE = "seen_collections.json"

# --- URL КОЛЛЕКЦИЙ ДЛЯ ОТСЛЕЖИВАНИЯ ---
MONITORED_COLLECTIONS = [
    "https://hdrezka.me/collections/300-serialy-o-peremeschenii-vo-vremeni/?filter=last",
    "https://hdrezka.me/collections/33-filmy-o-peremeschenii-vo-vremeni/?filter=last"
]

if not BOT_TOKEN:
    logger.error("❌ Ошибка: Не задан TELEGRAM_BOT_TOKEN в .env")

client = RezkaClient()
bot = Bot(token=BOT_TOKEN) if BOT_TOKEN else None
dp = Dispatcher()

# --- СОСТОЯНИЕ (База данных в файле) ---
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

# --- ФУНКЦИИ ДЛЯ КОЛЛЕКЦИЙ ---
def load_seen_collections():
    if os.path.exists(SEEN_COLLECTIONS_FILE):
        try:
            with open(SEEN_COLLECTIONS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_seen_collections(data):
    try:
        with open(SEEN_COLLECTIONS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Ошибка сохранения seen_collections: {e}")

# --- START ---
@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    global TELEGRAM_CHAT_ID
    user_id = str(message.from_user.id)
    
    env_id = os.getenv("TELEGRAM_CHAT_ID")
    if env_id and user_id != str(env_id):
        return

    if not TELEGRAM_CHAT_ID:
        TELEGRAM_CHAT_ID = user_id
        logger.info(f"✅ Chat ID установлен: {TELEGRAM_CHAT_ID}")
    
    url_no_cache = f"{WEBAPP_URL}?v={int(time.time())}"
    
    # ИНЛАЙН КНОПКА (Открыть приложение)
    inline_kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🎬 Открыть приложение", web_app=WebAppInfo(url=url_no_cache))]
    ])

    # ОБЫЧНАЯ КЛАВИАТУРА (Меню снизу)
    reply_kb = ReplyKeyboardMarkup(keyboard=[
        [KeyboardButton(text="📑 Мои сериалы")]
    ], resize_keyboard=True)
    
    await message.answer(
        "👋 Привет! Я буду присылать уведомления о новых сериях.\n"
        "Нажми кнопку внизу, чтобы открыть список сериалов и настроить озвучки.",
        reply_markup=reply_kb
    )
    # Отправляем инлайн кнопку отдельным сообщением или прикрепляем к тексту выше
    await message.answer("👇 Или открой приложение:", reply_markup=inline_kb)

# --- ОБРАБОТЧИК КНОПКИ "Мои сериалы" (REPLY) ---
@dp.message(F.text == "📑 Мои сериалы")
async def show_watchlist_reply(message: types.Message):
    # Просто вызываем функцию показа списка (страница 1)
    # Имитируем callback, но так как функция принимает callback, 
    # проще переиспользовать логику или вызвать её напрямую
    await show_watchlist_logic(message, 1)

# --- ЛОГИКА ПОКАЗА СПИСКА ---
async def show_watchlist_logic(message_or_callback, page):
    # Определяем, кто нас вызвал (сообщение или кнопка)
    is_callback = isinstance(message_or_callback, types.CallbackQuery)
    message = message_or_callback.message if is_callback else message_or_callback
    
    if is_callback:
        # await message_or_callback.answer("Загружаю...") # Можно включить
        pass
    else:
        await message.answer("⏳ Загружаю список...")

    try:
        # Получаем список "Смотрю"
        items = await asyncio.to_thread(client.get_category_items, CAT_WATCHING)
        
        if not items:
            text = "Список 'Смотрю' пуст."
            if is_callback:
                await message.edit_text(text)
            else:
                await message.answer(text)
            return

        # Пагинация (по 10 штук)
        items_per_page = 10
        total_pages = math.ceil(len(items) / items_per_page)
        
        if page > total_pages: page = total_pages
        if page < 1: page = 1
        
        start = (page - 1) * items_per_page
        end = start + items_per_page
        current_items = items[start:end]
        
        kb = []
        for item in current_items:
            kb.append([InlineKeyboardButton(text=f"🎬 {item['title']}", callback_data=f"sett_{item['id']}")])
            
        # Кнопки навигации
        nav_row = []
        if page > 1:
            nav_row.append(InlineKeyboardButton(text="⬅️ Назад", callback_data=f"my_list_{page-1}"))
        if page < total_pages:
            nav_row.append(InlineKeyboardButton(text="Вперед ➡️", callback_data=f"my_list_{page+1}"))
            
        if nav_row:
            kb.append(nav_row)
            
        # Кнопка закрытия
        kb.append([InlineKeyboardButton(text="❌ Закрыть", callback_data="close_settings")])
        
        text = f"📑 <b>Ваши сериалы ({len(items)}):</b>\nСтраница {page}/{total_pages}\n<i>Нажмите на название для настройки озвучек:</i>"
        
        if is_callback:
            await message.edit_text(text, reply_markup=InlineKeyboardMarkup(inline_keyboard=kb), parse_mode="HTML")
        else:
            await message.answer(text, reply_markup=InlineKeyboardMarkup(inline_keyboard=kb), parse_mode="HTML")
            
    except Exception as e:
        logger.error(f"Error watchlist: {e}")
        err_text = "Ошибка загрузки списка."
        if is_callback:
            await message.edit_text(err_text)
        else:
            await message.answer(err_text)

# --- ХЕНДЛЕР ДЛЯ КНОПОК ПАГИНАЦИИ ---
@dp.callback_query(F.data.startswith("my_list_"))
async def on_page_click(callback: types.CallbackQuery):
    try:
        page = int(callback.data.split("_")[2])
    except:
        page = 1
    await show_watchlist_logic(callback, page)
    await callback.answer()

# --- МЕНЮ НАСТРОЕК ОЗВУЧЕК (ОДИН СЕРИАЛ) ---
@dp.callback_query(F.data.startswith("sett_"))
async def open_settings(callback: types.CallbackQuery):
    post_id = callback.data.split("_")[1]
    state = load_state()
    
    # Если данных нет в стейте, попробуем найти в кэше/списке, но проще попросить обновить
    # Для надежности - загружаем URL из стейта, если его там нет - беда (но мы его пишем при проверке)
    # ЛАЙФХАК: Если URL нет, можно попробовать найти его в списке "Смотрю" прямо сейчас
    
    url = None
    title = "Сериал"
    
    if post_id in state:
        url = state[post_id].get("url")
        title = state[post_id].get("title", "Сериал")
    
    if not url:
        # Пытаемся найти в списке watching
        items = await asyncio.to_thread(client.get_category_items, CAT_WATCHING)
        for item in items:
            if str(item["id"]) == post_id:
                url = item["url"]
                title = item["title"]
                break
    
    if not url:
        await callback.answer("URL не найден. Подождите фонового обновления.", show_alert=True)
        return

    await callback.answer("Загружаю озвучки...")
    
    try:
        details = await asyncio.to_thread(client.get_series_details, url)
        translators = details.get("translators", [])
        
        if not translators:
            await callback.message.edit_text(
                f"🎬 <b>{title}</b>\n❌ Озвучки не найдены.", 
                reply_markup=InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="🔙 Назад", callback_data="my_list_1")]]), 
                parse_mode="HTML"
            )
            return

        kb = []
        user_prefs = state.get(post_id, {}).get("prefs", {})
        
        # --- АВТОМАТИЧЕСКОЕ ВКЛЮЧЕНИЕ ДЕФОЛТНОЙ (ЕСЛИ ПУСТО) ---
        # Если пользователь еще ничего не настраивал, мы считаем включенной ту,
        # которая идет первой (дефолтная на сайте).
        # Но чтобы отобразить это красиво, нам нужно знать, включена она реально или нет.
        # В `check_updates` мы это делаем автоматически. Здесь просто покажем.
        
        if not user_prefs and translators:
            # Если настроек нет, считаем первую включенной (визуально)
            # При первом клике это зафиксируется в базу
            first_t_id = str(translators[0]["id"])
            # Не сохраняем в базу пока, только визуализация
            # user_prefs = {first_t_id: True} # Раскомментировать, если хотим сразу показывать галочку
        
        for t in translators:
            t_id = str(t["id"])
            t_name = t["name"]
            
            is_active = user_prefs.get(t_id, False)
            
            # Если настроек нет вообще, и это первая озвучка - показываем как активную
            if not user_prefs and translators and str(translators[0]["id"]) == t_id:
                is_active = True
                
            icon = "✅" if is_active else "❌"
            
            kb.append([InlineKeyboardButton(text=f"{icon} {t_name}", callback_data=f"tog_{post_id}_{t_id}")])
            
        kb.append([InlineKeyboardButton(text="🔙 Назад к списку", callback_data="my_list_1")])
        
        await callback.message.edit_text(
            f"⚙️ <b>{title}</b>\nВыберите озвучки для уведомлений:",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=kb),
            parse_mode="HTML"
        )
        
    except Exception as e:
        logger.error(f"Error settings: {e}")
        await callback.message.edit_text("Ошибка при загрузке настроек.")

# --- ПЕРЕКЛЮЧЕНИЕ ОЗВУЧКИ ---
@dp.callback_query(F.data.startswith("tog_"))
async def toggle_voice(callback: types.CallbackQuery):
    _, post_id, t_id = callback.data.split("_")
    
    state = load_state()
    if post_id not in state: state[post_id] = {}
    if "prefs" not in state[post_id]: state[post_id]["prefs"] = {}

    # Получаем текущее значение
    current_val = state[post_id]["prefs"].get(t_id, False)
    
    # ХАК: Если prefs пустой, и мы жмем кнопку... 
    # Мы не знаем, была ли она "визуально" активна.
    # Ладно, будем считать, что если записи нет - значит False.
    # Но тогда при первом заходе юзер увидит "✅ По умолчанию", нажмет на нее, 
    # скрипт подумает что там False, сделает True -> опять "✅".
    # Это не страшно. Главное что запись появится.
    
    new_val = not current_val
    state[post_id]["prefs"][t_id] = new_val
    
    save_state(state)
    
    # Обновляем кнопку
    current_kb = callback.message.reply_markup.inline_keyboard
    new_kb = []
    for row in current_kb:
        new_row = []
        for btn in row:
            if btn.callback_data == callback.data:
                text = btn.text
                clean_text = text.replace("✅ ", "").replace("❌ ", "")
                new_text = f"{'✅' if new_val else '❌'} {clean_text}"
                new_row.append(InlineKeyboardButton(text=new_text, callback_data=btn.callback_data))
            else:
                new_row.append(btn)
        new_kb.append(new_row)
            
    await callback.message.edit_reply_markup(reply_markup=InlineKeyboardMarkup(inline_keyboard=new_kb))
    await callback.answer(f"{'Включено' if new_val else 'Выключено'}")

@dp.callback_query(F.data == "close_settings")
async def close_settings_handler(callback: types.CallbackQuery):
    await callback.message.delete()

# --- ФОНОВАЯ ЗАДАЧА (СЕРИАЛЫ) ---
async def check_updates_task():
    if not bot: return

    logger.info("⏳ Фоновая проверка обновлений сериалов запущена (интервал 15 мин)...")
    await asyncio.sleep(5)

    while True:
        try:
            if not TELEGRAM_CHAT_ID:
                await asyncio.sleep(30)
                continue

            logger.info("🔄 Начало проверки новых серий...")
            state = load_state()
            watchlist = await asyncio.to_thread(client.get_category_items, CAT_WATCHING)
            
            for item in watchlist:
                try:
                    url = item.get("url")
                    title = item.get("title")
                    item_id = str(item.get("id"))
                    
                    if not url or not item_id: continue

                    if item_id not in state:
                        state[item_id] = {}
                    
                    state[item_id]["url"] = url
                    state[item_id]["title"] = title
                    
                    prefs = state[item_id].get("prefs", {})
                    
                    # --- АВТО-ВКЛЮЧЕНИЕ ПЕРВОЙ ОЗВУЧКИ ---
                    translators_to_check = [] 
                    
                    if not prefs:
                        logger.info(f"⚙️ Auto-setup for {title}...")
                        details = await asyncio.to_thread(client.get_series_details, url)
                        translators = details.get("translators", [])
                        
                        if translators:
                            first_t_id = str(translators[0]["id"])
                            if "prefs" not in state[item_id]: state[item_id]["prefs"] = {}
                            state[item_id]["prefs"][first_t_id] = True
                            
                            # Сохраняем имена всех озвучек
                            if "translator_names" not in state[item_id]: state[item_id]["translator_names"] = {}
                            for t in translators:
                                state[item_id]["translator_names"][str(t["id"])] = t["name"]
                            
                            translators_to_check.append(first_t_id)
                            logger.info(f"✅ Auto-enabled translator {first_t_id} ({translators[0]['name']})")
                        else:
                            pass
                    else:
                        # Если имена озвучек ещё не закешированы — загружаем один раз
                        if "translator_names" not in state[item_id]:
                            logger.info(f"📝 Кешируем имена озвучек для {title}...")
                            details = await asyncio.to_thread(client.get_series_details, url)
                            translators = details.get("translators", [])
                            state[item_id]["translator_names"] = {
                                str(t["id"]): t["name"] for t in translators
                            }
                        
                        for t_id, enabled in prefs.items():
                            if enabled:
                                translators_to_check.append(t_id)
                    
                    # Проверяем серии
                    for t_id in translators_to_check:
                        await asyncio.sleep(1.0)
                        
                        seasons_data = await asyncio.to_thread(client.get_episodes_for_translator, item_id, t_id)
                        
                        max_s = -1
                        max_e = -1
                        
                        for s_num, eps in seasons_data.items():
                            if not eps: continue
                            try: s_int = int(s_num)
                            except: continue
                            
                            last_ep_obj = eps[-1]
                            try: e_int = int(last_ep_obj["episode"])
                            except: continue
                            
                            if s_int > max_s:
                                max_s = s_int
                                max_e = e_int
                            elif s_int == max_s and e_int > max_e:
                                max_e = e_int
                        
                        if max_s == -1: continue
                        
                        last_tag = f"S{max_s}E{max_e}"
                        
                        if "progress" not in state[item_id]: state[item_id]["progress"] = {}
                        if not isinstance(state[item_id]["progress"], dict): state[item_id]["progress"] = {}
                        
                        current_progress = state[item_id]["progress"].get(t_id)
                        
                        if current_progress and current_progress != last_tag:
                            # Получаем имя озвучки из кеша (или показываем ID как запасной вариант)
                            t_name = state[item_id].get("translator_names", {}).get(t_id, f"ID: {t_id}")
                            msg = (
                                f"🔥 <b>Новая серия!</b>\n"
                                f"🎬 <b>{title}</b>\n"
                                f"🎙 Озвучка: {t_name}\n"
                                f"Сезон {max_s}, Серия {max_e}\n"
                                f"<a href='{url}'>Смотреть</a>"
                            )
                            kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="⚙️ Озвучки", callback_data=f"sett_{item_id}")]])
                            try:
                                await bot.send_message(TELEGRAM_CHAT_ID, msg, parse_mode="HTML", reply_markup=kb)
                                logger.info(f"🔔 Notify: {title} {last_tag}")
                            except Exception as e:
                                logger.error(f"Send error: {e}")
                        
                        state[item_id]["progress"][t_id] = last_tag

                except Exception as ex:
                    logger.error(f"Error checking item: {ex}")
                    continue

            save_state(state)
            logger.info("✅ Проверка сериалов завершена.")
            await asyncio.sleep(900)

        except Exception as e:
            logger.error(f"Global Loop Error: {e}")
            await asyncio.sleep(60)

# --- ФОНОВАЯ ЗАДАЧА (КОЛЛЕКЦИИ) ---
async def check_collections_task():
    """
    Фоновая задача для проверки новых фильмов в коллекциях.
    """
    if not bot: return

    logger.info("🕵️ Запуск мониторинга коллекций...")
    await asyncio.sleep(10) # Даем фору старту

    # Первый запуск: просто запоминаем, что есть
    seen_data = load_seen_collections()
    first_run = False
    
    if not seen_data:
        first_run = True
        logger.info("Первый запуск мониторинга коллекций: сохраняем состояние без уведомлений.")

    while True:
        try:
            if not TELEGRAM_CHAT_ID:
                await asyncio.sleep(30)
                continue

            for url in MONITORED_COLLECTIONS:
                # Получаем список фильмов
                items = await asyncio.to_thread(client.get_collection_items, url)
                
                if not items:
                    continue

                if url not in seen_data:
                    seen_data[url] = []

                seen_ids = set(seen_data[url])
                new_items = []
                current_ids = []

                for item in items:
                    item_id = str(item['id'])
                    current_ids.append(item_id)
                    
                    if item_id not in seen_ids:
                        if not first_run:
                            new_items.append(item)
                
                # Обновляем базу увиденных
                for i_id in current_ids:
                    if i_id not in seen_ids:
                        seen_data[url].append(i_id)

                # Отправка уведомлений
                if new_items:
                    for item in reversed(new_items): 
                        # Формируем строки с проверкой на пустые значения
                        year_text = f" ({item['year']})" if item.get('year') else ""
                        info_text = f"ℹ️ {item['info']}\n" if item.get('info') else ""
                        status_text = f"📊 {item['status']}\n" if item.get('status') else ""
                        
                        caption = (
                            f"🆕 <b>Новинка в коллекции!</b>\n\n"
                            f"🎬 <b>{item['title']}</b>{year_text}\n"
                            f"{info_text}"
                            f"{status_text}"
                            f"\n<a href='{item['url']}'>Смотреть на HDRezka</a>"
                        )
                        try:
                            if item['poster']:
                                await bot.send_photo(
                                    chat_id=TELEGRAM_CHAT_ID,
                                    photo=item['poster'],
                                    caption=caption,
                                    parse_mode="HTML"
                                )
                            else:
                                await bot.send_message(
                                    chat_id=TELEGRAM_CHAT_ID,
                                    text=caption,
                                    parse_mode="HTML",
                                    disable_web_page_preview=False
                                )
                            await asyncio.sleep(1)
                        except Exception as e:
                            logger.error(f"Не удалось отправить уведомление о новинке: {e}")

            save_seen_collections(seen_data)
            await asyncio.sleep(1800) # Проверка раз в 30 минут

        except Exception as e:
            logger.error(f"Ошибка в цикле мониторинга коллекций: {e}")
            await asyncio.sleep(60)