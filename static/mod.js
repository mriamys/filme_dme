(function () {
    'use strict';

    var MY_API_URL = 'http://64.188.67.85:8080';

    function MyRezkaDebug(object) {
        var comp = {};

        comp.create = function () {
            this.html = $('<div class="items items--vertical"></div>');
            this.html.append('<div class="empty__descr" style="font-size: 1.5em;">🔍 РЕЖИМ ОТЛАДКИ<br><span style="font-size:0.6em">Открой консоль (F12)</span></div>');

            var _this = this;

            console.log('[REZKA_DEBUG] 🚀 Плагин запущен. Запрашиваю список...');

            fetch(MY_API_URL + '/api/watching')
                .then(r => r.json())
                .then(json => {
                    console.log('[REZKA_DEBUG] ✅ Список получен. Элементов:', json.length);
                    _this.render_debug_list(json);
                })
                .catch(e => {
                    console.error('[REZKA_DEBUG] ❌ Ошибка сети:', e);
                    this.html.append('<div class="empty__descr" style="color:red">' + e.message + '</div>');
                });

            return this.render();
        };

        comp.render_debug_list = function(items) {
            var _this = this;
            
            // Контейнер для списка
            var list = $('<div class="items-line__body" style="display:flex; flex-wrap:wrap; gap:20px; padding:20px;"></div>');

            items.forEach(function(item) {
                // --- ЛОГИКА ОЧИСТКИ НАЗВАНИЯ ---
                var rawTitle = item.title;
                
                // Вариант 1: Только до слеша (Интерстеллар / Interstellar -> Интерстеллар)
                var titleSimple = rawTitle.split('/')[0].trim();
                
                // Вариант 2: Убираем год и скобки (Интерстеллар (2014) -> Интерстеллар)
                var titleNoYear = titleSimple.replace(/\(\d{4}\)/, '').trim();
                
                // Вариант 3: Самый агрессивный (только первое слово или до двоеточия)
                // Пример: "911: Нашвилл" -> "911"
                var titleAggressive = titleNoYear.split(':')[0].trim();

                // --- ЛОГИКА КАРТИНОК ---
                // Добавляем случайное число (random), чтобы сбить кэш браузера
                var proxyImg = MY_API_URL + '/api/img?url=' + encodeURIComponent(item.poster) + '&rnd=' + Math.random();

                console.log(`[REZKA_DEBUG] Фильм: ${titleAggressive}`);
                console.log(`   - Оригинал: "${rawTitle}"`);
                console.log(`   - Поиск (Simple): "${titleSimple}"`);
                console.log(`   - Поиск (Aggressive): "${titleAggressive}"`);
                console.log(`   - Картинка: ${proxyImg}`);

                // Создаем карточку вручную, чтобы точно контролировать клик
                var card = $(`
                    <div class="card" style="width: 200px; background: #333; border-radius: 10px; overflow: hidden; cursor: pointer;">
                        <div style="height: 300px; background: #000; position: relative;">
                            <img src="${proxyImg}" style="width:100%; height:100%; object-fit:cover;" 
                                 onload="console.log('[REZKA_DEBUG] Картинка загрузилась: ${titleAggressive}')"
                                 onerror="console.log('[REZKA_DEBUG] ❌ ОШИБКА КАРТИНКИ: ${titleAggressive}', this.src)">
                        </div>
                        <div style="padding: 10px;">
                            <div style="font-weight:bold; margin-bottom:5px;">${titleAggressive}</div>
                            <div style="font-size: 0.8em; color: #aaa;">${rawTitle}</div>
                            <div style="margin-top:10px; border-top:1px solid #555; padding-top:5px; font-size: 0.8em; color: #4f9;">
                                Нажми для поиска "${titleAggressive}"
                            </div>
                        </div>
                    </div>
                `);

                // При клике ищем "Агрессивный" вариант, так как он самый надежный для TMDB
                card.on('click', function() {
                    console.log('[REZKA_DEBUG] 🔍 Ищем:', titleAggressive);
                    Lampa.Activity.push({
                        component: 'search',
                        query: titleAggressive
                    });
                });

                list.append(card);
            });

            this.html.append(list);
        };

        comp.start = function() {};
        comp.destroy = function() {};
        comp.pause = function() {};
        comp.render = function() { return this.html; };

        return comp;
    }

    Lampa.Listener.follow('app', function (e) {
        if (e.type == 'ready') {
            $('.menu .menu__list').eq(0).append(
                '<li class="menu__item selector" data-action="rezka_debug">' +
                '<div class="menu__ico">R</div>' +
                '<div class="menu__text">Rezka Debug</div>' +
                '</li>'
            );
            $('body').on('click', '[data-action="rezka_debug"]', function () {
                Lampa.Activity.push({ component: 'rezka_debug', type: 'component' });
            });
            Lampa.Component.add('rezka_debug', MyRezkaDebug);
        }
    });
})();