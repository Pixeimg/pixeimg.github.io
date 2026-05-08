const SUPABASE_URL = 'https://kbicrfhbyttjkbblrzzr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__YqXCFJaA6fHyVPHXzTKnw_OPih6Wa8';

const supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
if (!supabaseClient) throw new Error('Supabase SDK не загружен');

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

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

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

function getPublicUrl(fileName) {
    const { data } = supabaseClient.storage.from('images').getPublicUrl(fileName);
    return data?.publicUrl || '';
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
    let ownerToken = localStorage.getItem('pixeimg_owner');
    if (!ownerToken) {
        ownerToken = generateToken();
        localStorage.setItem('pixeimg_owner', ownerToken);
    }
    return ownerToken;
}

function uploadFile(file, albumId, fileIndex) {
    return new Promise((resolve, reject) => {
        const safeName = file.name.replace(/[^a-zA-Zа-яА-Я0-9._-]/g, '_');
        const uniqueFileName = `${albumId}_${fileIndex}_${safeName}`;
        const uploadUrl = `${SUPABASE_URL}/storage/v1/object/images/${uniqueFileName}`;

        const xhr = new XMLHttpRequest();
        xhr.open('POST', uploadUrl, true);
        xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
        xhr.setRequestHeader('Authorization', `Bearer ${SUPABASE_ANON_KEY}`);

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100);
                progressFill.style.width = `${pct}%`;
                progressPct.textContent = `${pct}%`;
            }
        });

        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve({ fileName: uniqueFileName, publicUrl: getPublicUrl(uniqueFileName), originalName: file.name });
            } else {
                let msg = `Ошибка ${xhr.status}`;
                try { msg = JSON.parse(xhr.responseText).message || msg; } catch (_) {}
                reject(new Error(msg));
            }
        });

        xhr.addEventListener('error', () => reject(new Error('Сетевая ошибка')));
        xhr.addEventListener('abort', () => reject(new Error('Отменено')));

        const fd = new FormData();
        fd.append('file', file, uniqueFileName);
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
            const result = await uploadFile(fileArray[i], albumId, i);
            photos.push(result);
            uploaded++;
        } catch (err) {
            showToast(`Ошибка: ${fileArray[i].name} — ${err.message}`, 'error');
        }
    }

    progressCont.classList.remove('active');

    if (photos.length === 0) {
        uploadZone.style.display = '';
        return;
    }

    const { error: dbError } = await supabaseClient
        .from('albums')
        .insert([{
            album_id: albumId,
            owner_token: ownerToken,
            photos: photos,
            created_at: new Date().toISOString()
        }]);

    if (dbError) {
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
    const { data, error } = await supabaseClient
        .from('albums')
        .select('*')
        .eq('album_id', albumId)
        .maybeSingle();

    if (error || !data) {
        showScreen(errorScreen);
        errorText.textContent = 'Альбом не найден или срок хранения истёк.';
        return;
    }

    const age = Date.now() - new Date(data.created_at).getTime();
    if (age > MAX_AGE_MS) {
        for (const photo of data.photos) {
            await supabaseClient.storage.from('images').remove([photo.fileName]);
        }
        await supabaseClient.from('albums').delete().eq('album_id', albumId);
        showScreen(errorScreen);
        errorText.textContent = 'Срок хранения истёк (7 дней). Альбом удалён.';
        return;
    }

    const localOwner = localStorage.getItem('pixeimg_owner');
    const isOwner = (ownerParam && ownerParam === data.owner_token) || (localOwner && localOwner === data.owner_token);
    const photos = data.photos;
    const msLeft = MAX_AGE_MS - age;
    const { text: timeText, cssClass } = formatTimeLeft(msLeft);

    let gridHtml = '';
    photos.forEach((photo, idx) => {
        gridHtml += `<img src="${photo.publicUrl}" alt="${photo.originalName}" class="album__thumb" data-index="${idx}" title="Кликните для просмотра">`;
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
            <img src="${photos[currentIndex].publicUrl}" alt="" class="lightbox__image" id="lightboxImg">
            <span class="lightbox__counter">${currentIndex + 1} / ${photos.length}</span>
            <div class="lightbox__nav">
                <button id="lbPrev">⬅ Назад</button>
                <button id="lbNext">Вперёд ➡</button>
            </div>
        `;
        document.body.appendChild(lb);

        const updateLb = () => {
            document.getElementById('lightboxImg').src = photos[currentIndex].publicUrl;
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
            for (const photo of photos) {
                await supabaseClient.storage.from('images').remove([photo.fileName]);
            }
            await supabaseClient.from('albums').delete().eq('album_id', albumId);
            showToast('Альбом удалён', 'success');
            showScreen(errorScreen);
            errorText.textContent = 'Альбом удалён владельцем.';
        });
    }

    const timerInterval = setInterval(() => {
        const remaining = MAX_AGE_MS - (Date.now() - new Date(data.created_at).getTime());
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
    const params = new URLSearchParams(window.location.search);
    const albumId = params.get('album');
    const owner = params.get('owner');

    if (albumId) {
        uploadScreen.classList.remove('active');
        await loadAlbum(albumId, owner);
    } else {
        showScreen(uploadScreen);
    }

    setInterval(async () => {
        const { data: albums } = await supabaseClient.from('albums').select('*');
        if (!albums) return;
        const now = Date.now();
        for (const album of albums) {
            if (now - new Date(album.created_at).getTime() > MAX_AGE_MS) {
                for (const photo of album.photos) {
                    await supabaseClient.storage.from('images').remove([photo.fileName]);
                }
                await supabaseClient.from('albums').delete().eq('album_id', album.album_id);
            }
        }
    }, 30000);
}

document.addEventListener('DOMContentLoaded', init);