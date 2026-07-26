'use strict';

require('dotenv').config();

const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { initDatabase, getDb, closeDatabase } = require('./init');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@taskbridge.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// ── Helpers ──
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pastDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - randInt(1, daysAgo));
  return d.toISOString().slice(0, 19).replace('T', ' ');
}
function futureDate(daysAhead) {
  const d = new Date();
  d.setDate(d.getDate() + randInt(3, daysAhead));
  return d.toISOString().slice(0, 10);
}
function translit(str) {
  const map = { 'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya' };
  return str.toLowerCase().split('').map(c => map[c] !== undefined ? map[c] : c).join('').replace(/\s/g, '.');
}
function makeEmail(name) { return translit(name) + '@example.com'; }

// ── Demo data ──
const CLIENT_NAMES = [
  'Алексей Петров', 'Мария Иванова', 'Дмитрий Козлов', 'Елена Соколова',
  'Сергей Морозов', 'Анна Волкова', 'Николай Лебедев', 'Ольга Новикова',
  'Павел Егоров', 'Татьяна Орлова'
];

const CLIENT_COMPANIES = [
  'ООО Вектор', 'ИП Петров', 'Студия Красок', '', 'ТехноЛайт',
  '', 'МедиаПро', '', 'Формат Плюс', ''
];

const PERFORMER_NAMES = [
  'Иван Сидоров', 'Анастасия Белова', 'Максим Жуков', 'Виктория Тарасова',
  'Артём Фёдоров', 'Дарья Кузнецова', 'Кирилл Поляков', 'Юлия Романова',
  'Андрей Медведев', 'Екатерина Зайцева', 'Роман Григорьев', 'Светлана Смирнова',
  'Денис Никифоров', 'Наталья Воронова', 'Владислав Комаров', 'Алина Степанова',
  'Глеб Макаров', 'Валерия Борисова', 'Тимур Лазарев', 'Ирина Филиппова'
];

const SPECIALIZATIONS = [
  'Веб-разработчик', 'Дизайнер', 'Маркетолог', 'Разработчик ботов',
  'Автоматизатор', 'Копирайтер', 'Презентации', 'Аналитик данных',
  'Full-stack разработчик', 'UI/UX дизайнер', 'SMM-специалист',
  'Python-разработчик', 'DevOps инженер', 'Таргетолог', 'SEO-специалист',
  'Технический писатель', 'Motion-дизайнер', 'Data scientist'
];

const SKILL_SETS = [
  ['sites', 'design'], ['design', 'presentations'], ['ads', 'texts'],
  ['bots', 'automation'], ['automation', 'sites'], ['texts', 'ads'],
  ['presentations', 'design'], ['analytics', 'automation'],
  ['sites', 'bots'], ['design', 'sites'], ['ads', 'analytics'],
  ['sites', 'automation', 'bots'], ['texts', 'presentations'],
  ['analytics', 'sites'], ['bots', 'design'], ['ads', 'sites']
];

const CATEGORIES = ['sites', 'design', 'ads', 'bots', 'automation', 'texts', 'presentations', 'analytics', 'other'];

const TASK_TITLES = [
  'Сделать лендинг для кофейни', 'Настроить таргетированную рекламу',
  'Починить форму обратной связи', 'Подключить онлайн-оплату',
  'Настроить Telegram-бота для записи', 'Оформить презентацию для инвесторов',
  'Сделать баннеры для рекламы', 'Автоматизировать таблицу в Google Sheets',
  'Разобрать и систематизировать заявки', 'Настроить email-рассылку',
  'Редизайн главной страницы', 'Создать бота для поддержки клиентов',
  'Написать тексты для сайта', 'Сделать логотип и фирменный стиль',
  'Настроить Google Ads кампанию', 'Создать каталог товаров на сайте',
  'Разработать мобильное приложение', 'SEO-оптимизация сайта',
  'Подключить CRM-систему', 'Создать шаблон для рассылок',
  'Сделать дашборд в Google Data Studio', 'Интеграция с 1С',
  'Настроить аналитику на сайте', 'Сделать бот для уведомлений',
  'Обучить команду работе с CRM', 'Создать контент-план на месяц',
  'Перенести сайт на новый хостинг', 'Разработать калькулятор стоимости',
  'Настроить ретаргетинг', 'Оформить гайдлайн бренда',
  'Создать Telegram-канал с ботом', 'Автоматизация отчётности',
  'Подготовить SMM-стратегию', 'Сделать видеопрезентацию продукта',
  'Разработать API для мобильного приложения', 'Создать чат-бот для FAQ',
  'Оптимизировать скорость загрузки сайта', 'Настроить систему бронирования',
  'Создать email-воронку продаж', 'Сделать интерактивную карту офисов'
];

const TASK_DESCRIPTIONS = [
  'Нужен современный лендинг с адаптивной вёрсткой. Есть примеры дизайна, нужна реализация под ключ. Срок — 2 недели.',
  'Нужно запустить рекламу в социальных сетях. Бюджет на рекламу отдельный. Нужен специалист с опытом в нашей нише.',
  'На сайте перестала работать форма. Нужно найти причину и починить. Доступ к коду предоставим.',
  'Хотим принимать оплату картой на сайте. Нужна интеграция с платёжной системой. Юрлицо есть.',
  'Бот для записи клиентов. Должен принимать заявки, подтверждать время и отправлять напоминания.',
  'Презентация на 15-20 слайдов для встречи с инвесторами. Контент есть, нужен красивый дизайн.',
  'Нужны рекламные баннеры в нескольких размерах для размещения на площадках.',
  'Есть таблица с данными, нужно автоматизировать обновление и формирование отчётов.',
  'Накопилось много заявок в разных каналах. Нужно всё разобрать, структурировать и внести в CRM.',
  'Настроить систему email-рассылок. Нужен шаблон, список сегментов и автоматические цепочки.',
  'Сайт устарел, нужно обновить дизайн главной страницы, сделать её более современной и удобной.',
  'Нужен бот, который отвечает на частые вопросы клиентов и передаёт сложные запросы менеджеру.',
  'Есть структура сайта, нужны качественные тексты для 5-7 страниц. Стиль — деловой, но дружелюбный.',
  'Компания новая, нужен логотип и базовый фирменный стиль: цвета, шрифты, визитки.',
  'Нужна рекламная камания в Google. Подобрать ключевые слова, написать объявления, запустить.',
  'На сайте нужен раздел с каталогом: карточки товаров, фильтры, поиск.',
  'Нужно разработать простое мобильное приложение для записи клиентов.',
  'Сайт плохо ранжируется. Нужен аудит и план работ по продвижению.',
  'Внедрить CRM для отдела продаж. Интеграция с почтой и телефонией.',
  'Нужен красивый HTML-шаблон для регулярных рассылок. Должен хорошо выглядеть в разных почтовых клиентах.',
  'Собрать дашборд с ключевыми метриками бизнеса из нескольких источников данных.',
  'Нужна интеграция сайта с 1С: синхронизация товаров, заказов и остатков.',
  'Установить и настроить систему веб-аналитики. Цели, события, отчёты.',
  'Бот, который отправляет уведомления о новых заказах менеджерам в Telegram.',
  'Провести обучение команды из 5 человек работе с новой CRM-системой.',
  'Разработать контент-план на месяц для социальных сетей. 3-4 поста в неделю.',
  'Перенести работающий сайт на новый хостинг без потери данных и позиций.',
  'Калькулятор на сайте: клиент вводит параметры и получает примерную стоимость.',
  'Настроить ретаргетинг для посетителей сайта, которые не совершили покупку.',
  'Создать подробный гайдлайн: как использовать элементы бренда.',
  'Telegram-канал + бот для автоматической публикации контента и взаимодействия.',
  'Автоматизировать формирование еженедельных и ежемесячных отчётов.',
  'Подготовить SMM-стратегию: анализ, целевая аудитория, контент, KPI.',
  'Видеопрезентация продукта на 2-3 минуты с анимацией и озвучкой.',
  'REST API для мобильного приложения. Авторизация, CRUD, уведомления.',
  'Чат-бот с базой знаний: отвечает на вопросы по документации продукта.',
  'Сайт грузится 5+ секунд. Нужно довести до 2 секунд.',
  'Система онлайн-бронирования для салона красоты.',
  'Воронка из 5-7 писем для конверсии подписчиков в покупателей.',
  'Интерактивная карта с метками офисов и фильтрами по городам.'
];

const OFFER_MESSAGES = [
  'Готов взяться за вашу задачу. Есть опыт в подобных проектах, покажу примеры в портфолио.',
  'Здравствуйте! Специализируюсь на таких задачах. Сделаю качественно и в срок.',
  'Добрый день! Интересный проект, хотел бы обсудить детали. Могу начать на этой неделе.',
  'Приветствую! У меня большой опыт в этой области. Предлагаю созвониться для обсуждения.',
  'Готов сделать. Предварительно оцениваю сроки в 1-2 недели. Точнее скажу после обсуждения ТЗ.',
  'Занимаюсь подобными проектами ежедневно. Сделаю быстро и с гарантией.',
];

const CHAT_MESSAGES = [
  'Добрый день! Начал работу над проектом.',
  'Отлично, спасибо за оперативность!',
  'Подскажите, есть ли у вас примеры того, что нравится?',
  'Да, могу скинуть референсы в следующем сообщении.',
  'Сделал первый вариант, посмотрите пожалуйста.',
  'Выглядит хорошо, но давайте немного доработаем цветовую схему.',
  'Конечно, какие именно цвета хотели бы использовать?',
  'Спасибо за обратную связь, внесу правки сегодня.',
  'Отправил обновлённый вариант на проверку.',
  'Всё отлично, принимаю работу!',
];

const REVIEW_COMMENTS = [
  'Отличная работа! Всё сделано качественно и в срок.',
  'Хороший специалист, рекомендую. Быстро разобрался в задаче.',
  'Работа выполнена хорошо, были мелкие правки, но всё исправил оперативно.',
  'Профессиональный подход, буду обращаться ещё.',
  'Задача выполнена, но сроки немного сдвинулись. В целом доволен результатом.',
  'Прекрасная коммуникация, всегда на связи. Результат превзошёл ожидания.',
  'Качественная работа, внимание к деталям. Рекомендую!',
  'Всё чётко, по делу и в срок. Спасибо!',
];

const AVATARS = [
  'https://api.dicebear.com/7.x/initials/svg?seed=AP&backgroundColor=4f46e5',
  'https://api.dicebear.com/7.x/initials/svg?seed=MI&backgroundColor=059669',
  'https://api.dicebear.com/7.x/initials/svg?seed=DK&backgroundColor=dc2626',
  'https://api.dicebear.com/7.x/initials/svg?seed=ES&backgroundColor=d97706',
  'https://api.dicebear.com/7.x/initials/svg?seed=SM&backgroundColor=7c3aed',
  'https://api.dicebear.com/7.x/initials/svg?seed=AV&backgroundColor=0891b2',
  'https://api.dicebear.com/7.x/initials/svg?seed=NL&backgroundColor=be185d',
  'https://api.dicebear.com/7.x/initials/svg?seed=ON&backgroundColor=65a30d',
  'https://api.dicebear.com/7.x/initials/svg?seed=PE&backgroundColor=0d9488',
  'https://api.dicebear.com/7.x/initials/svg?seed=TO&backgroundColor=c026d3',
];

function getAvatar(name) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2);
  const colors = ['4f46e5', '059669', 'dc2626', 'd97706', '7c3aed', '0891b2', 'be185d', '65a30d'];
  return `https://api.dicebear.com/7.x/initials/svg?seed=${initials}&backgroundColor=${pick(colors)}`;
}

// ── Seed function ──
function seed() {
  console.log('Initializing database...');
  initDatabase();
  const db = getDb();

  // Clear existing data
  console.log('Clearing existing data...');
  db.exec(`
    DELETE FROM admin_actions;
    DELETE FROM notifications;
    DELETE FROM reports;
    DELETE FROM reviews;
    DELETE FROM messages;
    DELETE FROM offers;
    DELETE FROM tasks;
    DELETE FROM performer_profiles;
    DELETE FROM users;
  `);

  const hash = bcrypt.hashSync('password123', 10);
  const adminHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);

  // ── Create admin ──
  console.log('Creating admin...');
  db.prepare(`
    INSERT INTO users (name, email, password_hash, role, avatar, city, country, bio, rating)
    VALUES (?, ?, ?, 'admin', ?, 'Москва', 'Россия', 'Администратор платформы', 5)
  `).run('Администратор', ADMIN_EMAIL, adminHash, getAvatar('Админ'));

  // ── Create clients (10) ──
  console.log('Creating clients...');
  const clientIds = [];
  for (let i = 0; i < CLIENT_NAMES.length; i++) {
    const name = CLIENT_NAMES[i];
    const email = makeEmail(name);
    const cities = ['Москва', 'Санкт-Петербург', 'Казань', 'Новосибирск', 'Екатеринбург', 'Краснодар', 'Ростов-на-Дону', 'Нижний Новгород', 'Самара', 'Воронеж'];
    const bios = [
      'Владелец малого бизнеса', 'Маркетолог в стартапе', 'Директор агентства',
      '', 'Технический директор', '', 'Руководитель отдела маркетинга',
      '', 'Основатель студии', 'Менеджер проектов'
    ];
    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, avatar, company, city, country, bio, website, rating, task_count)
      VALUES (?, ?, ?, 'client', ?, ?, ?, 'Россия', ?, ?, ?, 0)
    `).run(name, email, hash, getAvatar(name), CLIENT_COMPANIES[i] || '', cities[i], bios[i],
      CLIENT_COMPANIES[i] ? `https://${CLIENT_COMPANIES[i].toLowerCase().replace(/\s/g, '')}.ru` : '',
      3 + Math.random() * 2);
    clientIds.push(result.lastInsertRowid);
  }

  // ── Create performers (20) ──
  console.log('Creating performers...');
  const performerIds = [];
  for (let i = 0; i < PERFORMER_NAMES.length; i++) {
    const name = PERFORMER_NAMES[i];
    const email = makeEmail(name);
    const cities = ['Москва', 'Санкт-Петербург', 'Казань', 'Новосибирск', 'Екатеринбург',
      'Тбилиси', 'Алматы', 'Ереван', 'Минск', 'Ташкент',
      'Белград', 'Лиссабон', 'Берлин', 'Дубай', 'Тбилиси',
      'Москва', 'Санкт-Петербург', 'Казань', 'Новосибирск', 'Екатеринбург'];
    const countryMap = {
      'Москва': 'Россия', 'Санкт-Петербург': 'Россия', 'Казань': 'Россия',
      'Новосибирск': 'Россия', 'Екатеринбург': 'Россия',
      'Тбилиси': 'Грузия', 'Алматы': 'Казахстан', 'Ереван': 'Армения',
      'Минск': 'Беларусь', 'Ташкент': 'Узбекистан',
      'Белград': 'Сербия', 'Лиссабон': 'Португалия', 'Берлин': 'Германия',
      'Дубай': 'ОАЭ'
    };
    const availability = pick(['free', 'free', 'free', 'partial', 'busy']);
    const skills = SKILL_SETS[i % SKILL_SETS.length];
    const rate = randInt(500, 5000);
    const langs = JSON.stringify(pick([['Русский'], ['Русский', 'Английский'], ['Русский', 'Английский', 'Немецкий']]));
    const experience = `${randInt(1, 12)} лет опыта`;

    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, avatar, city, country, bio, rating, completed_count, task_count)
      VALUES (?, ?, ?, 'performer', ?, ?, ?, ?, ?, ?, 0)
    `).run(name, email, hash, getAvatar(name), cities[i], countryMap[cities[i]] || 'Россия',
      `${SPECIALIZATIONS[i]}. ${experience}. Работаю с малым бизнесом.`,
      3 + Math.random() * 2, randInt(2, 25));
    performerIds.push(result.lastInsertRowid);

    db.prepare(`
      INSERT INTO performer_profiles (user_id, specialization, skills, experience, portfolio_links, hourly_rate, languages, availability)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      result.lastInsertRowid,
      SPECIALIZATIONS[i],
      JSON.stringify(skills),
      experience,
      JSON.stringify([`https://portfolio-${i + 1}.example.com`]),
      rate, langs, availability
    );
  }

  // ── Create tasks (40) ──
  console.log('Creating tasks...');
  const taskIds = [];
  const taskStatuses = ['published', 'published', 'published', 'published', 'published',
    'published', 'published', 'assigned', 'in_progress', 'completed', 'completed', 'cancelled'];

  for (let i = 0; i < 40; i++) {
    const titleIdx = i % TASK_TITLES.length;
    const creatorIdx = i % clientIds.length;
    const category = CATEGORIES[i % CATEGORIES.length];
    const status = taskStatuses[i % taskStatuses.length];
    const budget = pick([3000, 5000, 7000, 10000, 15000, 20000, 25000, 30000, 50000, 0]);
    const budgetType = budget === 0 ? 'negotiable' : pick(['fixed', 'fixed', 'hourly']);
    const urgency = pick(['low', 'normal', 'normal', 'high', 'urgent']);
    const skills = JSON.stringify(SKILL_SETS[i % SKILL_SETS.length]);
    const deadline = futureDate(30);
    const created = pastDate(60);
    const remote = pick([0, 1, 1, 1]); // mostly remote

    const result = db.prepare(`
      INSERT INTO tasks (title, description, expected_result, category, budget, budget_type,
        deadline, urgency, remote_allowed, required_skills, files, links, status, creator_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      TASK_TITLES[titleIdx],
      TASK_DESCRIPTIONS[titleIdx],
      'Задача выполнена качественно и в срок',
      category, budget, budgetType, deadline, urgency, remote,
      skills, '[]', '[]', status,
      clientIds[creatorIdx], created, created
    );
    taskIds.push(result.lastInsertRowid);

    // Update client task count
    db.prepare('UPDATE users SET task_count = task_count + 1 WHERE id = ?').run(clientIds[creatorIdx]);
  }

  // ── Create offers for tasks ──
  console.log('Creating offers...');
  const offerIds = [];
  for (let i = 0; i < taskIds.length; i++) {
    const taskId = taskIds[i];
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    const numOffers = randInt(1, 4);

    // Pick random performers (not the task creator)
    const availablePerformers = performerIds.filter(id => id !== task.creator_id);
    const shuffled = availablePerformers.sort(() => Math.random() - 0.5).slice(0, numOffers);

    for (const perfId of shuffled) {
      let offerStatus = 'sent';
      if (task.status === 'assigned' || task.status === 'in_progress' || task.status === 'completed') {
        // One offer accepted, rest rejected
        if (!db.prepare("SELECT id FROM offers WHERE task_id = ? AND status = 'accepted'").get(taskId)) {
          offerStatus = 'accepted';
          // Assign performer to task
          db.prepare("UPDATE tasks SET assigned_to = ?, status = CASE WHEN status = 'published' THEN 'assigned' ELSE status END WHERE id = ?")
            .run(perfId, taskId);
        } else {
          offerStatus = 'rejected';
        }
      }

      const result = db.prepare(`
        INSERT INTO offers (task_id, performer_id, message, price, estimated_time, includes, questions, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        taskId, perfId,
        pick(OFFER_MESSAGES),
        task.budget > 0 ? task.budget + randInt(-2000, 3000) : randInt(3000, 30000),
        `${randInt(1, 14)} дней`,
        'Входит: разработка, тестирование, мелкие правки',
        pick(['', 'Уточните, есть ли доступ к хостингу?', '', 'Какие референсы по дизайну?', '']),
        offerStatus, pastDate(30)
      );
      offerIds.push(result.lastInsertRowid);
    }
  }

  // ── Create chat messages for assigned/in_progress/completed tasks ──
  console.log('Creating chat messages...');
  const activeTasks = db.prepare("SELECT * FROM tasks WHERE status IN ('assigned', 'in_progress', 'completed')").all();

  for (const task of activeTasks) {
    if (!task.assigned_to) continue;

    const numMessages = randInt(2, 6);
    const usedMessages = CHAT_MESSAGES.sort(() => Math.random() - 0.5).slice(0, numMessages);

    for (let j = 0; j < usedMessages.length; j++) {
      const sender = j % 2 === 0 ? task.assigned_to : task.creator_id;
      db.prepare(`
        INSERT INTO messages (task_id, sender_id, content, created_at)
        VALUES (?, ?, ?, ?)
      `).run(task.id, sender, usedMessages[j], pastDate(20));
    }
  }

  // ── Create reviews for completed tasks ──
  console.log('Creating reviews...');
  const completedTasks = db.prepare("SELECT * FROM tasks WHERE status = 'completed'").all();

  for (const task of completedTasks) {
    if (!task.assigned_to) continue;

    const rating = randInt(3, 5);
    // Client reviews performer
    db.prepare(`
      INSERT INTO reviews (reviewer_id, reviewee_id, task_id, rating, comment, likes, improvements, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      task.creator_id, task.assigned_to, task.id,
      rating, pick(REVIEW_COMMENTS),
      pick(['Быстрая коммуникация', 'Качественная работа', 'Внимание к деталям', 'Профессионализм']),
      pick(['', 'Немного затянуты сроки', '', 'Можно улучшить документацию', '']),
      pastDate(15)
    );

    // Update performer rating
    const stats = db.prepare('SELECT AVG(rating) as avg_rating, COUNT(*) as cnt FROM reviews WHERE reviewee_id = ?').get(task.assigned_to);
    db.prepare('UPDATE users SET rating = ?, review_count = ?, completed_count = completed_count + 1 WHERE id = ?')
      .run(Math.round(stats.avg_rating * 10) / 10, stats.cnt, task.assigned_to);

    // Sometimes performer reviews client too
    if (Math.random() > 0.4) {
      const rating2 = randInt(3, 5);
      db.prepare(`
        INSERT INTO reviews (reviewer_id, reviewee_id, task_id, rating, comment, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(task.assigned_to, task.creator_id, task.id, rating2, pick(REVIEW_COMMENTS), pastDate(14));
    }
  }

  // ── Create some reports ──
  console.log('Creating reports...');
  const reportReasons = ['Спам', 'Оскорбительный контент', 'Мошенничество', 'Нарушение правил'];
  for (let i = 0; i < 3; i++) {
    db.prepare(`
      INSERT INTO reports (reporter_id, target_type, target_id, reason, comment, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      pick(performerIds), pick(['task', 'user']),
      pick(taskIds.slice(0, 10)), pick(reportReasons),
      'Нарушение правил платформы', pick(['new', 'reviewing', 'closed']),
      pastDate(10)
    );
  }

  // ── Create notifications for all users ──
  console.log('Creating notifications...');
  for (const id of [...clientIds, ...performerIds]) {
    db.prepare('INSERT INTO notifications (user_id, type, payload, created_at) VALUES (?, ?, ?, ?)')
      .run(id, 'welcome', JSON.stringify({ message: 'Добро пожаловать в TaskBridge!' }), pastDate(60));
  }

  // ── Block one user (for demo) ──
  console.log('Blocking a demo user...');
  const blockedUser = performerIds[performerIds.length - 1];
  db.prepare('UPDATE users SET blocked = 1 WHERE id = ?').run(blockedUser);
  db.prepare('INSERT INTO admin_actions (admin_id, action, target_type, target_id, details) VALUES (1, ?, ?, ?, ?)')
    .run('user_blocked', 'user', blockedUser, 'Demo block');

  // ── Hide one task (for demo) ──
  console.log('Hiding a demo task...');
  const hiddenTask = taskIds[taskIds.length - 1];
  db.prepare("UPDATE tasks SET status = 'hidden' WHERE id = ?").run(hiddenTask);
  db.prepare('INSERT INTO admin_actions (admin_id, action, target_type, target_id, details) VALUES (1, ?, ?, ?, ?)')
    .run('task_hidden', 'task', hiddenTask, 'Demo hide');

  // ── Create some admin_actions ──
  db.prepare('INSERT INTO admin_actions (admin_id, action, target_type, target_id, details) VALUES (1, ?, ?, ?, ?)')
    .run('system_init', 'system', 0, 'Seed data loaded');

  console.log('\n✅ Seed complete!');
  console.log(`   Admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`   Clients: ${clientIds.length} (password: password123)`);
  console.log(`   Performers: ${performerIds.length} (password: password123)`);
  console.log(`   Tasks: ${taskIds.length}`);
  console.log(`   Offers: ${offerIds.length}`);
  console.log('\n   Sample login:');
  console.log(`   Client: ${CLIENT_NAMES[0].toLowerCase().replace(/\s/g, '.')}@example.com / password123`);
  console.log(`   Performer: ${PERFORMER_NAMES[0].toLowerCase().replace(/\s/g, '.')}@example.com / password123`);

  closeDatabase();
}

seed();
