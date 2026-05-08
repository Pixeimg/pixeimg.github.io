# PixeImg — Приватный фотохостинг

Загружайте фото альбомами. Доступ только по уникальной ссылке. Автоудаление через 7 дней.

🌐 **[pixeimg.ru](https://pixeimg.ru)**

## Возможности

- 📁 **Альбомы** — загрузка нескольких фото разом, одна ссылка на всё
- 🔒 **Приватность** — доступ только по уникальной ссылке, никакой публичной галереи
- 👑 **Права владельца** — удалять альбом может только тот, кто загрузил
- ⏳ **Автоудаление** — через 7 дней альбом удаляется автоматически
- 🖼️ **Просмотр** — сетка фото по центру, лайтбокс с листалкой и стрелками
- 📋 **Копирование ссылки** — в один клик
- 🌙 **Тёмная тема** — современный минималистичный дизайн
- 📱 **Адаптивность** — работает на телефоне и десктопе

## Технологии

- HTML, CSS, чистый JavaScript (без фреймворков)
- Supabase (Storage + База данных)
- Supabase JS SDK v2

## Быстрый старт

### 1. Клонируй репозиторий

git clone https://github.com/твой-username/pixeimg.git
cd pixeimg

### 2. Настрой Supabase

Создай проект на [supabase.com](https://supabase.com) и выполни SQL в SQL Editor:

CREATE TABLE IF NOT EXISTS albums (
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
album_id TEXT UNIQUE NOT NULL,
owner_token TEXT NOT NULL,
photos JSONB NOT NULL,
created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE albums ENABLE ROW LEVEL SECURITY;

CREATE POLICY "albums_select" ON albums FOR SELECT USING (true);
CREATE POLICY "albums_insert" ON albums FOR INSERT WITH CHECK (true);
CREATE POLICY "albums_delete" ON albums FOR DELETE USING (true);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('images', 'images', true, 10485760, '{image/png,image/jpeg,image/gif,image/webp}')
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "storage_select" ON storage.objects FOR SELECT USING (bucket_id = 'images');
CREATE POLICY "storage_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'images');
CREATE POLICY "storage_delete" ON storage.objects FOR DELETE USING (bucket_id = 'images');

### 3. Вставь ключи

В script.js замени:

const SUPABASE_URL = 'https://твой-проект.supabase.co';
const SUPABASE_ANON_KEY = 'твой-anon-ключ';

Ключи взять в Supabase → Settings → API → Project URL и anon public.

### 4. Открой index.html

Просто открой файл в браузере или задеплой на GitHub Pages / Vercel.

## Как использовать

1. Заходишь на [pixeimg.ru](https://pixeimg.ru) — видишь зону загрузки
2. Перетаскиваешь фото или кликаешь для выбора (можно несколько)
3. После загрузки получаешь ссылку на альбом
4. Отправляешь ссылку кому угодно
5. Через 7 дней альбом исчезнет сам

## Структура проекта

pixeimg/
├── index.html      # Разметка
├── style.css       # Стили
├── script.js       # Логика
└── README.md       # Документация

## Лицензия

MIT