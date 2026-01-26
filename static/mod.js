(function () {
    'use strict';

    // ВАШ API
    var MY_API_URL = 'http://filme.64.188.67.85.sslip.io:8080';
    var TMDB_API_KEY = '4ef0d7355d9ffb5151e987764708ce96';

    function MyRezkaComponent(object) {
        var comp = {};
        comp.html = $('<div class="items items--vertical"></div>');

        comp.create = function () {
            var loader = $('<div class="empty__descr">Загрузка списка...</div>');
            comp.html.append(loader);

            $.ajax({
                url: MY_API_URL + '/api/watching',
                method: 'GET',
                dataType: 'json',
                success: function(items) {
                    loader.remove();
                    if (items && items.length) {
                        comp.renderItems(items);
                    } else {
                        comp.html.append('<div class="empty__descr">Список пуст</div>');
                    }
                    Lampa.Controller.toggle('content');
                },
                error: function(err) {
                    loader.text('Ошибка связи с сервером');
                    console.error('[Rezka] Ошибка загрузки:', err);
                }
            });
            return comp.html;
        };

        comp.start = function () {
            Lampa.Controller.toggle('content');
        };
        comp.pause = function () {};
        comp.destroy = function () {
            comp.html.remove();
        };
        comp.render = function () {
            return comp.html;
        };

        // ========================================
        // TMDB API: Поиск напрямую
        // ========================================
        function searchTMDB(title, year, mediaType, callback) {
            var url = 'https://api.themoviedb.org/3/search/' + mediaType + 
                      '?api_key=' + TMDB_API_KEY + 
                      '&language=ru-RU&query=' + encodeURIComponent(title);
            
            if (year) {
                url += (mediaType === 'tv' ? '&first_air_date_year=' : '&year=') + year;
            }
            
            console.log('[Rezka] 🔍 Поиск в TMDB:', title, year);
            
            $.ajax({
                url: url,
                method: 'GET',
                dataType: 'json',
                success: function(data) {
                    console.log('[Rezka] ✅ Результаты TMDB:', data.results.length);
                    callback(data.results || []);
                },
                error: function(err) {
                    console.error('[Rezka] ❌ Ошибка TMDB:', err);
                    callback([]);
                }
            });
        }

        // ========================================
        // Показываем список для выбора
        // ========================================
        function showSelectionModal(results, mediaType, onSelect) {
            // ✅ ИСПРАВЛЕНО: Сохраняем ссылку на модалку
            var modalInstance = null;
            
            var modalHTML = $('<div class="tmdb-select-list"></div>');
            
            modalInstance = Lampa.Modal.open({
                title: 'Выберите правильный вариант',
                html: modalHTML,
                onBack: function() {
                    console.log('[Rezka] 🔙 Закрытие модалки (Back)');
                    Lampa.Modal.close();
                    Lampa.Controller.toggle('content');
                }
            });

            if (!results.length) {
                modalHTML.append('<div style="padding:20px;text-align:center;color:#999">Ничего не найдено</div>');
                return;
            }

            results.forEach(function(item, index) {
                var title = item.title || item.name;
                var year = (item.release_date || item.first_air_date || '').substring(0, 4);
                var poster = item.poster_path 
                    ? 'https://image.tmdb.org/t/p/w200' + item.poster_path 
                    : '';
                var overview = item.overview || 'Нет описания';
                
                var card = $('<div class="tmdb-select-item selector"></div>');
                card.css({
                    display: 'flex',
                    padding: '10px',
                    marginBottom: '10px',
                    background: 'rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    alignItems: 'center'
                });

                if (poster) {
                    var posterEl = $('<img>').attr('src', poster).css({
                        width: '60px',
                        height: '90px',
                        objectFit: 'cover',
                        borderRadius: '4px',
                        marginRight: '15px',
                        flexShrink: 0
                    });
                    card.append(posterEl);
                }

                var infoEl = $('<div></div>').css({ flex: 1 });
                infoEl.append('<div style="font-weight:bold;margin-bottom:5px;font-size:14px">' + title + ' (' + year + ')</div>');
                infoEl.append('<div style="font-size:11px;color:#999;line-height:1.3;max-height:40px;overflow:hidden">' + 
                    (overview.length > 100 ? overview.substring(0, 100) + '...' : overview) + 
                '</div>');

                card.append(infoEl);

                // ✅ ИСПРАВЛЕНО: Правильное закрытие модалки
                card.on('hover:enter', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    console.log('[Rezka] 📌 Выбрано:', title, item.id);
                    
                    // Сначала закрываем модалку
                    Lampa.Modal.close();
                    modalHTML.remove();
                    
                    // Затем открываем карточку
                    setTimeout(function() {
                        onSelect(item);
                    }, 150);
                });
                
                card.on('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    console.log('[Rezka] 📌 Клик:', title, item.id);
                    
                    Lampa.Modal.close();
                    modalHTML.remove();
                    
                    setTimeout(function() {
                        onSelect(item);
                    }, 150);
                });

                modalHTML.append(card);

                if (index === 0) {
                    Lampa.Controller.collectionSet(modalHTML);
                    Lampa.Controller.collectionFocus(card[0], modalHTML);
                }
            });
        }

        // ========================================
        // Открываем карточку в Лампе
        // ========================================
        function openLampaCard(tmdbId, mediaType) {
            console.log('[Rezka] 🎬 Открываем карточку:', tmdbId, mediaType);
            
            Lampa.Activity.push({
                url: 'http://lampa.mx/?card=' + tmdbId + '&media=' + mediaType + '&source=tmdb',
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
        // Рендерим список карточек
        // ========================================
        comp.renderItems = function (items) {
            var wrapper = $('<div class="category-full"></div>');
            wrapper.append('<div class="category-full__head">Сейчас смотрю</div>');
            var body = $('<div class="category-full__body" style="display:flex;flex-wrap:wrap;gap:12px;padding-bottom:2em"></div>');

            items.forEach(function (item) {
                console.log('[Rezka] 🎨 Рендер:', item.title);
                
                // ✅ ПАРСИНГ НАЗВАНИЯ
                var rawTitle = item.title || '';
                var yearMatch = rawTitle.match(/\((\d{4})\)/);
                var year = yearMatch ? yearMatch[1] : '';
                
                var titleNoYear = rawTitle.replace(/\s*\(\d{4}\)/, '').trim();
                var titleRu = titleNoYear.split('/')[0].trim();
                var titleClean = titleRu.split(':')[0].trim();

                console.log('[Rezka] 📝', rawTitle, '→', titleClean);

                const isTv = /\/series\/|\/cartoons\//.test(item.url || '');
                const mediaType = isTv ? 'tv' : 'movie';

                // ✅ ИСПРАВЛЕНО: Картинка напрямую, без Lampa Template
                var posterUrl = '';
                if (item.poster) {
                    posterUrl = MY_API_URL + '/api/img?url=' + encodeURIComponent(item.poster);
                    console.log('[Rezka] 🖼️ URL:', posterUrl);
                }

                // ✅ СОЗДАЕМ КАРТОЧКУ ВРУЧНУЮ (без Template)
                var card = $('<div class="card selector card--collection"></div>');
                card.css({ 
                    width: '16.6%', 
                    minWidth: '140px', 
                    cursor: 'pointer',
                    marginBottom: '20px',
                    position: 'relative'
                });

                var cardView = $('<div class="card__view"></div>');
                
                // Постер
                if (posterUrl) {
                    var cardImg = $('<div class="card__img"></div>').css({
                        backgroundImage: 'url(' + posterUrl + ')',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        paddingBottom: '150%',
                        borderRadius: '8px'
                    });
                    cardView.append(cardImg);
                    
                    console.log('[Rezka] ✅ Постер установлен:', titleClean);
                } else {
                    console.log('[Rezka] ⚠️ Нет постера:', titleClean);
                }
                
                // Название
                var cardTitle = $('<div class="card__title"></div>').text(titleClean);
                cardView.append(cardTitle);
                
                // Статус серии
                if (item.status) {
                    var statusDiv = $('<div class="card__episode"></div>').text(item.status);
                    statusDiv.css({
                        position: 'absolute',
                        bottom: '25px',
                        left: '5px',
                        right: '5px',
                        padding: '3px 5px',
                        background: 'rgba(0,0,0,0.9)',
                        borderRadius: '4px',
                        fontSize: '11px',
                        textAlign: 'center',
                        color: '#fff'
                    });
                    cardView.append(statusDiv);
                }
                
                card.append(cardView);

                // ========================================
                // КЛИК НА КАРТОЧКУ
                // ========================================
                function handleClick(e) {
                    e.preventDefault();
                    console.log('[Rezka] 🎯 Клик на:', titleClean);
                    Lampa.Loading.start(function() {});

                    searchTMDB(titleClean, year, mediaType, function(results) {
                        Lampa.Loading.stop();

                        if (!results.length) {
                            Lampa.Noty.show('Ничего не найдено в TMDB');
                            return;
                        }

                        var exactMatch = null;
                        if (year) {
                            exactMatch = results.find(function(r) {
                                var rYear = (r.release_date || r.first_air_date || '').substring(0, 4);
                                return rYear === year;
                            });
                        }

                        if (exactMatch) {
                            console.log('[Rezka] ✅ Точное совпадение:', exactMatch.id);
                            openLampaCard(exactMatch.id, mediaType);
                        } else if (results.length === 1) {
                            console.log('[Rezka] ✅ Один результат:', results[0].id);
                            openLampaCard(results[0].id, mediaType);
                        } else {
                            console.log('[Rezka] 📋 Показываем список');
                            showSelectionModal(results, mediaType, function(selected) {
                                openLampaCard(selected.id, mediaType);
                            });
                        }
                    });
                }

                card.on('hover:enter', handleClick);
                card.on('click', handleClick);

                body.append(card);
            });

            wrapper.append(body);
            comp.html.append(wrapper);
        };

        return comp;
    }

    // ========================================
    // Регистрация плагина
    // ========================================
    Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready') {
            console.log('[Rezka] ✅ Плагин загружен');
            
            if ($('[data-action="my_rezka_open"]').length === 0) {
                $('.menu .menu__list').eq(0).append(
                    '<li class="menu__item selector" data-action="my_rezka_open">' +
                    '<div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7L12 12L22 7L12 2Z"/><path d="M2 17L12 22L22 17"/><path d="M2 12L12 17L22 12"/></svg></div>' +
                    '<div class="menu__text">Rezka</div></li>'
                );
            }
            
            $('body').off('click.myrezka').on('click.myrezka', '[data-action="my_rezka_open"]', function () {
                Lampa.Activity.push({ 
                    component: 'my_rezka', 
                    page: 1 
                });
            });
            
            Lampa.Component.add('my_rezka', MyRezkaComponent);
            
            console.log('[Rezka] 📌 Меню добавлено');
        }
    });
})();
