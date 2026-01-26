(function() {
    'use strict';
    
    var MY_API_URL = 'http://filme.64.188.67.85.sslip.io:8080';
    var TMDB_API_KEY = '4ef0d7355d9ffb5151e987764708ce96';
    
    console.log('[Rezka] Plugin loading...');
    
    function MyRezkaComponent(object) {
        var comp = {};
        comp.html = $('<div></div>');
        var scroll = null;
        var cards = [];
        
        comp.create = function() {
            console.log('[Rezka] Creating component');
            
            var loader = $('<div class="broadcast__text">Загрузка...</div>');
            comp.html.append(loader);
            
            $.ajax({
                url: MY_API_URL + '/api/watching',
                method: 'GET',
                dataType: 'json',
                timeout: 15000,
                success: function(items) {
                    loader.remove();
                    
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
            
            // Создаем grid с твоим стилем
            var grid = $('<div class="rezka-grid"></div>');
            grid.css({
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                gap: '20px',
                padding: '20px',
                width: '100%'
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
            
            var posterUrl = '';
            if (item.poster) {
                posterUrl = MY_API_URL + '/api/img?url=' + encodeURIComponent(item.poster);
            }
            
            // Карточка с твоим стилем
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
                var statusBadge = $('<div class="rezka-status"></div>');
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
            var titleDiv = $('<div class="rezka-title"></div>');
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
            
            // Hover эффекты
            card.on('hover:focus', function() {
                card.css({
                    'transform': 'scale(1.05)',
                    'box-shadow': '0 8px 20px rgba(255,255,255,0.3)',
                    'z-index': '10'
                });
            });
            
            card.on('hover:blur', function() {
                card.css({
                    'transform': 'scale(1)',
                    'box-shadow': 'none',
                    'z-index': '1'
                });
            });
            
            // Клик
            card.on('hover:enter', function(e) {
                if (e) e.preventDefault();
                console.log('[Rezka] Opening:', titleRu);
                comp.openCard(titleRuClean, titleEn, year, mediaType);
            });
            
            return card;
        };
        
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
        
        comp.start = function() {
            console.log('[Rezka] Start - activating controller');
            
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
                    } else {
                        Lampa.Controller.toggle('head');
                    }
                },
                down: function() {
                    if (Navigator.canmove('down')) {
                        Navigator.move('down');
                    }
                },
                back: function() {
                    Lampa.Activity.backward();
                }
            });
            
            Lampa.Controller.toggle('content');
        };
        
        comp.pause = function() {
            console.log('[Rezka] Pause');
            Lampa.Controller.clear();
        };
        
        comp.stop = function() {
            console.log('[Rezka] Stop');
        };
        
        comp.destroy = function() {
            console.log('[Rezka] Destroy');
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
    
    // Регистрация
    function init() {
        console.log('[Rezka] Init called');
        
        if (!window.Lampa) {
            console.error('[Rezka] Lampa not found!');
            return;
        }
        
        Lampa.Component.add('my_rezka', MyRezkaComponent);
        console.log('[Rezka] Component registered');
        
        // Добавляем в меню
        setTimeout(function() {
            if ($('[data-action="my_rezka_open"]').length === 0) {
                var menuItem = $(
                    '<li class="menu__item selector" data-action="my_rezka_open">' +
                    '<div class="menu__ico">' +
                    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                    '<path d="M12 2L2 7L12 12L22 7L12 2Z"/>' +
                    '<path d="M2 17L12 22L22 17"/>' +
                    '<path d="M2 12L12 17L22 12"/>' +
                    '</svg>' +
                    '</div>' +
                    '<div class="menu__text">Rezka</div>' +
                    '</li>'
                );
                
                $('.menu .menu__list').eq(0).append(menuItem);
                
                menuItem.on('hover:enter', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[Rezka] Menu activated');
                    Lampa.Activity.push({
                        component: 'my_rezka',
                        page: 1
                    });
                });
                
                console.log('[Rezka] Menu item added');
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
