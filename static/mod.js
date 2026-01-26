(function () {
    'use strict';

    var MY_API_URL = 'https://filme.64.188.67.85.sslip.io';

    function MyRezkaComponent(object) {
        var comp = {};

        comp.html = $('<div class="items items--vertical"></div>');

        comp.create = function () {
            var loader = $('<div class="empty__descr">Загрузка...</div>');
            comp.html.append(loader);

            fetch(MY_API_URL + '/api/watching')
                .then(r => r.json())
                .then(items => {
                    loader.remove();
                    if (items && items.length) {
                        comp.renderItems(items);
                    } else {
                        comp.html.append('<div class="empty__descr">Список пуст</div>');
                    }
                    Lampa.Controller.toggle('content');
                })
                .catch(err => {
                    loader.text('Ошибка загрузки: ' + err.message);
                    console.error(err);
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
                const yearMatch = title.match(/\((\d{4})\)/);
                if (yearMatch) {
                    year = yearMatch[1];
                    title = title.replace(` (${year})`, '');
                }
                let cleanTitle = title.split(' / ')[0].split(':')[0].trim();

                const isTv = /\/series\/|\/cartoons\//.test(item.url || '');
                
                // Извлекаем ID из URL (например, /series/fantastic-and-where-to-find-them/42009-black-mirror.html -> 42009)
                let tmdbId = null;
                const urlMatch = (item.url || '').match(/\/(\d+)-[^/]+\.html/);
                if (urlMatch) {
                    tmdbId = urlMatch[1];
                }

                // ВСЕГДА используем прокси для постеров (обходим проблему CORS)
                let imgUrl = item.poster || '';
                if (imgUrl && imgUrl.startsWith('http')) {
                    imgUrl = MY_API_URL + '/api/img?url=' + encodeURIComponent(imgUrl);
                } else {
                    imgUrl = 'https://via.placeholder.com/300x450?text=No+image';
                }

                var card = Lampa.Template.get('card', {
                    title: item.title,
                    original_title: cleanTitle,
                    release_year: item.status || year,
                    img: imgUrl
                });

                card.addClass('card--collection');
                card.css({ width: '16.6%', minWidth: '140px' });

                // Открытие карточки фильма
                function openItem() {
                    if (tmdbId) {
                        // Переход на карточку фильма/сериала
                        Lampa.Activity.push({
                            url: '',
                            component: 'full',
                            id: tmdbId,
                            method: isTv ? 'tv' : 'movie',
                            card: {
                                id: tmdbId,
                                title: cleanTitle,
                                original_title: cleanTitle,
                                release_date: year,
                                first_air_date: year,
                                poster_path: item.poster,
                                overview: '',
                                vote_average: 0
                            },
                            source: 'tmdb'
                        });
                    } else {
                        // Fallback - поиск по названию
                        Lampa.Activity.push({
                            component: 'search',
                            query: cleanTitle + (year ? ' ' + year : ''),
                            year: year,
                            type: isTv ? 'tv' : 'movie'
                        });
                    }
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

    // Регистрация
    Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready') {
            if ($('[data-action="my_rezka_open"]').length === 0) {
                $('.menu .menu__list').eq(0).append(
                    '<li class="menu__item selector" data-action="my_rezka_open">' +
                    '<div class="menu__ico">R</div>' +
                    '<div class="menu__text">Rezka</div></li>'
                );
            }

            $('body').off('click.myrezka').on('click.myrezka', '[data-action="my_rezka_open"]', function () {
                Lampa.Activity.push({ component: 'my_rezka', type: 'component' });
            });

            Lampa.Component.add('my_rezka', MyRezkaComponent);
        }
    });
})();