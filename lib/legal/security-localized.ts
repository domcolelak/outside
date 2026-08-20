import type { Locale } from "@/lib/i18n/locales";

type TranslatedSecurity = { title: string; updated: string; body: string };
type TranslatedLocale = Exclude<Locale, "en">;

export const SECURITY_TRANSLATIONS: Record<TranslatedLocale, TranslatedSecurity> = {
  sk: {
    title: "Bezpečnosť v OUTSIDE",
    updated: "2026-07-24",
    body: `Bezpečnosť je základom účelu a prevádzky OUTSIDE. Platforma pomáha organizáciám porozumieť verejne viditeľnej infraštruktúre, nájsť expozície podložené dôkazmi a sledovať zmeny. Uplatňujeme viacvrstvovú ochranu vo vývoji, infraštruktúre, prístupe a prevádzke. Táto stránka opisuje súčasný prístup, nie certifikáciu ani záruku. Kontakt: security@outsideguardian.eu.

## 1. Bezpečnostné princípy

**Dôkaz pred tvrdením.** Rozlišujeme pozorovaný fakt, odvodenie a možnú obavu; bez dôkazu netvrdíme kompromitáciu ani nesúlad.

**Najnižšie oprávnenia a oddelenie tenantov.** Používateľ, služba aj proces majú iba potrebný prístup a údaje organizácií sú logicky oddelené serverovými kontrolami.

**Predvolene pasívne a pod kontrolou človeka.** Verejné zdroje a ohraničené pozorovanie sú predvolené. Overené, autentifikované alebo aktívnejšie funkcie vyžadujú dodatočné oprávnenie. Automatizácia a AI podporujú, nie nahrádzajú odborné rozhodnutie.

## 2. Bezpečnosť aplikácie

Používame autentifikované relácie, organizačné a rolové oprávnenia, serverové kontroly, validáciu vstupov, bezpečné kódovanie výstupov, limity veľkosti a frekvencie, časové limity, bezpečné chyby, audit citlivých akcií, ochranu administrácie, kontrolu závislostí a automatické testy.

## 3. Oprávnenie domén a cieľov

OUTSIDE sa smie používať iba na vlastnené alebo oprávnene posudzované systémy. Monitoring, integrácie a citlivé operácie môžu vyžadovať DNS, e-mail, súbor, účet poskytovateľa alebo iný dôkaz kontroly.

### Vylúčenie anonymného skenovania

Prevádzkovateľ domény môže zverejniť DNS TXT záznam **_outside-optout.yourdomain.com** s hodnotou **outside-optout=1**. Platí pre doménu a subdomény približne do desiatich minút po propagácii. Overený vlastník môže naďalej skenovať a monitorovať vlastný povrch. Stav: \`/api/optout?domain=yourdomain.com\`.

## 4. Bezpečný sieťový prístup

Ciele normalizujeme a overujeme; blokujeme privátne, loopback, link-local, rezervované a cloud-metadata adresy, kontrolujeme vyriešené IP, obmedzujeme presmerovania, protokoly, čas a veľkosť odpovede a chránime sa pred DNS rebindingom a SSRF.

## 5. Šifrovanie

Produkčná prevádzka používa TLS. Citlivé údaje chránime obmedzeným prístupom, správou tajomstiev a dostupným šifrovaním úložísk. Zákazník zodpovedá za bezpečné integrácie, exporty a poverenia mimo OUTSIDE.

## 6. Autentifikácia a prístup

Používame jedinečné účty, chránené relácie, role, obmedzenú administráciu, zrušenie relácií, audit a limity autentifikácie; podľa plánu aj podnikové identity. Zákazník má používať silné jedinečné poverenia, MFA alebo SSO, pravidelne kontrolovať členstvo a okamžite odoberať bývalých pracovníkov.

## 7. Bezpečnosť infraštruktúry

Infraštruktúra oddeľuje aplikáciu a databázu, obmedzuje sieťovú expozíciu a administráciu, používa spravované tajomstvá, kontroly zdravia, limity zdrojov, logovanie, monitoring, riadené nasadenie, zálohy a obnovu. Presné riešenie závisí od regiónu a poskytovateľa.

## 8. Bezpečný vývoj

Životný cyklus zahŕňa kontrolu kódu, typov, linting, jednotkové, integračné a prehliadačové testy, overenie migrácií, kontajnerov a infraštruktúry, sken závislostí a tajomstiev, chránené nasadenie a oddelenie prostredí. Bezpečnostná oprava môže dostať mimoriadnu prioritu.

## 9. Zraniteľnosti a závislosti

Sledujeme závislosti, obrazy, runtime, infraštruktúru, poskytovateľov a integrácie. Prioritu nápravy určujeme podľa zneužiteľnosti, expozície, citlivosti, dopadu, dostupnej mitigácie a aktívneho zneužívania, nie iba podľa štítku závažnosti.

## 10. Logovanie a monitoring

Zaznamenávať môžeme autentifikáciu, neúspešné prístupy, citlivé akcie, skeny, overenie domén, zmeny integrácií, fakturáciu, prístup k reportom, administráciu, chyby a anomálie. Logy chránime pred bežnou zmenou, uchovávame primerane a zámerne do nich nevkladáme zbytočné tajomstvá ani celé citlivé payloady.

## 11. Zálohy a obnova

Podľa prostredia používame plánované databázové zálohy, redundanciu poskytovateľa, retenčné pravidlá, obmedzený prístup, testy obnovy a zdokumentované postupy. Zákazník má uchovať exporty potrebné pre vlastnú kontinuitu alebo povinnosti.

## 12. Reakcia na incident

Proces zahŕňa detekciu a triedenie, obmedzenie, vyšetrovanie, nápravu, obnovu, potrebné oznámenie a následné vyhodnotenie. Oznamovacie povinnosti posudzujeme podľa práva, zmluvy a povahy incidentu a môžeme žiadať spoluprácu zákazníka.

## 13. Minimalizácia údajov

Spracúvame iba primerane potrebné údaje, minimalizujeme AI kontext, podľa možností redigujeme citlivé hodnoty, obmedzujeme produkčný prístup, oddeľujeme zákaznícke a verejné technické údaje, neukladáme zbytočné kartové údaje a po lehote údaje vymazávame alebo anonymizujeme.

## 14. Bezpečnosť a limity AI

AI vysvetľuje už dostupné dôkazy; autonómne nezneužíva systémy, nevykonáva nápravu v prostredí zákazníka, nepotvrdzuje kompromitáciu bez dôkazov ani necertifikuje súlad. Výstup sa musí skontrolovať a kontext prechádza riadenou serverovou vrstvou.

## 15. Riziko tretích strán

Pri infraštruktúre, databázach, e-maile, platbách, dátach o hrozbách, autentifikácii, AI a monitoringu závisíme od vybraných poskytovateľov a hodnotíme ich podľa rizika. Ich výpadok alebo incident môže ovplyvniť OUTSIDE; nezávislú službu nemožno absolútne zaručiť.

## 16. Zodpovednosť zákazníka

Zákazník musí používať iba oprávnené ciele, chrániť účty, API kľúče a webhooky, riadiť prístupy a integrácie, kontrolovať nálezy, bezpečne vykonávať nápravu, aktualizovať vlastné systémy, uchovať potrebné exporty, hlásiť podozrivú aktivitu a dodržiavať právo. OUTSIDE nenahrádza vlastné bezpečnostné kontroly ani incidentný proces.

## 17. Zodpovedné hlásenie zraniteľností

Hlásenia posielajte na security@outsideguardian.eu s opisom, zasiahnutou URL alebo komponentom, krokmi reprodukcie, bezpečným dôkazom, dopadom a kontaktom.

### Čomu sa vyhnúť

Nepristupujte k cudzím údajom, nesťahujte viac než je nutné, nemeňte ani nemažte údaje, nevytvárajte trvalý prístup, nenasadzujte malvér, nevykonávajte DoS, nenarúšajte produkciu, nepreťažujte automatizáciou, netestujte cudzie systémy a nezverejňujte nevyriešenú chybu bez primeraného času na reakciu.

### Výskum v dobrej viere

Ak konáte v dobrej viere, minimalizujete škodu, rešpektujete súkromie a rozsah, rýchlo nahlásite problém a dáte primeraný čas, budeme sa usilovať považovať činnosť za oprávnený výskum. Nelegalizuje to protiprávne konanie ani zásah do systémov tretích strán.

### Bez automatickej odmeny

Bez výslovného písomného oznámenia neprevádzkujeme garantovaný bug bounty program; hlásenie nevytvára nárok na odmenu ani úhradu.

## 18. Proces zverejnenia

Dôveryhodné hlásenie potvrdíme, posúdime rozsah a závažnosť, podľa potreby vyžiadame údaje, pripravíme mitigáciu alebo opravu a primerane koordinujeme zverejnenie. Čas závisí od zložitosti a dopadu; nezverejníme údaje zvyšujúce riziko alebo odhaľujúce zákazníka.

## 19. Bezpečnostná dokumentácia

Podnikom možno za primeranej dôvernosti poskytnúť dostupnú architektúru, dátové toky, prístupy, zálohy, subdodávateľov, vývoj, incidentné postupy a súhrny testov. Dokumentácia nie je certifikáciou, ak to výslovne neuvádza.

## 20. Vyhlásenia o súlade

Certifikáciu, audit alebo regulačný stav tvrdíme iba vtedy, ak sú výslovne zdokumentované a aktuálne. Používanie OUTSIDE môže podporiť bezpečnostné a compliance činnosti, samo osebe však súlad nezabezpečí.

## 21. Zmeny stránky

Stránku môžeme meniť podľa vývoja služby, architektúry, kontrol a práva. Aktuálna verzia bude zverejnená s dátumom revízie.

## 22. Kontakt

**VeDomEll s. r. o.** · Alžbetina 55, 040 01 Košice – mestská časť Staré Mesto, Slovensko

IČO: 52498751 · DIČ: 2121045729 · IČ DPH: SK2121045729 · security@outsideguardian.eu`,
  },
  cs: {
    title: "Bezpečnost v OUTSIDE",
    updated: "2026-07-24",
    body: `Bezpečnost je základem účelu a provozu OUTSIDE. Platforma pomáhá organizacím porozumět veřejně viditelné infrastruktuře, najít expozice podložené důkazy a sledovat změny. Uplatňujeme vícevrstvou ochranu ve vývoji, infrastruktuře, přístupu a provozu. Tato stránka popisuje současný přístup, nikoli certifikaci ani záruku. Kontakt: security@outsideguardian.eu.

## 1. Bezpečnostní principy

**Důkaz před tvrzením.** Rozlišujeme pozorovaný fakt, odvození a možnou obavu; bez důkazu netvrdíme kompromitaci ani nesoulad.

**Nejnižší oprávnění a oddělení tenantů.** Uživatel, služba i proces mají jen nutný přístup a údaje organizací jsou logicky odděleny serverovými kontrolami.

**Ve výchozím stavu pasivní a pod lidskou kontrolou.** Výchozí jsou veřejné zdroje a ohraničené pozorování. Ověřené, autentizované nebo aktivnější funkce vyžadují další oprávnění. Automatizace a AI podporují, nikoli nahrazují odborné rozhodnutí.

## 2. Bezpečnost aplikace

Používáme autentizované relace, organizační a rolová oprávnění, serverové kontroly, validaci vstupů, bezpečné kódování výstupů, limity velikosti a frekvence, časové limity, bezpečné chyby, audit citlivých akcí, ochranu administrace, kontrolu závislostí a automatické testy.

## 3. Oprávnění domén a cílů

OUTSIDE se smí používat jen na vlastněné nebo oprávněně posuzované systémy. Monitoring, integrace a citlivé operace mohou vyžadovat DNS, e-mail, soubor, účet poskytovatele nebo jiný důkaz kontroly.

### Vyloučení anonymního skenování

Provozovatel domény může zveřejnit DNS TXT záznam **_outside-optout.yourdomain.com** s hodnotou **outside-optout=1**. Platí pro doménu a subdomény zhruba do deseti minut po propagaci. Ověřený vlastník může dál skenovat vlastní povrch. Stav: \`/api/optout?domain=yourdomain.com\`.

## 4. Bezpečný síťový přístup

Cíle normalizujeme a ověřujeme; blokujeme privátní, loopback, link-local, rezervované a cloud-metadata adresy, kontrolujeme vyřešené IP, omezujeme přesměrování, protokoly, čas a velikost odpovědi a chráníme se před DNS rebindingem a SSRF.

## 5. Šifrování

Produkční provoz používá TLS. Citlivé údaje chráníme omezeným přístupem, správou tajemství a dostupným šifrováním úložišť. Zákazník odpovídá za bezpečné integrace, exporty a pověření mimo OUTSIDE.

## 6. Autentizace a přístup

Používáme jedinečné účty, chráněné relace, role, omezenou administraci, zrušení relací, audit a limity autentizace; podle plánu i podnikové identity. Zákazník má používat silná jedinečná pověření, MFA nebo SSO, pravidelně kontrolovat členství a ihned odebírat bývalé pracovníky.

## 7. Bezpečnost infrastruktury

Infrastruktura odděluje aplikaci a databázi, omezuje síťovou expozici a administraci, používá spravovaná tajemství, kontroly zdraví, limity zdrojů, logování, monitoring, řízené nasazení, zálohy a obnovu. Přesné řešení závisí na regionu a poskytovateli.

## 8. Bezpečný vývoj

Životní cyklus zahrnuje kontrolu kódu, typů, linting, jednotkové, integrační a prohlížečové testy, ověření migrací, kontejnerů a infrastruktury, sken závislostí a tajemství, chráněné nasazení a oddělení prostředí. Bezpečnostní oprava může dostat mimořádnou prioritu.

## 9. Zranitelnosti a závislosti

Sledujeme závislosti, obrazy, runtime, infrastrukturu, poskytovatele a integrace. Prioritu nápravy určujeme podle zneužitelnosti, expozice, citlivosti, dopadu, dostupné mitigace a aktivního zneužívání, nikoli jen podle štítku závažnosti.

## 10. Logování a monitoring

Zaznamenávat můžeme autentizaci, neúspěšné přístupy, citlivé akce, skeny, ověření domén, změny integrací, fakturaci, přístup k reportům, administraci, chyby a anomálie. Logy chráníme před běžnou změnou, uchováváme přiměřeně a záměrně do nich nevkládáme zbytečná tajemství ani celé citlivé payloady.

## 11. Zálohy a obnova

Podle prostředí používáme plánované databázové zálohy, redundanci poskytovatele, retenční pravidla, omezený přístup, testy obnovy a zdokumentované postupy. Zákazník má uchovat exporty potřebné pro vlastní kontinuitu či povinnosti.

## 12. Reakce na incident

Proces zahrnuje detekci a třídění, omezení, vyšetřování, nápravu, obnovu, potřebná oznámení a následné vyhodnocení. Oznamovací povinnosti posuzujeme podle práva, smlouvy a povahy incidentu a můžeme žádat spolupráci zákazníka.

## 13. Minimalizace údajů

Zpracováváme jen přiměřeně nutné údaje, minimalizujeme AI kontext, podle možností redigujeme citlivé hodnoty, omezujeme produkční přístup, oddělujeme zákaznická a veřejná technická data, neukládáme zbytečné kartové údaje a po lhůtě data mažeme či anonymizujeme.

## 14. Bezpečnost a limity AI

AI vysvětluje již dostupné důkazy; autonomně nezneužívá systémy, neprovádí nápravu u zákazníka, nepotvrzuje kompromitaci bez důkazů ani necertifikuje soulad. Výstup se musí zkontrolovat a kontext prochází řízenou serverovou vrstvou.

## 15. Riziko třetích stran

U infrastruktury, databází, e-mailu, plateb, dat o hrozbách, autentizace, AI a monitoringu závisíme na vybraných poskytovatelích a hodnotíme je podle rizika. Jejich výpadek či incident může ovlivnit OUTSIDE; nezávislou službu nelze absolutně zaručit.

## 16. Odpovědnost zákazníka

Zákazník musí používat jen oprávněné cíle, chránit účty, API klíče a webhooky, řídit přístupy a integrace, kontrolovat nálezy, bezpečně provádět nápravu, aktualizovat vlastní systémy, uchovat potřebné exporty, hlásit podezřelou aktivitu a dodržovat právo. OUTSIDE nenahrazuje vlastní bezpečnostní kontroly ani incidentní proces.

## 17. Odpovědné hlášení zranitelností

Hlášení posílejte na security@outsideguardian.eu s popisem, zasaženou URL nebo komponentou, kroky reprodukce, bezpečným důkazem, dopadem a kontaktem.

### Čemu se vyhnout

Nepřistupujte k cizím datům, nestahujte více než je nutné, neměňte ani nemažte data, nevytvářejte trvalý přístup, nenasazujte malware, neprovádějte DoS, nenarušujte produkci, nepřetěžujte automatizací, netestujte cizí systémy a nezveřejňujte nevyřešenou chybu bez přiměřené doby na reakci.

### Výzkum v dobré víře

Jednáte-li v dobré víře, minimalizujete škodu, respektujete soukromí a rozsah, rychle problém nahlásíte a dáte přiměřený čas, budeme se snažit považovat činnost za oprávněný výzkum. Nelegalizuje to protiprávní jednání ani zásah do systémů třetích stran.

### Bez automatické odměny

Bez výslovného písemného oznámení neprovozujeme garantovaný bug bounty program; hlášení nevytváří nárok na odměnu ani úhradu.

## 18. Proces zveřejnění

Důvěryhodné hlášení potvrdíme, posoudíme rozsah a závažnost, podle potřeby vyžádáme údaje, připravíme mitigaci či opravu a přiměřeně koordinujeme zveřejnění. Čas závisí na složitosti a dopadu; nezveřejníme data zvyšující riziko nebo odhalující zákazníka.

## 19. Bezpečnostní dokumentace

Podnikům lze za přiměřené důvěrnosti poskytnout dostupnou architekturu, datové toky, přístupy, zálohy, subdodavatele, vývoj, incidentní postupy a souhrny testů. Dokumentace není certifikací, pokud to výslovně neuvádí.

## 20. Prohlášení o souladu

Certifikaci, audit nebo regulatorní stav tvrdíme jen tehdy, jsou-li výslovně zdokumentované a aktuální. Používání OUTSIDE může podpořit bezpečnostní a compliance činnosti, samo však soulad nezajistí.

## 21. Změny stránky

Stránku můžeme měnit podle vývoje služby, architektury, kontrol a práva. Aktuální verze bude zveřejněna s datem revize.

## 22. Kontakt

**VeDomEll s. r. o.** · Alžbetina 55, 040 01 Košice – mestská časť Staré Mesto, Slovensko

IČO: 52498751 · DIČ: 2121045729 · IČ DPH: SK2121045729 · security@outsideguardian.eu`,
  },
  pl: {
    title: "Bezpieczeństwo w OUTSIDE",
    updated: "2026-07-24",
    body: `Bezpieczeństwo jest podstawą działania OUTSIDE. Platforma pomaga organizacjom zrozumieć publicznie widoczną infrastrukturę, wykrywać ekspozycje poparte dowodami i śledzić zmiany. Stosujemy ochronę warstwową w rozwoju, infrastrukturze, dostępie i operacjach. Ta strona opisuje obecne podejście, a nie certyfikat ani gwarancję. Kontakt: security@outsideguardian.eu.

## 1. Zasady bezpieczeństwa

**Dowód przed stwierdzeniem.** Rozróżniamy obserwowany fakt, wniosek i możliwe zagrożenie; bez dowodu nie stwierdzamy naruszenia ani niezgodności.

**Najmniejsze uprawnienia i separacja tenantów.** Użytkownik, usługa i proces otrzymują tylko niezbędny dostęp, a dane organizacji są logicznie oddzielone kontrolami serwerowymi.

**Domyślnie pasywne i pod kontrolą człowieka.** Podstawą są źródła publiczne i ograniczona obserwacja. Funkcje zweryfikowane, uwierzytelnione lub bardziej aktywne wymagają dodatkowych uprawnień. Automatyzacja i AI wspierają, a nie zastępują profesjonalną decyzję.

## 2. Bezpieczeństwo aplikacji

Stosujemy uwierzytelnione sesje, uprawnienia organizacyjne i rolowe, kontrole serwerowe, walidację wejścia, bezpieczne kodowanie wyjścia, limity rozmiaru i częstotliwości, timeouty, bezpieczną obsługę błędów, audyt działań wrażliwych, ochronę administracji, przegląd zależności i testy automatyczne.

## 3. Autoryzacja domen i celów

OUTSIDE wolno używać tylko wobec systemów własnych lub objętych upoważnieniem. Monitoring, integracje i operacje wrażliwe mogą wymagać DNS, e-maila, pliku, konta dostawcy lub innego dowodu kontroli.

### Rezygnacja z anonimowego skanowania

Operator domeny może opublikować rekord DNS TXT **_outside-optout.yourdomain.com** o wartości **outside-optout=1**. Obejmuje domenę i subdomeny mniej więcej w ciągu dziesięciu minut od propagacji. Zweryfikowany właściciel nadal może skanować własną powierzchnię. Stan: \`/api/optout?domain=yourdomain.com\`.

## 4. Bezpieczny dostęp sieciowy

Normalizujemy i weryfikujemy cele; blokujemy adresy prywatne, loopback, link-local, zarezerwowane i metadane chmurowe, sprawdzamy rozwiązane IP, ograniczamy przekierowania, protokoły, czas i rozmiar odpowiedzi oraz chronimy przed DNS rebinding i SSRF.

## 5. Szyfrowanie

Ruch produkcyjny używa TLS. Dane wrażliwe chronimy ograniczonym dostępem, zarządzaniem sekretami i dostępnym szyfrowaniem pamięci. Klient odpowiada za bezpieczne integracje, eksporty i dane uwierzytelniające poza OUTSIDE.

## 6. Uwierzytelnianie i dostęp

Stosujemy unikalne konta, chronione sesje, role, ograniczoną administrację, unieważnianie sesji, audyt i limity uwierzytelniania; zależnie od planu również tożsamość firmową. Klient powinien stosować silne unikalne dane, MFA lub SSO, regularnie sprawdzać członkostwo i szybko usuwać byłych pracowników.

## 7. Bezpieczeństwo infrastruktury

Infrastruktura rozdziela aplikację i bazę danych, ogranicza ekspozycję sieciową i administrację, używa zarządzanych sekretów, kontroli stanu, limitów zasobów, logowania, monitoringu, kontrolowanych wdrożeń, kopii i odtwarzania. Szczegóły zależą od regionu i dostawcy.

## 8. Bezpieczny rozwój

Cykl obejmuje przegląd kodu i typów, linting, testy jednostkowe, integracyjne i przeglądarkowe, weryfikację migracji, kontenerów i infrastruktury, skan zależności i sekretów, chronione wdrożenia oraz separację środowisk. Poprawka bezpieczeństwa może otrzymać nadzwyczajny priorytet.

## 9. Podatności i zależności

Monitorujemy zależności, obrazy, środowiska uruchomieniowe, infrastrukturę, dostawców i integracje. Priorytet naprawy zależy od możliwości wykorzystania, ekspozycji, wrażliwości, wpływu, dostępnej mitygacji i aktywnego wykorzystania, a nie tylko etykiety ważności.

## 10. Logowanie i monitoring

Możemy rejestrować uwierzytelnienie, nieudane dostępy, działania wrażliwe, skany, weryfikacje domen, zmiany integracji, rozliczenia, dostęp do raportów, administrację, błędy i anomalie. Logi chronimy przed zwykłą modyfikacją, przechowujemy proporcjonalnie i nie zapisujemy celowo zbędnych sekretów ani pełnych wrażliwych payloadów.

## 11. Kopie i odtwarzanie

Zależnie od środowiska stosujemy planowane kopie bazy, redundancję dostawcy, zasady retencji, ograniczony dostęp, testy odzyskiwania i udokumentowane procedury. Klient powinien zachować eksporty potrzebne do własnej ciągłości lub obowiązków.

## 12. Reakcja na incydenty

Proces obejmuje wykrycie i triage, ograniczenie, dochodzenie, naprawę, odtworzenie, wymagane powiadomienie i przegląd po incydencie. Obowiązki oceniamy według prawa, umowy i charakteru incydentu; możemy potrzebować współpracy klienta.

## 13. Minimalizacja danych

Przetwarzamy tylko dane rozsądnie potrzebne, minimalizujemy kontekst AI, w miarę możliwości redagujemy wartości wrażliwe, ograniczamy dostęp produkcyjny, oddzielamy dane klienta i publiczne dane techniczne, nie przechowujemy zbędnych danych kart i po terminie usuwamy lub anonimizujemy dane.

## 14. Bezpieczeństwo i ograniczenia AI

AI objaśnia dostępne dowody; nie wykorzystuje autonomicznie systemów, nie wykonuje napraw u klienta, nie potwierdza naruszenia bez dowodu ani nie certyfikuje zgodności. Wynik wymaga przeglądu, a kontekst przechodzi kontrolowaną warstwą serwerową.

## 15. Ryzyko stron trzecich

W zakresie infrastruktury, baz, e-maila, płatności, danych o zagrożeniach, uwierzytelniania, AI i monitoringu zależymy od wybranych dostawców i oceniamy ich według ryzyka. Ich awaria lub incydent może wpłynąć na OUTSIDE; niezależnej usługi nie można bezwzględnie zagwarantować.

## 16. Obowiązki klienta

Klient musi używać tylko autoryzowanych celów, chronić konta, klucze API i webhooki, zarządzać dostępem i integracjami, przeglądać ustalenia, bezpiecznie wprowadzać naprawy, aktualizować własne systemy, zachować eksporty, zgłaszać podejrzaną aktywność i przestrzegać prawa. OUTSIDE nie zastępuje własnych zabezpieczeń ani reakcji na incydenty.

## 17. Odpowiedzialne zgłaszanie podatności

Zgłoszenia wysyłaj na security@outsideguardian.eu wraz z opisem, dotkniętym URL-em lub komponentem, krokami reprodukcji, bezpiecznym dowodem, wpływem i kontaktem.

### Czego nie robić

Nie uzyskuj dostępu do cudzych danych, nie pobieraj więcej niż trzeba, nie zmieniaj ani nie usuwaj danych, nie twórz trwałego dostępu, nie wdrażaj malware, nie wykonuj DoS, nie zakłócaj produkcji, nie przeciążaj automatyzacją, nie testuj cudzych systemów i nie ujawniaj nierozwiązanej wady bez rozsądnego czasu na reakcję.

### Badania w dobrej wierze

Jeśli działasz w dobrej wierze, minimalizujesz szkody, respektujesz prywatność i zakres, szybko zgłaszasz problem i dajesz rozsądny czas, dołożymy starań, by traktować działanie jako uprawnione badanie. Nie legalizuje to czynu bezprawnego ani ingerencji w systemy stron trzecich.

### Brak automatycznej nagrody

Bez wyraźnego pisemnego ogłoszenia nie prowadzimy gwarantowanego programu bug bounty; zgłoszenie nie tworzy prawa do nagrody ani zwrotu kosztów.

## 18. Proces ujawnienia

Potwierdzimy wiarygodne zgłoszenie, ocenimy zakres i wagę, w razie potrzeby poprosimy o dane, przygotujemy mitygację lub poprawkę i odpowiednio skoordynujemy ujawnienie. Czas zależy od złożoności i wpływu; nie ujawnimy informacji zwiększających ryzyko ani danych klienta.

## 19. Dokumentacja bezpieczeństwa

Firmom można przy zachowaniu poufności udostępnić dostępną architekturę, przepływy danych, dostępy, kopie, podwykonawców, rozwój, procedury incydentowe i podsumowania testów. Dokumentacja nie jest certyfikatem, o ile nie stwierdzono tego wprost.

## 20. Oświadczenia o zgodności

Certyfikację, audyt lub status regulacyjny deklarujemy tylko, gdy są wyraźnie udokumentowane i aktualne. OUTSIDE może wspierać działania bezpieczeństwa i compliance, ale samo użycie nie zapewnia zgodności.

## 21. Zmiany strony

Możemy aktualizować stronę wraz z rozwojem usługi, architektury, kontroli i prawa. Bieżąca wersja będzie opublikowana z datą rewizji.

## 22. Kontakt

**VeDomEll s. r. o.** · Alžbetina 55, 040 01 Košice – mestská časť Staré Mesto, Słowacja

IČO: 52498751 · DIČ: 2121045729 · IČ DPH: SK2121045729 · security@outsideguardian.eu`,
  },
  hu: {
    title: "Biztonság az OUTSIDE-nál",
    updated: "2026-07-24",
    body: `A biztonság az OUTSIDE céljának és működésének alapja. A platform segít a szervezeteknek megérteni a nyilvánosan látható infrastruktúrát, bizonyítékalapú kitettséget azonosítani és változást figyelni. Többrétegű védelmet alkalmazunk a fejlesztésben, infrastruktúrában, hozzáférésben és üzemeltetésben. Ez az oldal a jelenlegi megközelítést írja le, nem tanúsítvány vagy garancia. Kapcsolat: security@outsideguardian.eu.

## 1. Biztonsági alapelvek

**Bizonyíték az állítás előtt.** Megkülönböztetjük a megfigyelt tényt, a következtetést és a lehetséges aggályt; bizonyíték nélkül nem állítunk kompromittálást vagy meg nem felelést.

**Legkisebb jogosultság és bérlőelkülönítés.** A felhasználó, szolgáltatás és folyamat csak szükséges hozzáférést kap, a szervezetek adatait szerveroldali vezérlés választja el.

**Alapértelmezetten passzív, emberi kontrollal.** Nyilvános forrást és korlátozott megfigyelést használunk. Ellenőrzött, hitelesített vagy aktívabb funkcióhoz további engedély kell. Az automatizálás és AI támogatja, nem helyettesíti a szakértői döntést.

## 2. Alkalmazásbiztonság

Hitelesített munkamenetet, szervezeti és szerepkörös jogosultságot, szerveroldali ellenőrzést, bemenet-ellenőrzést, biztonságos kimenetet, méret- és sebességkorlátot, időtúllépést, biztonságos hibakezelést, érzékeny műveleti auditot, adminisztráció-védelmet, függőségvizsgálatot és automatizált tesztet használunk.

## 3. Domain- és célpont-engedélyezés

Az OUTSIDE csak saját vagy engedéllyel vizsgált rendszerhez használható. A figyelés, integráció és érzékeny művelet DNS-, e-mail-, fájl-, szolgáltatói fiók- vagy más ellenőrzést igényelhet.

### Kilépés az anonim vizsgálatból

A domain üzemeltetője **outside-optout=1** értékű DNS TXT rekordot tehet közzé **_outside-optout.yourdomain.com** néven. A propagáció után körülbelül tíz percen belül a domainre és aldomainjeire érvényes. Az ellenőrzött tulajdonos továbbra is vizsgálhatja saját felületét. Állapot: \`/api/optout?domain=yourdomain.com\`.

## 4. Biztonságos hálózati hozzáférés

A célpontot normalizáljuk és ellenőrizzük; blokkoljuk a privát, loopback, link-local, fenntartott és felhő-metaadat címeket, ellenőrizzük a feloldott IP-t, korlátozzuk az átirányítást, protokollt, időt és válaszméretet, valamint védünk DNS rebinding és SSRF ellen.

## 5. Titkosítás

A termelési forgalom TLS-t használ. Az érzékeny adatot korlátozott hozzáférés, titokkezelés és elérhető tárolótitkosítás védi. Az ügyfél felel az OUTSIDE-on kívüli integráció, export és hitelesítő adat biztonságáért.

## 6. Hitelesítés és hozzáférés

Egyedi fiókot, védett munkamenetet, szerepkört, korlátozott adminisztrációt, munkamenet-visszavonást, auditot és hitelesítési korlátot alkalmazunk; csomagtól függően vállalati identitást is. Az ügyfél használjon erős egyedi adatot, MFA-t vagy SSO-t, ellenőrizze a tagságot és azonnal távolítsa el a volt dolgozót.

## 7. Infrastruktúra-biztonság

Az infrastruktúra elkülöníti az alkalmazást és adatbázist, korlátozza a hálózati kitettséget és adminisztrációt, kezelt titkot, állapotellenőrzést, erőforráskorlátot, naplózást, felügyeletet, vezérelt telepítést, mentést és helyreállítást használ. A részletek régiótól és szolgáltatótól függnek.

## 8. Biztonságos fejlesztés

Az életciklus kód- és típusellenőrzést, lintelést, egység-, integrációs és böngészőtesztet, migráció-, konténer- és infrastruktúra-ellenőrzést, függőség- és titokszkennelést, védett telepítést és környezetszétválasztást tartalmaz. A biztonsági javítás rendkívüli prioritást kaphat.

## 9. Sérülékenység és függőség

Figyeljük a függőségeket, képeket, futtatókörnyezetet, infrastruktúrát, szolgáltatót és integrációt. A javítási prioritást kihasználhatóság, kitettség, érzékenység, hatás, enyhítés és aktív kihasználás alapján adjuk meg, nem csak súlyossági címke szerint.

## 10. Naplózás és felügyelet

Naplózhatjuk a hitelesítést, sikertelen hozzáférést, érzékeny műveletet, vizsgálatot, domain-ellenőrzést, integrációváltozást, számlázást, jelentéshozzáférést, adminisztrációt, hibát és anomáliát. A naplót védjük, arányosan őrizzük, és szándékosan nem rögzítünk felesleges titkot vagy teljes érzékeny tartalmat.

## 11. Mentés és helyreállítás

Környezettől függően ütemezett adatbázis-mentést, szolgáltatói redundanciát, megőrzési szabályt, korlátozott hozzáférést, helyreállítási tesztet és dokumentált eljárást alkalmazunk. Az ügyfél őrizze meg a saját folytonosságához vagy kötelezettségéhez szükséges exportot.

## 12. Incidenskezelés

A folyamat észlelést és besorolást, korlátozást, vizsgálatot, javítást, helyreállítást, szükséges értesítést és utólagos áttekintést foglal magában. Az értesítési kötelezettséget jog, szerződés és az incidens jellege alapján értékeljük; ügyfél-együttműködésre lehet szükség.

## 13. Adatminimalizálás

Csak észszerűen szükséges adatot kezelünk, minimalizáljuk az AI-környezetet, lehetőség szerint kitakarjuk az érzékeny értéket, korlátozzuk a termelési hozzáférést, elkülönítjük az ügyfél- és nyilvános műszaki adatot, nem tárolunk felesleges kártyaadatot, és határidő után törlünk vagy anonimizálunk.

## 14. AI-biztonság és korlátok

Az AI a már elérhető bizonyítékot magyarázza; nem használ ki önállóan rendszert, nem javít az ügyfél környezetében, nem igazol kompromittálást bizonyíték nélkül, és nem tanúsít megfelelést. A kimenetet felül kell vizsgálni, a környezet pedig vezérelt szerverrétegen halad át.

## 15. Harmadik fél kockázata

Infrastruktúra, adatbázis, e-mail, fizetés, fenyegetési adat, hitelesítés, AI és felügyelet terén kiválasztott szolgáltatóktól függünk, amelyeket kockázat szerint értékelünk. Kiesésük vagy incidensük hatással lehet az OUTSIDE-ra; független szolgáltatás nem garantálható teljesen.

## 16. Az ügyfél felelőssége

Az ügyfél csak engedélyezett célpontot használhat, védenie kell fiókját, API-kulcsát és webhookját, kezelnie kell hozzáférést és integrációt, felül kell vizsgálnia a megállapítást, biztonságosan javítania, frissítenie saját rendszerét, exportot őriznie, gyanús tevékenységet jelentenie és jogot betartania. Az OUTSIDE nem helyettesíti saját védelmét vagy incidenskezelését.

## 17. Felelős sérülékenység-bejelentés

A bejelentést a security@outsideguardian.eu címre küldje leírással, érintett URL-lel vagy komponenssel, reprodukciós lépéssel, biztonságos bizonyítékkal, hatással és elérhetőséggel.

### Mit ne tegyen

Ne férjen hozzá más adatához, ne töltsön le a szükségesnél többet, ne módosítson vagy töröljön, ne hozzon létre tartós hozzáférést, ne telepítsen kártevőt, ne végezzen DoS-t, ne zavarja a termelést, ne terheljen túl automatizálással, ne teszteljen idegen rendszert, és ne tegyen közzé megoldatlan hibát észszerű válaszidő nélkül.

### Jóhiszemű kutatás

Ha jóhiszeműen jár el, minimalizálja a kárt, tiszteletben tartja a magánéletet és a hatókört, gyorsan jelent és észszerű időt ad, törekszünk engedélyezett kutatásként kezelni. Ez nem teszi jogszerűvé a tiltott tevékenységet vagy harmadik fél rendszerének vizsgálatát.

### Nincs automatikus jutalom

Kifejezett írásos bejelentés nélkül nem működtetünk garantált bug bounty programot; a jelentés nem teremt jutalom- vagy költségtérítési jogot.

## 18. Közzétételi folyamat

A hiteles jelentést visszaigazoljuk, értékeljük a hatókört és súlyosságot, szükség esetén további adatot kérünk, enyhítést vagy javítást készítünk és megfelelően koordináljuk a közlést. Az idő a bonyolultságtól és hatástól függ; kockázatnövelő vagy ügyféladatot felfedő részletet nem közlünk.

## 19. Biztonsági dokumentáció

Vállalati ügyfélnek megfelelő titoktartás mellett elérhető architektúra, adatfolyam, hozzáférés, mentés, alvállalkozó, fejlesztés, incidenseljárás és tesztösszefoglaló adható. A dokumentum nem tanúsítvány, hacsak kifejezetten nem állítja.

## 20. Megfelelőségi állítások

Tanúsítványt, auditot vagy szabályozási státuszt csak kifejezetten dokumentált és aktuális esetben állítunk. Az OUTSIDE támogathat biztonsági és megfelelőségi munkát, de használata önmagában nem teremt megfelelést.

## 21. Az oldal módosítása

Az oldalt a szolgáltatás, architektúra, kontrollok és jog változásával frissíthetjük. Az aktuális verziót felülvizsgálati dátummal tesszük közzé.

## 22. Kapcsolat

**VeDomEll s. r. o.** · Alžbetina 55, 040 01 Košice – mestská časť Staré Mesto, Szlovákia

IČO: 52498751 · DIČ: 2121045729 · IČ DPH: SK2121045729 · security@outsideguardian.eu`,
  },
};
