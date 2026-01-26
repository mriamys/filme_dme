/*
 * Исправленная версия плагина Rezka для Lampa
 * - Используем прямые постеры statichdrezka.ac (работают в Lampa лучше всего)
 * - Улучшенная очистка названия + попытка извлечь год
 * - Лучшая обработка ошибок изображений
 * - Более точный поиск при клике
 */

(function () {
    'use strict';

    var MY_API_URL = window.MY_API_URL || 'http://64.188.67.85:8080';

    function MyRezkaComponent(object) {
        var comp = {};

        comp.create = function () {
            this.html = $('<div class="items items--vertical"></div>');
            var statusLine = $('<div class="empty__descr">Загрузка списка...</div>');
            this.html.append(statusLine);

            fetch(MY_API_URL + '/api/watching')
                .then(r => r.json())
                .then(json => {
                    statusLine.remove();
                    if (json && json.length > 0) {
                        this.render_grid(json);
                    } else {
                        this.html.append('<div class="empty__descr">Список просмотра пуст</div>');
                    }
                })
                .catch(e => {
                    statusLine.text('Ошибка загрузки: ' + e.message);
                    console.error(e);
                });

            return this.render();
        };

        comp.render = function () { return this.html; };
        comp.start = comp.pause = function() {};
        comp.destroy = function() { this.html.remove(); };

        comp.render_grid = function (items) {
            var wrapper = $('<div class="category-full"></div>');
            wrapper.append('<div class="category-full__head">Сейчас смотрю</div>');
            var body = $('<div class="category-full__body" style="display:flex;flex-wrap:wrap;gap:12px;padding-bottom:2em"></div>');

            items.forEach(item => {
                // Улучшенная очистка названия
                let title = item.title || '';
                let year = '';

                // Пытаемся извлечь год из названия (если есть)
                const yearMatch = title.match(/\((\d{4})\)/);
                if (yearMatch) {
                    year = yearMatch[1];
                    title = title.replace(/ \(\d{4}\)/, '');
                }

                // Убираем лишнее
                let cleanTitle = title.split(' / ')[0].split(':')[0].trim();

                // Прямой URL постера (самый надёжный вариант для Lampa)
                let imgUrl = item.poster && item.poster.startsWith('http') 
                    ? item.poster 
                    : 'https://via.placeholder.com/300x450?text=Нет+постера';

                var card = Lampa.Template.get('card', {
                    title: item.title,
                    original_title: cleanTitle,
                    release_year: item.status || year || '',
                    img: imgUrl
                });

                card.addClass('card--collection');
                card.css({ width: '16.6%', minWidth: '140px' });

                // Надёжная обработка ошибок загрузки изображения
                card.find('img').on('error', function () {
                    $(this).attr('src', 'https://via.placeholder.com/300x450?text=Ошибка');
                });

                // Открытие карточки через поиск (самый стабильный способ сейчас)
                function openItem() {
                    let searchQuery = cleanTitle;
                    if (year) searchQuery += ' ' + year;

                    Lampa.Activity.push({
                        component: 'search',
                        query: searchQuery,
                        year: year || undefined,
                        type: item.url.includes('/series/') || item.url.includes('/cartoons/') ? 'tv' : 'movie'
                    });
                }

                card.on('hover:enter', openItem);
                card.on('click', openItem);

                body.append(card);
            });

            wrapper.append(body);
            this.html.append(wrapper);
            Lampa.Controller.toggle('content');
        };

        return comp;
    }

    // Добавление в меню
    Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready') {
            if ($('.menu__item[data-action="my_rezka_open"]').length === 0) {
                $('.menu .menu__list').eq(0).append(
                    '<li class="menu__item selector" data-action="my_rezka_open">' +
                    '<div class="menu__ico">R</div>' +
                    '<div class="menu__text">Rezka</div></li>'
                );
            }

            $('body').on('click', '[data-action="my_rezka_open"]', function () {
                Lampa.Activity.push({ component: 'my_rezka', type: 'component' });
            });

            Lampa.Component.add('my_rezka', MyRezkaComponent);
        }
    });
})();