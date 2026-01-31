(function() {
    'use strict';

    var MY_API_URL = '__API_URL__';
    var TMDB_API_KEY = '__TMDB_KEY__';

    console.log('[Rezka] Plugin loading (Stable TV/PC + Fixes)...');

    function RezkaCategory(category) {
        var comp = {};
        comp.html = $('<div class="category-items"></div>');
        var scroll_wrapper = null;
        var isModalOpen = false;
        var last_item = null;
        var all_items = []; 
        var current_sort = 'added'; 

        var endpoints = {
            'watching': '/api/watching',
            'later': '/api/later',
            'watched': '/api/watched'
        };

        comp.create = function() {
            comp.loadData();
            return comp.html;
        };
        
        comp.loadData = function() {
            comp.html.empty();
            var loader = $('<div class="broadcast__text">Загрузка...</div>');
            comp.html.append(loader);

            var url = MY_API_URL + endpoints[category] + '?sort=' + current_sort;

            $.ajax({
                url: url,
                method: 'GET',
                dataType: 'json',
                timeout: 15000,
                success: function(items) {
                    loader.remove();
                    if (items && items.length > 0) {
                        all_items = items;
                        comp.renderList();
                    } else {
                        comp.html.append('<div class="broadcast__text">Список пуст</div>');
                        comp.renderHeaderOnly(); 
                    }
                },
                error: function(err) {
                    console.error('Error loading rezka:', err);
                    loader.remove();
                    comp.html.append('<div class="broadcast__text">Ошибка загрузки данных</div>');
                }
            });
        };

        comp.renderHeaderOnly = function() {
             var header = comp.buildHeader();
             comp.html.prepend(header);
             comp.start();
        }

        // --- ОТРИСОВКА ИНТЕРФЕЙСА ---
        comp.renderList = function() {
            comp.html.empty();

            // СТИЛИ
            var style = $('<style>' +
                /* Скрываем скроллбар */
                '.rezka-scroll-wrapper::-webkit-scrollbar { width: 0px; background: transparent; }' +
                '.rezka-scroll-wrapper { -ms-overflow-style: none; scrollbar-width: none; }' +
                /* Кнопка сортировки */
                '.rezka-sort-btn { transition: all 0.2s; border: 2px solid transparent; }' +
                '.rezka-sort-btn.focus { background-color: #ffffff !important; color: #000000 !important; border-color: #ffffff !important; transform: scale(1.1); box-shadow: 0 0 20px rgba(255,255,255,0.7); z-index: 100; }' +
                /* Карточка и фокус */
                '.rezka-card { transition: transform 0.2s, box-shadow 0.2s, border 0.2s; border: 2px solid transparent; }' +
                '.rezka-card.focus { transform: scale(1.1) !important; border: 2px solid #fff !important; box-shadow: 0 10px 30px rgba(0,0,0,0.8) !important; z-index: 100 !important; }' +
                /* АДАПТИВНОСТЬ ДЛЯ ПК: Карточки крупнее (мин 260px) -> примерно 6 штук в ряд */
                '@media screen and (min-width: 1024px) { .rezka-grid { grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)) !important; } }' +
                '</style>');
            comp.html.append(style);

            scroll_wrapper = $('<div class="rezka-scroll-wrapper"></div>');
            scroll_wrapper.css({
                'overflow-y': 'auto', // Включаем мышку
                'overflow-x': 'hidden',
                'height': '100%',
                'width': '100%',
                'position': 'relative',
                'display': 'flex',
                'flex-direction': 'column',
                'outline': 'none' // Убираем стандартную обводку
            });

            // 1. Хедер
            var header = comp.buildHeader();
            scroll_wrapper.append(header);

            // 2. Сетка
            var grid = $('<div class="rezka-grid"></div>');
            grid.css({
                'display': 'grid',
                'grid-template-columns': 'repeat(auto-fill, minmax(140px, 1fr))', // Дефолт для ТВ (8 штук)
                'gap': '20px', 
                'padding': '20px 25px 100px 25px'
            });

            all_items.forEach(function(item) {
                grid.append(comp.card(item));
            });

            scroll_wrapper.append(grid);
            comp.html.append(scroll_wrapper);

            comp.start();

            // Восстановление фокуса с задержкой (чтобы DOM успел построиться)
            setTimeout(function() {
                var firstMovie = grid.find('.selector').first();
                var sortBtn = comp.html.find('.rezka-sort-btn');
                
                if (firstMovie.length) {
                    last_item = firstMovie;
                } else if (sortBtn.length) {
                    last_item = sortBtn;
                }
                
                // Принудительно активируем контроллер
                Lampa.Controller.toggle('rezka');
            }, 200);
        };
        
        comp.buildHeader = function() {
            var header = $('<div class="rezka-header"></div>');
            header.css({
                'padding': '15px 20px 5px 20px',
                'flex-shrink': '0',
                'text-align': 'right',
                'z-index': '11'
            });

            var sortLabel = 'Сортировка';
            if (current_sort === 'year') sortLabel = 'По году выпуска';
            if (current_sort === 'popular') sortLabel = 'Популярные';
            if (current_sort === 'added') sortLabel = 'По дате добавления';

            var sortBtn = $('<div class="selector rezka-sort-btn">⇅ ' + sortLabel + '</div>');
            sortBtn.css({
                'display': 'inline-block',
                'padding': '10px 20px',
                'border-radius': '8px',
                'background': 'rgba(255,255,255,0.1)',
                'font-size': '16px',
                'cursor': 'pointer',
                'border': '2px solid rgba(255,255,255,0.1)'
            });

            sortBtn.on('hover:enter', function() {
                comp.showSortMenu();
            });
            
            // Важно: обновляем last_item при наведении мышкой или пультом
            sortBtn.on('hover:focus', function() {
                last_item = sortBtn;
                $(this).addClass('focus');
            });

            sortBtn.on('hover:blur', function() {
                $(this).removeClass('focus');
            });

            header.append(sortBtn);
            return header;
        }

        // --- МЕНЮ СОРТИРОВКИ ---
        comp.showSortMenu = function() {
            var items = [
                { title: 'По дате добавления', value: 'added', selected: current_sort === 'added' },
                { title: 'По году выпуска', value: 'year', selected: current_sort === 'year' },
                { title: 'Популярные', value: 'popular', selected: current_sort === 'popular' }
            ];

            items.forEach(function(i) {
                if(i.selected) i.title = '✅ ' + i.title;
            });

            Lampa.Select.show({
                title: 'Сортировка',
                items: items,
                onSelect: function(a) {
                    if (current_sort !== a.value) {
                        current_sort = a.value;
                        isModalOpen = false;
                        comp.loadData();
                    } else {
                        isModalOpen = false;
                        Lampa.Controller.toggle('rezka');
                    }
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
            var year = yearMatch ? yearMatch[1] : (item.year || '');
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

            if (year) {
                var yearBadge = $('<div>' + year + '</div>');
                yearBadge.css({
                    'position': 'absolute', 'top': '5px', 'right': '5px',
                    'background': '#d2a028', 'color': '#000',
                    'padding': '2px 6px', 'border-radius': '4px',
                    'font-size': '11px', 'font-weight': 'bold',
                    'z-index': '2', 'box-shadow': '0 2px 5px rgba(0,0,0,0.5)'
                });
                poster.append(yearBadge);
            }

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
                'padding': '8px',
                'font-size': '12px',
                'color': '#fff',
                'text-align': 'center',
                'min-height': '40px',
                'display': 'flex',
                'align-items': 'center',
                'justify-content': 'center',
                'line-height': '1.2'
            });
            card.append(title);

            card.data('item', item);

            // --- ЛОГИКА ФОКУСА ---
            card.on('hover:focus', function() {
                last_item = $(this);
                $(this).addClass('focus');

                // Ручной скролл для ТВ
                if (scroll_wrapper) {
                    var cardTop = $(this).position().top;
                    var containerHeight = scroll_wrapper.height();
                    var scrollTop = scroll_wrapper.scrollTop();
                    var headerHeight = 60; 

                    if (cardTop > containerHeight - 180) {
                        scroll_wrapper.stop().animate({ scrollTop: scrollTop + 250 }, 200);
                    }
                    if (cardTop < headerHeight + 20) {
                        scroll_wrapper.stop().animate({ scrollTop: scrollTop - 250 }, 200);
                    }
                }
            });

            card.on('hover:blur', function() {
                $(this).removeClass('focus');
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
            
            if (arguments.length === 1 && typeof titleRu === 'string') {
                queries.push(titleRu);
                mediaType = 'multi'; 
                year = '';
            } else {
                if (titleEn) queries.push(titleEn);
                if (titleRu) queries.push(titleRu);
            }

            var completed = 0;
            if (queries.length === 0) { Lampa.Loading.stop(); Lampa.Noty.show('Ошибка'); return; }

            function checkComplete() {
                completed++;
                if (completed === queries.length) {
                    Lampa.Loading.stop();
                    if (allResults.length === 0) { Lampa.Noty.show('Не найдено'); return; }
                    
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
                if (year && mediaType !== 'multi') url += (mediaType === 'tv' ? '&first_air_date_year=' : '&year=') + year;
                
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
            
            items.push({ title: '🔍 Найти в TMDB', value: 'manual_search' });

            if (isTv) items.push({ title: '📝 Отметки серий', value: 'episodes' });
            if (category !== 'watching') items.push({ title: '▶ В Смотрю', value: 'move_watching' });
            if (category !== 'later')    items.push({ title: '⏳ В Позже', value: 'move_later'    });
            if (category !== 'watched') items.push({ title: '✅ В Архив', value: 'move_watched'  });
            items.push({ title: '🗑️ Удалить', value: 'delete' });

            Lampa.Select.show({
                title: 'Управление', items: items,
                onSelect: function(sel) {
                    isModalOpen = false;
                    
                    if (sel.value === 'episodes') {
                        comp.episodes(item);
                    } else if (sel.value === 'manual_search') {
                        var ruName = item.title.replace(/\s*\(\d{4}\)/, '').split('/')[0].trim();
                        comp.search(ruName);
                        // Для ручного поиска нужно вернуть контроллер
                        Lampa.Controller.toggle('rezka');
                    } else {
                        comp.action(sel.value, item);
                    }
                },
                onBack: function() { 
                    isModalOpen = false;
                    Lampa.Controller.toggle('rezka');
                }
            });
        };

        // --- СЕРИИ ---
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
                        onSelect: function(sel) { comp.episodeList(item, sel.value, sel.episodes); },
                        onBack: function() { isModalOpen = false; Lampa.Controller.toggle('rezka'); }
                    });
                },
                error: function() { Lampa.Loading.stop(); Lampa.Noty.show('Ошибка'); isModalOpen = false; Lampa.Controller.toggle('rezka'); }
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
                onBack: function() { isModalOpen = false; Lampa.Controller.toggle('rezka'); }
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
                    if (res.success) comp.loadData();
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
                    if (res.success) comp.loadData(); 
                },
                error: function() { Lampa.Loading.stop(); Lampa.Noty.show('Ошибка сети'); isModalOpen = false; Lampa.Controller.toggle('rezka'); }
            });
        };

        comp.action = function(action, item) {
            var match = item.url.match(/\/(\d+)/);
            var postId = match ? match[1] : null;
            
            if (!postId) { Lampa.Noty.show('Не найден ID фильма'); return; }
            
            Lampa.Loading.start(function() {});
            
            var endpoint = action === 'delete' ? '/api/delete' : '/api/move';
            var data = action === 'delete' 
                ? { post_id: postId, category: category } 
                : { post_id: postId, from_category: category, to_category: action.replace('move_', '') };
            
            $.ajax({
                url: MY_API_URL + endpoint,
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(data),
                success: function(res) { 
                    Lampa.Loading.stop(); 
                    Lampa.Noty.show('Выполнено');
                    Lampa.Controller.toggle('rezka');
                    setTimeout(function() { comp.loadData(); }, 500);
                },
                error: function(err) { 
                    Lampa.Loading.stop(); 
                    console.error('[Rezka] Action Error:', err);
                    Lampa.Noty.show('Ошибка сети: ' + err.status); 
                    Lampa.Controller.toggle('rezka'); 
                }
            });
        };

        comp.reload = function() {
            Lampa.Activity.replace({ component: 'rezka_' + category, page: 1 });
        };

        // --- ГЛАВНЫЙ КОНТРОЛЛЕР ---
        comp.start = function() {
            Lampa.Controller.add('rezka', {
                toggle: function() {
                    // Используем scroll_wrapper как основной контейнер
                    Lampa.Controller.collectionSet(scroll_wrapper);
                    
                    // Если last_item потерялся или невидим, ищем первый доступный
                    if (!last_item || !$(last_item).parent().length || !$(last_item).is(':visible')) {
                        last_item = scroll_wrapper.find('.selector').first();
                    }
                    
                    Lampa.Controller.collectionFocus(last_item, scroll_wrapper);
                },
                up: function() {
                    // Если мы на кнопке сортировки -> открываем Head
                    if (last_item && $(last_item).hasClass('rezka-sort-btn')) {
                        Lampa.Controller.toggle('head');
                        return;
                    }
                    
                    // Стандартное поведение
                    if (Navigator.canmove('up')) {
                        Navigator.move('up');
                    } else {
                        // Если вверх идти некуда, прыгаем на кнопку Сортировки
                        var sortBtn = comp.html.find('.rezka-sort-btn');
                        if (sortBtn.length) {
                            Navigator.focus(sortBtn);
                        } else {
                            Lampa.Controller.toggle('head');
                        }
                    }
                },
                down: function() { 
                    if(Navigator.canmove('down')) Navigator.move('down'); 
                },
                left: function() { 
                    if(Navigator.canmove('left')) Navigator.move('left'); 
                    else Lampa.Controller.toggle('menu'); 
                },
                right: function() { 
                    if(Navigator.canmove('right')) Navigator.move('right'); 
                },
                back: function() { Lampa.Activity.backward(); }
            });

            Lampa.Controller.toggle('rezka');
        };

        comp.onResume = function() {
            // При возврате проверяем, жива ли обертка
            if (scroll_wrapper && scroll_wrapper.length) {
                Lampa.Controller.toggle('rezka');
            }
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
            
            var icon_watching = '<svg width="20px" height="20px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
            var icon_later    = '<svg width="20px" height="20px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';
            var icon_watched  = '<svg width="20px" height="20px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';

            [
                {a:'rezka_watching', i: icon_watching, t:'Смотрю'}, 
                {a:'rezka_later',    i: icon_later,    t:'Позже'}, 
                {a:'rezka_watched',  i: icon_watched,  t:'Архив'}
            ].forEach(function(item) {
                var mi = $('<li class="menu__item selector" data-action="' + item.a + '"><div class="menu__ico">' + item.i + '</div><div class="menu__text">' + item.t + '</div></li>');
                mi.on('hover:enter', function() { Lampa.Activity.push({ component: item.a, page: 1 }); });
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