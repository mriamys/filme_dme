(function () {
    'use strict';

    // Твой API (убедись, что адрес и порт верные)
    var MY_API_URL = 'http://filme.64.188.67.85.sslip.io:8080'; 

    function MyRezkaComponent(object) {
        var comp = {};

        comp.html = $('<div class="items items--vertical"></div>');

        comp.create = function () {
            var loader = $('<div class="empty__descr">Загрузка списка...</div>');
            comp.html.append(loader);

            // Грузим список из твоего API
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
                    // Обновляем интерфейс Лампы
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
                // 1. Чистим название и год
                let title = item.title || '';
                let year = '';
                const yearMatch = title.match(/\((\d{4})\)/);
                if (yearMatch) {
                    year = yearMatch[1];
                    title = title.replace(` (${year})`, '');
                }
                // Убираем лишнее (например "Во все тяжкие / Breaking Bad")
                let cleanTitle = title.split(' / ')[0].split(':')[0].trim();
                let originalTitle = title.split(' / ')[1] ? title.split(' / ')[1].trim() : cleanTitle;

                // 2. Определяем: Фильм или Сериал?
                const isTv = /\/series\/|\/cartoons\//.test(item.url || '');
                const mediaType = isTv ? 'tv' : 'movie';

                // 3. ЛЕЧИМ КАРТИНКИ (HTTP -> HTTPS через прокси)
                let posterUrl = 'https://via.placeholder.com/300x450?text=' + encodeURIComponent(cleanTitle);
                if (item.poster && item.poster.startsWith('http')) {
                    // Формируем ссылку на твой прокси
                    let myProxyUrl = MY_API_URL + '/api/img?url=' + encodeURIComponent(item.poster);
                    // Оборачиваем в weserv.nl, чтобы работало в HTTPS версии Лампы
                    posterUrl = 'https://images.weserv.nl/?url=' + encodeURIComponent(myProxyUrl);
                }

                // Создаем карточку Лампы
                var card = Lampa.Template.get('card', {
                    title: cleanTitle,
                    original_title: originalTitle,
                    release_year: year,
                    img: posterUrl
                });

                card.addClass('card--collection');
                card.css({ width: '16.6%', minWidth: '140px', cursor: 'pointer' });

                // --- САМОЕ ГЛАВНОЕ: ИЩЕМ ID И ОТКРЫВАЕМ ---
                function findAndOpen() {
                    Lampa.Loading.start(function() { Lampa.Loading.stop(); });

                    // Адрес поиска в API Лампы (TMDB)
                    var searchUrl = 'search/' + mediaType; // search/tv или search/movie
                    
                    // Делаем запрос в TMDB через Лампу
                    Lampa.TMDB.get(searchUrl, {
                        query: cleanTitle, // Ищем по русскому названию
                        language: 'ru-RU',
                        page: 1
                    }, function(data) {
                        Lampa.Loading.stop();

                        if (data.results && data.results.length > 0) {
                            // 1. Пробуем найти идеальное совпадение по году
                            var bestMatch = data.results.find(function(r) {
                                var rYear = (r.release_date || r.first_air_date || '0000').substring(0, 4);
                                return rYear == year; 
                            });

                            // 2. Если по году не нашли, берем ПРОСТО ПЕРВЫЙ результат (чаще всего это он)
                            var result = bestMatch || data.results[0];

                            // ОТКРЫВАЕМ КАРТОЧКУ
                            Lampa.Activity.push({
                                component: 'full', // Открывает полную страницу фильма
                                id: result.id,     // ID из TMDB
                                method: mediaType, // tv или movie
                                card: result,      // Передаем объект, чтобы сразу заполнить инфу
                                source: 'tmdb'
                            });
                        } else {
                            // Если TMDB ничего не нашел — открываем обычный поиск
                            Lampa.Noty.show('Не нашел в TMDB, открываю поиск');
                            Lampa.Activity.push({
                                component: 'search',
                                search: cleanTitle
                            });
                        }
                    }, function(error) {
                        Lampa.Loading.stop();
                        Lampa.Noty.show('Ошибка поиска TMDB');
                        // Если ошибка API — открываем обычный поиск
                        Lampa.Activity.push({
                            component: 'search',
                            search: cleanTitle
                        });
                    });
                }

                card.on('hover:enter', findAndOpen);
                card.on('click', findAndOpen);

                body.append(card);
            });

            wrapper.append(body);
            comp.html.append(wrapper);
        };

        return comp;
    }

    // Регистрируем плагин
    Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready') {
            // Добавляем кнопку в меню, если нет
            if ($('[data-action="my_rezka_open"]').length === 0) {
                $('.menu .menu__list').eq(0).append(
                    '<li class="menu__item selector" data-action="my_rezka_open">' +
                    '<div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7L12 12L22 7L12 2Z"/><path d="M2 17L12 22L22 17"/><path d="M2 12L12 17L22 12"/></svg></div>' +
                    '<div class="menu__text">Rezka</div></li>'
                );
            }
            // Обработка клика по меню
            $('body').off('click.myrezka').on('click.myrezka', '[data-action="my_rezka_open"]', function () {
                Lampa.Activity.push({ component: 'my_rezka', page: 1 });
            });
            // Добавляем компонент в ядро
            Lampa.Component.add('my_rezka', MyRezkaComponent);
        }
    });
})();