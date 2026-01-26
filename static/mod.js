(function () {
    'use strict';
    // Прямой адрес сервера
    var MY_API_URL = 'http://64.188.67.85:8080';
    function MyRezkaComponent(object) {
        this.name = 'my_rezka';
        this.genre_id = -1;

        this.create = function () {
            this.activity.loader(true);
            // УВЕДОМЛЕНИЕ 1: Сообщаем о начале попытки
            Lampa.Noty.show('Rezka: Старт соединения...');
            console.log('Rezka: Start request to ' + MY_API_URL);
            var url = MY_API_URL + '/api/watching';
            // Используем fetch вместо Lampa.Network для детальной ошибки
            fetch(url)
                .then(function(response) {
                    // Если сервер ответил, но с ошибкой (например, 404 или 500)
                    if (!response.ok) {
                        throw new Error('HTTP статус ' + response.status);
                    }
                    return response.json();
                })
                .then(function(json) {
                    this.activity.loader(false);
                    // УВЕДОМЛЕНИЕ 2: Успех
                    Lampa.Noty.show('Rezka: Успех! Фильмов: ' + (json ? json.length : 0));
                    if (json && json.length) {
                        var items = [];
                        json.forEach(function(item){
                            items.push({
                                title: item.title,
                                original_title: item.title,
                                img: item.poster,
                                query: item.title
                            });
                        });
                        this.render_list(items);
                    } else {
                        this.empty('Список пуст (вернулся пустой массив)');
                    }
                }.bind(this))
                .catch(function(error) {
                    this.activity.loader(false);
                    // УВЕДОМЛЕНИЕ 3: Ошибка
                    Lampa.Noty.show('Rezka Ошибка: ' + error.message);
                    this.empty('Сбой: ' + error.message);
                    console.error('Rezka Error:', error);
                }.bind(this));
            return this.render();
        };
        this.on_click = function (item) {
            Lampa.Activity.push({
                component: 'search',
                query: item.query
            });
        };
        this.render_list = function (items) {
            var line = Lampa.Template.get('items_line', { title: 'Моя Rezka' });
            var list = line.find('.card-layer');
            items.forEach(function (item) {
                var card = Lampa.Template.get('card', item);
                card.find('img').on('error', function(){
                    $(this).attr('src', './img/empty.jpg');
                });
                card.on('hover:enter', function () {
                    this.on_click(item);
                }.bind(this));
                list.append(card);
            });
            this.append(line);
        };
        return this;
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
                    type: 'list'
                });
            });
            Lampa.Component.add('my_rezka', MyRezkaComponent);
        }
    });
})();