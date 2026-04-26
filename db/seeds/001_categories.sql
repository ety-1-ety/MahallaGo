-- ─────────────────────────────────────────────────────────────────
-- Глобальные категории товаров
-- Идемпотентно через ON CONFLICT (slug) DO UPDATE.
-- ─────────────────────────────────────────────────────────────────

INSERT INTO catalog.categories (slug, name_uz, name_ru, emoji, sort_order) VALUES
  ('bread',         'Non',                'Хлеб',                '🍞',  10),
  ('vegetables',    'Sabzavotlar',        'Овощи',               '🥬',  20),
  ('fruits',        'Mevalar',            'Фрукты',              '🍎',  30),
  ('dairy',         'Sut mahsulotlari',   'Молочные продукты',   '🥛',  40),
  ('meat',          'Goʻsht',             'Мясо',                '🥩',  50),
  ('fish',          'Baliq',              'Рыба',                '🐟',  60),
  ('groceries',     'Oziq-ovqat',         'Бакалея',             '🍚',  70),
  ('drinks',        'Ichimliklar',        'Напитки',             '🥤',  80),
  ('sweets',        'Shirinliklar',       'Сладости',            '🍬',  90),
  ('frozen',        'Muzlatilgan',        'Замороженные продукты','🧊', 100),
  ('pharmacy',      'Dorixona',           'Аптека',              '💊', 110),
  ('household',     'Maishiy kimyo',      'Бытовая химия',       '🧴', 120),
  ('hygiene',       'Gigiyena',           'Гигиена',             '🧼', 130),
  ('baby',          'Bolalar uchun',      'Детские товары',      '🍼', 140),
  ('pets',          'Hayvonlar uchun',    'Товары для животных', '🐾', 150),
  ('stationery',    'Kantselyariya',      'Канцтовары',          '✏️', 160),
  ('other',         'Boshqa',             'Прочее',              '📦', 999)
ON CONFLICT (slug) DO UPDATE SET
  name_uz    = EXCLUDED.name_uz,
  name_ru    = EXCLUDED.name_ru,
  emoji      = EXCLUDED.emoji,
  sort_order = EXCLUDED.sort_order,
  is_active  = TRUE,
  updated_at = NOW();
