(function() {
    'use strict';
    
    var API_URL = 'http://filme.64.188.67.85.sslip.io:8080';
    var TMDB_KEY = '4ef0d7355d9ffb5151e987764708ce96';
    
    console.log('[REZKA] ===== PLUGIN LOADING =====');
    
    function RezkaComponent(object) {
        var component = this;
        var html = $('<div class="category category--scroll"></div>');
        var scroll = new Lampa.Scroll({ horizontal: false, step: 250 });
        var items = [];
        
        this.create = function() {
            console.log('[REZKA] CREATE called');
            
            try {
                var loader = $('<div class="broadcast__loader"><div></div><div></div><div></div></div>');
                scroll.append(loader);
                html.append(scroll.render());
                
                console.log('[REZKA] Fetching data...');
                
                $.ajax({
                    url: API_URL + '/api/watching',
                    timeout: 15000,
                    success: function(data) {
                        console.log('[REZKA] Data received:', data.length);
                        loader.remove();
                        component.build(data);
                    },
                    error: function(xhr, status, error) {
                        console.error('[REZKA] Ajax error:', status, error);
                        loader.remove();
                        var empty = $('<div class="empty"><div class="empty__text">Ошибка загрузки: ' + status + '</div></div>');
                        scroll.append(empty);
                    }
                });
                
            } catch(e) {
                console.error('[REZKA] CREATE error:', e);
            }
            
            return html;
        };
        
        this.build = function(data) {
            console.log('[REZKA] BUILD called with', data.length, 'items');
            
            try {
                scroll.clear();
                items = [];
                
                var cards = $('<div class="card-grid"></div>');
                cards.css({
                    'display': 'grid',
                    'grid-template-columns': 'repeat(auto-fill, minmax(150px, 1fr))',
                    'gap': '1.5em',
                    'padding': '1.5em'
                });
                
                data.forEach(function(item_data, index) {
                    var card = component.createCard(item_data, index);
                    items.push(card);
                    cards.append(card);
                });
                
                scroll.append(cards);
                
            } catch(e) {
                console.error('[REZKA] BUILD error:', e);
            }
        };
        
        this.createCard = function(data, index) {
            var title = data.title || '';
            var poster = data.poster ? API_URL + '/api/img?url=' + encodeURIComponent(data.poster) : '';
            
            // Парсинг
            var yearMatch = title.match(/\((\d{4})\)/);
            var year = yearMatch ? yearMatch[1] : '';
            var titleClean = title.replace(/\s*\(\d{4}\)/, '').trim();
            var parts = titleClean.split('/');
            var titleRu = parts[0].trim();
            
            var isTV = /\/series\/|\/cartoons\//.test(data.url || '');
            var mediaType = isTV ? 'tv' : 'movie';
            
            var card = $('<div class="card selector layer--visible layer--render"></div>');
            card.attr('data-index', index);
            
            var img = $('<div class="card__img"></div>');
            if (poster) {
                img.css('background-image', 'url(' + poster + ')');
            }
            card.append(img);
            
            if (data.status) {
                var badge = $('<div class="card__icon"><div>' + data.status + '</div></div>');
                card.append(badge);
            }
            
            var view = $('<div class="card__view"><div class="card__title">' + titleRu + '</div></div>');
            card.append(view);
            
            // Фокус эффекты
            card.on('hover:focus', function() {
                card.addClass('focus');
            });
            
            card.on('hover:blur', function() {
                card.removeClass('focus');
            });
            
            // Клик
            card.on('hover:enter', function(e) {
                e.preventDefault();
                e.stopPropagation();
                console.log('[REZKA] CARD CLICKED:', titleRu);
                component.openCard(titleRu, year, mediaType);
            });
            
            return card;
        };
        
        this.openCard = function(titleRu, year, mediaType) {
            console.log('[REZKA] OPENING CARD:', titleRu, year, mediaType);
            
            try {
                Lampa.Loading.start(function() {});
                
                var searchUrl = 'https://api.themoviedb.org/3/search/' + mediaType + 
                              '?api_key=' + TMDB_KEY + 
                              '&language=ru-RU&query=' + encodeURIComponent(titleRu);
                
                if (year) {
                    searchUrl += (mediaType === 'tv' ? '&first_air_date_year=' : '&year=') + year;
                }
                
                console.log('[REZKA] Searching TMDB:', searchUrl);
                
                $.ajax({
                    url: searchUrl,
                    timeout: 10000,
                    success: function(data) {
                        Lampa.Loading.stop();
                        
                        if (data.results && data.results.length > 0) {
                            var tmdbId = data.results[0].id;
                            console.log('[REZKA] Found TMDB ID:', tmdbId);
                            
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
                
            } catch(e) {
                console.error('[REZKA] OPEN CARD error:', e);
                Lampa.Loading.stop();
            }
        };
        
        this.start = function() {
            console.log('[REZKA] START called');
            Lampa.Controller.add('content', {
                toggle: function() {
                    Lampa.Controller.collectionSet(scroll.render());
                    Lampa.Controller.collectionFocus(false, scroll.render());
                },
                back: function() {
                    Lampa.Activity.backward();
                }
            });
            
            Lampa.Controller.toggle('content');
        };
        
        this.pause = function() {};
        this.stop = function() {};
        
        this.destroy = function() {
            console.log('[REZKA] DESTROY called');
            Lampa.Controller.clear();
            scroll.destroy();
            html.remove();
        };
        
        this.render = function() {
            return html;
        };
    }
    
    // Регистрация
    function init() {
        console.log('[REZKA] ===== INIT =====');
        
        try {
            Lampa.Component.add('my_rezka', RezkaComponent);
            console.log('[REZKA] Component registered');
            
            // Ждем загрузки меню
            setTimeout(function() {
                try {
                    var menuItem = $('<li class="menu__item selector" data-action="rezka_open"><div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7L12 12L22 7L12 2Z"/><path d="M2 17L12 22L22 17"/><path d="M2 12L12 17L22 12"/></svg></div><div class="menu__text">Rezka</div></li>');
                    
                    menuItem.on('hover:enter', function() {
                        console.log('[REZKA] Menu item clicked');
                        Lampa.Activity.push({
                            url: '',
                            component: 'my_rezka',
                            page: 1
                        });
                    });
                    
                    $('.menu .menu__list').eq(0).append(menuItem);
                    console.log('[REZKA] Menu item added');
                    
                } catch(e) {
                    console.error('[REZKA] Menu error:', e);
                }
            }, 2000);
            
            console.log('[REZKA] ===== INIT COMPLETE =====');
            
        } catch(e) {
            console.error('[REZKA] INIT ERROR:', e);
        }
    }
    
    // Запуск
    if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function(e) {
            if (e.type === 'ready') {
                console.log('[REZKA] ===== APP READY =====');
                init();
            }
        });
    } else {
        console.error('[REZKA] Lampa not available!');
    }
    
    console.log('[REZKA] ===== PLUGIN FILE LOADED =====');
})();
