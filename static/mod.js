(function () {
    'use strict';

    var MY_API_URL = 'http://64.188.67.85:8080';

    function MyRezkaComponent(object) {
        var comp = {};

        comp.create = function () {
            // Используем класс items-vertical для вертикального списка
            this.html = $('<div class="items items--vertical"></div>');
            
            var statusLine = $('<div class="empty__descr">Загрузка списка...</div>');
            this.html.append(statusLine);

            var _this = this;

            fetch(MY_API_URL + '/api/watching')
                .then(function (response) {
                    if (!response.ok) throw new Error(response.status);
                    return response.json();
                })
                .then(function (json) {
                    statusLine.remove();
                    
                    if (json && json.length) {
                        Lampa.Noty.show('Rezka: Загружено ' + json.length + ' шт.');
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

        // Обязательные функции
        comp.start = function() {};
        comp.pause = function() {};
        comp.destroy = function() { this.html.remove(); };
        comp.render = function() { return this.html; };

        // Рендеринг сеткой (ПЛИТКА)
        comp.render_grid = function (items) {
            // Создаем контейнер-обертку
            var wrapper = $('<div class="category-full"></div>');
            
            // Заголовок
            wrapper.append('<div class="category-full__head">Сейчас смотрю (' + items.length + ')</div>');
            
            // Тело сетки
            var body = $('<div class="category-full__body"></div>');
            
            // Принудительные стили для сетки, чтобы карточки не пропадали
            body.css({
                'display': 'flex',
                'flex-wrap': 'wrap',
                'padding-bottom': '2em'
            });

            items.forEach(function (item) {
                // Создаем карточку
                var card = Lampa.Template.get('card', {
                    title: item.title,
                    original_title: item.title,
                    release_year: item.status || '', // Показываем серию/статус вместо года
                    img: item.poster
                });
                
                // Стиль карточки для сетки
                card.addClass('card--collection');
                card.css('width', '16.6%'); // Примерно 6 в ряд (Lampa сама подправит на мобильных)

                card.find('img').on('error', function () {
                    $(this).attr('src', './img/empty.jpg');
                });

                card.on('hover:enter', function () {
                    Lampa.Activity.push({
                        component: 'search',
                        query: item.query || item.title
                    });
                });

                body.append(card);
            });

            wrapper.append(body);
            this.html.append(wrapper);
            
            // Обновляем фокус и скролл контроллера
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
                    type: 'component' // Изменил тип на component
                });
            });

            Lampa.Component.add('my_rezka', MyRezkaComponent);
        }
    });
})();