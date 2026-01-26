/*
 * Полностью исправленная версия для Lampa
 * - Использует HTTPS адрес
 * - Постеры: сначала прямые (statichdrezka.ac), если не грузятся — через прокси
 * - Улучшенный поиск по названию + год + тип (movie/tv)
 * - Более точная очистка названия
 */

(function () {
    'use strict';

    // ←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←
    var MY_API_URL = 'https://filme.64.188.67.85.sslip.io';
    // ←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←

    function MyRezkaComponent() {
        var comp = {};

        comp.create = function () {
            this.html = $('<div class="items items--vertical"></div>');
            var loader = $('<div class="empty__descr">Загрузка...</div>');
            this.html.append(loader);

            fetch(MY_API_URL + '/api/watching')
                .then(r => r.json())
                .then(data => {
                    loader.remove();
                    if (data && data.length) {
                        this.renderItems(data);
                    } else {
                        this.html.append('<div class="empty__descr">Список пуст</div>');
                    }
                })
                .catch(err => {
                    loader.text('Ошибка: ' + err.message);
                    console.error(err);
                });

            return this.render();
        };

        comp.render = function () { return this.html; };
        comp.destroy = function () { this.html.remove(); };

        comp.renderItems = function (items) {
            var wrapper = $('<div class="category-full"></div>');
            wrapper.append('<div class="category-full__head">Сейчас смотрю</div>');
            var container = $('<div class="category-full__body" style="display:flex;flex-wrap:wrap;gap:12px;padding-bottom:2em"></div>');

            items.forEach(item => {
                let title = item.title || '';
                let year = '';
                let cleanTitle = title;

                // Извлекаем год
                const yearMatch = title.match(/\((\d{4})\)/);
                if (yearMatch) {
                    year = yearMatch[1];
                    cleanTitle = title.replace(` (${year})`, '');
                }

                // Убираем альтернативные названия
                cleanTitle = cleanTitle.split(' / ')[0].split(':')[0].trim();

                // Тип контента
                const isSeries = /\/series\/|\/cartoons\//.test(item.url || '');

                // Постер: сначала прямой, если не сработает — через прокси
                let posterUrl = item.poster && item.poster.startsWith('http') 
                    ? item.poster 
                    : 'https://via.placeholder.com/300x450?text=Нет+постера';

                const card = Lampa.Template.get('card', {
                    title: item.title,
                    original_title: cleanTitle,
                    release_year: item.status || year,
                    img: posterUrl
                });

                card.addClass('card--collection');
                card.css({ width: '16.6%', minWidth: '140px' });

                // Если прямой постер не загрузится — пробуем через прокси
                card.find('img').on('error', function () {
                    const proxyUrl = MY_API_URL + '/api/img?url=' + encodeURIComponent(item.poster);
                    $(this).attr('src', proxyUrl);
                });

                // Открытие карточки
                const openCard = () => {
                    const searchData = {
                        component: 'search',
                        query: cleanTitle,
                        year: year || undefined,
                        type: isSeries ? 'tv' : 'movie'
                    };

                    // Дополнительно пробуем открыть через movie, если получится
                    if (item.url) {
                        Lampa.Activity.push(searchData);
                    } else {
                        Lampa.Activity.push(searchData);
                    }
                };

                card.on('hover:enter', openCard);
                card.on('click', openCard);

                container.append(card);
            });

            wrapper.append(container);
            this.html.append(wrapper);
            Lampa.Controller.toggle('content');
        };

        return comp;
    }

    // Добавление пункта меню
    Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready') {
            if (!$('[data-action="my_rezka_open"]').length) {
                $('.menu .menu__list').eq(0).append(
                    '<li class="menu__item selector" data-action="my_rezka_open">' +
                    '<div class="menu__ico">R</div>' +
                    '<div class="menu__text">Rezka</div></li>'
                );
            }

            $('body').off('click', '[data-action="my_rezka_open"]')
                     .on('click', '[data-action="my_rezka_open"]', function () {
                Lampa.Activity.push({ component: 'my_rezka', type: 'component' });
            });

            Lampa.Component.add('my_rezka', MyRezkaComponent);
        }
    });
})();