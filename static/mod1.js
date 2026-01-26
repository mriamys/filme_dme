(function () {
    'use strict';

    var MY_API_URL = 'http://filme.64.188.67.85.sslip.io:8080';
    var TMDB_API_KEY = '4ef0d7355d9ffb5151e987764708ce96';

    console.log('[Rezka] 🚀 Инициализация плагина...');

    function MyRezkaComponent(object) {
        console.log('[Rezka] 📦 Создание компонента');
        
        var comp = {};
        comp.html = $('<div class="items items--lines"></div>');
        var isModalOpen = false;

        comp.create = function () {
            console.log('[Rezka] 🎨 Создание HTML');
            var loader = $('<div class="empty__descr">Загрузка данных...</div>');
            comp.html.append(loader);

            console.log('[Rezka] 📡 Запрос к API:', MY_API_URL + '/api/watching');
            
            $.ajax({
                url: MY_API_URL + '/api/watching',
                method: 'GET',
                dataType: 'json',
                timeout: 10000,
                success: function(items) {
                    console.log('[Rezka] ✅ Данные получены:', items ? items.length : 0, 'элементов');
                    loader.remove();
                    if (items && items.length) {
                        comp.renderItems(items);
                    } else {
                        comp.html.append('<div class="empty__descr">Список пуст</div>');
                    }
                    Lampa.Controller.toggle('content');
                },
                error: function(xhr, status, err) {
                    console.error('[Rezka] ❌ Ошибка загрузки:', status, err);
                    console.error('[Rezka] ❌ XHR:', xhr);
                    loader.text('Ошибка связи: ' + status);
                }
            });
            return comp.html;
        };

        comp.start = function () {
            console.log('[Rezka] ▶️ Start вызван');
            Lampa.Controller.toggle('content');
        };
        
        comp.pause = function () {
            console.log('[Rezka] ⏸️ Pause вызван');
        };
        
        comp.destroy = function () {
            console.log('[Rezka] 🗑️ Destroy вызван');
            isModalOpen = false;
            comp.html.remove();
        };
        
        comp.render = function () {
            console.log('[Rezka] 🖼️ Render вызван');
            return comp.html;
        };

        // ========================================
        // TMDB API - Поиск по двум названиям
        // ========================================
        function searchTMDBBoth(titleRu, titleEn, year, mediaType, callback) {
            var allResults = [];
            var seenIds = {};
            var completed = 0;
            var toSearch = [];
            
            if (titleEn) toSearch.push(titleEn);
            if (titleRu) toSearch.push(titleRu);
            
            if (toSearch.length === 0) {
                callback([]);
                return;
            }
            
            console.log('[Rezka] 🔍 Поиск по:', toSearch, 'год:', year);
            
            function checkComplete() {
                completed++;
                if (completed === toSearch.length) {
                    console.log('[Rezka] ✅ Всего найдено:', allResults.length);
                    callback(allResults);
                }
            }
            
            for (var i = 0; i < toSearch.length; i++) {
                (function(searchTitle) {
                    var url = 'https://api.themoviedb.org/3/search/' + mediaType + 
                              '?api_key=' + TMDB_API_KEY + 
                              '&language=ru-RU&query=' + encodeURIComponent(searchTitle);
                    
                    if (year) {
                        url += (mediaType === 'tv' ? '&first_air_date_year=' : '&year=') + year;
                    }
                    
                    $.ajax({
                        url: url,
                        method: 'GET',
                        dataType: 'json',
                        success: function(data) {
                            if (data.results) {
                                for (var j = 0; j < data.results.length; j++) {
                                    var item = data.results[j];
                                    if (!seenIds[item.id]) {
                                        seenIds[item.id] = true;
                                        allResults.push(item);
                                    }
                                }
                            }
                            checkComplete();
                        },
                        error: function() {
                            checkComplete();
                        }
                    });
                })(toSearch[i]);
            }
        }

        // ========================================
        // Модалка выбора
        // ========================================
        function showSelectionModal(results, mediaType, onSelect) {
            if (isModalOpen) {
                console.log('[Rezka] ⚠️ Модалка уже открыта');
                return;
            }
            
            isModalOpen = true;
            console.log('[Rezka] 📋 Открываем модалку');

            var items = [];
            for (var i = 0; i < results.length; i++) {
                var item = results[i];
                var title = item.title || item.name;
                var year = (item.release_date || item.first_air_date || '').substring(0, 4);
                var poster = item.poster_path 
                    ? 'https://image.tmdb.org/t/p/w200' + item.poster_path 
                    : '';
                var overview = (item.overview || 'Нет описания').substring(0, 150);
                
                items.push({
                    title: title + ' (' + year + ')',
                    description: overview,
                    image: poster,
                    tmdb_id: item.id,
                    tmdb_data: item
                });
            }

            Lampa.Select.show({
                title: 'Выберите правильный вариант',
                items: items,
                onSelect: function(selectedItem) {
                    console.log('[Rezka] ✅ Выбрано:', selectedItem.title);
                    isModalOpen = false;
                    onSelect(selectedItem.tmdb_data);
                },
                onBack: function() {
                    console.log('[Rezka] 🔙 Назад');
                    isModalOpen = false;
                }
            });
        }

        // ========================================
        // Открытие карточки
        // ========================================
        function openLampaCard(tmdbId, mediaType) {
            console.log('[Rezka] 🎬 Открываем карточку:', tmdbId, mediaType);
            
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
        }

        // ========================================
        // Рендер карточек
        // ========================================
        comp.renderItems = function (items) {
            console.log('[Rezka] 🎨 Рендер', items.length, 'карточек');
            
            var grid = $('<div class="rezka-grid"></div>');
            grid.css({
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                gap: '20px',
                padding: '20px',
                width: '100%'
            });

            for (var idx = 0; idx < items.length; idx++) {
                (function(item) {
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

                    var card = $('<div class="rezka-card selector"></div>');
                    card.css({
                        position: 'relative',
                        cursor: 'pointer',
                        borderRadius: '10px',
                        overflow: 'hidden',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        backgroundColor: '#1a1a1a'
                    });

                    card.hover(
                        function() { 
                            $(this).css({
                                'transform': 'scale(1.05)',
                                'box-shadow': '0 8px 20px rgba(0,0,0,0.5)'
                            }); 
                        },
                        function() { 
                            $(this).css({
                                'transform': 'scale(1)',
                                'box-shadow': 'none'
                            }); 
                        }
                    );

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

                    // ========================================
                    // КЛИК
                    // ========================================
                    var longPressTimer = null;
                    var isLongPress = false;

                    card.on('hover:focus', function() {
                        isLongPress = false;
                        longPressTimer = setTimeout(function() {
                            isLongPress = true;
                            Lampa.Noty.show('Выбор из списка');
                        }, 800);
                    });

                    card.on('hover:blur', function() {
                        if (longPressTimer) {
                            clearTimeout(longPressTimer);
                            longPressTimer = null;
                        }
                    });

                    function handleClick(e) {
                        console.log('[Rezka] 🖱️ Клик на:', titleRu);
                        
                        if (e) e.preventDefault();
                        
                        if (longPressTimer) {
                            clearTimeout(longPressTimer);
                            longPressTimer = null;
                        }
                        
                        if (isModalOpen) {
                            console.log('[Rezka] ⚠️ Модалка уже открыта');
                            return;
                        }
                        
                        var forceSelect = isLongPress;
                        isLongPress = false;
                        
                        Lampa.Loading.start(function() {});

                        searchTMDBBoth(titleRuClean, titleEn, year, mediaType, function(results) {
                            Lampa.Loading.stop();

                            if (!results.length) {
                                Lampa.Noty.show('Ничего не найдено в TMDB');
                                return;
                            }

                            if (forceSelect) {
                                showSelectionModal(results, mediaType, function(selected) {
                                    openLampaCard(selected.id, mediaType);
                                });
                                return;
                            }

                            var exactMatch = null;
                            if (year) {
                                for (var i = 0; i < results.length; i++) {
                                    var r = results[i];
                                    var rYear = (r.release_date || r.first_air_date || '').substring(0, 4);
                                    if (rYear === year) {
                                        exactMatch = r;
                                        break;
                                    }
                                }
                            }

                            if (exactMatch) {
                                openLampaCard(exactMatch.id, mediaType);
                            } else if (results.length === 1) {
                                openLampaCard(results[0].id, mediaType);
                            } else {
                                showSelectionModal(results, mediaType, function(selected) {
                                    openLampaCard(selected.id, mediaType);
                                });
                            }
                        });
                    }

                    card.on('hover:enter', handleClick);
                    card.on('click', handleClick);

                    grid.append(card);
                })(items[idx]);
            }

            comp.html.append(grid);
        };

        return comp;
    }

    // ========================================
    // Регистрация плагина
    // ========================================
    Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready') {
            console.log('[Rezka] ✅ App ready - регистрация компонента');
            
            // Регистрируем компонент
            Lampa.Component.add('my_rezka', MyRezkaComponent);
            console.log('[Rezka] ✅ Компонент зарегистрирован');
            
            // Проверяем существование пункта меню
            if ($('[data-action="my_rezka_open"]').length === 0) {
                console.log('[Rezka] 📝 Добавляем пункт меню');
                $('.menu .menu__list').eq(0).append(
                    '<li class="menu__item selector" data-action="my_rezka_open">' +
                    '<div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7L12 12L22 7L12 2Z"/><path d="M2 17L12 22L22 17"/><path d="M2 12L12 17L22 12"/></svg></div>' +
                    '<div class="menu__text">Rezka</div></li>'
                );
            } else {
                console.log('[Rezka] ⚠️ Пункт меню уже существует');
            }
            
            // Обработчик клика - несколько вариантов
            $('body').off('click.myrezka').on('click.myrezka', '[data-action="my_rezka_open"]', function (event) {
                console.log('[Rezka] 🎯 Клик на пункт меню!');
                event.preventDefault();
                event.stopPropagation();
                
                try {
                    Lampa.Activity.push({ 
                        component: 'my_rezka', 
                        page: 1 
                    });
                    console.log('[Rezka] ✅ Activity.push выполнен');
                } catch (err) {
                    console.error('[Rezka] ❌ Ошибка при открытии:', err);
                }
            });
            
            // Альтернативный обработчик для hover:enter (для ТВ пультов)
            $('body').off('hover:enter.myrezka').on('hover:enter.myrezka', '[data-action="my_rezka_open"]', function (event) {
                console.log('[Rezka] 🎯 hover:enter на пункт меню!');
                event.preventDefault();
                event.stopPropagation();
                
                try {
                    Lampa.Activity.push({ 
                        component: 'my_rezka', 
                        page: 1 
                    });
                    console.log('[Rezka] ✅ Activity.push выполнен');
                } catch (err) {
                    console.error('[Rezka] ❌ Ошибка при открытии:', err);
                }
            });
            
            console.log('[Rezka] 📌 Инициализация завершена!');
        }
    });
    
    console.log('[Rezka] 📦 Плагин загружен в память');
})();
