import asyncio
import json
import logging
import os
import time
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import WebAppInfo, InlineKeyboardMarkup, InlineKeyboardButton
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

if not BOT_TOKEN:
    logger.error("❌ Ошибка: Не задан TELEGRAM_BOT_TOKEN в .env")

# Инициализируем клиент (методы из предыдущего файла должны быть доступны)
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

# --- COMMAND START ---
@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    global TELEGRAM_CHAT_ID
    user_id = str(message.from_user.id)
    
    # Если в .env задан ID, пускаем только его
    env_id = os.getenv("TELEGRAM_CHAT_ID")
    if env_id and user_id != str(env_id):
        return

    if not TELEGRAM_CHAT_ID:
        TELEGRAM_CHAT_ID = user_id
        logger.info(f"✅ Chat ID установлен: {TELEGRAM_CHAT_ID}")
    
    url_no_cache = f"{WEBAPP_URL}?v={int(time.time())}"
    markup = types.InlineKeyboardMarkup(inline_keyboard=[
        [types.InlineKeyboardButton(text="🎬 Открыть HDRezka", web_app=WebAppInfo(url=url_no_cache))]
    ])
    await message.answer(
        "👋 Привет! Я буду присылать уведомления о новых сериях.\n"
        "Нажми кнопку ниже, чтобы открыть приложение.",
        reply_markup=markup
    )

# --- МЕНЮ НАСТРОЕК ОЗВУЧЕК ---
@dp.callback_query(F.data.startswith("sett_"))
async def open_settings(callback: types.CallbackQuery):
    post_id = callback.data.split("_")[1]
    
    state = load_state()
    series_data = state.get(post_id, {})
    url = series_data.get("url")
    title = series_data.get("title", "Сериал")
    
    if not url:
        await callback.answer("Ошибка: данные о сериале не найдены", show_alert=True)
        return

    await callback.answer("Загружаю список озвучек...")
    
    try:
        # Получаем актуальный список озвучек с сайта
        details = await asyncio.to_thread(client.get_series_details, url)
        translators = details.get("translators", [])
        
        if not translators:
            await callback.message.answer(f"Для сериала '{title}' озвучки не найдены или он не многоголосый.")
            return

        kb = []
        user_prefs = series_data.get("prefs", {}) # Сохраненные настройки {id: true/false}
        
        # Если настроек вообще нет, по умолчанию ничего не включено (или можно включить первую)
        # Логика: показываем текущее состояние
        
        for t in translators:
            t_id = str(t["id"])
            t_name = t["name"]
            
            is_active = user_prefs.get(t_id, False)
            icon = "✅" if is_active else "❌"
            
            # Кнопка переключения: tog_POSTID_TRANSLATORID
            kb.append([
                InlineKeyboardButton(
                    text=f"{icon} {t_name}", 
                    callback_data=f"tog_{post_id}_{t_id}"
                )
            ])
            
        kb.append([InlineKeyboardButton(text="Закрыть", callback_data="close_settings")])
        
        await callback.message.answer(
            f"⚙️ <b>Настройка уведомлений</b>\n🎬 {title}\n\nВыберите озвучки, за которыми следить:",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=kb),
            parse_mode="HTML"
        )
        
    except Exception as e:
        logger.error(f"Error settings: {e}")
        await callback.message.answer("Ошибка при загрузке настроек.")

# --- ПЕРЕКЛЮЧЕНИЕ ОЗВУЧКИ ---
@dp.callback_query(F.data.startswith("tog_"))
async def toggle_voice(callback: types.CallbackQuery):
    _, post_id, t_id = callback.data.split("_")
    
    state = load_state()
    if post_id not in state:
        state[post_id] = {}
        
    if "prefs" not in state[post_id]:
        state[post_id]["prefs"] = {}

    # Инвертируем значение
    current_val = state[post_id]["prefs"].get(t_id, False)
    new_val = not current_val
    state[post_id]["prefs"][t_id] = new_val
    
    save_state(state)
    
    # Обновляем кнопки "на лету" без переотправки сообщения
    current_kb = callback.message.reply_markup.inline_keyboard
    new_kb = []
    
    for row in current_kb:
        new_row = []
        for btn in row:
            if btn.callback_data == callback.data:
                text = btn.text
                # Меняем иконку (первый символ)
                if new_val:
                    new_text = "✅" + text[1:]
                else:
                    new_text = "❌" + text[1:]
                new_row.append(InlineKeyboardButton(text=new_text, callback_data=btn.callback_data))
            else:
                new_row.append(btn)
        new_kb.append(new_row)
            
    await callback.message.edit_reply_markup(reply_markup=InlineKeyboardMarkup(inline_keyboard=new_kb))
    await callback.answer(f"{'Включено' if new_val else 'Выключено'}")

@dp.callback_query(F.data == "close_settings")
async def close_settings_handler(callback: types.CallbackQuery):
    await callback.message.delete()

# --- ФОНОВАЯ ЗАДАЧА ПРОВЕРКИ ---
async def check_updates_task():
    if not bot: return

    logger.info("⏳ Фоновая проверка обновлений запущена (интервал 15 мин)...")
    
    # Ждем старта
    await asyncio.sleep(5)

    while True:
        try:
            if not TELEGRAM_CHAT_ID:
                await asyncio.sleep(30)
                continue

            logger.info("🔄 Начало проверки новых серий...")
            state = load_state()
            
            # Получаем список "Смотрю"
            watchlist = await asyncio.to_thread(client.get_category_items, CAT_WATCHING)
            
            for item in watchlist:
                try:
                    url = item.get("url")
                    title = item.get("title")
                    item_id = str(item.get("id"))
                    
                    if not url or not item_id: continue

                    # Если этого сериала нет в базе, добавляем
                    if item_id not in state:
                        state[item_id] = {
                            "title": title,
                            "url": url,
                            "progress": {}, # { "translator_id": "S1E5" }
                            "prefs": {}     # { "translator_id": True }
                        }
                    
                    # Обновляем на всякий случай
                    state[item_id]["url"] = url
                    state[item_id]["title"] = title
                    
                    # Получаем настройки пользователя
                    prefs = state[item_id].get("prefs", {})
                    
                    # Если пользователь НЕ выбрал ни одной озвучки, пропускаем
                    # (Или можно сделать логику "если пусто - следить за дефолтной", 
                    #  но лучше заставить пользователя выбрать через меню)
                    if not prefs:
                        # Логика первого запуска: если совсем пусто, можно попробовать
                        # загрузить дефолтную страницу и запомнить последнюю серию, 
                        # но уведомлять не будем, пока юзер не настроит.
                        # Или уведомим один раз с предложением настроить.
                        pass
                    
                    # Итерируемся по включенным озвучкам
                    for t_id, is_enabled in prefs.items():
                        if not is_enabled: continue
                        
                        # Загружаем серии для этой озвучки
                        # Важно: это отдельный запрос для каждого перевода
                        await asyncio.sleep(1.0) # Не частим с запросами
                        
                        seasons_data = await asyncio.to_thread(client.get_episodes_for_translator, item_id, t_id)
                        
                        # Ищем самую последнюю серию (максимальный сезон и эпизод)
                        max_s = -1
                        max_e = -1
                        
                        for s_num, eps in seasons_data.items():
                            if not eps: continue
                            try: s_int = int(s_num)
                            except: continue
                            
                            # Последний эпизод в списке сезона
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
                        
                        # Проверяем сохраненный прогресс
                        current_progress = state[item_id]["progress"].get(t_id)
                        
                        if current_progress != last_tag:
                            # Новая серия!
                            if current_progress: # Если это не первый проход
                                # Нужно получить имя озвучки (мы его не храним в prefs, придется без него или кешировать)
                                # Для простоты пока без имени, или можно его тоже сохранить в state при настройке
                                voice_msg = f"Озвучка ID: {t_id}" # Можно улучшить
                                
                                msg = (
                                    f"🔥 <b>Новая серия!</b>\n"
                                    f"🎬 <b>{title}</b>\n"
                                    f"Сезон {max_s}, Серия {max_e}\n"
                                    f"<a href='{url}'>Смотреть</a>"
                                )
                                
                                kb = InlineKeyboardMarkup(inline_keyboard=[
                                    [InlineKeyboardButton(text="⚙️ Настроить озвучки", callback_data=f"sett_{item_id}")]
                                ])
                                
                                try:
                                    await bot.send_message(TELEGRAM_CHAT_ID, msg, parse_mode="HTML", reply_markup=kb)
                                    logger.info(f"🔔 Notify: {title} {last_tag}")
                                except Exception as e:
                                    logger.error(f"Send error: {e}")
                            
                            # Сохраняем новый прогресс
                            state[item_id]["progress"][t_id] = last_tag

                except Exception as ex:
                    logger.error(f"Error checking item {item.get('title')}: {ex}")
                    continue

            # Сохраняем базу после прохода всего списка
            save_state(state)
            logger.info("✅ Проверка завершена.")
            
            # Ждем 15 минут до следующей проверки
            await asyncio.sleep(900)

        except Exception as e:
            logger.error(f"Global Loop Error: {e}")
            await asyncio.sleep(60)