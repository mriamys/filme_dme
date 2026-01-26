(function() {
    'use strict';

    var MY_API_URL = 'http://filme.64.188.67.85.sslip.io:8080';
    var TMDB_API_KEY = '4ef0d7355d9ffb5151e987764708ce96';

    console.log('[Rezka] Plugin loading...');

    function RezkaCategory(category) {
        var comp = {};
        comp.html = $('<div class="category-items"></div>');
        var scroll_wrapper = null;
        var isModalOpen = false;
        var last_item = null;
        var all_items = []; // Храним загруженные данные
        var current_sort = 'added_desc'; // Сортировка по умолчанию (новые добавленные)

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
                        all_items = items; // Сохраняем для сортировки
                        comp.renderList(); // Рисуем список
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

        // --- ЛОГИКА СОРТИРОВКИ ---
        comp.sortItems = function(items, type) {
            var sorted = items.slice(); // Копия массива
            
            if (type === 'added_desc') {
                // По умолчанию (как пришло с сервера, обычно новые сверху)
                return sorted;
            }
            if (type === 'added_asc') {
                // Старые добавленные сверху
                return sorted.reverse();
            }
            if (type === 'year_desc' || type === 'year_asc') {
                sorted.sort(function(a, b) {
                    var ya = parseInt((a.title.match(/\((\d{4})\)/) || [])[1] || 0);
                    var yb = parseInt((b.title.match(/\((\d{4})\)/) || [])[1] || 0);
                    return type === 'year_desc' ? yb - ya : ya - yb;
                });
                return sorted;
            }
            if (type === 'title') {
                sorted.sort(function(a, b) {
                    return a.title.localeCompare(b.title);
                });
                return sorted;
            }
            return sorted;
        };

        // --- ОТРИСОВКА ИНТЕРФЕЙСА ---
        comp.renderList = function() {
            // Очищаем контейнер перед перерисовкой (при смене сортировки)
            comp.html.empty();

            scroll_wrapper = $('<div class="rezka-scroll-wrapper"></div>');
            scroll_wrapper.css({
                'overflow-y': 'hidden',
                'height': '100%',
                'width': '100%',
                'position': 'relative',
                'display': 'flex',
                'flex-direction': 'column'
            });

            // 1. Кнопка Сортировки (теперь это часть скролла)
            var header = $('<div class="rezka-header" style="padding: 15px 20px 5px 20px; flex-shrink: 0;"></div>');
            var sortBtn = $('<div class="selector rezka-sort-btn">⇅ Сортировка</div>');
            
            sortBtn.css({
                'display': 'inline-block',
                'padding': '10px 20px',
                'border-radius': '20px',
                'background': 'rgba(255,255,255,0.1)',
                'font-size': '16px',
                'cursor': 'pointer',
                'transition': 'all 0.2s',
                'border': '1px solid transparent'
            });

            // Логика кнопки сортировки
            sortBtn.on('hover:enter', function() {
                comp.showSortMenu();
            });
            sortBtn.on('hover:focus', function() {
                last_item = sortBtn;
                $(this).css({
                    'background': '#fff',
                    'color': '#000',
                    'transform': 'scale(1.05)',
                    'box-shadow': '0 0 10px rgba(255,255,255,0.5)'
                });
            });
            sortBtn.on('hover:blur', function() {
                $(this).css({
                    'background': 'rgba(255,255,255,0.1)',
                    'color': '#fff',
                    'transform': 'scale(1)',
                    'box-shadow': 'none'
                });
            });

            header.append(sortBtn);
            scroll_wrapper.append(header);

            // 2. Сетка фильмов
            var grid = $('<div class="rezka-grid"></div>');
            grid.css({
                'display': 'grid',
                'grid-template-columns': 'repeat(auto-fill, minmax(140px, 1fr))',
                'gap': '15px',
                'padding': '15px 20px 100px 20px'
            });

            var sortedItems = comp.sortItems(all_items, current_sort);

            sortedItems.forEach(function(item) {
                grid.append(comp.card(item));
            });

            scroll_wrapper.append(grid);
            comp.html.append(scroll_wrapper);

            comp.start();

            // Восстановление фокуса
            setTimeout(function() {
                if (!last_item || !last_item.length || !$.contains(document.documentElement, last_item[0])) {
                    // Если фокус потерян или это первый запуск - фокус на кнопку сортировки (она первая)
                    last_item = sortBtn;
                }
                Lampa.Controller.toggle('rezka');
            }, 100);
        };

        // --- МЕНЮ СОРТИРОВКИ ---
        comp.showSortMenu = function() {
            var items = [
                { title: '📅 Дате добавления (Новые)', value: 'added_desc', selected: current_sort === 'added_desc' },
                { title: '📅 Дате добавления (Старые)', value: 'added_asc', selected: current_sort === 'added_asc' },
                { title: '🎬 Году выпуска (Новые)', value: 'year_desc', selected: current_sort === 'year_desc' },
                { title: '🎬 Году выпуска (Старые)', value: 'year_asc', selected: current_sort === 'year_asc' },
                { title: '🔤 По названию (А-Я)', value: 'title', selected: current_sort === 'title' }
            ];

            items.forEach(function(i) {
                if(i.selected) i.title = '✅ ' + i.title;
            });

            Lampa.Select.show({
                title: 'Сортировка',
                items: items,
                onSelect: function(a) {
                    current_sort = a.value;
                    isModalOpen = false;
                    comp.renderList(); // Перерисовываем список
                },
                onBack: function() {
                    isModalOpen = false;
                    Lampa.Controller.toggle('rezka');
                }
            });
        };

        // --- СОЗДАНИЕ КАРТОЧКИ ---
        comp.card = function(item) {
            var rawTitle = item.title || '';
            var yearMatch = rawTitle.match(/\((\d{4})\)/);
            var year = yearMatch ? yearMatch[1] : '';
            var titleNoYear = rawTitle.replace(/\s*\(\d{4}\)/, '').trim();
            var titleRu = titleNoYear.split('/')[0].trim();
            var titleEn = (titleNoYear.split('/')[1] || '').trim();
            var titleRuClean = titleRu.split(':')[0].trim();

            var isTv = /\/series\/|\/cartoons\//.test(item.url || '');
            var mediaType = isTv ? 'tv' : 'movie';
            var posterUrl = item.poster ? MY_API_URL + '/api/img?url=' + encodeURIComponent(item.poster) : '';

            var card = $('<div class="rezka-card selector"></div>');
            card.css({
                'position': 'relative',
                'cursor': 'pointer',
                'border-radius': '8px',
                'overflow': 'hidden',
                'transition': 'transform 0.2s',
                'background-color': '#202020'
            });

            var poster = $('<div></div>');
            poster.css({
                'width': '100%',
                'padding-bottom': '150%',
                'position': 'relative',
                'background-image': posterUrl ? 'url(' + posterUrl + ')' : 'none',
                'background-color': '#303030',
                'background-size': 'cover',
                'background-position': 'center'
            });

            if (item.status) {
                var badge = $('<div></div>').text(item.status);
                badge.css({
                    'position': 'absolute', 'bottom': '0', 'left': '0', 'right': '0',
                    'padding': '4px', 'background': 'rgba(0,0,0,0.8)', 'color': '#fff',
                    'font-size': '10px', 'text-align': 'center'
                });
                poster.append(badge);
            }

            card.append(poster);

            var title = $('<div></div>').text(titleRu);
            title.css({
                'padding': '8px', 'font-size': '12px', 'color': '#fff', 'text-align': 'center',
                'min-height': '40px', 'display': 'flex', 'align-items': 'center', 'justify-content': 'center',
                'line-height': '1.2'
            });
            card.append(title);

            card.data('item', item);

            // Обработка фокуса и скролла
            card.on('hover:focus', function() {
                last_item = $(this);
                
                $('.rezka-card').css({'transform': 'scale(1)', 'box-shadow': 'none', 'z-index': '1'});
                $(this).css({'transform': 'scale(1.05)', 'box-shadow': '0 8px 20px rgba(0,0,0,0.5)', 'z-index': '10'});

                // Ручной скролл к активному элементу
                if (scroll_wrapper) {
                    var cardTop = $(this).position().top;
                    var containerHeight = scroll_wrapper.height();
                    var scrollTop = scroll_wrapper.scrollTop();
                    
                    // Если ушли вниз
                    if (cardTop > containerHeight - 180) {
                        scroll_wrapper.stop().animate({ scrollTop: scrollTop + 250 }, 200);
                    }
                    // Если ушли вверх (под кнопку сортировки)
                    if (cardTop < 80) {
                        scroll_wrapper.stop().animate({ scrollTop: scrollTop - 250 }, 200);
                    }
                }
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

        // --- ПОИСК ---
        comp.search = function(titleRu, titleEn, year, mediaType) {
            Lampa.Loading.start(function() {});
            
            var allResults = [];
            var seenIds = {};
            var queries = [];
            
            // Если ручной поиск (один аргумент)
            if (arguments.length === 1 && typeof titleRu === 'string') {
                queries.push(titleRu);
                mediaType = 'multi'; 
                year = '';
            } else {
                if (titleEn) queries.push(titleEn);
                if (titleRu) queries.push(titleRu);
            }

            var completed = 0;
            if (queries.length === 0) { Lampa.Loading.stop(); Lampa.Noty.show('Пустой запрос'); return; }

            function checkComplete() {
                completed++;
                if (completed === queries.length) {
                    Lampa.Loading.stop();
                    if (allResults.length === 0) { Lampa.Noty.show('Ничего не найдено'); return; }
                    
                    var exactMatch = null;
                    if (year && mediaType !== 'multi') {
                        exactMatch = allResults.find(function(r) {
                            return (r.release_date || r.first_air_date || '').substring(0, 4) === year;
                        });
                    }
                    
                    if (exactMatch) comp.openCard(exactMatch.id, mediaType === 'multi' ? exactMatch.media_type : mediaType);
                    else if (allResults.length === 1) comp.openCard(allResults[0].id, mediaType === 'multi' ? allResults[0].media_type : mediaType);
                    else comp.showSelection(allResults, mediaType);
                }
            }

            queries.forEach(function(q) {
                var url = 'https://api.themoviedb.org/3/search/' + mediaType + '?api_key=' + TMDB_API_KEY + '&language=ru-RU&query=' + encodeURIComponent(q);
                if (year && mediaType !== 'multi') {
                    url += (mediaType === 'tv' ? '&first_air_date_year=' : '&year=') + year;
                }
                
                $.ajax({
                    url: url, timeout: 10000,
                    success: function(data) {
                        if (data.results) {
                            data.results.forEach(function(item) {
                                if (!seenIds[item.id]) { 
                                    seenIds[item.id] = true; 
                                    if(item.media_type !== 'person') allResults.push(item); 
                                }
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
                var type = item.media_type === 'tv' ? 'TV' : 'Фильм';
                return {
                    title: (item.title || item.name) + ' (' + yr + ') ' + (mediaType === 'multi' ? '['+type+']' : ''),
                    description: (item.overview || '').substring(0, 150),
                    tmdb_id: item.id,
                    media_type: item.media_type || mediaType
                };
            });
            Lampa.Select.show({
                title: 'Выберите вариант', items: items,
                onSelect: function(s) { 
                    isModalOpen = false; 
                    comp.openCard(s.tmdb_id, s.media_type); 
                    Lampa.Controller.toggle('rezka');
                },
                onBack: function() { 
                    isModalOpen = false; 
                    Lampa.Controller.toggle('rezka'); 
                }
            });
        };

        comp.openCard = function(tmdbId, mediaType) {
            Lampa.Activity.push({ component: 'full', id: tmdbId, method: mediaType, source: 'tmdb', card: { id: tmdbId, source: 'tmdb' } });
        };

        // --- МЕНЮ УПРАВЛЕНИЯ ---
        comp.menu = function(item) {
            if (isModalOpen) return; isModalOpen = true;
            
            var isTv = /\/series\/|\/cartoons\//.test(item.url || '');
            var items = [];
            
            // 1. Ручной поиск (НОВАЯ КНОПКА)
            items.push({ title: '🔍 Поиск TMDB (Исправить)', value: 'manual_search' });

            // 2. Серии
            if (isTv) items.push({ title: '📝 Отметки серий', value: 'episodes' });

            // 3. Категории
            if (category !== 'watching') items.push({ title: '▶ В Смотрю', value: 'move_watching' });
            if (category !== 'later')    items.push({ title: '⏳ В Позже', value: 'move_later'    });
            if (category !== 'watched') items.push({ title: '✅ В Архив', value: 'move_watched'  });
            
            // 4. Удаление
            items.push({ title: '🗑️ Удалить', value: 'delete' });

            Lampa.Select.show({
                title: 'Управление', items: items,
                onSelect: function(sel) {
                    isModalOpen = false;
                    Lampa.Controller.toggle('rezka'); 
                    
                    if (sel.value === 'episodes') comp.episodes(item);
                    else if (sel.value === 'manual_search') comp.manualSearchInput(item);
                    else comp.action(sel.value, item);
                },
                onBack: function() { 
                    isModalOpen = false;
                    Lampa.Controller.toggle('rezka');
                }
            });
        };

        // Ввод названия для ручного поиска
        comp.manualSearchInput = function(item) {
            Lampa.Input.edit({
                title: 'Поиск в TMDB',
                value: item.title,
                free: true,
                nosave: true
            }, function(newQuery) {
                if (newQuery) comp.search(newQuery);
                else Lampa.Controller.toggle('rezka');
            });
        };

        // --- РАБОТА С СЕРИЯМИ ---
        comp.episodes = function(item) {
            if (isModalOpen) return; isModalOpen = true;
            Lampa.Loading.start(function() {});
            
            $.ajax({
                url: MY_API_URL + '/api/details', data: { url: item.url },
                success: function(details) {
                    Lampa.Loading.stop();
                    if (!details || !details.seasons) { 
                        Lampa.Noty.show('Ошибка'); 
                        isModalOpen = false; 
                        Lampa.Controller.toggle('rezka');
                        return; 
                    }
                    var seasons = Object.keys(details.seasons).sort(function(a, b) { return parseInt(a) - parseInt(b); });
                    var items = seasons.map(function(s) {
                        var eps = details.seasons[s];
                        var w = eps.filter(function(e) { return e.watched; }).length;
                        return { title: 'Сезон ' + s + ' (' + w + '/' + eps.length + ')', value: s, episodes: eps };
                    });
                    
                    Lampa.Select.show({
                        title: 'Выберите сезон', items: items,
                        onSelect: function(sel) { 
                            comp.episodeList(item, sel.value, sel.episodes); 
                        },
                        onBack: function() { 
                            isModalOpen = false; 
                            Lampa.Controller.toggle('rezka'); 
                        }
                    });
                },
                error: function() { 
                    Lampa.Loading.stop(); 
                    Lampa.Noty.show('Ошибка'); 
                    isModalOpen = false; 
                    Lampa.Controller.toggle('rezka');
                }
            });
        };

        comp.episodeList = function(item, season, episodes) {
            var items = [{ title: '✅ Отметить весь сезон', value: 'all', season: season }];
            episodes.sort(function(a, b) { return parseInt(a.episode) - parseInt(b.episode); }).forEach(function(ep) {
                items.push({ 
                    title: (ep.watched ? '✅ ' : '▫️ ') + 'Серия ' + ep.episode, 
                    value: ep.episode, 
                    season: season 
                });
            });
            Lampa.Select.show({
                title: 'Сезон ' + season, items: items,
                onSelect: function(sel) {
                    if (sel.value === 'all') comp.markAll(item, sel.season);
                    else comp.markOne(item, sel.season, sel.value);
                },
                onBack: function() { 
                    isModalOpen = false; 
                    Lampa.Controller.toggle('rezka'); 
                }
            });
        };

        comp.markOne = function(item, season, episode) {
            Lampa.Loading.start(function() {});
            $.ajax({
                url: MY_API_URL + '/api/episode/mark', method: 'POST', contentType: 'application/json',
                data: JSON.stringify({ url: item.url, season: season, episode: episode }),
                success: function(res) { 
                    Lampa.Loading.stop(); 
                    Lampa.Noty.show(res.success ? 'Сохранено' : 'Ошибка'); 
                    isModalOpen = false; 
                    Lampa.Controller.toggle('rezka');
                    if (res.success) comp.reload(); 
                },
                error: function() { Lampa.Loading.stop(); Lampa.Noty.show('Ошибка сети'); isModalOpen = false; Lampa.Controller.toggle('rezka'); }
            });
        };

        comp.markAll = function(item, season) {
            Lampa.Loading.start(function() {});
            $.ajax({
                url: MY_API_URL + '/api/episode/mark-range', method: 'POST', contentType: 'application/json',
                data: JSON.stringify({ url: item.url, season: season, from_episode: 1, to_episode: 999 }),
                success: function(res) { 
                    Lampa.Loading.stop(); 
                    Lampa.Noty.show(res.success ? 'Сезон отмечен' : 'Ошибка'); 
                    isModalOpen = false; 
                    Lampa.Controller.toggle('rezka');
                    if (res.success) comp.reload(); 
                },
                error: function() { Lampa.Loading.stop(); Lampa.Noty.show('Ошибка сети'); isModalOpen = false; Lampa.Controller.toggle('rezka'); }
            });
        };

        comp.action = function(action, item) {
            var postId = item.url.match(/\/(\d+)-/);
            postId = postId ? postId[1] : null;
            if (!postId) { Lampa.Noty.show('Нет ID'); return; }
            Lampa.Loading.start(function() {});
            var endpoint = action === 'delete' ? '/api/delete' : '/api/move';
            var data = action === 'delete' ? { post_id: postId, category: category } : { post_id: postId, from_category: category, to_category: action.replace('move_', '') };
            $.ajax({
                url: MY_API_URL + endpoint, method: 'POST', contentType: 'application/json', data: JSON.stringify(data),
                success: function(res) { 
                    Lampa.Loading.stop(); 
                    Lampa.Noty.show(res.success ? 'Успешно' : 'Ошибка'); 
                    Lampa.Controller.toggle('rezka');
                    if (res.success) comp.reload(); 
                },
                error: function() { Lampa.Loading.stop(); Lampa.Noty.show('Ошибка сети'); Lampa.Controller.toggle('rezka'); }
            });
        };

        comp.reload = function() {
            Lampa.Activity.replace({ component: 'rezka_' + category, page: 1 });
        };

        // --- КОНТРОЛЛЕР ---
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
            Lampa.Controller.clear();
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