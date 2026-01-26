(function () {
    'use strict';

    // Адрес вашего сервера
    var MY_API_URL = 'http://64.188.67.85:8080';

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
            
            var body = $('<div class="category-full__body"></div>');
            body.css({
                'display': 'flex',
                'flex-wrap': 'wrap',
                'padding-bottom': '2em'
            });

            items.forEach(function (item) {
                // --- 1. ОЧИСТКА НАЗВАНИЯ ДЛЯ ПОИСКА ---
                // "911: Нашвилл / 9-1-1: Lone Star" -> берем "911" (всё до первого двоеточия или слеша)
                var cleanTitle = item.title.split(/[:\/]/)[0].trim();
                // "Интерстеллар (2014)" -> "Интерстеллар" (убираем год)
                cleanTitle = cleanTitle.replace(/\(\d{4}\)/, '').trim();

                // --- 2. КАРТИНКИ ЧЕРЕЗ ПРОКСИ ---
                var imgUrl = item.poster;
                if (imgUrl && imgUrl.startsWith('http')) {
                    // Геренируем ссылку через наш сервер
                    imgUrl = MY_API_URL + '/api/img?url=' + encodeURIComponent(imgUrl);
                } else {
                    imgUrl = './img/empty.jpg';
                }

                // --- 3. СОЗДАНИЕ КАРТОЧКИ ---
                var card = Lampa.Template.get('card', {
                    title: item.title,
                    original_title: cleanTitle, // Важно для поиска
                    release_year: item.status || '',
                    img: imgUrl
                });
                
                card.addClass('card--collection');
                card.css('width', '16.6%'); // 6 в ряд

                // Клик по карточке -> Поиск
                card.on('hover:enter', function () {
                    // Запускаем поиск Лампы по чистому названию
                    Lampa.Activity.push({
                        component: 'search',
                        query: cleanTitle
                    });
                });

                body.append(card);
            });

            wrapper.append(body);
            this.html.append(wrapper);
            // Включаем скролл
            Lampa.Controller.toggle('content');
        };

        return comp;
    }

    Lampa.Listener.follow('app', function (e) {
        if (e.type == 'ready') {
            $('.menu .menu__list').eq(0).append(
                '<li class="menu__item selector" data-action="my_rezka_open">' +
                '<div class="menu__ico">R</div>' +
                '<div class="menu__text">Rezka</div>' +
                '</li>'
            );
            $('body').on('click', '[data-action="my_rezka_open"]', function () {
                Lampa.Activity.push({ component: 'my_rezka', type: 'component' });
            });
            Lampa.Component.add('my_rezka', MyRezkaComponent);
        }
    });
})();   