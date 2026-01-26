/*
 * Custom plugin for Lampa to display your Rezka favorites.
 *
 * This version addresses two common issues users have encountered with the
 * original implementation:
 *
 *   1. Poster images were not being displayed.  In the first version the
 *      plugin attempted to proxy every poster through the API (`/api/img`).
 *      If the API host was unavailable, used plain `http`, or returned
 *      errors, the `<img>` tags would fall back to a broken URL and the
 *      posters would not render at all.  The updated code now uses the
 *      original `poster` URL provided by the API directly.  Modern browsers
 *      happily load remote images from other domains and Lampa itself
 *      doesn’t restrict cross‑origin images.  Only when a poster URL is
 *      absent will the image fallback handler run.
 *
 *   2. Clicking on a card did nothing.  The previous implementation only
 *      attached a `hover:enter` handler, which is primarily triggered by
 *      remote controls or keyboard navigation.  On devices where users
 *      interact via a mouse or touch screen, the `click` event never fired,
 *      so nothing happened when selecting a title.  The updated code
 *      attaches handlers for both `hover:enter` and `click` events so that
 *      navigation works with a mouse, touch or remote control.
 */

(function () {
    'use strict';

    // Base URL of your backend.  If you host the Rezka backend and this
    // plugin on the same domain, you can leave this as an empty string
    // and relative requests will succeed.  Otherwise set this to the
    // domain (including protocol and port) where your FastAPI app runs.
    var MY_API_URL = window.MY_API_URL || '';

    function MyRezkaComponent(object) {
        var comp = {};

        comp.create = function () {
            this.html = $('<div class="items items--vertical"></div>');
            var statusLine = $('<div class="empty__descr">Загрузка...</div>');
            this.html.append(statusLine);
            var _this = this;

            // Fetch the current "watching" category.  Note: `MY_API_URL` may
            // be empty if the backend is served on the same origin.
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
                // --- 1. ОЧИСТКА НАЗВАНИЯ ---
                var cleanTitle = item.title;
                if (cleanTitle.indexOf(' / ') > 0) cleanTitle = cleanTitle.split(' / ')[0];
                cleanTitle = cleanTitle.replace(/\(\d{4}\)/g, '');
                cleanTitle = cleanTitle.split(':')[0]; // "911: Нашвилл" -> "911"
                cleanTitle = cleanTitle.trim();

                // --- 2. КАРТИНКИ ---
                // Always use the original poster URL.  Proxying through the API
                // is unnecessary for image tags and can result in broken
                // thumbnails if the proxy server is unreachable.  If no
                // poster is provided, imgUrl will be undefined and the
                // `error` handler will replace it with a placeholder.
                var imgUrl = item.poster || '';

                // --- 3. КАРТОЧКА ---
                var card = Lampa.Template.get('card', {
                    title: item.title,
                    original_title: cleanTitle,
                    release_year: item.status || '',
                    img: imgUrl
                });
                card.addClass('card--collection');
                card.css('width', '16.6%');

                // Replace a broken poster with a generic placeholder.
                card.find('img').on('error', function () {
                    $(this).attr('src', 'https://via.placeholder.com/300x450?text=Нет+изображения');
                });

                // --- 4. КЛИК -> ПОИСК ---
                // Add handlers for both keyboard/remote navigation and
                // mouse/touch interaction.  When a user selects a card,
                // perform a search by the cleaned title which will open the
                // results page within Lampa.  Note: using `hover:enter` alone
                // does not trigger on a touch screen or mouse click.
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
