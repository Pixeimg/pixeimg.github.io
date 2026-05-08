/**
 * ============================================================
 * PixeImg — Фотохостинг с автоудалением через 7 дней
 * Интеграция с Supabase (Storage + База данных)
 * ============================================================
 *
 * ПЕРЕД ЗАПУСКОМ ЗАМЕНИТЕ ЭТИ ЗНАЧЕНИЯ НА СВОИ:
 * 1. SUPABASE_URL — URL вашего проекта Supabase
 * 2. SUPABASE_ANON_KEY — анонимный ключ (публичный)
 *
 * Найти их можно в Supabase Dashboard → Settings → API
 */

const SUPABASE_URL = 'https://kbicrfhbyttjkbblrzzr.supabase.co/'; // ← ЗАМЕНИТЬ
const SUPABASE_ANON_KEY = 'sb_publishable__YqXCFJaA6fHyVPHXzTKnw_OPih6Wa8';             // ← ЗАМЕНИТЬ

// ===== ИНИЦИАЛИЗАЦИЯ SUPABASE КЛИЕНТА =====
// Используем свою переменную, чтобы избежать конфликта с глобальной 'supabase'
const supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Проверка наличия SDK
if (!supabaseClient) {
    alert('Ошибка: Supabase SDK не загружен. Проверьте подключение CDN.');
    throw new Error('Supabase SDK не найден');
}

// ===== DOM-ЭЛЕМЕНТЫ =====
const uploadZone    = document.getElementById('uploadZone');
const fileInput     = document.getElementById('fileInput');
const gallery       = document.getElementById('gallery');
const emptyState    = document.getElementById('emptyState');
const progressCont  = document.getElementById('progressContainer');
const progressFill  = document.getElementById('progressFill');
const progressPct   = document.getElementById('progressPercent');
const progressFName = document.getElementById('progressFileName');
const imageModal    = document.getElementById('imageModal');
const modalImage    = document.getElementById('modalImage');
const modalClose    = document.getElementById('modalClose');
const modalOverlay  = document.getElementById('modalOverlay');
const toastCont     = document.getElementById('toastContainer');

// ===== ГЛОБАЛЬНЫЕ СОСТОЯНИЯ =====
let countdownInterval = null;  // Таймер обновления обратного отсчёта
let cleanupInterval   = null;  // Таймер автоочистки (каждые 30 сек)

// Константы
const MAX_FILE_SIZE  = 10 * 1024 * 1024; // 10 МБ
const ALLOWED_TYPES  = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_AGE_MS     = 7 * 24 * 60 * 60 * 1000; // 7 дней в миллисекундах

// ============================================================
//  ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

/**
 * Показать toast-уведомление
 * @param {string} message - Текст сообщения
 * @param {'success'|'error'|'info'} type - Тип уведомления
 */
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;

    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    toast.innerHTML = `<span>${icons[type] || ''}</span> ${message}`;

    toastCont.appendChild(toast);

    // Автоудаление после завершения анимации
    setTimeout(() => {
        if (toast.parentNode) toast.remove();
    }, 3000);
}

/**
 * Форматировать время, оставшееся до удаления
 * @param {number} msLeft - Оставшееся время в миллисекундах
 * @returns {{ text: string, cssClass: string }}
 */
function formatTimeLeft(msLeft) {
    if (msLeft <= 0) return { text: 'Удаляется...', cssClass: 'card__timer--danger' };

    const totalSec = Math.floor(msLeft / 1000);
    const days  = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const mins  = Math.floor((totalSec % 3600) / 60);

    let text = '';
    if (days > 0)  text += `${days}д `;
    if (hours > 0) text += `${hours}ч `;
    text += `${mins}мин`;

    let cssClass = 'card__timer--normal';
    if (msLeft < 3_600_000)      cssClass = 'card__timer--danger';  // < 1 часа
    else if (msLeft < 86_400_000) cssClass = 'card__timer--warning'; // < 1 дня

    return { text, cssClass };
}

/**
 * Получить публичный URL файла в бакете images
 * @param {string} fileName
 * @returns {string}
 */
function getPublicUrl(fileName) {
    const { data } = supabaseClient.storage.from('images').getPublicUrl(fileName);
    return data?.publicUrl || '';
}

// ============================================================
//  РАБОТА С ГАЛЕРЕЕЙ
// ============================================================

/**
 * Загрузить все изображения из базы данных
 * @returns {Promise<Array>}
 */
async function fetchImages() {
    const { data, error } = await supabaseClient
        .from('images')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Ошибка загрузки изображений:', error);
        showToast('Не удалось загрузить галерею', 'error');
        return [];
    }
    return data || [];
}

/**
 * Обновить таймеры на всех карточках
 */
function updateCardTimers() {
    const timers = document.querySelectorAll('.js-timer');
    timers.forEach(timer => {
        const expiresAt = Number(timer.dataset.expiresAt);
        const msLeft = Math.max(0, expiresAt - Date.now());
        const { text, cssClass } = formatTimeLeft(msLeft);

        timer.textContent = `⏳ ${text}`;
        timer.className = `card__timer js-timer ${cssClass}`;
    });
}

/**
 * Отрендерить галерею изображений
 * @param {Array} images - Массив объектов изображений
 */
function renderGallery(images) {
    gallery.innerHTML = '';

    if (!images || images.length === 0) {
        emptyState.classList.remove('empty-state--hidden');
        return;
    }

    emptyState.classList.add('empty-state--hidden');

    images.forEach((img) => {
        const createdAt  = new Date(img.created_at).getTime();
        const expiresAt  = createdAt + MAX_AGE_MS;
        const msLeft     = Math.max(0, expiresAt - Date.now());
        const { text: timeText, cssClass } = formatTimeLeft(msLeft);

        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.id       = img.id;
        card.dataset.fileName = img.file_name;

        card.innerHTML = `
            <img 
                class="card__preview" 
                src="${img.url}" 
                alt="${img.file_name}" 
                loading="lazy"
                title="Открыть в полном размере"
            >
            <div class="card__body">
                <span class="card__filename" title="${img.file_name}">📄 ${img.file_name}</span>
                <span 
                    class="card__timer js-timer ${cssClass}" 
                    data-expires-at="${expiresAt}"
                >⏳ ${timeText}</span>
                <div class="card__actions">
                    <button class="btn btn--copy js-copy-btn" data-url="${img.url}">
                        📋 Копировать
                    </button>
                    <button class="btn btn--danger js-delete-btn" data-id="${img.id}" data-filename="${img.file_name}">
                        🗑️ Удалить
                    </button>
                </div>
            </div>
        `;

        // Обработчики событий
        const previewImg = card.querySelector('.card__preview');
        previewImg.addEventListener('click', () => openModal(img.url));

        const copyBtn = card.querySelector('.js-copy-btn');
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            copyToClipboard(img.url);
        });

        const deleteBtn = card.querySelector('.js-delete-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteImage(img.id, img.file_name);
        });

        gallery.appendChild(card);
    });

    // Запускаем таймер обновления, если ещё не запущен
    if (!countdownInterval) {
        countdownInterval = setInterval(updateCardTimers, 1000);
    }
}

// ============================================================
//  ЗАГРУЗКА ИЗОБРАЖЕНИЙ
// ============================================================

/**
 * Проверить файл на соответствие требованиям
 * @param {File} file
 * @returns {string|null} Ошибка или null
 */
function validateFile(file) {
    if (!ALLOWED_TYPES.includes(file.type)) {
        return `Файл «${file.name}» не является изображением (PNG, JPG, GIF, WebP)`;
    }
    if (file.size > MAX_FILE_SIZE) {
        const sizeMB = (file.size / 1024 / 1024).toFixed(1);
        return `Файл «${file.name}» слишком большой (${sizeMB} МБ). Максимум 10 МБ`;
    }
    return null;
}

/**
 * Загрузить файл в Supabase Storage с отслеживанием прогресса
 * @param {File} file
 * @returns {Promise<{fileName: string, publicUrl: string}>}
 */
function uploadFileWithProgress(file) {
    return new Promise((resolve, reject) => {
        const timestamp = Date.now();
        // Очищаем имя файла от спецсимволов
        const safeName = file.name.replace(/[^a-zA-Zа-яА-Я0-9._-]/g, '_');
        const uniqueFileName = `${timestamp}_${safeName}`;

        const uploadUrl = `${SUPABASE_URL}/storage/v1/object/images/${uniqueFileName}`;

        const xhr = new XMLHttpRequest();
        xhr.open('POST', uploadUrl, true);
        xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
        xhr.setRequestHeader('Authorization', `Bearer ${SUPABASE_ANON_KEY}`);

        // Прогресс загрузки
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100);
                progressFill.style.width = `${pct}%`;
                progressPct.textContent = `${pct}%`;
            }
        });

        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                const publicUrl = getPublicUrl(uniqueFileName);
                resolve({ fileName: uniqueFileName, publicUrl });
            } else {
                let errMsg = `Ошибка ${xhr.status}`;
                try {
                    const resp = JSON.parse(xhr.responseText);
                    errMsg = resp.message || resp.error || errMsg;
                } catch (_) {}
                reject(new Error(errMsg));
            }
        });

        xhr.addEventListener('error', () => reject(new Error('Сетевая ошибка')));
        xhr.addEventListener('abort', () => reject(new Error('Загрузка отменена')));

        const formData = new FormData();
        formData.append('file', file, uniqueFileName);
        xhr.send(formData);
    });
}

/**
 * Обработать список файлов (из drag&drop или input)
 * @param {FileList|Array<File>} files
 */
async function handleFiles(files) {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    // Валидация всех файлов
    for (const file of fileArray) {
        const error = validateFile(file);
        if (error) {
            showToast(error, 'error');
            return;
        }
    }

    // Показываем прогресс-бар
    progressCont.classList.add('progress--active');
    progressFill.style.width = '0%';
    progressPct.textContent = '0%';

    let uploaded = 0;
    const total = fileArray.length;

    for (const file of fileArray) {
        progressFName.textContent = total > 1 ? `(${uploaded + 1}/${total}) ${file.name}` : file.name;

        try {
            const { fileName, publicUrl } = await uploadFileWithProgress(file);

            // Сохраняем метаданные в БД
            const { error: dbError } = await supabaseClient
                .from('images')
                .insert([{ file_name: fileName, url: publicUrl }]);

            if (dbError) throw new Error(dbError.message);

            uploaded++;
            showToast(`«${file.name}» загружен`, 'success');
        } catch (err) {
            console.error('Ошибка загрузки:', err);
            showToast(`Ошибка загрузки «${file.name}»: ${err.message}`, 'error');
        }
    }

    // Скрываем прогресс-бар
    progressCont.classList.remove('progress--active');
    fileInput.value = ''; // сброс input

    // Обновляем галерею
    const images = await fetchImages();
    renderGallery(images);
}

// ============================================================
//  КОПИРОВАНИЕ И УДАЛЕНИЕ
// ============================================================

/**
 * Скопировать текст в буфер обмена
 * @param {string} text
 */
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('Ссылка скопирована', 'success');
    } catch {
        // Фоллбэк
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); showToast('Ссылка скопирована', 'success'); }
        catch (_) { showToast('Не удалось скопировать', 'error'); }
        document.body.removeChild(ta);
    }
}

/**
 * Удалить изображение из Storage и БД
 * @param {number} id - ID записи
 * @param {string} fileName - Имя файла в Storage
 */
async function deleteImage(id, fileName) {
    try {
        // Удаляем из Storage
        const { error: storageErr } = await supabaseClient.storage.from('images').remove([fileName]);
        if (storageErr) console.warn('Ошибка удаления из Storage:', storageErr);

        // Удаляем из БД
        const { error: dbErr } = await supabaseClient.from('images').delete().eq('id', id);
        if (dbErr) throw new Error(dbErr.message);

        showToast('Изображение удалено', 'success');

        // Обновляем галерею
        const images = await fetchImages();
        renderGallery(images);
    } catch (err) {
        console.error('Ошибка удаления:', err);
        showToast('Не удалось удалить изображение', 'error');
    }
}

// ============================================================
//  АВТОМАТИЧЕСКОЕ УДАЛЕНИЕ ПРОСРОЧЕННЫХ
// ============================================================

/**
 * Проверить все изображения и удалить те, что старше 7 дней
 */
async function cleanupExpiredImages() {
    try {
        const { data: images, error } = await supabaseClient.from('images').select('*');
        if (error) {
            console.error('Ошибка проверки просроченных:', error);
            return;
        }

        const now = Date.now();
        const expired = images.filter(img => {
            const age = now - new Date(img.created_at).getTime();
            return age > MAX_AGE_MS;
        });

        for (const img of expired) {
            console.log(`Автоудаление: ${img.file_name}`);
            await supabaseClient.storage.from('images').remove([img.file_name]);
            await supabaseClient.from('images').delete().eq('id', img.id);
        }

        if (expired.length > 0) {
            // Тихо обновляем галерею
            const freshImages = await fetchImages();
            renderGallery(freshImages);
        }
    } catch (err) {
        console.error('Ошибка автоочистки:', err);
    }
}

/**
 * Запустить таймер автоочистки
 */
function startAutoCleanup() {
    cleanupExpiredImages(); // первый запуск
    if (cleanupInterval) clearInterval(cleanupInterval);
    cleanupInterval = setInterval(cleanupExpiredImages, 30_000);
}

// ============================================================
//  МОДАЛЬНОЕ ОКНО
// ============================================================

function openModal(url) {
    modalImage.src = url;
    imageModal.classList.add('modal--active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    imageModal.classList.remove('modal--active');
    modalImage.src = '';
    document.body.style.overflow = '';
}

modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', closeModal);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && imageModal.classList.contains('modal--active')) {
        closeModal();
    }
});

// ============================================================
//  DRAG & DROP + ВЫБОР ФАЙЛОВ
// ============================================================

uploadZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) handleFiles(fileInput.files);
});

// Drag-and-drop события
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    uploadZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
});

uploadZone.addEventListener('dragover', () => {
    uploadZone.classList.add('upload-zone--dragover');
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('upload-zone--dragover');
});

uploadZone.addEventListener('drop', (e) => {
    uploadZone.classList.remove('upload-zone--dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFiles(files);
});

// Предотвращаем открытие файла браузером при промахе
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

// ============================================================
//  ИНИЦИАЛИЗАЦИЯ
// ============================================================

async function init() {
    // Проверяем, что ключи заменены
    if (SUPABASE_URL.includes('your-project') || SUPABASE_ANON_KEY.includes('your-anon-key')) {
        showToast('⚠️ Замените SUPABASE_URL и SUPABASE_ANON_KEY в script.js на свои!', 'error');
        console.error('Ключи Supabase не заменены!');
        return;
    }

    try {
        // Проверка подключения к БД
        const { error } = await supabaseClient.from('images').select('id', { count: 'exact', head: true });
        if (error) {
            console.error('Ошибка подключения:', error);
            showToast('Ошибка подключения к Supabase. Проверьте ключи и SQL-миграции.', 'error');
            return;
        }
    } catch (err) {
        console.error('Критическая ошибка:', err);
        showToast('Не удалось подключиться к Supabase', 'error');
        return;
    }

    // Загружаем изображения и отрисовываем
    const images = await fetchImages();
    renderGallery(images);

    // Запускаем автоочистку
    startAutoCleanup();

    console.log('✅ PixeImg готов к работе');
}

// Старт после загрузки DOM
document.addEventListener('DOMContentLoaded', init);