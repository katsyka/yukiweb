// Shared by every chrome page and the new tab: UI language (yw-lang: "auto" or en/ru/de).
// English text is the key. Text nodes and title/placeholder/aria-label are translated as they
// appear (a MutationObserver), so most code just writes English; t() is for text with values in it.
// Elements under [data-nt] (tab titles, page names, user content) are left alone.
const LANGS = { en: 'English', ru: 'Русский', de: 'Deutsch' };
function langGet() {
  let v = null;
  try { v = JSON.parse(localStorage.getItem('yw-lang')); } catch {}
  if (LANGS[v]) return v;
  const n = (navigator.language || '').slice(0, 2);
  return LANGS[n] ? n : 'en';
}
let LANG = langGet();
const DICT = new Map();
`
About|О программе|Über
About YukiWeb|О YukiWeb|Über YukiWeb
Accent color|Цвет акцента|Akzentfarbe
Add|Добавить|Hinzufügen
Add site|Добавить сайт|Seite hinzufügen
Add to YukiWeb|Добавить в YukiWeb|Zu YukiWeb hinzufügen
Add your CompactVPN subscription below|Добавьте подписку CompactVPN ниже|Füge unten dein CompactVPN-Abo hinzu
Added |Добавлено |Hinzugefügt
Adding…|Добавляем…|Wird hinzugefügt…
After 1 minute|Через 1 минуту|Nach 1 Minute
After 30 minutes|Через 30 минут|Nach 30 Minuten
After 5 minutes|Через 5 минут|Nach 5 Minuten
All bookmarks|Все закладки|Alle Lesezeichen
All sites except the list|Все сайты, кроме списка|Alle Seiten außer der Liste
Allow|Разрешить|Erlauben
Allowed|Разрешено|Erlaubt
Any color|Любой цвет|Beliebige Farbe
Appearance|Внешний вид|Darstellung
Back|Назад|Zurück
Back to the code (Esc)|Назад к коду (Esc)|Zurück zum Code (Esc)
Black and white|Чёрно-белые|Schwarz-Weiß
Block|Блокировать|Blockieren
Blocked|Заблокировано|Blockiert
Bookmark this page (Ctrl+D)|Добавить в закладки (Ctrl+D)|Lesezeichen setzen (Strg+D)
Bookmarks|Закладки|Lesezeichen
Bookmarks and the bookmarks bar|Закладки и панель закладок|Lesezeichen und Lesezeichenleiste
Bookmarks bar|Панель закладок|Lesezeichenleiste
Buttons, highlights and the active switch|Кнопки, выделение и включённые переключатели|Buttons, Markierungen und aktive Schalter
Camera|Камера|Kamera
Cancel|Отмена|Abbrechen
Canceled|Отменено|Abgebrochen
Chat|Чат|Chat
Chrome Web Store link|Ссылка из Chrome Web Store|Chrome-Web-Store-Link
City|Город|Stadt
Clear|Очистить|Löschen
Clear browsing data|Очистить данные браузера|Browserdaten löschen
Clear data|Очистка данных|Daten löschen
Clear finished|Убрать завершённые|Fertige entfernen
Cleared|Очищено|Gelöscht
Click for options|Нажмите для настроек|Klicken für Optionen
Click to open|Нажмите, чтобы открыть|Zum Öffnen klicken
Clipboard|Буфер обмена|Zwischenablage
Close|Закрыть|Schließen
Close settings (Esc)|Закрыть настройки (Esc)|Einstellungen schließen (Esc)
Color|Цветные|Farbe
Connecting…|Подключение…|Verbinde…
Connects directly|Подключается напрямую|Verbindet direkt
Connects directly (Russian site)|Подключается напрямую (российский сайт)|Verbindet direkt (russische Seite)
Copies your bookmarks bar and other bookmarks; nothing in the other browser changes|Копирует панель закладок и другие закладки; в другом браузере ничего не меняется|Kopiert Lesezeichenleiste und weitere Lesezeichen; im anderen Browser ändert sich nichts
Couldn't add the extension: |Не удалось добавить расширение: |Erweiterung konnte nicht hinzugefügt werden:
Custom…|Свой…|Eigene…
Default browser|Браузер по умолчанию|Standardbrowser
Delete bookmark|Удалить закладку|Lesezeichen löschen
Download failed (|Ошибка загрузки (|Download fehlgeschlagen (
Downloads|Загрузки|Downloads
Downloads (Ctrl+J)|Загрузки (Ctrl+J)|Downloads (Strg+J)
Edit|Изменить|Bearbeiten
Error|Ошибка|Fehler
Error: |Ошибка: |Fehler:
Extensions|Расширения|Erweiterungen
Failed|Ошибка|Fehlgeschlagen
Files|Файлы|Dateien
Files you download show up here.|Здесь появятся скачанные файлы.|Heruntergeladene Dateien erscheinen hier.
Fonts|Шрифты|Schriftarten
Forget|Забыть|Vergessen
Forget this site|Забыть этот сайт|Diese Seite vergessen
Forward|Вперёд|Vorwärts
From Chrome|Из Chrome|Aus Chrome
From Edge|Из Edge|Aus Edge
Goes through the VPN|Идёт через VPN|Läuft über das VPN
HTML playground|HTML-песочница|HTML-Spielwiese
History|История|Verlauf
History, cookies, cache and saved site data for every site. You'll be signed out of websites; your Yuki ID in YukiWeb stays.|История, cookie, кэш и данные всех сайтов. Вы выйдете из аккаунтов на сайтах; Yuki ID в YukiWeb останется.|Verlauf, Cookies, Cache und gespeicherte Daten aller Seiten. Du wirst auf Websites abgemeldet; deine Yuki ID in YukiWeb bleibt.
Import bookmarks|Импорт закладок|Lesezeichen importieren
Links from other apps open in YukiWeb|Ссылки из других приложений открываются в YukiWeb|Links aus anderen Apps öffnen sich in YukiWeb
Load servers|Загрузить серверы|Server laden
Location|Местоположение|Standort
Mail|Почта|Mail
Make default|Сделать основным|Als Standard festlegen
Manage|Управление|Verwalten
Manage your Yuki ID|Управление Yuki ID|Yuki ID verwalten
Maximize|Развернуть|Maximieren
Menu|Меню|Menü
Microphone|Микрофон|Mikrofon
Minimize|Свернуть|Minimieren
Mode|Режим|Modus
Multiple downloads|Несколько загрузок|Mehrere Downloads
Music|Музыка|Musik
Never|Никогда|Nie
New private tab|Новая приватная вкладка|Neuer privater Tab
New tab|Новая вкладка|Neuer Tab
New tab (Ctrl+T)|Новая вкладка (Ctrl+T)|Neuer Tab (Strg+T)
New tab wallpaper|Обои новой вкладки|Hintergrund für neue Tabs
No VLESS servers found in that link|По этой ссылке нет серверов VLESS|Unter diesem Link wurden keine VLESS-Server gefunden
No bookmarks yet. Click the star in the address bar to add one.|Закладок пока нет. Нажмите звёздочку в адресной строке, чтобы добавить.|Noch keine Lesezeichen. Klicke auf den Stern in der Adressleiste.
No extensions yet.|Расширений пока нет.|Noch keine Erweiterungen.
No internet|Нет интернета|Kein Internet
No servers yet.|Серверов пока нет.|Noch keine Server.
No sites yet. You can also flip a site from the VPN button while you're on it.|Сайтов пока нет. Сайт можно переключить кнопкой VPN, находясь на нём.|Noch keine Seiten. Du kannst eine Seite auch über den VPN-Button umschalten.
None|Нет|Keine
Not signed in|Вход не выполнен|Nicht angemeldet
Not synced: |Не синхронизировано: |Nicht synchronisiert:
Nothing new|Ничего нового|Nichts Neues
Notifications|Уведомления|Benachrichtigungen
Off|Выключен|Aus
On · |Включён · |An ·
Only YukiWeb's traffic goes through the VPN. The rest of your PC stays direct.|Через VPN идёт только трафик YukiWeb. Остальной компьютер подключается напрямую.|Nur der Verkehr von YukiWeb läuft über das VPN. Der Rest deines PCs bleibt direkt.
Only sites on the list|Только сайты из списка|Nur Seiten auf der Liste
Only these sites use the VPN|Только эти сайты идут через VPN|Nur diese Seiten nutzen das VPN
Open Yuki Chat|Открыть Yuki Chat|Yuki Chat öffnen
Options|Параметры|Optionen
Or open an extension on chromewebstore.google.com and press "Add to YukiWeb" in the toolbar. Extensions that change pages (ad blockers, dark mode, translators) work best; some that need Chrome's own toolbar or sync may not.|Или откройте расширение на chromewebstore.google.com и нажмите «Добавить в YukiWeb» на панели. Лучше всего работают расширения, меняющие страницы (блокировщики рекламы, тёмная тема, переводчики); те, которым нужна панель или синхронизация Chrome, могут не работать.|Oder öffne eine Erweiterung auf chromewebstore.google.com und klicke in der Leiste auf „Zu YukiWeb hinzufügen“. Erweiterungen, die Seiten verändern (Werbeblocker, Dark Mode, Übersetzer), funktionieren am besten; manche, die Chromes eigene Leiste oder Sync brauchen, eventuell nicht.
Other bookmarks|Другие закладки|Weitere Lesezeichen
Pages you visited, for address bar suggestions. Private tabs are never saved.|Посещённые страницы для подсказок в адресной строке. Приватные вкладки не сохраняются.|Besuchte Seiten für Vorschläge in der Adressleiste. Private Tabs werden nie gespeichert.
Paste a chromewebstore.google.com link|Вставьте ссылку chromewebstore.google.com|Füge einen chromewebstore.google.com-Link ein
Paste a page and it opens right away ·|Вставьте страницу — она сразу откроется ·|Füge eine Seite ein, sie öffnet sich sofort ·
Performance|Производительность|Leistung
Print…|Печать…|Drucken…
Reload (Ctrl+R)|Обновить (Ctrl+R)|Neu laden (Strg+R)
Remember for this site|Запомнить для этого сайта|Für diese Seite merken
Remove|Удалить|Entfernen
Remove from list|Убрать из списка|Von der Liste entfernen
Reset|Сбросить|Zurücksetzen
Restart to update|Перезапустить для обновления|Zum Aktualisieren neu starten
Run|Запустить|Ausführen
Russian sites skip the VPN|Российские сайты без VPN|Russische Seiten ohne VPN
.ru, .su and .рф sites plus Russian services on other domains (Yandex, VK, banks, Gosuslugi). They connect directly, so they see your real address.|Сайты .ru, .su и .рф и российские сервисы на других доменах (Яндекс, VK, банки, Госуслуги). Они подключаются напрямую и видят ваш настоящий адрес.|.ru-, .su- und .рф-Seiten sowie russische Dienste auf anderen Domains (Yandex, VK, Banken, Gosuslugi). Sie verbinden direkt und sehen deine echte Adresse.
.ru, .рф, banks, Gosuslugi, Yandex, VK…|.ru, .рф, банки, Госуслуги, Яндекс, VK…|.ru, .рф, Banken, Gosuslugi, Yandex, VK…
Search|Поиск|Suche
Search engine|Поисковая система|Suchmaschine
Search engine and sleeping tabs|Поисковик и спящие вкладки|Suchmaschine und schlafende Tabs
Search or type @ for Yuki apps|Поиск или @ для приложений Yuki|Suchen oder @ für Yuki-Apps
Sensors|Датчики|Sensoren
Server |Сервер |Server
Servers|Серверы|Server
Settings|Настройки|Einstellungen
Show bookmarks bar|Показывать панель закладок|Lesezeichenleiste anzeigen
Show in folder|Показать в папке|Im Ordner anzeigen
Sign in to Yuki ID|Войти в Yuki ID|Bei Yuki ID anmelden
Sign in with the avatar button in the toolbar, and your bookmarks, look and settings follow you to every PC.|Войдите через кнопку аватара на панели — закладки, оформление и настройки будут на всех ваших компьютерах.|Melde dich über den Avatar-Button an, und Lesezeichen, Aussehen und Einstellungen folgen dir auf jeden PC.
Sign out of YukiWeb|Выйти из YukiWeb|Von YukiWeb abmelden
Signed out|Вы вышли|Abgemeldet
Site permissions|Разрешения сайтов|Website-Berechtigungen
Ad blocker|Блокировщик рекламы|Werbeblocker
Block ads and trackers|Блокировать рекламу и трекеры|Werbung und Tracker blockieren
Requests to known ad and tracking servers are stopped before they load. Pages get faster and follow you around less.|Запросы к известным рекламным и следящим серверам останавливаются до загрузки. Страницы грузятся быстрее и меньше следят за вами.|Anfragen an bekannte Werbe- und Tracking-Server werden vor dem Laden gestoppt. Seiten laden schneller und verfolgen dich weniger.
Allowed sites|Разрешённые сайты|Erlaubte Seiten
Ads are shown on these sites and their subdomains. You can also flip a site from the ⋮ menu while you're on it.|На этих сайтах и их поддоменах реклама показывается. Сайт можно переключить в меню ⋮, находясь на нём.|Auf diesen Seiten und ihren Subdomains wird Werbung gezeigt. Du kannst eine Seite auch über das ⋮-Menü umschalten.
No sites. Ads are blocked everywhere.|Сайтов нет. Реклама блокируется везде.|Keine Seiten. Werbung wird überall blockiert.
{0} ads and trackers blocked so far · {1} rules|Заблокировано рекламы и трекеров: {0} · правил: {1}|Bisher {0} Werbungen und Tracker blockiert · {1} Regeln
Block ads here|Блокировать рекламу здесь|Werbung hier blockieren
Ads blocked on this site|Реклама на этом сайте блокируется|Werbung auf dieser Seite blockiert
Ads allowed on this site|Реклама на этом сайте разрешена|Werbung auf dieser Seite erlaubt
{0} blocked|заблокировано: {0}|{0} blockiert
Turn on|Включить|Einschalten
Sites|Сайты|Seiten
Sleeping tabs|Спящие вкладки|Schlafende Tabs
Something is too big to sync (your wallpaper?)|Что-то слишком большое для синхронизации (обои?)|Etwas ist zu groß zum Synchronisieren (dein Hintergrund?)
Something went wrong|Что-то пошло не так|Etwas ist schiefgelaufen
Subscription|Подписка|Abo
Subscription link or vless://…|Ссылка подписки или vless://…|Abo-Link oder vless://…
Sync|Синхронизация|Sync
Sync now|Синхронизировать|Jetzt synchronisieren
Sync with Yuki ID|Синхронизация с Yuki ID|Mit Yuki ID synchronisieren
Synced |Синхронизировано |Synchronisiert
Syncing…|Синхронизация…|Synchronisiere…
System|Как в системе|Wie System
Tab|Вкладка|Tab
Tabs you haven't looked at for a while stop running and free memory. Tabs playing sound stay awake.|Вкладки, которые вы давно не открывали, засыпают и освобождают память. Вкладки со звуком не засыпают.|Tabs, die du länger nicht angesehen hast, pausieren und geben Speicher frei. Tabs mit Ton bleiben wach.
That picture is too big.|Картинка слишком большая.|Das Bild ist zu groß.
Theme, accent color and wallpaper|Тема, цвет акцента и обои|Design, Akzentfarbe und Hintergrund
These sites skip the VPN|Эти сайты идут без VPN|Diese Seiten umgehen das VPN
Try again|Повторить|Erneut versuchen
Turn VPN on/off|Включить/выключить VPN|VPN ein/aus
Turn on/off|Включить/выключить|Ein/aus
Turned off|Выключено|Ausgeschaltet
Under the address bar · Ctrl+Shift+B|Под адресной строкой · Ctrl+Shift+B|Unter der Adressleiste · Strg+Umschalt+B
Update in YukiWeb|Обновить в YukiWeb|In YukiWeb aktualisieren
Updates download by themselves; you'll see "Restart to update" when one is ready.|Обновления скачиваются сами; когда обновление готово, появится «Перезапустить для обновления».|Updates laden sich selbst; wenn eins bereit ist, siehst du „Zum Aktualisieren neu starten“.
Use VPN for this site|VPN для этого сайта|VPN für diese Seite
Used when what you type isn't an address|Используется, если введён не адрес|Wird genutzt, wenn die Eingabe keine Adresse ist
VPN error: |Ошибка VPN: |VPN-Fehler:
VPN is off|VPN выключен|VPN ist aus
VPN off|VPN выключен|VPN aus
VPN on · |VPN включён · |VPN an ·
VPN sites|Сайты и VPN|VPN-Seiten
Wallet|Кошелёк|Wallet
What's new|Что нового|Neuigkeiten
Which sites go through the VPN when it's on|Какие сайты идут через VPN, когда он включён|Welche Seiten über das VPN laufen, wenn es an ist
Window management|Управление окнами|Fensterverwaltung
Works on its own|Работает само|Läuft von selbst
Your picture|Своя картинка|Eigenes Bild
YukiWeb is your default browser|YukiWeb — браузер по умолчанию|YukiWeb ist dein Standardbrowser
Zoom|Масштаб|Zoom
Zoom in|Увеличить|Vergrößern
Zoom out|Уменьшить|Verkleinern
download multiple files|скачать несколько файлов|mehrere Dateien herunterladen
edit files on your device|изменять файлы на устройстве|Dateien auf deinem Gerät bearbeiten
know your location|узнать ваше местоположение|deinen Standort kennen
manage windows on your screens|управлять окнами на экранах|Fenster auf deinen Bildschirmen verwalten
see text and images in your clipboard|видеть текст и картинки в буфере обмена|Text und Bilder in deiner Zwischenablage sehen
use fonts installed on your PC|использовать шрифты на компьютере|auf deinem PC installierte Schriften nutzen
use motion sensors|использовать датчики движения|Bewegungssensoren nutzen
use your camera|использовать камеру|deine Kamera nutzen
use your microphone|использовать микрофон|dein Mikrofon nutzen
wants to|хочет|möchte
Language|Язык|Sprache
Menus and built-in pages|Меню и встроенные страницы|Menüs und eingebaute Seiten
Automatic|Автоматически|Automatisch
Search {0} or type a URL|Искать в {0} или ввести адрес|Mit {0} suchen oder URL eingeben
Signed in as {0}|Вы вошли как {0}|Angemeldet als {0}
Imported {0}|Импортировано: {0}|Importiert: {0}
Remove {0}?|Удалить {0}?|{0} entfernen?
Good morning|Доброе утро|Guten Morgen
Good afternoon|Добрый день|Guten Tag
Good evening|Добрый вечер|Guten Abend
Good night|Доброй ночи|Gute Nacht
Chats|Чаты|Chats
No unread messages|Нет непрочитанных|Keine ungelesenen Nachrichten
{0} unread|{0} непрочит.|{0} ungelesen
Sign in with the avatar button to see your chats and music here.|Войдите через кнопку аватара, чтобы видеть здесь чаты и музыку.|Melde dich über den Avatar-Button an, um hier Chats und Musik zu sehen.
Now playing|Сейчас играет|Läuft gerade
Recently played|Недавно играло|Zuletzt gehört
Nothing played yet|Пока ничего не играло|Noch nichts gehört
Most visited|Часто посещаемые|Meistbesucht
Sites you visit often will show up here.|Здесь появятся сайты, которые вы часто посещаете.|Hier erscheinen Seiten, die du oft besuchst.
This week|На этой неделе|Diese Woche
Open Wrapped|Открыть итоги|Wrapped öffnen
Weather|Погода|Wetter
Set your city|Укажите город|Stadt festlegen
City not found|Город не найден|Stadt nicht gefunden
Customize|Настроить|Anpassen
Dashboard|Панель|Dashboard
Theme|Тема|Design
Wallpaper|Обои|Hintergrund
Feels like|Ощущается как|Gefühlt
Humidity|Влажность|Luftfeuchte
Wind|Ветер|Wind
Gusts|Порывы|Böen
Pressure|Давление|Luftdruck
UV index|УФ-индекс|UV-Index
Clouds|Облачность|Bewölkung
Sunrise|Восход|Sonnenaufgang
Sunset|Закат|Sonnenuntergang
Next 24 hours|Ближайшие 24 часа|Nächste 24 Stunden
7 days|7 дней|7 Tage
Today|Сегодня|Heute
Now|Сейчас|Jetzt
Change city|Сменить город|Stadt ändern
updated|обновлено|aktualisiert
feels|ощущается|gefühlt
km/h|км/ч|km/h
N|С|N
NE|СВ|NO
E|В|O
SE|ЮВ|SO
S|Ю|S
SW|ЮЗ|SW
W|З|W
NW|СЗ|NW
Clock and greeting|Часы и приветствие|Uhr und Begrüßung
Yuki apps|Приложения Yuki|Yuki-Apps
Browsing stats|Статистика|Surf-Statistik
Done|Готово|Fertig
Feels like {0}|Ощущается как {0}|Gefühlt {0}
Clear sky|Ясно|Klar
Partly cloudy|Переменная облачность|Teilweise bewölkt
Cloudy|Облачно|Bewölkt
Fog|Туман|Nebel
Drizzle|Морось|Nieselregen
Rain|Дождь|Regen
Snow|Снег|Schnee
Showers|Ливень|Schauer
Thunderstorm|Гроза|Gewitter
{0}h {1}m|{0} ч {1} мин|{0} Std. {1} Min.
{0}m|{0} мин|{0} Min.
in YukiWeb|в YukiWeb|in YukiWeb
Top site|Главный сайт|Top-Seite
Wrapped|Итоги|Wrapped
This month|Этот месяц|Dieser Monat
This year|Этот год|Dieses Jahr
All time|Всё время|Gesamt
Your time in YukiWeb|Ваше время в YukiWeb|Deine Zeit in YukiWeb
That's {0} full days.|Это {0} полных суток.|Das sind {0} volle Tage.
Your top sites|Ваши главные сайты|Deine Top-Seiten
Tabs opened|Открыто вкладок|Geöffnete Tabs
Pages visited|Посещено страниц|Besuchte Seiten
Searches|Поисков|Suchen
Busiest day|Самый активный день|Aktivster Tag
Favorite hour|Любимый час|Lieblingsstunde
Longest streak|Самая длинная серия|Längste Serie
{0} days in a row|{0} дн. подряд|{0} Tage in Folge
You are a|Вы —|Du bist ein
Night owl|Сова|Nachteule
You do your best browsing after midnight.|Лучшее время для интернета — после полуночи.|Du surfst am liebsten nach Mitternacht.
Early bird|Жаворонок|Frühaufsteher
You're online before most people wake up.|Вы в сети раньше, чем большинство просыпается.|Du bist online, bevor die meisten aufwachen.
Daytime explorer|Дневной исследователь|Tagesentdecker
Most of your browsing happens in broad daylight.|Больше всего вы сидите в интернете днём.|Du surfst meistens am helllichten Tag.
Evening cruiser|Вечерний путешественник|Abendcruiser
Evenings are for the internet.|Вечера — для интернета.|Abends gehört dir das Internet.
Copy image|Копировать картинку|Bild kopieren
Save image|Сохранить картинку|Bild speichern
Copied|Скопировано|Kopiert
Not enough browsing yet. Come back in a day or two.|Пока мало данных. Загляните через день-другой.|Noch zu wenig Daten. Schau in ein, zwei Tagen wieder vorbei.
Counts time while YukiWeb is in front and you're at the computer. Includes your other devices signed in to the same Yuki ID.|Считается время, когда YukiWeb на экране и вы за компьютером. Включая другие устройства с тем же Yuki ID.|Gezählt wird, solange YukiWeb im Vordergrund ist und du am Computer bist. Inklusive deiner anderen Geräte mit derselben Yuki ID.
Your card|Ваша карточка|Deine Karte
sleeping|спит|schläft
Find on page|Найти на странице|Auf Seite suchen
Reader mode|Режим чтения|Lesemodus
Translate page|Перевести страницу|Seite übersetzen
Notes on this page|Заметки на странице|Notizen auf dieser Seite
Screenshot|Скриншот|Screenshot
QR code|QR-код|QR-Code
Picture in picture|Картинка в картинке|Bild im Bild
Previous (Shift+Enter)|Предыдущее (Shift+Enter)|Vorheriges (Umschalt+Enter)
Next (Enter)|Следующее (Enter)|Nächstes (Enter)
From {0} to {1}|С языка «{0}» на «{1}»|Von {0} nach {1}
Always translate {0}|Всегда переводить: {0}|{0} immer übersetzen
Show original|Показать оригинал|Original anzeigen
Translate|Перевести|Übersetzen
Select text on a page and press the marker button to highlight it. Highlights come back every time you open the page.|Выделите текст на странице и нажмите кнопку маркера. Выделения вернутся при каждом открытии страницы.|Markiere Text auf einer Seite und klicke auf den Marker. Markierungen erscheinen bei jedem Besuch wieder.
Visible part|Видимая часть|Sichtbarer Teil
Whole page|Вся страница|Ganze Seite
Copy|Копировать|Kopieren
Save|Сохранить|Speichern
Copy link|Копировать ссылку|Link kopieren
Add a note|Добавить заметку|Notiz hinzufügen
Taking a screenshot…|Делаем скриншот…|Screenshot wird erstellt…
Saved to Downloads|Сохранено в «Загрузки»|In Downloads gespeichert
This page has no article to read.|На этой странице нет статьи для чтения.|Auf dieser Seite gibt es keinen Artikel zum Lesen.
← Back to page|← Назад к странице|← Zurück zur Seite
Smaller text|Мельче|Kleinere Schrift
Larger text|Крупнее|Größere Schrift
Serif|С засечками|Serif
Sans|Без засечек|Sans
{0} min read|{0} мин чтения|{0} Min. Lesezeit
Highlight|Выделить|Markieren
Send to YukiChat|Отправить в YukiChat|An YukiChat senden
Article|Статья|Artikel
Unmute tab|Включить звук вкладки|Tab-Ton einschalten
Mute tab|Выключить звук вкладки|Tab stummschalten
Mute or unmute tab|Звук вкладки вкл/выкл|Tab-Ton ein/aus
New tab to the right|Новая вкладка справа|Neuer Tab rechts
Add to new group|Добавить в новую группу|Zu neuer Gruppe hinzufügen
Add to "{0}"|Добавить в «{0}»|Zu „{0}“ hinzufügen
group|группа|Gruppe
Remove from group|Убрать из группы|Aus Gruppe entfernen
Exit split view|Выйти из разделённого режима|Geteilte Ansicht beenden
Split view with current tab|Разделить экран с текущей вкладкой|Geteilte Ansicht mit aktuellem Tab
Split view with next tab|Разделить экран со следующей вкладкой|Geteilte Ansicht mit nächstem Tab
Duplicate|Дублировать|Duplizieren
Sleep now|Усыпить сейчас|Jetzt schlafen legen
Close other tabs|Закрыть другие вкладки|Andere Tabs schließen
Name this group|Название группы|Gruppe benennen
Expand|Развернуть|Ausklappen
Collapse|Свернуть|Einklappen
New tab in group|Новая вкладка в группе|Neuer Tab in Gruppe
Ungroup|Разгруппировать|Gruppierung aufheben
Close group|Закрыть группу|Gruppe schließen
Peek|Просмотр|Vorschau
Open as tab|Открыть во вкладке|Als Tab öffnen
Close (Esc)|Закрыть (Esc)|Schließen (Esc)
Reopen closed tab|Вернуть закрытую вкладку|Geschlossenen Tab öffnen
Search tabs|Поиск по вкладкам|Tabs durchsuchen
Bookmark this page|Добавить в закладки|Lesezeichen setzen
Close tab|Закрыть вкладку|Tab schließen
Task manager|Диспетчер задач|Task-Manager
Switch to tab|Перейти на вкладку|Zum Tab wechseln
Recently closed|Недавно закрытые|Kürzlich geschlossen
YukiWeb uses {0} in {1} processes|YukiWeb использует {0} в {1} процессах|YukiWeb nutzt {0} in {1} Prozessen
{0} tabs not loaded yet|{0} вкладок ещё не загружено|{0} Tabs noch nicht geladen
Open now|Открыта сейчас|Gerade offen
Sleeping|Спит|Schläft
Playing sound|Играет звук|Spielt Ton
In the background|В фоне|Im Hintergrund
Sleep|Усыпить|Schlafen
Passwords|Пароли|Passwörter
Offer to save passwords|Предлагать сохранять пароли|Speichern von Passwörtern anbieten
YukiWeb asks after you log in and fills them in when you click a login field. They're encrypted with your Windows account and stay on this PC.|YukiWeb спрашивает после входа и подставляет пароль, когда вы нажимаете на поле входа. Пароли зашифрованы вашей учётной записью Windows и остаются на этом компьютере.|YukiWeb fragt nach dem Anmelden und füllt sie aus, wenn du in ein Anmeldefeld klickst. Sie sind mit deinem Windows-Konto verschlüsselt und bleiben auf diesem PC.
Import passwords|Импорт паролей|Passwörter importieren
From Edge or Chrome on this PC, or ones YukiWeb saved before version 0.5|Из Edge или Chrome на этом компьютере или сохранённые YukiWeb до версии 0.5|Aus Edge oder Chrome auf diesem PC oder von YukiWeb vor Version 0.5 gespeicherte
Saved passwords|Сохранённые пароли|Gespeicherte Passwörter
Search passwords|Поиск паролей|Passwörter suchen
Show|Показать|Anzeigen
Nothing found|Ничего не найдено|Nichts gefunden
No saved passwords yet.|Сохранённых паролей пока нет.|Noch keine gespeicherten Passwörter.
Importing…|Импорт…|Importiere…
{0} could not be read|не удалось прочитать: {0}|{0} nicht lesbar
Save password?|Сохранить пароль?|Passwort speichern?
Update password?|Обновить пароль?|Passwort aktualisieren?
Never for this site|Никогда для этого сайта|Nie für diese Seite
No username|Без имени пользователя|Kein Benutzername
Play in YukiMusic|Слушать в YukiMusic|In YukiMusic abspielen
Now playing|Сейчас играет|Läuft gerade
Send this tab to your devices|Отправить вкладку на свои устройства|Tab an deine Geräte senden
Send tab to your devices|Отправить вкладку на устройства|Tab an Geräte senden
Sending…|Отправляем…|Wird gesendet…
Sent. It shows up on your other devices.|Отправлено. Появится на других ваших устройствах.|Gesendet. Er erscheint auf deinen anderen Geräten.
Not sent|Не отправлено|Nicht gesendet
Sent from your other device|Отправлено с другого устройства|Von deinem anderen Gerät gesendet
{0} unread emails|Непрочитанных писем: {0}|{0} ungelesene E-Mails
Playing in YukiMusic on another device|Играет в YukiMusic на другом устройстве|Läuft in YukiMusic auf einem anderen Gerät
Open YukiMusic|Открыть YukiMusic|YukiMusic öffnen
Go to tab|Перейти на вкладку|Zum Tab
Previous|Предыдущий|Zurück
Next|Следующий|Weiter
Publish to Yuki Pages|Опубликовать на Yuki Pages|Auf Yuki Pages veröffentlichen
Publish|Опубликовать|Veröffentlichen
This page is too big to send this way. Save it as a file and upload it on pages.yukichat.lol.|Страница слишком большая для такой отправки. Сохраните её в файл и загрузите на pages.yukichat.lol.|Die Seite ist dafür zu groß. Speichere sie als Datei und lade sie auf pages.yukichat.lol hoch.
Paste HTML here…|Вставьте HTML сюда…|HTML hier einfügen…
Ctrl+Enter|Ctrl+Enter|Strg+Enter
runs|— запуск|startet
private|приватная|privat
`.trim().split('\n').forEach(l => { const [en, ru, de] = l.split('|'); DICT.set(en, [ru, de]); });
// Keys that end in a space, colon, "·" or "(" also match text that continues ("Synced 12:30").
const PREFIX = [...DICT.keys()].filter(k => /[ :·(]$/.test(k)).sort((a, b) => b.length - a.length);

function tr(s) {
  if (LANG === 'en' || !s) return s;
  const i = LANG === 'ru' ? 0 : 1, k = s.trim(), d = DICT.get(k);
  if (d) return s.replace(k, d[i]);
  for (const p of PREFIX) if (k.startsWith(p)) return s.replace(p, DICT.get(p)[i]);
  return s;
}
function t(s, ...a) { return tr(s).replace(/\{(\d)\}/g, (_, n) => a[n] ?? ''); }

// Originals are kept so the language can change live, and so code that later writes new
// English text (or an attribute) is noticed instead of overwritten.
const I18N_ORIG = new WeakMap(), I18N_ATTRS = ['title', 'placeholder', 'aria-label'];
const skipEl = el => !el || !!el.closest('[data-nt],script,style,textarea,[contenteditable]');
function trNode(n) {
  if (n.nodeType === 3) {
    if (skipEl(n.parentElement) || !/[A-Za-z]/.test(n.nodeValue)) return;
    let o = I18N_ORIG.get(n);
    if (o == null || n.nodeValue !== tr(o)) { o = n.nodeValue; I18N_ORIG.set(n, o); }
    const v = tr(o);
    if (n.nodeValue !== v) n.nodeValue = v;
  } else if (n.nodeType === 1) {
    if (skipEl(n)) return;
    let o = I18N_ORIG.get(n);
    if (!o) I18N_ORIG.set(n, o = {});
    for (const a of I18N_ATTRS) {
      const cur = n.getAttribute(a);
      if (cur == null) continue;
      if (o[a] == null || cur !== tr(o[a])) o[a] = cur;
      const v = tr(o[a]);
      if (cur !== v) n.setAttribute(a, v);
    }
    for (const c of n.childNodes) trNode(c);
  }
}
function i18nApply() {
  LANG = langGet();
  document.documentElement.lang = LANG;
  if (document.body) trNode(document.body);
  dispatchEvent(new Event('langchange'));
}
document.documentElement.lang = LANG;
addEventListener('DOMContentLoaded', () => {
  trNode(document.body);
  new MutationObserver(ms => {
    for (const m of ms) {
      if (m.type === 'childList') m.addedNodes.forEach(trNode);
      else trNode(m.target);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: I18N_ATTRS });
});
addEventListener('storage', e => { if (e.key === 'yw-lang' || e.key === null) i18nApply(); });
