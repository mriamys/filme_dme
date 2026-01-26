(function () {
    'use strict';

    var MY_API_URL = 'http://64.188.67.85:8080';

    function MyRezkaComponent(object) {
        var comp = {};

        comp.create = function () {
            this.html = $('<div class="items items--vertical"></div>');
            var statusLine = $('<div class="empty__descr">Загрузка...</div>');
            this.html.append(statusLine);

            var _this = this;

            fetch(MY_API_URL + '/api/watching')
                .then(function (response) { return response.json(); })
                .then(function (json) {
                    statusLine.remove();
                    if (json && json.length) {
                        // Выводим в консоль первый элемент для проверки
                        console.log('REZKA: Первый фильм:', json[0]);
                        _this.render_grid(json);
                    } else {
                        _this.html.append('<div class="empty__descr">Список пуст</div>');
                    }
                })
                .catch(function (error) {
                    statusLine.text('Ошибка: ' + error.message);
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
                // --- 1. АГРЕССИВНАЯ ОЧИСТКА НАЗВАНИЯ ---
                // Берем название до первого разделителя (/ : ( .)
                var cleanTitle = item.title.split(/[\/:\(\.]/)[0].trim();
                
                // --- 2. ПОДГОТОВКА КАРТИНКИ ---
                var imgUrl = item.poster;
                if (imgUrl && imgUrl.startsWith('http')) {
                    // Добавляем timestamp, чтобы браузер не брал битую картинку из кэша
                    imgUrl = MY_API_URL + '/api/img?url=' + encodeURIComponent(imgUrl) + '&t=' + Date.now();
                } else {
                    imgUrl = './img/empty.jpg';
                }

                // Лог для проверки (посмотрите в F12 -> Console)
                console.log('REZKA ITEM:', cleanTitle, '=>', imgUrl);

                var card = Lampa.Template.get('card', {
                    title: item.title,       // На экране показываем полное название
                    original_title: cleanTitle, // Для поиска (иногда Лампа берет это)
                    release_year: item.status || '',
                    img: imgUrl
                });
                
                card.addClass('card--collection');
                card.css('width', '16.6%');

                // Если картинка не грузится - ставим заглушку
                card.find('img').on('error', function () {
                    console.log('REZKA IMG ERROR:', $(this).attr('src'));
                    $(this).attr('src', './img/empty.jpg');
                });

                // --- 3. КЛИК -> ПОИСК ---
                card.on('hover:enter', function () {
                    console.log('REZKA SEARCH:', cleanTitle);
                    Lampa.Activity.push({
                        component: 'search',
                        query: cleanTitle
                    });
                });

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
            $('.menu .menu__list').eq(0).append(
                '<li class="menu__item selector" data-action="my_rezka_open">' +
                '<div class="menu__ico">R</div>' +
                '<div class="menu__text">Rezka</div>' +
                '</li>'
            );

            $('body').on('click', '[data-action="my_rezka_open"]', function () {
                Lampa.Activity.push({
                    component: 'my_rezka',
                    type: 'component'
                });
            });

            Lampa.Component.add('my_rezka', MyRezkaComponent);
        }
    });
})();