/*
 * Custom plugin for Lampa to display your Rezka favorites.
 *
 * Эта версия решает две основные проблемы: 
 * 1. Плакаты сериалов проксируются через API, чтобы избежать ошибок смешанного контента.
 * 2. Обработчики `hover:enter` и `click` добавлены для работы как с пультами, так и с мышью/тачем.
 */

(function () {
    'use strict';

    // Укажите адрес своего бэкенда (протокол и порт). 
    // Можно переопределить через window.MY_API_URL.
    var MY_API_URL = window.MY_API_URL || 'http://64.188.67.85:8080';

    function MyRezkaComponent(object) {
        var comp = {};

        comp.create = function () {
            this.html = $('<div class="items items--vertical"></div>');
            var statusLine = $('<div class="empty__descr">Загрузка...</div>');
            this.html.append(statusLine);
            var _this = this;

            fetch(MY_API_URL + '/api/watching')
                .then(function (r) { return r.json(); })
                .then(function (json) {
                    statusLine.remove();
                    if (json && json.length) {
                        _this.render_grid(json);
                    } else {
                        _this.html.append('<div class="empty__descr">Список пуст</div>');
                    }
                })
                .catch(function (e) {
                    statusLine.text('Ошибка: ' + e.message);
                });

            return this.render();
        };

        comp.start = function() {};
        comp.pause = function() {};
        comp.destroy = function() { this.html.remove(); };
        comp.render = function() { return this.html; };

        comp.render_grid = function (items) {
            var wrapper = $('<div class="category-full"></div>');
            wrapper.append('<div class="category-full__head">Сейчас смотрю</div>');
            var body = $('<div class="category-full__body" style="display:flex; flex-wrap:wrap; padding-bottom:2em"></div>');

            items.forEach(function (item) {
                // Очистка названия
                var cleanTitle = item.title;
                if (cleanTitle.indexOf(' / ') > 0) cleanTitle = cleanTitle.split(' / ')[0];
                cleanTitle = cleanTitle.replace(/\(\d{4}\)/g, '');
                cleanTitle = cleanTitle.split(':')[0];
                cleanTitle = cleanTitle.trim();

                // Проксирование изображений
                var imgUrl = item.poster;
                if (imgUrl && imgUrl.startsWith('http')) {
                    imgUrl = MY_API_URL + '/api/img?url=' + encodeURIComponent(imgUrl);
                }

                // Создание карточки
                var card = Lampa.Template.get('card', {
                    title: item.title,
                    original_title: cleanTitle,
                    release_year: item.status || '',
                    img: imgUrl
                });
                card.addClass('card--collection');
                card.css('width', '16.6%');

                // Заглушка на случай ошибки загрузки постера
                card.find('img').on('error', function () {
                    $(this).attr('src', 'https://via.placeholder.com/300x450?text=Нет+изображения');
                });

                // Переход к поиску по клику/нажатию
                function openSearch() {
                    Lampa.Activity.push({
                        component: 'search',
                        query: cleanTitle,
                        page: 1
                    });
                }
                card.on('hover:enter', openSearch);
                card.on('click', openSearch);

                body.append(card);
            });

            wrapper.append(body);
            this.html.append(wrapper);
            Lampa.Controller.toggle('content');
        };

        return comp;
    }

    Lampa.Listener.follow('app', function (e) {
        if (e.type == 'ready') {
            $('.menu .menu__list').eq(0).append('<li class="menu__item selector" data-action="my_rezka_open"><div class="menu__ico">R</div><div class="menu__text">Rezka</div></li>');
            $('body').on('click', '[data-action="my_rezka_open"]', function () {
                Lampa.Activity.push({ component: 'my_rezka', type: 'component' });
            });
            Lampa.Component.add('my_rezka', MyRezkaComponent);
        }
    });
})();
