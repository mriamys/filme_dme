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
        var html = $('<div class="category-full"></div>');
        var scroll = null;
        var items_data = [];
        var isModalOpen = false;
        var last_item = null;
        
        var endpoints = {
            'watching': '/api/watching',
            'later': '/api/later',
            'watched': '/api/watched'
        };
        
        comp.create = function() {
            console.log('[Rezka] Creating category:', category);
            
            var loader = $('<div class="broadcast__text">Загрузка...</div>');
            html.append(loader);
            
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
                        comp.build(items);
                        comp.start();
                    } else {
                        html.append('<div class="broadcast__text">Список пуст</div>');
                        Lampa.Controller.enable('content');
                    }
                },
                error: function(err) {
                    console.error('[Rezka] Error:', err);
                    loader.remove();
                    html.append('<div class="broadcast__text">Ошибка загрузки</div>');
                }
            });
            
            return html;
        };
        
        comp.build = function(items) {
            console.log('[Rezka] Building', items.length, 'cards');
            
            // Используем Lampa.Scroll
            scroll = new Lampa.Scroll({
                horizontal: false,
                step: 250
            });
            
            var content = $('<div class="category-full__cards"></div>');
            
            items.forEach(function(item) {
                var card = comp.card(item);
                content.append(card);
            });
            
            scroll.append(content);
            html.append(scroll.render());
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
            
            // Используем стандартный шаблон карточки Lampa
            var card = Lampa.Template.get('card', {
                title: titleRu,
                release_year: year
            });
            
            // Устанавливаем постер
            var img = card.find('.card__img')[0];
            if (img && posterUrl) {
                img.onload = function() {
                    card.addClass('card--loaded');
                };
                img.onerror = function() {
                    card.addClass('card--loaded');
                };
                img.src = posterUrl;
            }
            
            // Статус
            if (item.status) {
                var info = card.find('.card__view');
                if (info.length) {
                    info.append('<div class="card__quality">' + item.status + '</div>');
                }
            }
            
            // Сохраняем данные в карточке
            card.data('item', item);
            card.data('title_ru', titleRuClean);
            card.data('title_en', titleEn);
            card.data('year', year);
            card.data('media_type', mediaType);
            
            // Обычный клик - открыть фильм
            card.on('hover:enter', function() {
                console.log('[Rezka] Opening:', titleRu);
                comp.open(titleRuClean, titleEn, year, mediaType);
            });
            
            // Focus/Blur для подсветки
            card.on('hover:focus', function() {
                last_item = item;
                card.addClass('focus');
            });
            
            card.on('hover:blur', function() {
                card.removeClass('focus');
            });
            
            return card;
        };
        
        comp.open = function(titleRu, titleEn, year, mediaType) {
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
        
        comp.contextMenu = function(item) {
            if (isModalOpen) return;
            isModalOpen = true;
            
            var isTv = /\/series\/|\/cartoons\//.test(item.url || '');
            var items = [];
            
            if (isTv) {
                items.push({ title: '📺 Выставить серии', value: 'episodes' });
            }
            
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
                        comp.showEpisodes(item);
                    } else {
                        comp.handleAction(selected.value, item);
                    }
                },
                onBack: function() {
                    isModalOpen = false;
                }
            });
        };
        
        comp.showEpisodes = function(item) {
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
                    season: season
                });
            });
            
            Lampa.Select.show({
                title: 'Серии (Сезон ' + season + ')',
                items: items,
                onSelect: function(sel) {
                    if (sel.value === 'all') {
                        comp.markAll(item, sel.season);
                    } else {
                        comp.markOne(item, sel.season, sel.value);
                    }
                },
                onBack: function() {
                    isModalOpen = false;
                }
            });
        };
        
        comp.markOne = function(item, season, episode) {
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
                    Lampa.Noty.show('❌ Ошибка');
                    isModalOpen = false;
                }
            });
        };
        
        comp.markAll = function(item, season) {
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
                    Lampa.Noty.show('❌ Ошибка');
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
                        Lampa.Noty.show('❌ Ошибка');
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
                        Lampa.Noty.show('❌ Ошибка');
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
            console.log('[Rezka] Start');
            
            var _this = this;
            
            Lampa.Controller.add('content', {
                toggle: function() {
                    Lampa.Controller.collectionSet(html);
                    Lampa.Controller.collectionFocus(false, html);
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
                back: function() {
                    Lampa.Activity.backward();
                }
            });
            
            // ВАЖНО: Добавляем обработчик кнопки Options/Menu
            Lampa.Controller.listener.follow('toggle', function(e) {
                if (e.name === 'content') {
                    // Переопределяем метод для кнопки меню
                    if (Lampa.Controller.enabled().name === 'content') {
                        // Кнопка Options (обычно это долгое нажатие OK или отдельная кнопка)
                        $(document).off('keydown.rezka_menu').on('keydown.rezka_menu', function(event) {
                            // Кнопка "Options" или "Menu" на пульте (код может отличаться)
                            // Обычно это коды: 93, 403, 457
                            if (event.keyCode === 93 || event.keyCode === 403 || event.keyCode === 457) {
                                event.preventDefault();
                                if (last_item && !isModalOpen) {
                                    comp.contextMenu(last_item);
                                }
                            }
                        });
                    }
                }
            });
            
            Lampa.Controller.toggle('content');
        };
        
        comp.pause = function() {
            Lampa.Controller.clear();
            $(document).off('keydown.rezka_menu');
        };
        
        comp.stop = function() {};
        
        comp.destroy = function() {
            Lampa.Controller.clear();
            $(document).off('keydown.rezka_menu');
            if (scroll) scroll.destroy();
            html.remove();
        };
        
        comp.render = function() {
            return html;
        };
        
        return comp;
    }
    
    // Регистрация
    function init() {
        console.log('[Rezka] Init');
        
        if (!window.Lampa) {
            console.error('[Rezka] Lampa not found!');
            return;
        }
        
        Lampa.Component.add('rezka_watching', function() { return new RezkaCategory('watching'); });
        Lampa.Component.add('rezka_later', function() { return new RezkaCategory('later'); });
        Lampa.Component.add('rezka_watched', function() { return new RezkaCategory('watched'); });
        
        console.log('[Rezka] Components registered');
        
        setTimeout(function() {
            $('[data-action^="rezka_"]').remove();
            
            var menu = $('.menu .menu__list').eq(0);
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
                    Lampa.Activity.push({ component: item.component, page: 1 });
                });
                
                menu.append(menuItem);
            });
            
            console.log('[Rezka] Menu added');
        }, 1000);
    }
    
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
