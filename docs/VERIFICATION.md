# Перевірка VOLTOS 2.1

Дата: 9 листопада 2026. Перевірка виконується на локальному checkout гілки `codex/premium-iphone`.

## Результати

| Перевірка | Результат | Межа доказу |
|---|---|---|
| TypeScript клієнта та API | Пройдено | Обидва tsconfig виконуються під час build |
| Production Vite build | Пройдено | 41 модуль, основний JS близько 39.5 KB gzip, CSS близько 7.7 KB gzip |
| Unit / integration | 67 тестів пройдено | Телеметрія, прогноз, протокол, транспорт BLE/LAN, адаптери, API-доступ і ownership, міграція, native bearer/Keychain lifecycle через mock |
| WebKit iPhone viewport | 17 сценаріїв пройдено | Браузер WebKit із параметрами iPhone, не iOS Simulator |
| Chromium mobile viewport | 17 сценаріїв пройдено | Контрольні API-відповіді, перевірка UI і подій |
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

## Опублікований бекенд: smoke-перевірка

9 листопада 2026 опубліковано production commit `97e21db88293ca8cb5eb65d9c4ff23982c277138`, deployment `dpl_D6xEVGX4ZRNMykWWsbkg8V4oXSxv`. Перевірено спочатку deployment URL, потім публічну адресу `https://voltos-belli.vercel.app` після promotion:

- `GET /api/bridge?action=session` → HTTP 200, `authenticated:false, configured:true`.
- `GET /api/oukitel?action=session` → HTTP 200, `connected:false, configured:true`.
- `POST /api/oukitel?action=lan-key` із native-заголовком без сесії → HTTP 401.
- Той самий POST зі стороннім Origin → HTTP 403.
- Головна сторінка → HTTP 200, актуальні hashed JS/CSS assets.

Це підтверджує запуск обох API та відхилення неавторизованих запитів ключа. Воно **не підтверджує** vendor login, отримання реального ключа, показники обладнання чи фізичні команди. Облікові дані користувача не використовувалися. Xcode не розгортає бекенд; для оновлення Swift-містка потрібен Run на iPhone.

## Що не перевірялося

- Фізичний iPhone: code signing, системна Bluetooth-панель, Keychain після завершення процесу, Share Sheet, клавіатура, VoiceOver та повернення з фону.
- Реальні EB3A, Oukitel і Atlantic: фактична телеметрія та виконання команд.
- iOS Simulator: встановлені SDK є, runtime і devices у середовищі відсутні.
- Комерційна multi-tenant безпека та безперервний фоновий збір — поза поточною приватною версією.
- Результати GitHub Actions перевіряються окремо від локальних: для production commit workflow run `42621028329` завершився успішно; другий workflow перевірявся окремо.

Знімки [головної](previews/iphone-home.png) та [пристроїв](previews/iphone-devices.png) отримані з WebKit на viewport 390×844, scale 3. На них початковий стан без телеметрії; зображення не є скриншотами фізичного iPhone.

## Джерела для нативної реалізації

- [Capacitor Share](https://capacitorjs.com/docs/apis/share): передавання cache-файла системному меню.
- [Capacitor Filesystem](https://capacitorjs.com/docs/apis/filesystem#apple-privacy-manifest-requirements): privacy manifest FileTimestamp, причина C617.1.
- Локальні вихідні коди `@capacitor/ios`: реєстрація CAPBridgedPlugin через `capacitorDidLoad`.

## Додаткові докази 2.1

- Форма логіна/пароля зберігає DOM identity, значення і caret після 65 секунд віртуального polling, blur та наступного rerender у WebKit і Chromium.
- Перехід Oukitel → Atlantic → BLUETTI → Oukitel, повернення останньої вкладки, особисті назви, обрані та режим LAN без неправдивого browser connection.
- LAN-протокол: приватні адреси, байтове екранування, фрагментація, checksum, TTLV межі, hello/login, AES-телеметрія, незалежний readback. Підписка не надсилає команд виходам.
- Незалежні опубліковані синтетичні test vectors із MIT-дослідження перевіряють точний SHA-256 proof і розшифрування телеметрії. Це не ключ користувача.
- API LAN-key перевіряє session, native transport і ownership перед отриманням ключа; вебдоступ та чужий пристрій відхиляються.
- Оцінка енергії не інтегрує прогалини, не поєднує різні пристрої чи транспорти.
- OukitelLan.swift включений у нативну компіляцію; запуск на власній Oukitel не заявляється.

Знімок previews/iphone-device-workspace.png показує інтерфейс із контрольними API-відповідями тестів (75% тощо), не реальні показники обладнання. Початкові екрани в решті знімків не містять телеметрії.

## Виправлення запуску native bridge після звіту з iPhone

Фізичний запуск виявив помилку, якої не показує компіляція: SceneDelegate створював стандартний CAPBridgeViewController, хоча Main.storyboard посилався на VoltosViewController. Програмне створення root controller обходило storyboard і реєстрацію VoltosNative/OukitelLan. SceneDelegate тепер створює VoltosViewController безпосередньо.

Перед ios:sync виконується scripts/check-ios-bridge.mjs: перевіряє фактичний scene entrypoint, відповідність JS plugin names, реєстрацію Swift plugin instances та включення Swift-файлів у проєкт. Це статична перевірка нативного wiring, не заміна фізичного запуску. Повторна компіляція iPhone завершилась BUILD SUCCEEDED; повторний запуск на телефоні потребує встановлення оновленого binary через Xcode.

## Перевірка Node ESM під час публікації

Production smoke-check виявив `ERR_MODULE_NOT_FOUND` у Atlantic API: runtime-імпорт `../server/http` не містив розширення. Production повернуто до попереднього працездатного deployment на час виправлення. Імпорт змінено на `../server/http.js`, а серверний TypeScript переведено на `NodeNext`, щоб збірка відхиляла такі несумісні з Node ESM імпорти.

Після виправлення `npm run check` пройшов (54 тести). Обидва серверні handlers додатково скомпільовано в тимчасову директорію та імпортовано звичайним Node без Vite/Vitest resolver: session-запити повернули HTTP 200. Це перевірка запуску скомпільованих модулів, без входу до vendor-акаунтів.

## Порожній Keychain після встановлення на iPhone

Повідомлення `undefined is not an object (evaluating 'e.value')` відповідало двом читачам `getSession`: відновленню Cloud-сесії та читанню персонального LAN-ключа. Для відсутнього запису Swift викликав `call.resolve()` без payload; Capacitor передавав JavaScript значення `undefined`, тоді як клієнт очікував об'єкт.

Swift тепер повертає `{value: null}`. Обидва читачі також підтримують порожній payload старішої збірки. Помилка читання заблокованого Keychain продовжує відхиляти запит і дозволяє повтор, без підміни помилки відсутньою сесією.

Перевірено `npm run check` (58 тестів), `npm run ios:sync` та успішну unsigned-компіляцію iPhone. Новий Playwright-сценарій пройшов окремо у WebKit і Chromium: емулює native Keychain з `undefined`, відновлює Cloud-стан, залишає ручний LAN-ключ порожнім і перевіряє, що запит ключа надсилається для обраної станції. Відповіді контрольні; фізичний handshake зі станцією цей тест не виконує.

## Автопідключення, прогноз і параметри LAN

Користувач підтвердив, що попереднє LAN-підключення на його станції запрацювало. Нове відновлення після фону та нові параметри ще потребують перевірки на його iPhone; результати автоматичних тестів не замінюють цього.

- Весь браузерний набір: 34 сценарії у WebKit/Chromium. Нові сценарії перевіряють старт збереженої станції до відповіді хмари, перезавантаження, фон → повернення, ручну паузу, продовження після чотирьох невдалих спроб, прогноз/резерв/план навантаження, скасування й підтвердження параметрів.
- 67 unit/integration тестів: додатково перевірено net power, заряджання й passthrough без хибного countdown, невідомі дані, placeholder 5940, числовий TTLV/readback, AC=false перед зміною частоти, старі значення параметрів, непідтримувану модель та скасування до завершення async setup.
- Події після криптографічного await повторно звіряють session ID: завершення роботи старого сокета не публікує показники й не записує команди в нову сесію.
- Пройдено нову production-офлайн-перевірку, синхронізацію iOS і unsigned iPhone build. Після уточнення розташування прогнозу сценарій налаштувань/макета додатково пройшов у двох браузерах.
- `previews/iphone-live-forecast.png` — контрольні 75%/240 хв, не реальна телеметрія станції. Прогноз візуально перевірено на iPhone viewport.

План, інструкція й обмеження — [AUTOCONNECT-FORECAST.md](AUTOCONNECT-FORECAST.md). Серверний API в цьому оновленні не змінювався; для iPhone потрібне встановлення оновленого bundle через Xcode Run.
