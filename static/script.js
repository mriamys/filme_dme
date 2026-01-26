const tg = window.Telegram.WebApp;
tg.expand();

// Текущая выбранная категория (используется для удаления и обновления списка)
let currentCategory = 'watching';

// Переключение вкладок
async function switchTab(cat, btn) {
    currentCategory = cat;
    document.getElementById('search-ui').style.display = 'none';
    document.getElementById('grid').style.display = 'grid';
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    loadGrid(cat);
}

// Загрузка сетки для выбранной категории
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

// Переменные для деталей
let currentPostId = null;

// Открытие модального окна с деталями
async function openDetails(url, title, poster) {
    const modal = document.getElementById('details');
    modal.classList.add('open');
    document.getElementById('det-img').src = poster;
    document.getElementById('det-title').innerText = title;
    document.getElementById('det-controls').style.display = 'none';
    document.getElementById('franchise-list').innerHTML = '';
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
        // Рендер сезонов и эпизодов
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
        // Загружаем франшизу, если есть ссылка
        if (data.franchise_url) {
            loadFranchise(data.franchise_url);
        }
    } catch (e) {
        list.innerHTML = '<div style="text-align:center; padding:20px;">Ошибка загрузки</div>';
    }
}

// Закрыть модальное окно
function closeDetails() {
    document.getElementById('details').classList.remove('open');
}

// Переместить фильм/сериал в другую категорию
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
    // Перезагружаем текущую вкладку
    switchTab(currentCategory, document.querySelector('.tab-btn.active'));
}

// Удалить фильм/сериал из текущей категории
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
    switchTab(currentCategory, document.querySelector('.tab-btn.active'));
}

// Переключить статус просмотра эпизода
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
        body: JSON.stringify({ global_id: gid })
    });
}

// Открыть поиск
function openSearch(btn) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('grid').style.display = 'none';
    document.getElementById('search-ui').style.display = 'block';
    document.getElementById('q').focus();
}

// Поиск с таймером
let searchTimer;
function doSearch(val) {
    clearTimeout(searchTimer);
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
                    <button class="btn-action btn-done" onclick="addFav('${item.id}', 'watched')">✔ Архив</button>
                </div>
            `;
            list.appendChild(div);
        });
    }, 600);
}

// Добавить фильм/сериал из поиска
async function addFav(id, cat) {
    tg.HapticFeedback.notificationOccurred('success');
    await fetch('/api/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: id, category: cat })
    });
    alert('Добавлено!');
}

// Загрузка франшизных проектов
async function loadFranchise(url) {
    try {
        const res = await fetch('/api/franchise?url=' + encodeURIComponent(url));
        const items = await res.json();
        const container = document.getElementById('franchise-list');
        if (!items || items.length === 0) {
            container.innerHTML = '';
            return;
        }
        let html = '<div class="fr-title">Франшиза</div>';
        items.forEach(item => {
            html += `<div class="fr-item" onclick="openDetails('${item.url}', '${item.title}', '${item.poster || ''}')">
                        <img src="${item.poster}" alt="" class="fr-img">
                        <div class="fr-name">${item.title}${item.year ? ' (' + item.year + ')' : ''}</div>
                    </div>`;
        });
        container.innerHTML = html;
    } catch (e) {
        console.error('Ошибка загрузки франшизы', e);
    }
}

// Инициализация: подгружаем список «Смотрю»
loadGrid('watching');
