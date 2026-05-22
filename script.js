const API_URL = 'https://api.pixeimg.ru';

const uploadScreen = document.getElementById('uploadScreen');
const viewScreen = document.getElementById('viewScreen');
const errorScreen = document.getElementById('errorScreen');
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const progressCont = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressPct = document.getElementById('progressPercent');
const progressFName = document.getElementById('progressFileName');
const resultBlock = document.getElementById('resultBlock');
const resultLink = document.getElementById('resultLink');
const resultCount = document.getElementById('resultCount');
const copyResultBtn = document.getElementById('copyResultBtn');
const openAlbumBtn = document.getElementById('openAlbumBtn');
const newUploadBtn = document.getElementById('newUploadBtn');
const viewContent = document.getElementById('viewContent');
const errorText = document.getElementById('errorText');
const goUploadBtn = document.getElementById('goUploadBtn');
const toastCont = document.getElementById('toastContainer');

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 30 МБ
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/dng'];
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

let currentUser = null;

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    toast.innerHTML = `<span>${icons[type]}</span> ${message}`;
    toastCont.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function generateToken() {
    return 'xxxxxxxxxxxx'.replace(/x/g, () =>
        Math.floor(Math.random() * 16).toString(16)
    );
}

function showScreen(screen) {
    [uploadScreen, viewScreen, errorScreen].forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
}

function formatTimeLeft(msLeft) {
    if (msLeft <= 0) return { text: 'Удалено', cssClass: 'danger' };
    const totalSec = Math.floor(msLeft / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    let text = '';
    if (days > 0) text += `${days}д `;
    if (hours > 0) text += `${hours}ч `;
    text += `${mins}мин`;
    let cssClass = '';
    if (msLeft < 3600000) cssClass = 'danger';
    else if (msLeft < 86400000) cssClass = 'warning';
    return { text, cssClass };
}

function validateFiles(files) {
    for (const file of files) {
        if (!ALLOWED_TYPES.includes(file.type))
            return `Недопустимый формат: ${file.name}`;
        if (file.size > MAX_FILE_SIZE)
            return `Файл ${file.name} больше 10 МБ`;
    }
    return null;
}

function getOwnerToken() {
    if (currentUser) return currentUser.owner_token;
    let ownerToken = localStorage.getItem('pixeimg_owner');
    if (!ownerToken) {
        ownerToken = generateToken();
        localStorage.setItem('pixeimg_owner', ownerToken);
    }
    return ownerToken;
}

function login(username, password) {
    return fetch(API_URL + '/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    }).then(r => r.json());
}

function register(username, password) {
    return fetch(API_URL + '/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    }).then(r => r.json());
}

function uploadFile(file) {
    return new Promise((resolve, reject) => {
        const fd = new FormData();
        fd.append('file', file);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', API_URL + '/upload', true);

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100);
                progressFill.style.width = `${pct}%`;
                progressPct.textContent = `${pct}%`;
            }
        });

        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                const data = JSON.parse(xhr.responseText);
                resolve({ url: data.url, filename: data.filename, originalName: file.name });
            } else {
                reject(new Error('Ошибка загрузки'));
            }
        });

        xhr.addEventListener('error', () => reject(new Error('Сетевая ошибка')));
        xhr.send(fd);
    });
}

async function handleFiles(files) {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const error = validateFiles(fileArray);
    if (error) { showToast(error, 'error'); return; }

    uploadZone.style.display = 'none';
    resultBlock.classList.remove('active');
    progressCont.classList.add('active');

    const ownerToken = getOwnerToken();
    const albumId = generateToken();
    const photos = [];
    let uploaded = 0;
    const total = fileArray.length;

    for (let i = 0; i < fileArray.length; i++) {
        progressFName.textContent = `(${uploaded + 1}/${total}) ${fileArray[i].name}`;
        progressFill.style.width = '0%';
        progressPct.textContent = '0%';

        try {
            const result = await uploadFile(fileArray[i]);
            photos.push(result);
            uploaded++;
        } catch (err) {
            showToast(`Ошибка: ${fileArray[i].name}`, 'error');
        }
    }

    progressCont.classList.remove('active');

    if (photos.length === 0) {
        uploadZone.style.display = '';
        return;
    }

    try {
        const resp = await fetch(API_URL + '/albums', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                album_id: albumId,
                owner_token: ownerToken,
                photos: photos
            })
        });
        if (!resp.ok) throw new Error('Ошибка сохранения');
    } catch (err) {
        showToast('Ошибка сохранения альбома', 'error');
        uploadZone.style.display = '';
        return;
    }

    const shareUrl = `${window.location.origin}${window.location.pathname}?album=${albumId}`;
    const ownerUrl = `${window.location.origin}${window.location.pathname}?album=${albumId}&owner=${ownerToken}`;

    window.history.replaceState({}, '', ownerUrl);
    resultLink.value = shareUrl;
    resultCount.textContent = `Фото в альбоме: ${photos.length}`;
    resultBlock.dataset.ownerUrl = ownerUrl;
    resultBlock.classList.add('active');
    showToast(`Альбом загружен! ${photos.length} фото`, 'success');
    fileInput.value = '';
}

async function loadAlbum(albumId, ownerParam) {
    let album;
    try {
        const resp = await fetch(API_URL + '/album/' + albumId);
        if (!resp.ok) throw new Error('Not found');
        album = await resp.json();
    } catch (err) {
        showScreen(errorScreen);
        errorText.textContent = 'Альбом не найден или срок хранения истёк.';
        return;
    }

    const createdAt = new Date(album.created_at).getTime();
    const age = Date.now() - createdAt;

    if (age > MAX_AGE_MS) {
        try { await fetch(API_URL + '/delete/' + albumId); } catch (_) {}
        showScreen(errorScreen);
        errorText.textContent = 'Срок хранения истёк (7 дней). Альбом удалён.';
        return;
    }

    const localOwner = localStorage.getItem('pixeimg_owner');
    const isOwner = (ownerParam && ownerParam === album.owner_token) ||
        (localOwner && localOwner === album.owner_token) ||
        (currentUser && currentUser.owner_token === album.owner_token);
    const photos = album.photos;
    const msLeft = MAX_AGE_MS - age;
    const { text: timeText, cssClass } = formatTimeLeft(msLeft);

    let gridHtml = '';
    photos.forEach((photo, idx) => {
        gridHtml += `<img src="${photo.url}" alt="${photo.originalName}" class="album__thumb" data-index="${idx}" title="Кликните для просмотра">`;
    });

    viewContent.innerHTML = `
        <div class="album__header">
            <h2 class="album__title">📁 Альбом (${photos.length} фото)</h2>
            <span class="album__timer ${cssClass}">⏳ Осталось: ${timeText}</span>
        </div>
        <div class="album__grid">${gridHtml}</div>
        <div class="album__actions">
            <button class="btn" id="copyAlbumBtn">📋 Копировать ссылку</button>
            ${isOwner ? '<button class="btn btn--danger" id="deleteAlbumBtn">🗑️ Удалить альбом</button>' : ''}
        </div>
    `;

    showScreen(viewScreen);

    let currentIndex = 0;

    function openLightbox(index) {
        currentIndex = index;
        const existing = document.querySelector('.lightbox');
        if (existing) existing.remove();

        const lb = document.createElement('div');
        lb.className = 'lightbox active';
        lb.innerHTML = `
            <button class="lightbox__close">&times;</button>
            <img src="${photos[currentIndex].url}" alt="" class="lightbox__image" id="lightboxImg">
            <span class="lightbox__counter">${currentIndex + 1} / ${photos.length}</span>
            <div class="lightbox__nav">
                <button id="lbPrev">⬅ Назад</button>
                <button id="lbNext">Вперёд ➡</button>
            </div>
        `;
        document.body.appendChild(lb);

        const updateLb = () => {
            document.getElementById('lightboxImg').src = photos[currentIndex].url;
            lb.querySelector('.lightbox__counter').textContent = `${currentIndex + 1} / ${photos.length}`;
        };

        lb.querySelector('.lightbox__close').addEventListener('click', () => lb.remove());
        lb.addEventListener('click', (e) => { if (e.target === lb) lb.remove(); });

        document.getElementById('lbPrev').addEventListener('click', (e) => {
            e.stopPropagation();
            currentIndex = (currentIndex - 1 + photos.length) % photos.length;
            updateLb();
        });

        document.getElementById('lbNext').addEventListener('click', (e) => {
            e.stopPropagation();
            currentIndex = (currentIndex + 1) % photos.length;
            updateLb();
        });

        document.addEventListener('keydown', function handler(e) {
            if (!document.querySelector('.lightbox.active')) {
                document.removeEventListener('keydown', handler);
                return;
            }
            if (e.key === 'Escape') lb.remove();
            if (e.key === 'ArrowLeft') { currentIndex = (currentIndex - 1 + photos.length) % photos.length; updateLb(); }
            if (e.key === 'ArrowRight') { currentIndex = (currentIndex + 1) % photos.length; updateLb(); }
        });
    }

    document.querySelectorAll('.album__thumb').forEach(thumb => {
        thumb.addEventListener('click', () => openLightbox(parseInt(thumb.dataset.index)));
    });

    document.getElementById('copyAlbumBtn').addEventListener('click', () => {
        const url = `${window.location.origin}${window.location.pathname}?album=${albumId}`;
        navigator.clipboard.writeText(url)
            .then(() => showToast('Ссылка на альбом скопирована', 'success'))
            .catch(() => showToast('Не удалось скопировать', 'error'));
    });

    if (isOwner) {
        document.getElementById('deleteAlbumBtn').addEventListener('click', async () => {
            try { await fetch(API_URL + '/delete/' + albumId); } catch (_) {}
            showToast('Альбом удалён', 'success');
            showScreen(errorScreen);
            errorText.textContent = 'Альбом удалён владельцем.';
        });
    }

    const timerInterval = setInterval(() => {
        const remaining = MAX_AGE_MS - (Date.now() - createdAt);
        const timerEl = viewContent.querySelector('.album__timer');
        if (!timerEl) { clearInterval(timerInterval); return; }
        const { text, cssClass: cls } = formatTimeLeft(Math.max(0, remaining));
        timerEl.textContent = `⏳ Осталось: ${text}`;
        timerEl.className = `album__timer ${cls}`;
        if (remaining <= 0) {
            clearInterval(timerInterval);
            showScreen(errorScreen);
            errorText.textContent = 'Срок хранения истёк (7 дней). Альбом удалён.';
        }
    }, 1000);
}

async function loadMyAlbums() {
    if (!currentUser) return;
    try {
        const resp = await fetch(API_URL + '/my-albums?token=' + currentUser.owner_token);
        const albums = await resp.json();

        let html = '<h2>📁 Мои альбомы</h2>';
        if (albums.length === 0) {
            html += '<p>У вас пока нет альбомов.</p>';
        } else {
            html += '<div class="my-albums__list">';
            albums.forEach(album => {
                const createdAt = new Date(album.created_at);
                const date = createdAt.toLocaleDateString();
                html += `
                    <div class="my-albums__item">
                        <span>🖼️ ${album.photos.length} фото — ${date}</span>
                        <button class="btn btn--primary open-my-album" data-id="${album.album_id}">Открыть</button>
                        <button class="btn btn--danger delete-my-album" data-id="${album.album_id}">Удалить</button>
                    </div>
                `;
            });
            html += '</div>';
        }
        html += '<button class="btn btn--new" id="backToUploadBtn">⬅ К загрузке</button>';

        viewContent.innerHTML = html;
        showScreen(viewScreen);

        document.querySelectorAll('.open-my-album').forEach(btn => {
            btn.addEventListener('click', () => loadAlbum(btn.dataset.id, currentUser.owner_token));
        });

        document.querySelectorAll('.delete-my-album').forEach(btn => {
            btn.addEventListener('click', async () => {
                await fetch(API_URL + '/delete/' + btn.dataset.id);
                showToast('Альбом удалён', 'success');
                loadMyAlbums();
            });
        });

        document.getElementById('backToUploadBtn').addEventListener('click', () => {
            showScreen(uploadScreen);
            uploadZone.style.display = '';
        });
    } catch (err) {
        showToast('Ошибка загрузки альбомов', 'error');
    }
}

uploadZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) handleFiles(fileInput.files);
});

uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('drag-over');
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
});

document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

copyResultBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(resultLink.value)
        .then(() => showToast('Ссылка скопирована!', 'success'))
        .catch(() => showToast('Не удалось скопировать', 'error'));
});

openAlbumBtn.addEventListener('click', () => {
    const url = resultBlock.dataset.ownerUrl;
    if (url) window.location.href = url;
});

newUploadBtn.addEventListener('click', () => {
    resultBlock.classList.remove('active');
    uploadZone.style.display = '';
    fileInput.value = '';
    window.history.replaceState({}, '', window.location.pathname);
});

goUploadBtn.addEventListener('click', () => {
    window.location.href = window.location.pathname;
});

async function init() {
    const token = localStorage.getItem('pixeimg_user_token');
    if (token) {
        currentUser = { owner_token: token, username: localStorage.getItem('pixeimg_username') };
    }

    const params = new URLSearchParams(window.location.search);
    const albumId = params.get('album');
    const owner = params.get('owner');

    if (albumId) {
        uploadScreen.classList.remove('active');
        await loadAlbum(albumId, owner);
    } else {
        showScreen(uploadScreen);
    }

    if (currentUser) {
        const myAlbumsBtn = document.createElement('button');
        myAlbumsBtn.className = 'btn';
        myAlbumsBtn.textContent = '📁 Мои альбомы';
        myAlbumsBtn.id = 'myAlbumsBtn';
        myAlbumsBtn.style.position = 'fixed';
        myAlbumsBtn.style.top = '1rem';
        myAlbumsBtn.style.right = '1rem';
        myAlbumsBtn.style.zIndex = '100';
        myAlbumsBtn.addEventListener('click', loadMyAlbums);
        document.body.appendChild(myAlbumsBtn);

        const logoutBtn = document.createElement('button');
        logoutBtn.className = 'btn btn--danger';
        logoutBtn.textContent = '🚪 Выйти';
        logoutBtn.style.position = 'fixed';
        logoutBtn.style.top = '3.5rem';
        logoutBtn.style.right = '1rem';
        logoutBtn.style.zIndex = '100';
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('pixeimg_user_token');
            localStorage.removeItem('pixeimg_username');
            currentUser = null;
            location.reload();
        });
        document.body.appendChild(logoutBtn);
    } else {
        const loginBtn = document.createElement('button');
        loginBtn.className = 'btn';
        loginBtn.textContent = '🔐 Войти';
        loginBtn.style.position = 'fixed';
        loginBtn.style.top = '1rem';
        loginBtn.style.right = '1rem';
        loginBtn.style.zIndex = '100';
        loginBtn.addEventListener('click', showLoginForm);
        document.body.appendChild(loginBtn);
    }

    setInterval(async () => {
        try {
            const resp = await fetch(API_URL + '/albums');
            const albums = await resp.json();
            const now = Date.now();
            for (const album of albums) {
                if (now - new Date(album.created_at).getTime() > MAX_AGE_MS) {
                    await fetch(API_URL + '/delete/' + album.album_id);
                }
            }
        } catch (_) {}
    }, 30000);
}

function showLoginForm() {
    viewContent.innerHTML = `
        <div class="auth-form">
            <h2 class="auth-form__title">Вход / Регистрация</h2>
            <input type="text" id="authUsername" class="auth-form__input" placeholder="Логин">
            <input type="password" id="authPassword" class="auth-form__input" placeholder="Пароль">
            <div class="auth-form__actions">
                <button class="btn btn--primary" id="authLoginBtn">Войти</button>
                <button class="btn" id="authRegisterBtn">Регистрация</button>
                <button class="btn" id="authCancelBtn">Отмена</button>
            </div>
        </div>
    `;
    showScreen(viewScreen);

    document.getElementById('authLoginBtn').addEventListener('click', async () => {
        const username = document.getElementById('authUsername').value;
        const password = document.getElementById('authPassword').value;
        const result = await login(username, password);
        if (result.error) {
            showToast(result.error, 'error');
        } else {
            currentUser = result;
            localStorage.setItem('pixeimg_user_token', result.owner_token);
            localStorage.setItem('pixeimg_username', result.username);
            showToast('Вход выполнен', 'success');
            location.reload();
        }
    });

    document.getElementById('authRegisterBtn').addEventListener('click', async () => {
        const username = document.getElementById('authUsername').value;
        const password = document.getElementById('authPassword').value;
        const result = await register(username, password);
        if (result.error) {
            showToast(result.error, 'error');
        } else {
            currentUser = result;
            localStorage.setItem('pixeimg_user_token', result.owner_token);
            localStorage.setItem('pixeimg_username', username);
            showToast('Регистрация успешна', 'success');
            location.reload();
        }
    });

    document.getElementById('authCancelBtn').addEventListener('click', () => {
        showScreen(uploadScreen);
        uploadZone.style.display = '';
    });
}

document.addEventListener('DOMContentLoaded', init);