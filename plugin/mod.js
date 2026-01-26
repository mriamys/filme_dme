(function() {
    'use strict';
    
    var MY_API_URL = 'http://filme.64.188.67.85.sslip.io:8080';
    var TMDB_API_KEY = '4ef0d7355d9ffb5151e987764708ce96';
    
    console.log('[Rezka] Plugin loading...');
    
    // ========================================
    // Компонент для каждой категории
    // ========================================
    function RezkaCategory(category) {
        var comp = {};
        comp.html = $('<div class="rezka-category"></div>');
        var scroll = null;
        var cards = [];
        var items_data = [];
        var isModalOpen = false;
        
        var endpoints = {
            'watching': '/api/watching',
            'later': '/api/later',
            'watched': '/api/watched'
        };
        
        comp.create = function() {
            console.log('[Rezka] Creating category:', category);
            
            var loader = $('<div class="broadcast__text">Загрузка...</div>');
            comp.html.append(loader);
            
            $.ajax({
                url: MY_API_URL + endpoints[category],
                method: 'GET',
                dataType: 'json',
                timeout: 15000,
                success: function(items) {
                    loader.remove();
                    items_data = items;
                    
                    if (items && items.length > 0) {
                        console.log('[Rezka] Loaded:', items.length, 'items');
                        comp.renderItems(items);
                    } else {
                        comp.html.append('<div class="broadcast__text">Список пуст</div>');
                    }
                    
                    Lampa.Controller.enable('content');
                },
                error: function(err) {
                    console.error('[Rezka] Error:', err);
                    loader.remove();
                    comp.html.append('<div class="broadcast__text">Ошибка загрузки</div>');
                }
            });
            
            return comp.html;
        };
        
        comp.renderItems = function(items) {
            console.log('[Rezka] Rendering', items.length, 'cards');
            
            // Создаем scroll
            scroll = new Lampa.Scroll({
                horizontal: false,
                step: 250
            });
            
            // Grid с карточками
            var grid = $('<div class="rezka-grid"></div>');
            grid.css({
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                gap: '20px',
                padding: '20px',
                width: '100%',
                boxSizing: 'border-box'
            });
            
            items.forEach(function(item) {
                var card = comp.createCard(item);
                cards.push(card);
                grid.append(card);
            });
            
            scroll.append(grid);
            comp.html.append(scroll.render());
            
            comp.start();
        };
        
        comp.createCard = function(item) {
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
            
            // Карточка
            var card = $('<div class="rezka-card selector"></div>');
            card.css({
                position: 'relative',
                cursor: 'pointer',
                borderRadius: '10px',
                overflow: 'hidden',
                transition: 'transform 0.2s, box-shadow 0.2s',
                backgroundColor: '#1a1a1a'
            });
            
            // Постер
            var posterDiv = $('<div class="rezka-poster"></div>');
            posterDiv.css({
                width: '100%',
                paddingBottom: '150%',
                position: 'relative',
                backgroundImage: posterUrl ? 'url(' + posterUrl + ')' : 'none',
                backgroundColor: '#2a2a2a',
                backgroundSize: 'cover',
                backgroundPosition: 'center'
            });
            
            // Статус
            if (item.status) {
                var statusBadge = $('<div></div>');
                statusBadge.text(item.status);
                statusBadge.css({
                    position: 'absolute',
                    bottom: '0',
                    left: '0',
                    right: '0',
                    padding: '5px 8px',
                    background: 'linear-gradient(to top, rgba(0,0,0,0.95), rgba(0,0,0,0.7))',
                    color: '#fff',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    zIndex: '2'
                });
                posterDiv.append(statusBadge);
            }
            
            card.append(posterDiv);
            
            // Название
            var titleDiv = $('<div></div>');
            titleDiv.text(titleRu);
            titleDiv.css({
                padding: '10px 8px',
                fontSize: '13px',
                lineHeight: '1.3',
                color: '#fff',
                textAlign: 'center',
                minHeight: '50px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden'
            });
            
            card.append(titleDiv);
            
            // Долгое нажатие - правильная реализация
            var longPressTimer = null;
            var longPressActivated = false;
            var currentCard = card;
            
            // Hover эффекты
            card.on('hover:focus', function() {
                // Убираем подсветку со всех карточек
                $('.rezka-card').css({
                    'transform': 'scale(1)',
                    'box-shadow': 'none',
                    'z-index': '1'
                });
                
                // Подсвечиваем текущую
                card.css({
                    'transform': 'scale(1.05)',
                    'box-shadow': '0 8px 20px rgba(255,255,255,0.3)',
                    'z-index': '10'
                });
                
                // Сброс флага
                longPressActivated = false;
                
                // Запускаем таймер долгого нажатия
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                }
                
                longPressTimer = setTimeout(function() {
                    if (!longPressActivated && !isModalOpen) {
                        longPressActivated = true;
                        console.log('[Rezka] Long press activated');
                        comp.showManageModal(item);
                    }
                }, 800); // 800ms для активации меню
            });
            
            card.on('hover:blur', function() {
                // Убираем подсветку
                card.css({
                    'transform': 'scale(1)',
                    'box-shadow': 'none',
                    'z-index': '1'
                });
                
                // Очищаем таймер
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            });
            
            // Обычный клик
            card.on('hover:enter', function(e) {
                if (e) e.preventDefault();
                
                // Очищаем таймер
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
                
                // Если было долгое нажатие - игнорируем клик
                if (longPressActivated) {
                    longPressActivated = false;
                    return;
                }
                
                if (isModalOpen) return;
                
                console.log('[Rezka] Opening:', titleRu);
                comp.openCard(titleRuClean, titleEn, year, mediaType);
            });
            
            return card;
        };
        
        // Открытие карточки в TMDB
        comp.openCard = function(titleRu, titleEn, year, mediaType) {
            Lampa.Loading.start(function() {});
            
            var searchUrl = 'https://api.themoviedb.org/3/search/' + mediaType + 
                          '?api_key=' + TMDB_API_KEY + 
                          '&language=ru-RU&query=' + encodeURIComponent(titleRu);
            
            if (year) {
                searchUrl += (mediaType === 'tv' ? '&first_air_date_year=' : '&year=') + year;
            }
            
            $.ajax({
                url: searchUrl,
                timeout: 10000,
                success: function(data) {
                    Lampa.Loading.stop();
                    
                    if (data.results && data.results.length > 0) {
                        var tmdbId = data.results[0].id;
                        console.log('[Rezka] Found TMDB ID:', tmdbId);
                        
                        Lampa.Activity.push({
                            url: '',
                            component: 'full',
                            id: tmdbId,
                            method: mediaType,
                            source: 'tmdb',
                            card: {
                                id: tmdbId,
                                source: 'tmdb'
                            }
                        });
                    } else {
                        Lampa.Noty.show('Не найдено в TMDB');
                    }
                },
                error: function() {
                    Lampa.Loading.stop();
                    Lampa.Noty.show('Ошибка поиска');
                }
            });
        };
        
        // Меню управления фильмом
        comp.showManageModal = function(item) {
            if (isModalOpen) return;
            isModalOpen = true;
            
            var isTv = /\/series\/|\/cartoons\//.test(item.url || '');
            var items = [];
            
            // Опция для сериалов
            if (isTv) {
                items.push({ title: '📺 Выставить серии', value: 'episodes' });
            }
            
            // Перемещение
            if (category !== 'watching') {
                items.push({ title: '▶ В Смотрю', value: 'move_watching' });
            }
            if (category !== 'later') {
                items.push({ title: '⏳ В Позже', value: 'move_later' });
            }
            if (category !== 'watched') {
                items.push({ title: '✅ В Архив', value: 'move_watched' });
            }
            
            items.push({ title: '🗑️ Удалить', value: 'delete' });
            
            Lampa.Select.show({
                title: 'Управление',
                items: items,
                onSelect: function(selected) {
                    isModalOpen = false;
                    
                    if (selected.value === 'episodes') {
                        comp.showEpisodesModal(item);
                    } else {
                        comp.handleAction(selected.value, item);
                    }
                },
                onBack: function() {
                    isModalOpen = false;
                }
            });
        };
        
        // Меню выставления серий
        comp.showEpisodesModal = function(item) {
            if (isModalOpen) return;
            isModalOpen = true;
            
            Lampa.Loading.start(function() {});
            
            $.ajax({
                url: MY_API_URL + '/api/details',
                data: { url: item.url },
                success: function(details) {
                    Lampa.Loading.stop();
                    
                    if (!details || !details.seasons) {
                        Lampa.Noty.show('Ошибка загрузки серий');
                        isModalOpen = false;
                        return;
                    }
                    
                    var seasons = Object.keys(details.seasons).sort(function(a, b) {
                        return parseInt(a) - parseInt(b);
                    });
                    
                    var seasonItems = seasons.map(function(s) {
                        var eps = details.seasons[s];
                        var watched = eps.filter(function(e) { return e.watched; }).length;
                        return {
                            title: 'Сезон ' + s + ' (' + watched + '/' + eps.length + ')',
                            value: s,
                            episodes: eps
                        };
                    });
                    
                    Lampa.Select.show({
                        title: 'Выберите сезон',
                        items: seasonItems,
                        onSelect: function(sel) {
                            comp.showEpisodesList(item, sel.value, sel.episodes);
                        },
                        onBack: function() {
                            isModalOpen = false;
                        }
                    });
                },
                error: function() {
                    Lampa.Loading.stop();
                    Lampa.Noty.show('Ошибка связи');
                    isModalOpen = false;
                }
            });
        };
        
        comp.showEpisodesList = function(item, season, episodes) {
            var items = [
                { title: '✅ Отметить все', value: 'all', season: season }
            ];
            
            episodes.sort(function(a, b) {
                return parseInt(a.episode) - parseInt(b.episode);
            }).forEach(function(ep) {
                items.push({
                    title: (ep.watched ? '✅' : '▫️') + ' Серия ' + ep.episode,
                    value: ep.episode,
                    season: season,
                    watched: ep.watched
                });
            });
            
            Lampa.Select.show({
                title: 'Серии (Сезон ' + season + ')',
                items: items,
                onSelect: function(sel) {
                    if (sel.value === 'all') {
                        comp.markAllEpisodes(item, sel.season);
                    } else {
                        comp.markEpisode(item, sel.season, sel.value);
                    }
                },
                onBack: function() {
                    isModalOpen = false;
                }
            });
        };
        
        comp.markEpisode = function(item, season, episode) {
            Lampa.Loading.start(function() {});
            
            $.ajax({
                url: MY_API_URL + '/api/episode/mark',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({ url: item.url, season: season, episode: episode }),
                success: function(res) {
                    Lampa.Loading.stop();
                    Lampa.Noty.show(res.success ? '✅ Обновлено' : '❌ Ошибка');
                    isModalOpen = false;
                    if (res.success) comp.reload();
                },
                error: function() {
                    Lampa.Loading.stop();
                    Lampa.Noty.show('❌ Ошибка связи');
                    isModalOpen = false;
                }
            });
        };
        
        comp.markAllEpisodes = function(item, season) {
            Lampa.Loading.start(function() {});
            
            $.ajax({
                url: MY_API_URL + '/api/episode/mark-range',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({ url: item.url, season: season, from_episode: 1, to_episode: 999 }),
                success: function(res) {
                    Lampa.Loading.stop();
                    Lampa.Noty.show(res.success ? '✅ Отмечено: ' + res.marked : '❌ Ошибка');
                    isModalOpen = false;
                    if (res.success) comp.reload();
                },
                error: function() {
                    Lampa.Loading.stop();
                    Lampa.Noty.show('❌ Ошибка связи');
                    isModalOpen = false;
                }
            });
        };
        
        comp.handleAction = function(action, item) {
            var postId = item.url.match(/\/(\d+)-/);
            postId = postId ? postId[1] : null;
            
            if (!postId) {
                Lampa.Noty.show('❌ Ошибка ID');
                return;
            }
            
            Lampa.Loading.start(function() {});
            
            if (action === 'delete') {
                $.ajax({
                    url: MY_API_URL + '/api/delete',
                    method: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({ post_id: postId, category: category }),
                    success: function(res) {
                        Lampa.Loading.stop();
                        Lampa.Noty.show(res.success ? '✅ Удалено' : '❌ Ошибка');
                        if (res.success) comp.reload();
                    },
                    error: function() {
                        Lampa.Loading.stop();
                        Lampa.Noty.show('❌ Ошибка связи');
                    }
                });
            } else if (action.startsWith('move_')) {
                var toCategory = action.replace('move_', '');
                $.ajax({
                    url: MY_API_URL + '/api/move',
                    method: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({ post_id: postId, from_category: category, to_category: toCategory }),
                    success: function(res) {
                        Lampa.Loading.stop();
                        Lampa.Noty.show(res.success ? '✅ Перемещено' : '❌ Ошибка');
                        if (res.success) comp.reload();
                    },
                    error: function() {
                        Lampa.Loading.stop();
                        Lampa.Noty.show('❌ Ошибка связи');
                    }
                });
            }
        };
        
        comp.reload = function() {
            Lampa.Activity.replace({
                component: 'rezka_' + category,
                page: 1
            });
        };
        
        comp.start = function() {
            console.log('[Rezka] Start controller');
            
            Lampa.Controller.add('content', {
                toggle: function() {
                    Lampa.Controller.collectionSet(comp.html);
                    if (cards.length > 0) {
                        Lampa.Controller.collectionFocus(cards[0], comp.html);
                    }
                },
                left: function() {
                    if (Navigator.canmove('left')) {
                        Navigator.move('left');
                    } else {
                        Lampa.Controller.toggle('menu');
                    }
                },
                right: function() {
                    Navigator.move('right');
                },
                up: function() {
                    if (Navigator.canmove('up')) {
                        Navigator.move('up');
                        // Скроллим вверх
                        if (scroll) scroll.minus();
                    } else {
                        Lampa.Controller.toggle('head');
                    }
                },
                down: function() {
                    if (Navigator.canmove('down')) {
                        Navigator.move('down');
                        // Скроллим вниз
                        if (scroll) scroll.plus();
                    }
                },
                back: function() {
                    Lampa.Activity.backward();
                }
            });
            
            Lampa.Controller.toggle('content');
        };
        
        comp.pause = function() {
            Lampa.Controller.clear();
        };
        
        comp.stop = function() {};
        
        comp.destroy = function() {
            Lampa.Controller.clear();
            if (scroll) scroll.destroy();
            comp.html.remove();
            cards = [];
        };
        
        comp.render = function() {
            return comp.html;
        };
        
        return comp;
    }
    
    // Регистрация компонентов
    function init() {
        console.log('[Rezka] Init');
        
        if (!window.Lampa) {
            console.error('[Rezka] Lampa not found!');
            return;
        }
        
        // Регистрируем три компонента
        Lampa.Component.add('rezka_watching', function(obj) {
            return RezkaCategory('watching');
        });
        
        Lampa.Component.add('rezka_later', function(obj) {
            return RezkaCategory('later');
        });
        
        Lampa.Component.add('rezka_watched', function(obj) {
            return RezkaCategory('watched');
        });
        
        console.log('[Rezka] Components registered');
        
        // Добавляем три пункта в меню
        setTimeout(function() {
            var menu = $('.menu .menu__list').eq(0);
            
            if ($('[data-action="rezka_watching"]').length === 0) {
                var items = [
                    { action: 'rezka_watching', component: 'rezka_watching', icon: '▶', text: 'Смотрю' },
                    { action: 'rezka_later', component: 'rezka_later', icon: '⏳', text: 'Позже' },
                    { action: 'rezka_watched', component: 'rezka_watched', icon: '✅', text: 'Архив' }
                ];
                
                items.forEach(function(item) {
                    var menuItem = $(
                        '<li class="menu__item selector" data-action="' + item.action + '">' +
                        '<div class="menu__ico">' + item.icon + '</div>' +
                        '<div class="menu__text">' + item.text + '</div>' +
                        '</li>'
                    );
                    
                    menuItem.on('hover:enter', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        Lampa.Activity.push({
                            component: item.component,
                            page: 1
                        });
                    });
                    
                    menu.append(menuItem);
                });
                
                console.log('[Rezka] Menu items added');
            }
        }, 1000);
    }
    
    // Запуск
    if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function(e) {
            if (e.type === 'ready') {
                console.log('[Rezka] App ready');
                init();
            }
        });
    }
    
    console.log('[Rezka] Plugin loaded');
})();
