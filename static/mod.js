(function () {
    'use strict';

    var MY_API_URL = 'https://filme.64.188.67.85.sslip.io';

    function MyRezkaComponent(object) {
        var comp = {};

        comp.html = $('<div class="items items--vertical"></div>');

        comp.create = function () {
            var loader = $('<div class="empty__descr">Загрузка...</div>');
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
                    loader.text('Ошибка загрузки: ' + (err.statusText || 'Неизвестная ошибка'));
                    console.error('[Rezka Plugin] Error loading:', err);
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
                let title = item.title || '';
                let year = '';
                
                // Извлекаем год из title
                const yearMatch = title.match(/\((\d{4})\)/);
                if (yearMatch) {
                    year = yearMatch[1];
                    title = title.replace(` (${year})`, '');
                }
                
                // Очищаем название
                let cleanTitle = title.split(' / ')[0].split(':')[0].trim();

                // Определяем тип контента (приблизительно)
                const isTv = /\/series\/|\/cartoons\//.test(item.url || '');
                const mediaType = isTv ? 'tv' : 'movie';
                
                // Формируем URL картинки
                let imgUrl = '';
                if (item.poster && item.poster.startsWith('http')) {
                    // Используем ваш прокси
                    imgUrl = MY_API_URL + '/api/img?url=' + encodeURIComponent(item.poster);
                } else {
                    imgUrl = 'https://via.placeholder.com/300x450/333/fff?text=' + encodeURIComponent(cleanTitle);
                }

                // Создаем карточку
                var card = Lampa.Template.get('card', {
                    title: title,
                    original_title: cleanTitle,
                    release_year: item.status || year || '',
                    img: imgUrl
                });

                card.addClass('card--collection');
                card.css({ 
                    width: '16.6%', 
                    minWidth: '140px',
                    cursor: 'pointer'
                });

                // --- НОВАЯ ЛОГИКА ОТКРЫТИЯ ---
                function openItem() {
                    console.log('[Rezka Plugin] Searching TMDB for:', cleanTitle, year);
                    
                    Lampa.Loading.start(function() {
                        Lampa.Loading.stop();
                    });

                    // Используем API Лампы для поиска TMDB ID
                    Lampa.Api.search({
                        query: cleanTitle
                    }, function(data) {
                        Lampa.Loading.stop();
                        
                        var found = null;

                        if (data.results && data.results.length) {
                            // 1. Пытаемся найти точное совпадение по году и типу
                            found = data.results.find(function(r) {
                                var r_year = (r.release_date || r.first_air_date || '0000').substring(0, 4);
                                // Проверяем год (+- 1 год для надежности)
                                var yearMatch = r_year == year || parseInt(r_year) == parseInt(year)-1 || parseInt(r_year) == parseInt(year)+1;
                                // Проверяем тип (movie/tv)
                                var typeMatch = r.media_type ? (r.media_type == mediaType) : true;
                                
                                return yearMatch && typeMatch;
                            });

                            // 2. Если строго не нашли, берем первый результат, если он есть
                            if (!found && data.results.length > 0) {
                                found = data.results[0];
                            }
                        }

                        if (found) {
                            // Открываем полную карточку фильма/сериала
                            Lampa.Activity.push({
                                component: 'full',
                                id: found.id,
                                method: found.media_type || mediaType,
                                card: found,
                                source: 'tmdb'
                            });
                        } else {
                            // Если ничего не нашли в TMDB, открываем обычный поиск (Fallback)
                            Lampa.Activity.push({
                                component: 'search',
                                search: cleanTitle,
                                search_one: cleanTitle,
                                search_two: year,
                                clarification: true
                            });
                        }

                    }, function() {
                        // Ошибка поиска - открываем обычный поиск
                        Lampa.Loading.stop();
                        Lampa.Activity.push({
                            component: 'search',
                            search: cleanTitle,
                            search_one: cleanTitle,
                            search_two: year,
                            clarification: true
                        });
                    });
                }

                card.on('hover:enter', openItem);
                card.on('click', openItem);

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
                    '<div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' +
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