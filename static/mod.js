(function () {
    'use strict';

    // ВАЖНО: Прямой адрес сервера
    var MY_API_URL = 'http://64.188.67.85:8080';

    function MyRezkaComponent(object) {
        // Создаем пустой объект вместо использования new Lampa.Component
        var comp = {};

        comp.create = function () {
            // Создаем HTML-контейнер вручную
            this.html = $('<div class="items items--vertical"></div>');
            
            // Включаем лоадер (this.activity появится автоматически)
            if (this.activity) this.activity.loader(true);

            Lampa.Noty.show('Rezka: Загрузка...');
            
            var _this = this;
            var url = MY_API_URL + '/api/watching';

            fetch(url)
                .then(function (response) {
                    if (!response.ok) throw new Error(response.status);
                    return response.json();
                })
                .then(function (json) {
                    if (_this.activity) _this.activity.loader(false);
                    
                    if (json && json.length) {
                        // Если есть фильмы — рендерим
                        _this.render_list(json);
                    } else {
                        // Если пусто
                        _this.html.append('<div class="empty__descr">Список пуст</div>');
                    }
                })
                .catch(function (error) {
                    if (_this.activity) _this.activity.loader(false);
                    // Выводим ошибку на экран
                    _this.html.append('<div class="empty__descr" style="color:red">Ошибка: ' + error.message + '</div>');
                    Lampa.Noty.show('Rezka Error: ' + error.message);
                });

            return this.html;
        };

        comp.render_list = function (json) {
            // Подготавливаем данные
            var items = [];
            json.forEach(function (item) {
                items.push({
                    title: item.title,
                    original_title: item.title,
                    img: item.poster,
                    query: item.title
                });
            });

            // Используем стандартный шаблон линии карточек
            var line = Lampa.Template.get('items_line', { title: 'Смотрю' });
            var list = line.find('.card-layer');

            items.forEach(function (item) {
                var card = Lampa.Template.get('card', item);
                // Заглушка, если нет картинки
                card.find('img').on('error', function () {
                    $(this).attr('src', './img/empty.jpg');
                });
                // Обработка клика
                card.on('hover:enter', function () {
                    Lampa.Activity.push({
                        component: 'search',
                        query: item.query
                    });
                });
                list.append(card);
            });

            // Добавляем линию в наш контейнер
            this.html.append(line);
        };

        return comp;
    }

    // Регистрация плагина
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
                    type: 'list'
                });
            });

            Lampa.Component.add('my_rezka', MyRezkaComponent);
        }
    });
})();