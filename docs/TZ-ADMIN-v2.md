# TaskBridge Admin Panel -- Техническое задание (v2.0)

> **Статус:** Утверждено  
> **Версия:** 2.0  
> **Дата:** 2025-07-14  
> **Приложение:** Админ-панель маркетплейса TaskBridge  
> **Порт:** 3001 (отдельно от основного сайта на порту 3000)

---

## Содержание

1. [Обзор продукта](#1-обзор-продукта)
2. [Бизнес-контекст](#2-бизнес-контекст)
3. [Архитектура](#3-архитектура)
4. [Стек технологий](#4-стек-технологий)
5. [База данных](#5-база-данных)
6. [Аутентификация и безопасность](#6-аутентификация-и-безопасность)
7. [Страницы админ-панели](#7-страницы-админ-панели)
8. [API-эндпоинты](#8-api-эндпоинты)
9. [UI/UX-дизайн](#9-uiux-дизайн)
10. [Матрица полномочий мониторинга](#10-матрица-полномочий-мониторинга)
11. [Ограничения и запреты](#11-ограничения-и-запреты)
12. [Журналирование действий](#12-журналирование-действий)

---

## 1. Обзор продукта

### 1.1 Назначение

Админ-панель TaskBridge -- это **центр управления** маркетплейсом freelance-услуг. Приложение предоставляет владельцу платформы инструменты для:

- Мониторинга активности в реальном времени
- Модерации контента (задачи, отзывы, профили)
- Управления пользователями (блокировка, смена ролей, редактирование профилей)
- Разрешения споров и обработки жалоб
- Отправки системных уведомлений
- Контроля здоровья и роста платформы
- Аудита всех административных действий

### 1.2 Целевая аудитория

Единственный пользователь -- **владелец / оператор платформы** (роль `admin`). Админ-панель не предназначена для клиентов, исполнителей или модераторов.

### 1.3 Ключевой принцип

Администратор видит и контролирует **всё**, что происходит на платформе, **за исключением содержимого личных сообщений** между пользователями. Приватность переписки -- неприкосновенна.

---

## 2. Бизнес-контекст

### 2.1 Модель монетизации

Платформа зарабатывает на **CPM-рекламе**, а не на комиссиях со сделок. Это означает:

- Админ-панель **не содержит** финансовых модулей, расчёта комиссий или payout-функционала
- Метрика "общий бюджет задач" носит **информационный** характер (показывает объём активности на платформе)
- Ключевые бизнес-метрики -- рост аудитории, количество задач, активность пользователей

### 2.2 Роль администратора

Администратор -- это **оператор платформы**, который обеспечивает качество и порядок:

- Проверяет и модерирует публикуемый контент
- Реагирует на жалобы пользователей
- Блокирует недобросовестных участников
- Отправляет массовые коммуникации
- Отслеживает метрики роста

---

## 3. Архитектура

### 3.1 Общая схема

```
+-------------------+         +-------------------+
|  Main Site (:3000)|         | Admin Panel (:3001)|
|  Express + SPA    |         | Express + SPA      |
+--------+----------+         +--------+-----------+
         |                             |
         |        +-----------+        |
         +--------+  data.db  +--------+
                  |  (SQLite) |
                  +-----------+
```

### 3.2 Компоненты

| Компонент | Описание |
|---|---|
| **Main Site** (`server.js`) | Основной сайт маркетплейса, порт 3000. Регистрация, каталог задач, отклики, чат, профили |
| **Admin Panel** (`admin/server.js`) | Отдельное Express-приложение, порт 3001. Все административные функции |
| **Shared Database** (`data.db`) | Единая SQLite-база данных (WAL-режим). Оба приложения читают и пишут в одни таблицы |
| **Frontend** (`admin/index.html`) | Single-file SPA, встраивается в Express через `express.static` |

### 3.3 Структура файлов

```
TaskBridge-QoderWork/
  server.js              # Основной сайт (порт 3000)
  data.db                # SQLite-база данных (WAL)
  db/
    init.js              # Схема и инициализация БД
    seed.js              # Тестовые данные
  admin/
    server.js            # Админ-сервер (порт 3001)
    index.html           # SPA-фронтенд админ-панели (single file)
    package.json         # Зависимости админ-сервера
  routes/                # Роуты основного сайта
  middleware/             # Middleware основного сайта
  public/                # Статика основного сайта
  docs/
    api.yaml             # OpenAPI-спецификация основного API
    TZ-ADMIN-v2.md       # Данный документ
```

---

## 4. Стек технологий

### 4.1 Backend

| Технология | Версия | Назначение |
|---|---|---|
| **Node.js** | 18+ | Серверная среда выполнения |
| **Express** | 4.x | HTTP-фреймворк |
| **better-sqlite3** | 11.x | Синхронный драйвер SQLite (WAL-режим) |
| **jsonwebtoken** | 9.x | JWT-аутентификация (24h TTL) |
| **bcryptjs** | 2.x | Хеширование паролей |
| **cors** | 2.x | Cross-Origin Resource Sharing |
| **dotenv** | 16.x | Конфигурация через `.env` |

### 4.2 Frontend

| Технология | Назначение |
|---|---|
| **Tailwind CSS** (CDN) | Утилитарные CSS-классы |
| **Plus Jakarta Sans** (Google Fonts) | Шрифт заголовков (h1--h6) |
| **Inter** (Google Fonts) | Шрифт основного текста |
| **Tabler Icons** (CDN) | Иконографика интерфейса |
| **Vanilla JavaScript** | Логика SPA, роутинг, API-вызовы |

### 4.3 Конфигурация

Переменные окружения (`.env` в корне проекта):

| Переменная | По умолчанию | Описание |
|---|---|---|
| `ADMIN_PORT` | `3001` | Порт админ-панели |
| `JWT_SECRET` | `taskbridge-dev-secret-2026` | Секретный ключ для подписи JWT |
| `DATABASE_PATH` | `./data.db` | Относительный путь к файлу БД |

---

## 5. База данных

### 5.1 Общие сведения

- **Движок:** SQLite 3
- **Файл:** `D:\work\TaskBridge-QoderWork\data.db`
- **Режим журнала:** WAL (Write-Ahead Logging)
- **Внешние ключи:** Включены (`PRAGMA foreign_keys = ON`)
- **Совместный доступ:** Основной сайт и админ-панель работают с одним файлом БД одновременно

### 5.2 Схема таблиц

#### `users` -- Пользователи

| Столбец | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | Уникальный идентификатор |
| `name` | TEXT | NOT NULL | Имя пользователя |
| `email` | TEXT | UNIQUE, NOT NULL | Электронная почта |
| `password_hash` | TEXT | NOT NULL | Хеш пароля (bcrypt) |
| `role` | TEXT | CHECK IN ('client','performer','admin') | Роль в системе |
| `avatar` | TEXT | DEFAULT '' | Путь/URL аватара |
| `city` | TEXT | DEFAULT '' | Город |
| `country` | TEXT | DEFAULT '' | Страна |
| `bio` | TEXT | DEFAULT '' | Описание / биография |
| `website` | TEXT | DEFAULT '' | Веб-сайт |
| `contact` | TEXT | DEFAULT '' | Контактная информация |
| `rating` | REAL | DEFAULT 0 | Средний рейтинг |
| `review_count` | INTEGER | DEFAULT 0 | Количество отзывов |
| `task_count` | INTEGER | DEFAULT 0 | Количество созданных задач |
| `completed_count` | INTEGER | DEFAULT 0 | Количество завершённых задач |
| `blocked` | INTEGER | DEFAULT 0 | Флаг блокировки (0/1) |
| `created_at` | TEXT | DEFAULT datetime('now') | Дата регистрации |

#### `tasks` -- Задачи

| Столбец | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | Уникальный идентификатор |
| `title` | TEXT | NOT NULL | Заголовок задачи |
| `description` | TEXT | NOT NULL | Описание задачи |
| `expected_result` | TEXT | DEFAULT '' | Ожидаемый результат |
| `category` | TEXT | NOT NULL | Категория (9 значений) |
| `budget` | REAL | DEFAULT 0 | Бюджет |
| `budget_type` | TEXT | CHECK IN ('fixed','negotiable','hourly') | Тип бюджета |
| `deadline` | TEXT | DEFAULT '' | Дедлайн |
| `urgency` | TEXT | CHECK IN ('low','normal','high','urgent') | Срочность |
| `remote_allowed` | INTEGER | DEFAULT 1 | Удалённая работа |
| `required_skills` | TEXT | DEFAULT '[]' | Требуемые навыки (JSON) |
| `files` | TEXT | DEFAULT '[]' | Прикреплённые файлы (JSON) |
| `links` | TEXT | DEFAULT '[]' | Ссылки (JSON) |
| `status` | TEXT | 11 допустимых значений | Текущий статус |
| `creator_id` | INTEGER | FK -> users(id) | Автор задачи |
| `assigned_to` | INTEGER | FK -> users(id), NULLABLE | Назначенный исполнитель |
| `hidden` | INTEGER | DEFAULT 0 | Флаг скрытия (0/1) |
| `created_at` | TEXT | DEFAULT datetime('now') | Дата создания |
| `updated_at` | TEXT | DEFAULT datetime('now') | Дата обновления |

**Допустимые статусы задач (11):**
`draft`, `published`, `moderation`, `hidden`, `assigned`, `in_progress`, `review`, `completed`, `cancelled`, `disputed`, `archived`

**Категории задач (9):**
`sites`, `design`, `ads`, `bots`, `automation`, `texts`, `presentations`, `analytics`, `other`

#### `offers` -- Отклики

| Столбец | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | Уникальный идентификатор |
| `task_id` | INTEGER | FK -> tasks(id), NOT NULL | Задача |
| `performer_id` | INTEGER | FK -> users(id), NOT NULL | Исполнитель |
| `message` | TEXT | NOT NULL | Текст отклика |
| `price` | REAL | DEFAULT 0 | Предложенная цена |
| `estimated_time` | TEXT | DEFAULT '' | Оценка сроков |
| `includes` | TEXT | DEFAULT '' | Что включено |
| `questions` | TEXT | DEFAULT '' | Вопросы |
| `portfolio_link` | TEXT | DEFAULT '' | Ссылка на портфолио |
| `status` | TEXT | 6 допустимых значений | Статус отклика |
| `created_at` | TEXT | DEFAULT datetime('now') | Дата создания |

**Статусы откликов (6):** `sent`, `viewed`, `shortlisted`, `accepted`, `rejected`, `cancelled`

#### `messages` -- Сообщения чата

| Столбец | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | Уникальный идентификатор |
| `task_id` | INTEGER | FK -> tasks(id), NOT NULL | Задача (контекст чата) |
| `sender_id` | INTEGER | FK -> users(id), NOT NULL | Отправитель |
| `content` | TEXT | NOT NULL | Текст сообщения |
| `created_at` | TEXT | DEFAULT datetime('now') | Дата отправки |
| `read_at` | TEXT | NULLABLE | Дата прочтения |

#### `reviews` -- Отзывы

| Столбец | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | Уникальный идентификатор |
| `reviewer_id` | INTEGER | FK -> users(id), NOT NULL | Автор отзыва |
| `reviewee_id` | INTEGER | FK -> users(id), NOT NULL | Объект отзыва |
| `task_id` | INTEGER | FK -> tasks(id), NOT NULL | Связанная задача |
| `rating` | INTEGER | CHECK 1--5, NOT NULL | Оценка |
| `comment` | TEXT | DEFAULT '' | Текст отзыва |
| `likes` | TEXT | DEFAULT '' | Что понравилось |
| `improvements` | TEXT | DEFAULT '' | Что улучшить |
| `hidden` | INTEGER | DEFAULT 0 | Флаг скрытия (0/1) |
| `created_at` | TEXT | DEFAULT datetime('now') | Дата создания |

#### `reports` -- Жалобы

| Столбец | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | Уникальный идентификатор |
| `reporter_id` | INTEGER | FK -> users(id) | Автор жалобы |
| `target_type` | TEXT | CHECK IN ('task','user','message','offer') | Тип объекта |
| `target_id` | INTEGER | NOT NULL | ID объекта жалобы |
| `reason` | TEXT | NOT NULL | Причина жалобы |
| `comment` | TEXT | DEFAULT '' | Комментарий |
| `status` | TEXT | CHECK IN ('new','reviewing','closed') | Статус обработки |
| `created_at` | TEXT | DEFAULT datetime('now') | Дата создания |

#### `notifications` -- Уведомления

| Столбец | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | Уникальный идентификатор |
| `user_id` | INTEGER | FK -> users(id), NOT NULL | Получатель |
| `type` | TEXT | NOT NULL | Тип уведомления |
| `payload` | TEXT | DEFAULT '{}' | JSON-содержимое |
| `seen` | INTEGER | DEFAULT 0 | Прочитано (0/1) |
| `created_at` | TEXT | DEFAULT datetime('now') | Дата создания |

#### `admin_actions` -- Журнал действий администратора

| Столбец | Тип | Ограничения | Описание |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | Уникальный идентификатор |
| `admin_id` | INTEGER | FK -> users(id) | Администратор |
| `action` | TEXT | NOT NULL | Тип действия |
| `target_type` | TEXT | DEFAULT '' | Тип объекта |
| `target_id` | INTEGER | DEFAULT 0 | ID объекта |
| `details` | TEXT | DEFAULT '' | Детали действия |
| `timestamp` | TEXT | DEFAULT datetime('now') | Дата/время |

#### `performer_profiles` -- Профили исполнителей

| Столбец | Тип | Ограничения | Описание |
|---|---|---|---|
| `user_id` | INTEGER | PK, FK -> users(id) | Пользователь |
| `specialization` | TEXT | DEFAULT '' | Специализация |
| `skills` | TEXT | DEFAULT '[]' | Навыки (JSON) |
| `experience` | TEXT | DEFAULT '' | Опыт работы |
| `portfolio_links` | TEXT | DEFAULT '[]' | Портфолио (JSON) |
| `hourly_rate` | REAL | DEFAULT 0 | Почасовая ставка |
| `languages` | TEXT | DEFAULT '[]' | Языки (JSON) |
| `availability` | TEXT | CHECK IN ('free','busy','partial') | Доступность |
| `created_at` | TEXT | DEFAULT datetime('now') | Дата создания |

### 5.3 Индексы

```sql
CREATE INDEX idx_tasks_status     ON tasks(status);
CREATE INDEX idx_tasks_category  ON tasks(category);
CREATE INDEX idx_tasks_creator   ON tasks(creator_id);
CREATE INDEX idx_offers_task     ON offers(task_id);
CREATE INDEX idx_offers_performer ON offers(performer_id);
CREATE INDEX idx_messages_task   ON messages(task_id);
CREATE INDEX idx_notifications_user ON notifications(user_id, seen);
CREATE INDEX idx_reviews_reviewee ON reviews(reviewee_id);
```

### 5.4 Миграции

При запуске админ-сервер проверяет наличие столбцов `hidden` в таблицах `reviews` и `tasks`. Если столбец отсутствует, он добавляется автоматически через `ALTER TABLE`. Это обеспечивает обратную совместимость при добавлении новых полей.

---

## 6. Аутентификация и безопасность

### 6.1 Механизм аутентификации

- **Протокол:** JWT (JSON Web Token)
- **Время жизни токена:** 24 часа (`expiresIn: '24h'`)
- **Секрет:** Переменная окружения `JWT_SECRET`
- **Формат:** `Authorization: Bearer <token>`

### 6.2 Процесс входа

```
POST /api/admin/login
{
  "email": "admin@taskbridge.ru",
  "password": "..."
}
```

**Валидация:**
1. Проверка наличия `email` и `password`
2. Поиск пользователя по email в таблице `users`
3. Проверка роли: `user.role === 'admin'` (иначе 403)
4. Сравнение пароля с `password_hash` через `bcrypt.compareSync`
5. Генерация JWT с payload: `{ id, email, name, role: 'admin' }`

**Ответ:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "admin": { "id": 1, "name": "Admin", "email": "admin@taskbridge.ru", "role": "admin" }
}
```

### 6.3 Middleware `authRequired`

Каждый защищённый эндпоинт проходит через middleware:

1. Извлечение заголовка `Authorization`
2. Парсинг Bearer-токена
3. Верификация JWT через `jwt.verify(token, JWT_SECRET)`
4. Проверка `payload.role === 'admin'`
5. Прикрепление `req.admin = payload` (содержит `id`, `email`, `name`, `role`)

**Коды ошибок:**
- `401` -- отсутствует токен, недействительный токен
- `403` -- токен валиден, но роль не `admin`

### 6.4 Гарантии безопасности

| Принцип | Реализация |
|---|---|
| Только админы | Middleware `authRequired` проверяет `role === 'admin'` на каждом запросе |
| Отсутствие удаления данных | Ни один эндпоинт не выполняет `DELETE`. Только `UPDATE` (hide/block) |
| Логирование действий | Каждое мутирующее действие записывается в `admin_actions` |
| JWT 24h | Токены автоматически истекают через 24 часа |
| Общий секрет | Оба сервера (основной и админ) используют один `JWT_SECRET` из `.env` |

---

## 7. Страницы админ-панели

Админ-панель содержит **9 страниц** (без страницы настроек).

---

### 7.1 Дашборд (Dashboard)

**Маршрут:** `#dashboard` (главная страница после входа)

**Назначение:** Моментальный обзор состояния платформы.

#### Блоки данных

**Карточки ключевых метрик (верхний ряд):**

| Метрика | Источник данных | Описание |
|---|---|---|
| Всего пользователей | `COUNT(*) FROM users` | Суммарное количество зарегистрированных |
| Всего задач | `COUNT(*) FROM tasks` | Суммарное количество задач |
| Отклики | `COUNT(*) FROM offers` | Суммарное количество откликов |
| Отзывы | `COUNT(*) FROM reviews` | Суммарное количество отзывов |
| Открытые жалобы | `COUNT(*) FROM reports WHERE status != 'closed'` | Нерешённые жалобы |
| Завершённые задачи | `COUNT(*) FROM tasks WHERE status = 'completed'` | Успешно закрытые задачи |

**Карточки дополнительных метрик (второй ряд):**

| Метрика | Источник данных |
|---|---|
| Общий бюджет (информационный) | `COALESCE(SUM(budget), 0) FROM tasks WHERE status = 'completed'` |
| Новые пользователи за неделю | `COUNT(*) FROM users WHERE created_at >= [7 дней назад]` |

#### Визуализации

**Гистограмма статусов задач:**
- Данные: `SELECT status, COUNT(*) as count FROM tasks GROUP BY status`
- Тип: горизонтальная столбчатая диаграмма
- Цвета: каждый статус имеет уникальный цвет

#### Списки

**Лента недавней активности (последние 20 действий админа):**
```sql
SELECT aa.*, u.name as admin_name
FROM admin_actions aa
LEFT JOIN users u ON aa.admin_id = u.id
ORDER BY aa.timestamp DESC LIMIT 20
```

**Новые пользователи (последние 10):**
```sql
SELECT id, name, email, role, created_at
FROM users ORDER BY created_at DESC LIMIT 10
```

**Последние задачи (последние 10):**
```sql
SELECT t.id, t.title, t.status, t.created_at, u.name as creator_name
FROM tasks t LEFT JOIN users u ON t.creator_id = u.id
ORDER BY t.created_at DESC LIMIT 10
```

#### Навигационные элементы

- Ссылка на страницу жалоб с индикатором количества открытых (`totalReports > 0`)

---

### 7.2 Пользователи (Users)

**Маршрут:** `#users`

**Назначение:** Полный обзор и управление всеми пользователями платформы.

#### Таблица

| Столбец | Описание | Формат |
|---|---|---|
| ID | Уникальный идентификатор | Число |
| Имя | Имя пользователя | Текст |
| Email | Электронная почта | Текст |
| Роль | client / performer / admin | Бейдж с цветом |
| Рейтинг | Средний рейтинг | Звёзды (0--5) |
| Город | Город проживания | Текст |
| Статус | Активен / Заблокирован | Зелёный / красный бейдж |
| Дата регистрации | Когда зарегистрирован | Дата и время |
| Действия | Кнопки операций | Группа кнопок |

#### Фильтры

| Фильтр | Значения | Параметр URL |
|---|---|---|
| Роль | Все / Клиент / Исполнитель / Админ | `?role=` |
| Статус | Все / Активные / Заблокированные | `?status=` |
| Поиск | По имени, email, городу (LIKE-запрос) | `?search=` |

#### Пагинация

- Записей на странице: **20**
- Параметр: `?page=1`
- Отображение: "Страница X из Y" + кнопки "Назад" / "Вперёд"

#### Действия с пользователем

**1. Блокировка / Разблокировка**
- Кнопка-тогл: "Заблокировать" / "Разблокировать"
- Модальное окно подтверждения с опциональным полем "Причина"
- API: `PATCH /api/admin/users/:id/block`
- Лог: `block_user` или `unblock_user`

**2. Смена роли**
- Выпадающий список: client / performer / admin
- Модальное окно подтверждения: "Сменить роль пользователя [Имя] с [старая] на [новая]?"
- API: `PATCH /api/admin/users/:id/role`
- Лог: `change_role`

**3. Редактирование профиля**
- Модальное окно с полями:
  - Имя (`name`)
  - Email (`email`)
  - Город (`city`)
  - Страна (`country`)
  - Биография (`bio`)
  - Веб-сайт (`website`)
  - Контакт (`contact`)
  - Заблокирован (`blocked`, чекбокс)
- API: `PUT /api/admin/users/:id`
- Лог: `edit_user`

**4. Просмотр полного профиля**
- Ссылка на профиль пользователя на основном сайте (`http://localhost:3000/#profile/:id`)

---

### 7.3 Задачи (Tasks)

**Маршрут:** `#tasks`

**Назначение:** Полный обзор и модерация всех задач на платформе.

#### Таблица

| Столбец | Описание |
|---|---|
| ID | Уникальный идентификатор |
| Заголовок | Название задачи |
| Категория | Одна из 9 категорий |
| Статус | Один из 11 статусов |
| Бюджет | Сумма бюджета |
| Срочность | low / normal / high / urgent |
| Автор | Имя создателя |
| Отклики | Количество откликов |
| Дата | Дата создания |
| Действия | Кнопки операций |

#### Фильтры

| Фильтр | Значения |
|---|---|
| Статус | Все 11 статусов + "Все" |
| Категория | Все 9 категорий + "Все" |
| Поиск | По заголовку и описанию (LIKE) |

#### Пагинация

- Записей на странице: **20**

#### Действия с задачей

**1. Смена статуса**
- Выпадающий список с **валидными переходами**:

| Текущий статус | Допустимые переходы |
|---|---|
| `draft` | `published` (принудительная публикация) |
| `published` | `moderation` (отправка на проверку) |
| `moderation` | `published` (одобрение), `hidden` (отклонение) |
| `hidden` | `published` (восстановление) |
| `assigned` | `in_progress`, `cancelled` |
| `in_progress` | `review`, `cancelled` |
| `review` | `completed`, `in_progress` (на доработку) |
| `completed` | `archived` |
| `cancelled` | `archived` |
| `disputed` | `completed`, `cancelled` |

> **Примечание:** Бэкенд принимает любой из 11 статусов без проверки переходов. Валидация переходов -- ответственность фронтенда (выпадающий список показывает только допустимые варианты).

- API: `PATCH /api/admin/tasks/:id/status`
- Лог: `change_task_status`

**2. Скрыть / Показать**
- Тогл видимости задачи на сайте
- API: `PATCH /api/admin/tasks/:id/hide`
- Лог: `hide_task` или `show_task`

**3. Редактирование**
- Модальное окно с полями:
  - Заголовок (`title`)
  - Описание (`description`)
  - Категория (`category`)
  - Бюджет (`budget`)
  - Срочность (`urgency`)
  - Статус (`status`)
- API: `PUT /api/admin/tasks/:id`
- Лог: `edit_task`

**4. Просмотр на сайте**
- Ссылка: `http://localhost:3000/#task/:id`

---

### 7.4 Отклики (Offers)

**Маршрут:** `#offers`

**Назначение:** Мониторинг и модерация всех откликов исполнителей.

#### Таблица

| Столбец | Описание |
|---|---|
| Исполнитель | Имя автора отклика |
| Задача | Заголовок связанной задачи |
| Цена | Предложенная цена |
| Сроки | Оценка времени выполнения |
| Статус | Один из 6 статусов |
| Дата | Дата создания |
| Действия | Кнопки операций |

#### Фильтры

| Фильтр | Значения |
|---|---|
| Статус | Все / sent / viewed / shortlisted / accepted / rejected / cancelled |

#### Пагинация

- Записей на странице: **20**

#### Действия

**1. Смена статуса отклика**
- Выпадающий список: `sent`, `viewed`, `shortlisted`, `accepted`, `rejected`, `cancelled`
- API: `PATCH /api/admin/offers/:id/status`
- Лог: `change_offer_status`

**2. Просмотр содержимого**
- Раскрывающаяся строка таблицы с полным текстом отклика (`message`)
- Дополнительные поля: `includes`, `questions`, `portfolio_link`

---

### 7.5 Жалобы (Reports)

**Маршрут:** `#reports`

**Назначение:** Обработка жалоб пользователей, разрешение споров.

#### Таблица

| Столбец | Описание |
|---|---|
| Причина | Краткое описание причины жалобы |
| Объект | Тип и ID объекта жалобы (ссылка) |
| Заявитель | Имя подавшего жалобу |
| Статус | new / reviewing / closed |
| Дата | Дата подачи |
| Действия | Кнопки операций |

#### Цветовая кодировка статусов

| Статус | Цвет | Значение |
|---|---|---|
| `new` | Красный (`#EF4444`) | Новая, не рассмотрена |
| `reviewing` | Жёлтый (`#F59E0B`) | В процессе рассмотрения |
| `closed` | Зелёный (`#22C55E`) | Закрыта / решена |

#### Фильтры

| Фильтр | Значения |
|---|---|
| Статус | Все / new / reviewing / closed |

#### Обогащение данных

Сервер автоматически подтягивает информацию об объекте жалобы:

| `target_type` | Подзапрос | Отображаемое поле |
|---|---|---|
| `task` | `SELECT title FROM tasks WHERE id = ?` | Заголовок задачи |
| `user` | `SELECT name FROM users WHERE id = ?` | Имя пользователя |
| `offer` | `SELECT message FROM offers WHERE id = ?` | Первые 80 символов текста |
| `message` | `SELECT content FROM messages WHERE id = ?` | Первые 80 символов текста |

Если объект удалён -- отображается "Удалено".

#### Действия

**1. Закрыть жалобу (Resolve)**
- Кнопка "Закрыть" с опциональным комментарием
- Переводит статус в `closed`
- API: `PATCH /api/admin/reports/:id/resolve`
- Лог: `resolve_report`

**2. Перейти к объекту**
- Кликабельная ссылка на объект жалобы (задача, профиль, сообщение)

**3. Заблокировать нарушителя**
- Переход к действию блокировки на странице пользователей

---

### 7.6 Отзывы (Reviews)

**Маршрут:** `#reviews`

**Назначение:** Модерация отзывов, скрытие некорректного контента.

#### Таблица

| Столбец | Описание |
|---|---|
| Автор | Имя написавшего отзыв |
| Объект | Имя того, о ком отзыв |
| Задача | Заголовок связанной задачи |
| Оценка | Звёзды (1--5) |
| Комментарий | Превью текста отзыва |
| Дата | Дата публикации |
| Действия | Кнопка скрыть/показать |

#### Пагинация

- Записей на странице: **20**

#### Действия

**Скрыть / Показать**
- Тогл видимости отзыва на сайте
- Скрытые отзывы не удаляются -- они остаются в БД, но не отображаются пользователям
- API: `PATCH /api/admin/reviews/:id/hidden`
- Лог: `hide_review` или `show_review`

> **Важно:** Удаление отзывов запрещено. Отзыв можно только скрыть. Это обеспечивает сохранность истории.

---

### 7.7 Чаты (Chats) -- ТОЛЬКО МОНИТОРИНГ

**Маршрут:** `#chats`

**Назначение:** Обзор активности чатов платформы. **Администратор НЕ может читать содержимое сообщений.**

#### Список чатов (основной вид)

| Столбец | Описание |
|---|---|
| Задача | Заголовок задачи, к которой привязан чат |
| Участники | Имена клиента и исполнителя |
| Сообщений | Общее количество сообщений в чате |
| Последняя активность | Дата последнего сообщения |

#### SQL-запрос

```sql
SELECT DISTINCT m.task_id,
  t.title as task_title,
  t.status as task_status,
  (SELECT COUNT(*) FROM messages WHERE task_id = m.task_id) as message_count,
  (SELECT MAX(created_at) FROM messages WHERE task_id = m.task_id) as last_message_at
FROM messages m
LEFT JOIN tasks t ON m.task_id = t.id
ORDER BY last_message_at DESC
```

#### Детальный просмотр -- ЗАБЛОКИРОВАН

> **Архитектурное решение:** Эндпоинт `GET /api/admin/chats/:taskId` технически существует в коде и возвращает содержимое сообщений. Однако **фронтенд админ-панели НЕ вызывает этот эндпоинт и не отображает содержимое сообщений**. Кнопка "Открыть чат" отсутствует в UI.
>
> Это осознанное ограничение: приватность переписки пользователей священна. Админ видит только метаданные (кто, с кем, когда, сколько сообщений).

#### Фильтры

- Поиск по заголовку задачи или имени участника

---

### 7.8 Уведомления (Notifications)

**Маршрут:** `#notifications`

**Назначение:** История отправленных уведомлений и рассылка новых.

#### Форма рассылки

| Поле | Тип | Описание |
|---|---|---|
| Сообщение | textarea (обязательное) | Текст уведомления |
| Тип | select | `system` (по умолчанию) или другой тип |
| Получатель | search/select | "Все пользователи" или конкретный пользователь |

**Логика отправки:**
- При выборе "Все пользователи" -- сервер создаёт уведомление для **каждого** пользователя в транзакции
- При выборе конкретного пользователя -- создаётся одно уведомление
- Подтверждение перед отправкой: модальное окно "Отправить уведомление [всем / пользователю X]?"

#### История уведомлений

| Столбец | Описание |
|---|---|
| ID | Идентификатор |
| Получатель | Имя пользователя |
| Тип | Тип уведомления |
| Содержимое | Текст из payload |
| Прочитано | Флаг seen |
| Дата | Дата создания |

#### Пагинация

- Записей на странице: **20**

---

### 7.9 Журнал действий (Action Log)

**Маршрут:** `#actions`

**Назначение:** Полный аудит всех действий, выполненных администраторами.

#### Таблица

| Столбец | Описание |
|---|---|
| Действие | Тип действия (block_user, edit_task, ...) |
| Администратор | Имя выполнившего действие |
| Тип объекта | user / task / offer / review / report / notification |
| ID объекта | Идентификатор затронутого объекта |
| Детали | Описание изменений |
| Дата/время | Точная метка времени |

#### Фильтры

| Фильтр | Значения |
|---|---|
| Тип действия | Все / block_user / unblock_user / edit_user / change_role / edit_task / change_task_status / hide_task / show_task / change_offer_status / resolve_report / hide_review / show_review / broadcast_notification |
| Период | Сегодня / Неделя / Месяц |

#### Пагинация

- Записей на странице: **20**

> **Только чтение:** Журнал действий -- это неизменяемый аудиторский след. Никакие действия над записями журнала недоступны.

---

## 8. API-эндпоинты

### 8.1 Аутентификация

#### `POST /api/admin/login`

Вход в админ-панель.

**Тело запроса:**
```json
{
  "email": "string (required)",
  "password": "string (required)"
}
```

**Ответ 200:**
```json
{
  "token": "string (JWT, 24h TTL)",
  "admin": {
    "id": "integer",
    "name": "string",
    "email": "string",
    "role": "admin"
  }
}
```

**Ошибки:**
- `400` -- Email и пароль обязательны
- `401` -- Неверные учётные данные (неверный пароль или пользователь не найден)
- `403` -- Доступ только для администраторов (пользователь не admin)

---

### 8.2 Дашборд

#### `GET /api/admin/stats`

Сводная статистика платформы.

**Параметры:** отсутствуют  
**Auth:** требуется

**Ответ 200:**
```json
{
  "totalUsers": "integer",
  "totalTasks": "integer",
  "totalOffers": "integer",
  "totalReviews": "integer",
  "totalReports": "integer (open reports only)",
  "completedTasks": "integer",
  "revenue": "number (sum of completed task budgets)",
  "newUsersWeek": "integer",
  "tasksByStatus": [
    { "status": "string", "count": "integer" }
  ],
  "recentActions": [
    {
      "id": "integer",
      "admin_id": "integer",
      "action": "string",
      "target_type": "string",
      "target_id": "integer",
      "details": "string",
      "timestamp": "string (ISO datetime)",
      "admin_name": "string"
    }
  ],
  "recentUsers": [
    { "id": "integer", "name": "string", "email": "string", "role": "string", "created_at": "string" }
  ],
  "recentTasks": [
    { "id": "integer", "title": "string", "status": "string", "created_at": "string", "creator_name": "string" }
  ]
}
```

---

### 8.3 Пользователи

#### `GET /api/admin/users`

Список пользователей с фильтрацией и пагинацией.

**Query-параметры:**

| Параметр | Тип | По умолчанию | Описание |
|---|---|---|---|
| `role` | string | `'all'` | Фильтр по роли: `all`, `client`, `performer`, `admin` |
| `status` | string | -- | Фильтр по статусу: `active`, `blocked` |
| `search` | string | -- | Поиск по имени, email, городу |
| `page` | integer | `1` | Номер страницы |
| `limit` | integer | `20` | Записей на странице |

**Ответ 200:**
```json
{
  "users": [
    {
      "id": "integer",
      "name": "string",
      "email": "string",
      "role": "string",
      "city": "string",
      "country": "string",
      "bio": "string",
      "rating": "number",
      "blocked": "integer (0/1)",
      "created_at": "string",
      "specialization": "string | null",
      "skills": "string (JSON) | null",
      "experience": "string | null",
      "hourly_rate": "number | null",
      "availability": "string | null"
    }
  ],
  "total": "integer",
  "page": "integer",
  "pages": "integer"
}
```

#### `GET /api/admin/users/:id`

Детальная информация о пользователе.

**Ответ 200:**
```json
{
  "user": { "...all user fields except password_hash..." },
  "performer_profile": { "...performer profile or null..." },
  "tasks": [
    { "id": "integer", "title": "string", "status": "string", "created_at": "string" }
  ],
  "offers": [
    { "...offer fields...", "task_title": "string" }
  ]
}
```

#### `PUT /api/admin/users/:id`

Редактирование профиля пользователя.

**Тело запроса (все поля опциональны):**
```json
{
  "name": "string",
  "email": "string",
  "city": "string",
  "bio": "string",
  "role": "string",
  "blocked": "integer",
  "country": "string",
  "website": "string",
  "contact": "string"
}
```

**Ответ 200:** `{ "success": true }`  
**Лог:** `edit_user`

#### `PATCH /api/admin/users/:id/block`

Переключение блокировки пользователя (toggle).

**Тело запроса:** отсутствует  
**Ответ 200:**
```json
{ "success": true, "blocked": "boolean" }
```
**Лог:** `block_user` или `unblock_user`

#### `PATCH /api/admin/users/:id/role`

Смена роли пользователя.

**Тело запроса:**
```json
{ "role": "string (client | performer | admin)" }
```

**Ответ 200:** `{ "success": true }`  
**Ошибки:** `400` -- Недопустимая роль  
**Лог:** `change_role`

---

### 8.4 Задачи

#### `GET /api/admin/tasks`

Список задач с фильтрацией и пагинацией.

**Query-параметры:**

| Параметр | Тип | По умолчанию | Описание |
|---|---|---|---|
| `status` | string | `'all'` | Один из 11 статусов или `all` |
| `category` | string | `'all'` | Одна из 9 категорий или `all` |
| `search` | string | -- | Поиск по заголовку и описанию |
| `page` | integer | `1` | Номер страницы |
| `limit` | integer | `20` | Записей на странице |

**Ответ 200:**
```json
{
  "tasks": [
    {
      "id": "integer",
      "title": "string",
      "category": "string",
      "status": "string",
      "budget": "number",
      "urgency": "string",
      "creator_name": "string",
      "offers_count": "integer",
      "hidden": "integer",
      "created_at": "string"
    }
  ],
  "total": "integer",
  "page": "integer",
  "pages": "integer"
}
```

#### `GET /api/admin/tasks/:id`

Детальная информация о задаче с откликами.

**Ответ 200:**
```json
{
  "task": { "...task fields...", "creator_name": "string" },
  "offers": [
    { "...offer fields...", "performer_name": "string" }
  ],
  "messages": [
    { "...message fields...", "sender_name": "string" }
  ]
}
```

> **Примечание:** Поле `messages` техничесчески присутствует в ответе эндпоинта, но **фронтенд админ-панели не отображает содержимое сообщений** в соответствии с политикой приватности (см. раздел 7.7).

#### `PUT /api/admin/tasks/:id`

Редактирование задачи.

**Тело запроса (все поля опциональны):**
```json
{
  "title": "string",
  "description": "string",
  "status": "string",
  "category": "string",
  "budget": "number",
  "urgency": "string"
}
```

**Ответ 200:** `{ "success": true }`  
**Лог:** `edit_task`

#### `PATCH /api/admin/tasks/:id/status`

Смена статуса задачи.

**Тело запроса:**
```json
{ "status": "string" }
```

**Валидные статусы:** `draft`, `published`, `moderation`, `hidden`, `assigned`, `in_progress`, `review`, `completed`, `cancelled`, `disputed`, `archived`

**Ответ 200:** `{ "success": true }`  
**Ошибки:** `400` -- Недопустимый статус  
**Лог:** `change_task_status`

#### `PATCH /api/admin/tasks/:id/hide`

Переключение видимости задачи (toggle).

**Тело запроса:** отсутствует  
**Ответ 200:**
```json
{ "success": true, "hidden": "boolean" }
```
**Лог:** `hide_task` или `show_task`

---

### 8.5 Отклики

#### `GET /api/admin/offers`

Список откликов с фильтрацией и пагинацией.

**Query-параметры:**

| Параметр | Тип | По умолчанию | Описание |
|---|---|---|---|
| `status` | string | `'all'` | Фильтр по статусу |
| `page` | integer | `1` | Номер страницы |
| `limit` | integer | `20` | Записей на странице |

**Ответ 200:**
```json
{
  "offers": [
    {
      "id": "integer",
      "task_id": "integer",
      "performer_id": "integer",
      "message": "string",
      "price": "number",
      "estimated_time": "string",
      "status": "string",
      "task_title": "string",
      "performer_name": "string",
      "created_at": "string"
    }
  ],
  "total": "integer",
  "page": "integer",
  "pages": "integer"
}
```

#### `PATCH /api/admin/offers/:id/status`

Смена статуса отклика.

**Тело запроса:**
```json
{ "status": "string" }
```

**Валидные статусы:** `sent`, `viewed`, `shortlisted`, `accepted`, `rejected`, `cancelled`

**Ответ 200:** `{ "success": true }`  
**Ошибки:** `400` -- Недопустимый статус, `404` -- Отклик не найден  
**Лог:** `change_offer_status`

---

### 8.6 Жалобы

#### `GET /api/admin/reports`

Список жалоб с обогащёнными данными об объектах.

**Query-параметры:**

| Параметр | Тип | По умолчанию | Описание |
|---|---|---|---|
| `status` | string | `'all'` | `new`, `reviewing`, `closed`, `all` |
| `page` | integer | `1` | Номер страницы |
| `limit` | integer | `20` | Записей на странице |

**Ответ 200:**
```json
{
  "reports": [
    {
      "id": "integer",
      "reporter_id": "integer",
      "target_type": "string",
      "target_id": "integer",
      "reason": "string",
      "comment": "string",
      "status": "string",
      "reporter_name": "string",
      "target_title": "string",
      "created_at": "string"
    }
  ],
  "total": "integer",
  "page": "integer",
  "pages": "integer"
}
```

#### `PATCH /api/admin/reports/:id/resolve`

Закрытие жалобы.

**Тело запроса:** отсутствует  
**Ответ 200:** `{ "success": true }`  
**Лог:** `resolve_report`

---

### 8.7 Отзывы

#### `GET /api/admin/reviews`

Список отзывов с пагинацией.

**Query-параметры:**

| Параметр | Тип | По умолчанию |
|---|---|---|
| `page` | integer | `1` |
| `limit` | integer | `20` |

**Ответ 200:**
```json
{
  "reviews": [
    {
      "id": "integer",
      "reviewer_id": "integer",
      "reviewee_id": "integer",
      "task_id": "integer",
      "rating": "integer",
      "comment": "string",
      "hidden": "integer",
      "reviewer_name": "string",
      "reviewee_name": "string",
      "task_title": "string",
      "created_at": "string"
    }
  ],
  "total": "integer",
  "page": "integer",
  "pages": "integer"
}
```

#### `PATCH /api/admin/reviews/:id/hidden`

Переключение видимости отзыва (toggle).

**Тело запроса:** отсутствует  
**Ответ 200:**
```json
{ "success": true, "hidden": "boolean" }
```
**Лог:** `hide_review` или `show_review`

---

### 8.8 Чаты

#### `GET /api/admin/chats`

Список всех чатов (только метаданные).

**Параметры:** отсутствуют

**Ответ 200:**
```json
{
  "chats": [
    {
      "task_id": "integer",
      "task_title": "string",
      "task_status": "string",
      "message_count": "integer",
      "last_message_at": "string"
    }
  ]
}
```

#### `GET /api/admin/chats/:taskId`

> **ВНИМАНИЕ:** Данный эндпоинт существует в серверном коде, но **НЕ ДОЛЖЕН вызываться фронтендом** админ-панели. Содержимое сообщений -- приватная информация пользователей.

---

### 8.9 Уведомления

#### `GET /api/admin/notifications`

Список уведомлений с пагинацией.

**Query-параметры:**

| Параметр | Тип | По умолчанию |
|---|---|---|
| `page` | integer | `1` |
| `limit` | integer | `20` |

**Ответ 200:**
```json
{
  "notifications": [
    {
      "id": "integer",
      "user_id": "integer",
      "type": "string",
      "payload": "string (JSON)",
      "seen": "integer",
      "user_name": "string",
      "created_at": "string"
    }
  ],
  "total": "integer",
  "page": "integer",
  "pages": "integer"
}
```

#### `POST /api/admin/notifications/broadcast`

Отправка уведомления.

**Тело запроса:**
```json
{
  "message": "string (required)",
  "type": "string (default: 'system')",
  "userId": "integer (optional -- если не указан, рассылка всем)"
}
```

**Логика:**
- Если `userId` указан -- создаётся одно уведомление для данного пользователя
- Если `userId` не указан -- создаются уведомления для **всех** пользователей (в транзакции)
- Payload: `{ message, sent_by: adminName }`

**Ответ 200:** `{ "success": true }`  
**Ошибки:** `400` -- Сообщение обязательно  
**Лог:** `broadcast_notification`

---

### 8.10 Журнал действий

#### `GET /api/admin/actions`

Хронологический список всех действий администраторов.

**Query-параметры:**

| Параметр | Тип | По умолчанию |
|---|---|---|
| `page` | integer | `1` |
| `limit` | integer | `20` |

**Ответ 200:**
```json
{
  "actions": [
    {
      "id": "integer",
      "admin_id": "integer",
      "action": "string",
      "target_type": "string",
      "target_id": "integer",
      "details": "string",
      "timestamp": "string",
      "admin_name": "string"
    }
  ],
  "total": "integer",
  "page": "integer",
  "pages": "integer"
}
```

---

### 8.11 Вспомогательные эндпоинты

#### `GET /api/admin/categories`

Список всех используемых категорий задач.

**Ответ 200:**
```json
{ "categories": ["sites", "design", "ads", "..."] }
```

#### `GET /api/admin/system`

Техническая информация о системе (используется для диагностики).

**Ответ 200:**
```json
{
  "dbPath": "string",
  "jwtStatus": "string",
  "appVersion": "string",
  "nodeVersion": "string",
  "platform": "string",
  "uptime": "integer (seconds)",
  "dbSize": "string (MB)"
}
```

---

### 8.12 Сводка эндпоинтов

| Метод | Путь | Назначение | Auth |
|---|---|---|---|
| POST | `/api/admin/login` | Вход | -- |
| GET | `/api/admin/stats` | Статистика дашборда | JWT |
| GET | `/api/admin/users` | Список пользователей | JWT |
| GET | `/api/admin/users/:id` | Детали пользователя | JWT |
| PUT | `/api/admin/users/:id` | Редактирование пользователя | JWT |
| PATCH | `/api/admin/users/:id/block` | Блокировка / разблокировка | JWT |
| PATCH | `/api/admin/users/:id/role` | Смена роли | JWT |
| GET | `/api/admin/tasks` | Список задач | JWT |
| GET | `/api/admin/tasks/:id` | Детали задачи | JWT |
| PUT | `/api/admin/tasks/:id` | Редактирование задачи | JWT |
| PATCH | `/api/admin/tasks/:id/status` | Смена статуса задачи | JWT |
| PATCH | `/api/admin/tasks/:id/hide` | Скрыть / показать задачу | JWT |
| GET | `/api/admin/offers` | Список откликов | JWT |
| PATCH | `/api/admin/offers/:id/status` | Смена статуса отклика | JWT |
| GET | `/api/admin/reports` | Список жалоб | JWT |
| PATCH | `/api/admin/reports/:id/resolve` | Закрытие жалобы | JWT |
| GET | `/api/admin/reviews` | Список отзывов | JWT |
| PATCH | `/api/admin/reviews/:id/hidden` | Скрыть / показать отзыв | JWT |
| GET | `/api/admin/chats` | Список чатов (метаданные) | JWT |
| GET | `/api/admin/notifications` | Список уведомлений | JWT |
| POST | `/api/admin/notifications/broadcast` | Рассылка уведомлений | JWT |
| GET | `/api/admin/actions` | Журнал действий | JWT |
| GET | `/api/admin/categories` | Список категорий | JWT |
| GET | `/api/admin/system` | Системная информация | JWT |

**Итого:** 24 эндпоинта (1 без авторизации, 23 с JWT-аутентификацией).

---

## 9. UI/UX-дизайн

### 9.1 Тема: Sunset Aura Dark

Админ-панель использует ту же визуальную тему, что и основной сайт, для единообразия.

#### Цветовая палитра

| Переменная | Значение | Назначение |
|---|---|---|
| `--bg-primary` | `#1A1110` | Основной фон страницы |
| `--bg-secondary` | `#231714` | Вторичный фон (панели) |
| `--bg-glass` | `rgba(255,255,255,0.035)` | Фон стеклянных панелей |
| `--bg-glass-hover` | `rgba(255,255,255,0.06)` | Фон панели при наведении |
| `--border-glass` | `rgba(255,255,255,0.06)` | Границы стеклянных панелей |
| `--accent-orange` | `#FF4F00` | Основной акцент (кнопки, ссылки) |
| `--accent-magenta` | `#BF00FF` | Дополнительный акцент |
| `--text-primary` | `#F5F0EB` | Основной текст |
| `--text-secondary` | `#A89E97` | Вторичный текст |
| `--text-muted` | `#6B5F57` | Приглушённый текст |
| `--success` | `#22C55E` | Успешные операции |
| `--warning` | `#F59E0B` | Предупреждения |
| `--danger` | `#EF4444` | Ошибки, удаление, блокировка |
| `--info` | `#3B82F6` | Информационные сообщения |

#### Типографика

| Элемент | Шрифт | Начертание |
|---|---|---|
| Заголовки (h1--h6) | Plus Jakarta Sans | 600--800 |
| Основной текст | Inter | 300--700 |
| Моноширинный (код/ID) | Системный monospace | 400 |

#### Эффекты

- **Glassmorphism:** `backdrop-filter: blur(20px)` на панелях
- **Border-radius:** 16px для панелей, 10px для кнопок, 8px для бейджей
- **Тени:** Минимальные, за счёт `backdrop-filter` и прозрачности
- **Переходы:** `transition: all 0.2s` на интерактивных элементах

### 9.2 Компоненты UI

#### Навигация

- **Боковая панель** (sidebar): фиксированная, сворачиваемая на мобильных
- **Иконки:** Tabler Icons для каждого раздела
- **Активный пункт:** Подсветка оранжевым акцентом
- **Логотип:** TaskBridge в верхней части сайдбара

#### Кнопки

| Класс | Стиль | Применение |
|---|---|---|
| `.btn-primary` | Оранжевый градиент (`#FF4F00` -> `#E04500`) | Основные действия |
| `.btn-secondary` | Стеклянная панель | Вторичные действия |
| `.btn-danger` | Полупрозрачный красный фон | Деструктивные действия |

#### Модальные окна

- Фон: затемнение (`rgba(0,0,0,0.6)`)
- Панель: glassmorphism с `--bg-secondary`
- Кнопки: "Подтвердить" (primary) + "Отмена" (secondary)
- Закрытие: кнопка X + клик по фону + клавиша Escape

#### Таблицы

- Чередование строк: прозрачная / лёгкое затемнение
- Hover-эффект на строках
- Сортировка: клик по заголовку столбца
- Sticky-заголовки при прокрутке

#### Toast-уведомления

- Позиция: правый верхний угол
- Автозакрытие: 3 секунды
- Цветовая индикация: success (зелёный), error (красный), info (синий)

#### Скелетоны загрузки

- Анимированные пульсирующие блоки при загрузке данных
- Форма повторяет структуру ожидаемого контента

### 9.3 Адаптивность

| Breakpoint | Поведение |
|---|---|
| >= 1024px | Полная боковая панель + контент |
| 768--1023px | Сворачиваемая панель (только иконки) |
| < 768px | Гамбургер-меню, панель поверх контента |

---

## 10. Матрица полномочий мониторинга

### 10.1 Администратор МОЖЕТ:

| Объект | Чтение | Модификация | Удаление |
|---|---|---|---|
| Профили пользователей | Полное (все поля) | Имя, email, город, био, роль, блокировка | -- |
| Задачи | Полное (все поля) | Заголовок, описание, статус, категория, бюджет, срочность, видимость | -- |
| Отклики | Полное (все поля) | Статус | -- |
| Отзывы | Полное (все поля) | Видимость (hide/show) | -- |
| Жалобы | Полное (все поля) | Статус (resolve) | -- |
| Уведомления | Полное | Создание (broadcast) | -- |
| Чаты (метаданные) | Участники, количество, дата | -- | -- |
| Журнал действий | Полное | -- | -- |
| Статистика | Все агрегаты | -- | -- |

### 10.2 Администратор НЕ МОЖЕТ:

| Запрет | Причина |
|---|---|
| Читать содержимое сообщений чата | Приватность переписки пользователей |
| Удалять пользователей | Только блокировка (обратимо) |
| Удалять задачи | Только скрытие (обратимо) |
| Удалять отзывы | Только скрытие (обратимо) |
| Выполнять действия от имени другого пользователя | Безопасность |
| Получать доступ к сессиям других администраторов | Безопасность |
| Модифицировать журнал действий | Неизменяемый аудиторский след |
| Удалять что-либо из БД через UI | Все данные сохраняются |

---

## 11. Ограничения и запреты

### 11.1 Принцип обратимости

Ни одно действие администратора не является необратимым:

- **Блокировка** -> Разблокировка
- **Скрытие** -> Показ
- **Смена статуса** -> Обратная смена статуса
- **Смена роли** -> Обратная смена роли

Физическое удаление (`DELETE`) **никогда** не выполняется.

### 11.2 Отсутствие массовых операций

Массовые действия (выделить всех и заблокировать) **запрещены** в целях безопасности. Каждое действие применяется индивидуально к одному объекту.

### 11.3 Страница настроек -- исключена

Системная информация (путь к БД, версия Node.js, uptime) не представляет ценности для владельца платформы. При необходимости технической диагностики разработчик проверяет логи или терминал. Эндпоинт `GET /api/admin/system` существует, но не имеет соответствующей страницы в UI.

---

## 12. Журналирование действий

### 12.1 Функция `logAction`

Каждое мутирующее действие администратора фиксируется функцией:

```javascript
function logAction(adminId, action, targetType, targetId, details) {
  db.prepare(
    "INSERT INTO admin_actions (admin_id, action, target_type, target_id, details, timestamp) VALUES (?, ?, ?, ?, ?, datetime('now'))"
  ).run(adminId, action, targetType || '', targetId || 0, details || '');
}
```

### 12.2 Типы логируемых действий

| Действие | `action` | `target_type` | `details` (пример) |
|---|---|---|---|
| Блокировка пользователя | `block_user` | `user` | `Иван Иванов (ivan@mail.ru)` |
| Разблокировка пользователя | `unblock_user` | `user` | `Иван Иванов (ivan@mail.ru)` |
| Редактирование профиля | `edit_user` | `user` | `Редактирование: name, city` |
| Смена роли | `change_role` | `user` | `client -> performer для Иван Иванов` |
| Редактирование задачи | `edit_task` | `task` | `Редактирование: title, budget` |
| Смена статуса задачи | `change_task_status` | `task` | `draft -> published` |
| Скрытие задачи | `hide_task` | `task` | Заголовок задачи |
| Показ задачи | `show_task` | `task` | Заголовок задачи |
| Смена статуса отклика | `change_offer_status` | `offer` | `sent -> accepted` |
| Закрытие жалобы | `resolve_report` | `report` | `task #42: Спам` |
| Скрытие отзыва | `hide_review` | `review` | `Отзыв #15` |
| Показ отзыва | `show_review` | `review` | `Отзыв #15` |
| Рассылка уведомлений | `broadcast_notification` | `notification` | `Всем: Текст сообщения` |

### 12.3 Хранение

- Таблица: `admin_actions`
- Срок хранения: бессрочно (записи никогда не удаляются)
- Объём: одна строка на каждое действие

---

## Приложение A: Запуск и эксплуатация

### Запуск в режиме разработки

```bash
cd D:\work\TaskBridge-QoderWork\admin
npm run dev      # node --watch server.js (автоперезапуск при изменениях)
```

### Запуск в production

```bash
cd D:\work\TaskBridge-QoderWork\admin
npm start        # node server.js
```

### Предварительные условия

1. Установлен Node.js >= 18
2. Выполнен `npm install` в директории `admin/`
3. Файл `.env` существует в корне проекта (или используются значения по умолчанию)
4. База данных `data.db` инициализирована (через `db/init.js`)

### Проверка работоспособности

1. Запустить сервер: `npm start`
2. Открыть браузер: `http://localhost:3001`
3. Войти с учётными данными администратора (email + пароль)
4. Убедиться, что дашборд загружает статистику

---

## Приложение B: Роли и их допустимые значения

| Роль | Описание | Может войти в админ-панель |
|---|---|---|
| `client` | Заказчик услуг | Нет (403) |
| `performer` | Исполнитель | Нет (403) |
| `admin` | Администратор платформы | Да |

---

## Приложение C: Глоссарий

| Термин | Определение |
|---|---|
| **TaskBridge** | Маркетплейс freelance-услуг (digital-задачи: сайты, дизайн, боты и т.д.) |
| **Glassmorphism** | Визуальный эффект "матового стекла" через `backdrop-filter: blur()` |
| **Sunset Aura** | Фирменная тёмная тема TaskBridge с оранжево-пурпурными акцентами |
| **WAL** | Write-Ahead Logging -- режим журнала SQLite для параллельного чтения/записи |
| **CPM** | Cost Per Mille -- модель монетизации через показы рекламы |
| **SPA** | Single Page Application -- одностраничное приложение |
| **JWT** | JSON Web Token -- стандарт токенов аутентификации |
| **Broadcast** | Массовая рассылка уведомления всем пользователям платформы |
| **Toggle** | Переключение бинарного состояния (вкл/выкл, скрыть/показать) |
