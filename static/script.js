/* */
const tg = window.Telegram.WebApp;
tg.expand();

let currentCategory = 'watching';
let art = null;
let currentMovieTitle = "";

// --- НАВИГАЦИЯ (HDREZKA) ---

async function switchTab(cat, btn) {
    currentCategory = cat;
    document.getElementById('search-ui').style.display = 'none';
    document.getElementById('grid').style.display = 'grid';
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    loadGrid(cat);
}

async function loadGrid(cat) {
    const grid = document.getElementById('grid');
    grid.innerHTML = '<div style="grid-column:span 2; text-align:center; padding:30px; color:#666">Загрузка...</div>';
    try {
        const res = await fetch(`/api/${cat}`);
        const data = await res.json();
        grid.innerHTML = '';
        if (!data || data.length === 0) {
            grid.innerHTML = '<div style="grid-column:span 2; text-align:center; padding:30px; color:#666">Список пуст</div>';
            return;
        }
        data.forEach(item => {
            const div = document.createElement('div');
            div.className = 'card';
            div.onclick = () => openDetails(item.url, item.title, item.poster);
            div.innerHTML = `
                <div class="card-badge">${item.status || 'Фильм'}</div>
                <img src="${item.poster}" loading="lazy">
                <div class="card-content">
                    <div class="card-title">${item.title}</div>
                    <div class="card-sub">HDRezka</div>
                </div>
            `;
            grid.appendChild(div);
        });
    } catch (e) {
        grid.innerHTML = '<div style="grid-column:span 2; text-align:center;">Ошибка соединения</div>';
    }
}

let currentPostId = null;
let currentDetailsUrl = null;

async function openDetails(url, title, poster) {
    const modal = document.getElementById('details');
    modal.classList.add('open');
    document.getElementById('det-img').src = poster;
    document.getElementById('det-title').innerText = title;
    currentMovieTitle = title;
    
    closePlayer(); 
    document.getElementById('det-controls').style.display = 'none';
    const list = document.getElementById('det-list');
    list.innerHTML = '<div style="text-align:center; padding:40px; color:#888">Загрузка...</div>';
    document.getElementById('det-franchises').innerHTML = '';

    currentDetailsUrl = url;
    try {
        const res = await fetch(`/api/details?url=${encodeURIComponent(url)}`);
        const data = await res.json();
        
        if (data.post_id) {
            currentPostId = data.post_id;
            document.getElementById('det-controls').style.display = 'flex';
        }
        if (data.poster) document.getElementById('det-img').src = data.poster;
        
        list.innerHTML = '';
        
        if (data.franchises && data.franchises.length > 0) {
            const fContainer = document.getElementById('det-franchises');
            const fTitle = document.createElement('div');
            fTitle.className = 'season-title';
            fTitle.innerText = 'Связанные части';
            fContainer.appendChild(fTitle);
            
            const fScroll = document.createElement('div');
            fScroll.className = 'franchise-scroll';
            data.franchises.forEach(f => {
                const item = document.createElement('div');
                item.className = 'franchise-card';
                item.onclick = () => openDetails(f.url, f.title, f.poster);
                item.innerHTML = `<img src="${f.poster}"><div class="f-info"><div class="f-title">${f.title}</div></div>`;
                fScroll.appendChild(item);
            });
            fContainer.appendChild(fScroll);
        }

        if (data.seasons) {
            Object.keys(data.seasons).forEach(s => {
                const h = document.createElement('div');
                h.className = 'season-title';
                h.innerText = s + ' сезон';
                list.appendChild(h);
                data.seasons[s].forEach(ep => {
                    const row = document.createElement('div');
                    row.className = `ep-row ${ep.watched ? 'watched' : ''}`;
                    row.innerHTML = `
                        <span style="flex:1;">${ep.title}</span>
                        <div class="check ${ep.watched ? 'active' : ''}" onclick="toggle('${ep.global_id}', this)"></div>
                    `;
                    row.querySelector('.check').rowElement = row;
                    list.appendChild(row);
                });
            });
        }
    } catch (e) {
        list.innerHTML = '<div style="text-align:center;">Ошибка загрузки</div>';
    }
}

function closeDetails() {
    closePlayer();
    document.getElementById('details').classList.remove('open');
}

// --- ЛОГИКА KINOGO (CLIENT SIDE) ---

async function startOnlineView() {
    if (!currentMovieTitle) return;
    
    const btn = document.querySelector('.btn-play-online');
    const originalText = btn.innerText;
    btn.innerText = "🔍 Поиск на сервере...";
    
    // Очистка названия
    let cleanTitle = currentMovieTitle.split('(')[0].split('/')[0].trim();
    
    try {
        // 1. Ищем через сервер (Playwright в Германии)
        const res = await fetch(`/api/kinogo/search?q=${encodeURIComponent(cleanTitle)}`);
        const results = await res.json();
        
        if (!results || results.length === 0) {
            let manual = prompt("Сервер не нашел фильм. Введите название (Kinogo):", cleanTitle);
            if (manual) {
                const res2 = await fetch(`/api/kinogo/search?q=${encodeURIComponent(manual)}`);
                const results2 = await res2.json();
                if (results2.length > 0) {
                    processSearchResult(results2[0], btn, originalText);
                } else {
                    alert("Ничего не найдено.");
                    btn.innerText = originalText;
                }
            } else {
                btn.innerText = originalText;
            }
            return;
        }
        
        processSearchResult(results[0], btn, originalText);
        
    } catch (e) {
        alert("Ошибка связи с сервером поиска.");
        btn.innerText = originalText;
    }
}

async function processSearchResult(item, btn, originalText) {
    console.log("Найден фильм:", item.title, item.url);
    btn.innerText = "⏳ Парсинг плеера...";
    
    // 2. Парсим страницу уже БРАУЗЕРОМ (Украина)
    await loadKinogoPageClient(item.url, btn, originalText);
}

// Умный парсинг с поиском iframe
async function loadKinogoPageClient(url, btn, originalText) {
    try {
        // Загружаем главную страницу фильма
        const res = await fetch(url);
        const htmlText = await res.text();
        
        // Показываем контейнер плеера заранее
        document.getElementById('player-container').style.display = 'block';
        document.getElementById('translation-box').style.display = 'block';

        // 1. Пробуем найти m3u8 сразу на странице
        let streamUrl = findM3u8InText(htmlText);

        if (streamUrl) {
            console.log("Прямая ссылка найдена сразу!");
            initPlayer(streamUrl);
            btn.innerText = originalText;
            return;
        }

        // 2. Если нет, ищем iframe с плеером
        console.log("Прямая ссылка не найдена, ищем iframe...");
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        
        // Ищем iframe, у которого src похож на плеер
        const iframes = doc.querySelectorAll('iframe');
        let foundIframeUrl = null;

        for (let iframe of iframes) {
            let src = iframe.src || iframe.getAttribute('data-src');
            if (src && (src.includes('kinogo') || src.includes('kodik') || src.includes('cdn') || src.includes('player'))) {
                foundIframeUrl = src;
                break;
            }
        }
        
        // Если нашли iframe, но ссылка относительная (//site.com или /player)
        if (foundIframeUrl) {
            if (foundIframeUrl.startsWith('//')) foundIframeUrl = 'https:' + foundIframeUrl;
            if (foundIframeUrl.startsWith('/')) foundIframeUrl = 'https://kinogo.inc' + foundIframeUrl;
            
            console.log("Найден iframe:", foundIframeUrl);
            btn.innerText = "⏳ Вскрываем iframe...";

            // 3. Загружаем содержимое iframe
            try {
                const iframeRes = await fetch(foundIframeUrl);
                const iframeText = await iframeRes.text();
                
                streamUrl = findM3u8InText(iframeText);
                
                if (streamUrl) {
                    console.log("Ссылка найдена внутри iframe!");
                    initPlayer(streamUrl);
                } else {
                    alert("Плеер найден, но поток зашифрован или недоступен.");
                    closePlayer();
                }
            } catch (e) {
                console.error(e);
                alert("Не удалось загрузить iframe (CORS?). Проверьте расширение.");
                closePlayer();
            }

        } else {
            alert("Плеер не найден на странице.");
            closePlayer();
        }
        
        btn.innerText = originalText;
        
    } catch (e) {
        alert("Ошибка доступа к сайту (CORS). Включите расширение!");
        console.error(e);
        btn.innerText = originalText;
        closePlayer();
    }
}

// Хелпер для поиска ссылки в тексте
function findM3u8InText(text) {
    // Ищем .m3u8 внутри кавычек
    const match = text.match(/["']([^"']+\.m3u8[^"']*)["']/);
    if (match && match[1]) {
        return match[1];
    }
    return null;
}

function initPlayer(url) {
    if (art) art.destroy();
    
    // Если ссылка относительная
    if (url.startsWith('/')) url = 'https://kinogo.inc' + url;

    art = new Artplayer({
        container: '#artplayer',
        url: url,
        type: 'm3u8',
        customType: {
            m3u8: function (video, url) {
                if (Hls.isSupported()) {
                    const hls = new Hls();
                    hls.loadSource(url);
                    hls.attachMedia(video);
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = url;
                }
            },
        },
        fullscreen: true,
        autoplay: true,
        setting: true,
        pip: true,
        lang: 'ru'
    });
    
    document.getElementById('player-container').scrollIntoView({ behavior: 'smooth' });
}

function closePlayer() {
    if (art) {
        art.destroy();
        art = null;
    }
    document.getElementById('player-container').style.display = 'none';
    document.getElementById('translation-box').style.display = 'none';
}

// ... Остальные функции (toggle, moveMovie и т.д.) без изменений ...
async function moveMovie(category) {
    if (!currentPostId) return;
    tg.HapticFeedback.notificationOccurred('success');
    await fetch('/api/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: currentPostId, category: category })
    });
    alert('Перенесено!');
    closeDetails();
    loadGrid(currentCategory);
}

async function deleteMovie() {
    if (!currentPostId) return;
    tg.HapticFeedback.notificationOccurred('success');
    await fetch('/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: currentPostId, category: currentCategory })
    });
    alert('Удалено!');
    closeDetails();
    loadGrid(currentCategory);
}

async function toggle(gid, btn) {
    tg.HapticFeedback.impactOccurred('medium');
    const row = btn.rowElement;
    if (btn.classList.contains('active')) {
        btn.classList.remove('active');
        row.classList.remove('watched');
    } else {
        btn.classList.add('active');
        row.classList.add('watched');
    }
    await fetch('/api/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ global_id: gid, referer: currentDetailsUrl })
    });
}

function openSearch(btn) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('grid').style.display = 'none';
    document.getElementById('search-ui').style.display = 'block';
    document.getElementById('q').focus();
}

let searchTimer;
function doSearch(val) {
    clearTimeout(searchTimer);
    if (val.length === 0) { document.getElementById('search-results').innerHTML = ''; return; }
    searchTimer = setTimeout(async () => {
        if (val.length < 3) return;
        const res = await fetch(`/api/search?q=${encodeURIComponent(val)}`);
        const data = await res.json();
        const list = document.getElementById('search-results');
        list.innerHTML = '';
        data.forEach(item => {
            const div = document.createElement('div');
            div.className = 'search-item';
            div.innerHTML = `
                <div class="search-title">${item.title}</div>
                <div class="search-actions">
                    <button class="btn-action btn-watch" onclick="addFav('${item.id}', 'watching')">+ Смотрю</button>
                    <button class="btn-action btn-later" onclick="addFav('${item.id}', 'later')">+ Позже</button>
                </div>`;
            list.appendChild(div);
        });
    }, 600);
}

async function addFav(id, cat) {
    tg.HapticFeedback.notificationOccurred('success');
    await fetch('/api/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: id, category: cat })
    });
    alert('Добавлено!');
}

loadGrid('watching');