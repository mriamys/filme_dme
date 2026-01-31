(function() {
    'use strict';

    var MY_API_URL = '__API_URL__';
    var TMDB_API_KEY = '__TMDB_KEY__';

    console.log('[Rezka] Plugin loading (Smart Navigation Edition + Memory)...');

    // --- ГЛОБАЛЬНОЕ ХРАНИЛИЩЕ ДЛЯ ЗАПОМИНАНИЯ ВЫБОРА ---
    var STORAGE_KEY = 'rezka_movie_choices';
    
    function getStoredChoices() {
        try {
            var data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : {};
        } catch(e) {
            console.error('[Rezka] Storage read error:', e);
            return {};
        }
    }
    
    function saveChoice(rezkaUrl, tmdbId, mediaType) {
        try {
            var choices = getStoredChoices();
            choices[rezkaUrl] = { tmdb_id: tmdbId, media_type: mediaType, timestamp: Date.now() };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(choices));
            console.log('[Rezka] ✅ Saved choice:', rezkaUrl, '→', tmdbId);
        } catch(e) {
            console.error('[Rezka] Storage write error:', e);
        }
    }
    
    function getChoice(rezkaUrl) {
        var choices = getStoredChoices();
        return choices[rezkaUrl] || null;
    }

    function RezkaCategory(category) {
        var comp = {};
        comp.html = $('<div class="category-items"></div>');
        var scroll_wrapper = null;
        var last_item = null;
        var all_items = []; 
        var current_sort = 'added'; 
        var isModalOpen = false;

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

            var style = $('<style>' +
                '.rezka-scroll-wrapper::-webkit-scrollbar { width: 0px; background: transparent; }' +
                '.rezka-scroll-wrapper { -ms-overflow-style: none; scrollbar-width: none; }' +
                '.rezka-sort-btn { transition: all 0.2s; border: 2px solid transparent; }' +
                '.rezka-sort-btn.focus { background-color: #ffffff !important; color: #000000 !important; border-color: #ffffff !important; transform: scale(1.1); box-shadow: 0 0 20px rgba(255,255,255,0.7); z-index: 100; }' +
                '.rezka-card { transition: transform 0.2s, box-shadow 0.2s, border 0.2s; border: 2px solid transparent; }' +
                '.rezka-card.focus { transform: scale(1.1) !important; border: 2px solid #fff !important; box-shadow: 0 10px 30px rgba(0,0,0,0.8) !important; z-index: 50 !important; position: relative; }' +
                '@media screen and (min-width: 1024px) { .rezka-grid { grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)) !important; } }' +
                '</style>');
            comp.html.append(style);

            scroll_wrapper = $('<div class="rezka-scroll-wrapper"></div>');
            scroll_wrapper.css({
                'overflow-y': 'auto',
                'overflow-x': 'hidden',
                'height': '100%',
                'width': '100%',
                'position': 'relative',
                'display': 'flex',
                'flex-direction': 'column',
                'outline': 'none'
            });

            var header = comp.buildHeader();
            scroll_wrapper.append(header);

            var grid = $('<div class="rezka-grid"></div>');
            grid.css({
                'display': 'grid',
                'grid-template-columns': 'repeat(auto-fill, minmax(140px, 1fr))',
                'gap': '15px', 
                'padding': '15px 20px 100px 20px'
            });

            all_items.forEach(function(item) {
                grid.append(comp.card(item));
            });

            scroll_wrapper.append(grid);
            comp.html.append(scroll_wrapper);

            comp.start();

            setTimeout(function() {
                var firstMovie = grid.find('.selector').first();
                var sortBtn = comp.html.find('.rezka-sort-btn');
                
                if (firstMovie.length) {
                    last_item = firstMovie;
                } else if (sortBtn.length) {
                    last_item = sortBtn;
                }
                
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

            card.on('hover:focus', function() {
                last_item = $(this);
                $(this).addClass('focus');

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
                comp.search(titleRuClean, titleEn, year, mediaType, item.url);
            });

            card.on('hover:long', function() {
                comp.menu(item);
            });

            return card;
        };

        // --- ПОИСК С ПАМЯТЬЮ ---
        comp.search = function(titleRu, titleEn, year, mediaType, rezkaUrl) {
            // Проверяем, есть ли сохраненный выбор
            var savedChoice = rezkaUrl ? getChoice(rezkaUrl) : null;
            
            if (savedChoice) {
                console.log('[Rezka] 🎯 Found saved choice:', savedChoice);
                comp.openCard(savedChoice.tmdb_id, savedChoice.media_type);
                return;
            }
            
            Lampa.Loading.start(function() {});
            var allResults = [];
            var seenIds = {};
            var queries = [];
            
            if (arguments.length === 1 && typeof titleRu === 'string') {
                queries.push(titleRu);
                mediaType = 'multi'; 
                year = '';
                rezkaUrl = null;
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
                    
                    if (exactMatch) {
                        var mt = mediaType === 'multi' ? exactMatch.media_type : mediaType;
                        if (rezkaUrl) saveChoice(rezkaUrl, exactMatch.id, mt);
                        comp.openCard(exactMatch.id, mt);
                    } else if (allResults.length === 1) {
                        var mt = mediaType === 'multi' ? allResults[0].media_type : mediaType;
                        if (rezkaUrl) saveChoice(rezkaUrl, allResults[0].id, mt);
                        comp.openCard(allResults[0].id, mt);
                    } else {
                        comp.showSelection(allResults, mediaType, rezkaUrl);
                    }
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

        comp.showSelection = function(results, mediaType, rezkaUrl) {
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
                    
                    // СОХРАНЯЕМ ВЫБОР
                    if (rezkaUrl) {
                        saveChoice(rezkaUrl, s.tmdb_id, s.media_type);
                    }
                    
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
            
            // Проверяем, есть ли сохраненный выбор
            var savedChoice = getChoice(item.url);
            if (savedChoice) {
                items.push({ title: '🔄 Сменить выбор фильма', value: 'change_choice' });
            }

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
                        Lampa.Controller.toggle('rezka');
                    } else if (sel.value === 'change_choice') {
                        // Удаляем сохраненный выбор и запускаем поиск заново
                        comp.forgetChoice(item.url);
                        var rawTitle = item.title || '';
                        var yearMatch = rawTitle.match(/\((\d{4})\)/);
                        var year = yearMatch ? yearMatch[1] : '';
                        var titleNoYear = rawTitle.replace(/\s*\(\d{4}\)/, '').trim();
                        var titleRu = titleNoYear.split('/')[0].trim();
                        var titleEn = (titleNoYear.split('/')[1] || '').trim();
                        var titleRuClean = titleRu.split(':')[0].trim();
                        var isTv = /\/series\/|\/cartoons\//.test(item.url || '');
                        var mediaType = isTv ? 'tv' : 'movie';
                        comp.search(titleRuClean, titleEn, year, mediaType, item.url);
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

        comp.forgetChoice = function(rezkaUrl) {
            try {
                var choices = getStoredChoices();
                if (choices[rezkaUrl]) {
                    delete choices[rezkaUrl];
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(choices));
                    console.log('[Rezka] 🗑️ Forgotten choice for:', rezkaUrl);
                    Lampa.Noty.show('Выбор сброшен');
                }
            } catch(e) {
                console.error('[Rezka] Error forgetting choice:', e);
            }
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
                    Lampa.Controller.collectionSet(comp.html);
                    if (!last_item || !$(last_item).parent().length || !$(last_item).is(':visible')) {
                        last_item = comp.html.find('.selector').first();
                    }
                    Lampa.Controller.collectionFocus(last_item, comp.html);
                },
                up: function() {
                    if (last_item && $(last_item).hasClass('rezka-sort-btn')) {
                        Lampa.Controller.toggle('head');
                        return;
                    }

                    var cards = comp.html.find('.rezka-card');
                    if (cards.length === 0) {
                        Lampa.Controller.toggle('head');
                        return;
                    }

                    var firstCardTop = cards.first().offset().top;
                    var currentCardTop = $(last_item).offset().top;
                    var isFirstRow = Math.abs(currentCardTop - firstCardTop) < 20;

                    if (isFirstRow) {
                        var sortBtn = comp.html.find('.rezka-sort-btn');
                        if (sortBtn.length) {
                            Lampa.Controller.collectionFocus(sortBtn, comp.html);
                        } else {
                            Lampa.Controller.toggle('head');
                        }
                    } else {
                        if (Navigator.canmove('up')) {
                            Navigator.move('up');
                        } else {
                            var sortBtnFallback = comp.html.find('.rezka-sort-btn');
                            if (sortBtnFallback.length) {
                                Lampa.Controller.collectionFocus(sortBtnFallback, comp.html);
                            } else {
                                Lampa.Controller.toggle('head');
                            }
                        }
                    }
                },
                down: function() { if(Navigator.canmove('down')) Navigator.move('down'); },
                left: function() { if(Navigator.canmove('left')) Navigator.move('left'); else Lampa.Controller.toggle('menu'); },
                right: function() { if(Navigator.canmove('right')) Navigator.move('right'); },
                back: function() { Lampa.Activity.backward(); }
            });

            Lampa.Controller.toggle('rezka');
        };

        // --- КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: ВОССТАНОВЛЕНИЕ ПОСЛЕ ВОЗВРАТА ИЗ МЕНЮ ---
        comp.resume = function() {
            console.log('[Rezka] ✅ RESUME called');
            
            setTimeout(function() {
                if (!comp.html || !comp.html.length) {
                    console.log('[Rezka] ❌ HTML not found');
                    return;
                }

                var target = null;
                
                if (last_item && $(last_item).length && $(last_item).is(':visible') && $(last_item).parent().length) {
                    target = last_item;
                    console.log('[Rezka] ✓ Using last_item');
                } else {
                    target = comp.html.find('.rezka-card.selector').first();
                    if (!target.length) {
                        target = comp.html.find('.rezka-sort-btn').first();
                    }
                    console.log('[Rezka] ✓ Using fallback');
                }

                if (target && target.length) {
                    Lampa.Controller.collectionSet(comp.html);
                    Lampa.Controller.collectionFocus(target, comp.html);
                    Lampa.Controller.toggle('rezka');
                    
                    last_item = target;
                    console.log('[Rezka] ✅ Control restored');
                } else {
                    console.log('[Rezka] ❌ No valid target found');
                }
            }, 100);
        };

        comp.pause = function() {
            console.log('[Rezka] Paused');
        };

        comp.destroy = function() {
            console.log('[Rezka] Destroyed');
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
                
                c.activity_resume = function() { 
                    if (c.resume) c.resume(); 
                };
                
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
                console.log('[Rezka] Activity active:', e.component);
                setTimeout(function() { 
                    Lampa.Controller.toggle('rezka'); 
                }, 50);
            }
        });
    }

    if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function(e) { if (e.type === 'ready') init(); });
    }
})();
