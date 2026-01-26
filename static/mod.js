(function () {
    'use strict';

    // ВАЖНО: Адрес вашего сервера (VPS).
    // Если поменять на 127.0.0.1, то работать будет ТОЛЬКО на том же компьютере, где сервер.
    var MY_API_URL = 'https://filme.64.188.67.85.sslip.io';

    function MyRezkaComponent(object) {
        var comp = new Lampa.Component(object, {
            name: 'my_rezka',
            genre_id: -1
        });

        comp.create = function () {
            this.activity.loader(true);
            
            // Запрос к API
            Lampa.Network.silent(MY_API_URL + '/api/watching', function (json) {
                comp.activity.loader(false);
                
                if (json && json.length) {
                    var items = [];
                    json.forEach(function(item){
                        items.push({
                            title: item.title,
                            original_title: item.title,
                            img: item.poster,
                            // Важно: по этому полю Лампа будет искать (Search)
                            query: item.title 
                        });
                    });
                    comp.render_list(items);
                } else {
                    comp.empty('Список пуст');
                }
            }, function (a, c) {
                comp.activity.loader(false);
                // Показываем ошибку с адресом, чтобы было понятно, куда не достучались
                comp.empty('Ошибка: ' + MY_API_URL + ' (' + c + ')');
            });
            
            return this.render();
        };

        comp.on_click = function (item) {
            // При клике отправляем название фильма в поиск Лампы
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

    // Добавляем кнопку в боковое меню
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