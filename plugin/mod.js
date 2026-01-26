(function() {
    'use strict';
    
    var API_URL = 'http://filme.64.188.67.85.sslip.io:8080';
    var TMDB_KEY = '4ef0d7355d9ffb5151e987764708ce96';
    
    console.log('[REZKA] Plugin loading...');
    
    function RezkaComponent(object) {
        var component = this;
        this.html = $('<div class="items items--lines"></div>');
        this.loading = false;
        
        this.create = function() {
            console.log('[REZKA] Creating component');
            this.html.empty();
            
            var loader = $('<div class="empty__descr">Загрузка...</div>');
            this.html.append(loader);
            
            var xhr = new XMLHttpRequest();
            xhr.open('GET', API_URL + '/api/watching', true);
            xhr.timeout = 15000;
            
            xhr.onload = function() {
                try {
                    loader.remove();
                    if (xhr.status === 200) {
                        var items = JSON.parse(xhr.responseText);
                        console.log('[REZKA] Loaded:', items.length, 'items');
                        if (items && items.length > 0) {
                            component.renderItems(items);
                        } else {
                            component.html.append('<div class="empty__descr">Список пуст</div>');
                        }
                        Lampa.Controller.toggle('content');
                    } else {
                        component.html.append('<div class="empty__descr">Ошибка: ' + xhr.status + '</div>');
                    }
                } catch(e) {
                    console.error('[REZKA] Error:', e);
                    component.html.append('<div class="empty__descr">Ошибка загрузки</div>');
                }
            };
            
            xhr.onerror = function() {
                console.error('[REZKA] Network error');
                loader.text('Ошибка сети');
            };
            
            xhr.ontimeout = function() {
                console.error('[REZKA] Timeout');
                loader.text('Превышено время ожидания');
            };
            
            xhr.send();
            
            return this.html;
        };
        
        this.renderItems = function(items) {
            console.log('[REZKA] Rendering', items.length, 'cards');
            
            var grid = $('<div class="rezka-grid"></div>');
            grid.css({
                'display': 'grid',
                'grid-template-columns': 'repeat(auto-fill, minmax(150px, 1fr))',
                'gap': '20px',
                'padding': '20px',
                'width': '100%'
            });
            
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                var card = component.createCard(item);
                grid.append(card);
            }
            
            this.html.append(grid);
        };
        
        this.createCard = function(item) {
            var title = item.title || '';
            var poster = item.poster ? API_URL + '/api/img?url=' + encodeURIComponent(item.poster) : '';
            
            // Парсинг названия
            var yearMatch = title.match(/\((\d{4})\)/);
            var year = yearMatch ? yearMatch[1] : '';
            var titleClean = title.replace(/\s*\(\d{4}\)/, '').trim();
            var parts = titleClean.split('/');
            var titleRu = parts[0].trim();
            var titleEn = parts[1] ? parts[1].trim() : '';
            
            // Определение типа
            var isTV = /\/series\/|\/cartoons\//.test(item.url || '');
            var mediaType = isTV ? 'tv' : 'movie';
            
            // Создание карточки
            var card = $('<div class="rezka-card selector"></div>');
            card.css({
                'position': 'relative',
                'cursor': 'pointer',
                'border-radius': '10px',
                'overflow': 'hidden',
                'background-color': '#1a1a1a'
            });
            
            // Постер
            var posterDiv = $('<div></div>');
            posterDiv.css({
                'width': '100%',
                'padding-bottom': '150%',
                'position': 'relative',
                'background-image': poster ? 'url(' + poster + ')' : 'none',
                'background-color': '#2a2a2a',
                'background-size': 'cover',
                'background-position': 'center'
            });
            
            // Статус
            if (item.status) {
                var badge = $('<div></div>');
                badge.text(item.status);
                badge.css({
                    'position': 'absolute',
                    'bottom': '0',
                    'left': '0',
                    'right': '0',
                    'padding': '5px',
                    'background': 'rgba(0,0,0,0.9)',
                    'color': '#fff',
                    'font-size': '11px',
                    'text-align': 'center'
                });
                posterDiv.append(badge);
            }
            
            card.append(posterDiv);
            
            // Название
            var titleDiv = $('<div></div>');
            titleDiv.text(titleRu);
            titleDiv.css({
                'padding': '10px',
                'font-size': '13px',
                'color': '#fff',
                'text-align': 'center',
                'min-height': '50px'
            });
            card.append(titleDiv);
            
            // Обработчик клика
            var clickHandler = function() {
                console.log('[REZKA] Click:', titleRu);
                component.openCard(titleRu, titleEn, year, mediaType);
            };
            
            card.on('click', clickHandler);
            card.on('hover:enter', clickHandler);
            
            return card;
        };
        
        this.openCard = function(titleRu, titleEn, year, mediaType) {
            console.log('[REZKA] Opening:', titleRu);
            Lampa.Loading.start(function() {});
            
            var searchUrl = 'https://api.themoviedb.org/3/search/' + mediaType + 
                          '?api_key=' + TMDB_KEY + 
                          '&language=ru-RU&query=' + encodeURIComponent(titleRu);
            
            if (year) {
                searchUrl += (mediaType === 'tv' ? '&first_air_date_year=' : '&year=') + year;
            }
            
            var xhr = new XMLHttpRequest();
            xhr.open('GET', searchUrl, true);
            
            xhr.onload = function() {
                Lampa.Loading.stop();
                try {
                    if (xhr.status === 200) {
                        var data = JSON.parse(xhr.responseText);
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
                    }
                } catch(e) {
                    console.error('[REZKA] TMDB error:', e);
                    Lampa.Noty.show('Ошибка поиска');
                }
            };
            
            xhr.onerror = function() {
                Lampa.Loading.stop();
                Lampa.Noty.show('Ошибка подключения');
            };
            
            xhr.send();
        };
        
        this.start = function() {
            console.log('[REZKA] Start');
            Lampa.Controller.toggle('content');
        };
        
        this.pause = function() {};
        this.stop = function() {};
        this.destroy = function() {
            this.html.remove();
        };
        this.render = function() {
            return this.html;
        };
        
        return this;
    }
    
    // Регистрация
    function init() {
        console.log('[REZKA] Init called');
        
        if (!window.Lampa) {
            console.error('[REZKA] Lampa not found!');
            return;
        }
        
        // Регистрируем компонент
        Lampa.Component.add('my_rezka', RezkaComponent);
        console.log('[REZKA] Component registered');
        
        // Добавляем в меню
        setTimeout(function() {
            if ($('[data-action="my_rezka_open"]').length === 0) {
                console.log('[REZKA] Adding menu item');
                var menu = $('.menu .menu__list').eq(0);
                if (menu.length) {
                    menu.append(
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
                    
                    // Обработчик клика
                    $('body').on('click', '[data-action="my_rezka_open"]', function(e) {
                        console.log('[REZKA] Menu clicked');
                        e.preventDefault();
                        e.stopPropagation();
                        Lampa.Activity.push({
                            component: 'my_rezka',
                            page: 1
                        });
                    });
                    
                    // Для пульта ТВ
                    $('body').on('hover:enter', '[data-action="my_rezka_open"]', function(e) {
                        console.log('[REZKA] Menu enter');
                        e.preventDefault();
                        e.stopPropagation();
                        Lampa.Activity.push({
                            component: 'my_rezka',
                            page: 1
                        });
                    });
                    
                    console.log('[REZKA] Menu item added');
                }
            }
        }, 1000);
    }
    
    // Запуск при готовности Lampa
    if (window.Lampa) {
        if (Lampa.Listener) {
            Lampa.Listener.follow('app', function(e) {
                if (e.type === 'ready') {
                    console.log('[REZKA] App ready');
                    init();
                }
            });
        } else {
            setTimeout(init, 2000);
        }
    } else {
        console.error('[REZKA] Lampa not available');
    }
    
    console.log('[REZKA] Plugin loaded');
})();
