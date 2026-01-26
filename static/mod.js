(function () {
    'use strict';

    // Твой сервер
    var MY_API_URL = 'http://127.0.0.1:8080';

    function MyRezkaComponent(object) {
        var comp = new Lampa.Component(object, {
            name: 'my_rezka',
            genre_id: -1
        });

        comp.create = function () {
            this.activity.loader(true);
            
            // Запрос к твоему API
            Lampa.Network.silent(MY_API_URL + '/api/watching', function (json) {
                comp.activity.loader(false);
                
                if (json && json.length) {
                    var items = [];
                    json.forEach(function(item){
                        items.push({
                            title: item.title,
                            original_title: item.title,
                            img: item.poster,
                            query: item.title // По этому названию Лампа будет искать фильм
                        });
                    });
                    comp.render_list(items);
                } else {
                    comp.empty('Список пуст');
                }
            }, function () {
                comp.activity.loader(false);
                comp.empty('Ошибка подключения: ' + MY_API_URL);
            });
            
            return this.render();
        };

        comp.on_click = function (item) {
            // При клике открываем поиск Лампы по названию
            Lampa.Activity.push({
                component: 'search',
                query: item.query
            });
        };

        comp.render_list = function (items) {
            var line = Lampa.Template.get('items_line', { title: 'Сейчас смотрю (Rezka)' });
            var list = line.find('.card-layer');

            items.forEach(function (item) {
                var card = Lampa.Template.get('card', item);
                card.find('img').on('error', function(){
                    $(this).attr('src', './img/empty.jpg');
                });
                card.on('hover:enter', function () {
                    comp.on_click(item);
                });
                list.append(card);
            });
            comp.append(line);
        };

        return comp;
    }

    // Добавляем кнопку в меню
    Lampa.Listener.follow('app', function (e) {
        if (e.type == 'ready') {
            // Добавляем пункт в меню слева
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