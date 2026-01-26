(function() {
    'use strict';
    
    var API_URL = 'http://filme.64.188.67.85.sslip.io:8080';
    var TMDB_KEY = '4ef0d7355d9ffb5151e987764708ce96';
    
    console.log('[REZKA] Plugin loading...');
    
    function RezkaComponent(object) {
        var component = this;
        var html;
        var items_data = [];
        var scroll;
        var cards = [];
        
        this.create = function() {
            console.log('[REZKA] Creating component');
            
            html = $('<div class="items-line"></div>');
            
            var loader = $('<div class="broadcast__text">Загрузка...</div>');
            html.append(loader);
            
            $.ajax({
                url: API_URL + '/api/watching',
                method: 'GET',
                dataType: 'json',
                timeout: 15000,
                success: function(items) {
                    loader.remove();
                    
                    if (items && items.length > 0) {
                        console.log('[REZKA] Loaded:', items.length, 'items');
                        items_data = items;
                        component.build(items);
                    } else {
                        html.append('<div class="broadcast__text">Список пуст</div>');
                    }
                },
                error: function(err) {
                    console.error('[REZKA] Error:', err);
                    loader.remove();
                    html.append('<div class="broadcast__text">Ошибка загрузки</div>');
                }
            });
            
            return html;
        };
        
        this.build = function(items) {
            console.log('[REZKA] Building', items.length, 'cards');
            
            scroll = new Lampa.Scroll({
                horizontal: false,
                step: 250
            });
            
            var grid = $('<div class="items-line__list"></div>');
            
            items.forEach(function(item, index) {
                var card = component.card(item);
                cards.push(card);
                grid.append(card);
            });
            
            scroll.append(grid);
            html.append(scroll.render());
            
            component.start();
        };
        
        this.card = function(data) {
            var title = data.title || '';
            var poster = data.poster ? API_URL + '/api/img?url=' + encodeURIComponent(data.poster) : '';
            
            // Парсинг названия
            var yearMatch = title.match(/\((\d{4})\)/);
            var year = yearMatch ? yearMatch[1] : '';
            var titleClean = title.replace(/\s*\(\d{4}\)/, '').trim();
            var parts = titleClean.split('/');
            var titleRu = parts[0].trim();
            var titleEn = parts[1] ? parts[1].trim() : '';
            
            var isTV = /\/series\/|\/cartoons\//.test(data.url || '');
            var mediaType = isTV ? 'tv' : 'movie';
            
            // Создаем карточку
            var card = $('<div class="card selector"><div class="card__view"><div class="card__img"><img/></div><div class="card__title">' + titleRu + '</div></div></div>');
            
            // Устанавливаем постер
            var img = card.find('img');
            img.on('load', function() {
                card.addClass('card--loaded');
            }).on('error', function() {
                card.addClass('card--loaded');
            });
            
            if (poster) {
                img.attr('src', poster);
            }
            
            // Год
            if (year) {
                card.find('.card__title').append('<div class="card__year">' + year + '</div>');
            }
            
            // Статус
            if (data.status) {
                card.find('.card__view').append('<div class="card__age card__age--green">' + data.status + '</div>');
            }
            
            // Hover
            card.on('hover:focus', function() {
                card.addClass('focus');
            }).on('hover:blur', function() {
                card.removeClass('focus');
            });
            
            // Клик
            card.on('hover:enter', function() {
                console.log('[REZKA] Opening:', titleRu);
                component.open(titleRu, titleEn, year, mediaType);
            });
            
            return card;
        };
        
        this.open = function(titleRu, titleEn, year, mediaType) {
            Lampa.Loading.start(function() {});
            
            var searchUrl = 'https://api.themoviedb.org/3/search/' + mediaType + 
                          '?api_key=' + TMDB_KEY + 
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
        };
        
        this.start = function() {
            console.log('[REZKA] Start - activating controller');
            
            var _this = this;
            
            Lampa.Controller.add('content', {
                toggle: function() {
                    Lampa.Controller.collectionSet(html);
                    
                    if (cards.length > 0) {
                        Lampa.Controller.collectionFocus(cards[0], html);
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
        
        this.pause = function() {
            console.log('[REZKA] Pause');
            Lampa.Controller.clear();
        };
        
        this.stop = function() {
            console.log('[REZKA] Stop');
        };
        
        this.destroy = function() {
            console.log('[REZKA] Destroy');
            Lampa.Controller.clear();
            if (scroll) scroll.destroy();
            if (html) html.remove();
            cards = [];
        };
        
        this.render = function() {
            return html;
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
        
        Lampa.Component.add('my_rezka', RezkaComponent);
        console.log('[REZKA] Component registered');
        
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
                    console.log('[REZKA] Menu activated');
                    Lampa.Activity.push({
                        component: 'my_rezka',
                        page: 1
                    });
                });
                
                console.log('[REZKA] Menu item added');
            }
        }, 1000);
    }
    
    // Запуск
    if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function(e) {
            if (e.type === 'ready') {
                console.log('[REZKA] App ready');
                init();
            }
        });
    }
    
    console.log('[REZKA] Plugin loaded');
})();
