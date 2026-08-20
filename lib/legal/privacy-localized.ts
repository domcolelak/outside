import type { Locale } from "@/lib/i18n/locales";

type TranslatedPrivacy = { title: string; updated: string; body: string };
type TranslatedLocale = Exclude<Locale, "en">;

export const PRIVACY_TRANSLATIONS: Record<TranslatedLocale, TranslatedPrivacy> = {
  sk: {
    title: "Zásady ochrany osobných údajov",
    updated: "2026-08-17",
    body: `Tieto zásady vysvetľujú, ako VeDomEll s. r. o. („OUTSIDE“, „my“) zhromažďuje, používa, uchováva a chráni osobné údaje pri návšteve outsideguardian.eu a používaní platformy OUTSIDE. OUTSIDE je platforma na správu externého útočného povrchu a bezpečnostný monitoring oprávnených cieľov. Otázky posielajte na security@outsideguardian.eu.

## 1. Prevádzkovateľ a sprostredkovateľ

VeDomEll s. r. o. je prevádzkovateľom údajov súvisiacich s webom, účtami, fakturáciou, komunikáciou, správou služby a jej zlepšovaním. Pri údajoch, ktoré zákazník odovzdá na spracovanie vo svojom mene, je zákazník spravidla prevádzkovateľom a my sprostredkovateľom; podmienky môže upravovať samostatná zmluva o spracúvaní údajov.

## 2. Aké údaje spracúvame

Môžeme spracúvať meno, pracovný e-mail, organizáciu, pracovnú pozíciu, identifikátor účtu, rolu, bezpečnostné a komunikačné nastavenia; fakturačné, daňové, predplatné a transakčné údaje; IP adresu, prehliadač, zariadenie, relácie, časové údaje, použité funkcie, požiadavky na sken, overenie domény, reporty, auditné a diagnostické záznamy.

Zákazník môže odovzdať domény, názvy hostiteľov, označenia aktív, komentáre, poznámky k náprave, nastavenia reportov, integrácií a webhookov. Zodpovedá za zákonný dôvod a oprávnenie tieto údaje odovzdať. Heslá neuchovávame v otvorenom texte a úplné údaje platobných kariet spracúva poskytovateľ platieb.

### Verejne pozorovateľné technické údaje

Na legitímne účely bezpečnosti, objavovania aktív a analýzy rizika môžeme spracúvať verejné DNS, certifikáty, IP adresy, RDAP a registračné údaje, HTTP a TLS metadáta, technologické indikátory, verejné služby, zdroje o zraniteľnostiach a vzťahy medzi aktívami. Verejná dostupnosť nie je súhlasom na nesúvisiace použitie.

### Komunikácia

Pri podpore, ukážke produktu alebo hlásení zraniteľnosti spracúvame kontaktné údaje, obsah správy, prílohy, históriu podpory a technické údaje potrebné na vyriešenie požiadavky.

## 3. Zdroje údajov

Údaje získavame priamo od vás, od oprávnených používateľov vašej organizácie, automaticky pri používaní služby, od poskytovateľov platieb, autentifikácie, hostingu a komunikácie, z verejného internetu, bezpečnostných zdrojov a z integrácií, ktoré zapnete.

## 4. Účely a právne základy

Údaje používame na vytvorenie a zabezpečenie účtu, autorizované skeny, nálezy, monitoring, reporty, podporu, platby a prevádzkové oznámenia na základe zmluvy alebo krokov pred jej uzavretím. Na základe oprávneného záujmu chránime službu, bránime podvodom a zneužitiu, vedieme audit, riešime incidenty, odstraňujeme chyby, meriame spoľahlivosť a zlepšujeme produkt. Údaje spracúvame aj na splnenie zákonných, účtovných a daňových povinností a ochranu právnych nárokov.

Marketing posielame iba tam, kde to zákon dovoľuje; odber možno kedykoľvek zrušiť. Kde je to možné, používame agregované, anonymizované alebo minimalizované údaje.

## 5. Funkcie umelej inteligencie

AI môže vytvárať zrozumiteľné vysvetlenia, súhrny alebo odporúčania. Prenášame iba primerane potrebný kontext a citlivé hodnoty podľa možností minimalizujeme. Výstup môže byť neúplný alebo nepresný, nie je dôkazom zraniteľnosti či kompromitácie a musí ho overiť človek. Obsah zákazníkov zámerne nepoužívame na trénovanie verejných modelov tretích strán bez výslovného oznámenia a zákonnej dohody.

## 6. Cookies a analytika

Nevyhnutné cookies a úložisko používame na autentifikáciu, reláciu, bezpečnosť, ochranu pred podvodmi a preferencie. Voliteľné technológie používame iba s príslušným právnym základom a súhlasom, ak je potrebný.

Vlastná analytika Umami nepoužíva cookies ani sledovanie medzi webmi. Zaznamenáva anonymizované návštevy, zdroj, internú cestu bez parametrov, typ zariadenia, jazyk, približnú krajinu a obmedzené produktové udalosti. Neodosielame mená, e-maily, organizácie, skenované domény, nálezy, tajomstvá ani prístupové tokeny. Rešpektujeme Do Not Track a chránime tokenové trasy.

## 7. Príjemcovia

Údaje môžu spracúvať zmluvne viazaní poskytovatelia infraštruktúry, databáz a záloh, e-mailu, platieb, autentifikácie, monitoringu, podpory, bezpečnosti, AI a technických dát. Informácie môžeme poskytnúť poradcom, audítorom, príslušným orgánom alebo pri zákonnej podnikovej transakcii. Osobné údaje nepredávame dátovým brokerom ani inzerentom.

## 8. Medzinárodné prenosy

Ak sa údaje spracúvajú mimo EHP, používame primeraný mechanizmus, napríklad rozhodnutie o primeranosti, štandardné zmluvné doložky Európskej komisie alebo inú zákonnú záruku, a podľa potreby doplnkové opatrenia.

## 9. Uchovávanie

Údaje uchovávame len potrebný čas. Účet počas jeho trvania a primerane po ňom; účtovné doklady podľa zákona; výsledky skenov a históriu podľa plánu a nastavení; auditné a bezpečnostné záznamy primerane riziku; podporu do vyriešenia a potrebnej evidencie; zálohy do ich riadneho prepísania. Následne údaje vymažeme, anonymizujeme alebo bezpečne vyradíme z aktívneho používania.

## 10. Bezpečnosť

Používame šifrovaný prenos, riadenie prístupu a rolí, oddelenie prostredí, logovanie, monitoring, bezpečný vývoj, správu zraniteľností, zálohy, obnovu a reakciu na incidenty. Žiadna služba nezaručí absolútnu bezpečnosť; používateľ musí chrániť prihlasovacie údaje a bezpečne nastaviť integrácie.

## 11. Vaše práva

Podľa platného práva môžete žiadať prístup, opravu, výmaz, obmedzenie, prenosnosť, namietať proti oprávnenému záujmu, odvolať súhlas a podať sťažnosť dozornému orgánu. Napíšte na security@outsideguardian.eu; môžeme overiť totožnosť. Ak údaje spracúvame iba pre zákazníka, požiadavku mu môžeme postúpiť.

## 12. Automatizované rozhodovanie

Nálezy, klasifikácie a skóre vznikajú z pravidiel a technických dôkazov na podporu bezpečnostného posúdenia. Bez ľudského zásahu nemajú vytvárať právne alebo podobne významné účinky voči fyzickým osobám.

## 13. Deti

OUTSIDE je služba pre organizácie a nie je určená deťom. Používateľ musí byť spôsobilý uzavrieť zmluvu alebo konať za organizáciu.

## 14. Služby tretích strán

Na externé weby, databázy a integrácie sa vzťahujú ich vlastné podmienky a zásady. Nezodpovedáme za ich obsah, bezpečnosť ani postupy ochrany súkromia.

## 15. Zmeny zásad

Zásady môžeme aktualizovať podľa zmien služby, práva alebo technológií. Aktuálna verzia a dátum budú zverejnené tu; ak to zákon vyžaduje, poskytneme dodatočné oznámenie.

## 16. Kontakt

**VeDomEll s. r. o.**

Alžbetina 55, 040 01 Košice – mestská časť Staré Mesto, Slovensko

IČO: 52498751 · DIČ: 2121045729 · IČ DPH: SK2121045729

security@outsideguardian.eu`,
  },
  cs: {
    title: "Zásady ochrany osobních údajů",
    updated: "2026-08-17",
    body: `Tyto zásady vysvětlují, jak VeDomEll s. r. o. („OUTSIDE“, „my“) shromažďuje, používá, uchovává a chrání osobní údaje při návštěvě outsideguardian.eu a používání platformy OUTSIDE. OUTSIDE je platforma pro správu externího útočného povrchu a bezpečnostní monitoring oprávněných cílů. Dotazy posílejte na security@outsideguardian.eu.

## 1. Správce a zpracovatel

VeDomEll s. r. o. je správcem údajů spojených s webem, účty, fakturací, komunikací, správou služby a jejím zlepšováním. U údajů předaných zákazníkem ke zpracování jeho jménem je zákazník zpravidla správcem a my zpracovatelem; podmínky může upravovat samostatná smlouva o zpracování údajů.

## 2. Jaké údaje zpracováváme

Můžeme zpracovávat jméno, pracovní e-mail, organizaci, pracovní pozici, identifikátor účtu, roli, bezpečnostní a komunikační nastavení; fakturační, daňové, předplatné a transakční údaje; IP adresu, prohlížeč, zařízení, relace, časové údaje, použité funkce, požadavky na sken, ověření domény, reporty, auditní a diagnostické záznamy.

Zákazník může předat domény, názvy hostitelů, označení aktiv, komentáře, poznámky k nápravě, nastavení reportů, integrací a webhooků. Odpovídá za právní základ a oprávnění tyto údaje předat. Hesla neuchováváme v otevřeném textu a úplné údaje platebních karet zpracovává poskytovatel plateb.

### Veřejně pozorovatelné technické údaje

Pro legitimní účely bezpečnosti, objevování aktiv a analýzy rizik můžeme zpracovávat veřejné DNS, certifikáty, IP adresy, RDAP a registrační údaje, HTTP a TLS metadata, technologické indikátory, veřejné služby, zdroje o zranitelnostech a vztahy mezi aktivy. Veřejná dostupnost není souhlasem k nesouvisejícímu použití.

### Komunikace

Při podpoře, ukázce produktu nebo hlášení zranitelnosti zpracováváme kontaktní údaje, obsah zprávy, přílohy, historii podpory a technické údaje potřebné k vyřešení požadavku.

## 3. Zdroje údajů

Údaje získáváme přímo od vás, od oprávněných uživatelů vaší organizace, automaticky při používání služby, od poskytovatelů plateb, autentizace, hostingu a komunikace, z veřejného internetu, bezpečnostních zdrojů a ze zapnutých integrací.

## 4. Účely a právní základy

Údaje používáme k vytvoření a zabezpečení účtu, autorizovaným skenům, nálezům, monitoringu, reportům, podpoře, platbám a provozním oznámením na základě smlouvy nebo kroků před jejím uzavřením. Z oprávněného zájmu chráníme službu, bráníme podvodům a zneužití, vedeme audit, řešíme incidenty, odstraňujeme chyby, měříme spolehlivost a zlepšujeme produkt. Údaje zpracováváme také ke splnění zákonných, účetních a daňových povinností a ochraně právních nároků.

Marketing posíláme jen tam, kde to zákon dovoluje; odběr lze kdykoli zrušit. Kde je to možné, používáme agregované, anonymizované nebo minimalizované údaje.

## 5. Funkce umělé inteligence

AI může vytvářet srozumitelná vysvětlení, souhrny nebo doporučení. Předáváme jen přiměřeně nutný kontext a citlivé hodnoty podle možností minimalizujeme. Výstup může být neúplný nebo nepřesný, není důkazem zranitelnosti či kompromitace a musí jej ověřit člověk. Obsah zákazníků záměrně nepoužíváme k trénování veřejných modelů třetích stran bez výslovného oznámení a zákonné dohody.

## 6. Cookies a analytika

Nezbytné cookies a úložiště používáme pro autentizaci, relaci, bezpečnost, ochranu před podvody a preference. Volitelné technologie používáme jen s příslušným právním základem a souhlasem, je-li nutný.

Vlastní analytika Umami nepoužívá cookies ani sledování napříč weby. Zaznamenává anonymizované návštěvy, zdroj, interní cestu bez parametrů, typ zařízení, jazyk, přibližnou zemi a omezené produktové události. Neodesíláme jména, e-maily, organizace, skenované domény, nálezy, tajemství ani přístupové tokeny. Respektujeme Do Not Track a chráníme tokenové trasy.

## 7. Příjemci

Údaje mohou zpracovávat smluvně vázaní poskytovatelé infrastruktury, databází a záloh, e-mailu, plateb, autentizace, monitoringu, podpory, bezpečnosti, AI a technických dat. Informace můžeme poskytnout poradcům, auditorům, příslušným orgánům nebo při zákonné podnikové transakci. Osobní údaje neprodáváme datovým brokerům ani inzerentům.

## 8. Mezinárodní přenosy

Při zpracování mimo EHP používáme odpovídající mechanismus, například rozhodnutí o odpovídající ochraně, standardní smluvní doložky Evropské komise nebo jinou zákonnou záruku, a podle potřeby doplňková opatření.

## 9. Uchovávání

Údaje uchováváme jen po nezbytnou dobu. Účet po dobu jeho trvání a přiměřeně poté; účetní doklady podle zákona; výsledky skenů a historii podle plánu a nastavení; auditní a bezpečnostní záznamy přiměřeně riziku; podporu do vyřešení a potřebné evidence; zálohy do řádného přepsání. Poté údaje smažeme, anonymizujeme nebo bezpečně vyřadíme z aktivního používání.

## 10. Bezpečnost

Používáme šifrovaný přenos, řízení přístupu a rolí, oddělení prostředí, logování, monitoring, bezpečný vývoj, správu zranitelností, zálohy, obnovu a reakci na incidenty. Žádná služba nezaručuje absolutní bezpečnost; uživatel musí chránit přihlašovací údaje a bezpečně nastavit integrace.

## 11. Vaše práva

Podle platného práva můžete žádat přístup, opravu, výmaz, omezení, přenositelnost, vznést námitku proti oprávněnému zájmu, odvolat souhlas a podat stížnost dozorovému orgánu. Napište na security@outsideguardian.eu; můžeme ověřit totožnost. Pokud údaje zpracováváme jen pro zákazníka, můžeme požadavek postoupit jemu.

## 12. Automatizované rozhodování

Nálezy, klasifikace a skóre vznikají z pravidel a technických důkazů na podporu bezpečnostního posouzení. Bez lidského zásahu nemají vytvářet právní nebo podobně významné účinky vůči fyzickým osobám.

## 13. Děti

OUTSIDE je služba pro organizace a není určena dětem. Uživatel musí být způsobilý uzavřít smlouvu nebo jednat za organizaci.

## 14. Služby třetích stran

Na externí weby, databáze a integrace se vztahují jejich vlastní podmínky a zásady. Neodpovídáme za jejich obsah, bezpečnost ani postupy ochrany soukromí.

## 15. Změny zásad

Zásady můžeme aktualizovat podle změn služby, práva nebo technologií. Aktuální verze a datum budou zveřejněny zde; pokud to zákon vyžaduje, poskytneme další oznámení.

## 16. Kontakt

**VeDomEll s. r. o.**

Alžbetina 55, 040 01 Košice – mestská časť Staré Mesto, Slovensko

IČO: 52498751 · DIČ: 2121045729 · IČ DPH: SK2121045729

security@outsideguardian.eu`,
  },
  pl: {
    title: "Polityka prywatności",
    updated: "2026-08-17",
    body: `Niniejsza polityka wyjaśnia, w jaki sposób VeDomEll s. r. o. („OUTSIDE”, „my”) gromadzi, wykorzystuje, przechowuje i chroni dane osobowe podczas odwiedzania outsideguardian.eu i korzystania z platformy OUTSIDE. OUTSIDE służy do zarządzania zewnętrzną powierzchnią ataku i monitorowania bezpieczeństwa autoryzowanych celów. Pytania prosimy kierować na security@outsideguardian.eu.

## 1. Administrator i podmiot przetwarzający

VeDomEll s. r. o. jest administratorem danych związanych z witryną, kontami, rozliczeniami, komunikacją, administracją i ulepszaniem usługi. W przypadku danych przekazanych przez klienta do przetwarzania w jego imieniu klient jest zazwyczaj administratorem, a my podmiotem przetwarzającym; zasady może określać odrębna umowa powierzenia przetwarzania danych.

## 2. Jakie dane przetwarzamy

Możemy przetwarzać imię i nazwisko, służbowy e-mail, organizację, stanowisko, identyfikator konta, rolę, ustawienia bezpieczeństwa i komunikacji; dane rozliczeniowe, podatkowe, subskrypcyjne i transakcyjne; adres IP, przeglądarkę, urządzenie, sesje, znaczniki czasu, używane funkcje, żądania skanowania, weryfikację domeny, raporty oraz dzienniki audytowe i diagnostyczne.

Klient może przekazać domeny, nazwy hostów, etykiety zasobów, komentarze, notatki naprawcze oraz ustawienia raportów, integracji i webhooków. Odpowiada za podstawę prawną i uprawnienie do przekazania tych danych. Nie przechowujemy haseł w postaci jawnej, a pełne dane kart płatniczych przetwarza dostawca płatności.

### Publicznie obserwowalne dane techniczne

W uzasadnionych celach bezpieczeństwa, wykrywania zasobów i analizy ryzyka możemy przetwarzać publiczne DNS, certyfikaty, adresy IP, dane RDAP i rejestracyjne, metadane HTTP i TLS, wskaźniki technologiczne, usługi publiczne, źródła informacji o podatnościach i relacje między zasobami. Publiczna dostępność nie oznacza zgody na niezwiązane wykorzystanie.

### Komunikacja

Podczas obsługi wsparcia, prezentacji produktu lub zgłaszania podatności przetwarzamy dane kontaktowe, treść wiadomości, załączniki, historię wsparcia i dane techniczne potrzebne do rozwiązania zgłoszenia.

## 3. Źródła danych

Dane otrzymujemy bezpośrednio od użytkownika, od upoważnionych użytkowników jego organizacji, automatycznie podczas korzystania z usługi, od dostawców płatności, uwierzytelniania, hostingu i komunikacji, z publicznego internetu, źródeł bezpieczeństwa i włączonych integracji.

## 4. Cele i podstawy prawne

Dane wykorzystujemy do tworzenia i zabezpieczania kont, autoryzowanych skanów, ustaleń, monitoringu, raportów, wsparcia, płatności i komunikatów operacyjnych na podstawie umowy lub działań przed jej zawarciem. W ramach prawnie uzasadnionego interesu chronimy usługę, zapobiegamy oszustwom i nadużyciom, prowadzimy audyt, obsługujemy incydenty, usuwamy błędy, mierzymy niezawodność i ulepszamy produkt. Przetwarzamy też dane, aby wypełnić obowiązki prawne, księgowe i podatkowe oraz chronić roszczenia prawne.

Marketing wysyłamy tylko wtedy, gdy pozwala na to prawo; zgodę można w każdej chwili wycofać. W miarę możliwości używamy danych zagregowanych, zanonimizowanych lub zminimalizowanych.

## 5. Funkcje sztucznej inteligencji

AI może tworzyć przystępne wyjaśnienia, podsumowania lub zalecenia. Przekazujemy jedynie niezbędny kontekst i w miarę możliwości minimalizujemy wartości wrażliwe. Wynik może być niepełny lub niedokładny, nie stanowi dowodu podatności ani naruszenia i wymaga weryfikacji człowieka. Nie wykorzystujemy celowo treści klientów do trenowania publicznych modeli stron trzecich bez wyraźnej informacji i zgodnego z prawem uzgodnienia.

## 6. Cookies i analityka

Niezbędne cookies i pamięć lokalną wykorzystujemy do uwierzytelniania, sesji, bezpieczeństwa, ochrony przed oszustwami i preferencji. Technologie opcjonalne stosujemy wyłącznie na odpowiedniej podstawie prawnej i za zgodą, gdy jest wymagana.

Własna analityka Umami nie używa cookies ani śledzenia między witrynami. Rejestruje zanonimizowane wizyty, źródło, ścieżkę wewnętrzną bez parametrów, typ urządzenia, język, przybliżony kraj i ograniczone zdarzenia produktowe. Nie wysyłamy imion, e-maili, organizacji, skanowanych domen, ustaleń, sekretów ani tokenów dostępu. Respektujemy Do Not Track i wykluczamy trasy zawierające tokeny.

## 7. Odbiorcy

Dane mogą przetwarzać związani umową dostawcy infrastruktury, baz danych i kopii zapasowych, e-maila, płatności, uwierzytelniania, monitoringu, wsparcia, bezpieczeństwa, AI i danych technicznych. Możemy je ujawnić doradcom, audytorom, właściwym organom lub w związku z legalną transakcją przedsiębiorstwa. Nie sprzedajemy danych osobowych brokerom danych ani reklamodawcom.

## 8. Transfery międzynarodowe

Przy przetwarzaniu poza EOG stosujemy odpowiedni mechanizm, taki jak decyzja stwierdzająca odpowiedni stopień ochrony, standardowe klauzule umowne Komisji Europejskiej lub inne prawnie uznane zabezpieczenie, a w razie potrzeby środki uzupełniające.

## 9. Przechowywanie

Dane przechowujemy tylko przez niezbędny czas. Konto przez okres jego istnienia i rozsądny czas później; dokumenty księgowe zgodnie z prawem; wyniki skanów i historię zgodnie z planem i ustawieniami; dzienniki audytowe i bezpieczeństwa odpowiednio do ryzyka; wsparcie do zamknięcia sprawy i wymaganej ewidencji; kopie zapasowe do ich planowego nadpisania. Następnie dane usuwamy, anonimizujemy lub bezpiecznie wyłączamy z aktywnego użycia.

## 10. Bezpieczeństwo

Stosujemy szyfrowany transport, kontrolę dostępu i ról, separację środowisk, logowanie, monitoring, bezpieczny rozwój, zarządzanie podatnościami, kopie zapasowe, odtwarzanie i reakcję na incydenty. Żadna usługa nie gwarantuje pełnego bezpieczeństwa; użytkownik musi chronić dane logowania i bezpiecznie konfigurować integracje.

## 11. Prawa użytkownika

Zależnie od prawa można żądać dostępu, sprostowania, usunięcia, ograniczenia, przenoszenia, sprzeciwić się przetwarzaniu opartemu na uzasadnionym interesie, wycofać zgodę i złożyć skargę do organu nadzorczego. Należy napisać na security@outsideguardian.eu; możemy zweryfikować tożsamość. Jeśli przetwarzamy dane wyłącznie dla klienta, możemy przekazać mu żądanie.

## 12. Zautomatyzowane podejmowanie decyzji

Ustalenia, klasyfikacje i wyniki powstają z reguł i dowodów technicznych w celu wsparcia oceny bezpieczeństwa. Bez udziału człowieka nie mają wywoływać skutków prawnych lub podobnie istotnych wobec osób fizycznych.

## 13. Dzieci

OUTSIDE jest usługą dla organizacji i nie jest skierowana do dzieci. Użytkownik musi być zdolny do zawarcia umowy lub działania w imieniu organizacji.

## 14. Usługi stron trzecich

Do zewnętrznych witryn, baz danych i integracji mają zastosowanie ich własne warunki i polityki. Nie odpowiadamy za ich treść, bezpieczeństwo ani praktyki prywatności.

## 15. Zmiany polityki

Możemy aktualizować politykę wraz ze zmianami usługi, prawa lub technologii. Aktualna wersja i data będą publikowane tutaj; gdy wymaga tego prawo, przekażemy dodatkowe powiadomienie.

## 16. Kontakt

**VeDomEll s. r. o.**

Alžbetina 55, 040 01 Košice – mestská časť Staré Mesto, Słowacja

IČO: 52498751 · DIČ: 2121045729 · IČ DPH: SK2121045729

security@outsideguardian.eu`,
  },
  hu: {
    title: "Adatvédelmi irányelvek",
    updated: "2026-08-17",
    body: `Ez a szabályzat ismerteti, hogy a VeDomEll s. r. o. („OUTSIDE”, „mi”) hogyan gyűjti, használja, tárolja és védi a személyes adatokat az outsideguardian.eu felkeresése és az OUTSIDE platform használata során. Az OUTSIDE külső támadási felületet kezel és engedélyezett célpontok biztonságát figyeli. Kérdéseit a security@outsideguardian.eu címre küldheti.

## 1. Adatkezelő és adatfeldolgozó

A webhelyhez, fiókokhoz, számlázáshoz, kommunikációhoz, szolgáltatáskezeléshez és termékfejlesztéshez kapcsolódó adatok kezelője a VeDomEll s. r. o. Ha az ügyfél a saját nevében történő feldolgozásra ad át adatot, rendszerint az ügyfél az adatkezelő, mi pedig az adatfeldolgozó; ezt külön adatfeldolgozási megállapodás szabályozhatja.

## 2. A kezelt adatok

Kezelhetjük a nevet, üzleti e-mail-címet, szervezetet, munkakört, fiókazonosítót, szerepkört, biztonsági és kommunikációs beállításokat; számlázási, adózási, előfizetési és tranzakciós adatokat; IP-címet, böngészőt, eszközt, munkamenetet, időbélyeget, használt funkciót, vizsgálati kérést, domain-ellenőrzést, jelentést, audit- és diagnosztikai naplót.

Az ügyfél domaineket, gépneveket, eszközcímkéket, megjegyzéseket, javítási jegyzeteket, valamint jelentés-, integráció- és webhookbeállításokat adhat meg. Az ügyfél felel a jogalapért és az adatok átadására vonatkozó jogosultságért. A jelszavakat nem tároljuk egyszerű szövegként, a teljes bankkártyaadatokat a fizetési szolgáltató kezeli.

### Nyilvánosan megfigyelhető műszaki adatok

Jogos biztonsági, eszközfelderítési és kockázatelemzési célokra feldolgozhatunk nyilvános DNS-, tanúsítvány-, IP-, RDAP- és regisztrációs adatokat, HTTP- és TLS-metaadatokat, technológiai jelzőket, nyilvános szolgáltatásokat, sérülékenységi forrásokat és eszközkapcsolatokat. A nyilvános elérhetőség nem jelent hozzájárulást ettől eltérő felhasználáshoz.

### Kommunikáció

Támogatás, termékbemutató vagy sérülékenységi bejelentés során kezeljük a kapcsolattartási adatokat, az üzenet tartalmát, a mellékleteket, a támogatási előzményeket és a kérés megoldásához szükséges műszaki adatokat.

## 3. Adatforrások

Az adatokat közvetlenül Öntől, a szervezet engedélyezett felhasználóitól, a szolgáltatás használata közben automatikusan, fizetési, hitelesítési, tárhely- és kommunikációs szolgáltatóktól, a nyilvános internetről, biztonsági forrásokból és az engedélyezett integrációkból szerezzük.

## 4. Célok és jogalapok

Az adatokat szerződés teljesítése vagy annak előkészítése alapján fióklétrehozásra és -védelemre, engedélyezett vizsgálatokra, megállapításokra, figyelésre, jelentésekre, támogatásra, fizetésekre és működési értesítésekre használjuk. Jogos érdekből védjük a szolgáltatást, megelőzzük a csalást és visszaélést, auditálunk, incidenseket kezelünk, hibákat javítunk, megbízhatóságot mérünk és fejlesztjük a terméket. Jogi, számviteli és adózási kötelezettségek, valamint jogi igények miatt is kezelhetünk adatot.

Marketinget csak jogszerűen küldünk, és bármikor le lehet iratkozni. Ahol lehetséges, összesített, anonimizált vagy minimalizált adatokat használunk.

## 5. Mesterséges intelligencia

Az AI közérthető magyarázatot, összefoglalót vagy javaslatot készíthet. Csak az észszerűen szükséges környezetet továbbítjuk, az érzékeny értékeket lehetőség szerint minimalizáljuk. A kimenet hiányos vagy pontatlan lehet, nem bizonyít sérülékenységet vagy kompromittálást, ezért emberi ellenőrzést igényel. Az ügyféltartalmat kifejezett tájékoztatás és jogszerű megállapodás nélkül nem használjuk szándékosan nyilvános harmadik fél modelljének tanítására.

## 6. Cookie-k és analitika

A szükséges cookie-kat és helyi tárolást hitelesítésre, munkamenetre, biztonságra, csalásmegelőzésre és beállításokra használjuk. Nem szükséges technológiát csak megfelelő jogalappal és szükség esetén hozzájárulással alkalmazunk.

A saját Umami analitika nem használ cookie-t és nem követi a látogatót más webhelyeken. Anonimizált látogatást, forrást, paraméterek nélküli belső útvonalat, eszköztípust, nyelvet, hozzávetőleges országot és korlátozott termékeseményt rögzít. Nevet, e-mailt, szervezetet, vizsgált domaint, megállapítást, titkot vagy hozzáférési tokent nem küldünk. Tiszteletben tartjuk a Do Not Track beállítást és kizárjuk a tokent tartalmazó útvonalakat.

## 7. Címzettek

Az adatokat szerződéses infrastruktúra-, adatbázis-, mentési, e-mail-, fizetési, hitelesítési, felügyeleti, támogatási, biztonsági, AI- és műszakiadatszolgáltatók kezelhetik. Adatot jogi tanácsadónak, auditornak, illetékes hatóságnak vagy jogszerű vállalati tranzakcióhoz is átadhatunk. Személyes adatot nem értékesítünk adatbrókernek vagy hirdetőnek.

## 8. Nemzetközi adattovábbítás

EGT-n kívüli feldolgozásnál megfelelőségi határozatot, az Európai Bizottság általános szerződési feltételeit vagy más jogszerű garanciát, szükség esetén pedig kiegészítő intézkedést alkalmazunk.

## 9. Megőrzés

Az adatokat csak a szükséges ideig őrizzük. A fiók adatait annak élettartama alatt és észszerű ideig utána; a számviteli iratokat jogszabály szerint; a vizsgálatokat és előzményeket a csomag és beállítások szerint; az audit- és biztonsági naplókat a kockázathoz mérten; a támogatási adatokat az ügy lezárásáig és a szükséges nyilvántartásig; a mentéseket a szabályos felülírásig. Ezután töröljük, anonimizáljuk vagy biztonságosan kivonjuk az adatot az aktív használatból.

## 10. Biztonság

Titkosított átvitelt, hozzáférés- és szerepkör-kezelést, környezetszétválasztást, naplózást, felügyeletet, biztonságos fejlesztést, sérülékenység-kezelést, mentést, helyreállítást és incidenskezelést alkalmazunk. Egyetlen szolgáltatás sem garantál teljes biztonságot; a felhasználó köteles védeni hitelesítő adatait és biztonságosan beállítani integrációit.

## 11. Az érintett jogai

Az alkalmazandó jog szerint kérhető hozzáférés, helyesbítés, törlés, korlátozás és hordozhatóság, tiltakozhat a jogos érdeken alapuló feldolgozás ellen, visszavonhatja hozzájárulását és panaszt tehet a felügyeleti hatóságnál. Írjon a security@outsideguardian.eu címre; személyazonosságát ellenőrizhetjük. Ha csak az ügyfél számára dolgozunk fel adatot, a kérelmet továbbíthatjuk neki.

## 12. Automatizált döntéshozatal

A megállapítások, osztályozások és pontszámok szabályokból és műszaki bizonyítékokból készülnek a biztonsági felülvizsgálat támogatására. Emberi közreműködés nélkül nem céljuk természetes személyre nézve jogi vagy hasonlóan jelentős hatás kiváltása.

## 13. Gyermekek

Az OUTSIDE szervezeteknek szól, nem gyermekeknek. A felhasználónak szerződéskötésre képesnek vagy szervezet képviseletére jogosultnak kell lennie.

## 14. Harmadik fél szolgáltatásai

Külső webhelyre, adatbázisra és integrációra a saját feltételei és szabályzatai vonatkoznak. Tartalmukért, biztonságukért vagy adatvédelmi gyakorlatukért nem felelünk.

## 15. A szabályzat módosítása

A szabályzatot a szolgáltatás, a jog vagy a technológia változásával frissíthetjük. Az aktuális változatot és dátumot itt tesszük közzé, és jogszabályi előírás esetén további értesítést adunk.

## 16. Kapcsolat

**VeDomEll s. r. o.**

Alžbetina 55, 040 01 Košice – mestská časť Staré Mesto, Szlovákia

IČO: 52498751 · DIČ: 2121045729 · IČ DPH: SK2121045729

security@outsideguardian.eu`,
  },
};
