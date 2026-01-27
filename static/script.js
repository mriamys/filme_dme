const tg = window.Telegram.WebApp;
tg.expand();

// Текущая выбранная категория
let currentCategory = 'watching';
// Кэш (хранит данные, пришедшие с сервера)
let allLoadedItems = [];
// Текущий метод сортировки (по умолчанию 'added')
let currentSort = 'added';

// Функция смены сортировки через <select>
function changeSort(val) {
    currentSort = val;
    // При смене сортировки загружаем данные заново с сервера
    loadGrid(currentCategory);
}

// Переключение вкладок
async function switchTab(cat, btn) {
    currentCategory = cat;
    
    // Скрываем поиск, показываем сетку
    document.getElementById('search-ui').style.display = 'none';
    document.getElementById('grid').style.display = 'grid';
    
    // Показываем тулбар сортировки (если мы не в поиске)
    const toolbar = document.getElementById('toolbar');
    if (toolbar) toolbar.style.display = 'flex';
    
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    
    loadGrid(cat);
}

// Функция отрисовки (просто выводит данные)
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
        
        // Если выбран фильтр "По году", отображаем год на карточке
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

// Загрузка сетки
async function loadGrid(cat) {
    const grid = document.getElementById('grid');
    grid.innerHTML = '<div style="grid-column:span 2; text-align:center; padding:30px; color:#666">Загрузка...</div>';
    
    try {
        // Передаем параметр сортировки на сервер
        const res = await fetch(`/api/${cat}?sort=${currentSort}`);
        const data = await res.json();
        
        if (!data || data.length === 0) {
            allLoadedItems = [];
            renderSortedGrid();
            return;
        }
        
        allLoadedItems = data;
        renderSortedGrid();
        
    } catch (e) {
        console.error(e);
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
    document.getElementById('det-controls').style.display = 'none';
    
    // --- ВОТ ЭТОГО НЕ БЫЛО ИЛИ НЕ РАБОТАЛО ---
    // Устанавливаем ссылку для кнопки "На сайте"
    const siteLink = document.getElementById('det-site-link');
    if (siteLink) {
        siteLink.href = url; // url теперь абсолютный благодаря rezka_client.py
    }
    // -----------------------------------------
    
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
                    row.innerHTML = `
                        <span style="flex:1; padding-right:10px;">${ep.title}</span>
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
    
    // Скрываем панель сортировки в поиске
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
            
            let titleHTML = item.title || 'Без названия';
            
            div.innerHTML = `
                <div class="search-title">${titleHTML}</div>
                <div class="search-actions">
                    <button class="btn-action btn-watch" onclick="addFav('${item.id}', 'watching')">+ Смотрю</button>
                    <button class="btn-action btn-later" onclick="addFav('${item.id}', 'later')">+ Позже</button>
                    <button class="btn-action btn-done" onclick="addFav('${item.id}', 'watched')">✔ Архив</button>
                </div>
            `;
            list.appendChild(div);
        });
    }, 600);
}

// ИСПРАВЛЕННАЯ ФУНКЦИЯ ДОБАВЛЕНИЯ
async function addFav(id, cat) {
    let postId = id;
    const match = String(id).match(/\/(\d+)(?:-|\.)/);
    if (match) {
        postId = match[1];
    }

    tg.HapticFeedback.notificationOccurred('success');
    try {
        const res = await fetch('/api/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ post_id: postId, category: cat })
        });
        const data = await res.json();
        if (data.success) {
            alert('Добавлено!');
        } else {
            alert('Ошибка добавления');
        }
    } catch (e) {
        alert('Ошибка сети');
    }
}

// Инициализация
loadGrid('watching');