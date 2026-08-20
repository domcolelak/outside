import type { Locale } from "@/lib/i18n/locales";

type TranslatedTerms = { title: string; updated: string; body: string };
type TranslatedLocale = Exclude<Locale, "en">;

export const TERMS_TRANSLATIONS: Record<TranslatedLocale, TranslatedTerms> = {
  sk: {
    title: "Podmienky používania",
    updated: "2026-07-24",
    body: `Tieto podmienky upravujú prístup k službe OUTSIDE vrátane webu outsideguardian.eu, aplikácií, API, reportov a monitoringu, ktoré poskytuje VeDomEll s. r. o. Použitím služby alebo objednaním predplatného s nimi súhlasíte. Ak konáte za organizáciu, potvrdzujete oprávnenie zaviazať ju. Otázky: security@outsideguardian.eu.

## 1. Služba

OUTSIDE je platforma na správu externého útočného povrchu. Podľa plánu môže objavovať verejné aktíva, zhromažďovať technické dôkazy, mapovať vzťahy, vytvárať nálezy a skóre, monitorovať overené domény, tvoriť reporty, vysvetlenia a odporúčania, prepájať integrácie a uchovávať históriu.

## 2. Bezpečnostné informácie, nie záruka

OUTSIDE je podporný nástroj, nie firewall, ochrana koncových bodov, penetračný test ani záruka bezpečnosti. Neprítomnosť nálezu nedokazuje bezpečnosť. Nálezy, skóre, odporúčania a AI výstupy musí pred rozhodnutím posúdiť kvalifikovaná osoba.

## 3. Účty

Musíte uvádzať presné údaje, chrániť prihlasovacie údaje, obmedziť prístup na oprávnené osoby, odstrániť nepotrebných používateľov a hlásiť podozrenie na neoprávnený prístup. Zodpovedáte za aktivitu účtu.

## 4. Oprávnenie posudzovať ciele

Službu smiete použiť iba na domény, systémy a organizácie, ktoré vlastníte, spravujete alebo máte jasné zákonné či zmluvné oprávnenie posudzovať. Na požiadanie musíte oprávnenie preukázať. Verejná dostupnosť sama osebe neoprávňuje na invazívne testovanie.

## 5. Prijateľné používanie

Nesmiete bez oprávnenia pristupovať k systémom, zneužívať zraniteľnosti, získavať perzistenciu, nasadzovať malvér, odčerpávať údaje, zachytávať komunikáciu, narúšať dostupnosť, obchádzať ochrany alebo limity, získavať heslá či kľúče, obťažovať, sledovať, podvádzať, porušovať sankcie, súkromie alebo duševné vlastníctvo, preťažovať službu ani vydávať výstup za dôkaz kompromitácie bez dôkazov.

## 6. Overenie domény a aktívne funkcie

Monitoring, integrácie, citlivé reporty alebo aktívnejšie funkcie môžeme podmieniť overením cez DNS, e-mail, súbor, účet poskytovateľa alebo inú primeranú metódu. Overenie potvrdzuje kontrolu v danom čase, nie neobmedzené povolenie testovať.

## 7. Údaje zákazníka

Zákazník si zachováva vlastníctvo údajov, ktoré odovzdá. Udeľuje nám obmedzené právo ich spracovať na poskytnutie a zabezpečenie služby, prevenciu zneužitia, splnenie zákona a zlepšenie spoľahlivosti pomocou agregovaných alebo anonymizovaných údajov. Zákazník zaručuje potrebné práva a zákonnosť.

## 8. Verejné technické údaje

Verejne pozorovateľné technické údaje môžeme nezávisle získavať z internetu, registrov, CT logov, verejných webov a databáz zraniteľností. Nevlastníme údaje tretích strán a môžu sa na ne vzťahovať ich podmienky.

## 9. Ochrana údajov

Obe strany dodržiavajú platné právo ochrany údajov. Ak konáme ako sprostredkovateľ, možno uzavrieť zmluvu o spracúvaní údajov. Zákazník zodpovedá za zákonnosť použitia, oznámenia, právny základ, požiadavky dotknutých osôb a primerané uchovávanie.

## 10. Predplatné a platby

Poplatky sa spravidla účtujú vopred, predplatné sa automaticky obnovuje, ceny nezahŕňajú dane a prekročenie limitov možno spoplatniť alebo obmedziť. Poplatky sa nevracajú, ak zákon alebo dohoda neurčuje inak. Pri omeškaní môžeme opakovať platbu, obmedziť, pozastaviť alebo ukončiť službu.

## 11. Skúšobné a bezplatné služby

Bezplatné funkcie môžu mať obmedzenia skenov, aktív, histórie, reportov, integrácií, monitoringu a podpory. Môžeme ich meniť alebo ukončiť a údaje po retenčnej lehote vymazať.

## 12. Duševné vlastníctvo

Kód, rozhranie, dizajn, detekčná logika, dokumentácia, ochranné známky, šablóny a technológia OUTSIDE patria VeDomEll s. r. o. alebo poskytovateľom licencií. Podmienky udeľujú iba obmedzené právo službu používať.

## 13. Spätná väzba

Spätnú väzbu môžeme bez obmedzenia a odmeny použiť na zlepšovanie služby, pričom nevzniká povinnosť ju realizovať.

## 14. Služby tretích strán

Integrácie sa riadia vlastnými podmienkami poskytovateľov. Nezodpovedáme za ich dostupnosť, údaje, zmeny API, incidenty ani konfiguráciu zákazníka a integráciu môžeme nahradiť alebo ukončiť.

## 15. Výstupy umelej inteligencie

AI výstup môže byť chybný alebo zastaraný. Nie je dôkazom zneužitia či kompromitácie, právnou radou, certifikáciou súladu ani náhradou odborného posúdenia. Každý krok nápravy musíte pred použitím overiť.

## 16. Zmeny služby

Funkcie môžeme meniť z bezpečnostných, právnych, technických, obchodných alebo protizneužívacích dôvodov. Primerane sa snažíme zásadne neznížiť platené jadro počas predplateného obdobia, okrem nevyhnutných zmien.

## 17. Dostupnosť a údržba

Bez osobitnej SLA nezaručujeme nepretržitú ani bezchybnú prevádzku. Výpadok môže spôsobiť údržba, incident, infraštruktúra, tretia strana, internet, DNS, vyššia moc alebo konfigurácia zákazníka.

## 18. Beta funkcie

Beta a experimentálne funkcie môžu byť neúplné, nepresné, meniť sa bez oznámenia, mať obmedzenú podporu alebo byť ukončené. Používate ich na vlastné riziko.

## 19. Dôvernosť

Neverejné dôverné informácie sa smú použiť iba na zmluvný vzťah, musia sa primerane chrániť a sprístupniť len osobám viazaným mlčanlivosťou. Výnimkou sú verejné, predtým zákonne známe, nezávisle vytvorené alebo zákonne získané informácie a povinné zverejnenie.

## 20. Pozastavenie

Prístup môžeme pozastaviť na zabránenie bezpečnostnej škode, neoprávnenému skenovaniu, zneužitiu, porušeniu zákona alebo podmienok, pri omeškaní platby alebo na ochranu služby a tretích strán. Ak je to možné, umožníme nápravu.

## 21. Ukončenie

Predplatné môžete zrušiť podľa fakturačného postupu. My môžeme ukončiť prístup pri závažnom porušení, bezpečnostnom či právnom riziku, protiprávnosti, strate nevyhnutnej služby tretej strany alebo ukončení produktu. Právo používať zanikne, splatné poplatky zostávajú a údaje možno po retenčnej lehote vymazať.

## 22. Vylúčenie záruk

V maximálnom rozsahu zákona sa služba poskytuje „tak ako je“ a „podľa dostupnosti“. Nezaručujeme úplnosť, presnosť, nepretržitosť, vhodnosť na konkrétny účel, odhalenie každého aktíva či rizika ani zabránenie incidentu. Neobmedzujeme práva, ktoré zákon vylúčiť nedovoľuje.

## 23. Obmedzenie zodpovednosti

V maximálnom rozsahu zákona nezodpovedáme za nepriame a následné škody, stratu zisku, príjmu, podnikania, dobrej povesti, úspor alebo údajov ani za nepodložené spoliehanie sa na nálezy či AI. Celková zodpovednosť neprekročí poplatky za 12 mesiacov pred udalosťou; pri bezplatnej službe 100 USD v ekvivalente. Výnimkou je zodpovednosť, ktorú zákon nedovoľuje obmedziť.

## 24. Odškodnenie

V rozsahu zákona nás zákazník ochráni pred nárokmi tretích strán z neoprávneného posudzovania, nezákonných zákazníckych údajov, porušenia podmienok, porušenia práv, zneužitia nálezov alebo protiprávneho používania.

## 25. Rozhodné právo a spory

Podmienky sa riadia právom príslušným podľa sídla VeDomEll s. r. o. a príslušné sú súdy podľa tohto sídla, ak kogentné právo neurčuje inak. Pred sporom sa strany pokúsia o riešenie písomným oznámením a rokovaním.

## 26. Postúpenie

Zákazník nesmie postúpiť podmienky bez nášho súhlasu okrem oprávnenej podnikovej transakcie s prevzatím podmienok. My ich môžeme postúpiť pri zlúčení, reštrukturalizácii, financovaní alebo predaji služby.

## 27. Oznámenia

Oznámenia môžu byť doručené v službe, e-mailom, na kontaktné údaje účtu alebo zverejnením. Právne oznámenia nám posielajte na security@outsideguardian.eu.

## 28. Zmeny podmienok

Podmienky môžeme aktualizovať. O podstatnej zmene poskytneme primerané oznámenie, ak je potrebné. Pokračovanie po účinnosti znamená prijatie; inak musíte službu prestať používať.

## 29. Všeobecné ustanovenia

Nevymáhateľnosť jedného ustanovenia neovplyvní ostatné a nevymáhanie nie je vzdaním sa práva. Podmienky spolu so zásadami ochrany údajov, objednávkou, predplatným a prípadnou zmluvou o spracúvaní údajov tvoria úplnú dohodu, ak sa písomne nedohodne inak.

## 30. Kontakt

**VeDomEll s. r. o.** · Alžbetina 55, 040 01 Košice – mestská časť Staré Mesto, Slovensko

IČO: 52498751 · DIČ: 2121045729 · IČ DPH: SK2121045729 · security@outsideguardian.eu`,
  },
  cs: {
    title: "Podmínky používání",
    updated: "2026-07-24",
    body: `Tyto podmínky upravují přístup ke službě OUTSIDE včetně webu outsideguardian.eu, aplikací, API, reportů a monitoringu poskytovaných VeDomEll s. r. o. Použitím služby nebo objednáním předplatného s nimi souhlasíte. Jednáte-li za organizaci, potvrzujete oprávnění ji zavázat. Dotazy: security@outsideguardian.eu.

## 1. Služba

OUTSIDE je platforma pro správu externího útočného povrchu. Podle plánu může objevovat veřejná aktiva, shromažďovat technické důkazy, mapovat vztahy, vytvářet nálezy a skóre, monitorovat ověřené domény, tvořit reporty, vysvětlení a doporučení, propojovat integrace a uchovávat historii.

## 2. Bezpečnostní informace, nikoli záruka

OUTSIDE je podpůrný nástroj, nikoli firewall, ochrana koncových bodů, penetrační test ani záruka bezpečnosti. Nepřítomnost nálezu nedokazuje bezpečnost. Nálezy, skóre, doporučení a AI výstupy musí před rozhodnutím posoudit kvalifikovaná osoba.

## 3. Účty

Musíte uvádět přesné údaje, chránit přihlašovací údaje, omezit přístup na oprávněné osoby, odstranit nepotřebné uživatele a hlásit podezření na neoprávněný přístup. Odpovídáte za aktivitu účtu.

## 4. Oprávnění posuzovat cíle

Službu smíte použít pouze na domény, systémy a organizace, které vlastníte, spravujete nebo máte jasné zákonné či smluvní oprávnění posuzovat. Na požádání musíte oprávnění doložit. Veřejná dostupnost sama neopravňuje k invazivnímu testování.

## 5. Přijatelné používání

Nesmíte bez oprávnění přistupovat k systémům, zneužívat zranitelnosti, získávat perzistenci, nasazovat malware, odčerpávat údaje, zachytávat komunikaci, narušovat dostupnost, obcházet ochrany nebo limity, získávat hesla či klíče, obtěžovat, sledovat, podvádět, porušovat sankce, soukromí nebo duševní vlastnictví, přetěžovat službu ani vydávat výstup za důkaz kompromitace bez důkazů.

## 6. Ověření domény a aktivní funkce

Monitoring, integrace, citlivé reporty nebo aktivnější funkce můžeme podmínit ověřením přes DNS, e-mail, soubor, účet poskytovatele nebo jinou přiměřenou metodu. Ověření potvrzuje kontrolu v daném čase, nikoli neomezené povolení testovat.

## 7. Údaje zákazníka

Zákazník si ponechává vlastnictví předaných údajů a uděluje nám omezené právo je zpracovat k poskytnutí a zabezpečení služby, prevenci zneužití, splnění zákona a zlepšení spolehlivosti pomocí agregovaných či anonymizovaných dat. Zákazník zaručuje potřebná práva a zákonnost.

## 8. Veřejné technické údaje

Veřejně pozorovatelné technické údaje můžeme nezávisle získávat z internetu, registrů, CT logů, veřejných webů a databází zranitelností. Nevlastníme údaje třetích stran a mohou se na ně vztahovat jejich podmínky.

## 9. Ochrana údajů

Obě strany dodržují platné právo ochrany údajů. Jednáme-li jako zpracovatel, lze uzavřít smlouvu o zpracování. Zákazník odpovídá za zákonnost použití, oznámení, právní základ, požadavky subjektů údajů a přiměřené uchovávání.

## 10. Předplatné a platby

Poplatky se zpravidla účtují předem, předplatné se automaticky obnovuje, ceny nezahrnují daně a překročení limitů lze zpoplatnit nebo omezit. Poplatky se nevracejí, neurčí-li zákon či dohoda jinak. Při prodlení můžeme opakovat platbu, omezit, pozastavit nebo ukončit službu.

## 11. Zkušební a bezplatné služby

Bezplatné funkce mohou mít omezení skenů, aktiv, historie, reportů, integrací, monitoringu a podpory. Můžeme je změnit či ukončit a údaje po retenční lhůtě smazat.

## 12. Duševní vlastnictví

Kód, rozhraní, design, detekční logika, dokumentace, ochranné známky, šablony a technologie OUTSIDE patří VeDomEll s. r. o. nebo poskytovatelům licencí. Podmínky udělují pouze omezené právo službu používat.

## 13. Zpětná vazba

Zpětnou vazbu můžeme bez omezení a odměny použít ke zlepšování služby, aniž by vznikla povinnost ji realizovat.

## 14. Služby třetích stran

Integrace se řídí vlastními podmínkami poskytovatelů. Neodpovídáme za jejich dostupnost, data, změny API, incidenty ani konfiguraci zákazníka a integraci můžeme nahradit nebo ukončit.

## 15. Výstupy umělé inteligence

AI výstup může být chybný či zastaralý. Není důkazem zneužití či kompromitace, právní radou, certifikací souladu ani náhradou odborného posouzení. Každý krok nápravy musíte před použitím ověřit.

## 16. Změny služby

Funkce můžeme měnit z bezpečnostních, právních, technických, obchodních nebo protizneužívacích důvodů. Přiměřeně se snažíme zásadně nesnížit placené jádro během předplaceného období, kromě nezbytných změn.

## 17. Dostupnost a údržba

Bez zvláštní SLA nezaručujeme nepřetržitý ani bezchybný provoz. Výpadek může způsobit údržba, incident, infrastruktura, třetí strana, internet, DNS, vyšší moc nebo konfigurace zákazníka.

## 18. Beta funkce

Beta a experimentální funkce mohou být neúplné, nepřesné, měnit se bez oznámení, mít omezenou podporu nebo být ukončeny. Používáte je na vlastní riziko.

## 19. Důvěrnost

Neveřejné důvěrné informace smějí být použity jen pro smluvní vztah, musí být přiměřeně chráněny a zpřístupněny pouze osobám vázaným mlčenlivostí. Výjimkou jsou veřejné, dříve zákonně známé, nezávisle vytvořené či zákonně získané informace a povinné zveřejnění.

## 20. Pozastavení

Přístup můžeme pozastavit k zabránění bezpečnostní škodě, neoprávněnému skenování, zneužití, porušení zákona či podmínek, při prodlení platby nebo k ochraně služby a třetích stran. Je-li to možné, umožníme nápravu.

## 21. Ukončení

Předplatné můžete zrušit podle fakturačního postupu. My můžeme ukončit přístup při závažném porušení, bezpečnostním či právním riziku, protiprávnosti, ztrátě nutné služby třetí strany nebo ukončení produktu. Právo používat zanikne, splatné poplatky zůstávají a data lze po retenční lhůtě smazat.

## 22. Vyloučení záruk

V maximálním rozsahu zákona se služba poskytuje „tak jak je“ a „podle dostupnosti“. Nezaručujeme úplnost, přesnost, nepřetržitost, vhodnost pro konkrétní účel, odhalení každého aktiva či rizika ani zabránění incidentu. Neomezujeme práva, která zákon vyloučit nedovoluje.

## 23. Omezení odpovědnosti

V maximálním rozsahu zákona neodpovídáme za nepřímé a následné škody, ztrátu zisku, příjmu, podnikání, dobré pověsti, úspor či dat ani za nepodložené spoléhání na nálezy nebo AI. Celková odpovědnost nepřekročí poplatky za 12 měsíců před událostí; u bezplatné služby ekvivalent 100 USD. Výjimkou je odpovědnost, kterou zákon nedovoluje omezit.

## 24. Odškodnění

V rozsahu zákona nás zákazník ochrání před nároky třetích stran z neoprávněného posuzování, nezákonných zákaznických dat, porušení podmínek, porušení práv, zneužití nálezů či protiprávního používání.

## 25. Rozhodné právo a spory

Podmínky se řídí právem příslušným podle sídla VeDomEll s. r. o. a příslušné jsou soudy podle tohoto sídla, neurčí-li kogentní právo jinak. Před sporem se strany pokusí o řešení písemným oznámením a jednáním.

## 26. Postoupení

Zákazník nesmí podmínky postoupit bez našeho souhlasu kromě oprávněné podnikové transakce s převzetím podmínek. My je můžeme postoupit při fúzi, restrukturalizaci, financování nebo prodeji služby.

## 27. Oznámení

Oznámení mohou být doručena ve službě, e-mailem, na kontaktní údaje účtu nebo zveřejněním. Právní oznámení nám posílejte na security@outsideguardian.eu.

## 28. Změny podmínek

Podmínky můžeme aktualizovat. O podstatné změně poskytneme přiměřené oznámení, je-li nutné. Pokračování po účinnosti znamená přijetí; jinak musíte službu přestat používat.

## 29. Obecná ustanovení

Nevymahatelnost jednoho ustanovení neovlivní ostatní a nevymáhání není vzdáním se práva. Podmínky spolu se zásadami ochrany údajů, objednávkou, předplatným a případnou zpracovatelskou smlouvou tvoří úplnou dohodu, není-li písemně dohodnuto jinak.

## 30. Kontakt

**VeDomEll s. r. o.** · Alžbetina 55, 040 01 Košice – mestská časť Staré Mesto, Slovensko

IČO: 52498751 · DIČ: 2121045729 · IČ DPH: SK2121045729 · security@outsideguardian.eu`,
  },
  pl: {
    title: "Warunki korzystania z usługi",
    updated: "2026-07-24",
    body: `Niniejsze warunki regulują dostęp do OUTSIDE, w tym outsideguardian.eu, aplikacji, API, raportów i monitoringu świadczonych przez VeDomEll s. r. o. Korzystając z usługi lub zamawiając subskrypcję, akceptujesz warunki. Działając za organizację, potwierdzasz prawo do jej związania. Pytania: security@outsideguardian.eu.

## 1. Usługa

OUTSIDE zarządza zewnętrzną powierzchnią ataku. Zależnie od planu może wykrywać publiczne zasoby, zbierać dowody techniczne, mapować relacje, tworzyć ustalenia i wyniki, monitorować zweryfikowane domeny, generować raporty, wyjaśnienia i zalecenia, obsługiwać integracje i historię.

## 2. Informacja o bezpieczeństwie, nie gwarancja

OUTSIDE jest narzędziem wspierającym decyzje, a nie firewallem, ochroną punktów końcowych, testem penetracyjnym ani gwarancją bezpieczeństwa. Brak ustalenia nie dowodzi bezpieczeństwa. Ustalenia, wyniki, zalecenia i treści AI wymagają oceny wykwalifikowanej osoby.

## 3. Konta

Należy podawać prawidłowe dane, chronić dane logowania, ograniczać dostęp do osób uprawnionych, usuwać zbędnych użytkowników i zgłaszać podejrzenie nieautoryzowanego dostępu. Użytkownik odpowiada za aktywność konta.

## 4. Uprawnienie do oceny celów

Usługi wolno używać wyłącznie wobec domen, systemów i organizacji, których jesteś właścicielem, administratorem lub masz wyraźne prawne bądź umowne upoważnienie do oceny. Na żądanie należy je wykazać. Publiczna dostępność nie uprawnia do inwazyjnych testów.

## 5. Dopuszczalne użycie

Nie wolno bez upoważnienia uzyskiwać dostępu, wykorzystywać podatności, utrzymywać dostępu, instalować złośliwego oprogramowania, pozyskiwać danych, przechwytywać komunikacji, zakłócać dostępności, obchodzić zabezpieczeń i limitów, zdobywać haseł lub kluczy, nękać, śledzić, oszukiwać, naruszać sankcji, prywatności czy praw własności, przeciążać usługi ani przedstawiać wyniku jako dowodu naruszenia bez dowodów.

## 6. Weryfikacja domeny i aktywne funkcje

Monitoring, integracje, wrażliwe raporty lub bardziej aktywne funkcje mogą wymagać weryfikacji przez DNS, e-mail, plik, konto dostawcy lub inną metodę. Weryfikacja potwierdza kontrolę w danym momencie, a nie nieograniczone prawo do testów.

## 7. Dane klienta

Klient zachowuje własność przekazanych danych i udziela nam ograniczonego prawa do ich przetwarzania w celu świadczenia i ochrony usługi, zapobiegania nadużyciom, zgodności z prawem i poprawy niezawodności na danych zagregowanych lub zanonimizowanych. Klient zapewnia wymagane prawa i legalność.

## 8. Publiczne dane techniczne

Możemy niezależnie uzyskiwać publicznie obserwowalne dane techniczne z internetu, rejestrów, logów CT, publicznych witryn i baz podatności. Nie rościmy praw własności do danych stron trzecich; mogą obowiązywać ich warunki.

## 9. Ochrona danych

Obie strony przestrzegają właściwego prawa. Gdy działamy jako podmiot przetwarzający, można zawrzeć umowę powierzenia. Klient odpowiada za legalność użycia, informacje, podstawę prawną, żądania osób i właściwą retencję.

## 10. Subskrypcje i płatności

Opłaty są zwykle pobierane z góry, subskrypcja odnawia się automatycznie, ceny nie obejmują podatków, a przekroczenie limitów może być płatne lub ograniczone. Opłaty nie podlegają zwrotowi, chyba że prawo lub umowa stanowi inaczej. Przy zaległości możemy ponowić płatność, ograniczyć, zawiesić lub zakończyć usługę.

## 11. Okresy próbne i usługi bezpłatne

Bezpłatne funkcje mogą ograniczać skany, zasoby, historię, raporty, integracje, monitoring i wsparcie. Możemy je zmienić lub zakończyć, a dane usunąć po okresie retencji.

## 12. Własność intelektualna

Kod, interfejs, projekt, logika detekcji, dokumentacja, znaki, szablony i technologia OUTSIDE należą do VeDomEll s. r. o. lub licencjodawców. Warunki przyznają jedynie ograniczone prawo korzystania.

## 13. Informacje zwrotne

Możemy bez ograniczeń i wynagrodzenia wykorzystywać opinie do ulepszania usługi, bez obowiązku ich wdrożenia.

## 14. Usługi stron trzecich

Integracje podlegają warunkom dostawców. Nie odpowiadamy za ich dostępność, dane, zmiany API, incydenty ani konfigurację klienta i możemy integrację zastąpić lub zakończyć.

## 15. Wyniki sztucznej inteligencji

Treści AI mogą być błędne lub nieaktualne. Nie stanowią dowodu wykorzystania czy naruszenia, porady prawnej, certyfikatu zgodności ani zamiennika oceny specjalisty. Każdy krok naprawczy należy zweryfikować przed wdrożeniem.

## 16. Zmiany usługi

Możemy zmieniać funkcje ze względów bezpieczeństwa, prawa, techniki, biznesu lub przeciwdziałania nadużyciom. Rozsądnie dążymy do nieograniczania istotnych płatnych funkcji w opłaconym okresie, poza zmianami koniecznymi.

## 17. Dostępność i utrzymanie

Bez odrębnej SLA nie gwarantujemy pracy ciągłej ani bezbłędnej. Przerwę może spowodować konserwacja, incydent, infrastruktura, strona trzecia, internet, DNS, siła wyższa lub konfiguracja klienta.

## 18. Funkcje beta

Funkcje beta i eksperymentalne mogą być niepełne, niedokładne, zmieniane bez zapowiedzi, mieć ograniczone wsparcie lub zostać zakończone. Używasz ich na własne ryzyko.

## 19. Poufność

Niepubliczne informacje poufne można wykorzystywać tylko w relacji umownej, należy je rozsądnie chronić i udostępniać wyłącznie osobom związanym poufnością. Wyjątkiem są dane publiczne, wcześniej legalnie znane, niezależnie opracowane, legalnie uzyskane i ujawnienia wymagane prawem.

## 20. Zawieszenie

Możemy zawiesić dostęp, by zapobiec szkodzie, nieautoryzowanemu skanowaniu, nadużyciu, naruszeniu prawa lub warunków, przy zaległości albo dla ochrony usługi i stron trzecich. Gdy to możliwe, umożliwimy usunięcie naruszenia.

## 21. Rozwiązanie

Subskrypcję można anulować zgodnie z procesem rozliczeniowym. My możemy zakończyć dostęp przy istotnym naruszeniu, ryzyku bezpieczeństwa lub prawnym, bezprawności, utracie niezbędnej usługi albo zakończeniu produktu. Prawo użycia ustaje, należne opłaty pozostają, a dane mogą zostać usunięte po retencji.

## 22. Wyłączenie gwarancji

W maksymalnym zakresie prawa usługa jest dostarczana „w stanie, w jakim jest” i „w miarę dostępności”. Nie gwarantujemy kompletności, dokładności, ciągłości, przydatności do celu, wykrycia każdego zasobu lub ryzyka ani zapobieżenia incydentowi. Nie wyłączamy praw, których nie można wyłączyć.

## 23. Ograniczenie odpowiedzialności

W maksymalnym zakresie prawa nie odpowiadamy za szkody pośrednie i następcze, utratę zysku, przychodu, biznesu, renomy, oszczędności lub danych ani bezpodstawne poleganie na ustaleniach czy AI. Łączna odpowiedzialność nie przekroczy opłat z 12 miesięcy przed zdarzeniem; przy usłudze bezpłatnej równowartości 100 USD. Wyjątkiem jest odpowiedzialność, której prawo nie pozwala ograniczyć.

## 24. Odszkodowanie

W granicach prawa klient zabezpieczy nas przed roszczeniami stron trzecich wynikającymi z nieautoryzowanej oceny, bezprawnych danych klienta, naruszenia warunków lub praw, nadużycia ustaleń bądź nielegalnego użycia.

## 25. Prawo właściwe i spory

Warunki podlegają prawu właściwemu dla siedziby VeDomEll s. r. o., a właściwe są sądy tej siedziby, chyba że bezwzględnie obowiązujące prawo stanowi inaczej. Przed sporem strony podejmą próbę rozwiązania go pisemnie i w rozmowach.

## 26. Przeniesienie

Klient nie może przenieść warunków bez naszej zgody poza dozwoloną transakcją biznesową z ich przejęciem. My możemy je przenieść przy połączeniu, restrukturyzacji, finansowaniu lub sprzedaży usługi.

## 27. Powiadomienia

Powiadomienia mogą być przekazywane w usłudze, e-mailem, na dane konta lub przez publikację. Powiadomienia prawne należy wysyłać na security@outsideguardian.eu.

## 28. Zmiany warunków

Możemy aktualizować warunki. O istotnej zmianie powiadomimy z rozsądnym wyprzedzeniem, jeśli jest to wymagane. Dalsze użycie oznacza akceptację; w przeciwnym razie należy zaprzestać korzystania.

## 29. Postanowienia ogólne

Niewykonalność jednego postanowienia nie wpływa na pozostałe, a brak egzekwowania nie oznacza zrzeczenia się prawa. Warunki, polityka prywatności, zamówienie, zasady subskrypcji i ewentualna umowa powierzenia stanowią całość umowy, chyba że pisemnie uzgodniono inaczej.

## 30. Kontakt

**VeDomEll s. r. o.** · Alžbetina 55, 040 01 Košice – mestská časť Staré Mesto, Słowacja

IČO: 52498751 · DIČ: 2121045729 · IČ DPH: SK2121045729 · security@outsideguardian.eu`,
  },
  hu: {
    title: "Felhasználási feltételek",
    updated: "2026-07-24",
    body: `Ezek a feltételek szabályozzák a VeDomEll s. r. o. által nyújtott OUTSIDE szolgáltatás, az outsideguardian.eu, az alkalmazások, API-k, jelentések és figyelés használatát. A szolgáltatás használatával vagy előfizetéssel elfogadja őket. Ha szervezet nevében jár el, kijelenti, hogy jogosult azt kötelezni. Kérdés: security@outsideguardian.eu.

## 1. A szolgáltatás

Az OUTSIDE külső támadási felületet kezel. A csomagtól függően nyilvános eszközöket derít fel, műszaki bizonyítékot gyűjt, kapcsolatot térképez, megállapítást és pontszámot készít, ellenőrzött domaint figyel, jelentést, magyarázatot és javaslatot generál, integrációt kapcsol és előzményt tárol.

## 2. Biztonsági információ, nem garancia

Az OUTSIDE döntéstámogató eszköz, nem tűzfal, végpontvédelem, behatolási teszt vagy biztonsági garancia. A megállapítás hiánya nem bizonyít biztonságot. A megállapításokat, pontszámokat, javaslatokat és AI-kimenetet döntés előtt képzett személynek kell értékelnie.

## 3. Fiókok

Pontos adatot kell megadni, védeni kell a hitelesítő adatokat, csak jogosult személynek szabad hozzáférést adni, a felesleges felhasználót el kell távolítani, és jelezni kell a jogosulatlan hozzáférés gyanúját. A fiók tevékenységéért Ön felel.

## 4. Jogosultság célpontok vizsgálatára

Csak olyan domaint, rendszert és szervezetet vizsgálhat, amelyet birtokol vagy kezel, illetve amelyre egyértelmű jogi vagy szerződéses engedélye van. Kérésre ezt igazolnia kell. A nyilvános elérhetőség önmagában nem engedélyez behatoló tesztet.

## 5. Elfogadható használat

Engedély nélkül tilos rendszerhez hozzáférni, sérülékenységet kihasználni, tartós hozzáférést létrehozni, kártevőt telepíteni, adatot kinyerni, kommunikációt elfogni, elérhetőséget zavarni, védelmet vagy korlátot megkerülni, jelszót vagy kulcsot megszerezni, zaklatni, megfigyelni, csalni, szankciót, magánéletet vagy szellemi tulajdont sérteni, a szolgáltatást túlterhelni vagy bizonyíték nélkül kompromittálást állítani.

## 6. Domain-ellenőrzés és aktív funkciók

A figyelést, integrációt, érzékeny jelentést vagy aktívabb funkciót DNS-, e-mail-, fájl-, szolgáltatói fiók- vagy más megfelelő ellenőrzéshez köthetjük. Ez az adott időpontbeli ellenőrzést igazolja, nem korlátlan vizsgálati jogot.

## 7. Ügyféladat

Az ügyfél megtartja az átadott adat tulajdonjogát, és korlátozott jogot ad annak feldolgozására a szolgáltatás nyújtásához és védelméhez, visszaélés megelőzéséhez, jogszabály teljesítéséhez és összesített vagy anonimizált adatokon alapuló megbízhatóság-javításhoz. Az ügyfél szavatolja a szükséges jogokat és jogszerűséget.

## 8. Nyilvános műszaki adatok

Nyilvánosan megfigyelhető műszaki adatot önállóan szerezhetünk az internetről, nyilvántartásból, CT-naplóból, nyilvános webhelyről és sérülékenységi adatbázisból. Harmadik fél adata felett nem állítunk tulajdont; saját feltételei alkalmazandók.

## 9. Adatvédelem

Mindkét fél betartja az alkalmazandó adatvédelmi jogot. Adatfeldolgozói szerepünkhöz külön megállapodás köthető. Az ügyfél felel a használat jogszerűségéért, tájékoztatásért, jogalapért, érintetti kérelemért és megfelelő megőrzésért.

## 10. Előfizetés és fizetés

A díj rendszerint előre fizetendő, az előfizetés automatikusan megújul, az ár nem tartalmaz adót, a keret túllépése pedig díjazható vagy korlátozható. A díj nem visszatéríthető, kivéve ha jogszabály vagy megállapodás másként rendelkezik. Késedelemnél újra megkísérelhetjük a terhelést, korlátozhatunk, felfüggeszthetünk vagy megszüntethetünk.

## 11. Próba és ingyenes szolgáltatás

Az ingyenes funkció korlátozhatja a vizsgálatot, eszközt, előzményt, jelentést, integrációt, figyelést és támogatást. Megváltoztathatjuk vagy megszüntethetjük, az adatot pedig a megőrzési idő után törölhetjük.

## 12. Szellemi tulajdon

Az OUTSIDE kódja, felülete, terve, észlelési logikája, dokumentációja, védjegye, sablonja és technológiája a VeDomEll s. r. o. vagy licencadója tulajdona. Csak korlátozott használati jogot kap.

## 13. Visszajelzés

A visszajelzést korlátozás és díjazás nélkül használhatjuk fejlesztésre, megvalósítási kötelezettség nélkül.

## 14. Harmadik fél szolgáltatása

Az integrációra a szolgáltató feltételei érvényesek. Nem felelünk elérhetőségéért, adatáért, API-változásáért, incidenséért vagy az ügyfél beállításáért, és az integrációt lecserélhetjük vagy megszüntethetjük.

## 15. Mesterséges intelligencia kimenete

Az AI-kimenet hibás vagy elavult lehet. Nem bizonyít kihasználást vagy kompromittálást, nem jogi tanács, megfelelőségi tanúsítvány vagy szakértői felülvizsgálat helyettesítője. Minden javítást ellenőrizni kell alkalmazás előtt.

## 16. A szolgáltatás változása

Biztonsági, jogi, műszaki, üzleti vagy visszaélés-megelőzési okból funkciót módosíthatunk. Észszerűen törekszünk arra, hogy az előre fizetett időszak alapvető fizetős funkcióit ne csökkentsük lényegesen, kivéve szükséges változtatásnál.

## 17. Elérhetőség és karbantartás

Külön SLA nélkül nem garantálunk folyamatos vagy hibamentes működést. Kiesést karbantartás, incidens, infrastruktúra, harmadik fél, internet, DNS, vis maior vagy ügyfélbeállítás okozhat.

## 18. Béta funkciók

A béta vagy kísérleti funkció hiányos, pontatlan, értesítés nélkül változó, korlátozottan támogatott vagy megszüntethető. Saját kockázatára használja.

## 19. Titoktartás

A nem nyilvános bizalmas információ csak a szerződéses kapcsolathoz használható, észszerűen védendő, és csak titoktartásra kötelezett személynek adható át. Kivétel a nyilvános, korábban jogszerűen ismert, önállóan létrehozott vagy jogszerűen megszerzett adat és a kötelező közlés.

## 20. Felfüggesztés

Hozzáférést függeszthetünk fel biztonsági kár, jogosulatlan vizsgálat, visszaélés, jog- vagy feltételsértés megelőzésére, fizetési késedelemnél, illetve a szolgáltatás és harmadik fél védelmére. Ha lehetséges, javítási lehetőséget adunk.

## 21. Megszüntetés

Az előfizetés a számlázási folyamat szerint mondható le. Mi lényeges szerződésszegés, biztonsági vagy jogi kockázat, jogellenesség, szükséges külső szolgáltatás elvesztése vagy a termék megszüntetése miatt zárhatjuk le. A használati jog megszűnik, az esedékes díj fennmarad, az adat a megőrzés után törölhető.

## 22. Szavatosság kizárása

A jog által megengedett legnagyobb mértékben a szolgáltatás „adott állapotban” és „elérhetőség szerint” áll rendelkezésre. Nem garantálunk teljességet, pontosságot, folyamatosságot, meghatározott célra való alkalmasságot, minden eszköz vagy kockázat észlelését vagy incidens megelőzését. A ki nem zárható jogokat nem korlátozzuk.

## 23. Felelősség korlátozása

A jog által megengedett legnagyobb mértékben nem felelünk közvetett vagy következményi kárért, nyereség-, bevétel-, üzlet-, hírnév-, megtakarítás- vagy adatvesztésért, illetve megállapításra vagy AI-ra való megalapozatlan támaszkodásért. Az összes felelősség legfeljebb az eseményt megelőző 12 hónap díja; ingyenes szolgáltatásnál 100 USD megfelelője. Kivétel a jogilag nem korlátozható felelősség.

## 24. Kártalanítás

A jog keretei között az ügyfél mentesít minket a jogosulatlan vizsgálatból, jogellenes ügyféladatból, feltétel- vagy jogsértésből, megállapítás-visszaélésből vagy illegális használatból eredő harmadik fél igénye alól.

## 25. Irányadó jog és jogvita

A feltételekre a VeDomEll s. r. o. székhelye szerinti jog, a jogvitára az ott illetékes bíróság vonatkozik, ha kötelező jog másként nem rendelkezik. Eljárás előtt a felek írásban és tárgyalással próbálnak megegyezni.

## 26. Átruházás

Az ügyfél hozzájárulásunk nélkül nem ruházhatja át a feltételeket, kivéve megengedett vállalati tranzakciót azok átvállalásával. Mi egyesülés, átszervezés, finanszírozás vagy szolgáltatásértékesítés során átruházhatjuk.

## 27. Értesítések

Értesítés a szolgáltatásban, e-mailben, a fiók elérhetőségére vagy közzététellel adható. Jogi értesítést a security@outsideguardian.eu címre kell küldeni.

## 28. A feltételek módosítása

A feltételeket frissíthetjük. Lényeges változásról szükség esetén észszerű értesítést adunk. A hatálybalépés utáni használat elfogadást jelent; ellenkező esetben abba kell hagyni a használatot.

## 29. Általános rendelkezések

Egy rendelkezés kikényszeríthetetlensége nem érinti a többit, a végrehajtás elmulasztása nem jogról lemondás. E feltételek, az adatvédelmi szabályzat, a megrendelés, előfizetési feltételek és esetleges adatfeldolgozási megállapodás alkotják a teljes megállapodást, ha írásban másként nem egyezünk meg.

## 30. Kapcsolat

**VeDomEll s. r. o.** · Alžbetina 55, 040 01 Košice – mestská časť Staré Mesto, Szlovákia

IČO: 52498751 · DIČ: 2121045729 · IČ DPH: SK2121045729 · security@outsideguardian.eu`,
  },
};
