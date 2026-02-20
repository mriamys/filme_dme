const tg = window.Telegram.WebApp;
tg.expand();

// Текущая выбранная категория
let currentCategory = 'watching';
// Кэш (хранит данные, пришедшие с сервера)
let allLoadedItems = [];
// Текущий метод сортировки (по умолчанию 'added')
let currentSort = 'added';

// --- НОВОЕ: Состояние библиотеки (для подсчета и проверки наличия) ---
let libraryState = {
    watching: new Set(),
    later: new Set(),
    watched: new Set(),
    counts: { watching: 0, later: 0, watched: 0 }
};

// Функция обновления состояния библиотеки (загружает ID всех элементов)
async function updateLibraryState() {
    try {
        // Загружаем списки параллельно
        const [w, l, a] = await Promise.all([
            fetch('/api/watching?sort=added').then(r => r.json()),
            fetch('/api/later?sort=added').then(r => r.json()),
            fetch('/api/watched?sort=added').then(r => r.json())
        ]);

        // Превращаем в Set строк для быстрого поиска
        libraryState.watching = new Set(w.map(i => String(i.id)));
        libraryState.later = new Set(l.map(i => String(i.id)));
        libraryState.watched = new Set(a.map(i => String(i.id)));

        libraryState.counts.watching = w.length;
        libraryState.counts.later = l.length;
        libraryState.counts.watched = a.length;

        updateTabCounts();
    } catch (e) {
        console.error("Failed to update library state", e);
    }
}

function updateTabCounts() {
    const setTxt = (id, count) => {
        const el = document.getElementById(id);
        if (el) el.innerText = count > 0 ? `(${count})` : '';
    };
    setTxt('cnt-watching', libraryState.counts.watching);
    setTxt('cnt-later', libraryState.counts.later);
    setTxt('cnt-watched', libraryState.counts.watched);
}

// Функция смены сортировки через <select>
function changeSort(val) {
    currentSort = val;
    loadGrid(currentCategory);
}

// Переключение вкладок
async function switchTab(cat, btn) {
    currentCategory = cat;
    
    // Скрываем поиск, показываем сетку
    document.getElementById('search-ui').style.display = 'none';
    document.getElementById('grid').style.display = 'grid';
    
    const toolbar = document.getElementById('toolbar');
    if (toolbar) toolbar.style.display = 'flex';
    
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    
    loadGrid(cat);
}

// Функция отрисовки
function renderSortedGrid() {
    const grid = document.getElementById('grid');
    grid.innerHTML = '';
    
    const sorted = allLoadedItems;
    
    if (!sorted || sorted.length === 0) {
        grid.innerHTML = '<div style="grid-column:span 2; text-align:center; padding:30px; color:#666">Список пуст</div>';
        return;
    }
    
    sorted.forEach(item => {
        const div = document.createElement('div');
        div.className = 'card';
        div.onclick = () => openDetails(item.url, item.title, item.poster);
        
        const cleanTitle = item.title.replace(/\s*\(\d{4}\)/, '');
        
        let yearHtml = '';
        if (currentSort === 'year' && item.year) {
             yearHtml = `<div class="card-year">${item.year}</div>`;
        }

        div.innerHTML = `
            <div class="card-badge">${item.status || 'Фильм'}</div>
            ${yearHtml}
            <img src="${item.poster}" loading="lazy">
            <div class="card-content">
                <div class="card-title">${cleanTitle}</div>
                <div class="card-sub">HDRezka</div>
            </div>
        `;
        grid.appendChild(div);
    });
}

// Загрузка сетки с retry (как в mod.js)
async function loadGrid(cat) {
    const grid = document.getElementById('grid');
    grid.innerHTML = '<div style="grid-column:span 2; text-align:center; padding:30px; color:#666">Загрузка...</div>';
    
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const res = await fetch(`/api/${cat}?sort=${currentSort}`);
            const data = await res.json();
            
            if (data && data.length > 0) {
                allLoadedItems = data;
                renderSortedGrid();
                return;
            }
            
            // Пустой ответ — повторяем
            if (attempt < MAX_RETRIES) {
                grid.innerHTML = `<div style="grid-column:span 2; text-align:center; padding:30px; color:#666">Загрузка... (попытка ${attempt + 1})</div>`;
                await new Promise(r => setTimeout(r, RETRY_DELAY));
            } else {
                allLoadedItems = [];
                renderSortedGrid();
            }
        } catch (e) {
            console.error(`loadGrid attempt ${attempt} error:`, e);
            if (attempt < MAX_RETRIES) {
                grid.innerHTML = `<div style="grid-column:span 2; text-align:center; padding:30px; color:#666">Ошибка... повторяю (${attempt + 1}/${MAX_RETRIES})</div>`;
                await new Promise(r => setTimeout(r, RETRY_DELAY));
            } else {
                grid.innerHTML = '<div style="grid-column:span 2; text-align:center;">Ошибка соединения</div>';
            }
        }
    }
}

let currentPostId = null;
let currentDetailsUrl = null;

async function openDetails(url, title, poster) {
    const modal = document.getElementById('details');
    modal.classList.add('open');
    document.getElementById('det-img').src = poster;
    document.getElementById('det-title').innerText = title;
    document.getElementById('det-controls').style.display = 'none';
    
    const statusBadge = document.getElementById('det-status-badge');
    statusBadge.style.display = 'none';
    statusBadge.innerText = '';
    
    const siteLink = document.getElementById('det-site-link');
    if (siteLink) {
        siteLink.href = url;
    }
    
    const franchiseContainer = document.getElementById('det-franchises');
    if (franchiseContainer) franchiseContainer.innerHTML = '';

    currentDetailsUrl = url;
    const list = document.getElementById('det-list');
    list.innerHTML = '<div style="text-align:center; padding:40px; color:#888">Загрузка серий...</div>';
    
    try {
        const res = await fetch(`/api/details?url=${encodeURIComponent(url)}`);
        const data = await res.json();
        
        if (data.post_id) {
            currentPostId = data.post_id;
            document.getElementById('det-controls').style.display = 'flex';
            
            // --- ПРОВЕРКА СТАТУСА ---
            const pid = String(currentPostId);
            if (libraryState.watching.has(pid)) {
                statusBadge.innerText = 'В СМОТРЮ';
                statusBadge.style.background = '#007aff';
                statusBadge.style.display = 'block';
            } else if (libraryState.later.has(pid)) {
                statusBadge.innerText = 'В ПОЗЖЕ';
                statusBadge.style.background = '#ff9500';
                statusBadge.style.display = 'block';
            } else if (libraryState.watched.has(pid)) {
                statusBadge.innerText = 'В АРХИВЕ';
                statusBadge.style.background = '#34c759';
                statusBadge.style.display = 'block';
            }
        }
        if (data.poster) document.getElementById('det-img').src = data.poster;
        
        list.innerHTML = '';
        if (data.error) {
            list.innerHTML = `<div style="text-align:center; padding:20px;">${data.error}</div>`;
        }

        if (data.franchises && data.franchises.length > 0) {
            if (franchiseContainer) {
                const fTitle = document.createElement('div');
                fTitle.className = 'season-title';
                fTitle.innerText = 'Связанные проекты';
                franchiseContainer.appendChild(fTitle);

                const fScroll = document.createElement('div');
                fScroll.className = 'franchise-scroll';

                data.franchises.forEach(f => {
                    const item = document.createElement('div');
                    item.className = 'franchise-card';
                    item.onclick = () => openDetails(f.url, f.title, f.poster);
                    item.innerHTML = `
                        <img src="${f.poster}">
                        <div class="f-info">
                            <div class="f-title">${f.title}</div>
                            <div class="f-year">${f.info || f.year || ''}</div>
                        </div>
                    `;
                    fScroll.appendChild(item);
                });
                franchiseContainer.appendChild(fScroll);
            }
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
                    
                    // --- ДАТА СЕРИИ ---
                    const dateHtml = ep.date ? `<div class="ep-date">${ep.date}</div>` : '';
                    
                    // --- НАЗВАНИЯ СЕРИИ ---
                    let episodeTitlesHtml = '';
                    if (ep.episode_title_ru || ep.episode_title_en) {
                        episodeTitlesHtml = '<div class="ep-titles">';
                        
                        // Якщо є російська назва - показуємо тільки її
                        if (ep.episode_title_ru) {
                            episodeTitlesHtml += `<div class="ep-title-ru">${ep.episode_title_ru}</div>`;
                        }
                        // Англійську показуємо ТІЛЬКИ якщо немає російської
                        else if (ep.episode_title_en) {
                            episodeTitlesHtml += `<div class="ep-title-en">${ep.episode_title_en}</div>`;
                        }
                        
                        episodeTitlesHtml += '</div>';
                    }
                    
                    row.innerHTML = `
                        <div class="ep-info">
                            <span>${ep.title}</span>
                            ${dateHtml}
                            ${episodeTitlesHtml}
                        </div>
                        <div class="check ${ep.watched ? 'active' : ''}" onclick="toggle('${ep.global_id}', this)"></div>
                    `;
                    row.querySelector('.check').rowElement = row;
                    list.appendChild(row);
                });
            });
        }
    } catch (e) {
        list.innerHTML = '<div style="text-align:center; padding:20px;">Ошибка загрузки</div>';
    }
}

function closeDetails() {
    document.getElementById('details').classList.remove('open');
}

async function moveMovie(category) {
    if (!currentPostId) {
        alert('Ошибка: ID фильма не найден');
        return;
    }
    tg.HapticFeedback.notificationOccurred('success');
    await fetch('/api/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: currentPostId, category: category })
    });
    alert('Перенесено!');
    closeDetails();
    await updateLibraryState();
    loadGrid(currentCategory);
}

async function deleteMovie() {
    if (!currentPostId) {
        alert('Ошибка: ID фильма не найден');
        return;
    }
    tg.HapticFeedback.notificationOccurred('success');
    await fetch('/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: currentPostId, category: currentCategory })
    });
    alert('Удалено!');
    closeDetails();
    await updateLibraryState();
    loadGrid(currentCategory);
}

async function toggle(gid, btn) {
    tg.HapticFeedback.impactOccurred('medium');
    const row = btn.rowElement;
    const isActive = btn.classList.contains('active');
    if (isActive) {
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
    
    const toolbar = document.getElementById('toolbar');
    if (toolbar) toolbar.style.display = 'none';

    document.getElementById('search-ui').style.display = 'block';
    const input = document.getElementById('q');
    input.focus();
    input.value = ''; 
    document.getElementById('search-results').innerHTML = '';
}

let searchTimer;
function doSearch(val) {
    clearTimeout(searchTimer);
    if (val.length === 0) {
        document.getElementById('search-results').innerHTML = '';
        return;
    }
    searchTimer = setTimeout(async () => {
        if (val.length < 3) return;
        const res = await fetch(`/api/search?q=${encodeURIComponent(val)}`);
        const data = await res.json();
        const list = document.getElementById('search-results');
        list.innerHTML = '';
        
        data.forEach(item => {
            const div = document.createElement('div');
            div.className = 'search-item';
            div.id = `search-item-${item.id}`; // Добавляем ID для обновления
            
            // --- ПРОВЕРКА СТАТУСА ---
            const itemIdStr = String(item.id);
            let statusBadge = '';
            
            if (libraryState.watching.has(itemIdStr)) {
                statusBadge = '<span class="search-status-exists" style="background:#007aff">В Смотрю</span>';
            } else if (libraryState.later.has(itemIdStr)) {
                statusBadge = '<span class="search-status-exists" style="background:#ff9500">В Позже</span>';
            } else if (libraryState.watched.has(itemIdStr)) {
                statusBadge = '<span class="search-status-exists" style="background:#34c759">В Архиве</span>';
            }

            let titleHTML = item.title || 'Без названия';
            
            div.innerHTML = `
                <div class="search-header">
                    <div class="search-title">${titleHTML}</div>
                    ${statusBadge}
                </div>
                <div class="search-actions">
                    <button class="btn-watch-outline" onclick="addFav('${item.id}', 'watching', this)">+ Смотрю</button>
                    <button class="btn-later-outline" onclick="addFav('${item.id}', 'later', this)">+ Позже</button>
                    <button class="btn-done-outline" onclick="addFav('${item.id}', 'watched', this)">✔ Архив</button>
                </div>
            `;
            list.appendChild(div);
        });
    }, 600);
}

// ИСПРАВЛЕННАЯ ФУНКЦИЯ ДОБАВЛЕНИЯ
async function addFav(id, cat, btn) {
    let postId = id;
    const match = String(id).match(/\/(\d+)(?:-|\.)/);
    if (match) {
        postId = match[1];
    }

    // Визуальный отклик на кнопке
    const originalText = btn.innerText;
    btn.innerText = '...';
    
    tg.HapticFeedback.notificationOccurred('success');
    try {
        const res = await fetch('/api/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ post_id: postId, category: cat })
        });
        const data = await res.json();
        
        if (data.success) {
            btn.innerText = 'OK!';
            // Обновляем библиотеку и перерисовываем бейдж в поиске
            await updateLibraryState();
            
            // Находим элемент в списке и обновляем бейдж
            const itemDiv = document.getElementById(`search-item-${id}`);
            if (itemDiv) {
                const header = itemDiv.querySelector('.search-header');
                // Удаляем старый бейдж если есть
                const oldBadge = header.querySelector('.search-status-exists');
                if (oldBadge) oldBadge.remove();
                
                let badgeColor = '#007aff';
                let badgeText = 'В Смотрю';
                if (cat === 'later') { badgeColor = '#ff9500'; badgeText = 'В Позже'; }
                if (cat === 'watched') { badgeColor = '#34c759'; badgeText = 'В Архиве'; }
                
                header.innerHTML += `<span class="search-status-exists" style="background:${badgeColor}">${badgeText}</span>`;
            }
            
            setTimeout(() => { btn.innerText = originalText; }, 1000);
        } else {
            alert('Ошибка добавления');
            btn.innerText = originalText;
        }
    } catch (e) {
        alert('Ошибка сети');
        btn.innerText = originalText;
    }
}

// Инициализация
loadGrid('watching');
updateLibraryState();