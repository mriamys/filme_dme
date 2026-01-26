(function() {
    'use strict';

    var MY_API_URL = 'http://filme.64.188.67.85.sslip.io:8080';
    var TMDB_API_KEY = '4ef0d7355d9ffb5151e987764708ce96';

    console.log('[Rezka] Plugin loading...');

    function RezkaCategory(category) {
        var comp = {};
        comp.html = $('<div class="category-items"></div>');
        var scroll = null;
        var isModalOpen = false;
        var last_item = null;

        var endpoints = {
            'watching': '/api/watching',
            'later': '/api/later',
            'watched': '/api/watched'
        };

        comp.create = function() {
            var loader = $('<div class="broadcast__text">Загрузка...</div>');
            comp.html.append(loader);

            $.ajax({
                url: MY_API_URL + endpoints[category],
                method: 'GET',
                dataType: 'json',
                timeout: 15000,
                success: function(items) {
                    loader.remove();
                    if (items && items.length > 0) {
                        comp.build(items);
                    } else {
                        comp.html.append('<div class="broadcast__text">Список пуст</div>');
                    }
                },
                error: function(err) {
                    loader.remove();
                    comp.html.append('<div class="broadcast__text">Ошибка загрузки</div>');
                }
            });
            return comp.html;
        };

        comp.build = function(items) {
            if (scroll) scroll.destroy();

            // 1. Создаем скролл
            scroll = new Lampa.Scroll({
                horizontal: false,
                step: 300 // Чуть больше шаг для удобства
            });

            // 2. Создаем сетку
            var grid = $('<div class="rezka-grid"></div>');
            grid.css({
                'display': 'grid',
                'grid-template-columns': 'repeat(auto-fill, minmax(150px, 1fr))',
                'gap': '20px',
                'padding': '20px',
                'padding-right': '80px' // Отступ справа, чтобы контент не перекрывался кнопками
            });

            items.forEach(function(item) {
                grid.append(comp.card(item));
            });

            scroll.append(grid);
            comp.html.append(scroll.render());

            // 3. Создаем боковые кнопки скролла
            comp.createScrollButtons();

            comp.start();
        };

        comp.createScrollButtons = function() {
            // Контейнер для кнопок
            var controls = $('<div class="rezka-controls"></div>');
            controls.css({
                'position': 'absolute',
                'right': '10px',
                'top': '0',
                'bottom': '0',
                'display': 'flex',
                'flex-direction': 'column',
                'justify-content': 'center',
                'gap': '20px',
                'z-index': '100',
                'width': '60px'
            });

            // Стиль кнопки
            var btnStyle = {
                'width': '50px',
                'height': '50px',
                'background': 'rgba(255, 255, 255, 0.1)',
                'border-radius': '50%',
                'display': 'flex',
                'align-items': 'center',
                'justify-content': 'center',
                'font-size': '24px',
                'cursor': 'pointer',
                'transition': 'all 0.2s'
            };

            // Кнопка ВВЕРХ
            var btnUp = $('<div class="selector rezka-scroll-btn">▲</div>');
            btnUp.css(btnStyle);
            
            btnUp.on('hover:enter', function() {
                try { if(scroll) scroll.minus(); } catch(e) {}
            });
            
            btnUp.on('hover:focus', function() {
                last_item = btnUp; // Чтобы контроллер знал, где фокус
                $(this).css({'background': '#fff', 'color': '#000', 'transform': 'scale(1.1)'});
            });
            
            btnUp.on('hover:blur', function() {
                $(this).css({'background': 'rgba(255, 255, 255, 0.1)', 'color': '#fff', 'transform': 'scale(1)'});
            });

            // Кнопка ВНИЗ
            var btnDown = $('<div class="selector rezka-scroll-btn">▼</div>');
            btnDown.css(btnStyle);
            
            btnDown.on('hover:enter', function() {
                try { if(scroll) scroll.plus(); } catch(e) {}
            });

            btnDown.on('hover:focus', function() {
                last_item = btnDown;
                $(this).css({'background': '#fff', 'color': '#000', 'transform': 'scale(1.1)'});
            });

            btnDown.on('hover:blur', function() {
                $(this).css({'background': 'rgba(255, 255, 255, 0.1)', 'color': '#fff', 'transform': 'scale(1)'});
            });

            controls.append(btnUp);
            controls.append(btnDown);
            
            // Добавляем кнопки прямо в html компонента (поверх скролла)
            comp.html.append(controls);
        };

        comp.card = function(item) {
            var rawTitle = item.title || '';
            var yearMatch = rawTitle.match(/\((\d{4})\)/);
            var year = yearMatch ? yearMatch[1] : '';
            var titleNoYear = rawTitle.replace(/\s*\(\d{4}\)/, '').trim();
            var parts = titleNoYear.split('/');
            var titleRu = parts[0].trim();
            var titleEn = parts[1] ? parts[1].trim() : '';
            var titleRuClean = titleRu.split(':')[0].trim();

            var isTv = /\/series\/|\/cartoons\//.test(item.url || '');
            var mediaType = isTv ? 'tv' : 'movie';
            var posterUrl = item.poster ? MY_API_URL + '/api/img?url=' + encodeURIComponent(item.poster) : '';

            var card = $('<div class="rezka-card selector"></div>');
            card.css({
                'position': 'relative',
                'cursor': 'pointer',
                'border-radius': '10px',
                'overflow': 'hidden',
                'transition': 'transform 0.2s',
                'background-color': '#1a1a1a'
            });

            var poster = $('<div></div>');
            poster.css({
                'width': '100%',
                'padding-bottom': '150%',
                'position': 'relative',
                'background-image': posterUrl ? 'url(' + posterUrl + ')' : 'none',
                'background-color': '#2a2a2a',
                'background-size': 'cover',
                'background-position': 'center'
            });

            if (item.status) {
                var badge = $('<div></div>').text(item.status);
                badge.css({
                    'position': 'absolute', 'bottom': '0', 'left': '0', 'right': '0',
                    'padding': '5px', 'background': 'rgba(0,0,0,0.9)', 'color': '#fff',
                    'font-size': '11px', 'text-align': 'center'
                });
                poster.append(badge);
            }

            card.append(poster);

            var title = $('<div></div>').text(titleRu);
            title.css({
                'padding': '10px', 'font-size': '13px', 'color': '#fff', 'text-align': 'center',
                'min-height': '50px', 'display': 'flex', 'align-items': 'center', 'justify-content': 'center'
            });
            card.append(title);

            // Обработка событий карточки
            card.on('hover:focus', function() {
                last_item = item;
                // Пытаемся обновить скролл, но если не выйдет - не страшно, есть кнопки справа
                try { if (scroll) scroll.update($(this)); } catch(e) {}

                $('.rezka-card').css({'transform': 'scale(1)', 'box-shadow': 'none', 'z-index': '1'});
                $(this).css({'transform': 'scale(1.05)', 'box-shadow': '0 8px 20px rgba(255,255,255,0.3)', 'z-index': '10'});
            });

            card.on('hover:blur', function() {
                $(this).css({'transform': 'scale(1)', 'box-shadow': 'none', 'z-index': '1'});
            });

            card.on('hover:enter', function(e) {
                if(e) e.preventDefault();
                if(isModalOpen) return;
                comp.search(titleRuClean, titleEn, year, mediaType);
            });

            card.on('hover:long', function() {
                comp.menu(item);
            });

            return card;
        };

        // --- ЛОГИКА ПОИСКА И ОТКРЫТИЯ ---
        comp.search = function(titleRu, titleEn, year, mediaType) {
            Lampa.Loading.start(function() {});
            var allResults = [];
            var seenIds = {};
            var completed = 0;
            var toSearch = [];
            if (titleEn) toSearch.push(titleEn);
            if (titleRu) toSearch.push(titleRu);

            if (toSearch.length === 0) { Lampa.Loading.stop(); Lampa.Noty.show('Ошибка поиска'); return; }

            function checkComplete() {
                completed++;
                if (completed === toSearch.length) {
                    Lampa.Loading.stop();
                    if (allResults.length === 0) { Lampa.Noty.show('Не найдено'); return; }
                    var exactMatch = null;
                    if (year) {
                        for (var i = 0; i < allResults.length; i++) {
                            var r = allResults[i];
                            var rYear = (r.release_date || r.first_air_date || '').substring(0, 4);
                            if (rYear === year) { exactMatch = r; break; }
                        }
                    }
                    if (exactMatch) comp.openCard(exactMatch.id, mediaType);
                    else if (allResults.length === 1) comp.openCard(allResults[0].id, mediaType);
                    else comp.showSelection(allResults, mediaType);
                }
            }

            toSearch.forEach(function(searchTitle) {
                var url = 'https://api.themoviedb.org/3/search/' + mediaType + '?api_key=' + TMDB_API_KEY + '&language=ru-RU&query=' + encodeURIComponent(searchTitle);
                if (year) url += (mediaType === 'tv' ? '&first_air_date_year=' : '&year=') + year;
                $.ajax({
                    url: url, timeout: 10000,
                    success: function(data) {
                        if (data.results) {
                            data.results.forEach(function(item) {
                                if (!seenIds[item.id]) { seenIds[item.id] = true; allResults.push(item); }
                            });
                        }
                        checkComplete();
                    },
                    error: function() { checkComplete(); }
                });
            });
        };

        comp.showSelection = function(results, mediaType) {
            if (isModalOpen) return; isModalOpen = true;
            var items = results.map(function(item) {
                var yr = (item.release_date || item.first_air_date || '').substring(0, 4);
                return {
                    title: (item.title || item.name) + ' (' + yr + ')',
                    description: (item.overview || '').substring(0, 150),
                    tmdb_id: item.id
                };
            });
            Lampa.Select.show({
                title: 'Выберите вариант', items: items,
                onSelect: function(s) { isModalOpen = false; comp.openCard(s.tmdb_id, mediaType); },
                onBack: function() { isModalOpen = false; }
            });
        };

        comp.openCard = function(tmdbId, mediaType) {
            Lampa.Activity.push({ component: 'full', id: tmdbId, method: mediaType, source: 'tmdb', card: { id: tmdbId, source: 'tmdb' } });
        };

        // --- МЕНЮ И СЕРИИ ---
        comp.menu = function(item) {
            if (isModalOpen) return; isModalOpen = true;
            var isTv = /\/series\/|\/cartoons\//.test(item.url || '');
            var items = [];
            if (isTv) items.push({ title: ' Серии', value: 'episodes' });
            if (category !== 'watching') items.push({ title: '▶ В Смотрю', value: 'move_watching' });
            if (category !== 'later')    items.push({ title: '⏳ В Позже', value: 'move_later'    });
            if (category !== 'watched') items.push({ title: '✅ В Архив', value: 'move_watched'  });
            items.push({ title: '️ Удалить', value: 'delete' });

            Lampa.Select.show({
                title: 'Управление', items: items,
                onSelect: function(sel) {
                    isModalOpen = false;
                    if (sel.value === 'episodes') comp.episodes(item);
                    else comp.action(sel.value, item);
                },
                onBack: function() { isModalOpen = false; }
            });
        };

        comp.episodes = function(item) {
            if (isModalOpen) return; isModalOpen = true;
            Lampa.Loading.start(function() {});
            $.ajax({
                url: MY_API_URL + '/api/details', data: { url: item.url },
                success: function(details) {
                    Lampa.Loading.stop();
                    if (!details || !details.seasons) { Lampa.Noty.show('Ошибка'); isModalOpen = false; return; }
                    var seasons = Object.keys(details.seasons).sort(function(a, b) { return parseInt(a) - parseInt(b); });
                    var items = seasons.map(function(s) {
                        var eps = details.seasons[s];
                        var w = eps.filter(function(e) { return e.watched; }).length;
                        return { title: 'Сезон ' + s + ' (' + w + '/' + eps.length + ')', value: s, episodes: eps };
                    });
                    Lampa.Select.show({
                        title: 'Сезон', items: items,
                        onSelect: function(sel) { comp.episodeList(item, sel.value, sel.episodes); },
                        onBack: function() { isModalOpen = false; }
                    });
                },
                error: function() { Lampa.Loading.stop(); Lampa.Noty.show('Ошибка'); isModalOpen = false; }
            });
        };

        comp.episodeList = function(item, season, episodes) {
            var items = [{ title: '✅ Все', value: 'all', season: season }];
            episodes.sort(function(a, b) { return parseInt(a.episode) - parseInt(b.episode); }).forEach(function(ep) {
                items.push({ title: (ep.watched ? '✅' : '▫️') + ' ' + ep.episode, value: ep.episode, season: season });
            });
            Lampa.Select.show({
                title: 'Серия', items: items,
                onSelect: function(sel) {
                    if (sel.value === 'all') comp.markAll(item, sel.season);
                    else comp.markOne(item, sel.season, sel.value);
                },
                onBack: function() { isModalOpen = false; }
            });
        };

        comp.markOne = function(item, season, episode) {
            Lampa.Loading.start(function() {});
            $.ajax({
                url: MY_API_URL + '/api/episode/mark', method: 'POST', contentType: 'application/json',
                data: JSON.stringify({ url: item.url, season: season, episode: episode }),
                success: function(res) { Lampa.Loading.stop(); Lampa.Noty.show(res.success ? '✅' : '❌'); isModalOpen = false; if (res.success) comp.reload(); },
                error: function() { Lampa.Loading.stop(); Lampa.Noty.show('❌'); isModalOpen = false; }
            });
        };

        comp.markAll = function(item, season) {
            Lampa.Loading.start(function() {});
            $.ajax({
                url: MY_API_URL + '/api/episode/mark-range', method: 'POST', contentType: 'application/json',
                data: JSON.stringify({ url: item.url, season: season, from_episode: 1, to_episode: 999 }),
                success: function(res) { Lampa.Loading.stop(); Lampa.Noty.show(res.success ? '✅' : '❌'); isModalOpen = false; if (res.success) comp.reload(); },
                error: function() { Lampa.Loading.stop(); Lampa.Noty.show('❌'); isModalOpen = false; }
            });
        };

        comp.action = function(action, item) {
            var postId = item.url.match(/\/(\d+)-/);
            postId = postId ? postId[1] : null;
            if (!postId) { Lampa.Noty.show('❌ ID'); return; }
            Lampa.Loading.start(function() {});
            var endpoint = action === 'delete' ? '/api/delete' : '/api/move';
            var data = action === 'delete' ? { post_id: postId, category: category } : { post_id: postId, from_category: category, to_category: action.replace('move_', '') };
            $.ajax({
                url: MY_API_URL + endpoint, method: 'POST', contentType: 'application/json', data: JSON.stringify(data),
                success: function(res) { Lampa.Loading.stop(); Lampa.Noty.show(res.success ? '✅' : '❌'); if (res.success) comp.reload(); },
                error: function() { Lampa.Loading.stop(); Lampa.Noty.show('❌'); }
            });
        };

        comp.reload = function() {
            Lampa.Activity.replace({ component: 'rezka_' + category, page: 1 });
        };

        // --- СТАНДАРТНЫЙ КОНТРОЛЛЕР ---
        comp.start = function() {
            Lampa.Controller.add('rezka', {
                toggle: function() {
                    Lampa.Controller.collectionSet(comp.html);
                    Lampa.Controller.collectionFocus(last_item, comp.html);
                },
                up: function() {
                    if (Navigator.canmove('up')) Navigator.move('up');
                    else Lampa.Controller.toggle('head');
                },
                down: function() {
                    if (Navigator.canmove('down')) Navigator.move('down');
                },
                left: function() {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                right: function() {
                    if (Navigator.canmove('right')) Navigator.move('right');
                },
                back: function() {
                    Lampa.Activity.backward();
                }
            });

            Lampa.Controller.toggle('rezka');
        };

        comp.onResume = function() {
            Lampa.Controller.toggle('rezka');
        };

        comp.pause = function() {};

        comp.destroy = function() {
            if (scroll) scroll.destroy();
            scroll = null;
            comp.html.remove();
        };

        comp.render = function() { return comp.html; };
        return comp;
    }

    function init() {
        if (!window.Lampa) return;

        function createComponent(name, category) {
            Lampa.Component.add(name, function() {
                var c = new RezkaCategory(category);
                c.activity_resume = function() { if (c.onResume) c.onResume(); };
                return c;
            });
        }

        createComponent('rezka_watching', 'watching');
        createComponent('rezka_later', 'later');
        createComponent('rezka_watched', 'watched');

        setTimeout(function() {
            $('[data-action^="rezka_"]').remove();
            var menu = $('.menu .menu__list').eq(0);
            [
                { action: 'rezka_watching', icon: '▶', text: 'Смотрю' },
                { action: 'rezka_later',    icon: '⏳', text: 'Позже' },
                { action: 'rezka_watched',  icon: '✅', text: 'Архив' }
            ].forEach(function(item) {
                var mi = $('<li class="menu__item selector" data-action="' + item.action + '"><div class="menu__ico">' + item.icon + '</div><div class="menu__text">' + item.text + '</div></li>');
                mi.on('hover:enter', function() { Lampa.Activity.push({ component: item.action, page: 1 }); });
                menu.append(mi);
            });
        }, 1000);

        Lampa.Listener.follow('activity', function(e) {
            if (e.type === 'active' && e.component.indexOf('rezka_') === 0) {
                Lampa.Controller.toggle('rezka');
            }
        });
    }

    if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function(e) { if (e.type === 'ready') init(); });
    }
})();