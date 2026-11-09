# Перевірка VOLTOS 2.0

Дата: 9 листопада 2026. Перевірка виконується на локальному checkout гілки `codex/premium-iphone`.

## Результати

| Перевірка | Результат | Межа доказу |
|---|---|---|
| TypeScript клієнта та API | Пройдено | Обидва tsconfig виконуються під час build |
| Production Vite build | Пройдено | 38 модулів, основний JS близько 28 KB gzip, CSS близько 6.3 KB gzip |
| Unit / integration | 41 тест пройдено | Телеметрія, CSV, протокол, транспорт BLE, адаптери, API-доступ і ownership, міграція, native bearer/Keychain lifecycle через mock |
| WebKit iPhone viewport | 9 сценаріїв пройдено | Браузер WebKit із параметрами iPhone, не iOS Simulator |
| Chromium mobile viewport | 9 сценаріїв пройдено | Контрольні API-відповіді, перевірка UI і подій |
| Production PWA offline | 1 тест пройдено | Перезавантаження без мережі, precache JS/CSS, відсутність API у кеші |
| iOS arm64 compilation | `BUILD SUCCEEDED` | Xcode, SDK iphoneos27.2, Debug, `CODE_SIGNING_ALLOWED=NO`; не встановлення на телефон |
| Native sync | Пройдено | Bluetooth LE, App, Filesystem, Haptics, Share; Swift-міст включений у Sources |
| npm audit | 0 відомих вразливостей | Остаточний набір із 148 npm-пакетів, актуальний на момент перевірки |
| git diff --check | Пройдено | Немає whitespace-помилок |

## Користувацькі сценарії

1. Перший запуск без обладнання: «—» замість вигаданих вимірювань, 0 доступних пристроїв, усі вкладки працюють.
2. Oukitel login → список власних пристроїв → state → cloud snapshot на екрані. Пароль відсутній у localStorage.
3. Актуальний server online=false блокує cloud-контроли, навіть якщо попередній список повідомляв online=true.
4. Скасування AC-команди не викликає endpoint `control`.
5. Невірний пароль показує повідомлення сервера й дозволяє повторити вхід.
6. Atlantic без необхідних `commands` не дозволяє змінити температуру, живлення чи режим.
7. CSV завантажується з реальними CRLF-рядками. Скасування очищення не видаляє записи.
8. Історія попередньої версії доступна для перегляду й експорту навіть до появи вимірювань нової станції.
9. Тема зберігається після reload. Перевірено відсутність горизонтального overflow при 320, 375, 430 і 1024 px.

API тести додатково перевіряють unauthenticated/cross-origin/forged session, upstream verified=false/null, некоректну температуру, відсутню конфігурацію, належність Oukitel, офлайн-стан на сервері та HTTP 401 після закінчення vendor-сесії.

BLE тести відтворюють фрагментовані Modbus-повідомлення з CRC, optional unsupported registers, readback після запису, відновлення черги після transport failure та відмову іншій BLUETTI-моделі. Це **модель транспорту**, не звіт про фізичну EB3A.

## Виправлення, знайдене під час перевірки

Production offline-тест виявив, що `Vary: Origin` на статичних Vite-ресурсах заважав cache match для модульних JS/CSS після перезавантаження без мережі. `ignoreVary` застосовано тільки до переліку своїх precached build assets; API та сторонні ресурси до цієї гілки не потрапляють. Версія кешу враховує index, icon, manifest, worker template і список hashed assets.

## Живий бекенд: тільки read-only

Без облікових даних перевірено наявний production:

- `/api/bridge?action=session` → `authenticated:false, configured:true`.
- `/api/oukitel?action=session` → `connected:false`.

Це підтверджує доступність session endpoints. Воно **не підтверджує** vendor login, показники обладнання чи фізичні команди. Нові серверні виправлення лежать у гілці та потребують окремого деплою; Xcode не розгортає бекенд.

## Що не перевірялося

- Фізичний iPhone: code signing, системна Bluetooth-панель, Keychain після завершення процесу, Share Sheet, клавіатура, VoiceOver та повернення з фону.
- Реальні EB3A, Oukitel і Atlantic: фактична телеметрія та виконання команд.
- iOS Simulator: встановлені SDK є, runtime і devices у середовищі відсутні.
- Комерційна multi-tenant безпека та безперервний фоновий збір — поза поточною приватною версією.
- GitHub Actions: конфігурація додається для майбутніх PR; локальні результати не називаються результатом CI.

Знімки [головної](previews/iphone-home.png) та [пристроїв](previews/iphone-devices.png) отримані з WebKit на viewport 390×844, scale 3. На них початковий стан без телеметрії; зображення не є скриншотами фізичного iPhone.

## Джерела для нативної реалізації

- [Capacitor Share](https://capacitorjs.com/docs/apis/share): передавання cache-файла системному меню.
- [Capacitor Filesystem](https://capacitorjs.com/docs/apis/filesystem#apple-privacy-manifest-requirements): privacy manifest FileTimestamp, причина C617.1.
- Локальні вихідні коди `@capacitor/ios`: реєстрація CAPBridgedPlugin через `capacitorDidLoad`.
