(function () {
    'use strict';

    // ВАШ API
    var MY_API_URL = 'http://filme.64.188.67.85.sslip.io:8080';

    function MyRezkaComponent(object) {
        var comp = {};

        comp.html = $('<div class="items items--vertical"></div>');

        comp.create = function () {
            var loader = $('<div class="empty__descr">Загрузка списка...</div>');
            comp.html.append(loader);

            $.ajax({
                url: MY_API_URL + '/api/watching',
                method: 'GET',
                dataType: 'json',
                success: function(items) {
                    loader.remove();
                    if (items && items.length) {
                        comp.renderItems(items);
                    } else {
                        comp.html.append('<div class="empty__descr">Список пуст</div>');
                    }
                    Lampa.Controller.toggle('content');
                },
                error: function(err) {
                    loader.text('Ошибка связи с сервером');
                    console.error('Rezka Error:', err);
                }
            });
            return comp.html;
        };

        comp.start = function () {
            Lampa.Controller.toggle('content');
        };
        comp.pause = function () {};
        comp.destroy = function () {
            comp.html.remove();
        };
        comp.render = function () {
            return comp.html;
        };

        comp.renderItems = function (items) {
            var wrapper = $('<div class="category-full"></div>');
            wrapper.append('<div class="category-full__head">Сейчас смотрю</div>');
            var body = $('<div class="category-full__body" style="display:flex;flex-wrap:wrap;gap:12px;padding-bottom:2em"></div>');

            items.forEach(function (item) {
                // --- 1. Агрессивная очистка названия (как в твоем примере) ---
                var rawTitle = item.title || '';
                // Убираем год из скобок
                var yearMatch = rawTitle.match(/\((\d{4})\)/);
                var year = yearMatch ? yearMatch[1] : '';
                // Берем только часть до слеша
                var titleSimple = rawTitle.split('/')[0].trim();
                var titleNoYear = titleSimple.replace(/\(\d{4}\)/, '').trim();
                // Агрессивно: только до двоеточия (для сериалов типа "911: ...")
                var titleAggressive = titleNoYear.split(':')[0].trim();

                // --- 2. Тип контента ---
                const isTv = /\/series\/|\/cartoons\//.test(item.url || '');
                const mediaType = isTv ? 'tv' : 'movie';

                // --- 3. Картинки (Прямая ссылка, как ты просил) ---
                // Добавляем rnd чтобы обновить кэш, если картинка залипла
                var posterUrl = MY_API_URL + '/api/img?url=' + encodeURIComponent(item.poster) + '&rnd=' + Math.random();

                // Создаем стандартную карточку Лампы
                var card = Lampa.Template.get('card', {
                    title: titleAggressive,
                    original_title: rawTitle,
                    release_year: year,
                    img: posterUrl
                });

                card.addClass('card--collection');
                card.css({ width: '16.6%', minWidth: '140px', cursor: 'pointer' });

                // --- 4. Логика клика (Fail-Safe) ---
                function handleClick() {
                    // Показываем лоадер
                    Lampa.Loading.start(function() { Lampa.Loading.stop(); });
                    
                    // Флаг, чтобы не открыть дважды
                    var isOpen = false;

                    // Функция аварийного открытия поиска
                    function openSearchFallback() {
                        if (isOpen) return;
                        isOpen = true;
                        Lampa.Loading.stop();
                        console.log('[Rezka] Fallback to search');
                        Lampa.Activity.push({
                            component: 'search',
                            search: titleAggressive
                        });
                    }

                    // Таймер на 3 секунды. Если API тупит — открываем поиск.
                    var timeoutTimer = setTimeout(function() {
                        console.warn('[Rezka] Timeout! Opening search...');
                        openSearchFallback();
                    }, 3000);

                    // Пытаемся найти ID
                    var query = titleAggressive;
                    var searchMethod = 'search/' + mediaType;
                    
                    var onSuccess = function(data) {
                        clearTimeout(timeoutTimer); // Отменяем таймер
                        if (isOpen) return; // Если таймер уже сработал, ничего не делаем

                        if (data.results && data.results.length > 0) {
                            // Ищем совпадение по году
                            var bestMatch = data.results.find(function(r) {
                                var rYear = (r.release_date || r.first_air_date || '0000').substring(0, 4);
                                return rYear == year;
                            });
                            
                            var result = bestMatch || data.results[0];
                            result.source = 'tmdb'; // Важная метка

                            isOpen = true;
                            Lampa.Loading.stop();

                            // Открываем полную карточку
                            Lampa.Activity.push({
                                component: 'full',
                                id: result.id,
                                method: mediaType,
                                source: 'tmdb',
                                card: result
                            });
                        } else {
                            // Ничего не нашли -> Поиск
                            openSearchFallback();
                        }
                    };

                    var onError = function(err) {
                        clearTimeout(timeoutTimer);
                        console.error('[Rezka] API Error:', err);
                        openSearchFallback();
                    };

                    // Вызов API (проверка всех методов)
                    if (typeof Lampa.TMDB !== 'undefined' && typeof Lampa.TMDB.get === 'function') {
                        Lampa.TMDB.get(searchMethod, { query: query, page: 1, language: 'ru-RU' }, onSuccess, onError);
                    } else if (typeof Lampa.TMDB !== 'undefined' && typeof Lampa.TMDB.api === 'function') {
                        Lampa.TMDB.api(searchMethod, { query: query, page: 1, language: 'ru-RU' }, onSuccess, onError);
                    } else if (typeof Lampa.Api !== 'undefined' && typeof Lampa.Api.tmdb === 'function') {
                        Lampa.Api.tmdb(searchMethod, { query: query, page: 1, language: 'ru-RU' }, onSuccess, onError);
                    } else {
                        // Нет API -> Поиск
                        clearTimeout(timeoutTimer);
                        openSearchFallback();
                    }
                }

                card.on('hover:enter', handleClick);
                card.on('click', handleClick);

                body.append(card);
            });

            wrapper.append(body);
            comp.html.append(wrapper);
        };

        return comp;
    }

    Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready') {
            if ($('[data-action="my_rezka_open"]').length === 0) {
                $('.menu .menu__list').eq(0).append(
                    '<li class="menu__item selector" data-action="my_rezka_open">' +
                    '<div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7L12 12L22 7L12 2Z"/><path d="M2 17L12 22L22 17"/><path d="M2 12L12 17L22 12"/></svg></div>' +
                    '<div class="menu__text">Rezka</div></li>'
                );
            }
            $('body').off('click.myrezka').on('click.myrezka', '[data-action="my_rezka_open"]', function () {
                Lampa.Activity.push({ component: 'my_rezka', page: 1 });
            });
            Lampa.Component.add('my_rezka', MyRezkaComponent);
        }
    });
})();