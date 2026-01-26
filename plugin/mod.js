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
            console.log('[Rezka] Creating:', category);
            
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
                        console.log('[Rezka] Loaded:', items.length);
                        comp.build(items);
                    } else {
                        comp.html.append('<div class="broadcast__text">Список пуст</div>');
                    }
                },
                error: function(err) {
                    console.error('[Rezka] Error:', err);
                    loader.remove();
                    comp.html.append('<div class="broadcast__text">Ошибка загрузки</div>');
                }
            });
            
            return comp.html;
        };
        
        comp.build = function(items) {
            console.log('[Rezka] Building', items.length, 'cards');
            
            scroll = new Lampa.Scroll({
                horizontal: false,
                step: 250
            });
            
            var grid = $('<div class="rezka-grid"></div>');
            grid.css({
                'display': 'grid',
                'grid-template-columns': 'repeat(auto-fill, minmax(150px, 1fr))',
                'gap': '20px',
                'padding': '20px'
            });
            
            items.forEach(function(item) {
                grid.append(comp.card(item));
            });
            
            scroll.append(grid);
            comp.html.append(scroll.render());
            
            comp.start();
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
                poster.append(badge);
            }
            
            card.append(poster);
            
            var title = $('<div></div>').text(titleRu);
            title.css({
                'padding': '10px',
                'font-size': '13px',
                'color': '#fff',
                'text-align': 'center',
                'min-height': '50px',
                'display': 'flex',
                'align-items': 'center',
                'justify-content': 'center'
            });
            card.append(title);
            
            card.data('item', item);
            card.data('title_ru', titleRuClean);
            card.data('title_en', titleEn);
            card.data('year', year);
            card.data('media_type', mediaType);
            
            card.on('hover:focus', function() {
                $('.rezka-card').css({
                    'transform': 'scale(1)',
                    'box-shadow': 'none',
                    'z-index': '1'
                });
                card.css({
                    'transform': 'scale(1.05)',
                    'box-shadow': '0 8px 20px rgba(255,255,255,0.3)',
                    'z-index': '10'
                });
                last_item = item;
            });
            
            card.on('hover:blur', function() {
                card.css({
                    'transform': 'scale(1)',
                    'box-shadow': 'none',
                    'z-index': '1'
                });
            });
            
            card.on('hover:enter', function(e) {
                if (e) e.preventDefault();
                if (isModalOpen) return;
                comp.search(titleRuClean, titleEn, year, mediaType);
            });
            
            return card;
        };
        
        // Поиск по двум названиям
        comp.search = function(titleRu, titleEn, year, mediaType) {
            Lampa.Loading.start(function() {});
            
            var allResults = [];
            var seenIds = {};
            var completed = 0;
            var toSearch = [];
            
            if (titleEn) toSearch.push(titleEn);
            if (titleRu) toSearch.push(titleRu);
            
            if (toSearch.length === 0) {
                Lampa.Loading.stop();
                Lampa.Noty.show('Ошибка поиска');
                return;
            }
            
            function checkComplete() {
                completed++;
                if (completed === toSearch.length) {
                    Lampa.Loading.stop();
                    
                    if (allResults.length === 0) {
                        Lampa.Noty.show('Не найдено');
                        return;
                    }
                    
                    // Ищем точное совпадение по году
                    var exactMatch = null;
                    if (year) {
                        for (var i = 0; i < allResults.length; i++) {
                            var r = allResults[i];
                            var rYear = (r.release_date || r.first_air_date || '').substring(0, 4);
                            if (rYear === year) {
                                exactMatch = r;
                                break;
                            }
                        }
                    }
                    
                    if (exactMatch) {
                        // Точное совпадение - открываем сразу
                        comp.openCard(exactMatch.id, mediaType);
                    } else if (allResults.length === 1) {
                        // Один результат - открываем
                        comp.openCard(allResults[0].id, mediaType);
                    } else {
                        // Несколько вариантов - показываем выбор
                        comp.showSelection(allResults, mediaType);
                    }
                }
            }
            
            toSearch.forEach(function(searchTitle) {
                var url = 'https://api.themoviedb.org/3/search/' + mediaType + 
                          '?api_key=' + TMDB_API_KEY + 
                          '&language=ru-RU&query=' + encodeURIComponent(searchTitle);
                
                if (year) {
                    url += (mediaType === 'tv' ? '&first_air_date_year=' : '&year=') + year;
                }
                
                $.ajax({
                    url: url,
                    timeout: 10000,
                    success: function(data) {
                        if (data.results) {
                            data.results.forEach(function(item) {
                                if (!seenIds[item.id]) {
                                    seenIds[item.id] = true;
                                    allResults.push(item);
                                }
                            });
                        }
                        checkComplete();
                    },
                    error: function() {
                        checkComplete();
                    }
                });
            });
        };
        
        // Показать выбор из TMDB
        comp.showSelection = function(results, mediaType) {
            if (isModalOpen) return;
            isModalOpen = true;
            
            var items = [];
            results.forEach(function(item) {
                var title = item.title || item.name;
                var year = (item.release_date || item.first_air_date || '').substring(0, 4);
                var poster = item.poster_path ? 'https://image.tmdb.org/t/p/w200' + item.poster_path : '';
                var overview = (item.overview || 'Нет описания').substring(0, 150);
                
                items.push({
                    title: title + ' (' + year + ')',
                    description: overview,
                    image: poster,
                    tmdb_id: item.id
                });
            });
            
            Lampa.Select.show({
                title: 'Выберите вариант',
                items: items,
                onSelect: function(selectedItem) {
                    isModalOpen = false;
                    comp.openCard(selectedItem.tmdb_id, mediaType);
                },
                onBack: function() {
                    isModalOpen = false;
                }
            });
        };
        
        comp.openCard = function(tmdbId, mediaType) {
            Lampa.Activity.push({
                url: '',
                component: 'full',
                id: tmdbId,
                method: mediaType,
                source: 'tmdb',
                card: { id: tmdbId, source: 'tmdb' }
            });
        };
        
        comp.menu = function(item) {
            if (isModalOpen) return;
            isModalOpen = true;
            
            var isTv = /\/series\/|\/cartoons\//.test(item.url || '');
            var items = [];
            
            if (isTv) items.push({ title: '📺 Серии', value: 'episodes' });
            
            if (category !== 'watching') items.push({ title: '▶ В Смотрю', value: 'move_watching' });
            if (category !== 'later') items.push({ title: '⏳ В Позже', value: 'move_later' });
            if (category !== 'watched') items.push({ title: '✅ В Архив', value: 'move_watched' });
            
            items.push({ title: '🗑️ Удалить', value: 'delete' });
            
            Lampa.Select.show({
                title: 'Управление',
                items: items,
                onSelect: function(sel) {
                    isModalOpen = false;
                    if (sel.value === 'episodes') {
                        comp.episodes(item);
                    } else {
                        comp.action(sel.value, item);
                    }
                },
                onBack: function() {
                    isModalOpen = false;
                }
            });
        };
        
        comp.episodes = function(item) {
            if (isModalOpen) return;
            isModalOpen = true;
            
            Lampa.Loading.start(function() {});
            
            $.ajax({
                url: MY_API_URL + '/api/details',
                data: { url: item.url },
                success: function(details) {
                    Lampa.Loading.stop();
                    
                    if (!details || !details.seasons) {
                        Lampa.Noty.show('Ошибка');
                        isModalOpen = false;
                        return;
                    }
                    
                    var seasons = Object.keys(details.seasons).sort(function(a, b) {
                        return parseInt(a) - parseInt(b);
                    });
                    
                    var items = seasons.map(function(s) {
                        var eps = details.seasons[s];
                        var w = eps.filter(function(e) { return e.watched; }).length;
                        return {
                            title: 'Сезон ' + s + ' (' + w + '/' + eps.length + ')',
                            value: s,
                            episodes: eps
                        };
                    });
                    
                    Lampa.Select.show({
                        title: 'Сезон',
                        items: items,
                        onSelect: function(sel) {
                            comp.episodeList(item, sel.value, sel.episodes);
                        },
                        onBack: function() {
                            isModalOpen = false;
                        }
                    });
                },
                error: function() {
                    Lampa.Loading.stop();
                    Lampa.Noty.show('Ошибка');
                    isModalOpen = false;
                }
            });
        };
        
        comp.episodeList = function(item, season, episodes) {
            var items = [{ title: '✅ Все', value: 'all', season: season }];
            
            episodes.sort(function(a, b) {
                return parseInt(a.episode) - parseInt(b.episode);
            }).forEach(function(ep) {
                items.push({
                    title: (ep.watched ? '✅' : '▫️') + ' ' + ep.episode,
                    value: ep.episode,
                    season: season
                });
            });
            
            Lampa.Select.show({
                title: 'Серия',
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
                    Lampa.Noty.show(res.success ? '✅' : '❌');
                    isModalOpen = false;
                    if (res.success) comp.reload();
                },
                error: function() {
                    Lampa.Loading.stop();
                    Lampa.Noty.show('❌');
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
                    Lampa.Noty.show(res.success ? '✅ ' + res.marked : '❌');
                    isModalOpen = false;
                    if (res.success) comp.reload();
                },
                error: function() {
                    Lampa.Loading.stop();
                    Lampa.Noty.show('❌');
                    isModalOpen = false;
                }
            });
        };
        
        comp.action = function(action, item) {
            var postId = item.url.match(/\/(\d+)-/);
            postId = postId ? postId[1] : null;
            if (!postId) {
                Lampa.Noty.show('❌ ID');
                return;
            }
            
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
                    Lampa.Noty.show(res.success ? '✅' : '❌');
                    if (res.success) comp.reload();
                },
                error: function() {
                    Lampa.Loading.stop();
                    Lampa.Noty.show('❌');
                }
            });
        };
        
        comp.reload = function() {
            Lampa.Activity.replace({ component: 'rezka_' + category, page: 1 });
        };
        
        comp.start = function() {
            console.log('[Rezka] Start');
            
            Lampa.Controller.add('content', {
                toggle: function() {
                    Lampa.Controller.collectionSet(comp.html);
                    Lampa.Controller.collectionFocus(last_item, comp.html);
                },
                back: function() {
                    Lampa.Activity.backward();
                }
            });
            
            // Красная кнопка - код 403
            $('body').off('keydown.rezka').on('keydown.rezka', function(e) {
                if (Lampa.Controller.enabled().name === 'content') {
                    if (e.keyCode === 403 && last_item && !isModalOpen) {
                        e.preventDefault();
                        e.stopPropagation();
                        comp.menu(last_item);
                    }
                }
            });
            
            Lampa.Controller.toggle('content');
        };
        
        comp.pause = function() {
            Lampa.Controller.clear();
            $('body').off('keydown.rezka');
        };
        
        comp.stop = function() {};
        
        comp.destroy = function() {
            Lampa.Controller.clear();
            $('body').off('keydown.rezka');
            if (scroll) scroll.destroy();
            comp.html.remove();
        };
        
        comp.render = function() {
            return comp.html;
        };
        
        return comp;
    }
    
    function init() {
        console.log('[Rezka] Init');
        
        if (!window.Lampa) return;
        
        Lampa.Component.add('rezka_watching', function() { return new RezkaCategory('watching'); });
        Lampa.Component.add('rezka_later', function() { return new RezkaCategory('later'); });
        Lampa.Component.add('rezka_watched', function() { return new RezkaCategory('watched'); });
        
        setTimeout(function() {
            $('[data-action^="rezka_"]').remove();
            
            var menu = $('.menu .menu__list').eq(0);
            [
                { action: 'rezka_watching', comp: 'rezka_watching', icon: '▶', text: 'Смотрю' },
                { action: 'rezka_later', comp: 'rezka_later', icon: '⏳', text: 'Позже' },
                { action: 'rezka_watched', comp: 'rezka_watched', icon: '✅', text: 'Архив' }
            ].forEach(function(item) {
                var mi = $(
                    '<li class="menu__item selector" data-action="' + item.action + '">' +
                    '<div class="menu__ico">' + item.icon + '</div>' +
                    '<div class="menu__text">' + item.text + '</div></li>'
                );
                mi.on('hover:enter', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    Lampa.Activity.push({ component: item.comp, page: 1 });
                });
                menu.append(mi);
            });
        }, 1000);
    }
    
    if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function(e) {
            if (e.type === 'ready') init();
        });
    }
})();
