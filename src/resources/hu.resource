// Ham Diploma Publisher — magyar nyelvi fájl
// Kulcs : Érték formátum, pont-szeparált hierarchikus kulcsokkal.
// Új szöveg felvételekor MINDHÁROM resource fájlba (hu/en/de) fel kell venni.

app.name : Ham Diploma Publisher

menu.home : Főoldal
menu.diplomas : Diplomák
menu.contacts : Kapcsolatok
menu.account : Fiók
menu.profile : Profilom
menu.my.submissions : Beadványaim
menu.admin : Adminisztráció
menu.admin.users : Felhasználók
menu.login : Bejelentkezés
menu.register : Regisztráció
menu.logout : Kijelentkezés
menu.language : Nyelv

btn.cancel : Mégsem

home.intro : Rádióamatőr diplomák (oklevelek) publikálása és igénylése egy helyen.

contacts.title : Kapcsolatok
contacts.empty : Ez az oldal jelenleg üres — a tartalmat a manager a Beállítások oldalon tudja feltölteni.

// --- Hibaüzenetek ---
error.password.invalid : A jelszó nem felel meg a követelményeknek (min. 12 karakter, kis- és nagybetű, szám, speciális karakter).
error.password.mismatch : A két jelszó nem egyezik.
error.email.taken : Ez az e-mail cím már regisztrálva van.
error.captcha.invalid : Helytelen válasz az ellenőrző kérdésre, vagy a kérdés lejárt — kérjük, próbálja újra.
error.internal : Belső hiba történt. Kérjük, próbálja újra később.
error.login.invalid : Hibás e-mail cím vagy jelszó.
error.login.notverified : A fiók még nincs megerősítve — nézze meg az e-mail postafiókját.
error.login.disabled : Ez a fiók tiltva van.
error.reset.invalid : A link érvénytelen vagy lejárt.
error.network : Hálózati hiba történt. Kérjük, próbálja újra.
error.mfa.invalid : A folyamat érvénytelen vagy lejárt, kérjük, jelentkezzen be újra.
error.mfa.code : Hibás kód.
error.mfa.required : A kétfaktoros hitelesítés kötelező a fiókjához, nem kapcsolható ki — csak a módszer módosítható.
error.user.cannot_disable_sa : Superadmin fiók nem tiltható.

// --- Regisztráció ---
register.title : Regisztráció
register.email.label : E-mail cím
register.password.label : Jelszó
register.password.confirm.label : Jelszó megerősítése
register.callsign.label : Hívójel
register.firstname.label : Keresztnév
register.lastname.label : Vezetéknév
register.country.label : Ország
register.street.label : Utca, házszám
register.city.label : Város
register.zip.label : Irányítószám
register.submit : Regisztráció
register.success.title : Sikeres regisztráció
register.success.text : Megerősítő e-mailt küldtünk a megadott címre. Kérjük, kattintson a benne lévő linkre a fiók aktiválásához.
register.have.account : Már van fiókja?
register.password.rules.length : legalább 12 karakter
register.password.rules.lower : kisbetű
register.password.rules.upper : nagybetű
register.password.rules.digit : szám
register.password.rules.special : speciális karakter
register.captcha.label : Rádióamatőr-ellenőrzés
register.captcha.question : Hány méteres amatőrsávba esik a {0} kHz?
register.captcha.loading : Kérdés betöltése…
register.captcha.reload : Másik kérdés

// --- Bejelentkezés ---
login.title : Bejelentkezés
login.email.label : E-mail cím
login.password.label : Jelszó
login.submit : Bejelentkezés
login.forgot.link : Elfelejtett jelszó
login.register.link : Nincs még fiókja? Regisztráljon itt.
login.verify.ok : A fiókja megerősítve. Most már bejelentkezhet.
login.verify.invalid : A megerősítő link érvénytelen vagy lejárt.

// --- Elfelejtett jelszó ---
forgot.title : Elfelejtett jelszó
forgot.email.label : E-mail cím
forgot.submit : Küldés
forgot.sent.text : Ha az e-mail cím szerepel a rendszerünkben, hamarosan e-mailt kap a jelszó visszaállításához.
forgot.back.link : Vissza a bejelentkezéshez

// --- Jelszó visszaállítása ---
reset.title : Új jelszó megadása
reset.password.label : Új jelszó
reset.password.confirm.label : Új jelszó megerősítése
reset.submit : Jelszó mentése
reset.success.text : A jelszó megváltozott. Most már bejelentkezhet az új jelszóval.

// --- Saját fiók ---
account.title : Fiókom
account.email.label : E-mail cím
account.callsign.label : Hívójel
account.firstname.label : Keresztnév
account.lastname.label : Vezetéknév
account.country.label : Ország
account.street.label : Utca, házszám
account.city.label : Város
account.zip.label : Irányítószám
account.language.label : Nyelv
account.password.section : Jelszó módosítása
account.password.new.label : Új jelszó
account.password.confirm.label : Új jelszó megerősítése
account.password.hint : Csak akkor töltse ki, ha módosítani szeretné a jelszavát.
account.submit : Mentés
account.saved : A módosítások elmentve.
account.mfa.section : Kétfaktoros hitelesítés (MFA)
account.mfa.status.enabled : Bekapcsolva
account.mfa.status.disabled : Kikapcsolva
account.mfa.enable : MFA bekapcsolása
account.mfa.change_method : Módszer módosítása
account.mfa.disable : MFA kikapcsolása
account.mfa.saved : A kétfaktoros hitelesítés beállítva.

// --- E-mail sablonok ---
email.greeting : Üdvözöljük,
email.footer : Ez egy automatikus üzenet, kérjük, ne válaszoljon rá.
email.verify.subject : Erősítse meg a fiókját
email.verify.intro : Köszönjük a regisztrációt! Kérjük, kattintson az alábbi gombra a fiókja aktiválásához.
email.verify.btn : Fiók megerősítése
email.forgot.subject : Jelszó visszaállítása
email.forgot.intro : Jelszó-visszaállítási kérelmet kaptunk a fiókjához. Kattintson az alábbi gombra az új jelszó megadásához.
email.forgot.btn : Új jelszó megadása
email.mfa.subject : Bejelentkezési kód
email.mfa.ttl : A kód {0} percig érvényes.

// --- MFA (kétfaktoros hitelesítés) ---
mfa.setup.title : Kétfaktoros hitelesítés beállítása
mfa.setup.intro : A rendszergazda kötelezővé tette a kétfaktoros hitelesítést a fiókjához. Válasszon módszert:
mfa.setup.method.email : E-mail kód
mfa.setup.method.totp : Authenticator alkalmazás (pl. Google Authenticator)
mfa.setup.email.sent : Elküldtük a megerősítő kódot a fiókjához tartozó e-mail címre.
mfa.setup.totp.intro : Olvassa be az alábbi QR-kódot egy authenticator alkalmazással, vagy adja meg kézzel a kulcsot, majd írja be az alkalmazás által mutatott 6 jegyű kódot.
mfa.setup.totp.secret.label : Kulcs (kézi megadáshoz)
mfa.code.label : 6 jegyű kód
mfa.code.submit : Megerősítés
mfa.verify.title : Kétfaktoros azonosítás
mfa.verify.intro.email : Elküldtünk egy kódot e-mailben a bejelentkezéshez.
mfa.verify.intro.totp : Adja meg az authenticator alkalmazásban mutatott kódot.

// --- Diploma admin CRUD ---
menu.admin.diplomas : Diplomák kezelése

diplomas.admin.title : Diplomák
diplomas.admin.new : Új diploma
diplomas.admin.col.name : Név
diplomas.admin.col.type : Típus
diplomas.admin.col.mode : Mód
diplomas.admin.col.status : Állapot
diplomas.admin.col.created : Létrehozva
diplomas.admin.col.manager : Felelős manager
diplomas.admin.empty : Még nincs egyetlen diploma sem.
diplomas.admin.delete.confirm : Biztosan törli a(z) "{0}" diplomát? Ez nem vonható vissza.

diplomas.tab.basic : Alapadatok
diplomas.tab.rules : Szabályok
diplomas.tab.challenge : Kihívás
diplomas.tab.payment : Fizetés
diplomas.tab.overlay : Elrendezés

diplomas.name.label : Diploma neve
diplomas.description.label : Leírás

diplomas.type.label : Diploma típusa
diplomas.type.standard : Standard (napló feltöltése alapján)
diplomas.type.challenge : Kihívás (jelentkezés + körönkénti sorsolás)
diplomas.type.help : Standard diplománál a rádióamatőr egy naplót tölt fel, amit a rendszer a Szabályok fülön beállított feltételek szerint ellenőriz. Kihívás diplománál jelentkezés után a rendszer köröket sorsol egy előre felvett listából (pl. ország/hívójel/átjátszó), lásd a Kihívás fület.
diplomas.type.standard.short : Standard
diplomas.type.challenge.short : Kihívás
diplomas.deadline.label : Időzítés
diplomas.deadline.continuous : Folyamatos
diplomas.deadline.fixed : Határidős
diplomas.deadline.date.label : Határidő dátuma
diplomas.status.label : Állapot
diplomas.status.draft : Piszkozat
diplomas.status.active : Aktív
diplomas.status.archived : Archivált
diplomas.serial.start.label : Sorszámozás kezdete

diplomas.manager.label : Felelős manager
diplomas.manager.none : — nincs kijelölve —
diplomas.manager.help : Melyik manager felelős ezért a diplomáért — ez a diploma-listában is látszik, hogy a többi admin tudja, kit kell keresni kérdés esetén.

diplomas.blank.label : Biankó oklevél kép
diplomas.blank.help : Ez a kép jelenik meg (vízjellel) a publikus előnézeten, és ez az alapja a PDF oklevélnek is.
diplomas.blank.choose : Fájl kiválasztása
diplomas.blank.savefirst : Előbb mentse el a diplomát alapadatokkal, utána tölthető fel a kép.
diplomas.blank.error : Hiba történt a feltöltés során.

diplomas.rulemode.label : Szabály mód
diplomas.rulemode.checklist : Checklist (minden hívójelet teljesíteni kell)
diplomas.rulemode.points : Pontozás (körzet szerinti minimum ponthatárral)
diplomas.rulemode.help : Checklist módban minden megadott szabálynak (hívójel/QTH/megjegyzés) teljesülnie kell legalább egy QSO-ban. Pontozás módban minden szabály pontokat ad, és a rádióamatőr körzete (hazai/EU/DX) szerinti minimum pontszámot kell elérnie.

diplomas.duplicate.label : Duplikátum kezelés (ugyanazon állomással több QSO)
diplomas.duplicate.allowed : Engedélyezett — minden összeköttetés számít, akár ismételten is
diplomas.duplicate.per_band_mode : Sávonként/üzemmódonként egy — más sávon vagy módon újra számít
diplomas.duplicate.once : Csak egyszer — sávtól/módtól függetlenül, csak az első számít
diplomas.duplicate.help : Elsősorban pontozás módnál számít: ha egy rádióamatőr többször is összeköttetésbe lép ugyanazzal az állomással, ez a beállítás dönti el, hogy ez hányszor számítson bele az eredménybe.
diplomas.allowedbands.label : Engedélyezett sávok (vesszővel elválasztva)
diplomas.allowedbands.help : Ha kitölti (pl. "80m, 40m, 20m"), csak az itt felsorolt sávon teljesített összeköttetés érvényes ehhez a diplomához — egy másik sávon (pl. 2m) teljesített QSO automatikusan érvénytelen, függetlenül attól, hogy van-e rá pontozó szabály lent. Üresen hagyva: nincs sáv-korlátozás.
diplomas.allowedbands.placeholder : pl. 80m, 40m, 20m
diplomas.repeater.allowed.label : Átjátszó (repeater) használata engedélyezett
diplomas.repeater.allowed.help : Ha kikapcsolja, az átjátszón keresztül teljesített összeköttetés nem számít bele a diplomába — csak a közvetlen (szimplex) QSO fogadható el.
diplomas.repeater.points.label : Átjátszós összeköttetés pontértéke
diplomas.repeater.points.help : Csak pontozás módban és csak akkor érvényes, ha az átjátszó használata engedélyezett — hány pontot érjen egy átjátszón keresztül teljesített összeköttetés.
diplomas.rule.field : Mező
diplomas.rule.operator : Feltétel
diplomas.rule.value : Érték
diplomas.rule.points : Pont
diplomas.rule.label : Megnevezés
diplomas.rule.add : Szabály hozzáadása
diplomas.rule.regex.hint : A hívójel mezőnél a "Reguláris kifejezés" feltétel is választható, ha a minta (*/?) nem elég pontos — pl. csak kétbetűs suffixű osztrák állomások (OE7GJ): ^OE\d[A-Z]{2}$
diplomas.rule.mode.hint : Az "Adásmód" mezőnél a "Csoport" feltétellel (pl. DIGITAL) bármelyik digitális módra (FT8, RTTY, PSK31, stb.) pontot adhat anélkül, hogy egyenként fel kellene sorolnia őket — konkrét módra (pl. csak FT8) az "Egyezik" feltételt használja.
diplomas.rule.band.hint : A "Sáv" mezővel sávonkénti pontozást állíthat be (pl. 80m 3, 40m 2 pont), vagy a "Csoport" feltétellel (HF / VHF / UHF) egész sávtartományra — ha egy diploma csak bizonyos sávokon teljesíthető, adjon meg rá szabályt (pl. "Egyike": 80m, 40m).

diplomas.zone.label : Körzet szerinti minimum ponthatár
diplomas.zone.help : Hagyja üresen, ha az adott körzetre nincs külön minimum.
diplomas.zone.home : Hazai
diplomas.zone.eu : EU
diplomas.zone.dx : DX (egyéb)
diplomas.zone.homecountry : Kiadó szervezet országa
diplomas.zone.homecountry.help : Ez dönti el, melyik jelentkező számít "hazainak" — ez alapján kerül EU vagy DX körzetbe minden más ország.
diplomas.zone.tiers.note : A fokozatok be vannak kapcsolva — a fenti sima körzet-küszöbök helyett minden fokozathoz külön-külön körzetenkénti (hazai/EU/DX) minimum tartozik, lásd lent.

diplomas.tiers.enabled.label : Fokozatok használata (pl. Bronz/Ezüst/Arany)
diplomas.tiers.enabled.help : Ha be van kapcsolva, a diploma több elérhető szintre (pl. Bronz/Ezüst/Arany) oszlik az elért pontszám alapján.
diplomas.tiers.categories.label : Adásmód szerinti kategóriák
diplomas.tiers.categories.help : Ha be van kapcsolva, adásmódonként (pl. CW / Phone / Mixed) külön-külön saját fokozat-létra állítható be — egy beadvány akár több kategóriában is teljesíthet egyszerre (pl. eléri a minimumot CW-vel is és SSB-vel is).
diplomas.tiers.categories.groups.hint : A csoportok: CW (morze), Phone (hangalapú: SSB/FM/AM), Digital (digitális módok: FT8, RTTY, PSK31, stb.), Image (képi adásmódok: SSTV, FAX, ATV), Mind (Mixed) = bármelyik adásmóddal szerzett QSO számít.
diplomas.tiers.category.add : Kategória hozzáadása

diplomas.qsl.label : QSL mintavételezés
diplomas.qsl.help : Hány QSO-t sorsoljon ki automatikusan a rendszer QSL-igazolás bekéréséhez (0 = kikapcsolva).
diplomas.autoapprove.label : Automatikus elfogadás
diplomas.autoapprove.help : Ha a napló alapján a rendszer automatikusan megfelelőnek találja a beadványt, manager-i beavatkozás nélkül azonnal kiadja az oklevelet. Csak akkor kapcsolható be, ha nincs QSL-mintavételezés (fentebb 0) és nincs fizikai kézbesítés kínálva (lásd a Fizetés fület) — mindkettő emberi beavatkozást igényelne, ami nem fér össze az "azonnal" elvvel.

diplomas.challenge.notice : A jelentkezés/sorsolás/körönkénti napló-ellenőrzés folyamata még fejlesztés alatt áll — itt egyelőre csak a beállítások adhatók meg.
diplomas.challenge.targetfield.label : Célpont-mező
diplomas.challenge.targetfield.help : Melyik adatot sorsolja a rendszer körönként a lenti listából, és melyik napló-mezőben kell majd megtalálnia a rádióamatőr összeköttetésében.
diplomas.challenge.targetfield.call : Hívójel
diplomas.challenge.targetfield.country : Ország
diplomas.challenge.targetfield.comment : Egyéb azonosító (napló Megjegyzés mezőjében, pl. átjátszó/talkgroup)
diplomas.challenge.allowedbands.label : Engedélyezett sávok (vesszővel elválasztva)
diplomas.challenge.allowedbands.help : Ha kitölti (pl. "80m, 40m, 20m"), egy körben csak az itt felsorolt sávon teljesített összeköttetés érvényes — egy másik sávon (pl. 2m) teljesített QSO automatikusan érvénytelen. Üresen hagyva: nincs sáv-korlátozás.
diplomas.challenge.allowedbands.placeholder : pl. 80m, 40m, 20m
diplomas.challenge.allowedmodes.label : Engedélyezett adásmódok (vesszővel elválasztva)
diplomas.challenge.allowedmodes.help : Ha kitölti (pl. "FT8, DMR"), egy körben csak az itt felsorolt adásmóddal teljesített összeköttetés érvényes — egy másik adásmóddal teljesített QSO automatikusan érvénytelen. Üresen hagyva: nincs adásmód-korlátozás.
diplomas.challenge.allowedmodes.placeholder : pl. FT8, DMR
diplomas.challenge.pool.label : Célpont-lista (pool)
diplomas.challenge.pool.help : Ezekből sorsol a rendszer körönként. A "Címke" opcionális, csak megjelenítésre szolgál (pl. ország neve, talkgroup neve).
diplomas.challenge.pool.col.value : Érték
diplomas.challenge.pool.col.label : Címke (opcionális)
diplomas.challenge.pool.add : Elem hozzáadása
diplomas.challenge.drawperround.label : Körönként sorsolt darabszám
diplomas.challenge.totalrounds.label : Körök száma
diplomas.challenge.deadlinedays.label : Kör-határidő (nap)
diplomas.challenge.deadlinedays.placeholder : nincs határidő
diplomas.challenge.qsl.label : QSL mintavételezés (körönként)
diplomas.challenge.allowrepeat.label : Ugyanaz az elem több körben is sorsolható legyen
diplomas.challenge.allowrepeat.help : Ha kikapcsolva, egy jelentkezésen belül minden kör egyedi (korábban még nem sorsolt) elemeket kap — ehhez a poolnak legalább (körök száma × körönkénti sorsolás) elemet kell tartalmaznia.

diplomas.fee.pdf.label : PDF díj
diplomas.fee.physical.label : Fizikai példány díja (felár)
diplomas.fee.currency.label : Pénznem
diplomas.physical.enabled.label : Fizikai (keretezett) példány igényelhető
diplomas.payment.methods.label : Elfogadott fizetési módok
diplomas.payment.method.bank : Banki utalás
diplomas.bank.accountname.label : Számlatulajdonos neve
diplomas.bank.iban.label : Bankszámlaszám / IBAN
diplomas.bank.note.label : Megjegyzés (közlemény)

diplomas.overlay.help : Húzza a mezőket a biankó kép megfelelő helyére — ez alapján kerülnek majd a PDF oklevélre. A jelölőnégyzetekkel ki-/bekapcsolható, hogy melyik mező szerepeljen ennél a diplománál (nem mindegyikre van mindig szükség).
diplomas.overlay.noimage : Előbb töltsön fel biankó képet az "Alapadatok" fülön.
diplomas.overlay.font.family.label : Betűtípus
diplomas.overlay.font.size.label : Betűméret
diplomas.overlay.font.help : A betűméret és a betűtípus minden mezőre (adatra) egységesen vonatkozik — nem állítható be mezőnként külön-külön.
diplomas.overlay.font.liberationSans : Modern (talpatlan)
diplomas.overlay.font.liberationSerif : Klasszikus (talpas)
diplomas.overlay.font.ebGaramond : Elegáns (Garamond)
diplomas.overlay.font.dancingScript : Díszes (kézírásos)
diplomas.overlay.preview.button : Előnézet (demo adatokkal)
diplomas.overlay.preview.title : Előnézet — így fog kinézni a kitöltött oklevél
diplomas.overlay.preview.close : Bezárás
diplomas.overlay.preview.error : Az előnézet legenerálása sikertelen.

diplomas.preview.demo.name : Minta Béla
diplomas.preview.demo.callsign : HA0DEMO
diplomas.preview.demo.points : 123
diplomas.preview.demo.serial : 0001
diplomas.preview.demo.category : CW
diplomas.preview.demo.tier : Arany
diplomas.preview.demo.zone : DX
diplomas.overlay.field.diplomaName : Diploma neve
diplomas.overlay.field.applicantName : Jelentkező neve
diplomas.overlay.field.callsign : Hívójel
diplomas.overlay.field.points : Pontszám
diplomas.overlay.field.serialNumber : Sorszám
diplomas.overlay.field.issueDate : Kiállítás dátuma
diplomas.overlay.field.categoryLabel : Kategória neve
diplomas.overlay.field.tierLabel : Fokozat neve
diplomas.overlay.field.zoneLabel : Körzet neve

diplomas.saved : A diploma elmentve.
diplomas.save : Mentés

diplomas.rule.field.call : Hívójel
diplomas.rule.field.comment : Megjegyzés
diplomas.rule.field.qth : QTH (helység)
diplomas.rule.field.mode : Adásmód
diplomas.rule.field.band : Sáv
diplomas.rule.sentence.wildcard : {field} illeszkedik erre: {value}
diplomas.rule.sentence.regex : {field} illeszkedik a mintára: {value}
diplomas.rule.sentence.contains : {field} tartalmazza: {value}
diplomas.rule.sentence.equals : {field}: {value}
diplomas.rule.sentence.in_list : {field} egyike: {value}
diplomas.rule.sentence.group : {field} csoportja: {value}

diplomas.public.list.title : Elérhető diplomák
diplomas.public.list.intro : Az alábbi diplomák érhetők el jelenleg — kattintson a részletekért.
diplomas.public.list.empty : Jelenleg nincs elérhető diploma.
diplomas.public.list.empty.filtered : A megadott szűrésnek megfelelő diploma jelenleg nincs.
diplomas.public.list.filter.all : Mind
diplomas.public.list.filter.unowned : Csak amit még nem szereztem meg
diplomas.public.list.details : Részletek
diplomas.public.list.manager : Felelős: {0}
diplomas.public.list.fee.free : Ingyenes
diplomas.public.list.owned.inprogress : Elbírálás alatt
diplomas.public.list.stamp.owned : Megvan
diplomas.public.list.stamp.expired : Lejárt
diplomas.public.stats.button : Statisztika megtekintése
diplomas.public.stats.back : Vissza a diplomához
diplomas.public.stats.title : Statisztika – {0}
diplomas.public.stats.summary.title : Megszerzők régiónként
diplomas.public.stats.total : Összesen
diplomas.public.stats.list.title : Megszerzők listája
diplomas.public.stats.empty : Ezt a diplomát még senki nem szerezte meg.
diplomas.public.stats.col.serial : Sorszám
diplomas.public.stats.col.callsign : Hívójel
diplomas.public.stats.col.zone : Körzet
diplomas.public.stats.col.points : Pontszám
diplomas.public.stats.col.tier : Fokozat
diplomas.public.stats.col.date : Kiadva
diplomas.public.stats.pagination.prev : ← Előző
diplomas.public.stats.pagination.next : Következő →
diplomas.public.stats.pagination.page : {0}. oldal / {1}
diplomas.public.detail.back : ← Vissza a diplomákhoz
diplomas.public.detail.blank.title : Biankó oklevél (minta)
diplomas.public.detail.blank.missing : Még nincs feltöltve biankó kép ehhez a diplomához.
diplomas.public.detail.blank.note : A képen látható vízjel csak ezen az előnézeten szerepel — a ténylegesen kiadott oklevélen nem lesz rajta.
diplomas.public.detail.deadline.until : Határidő: {0}
diplomas.public.detail.challenge.label : A kihívás menete
diplomas.public.detail.challenge.intro : Ez egy több körből álló kihívás-diploma: jelentkezés után a rendszer körönként sorsol az alábbi feltétel(ek) szerint — minden kört teljesítenie kell ahhoz, hogy a következő körbe léphessen.
diplomas.public.detail.rules.label : Megszerzési feltételek
diplomas.public.detail.rules.checklist.intro : A diploma megszerzéséhez az alábbi feltételek MINDEGYIKÉNEK teljesülnie kell legalább egy összeköttetésben:
diplomas.public.detail.rules.points.intro : Az alábbi szabályok szerint gyűjthet pontot; a diploma megszerzéséhez a körzete szerinti minimum pontszámot kell elérnie:
diplomas.public.detail.rules.empty : Ehhez a diplomához még nincs megadva részletes szabály.
diplomas.public.detail.zone.label : Minimum pontszám körzet szerint
diplomas.public.detail.zone.none : Nincs megadva külön minimum ehhez a körzethez.
diplomas.public.detail.tiers.label : Fokozatok
diplomas.public.detail.tiers.col.category : Kategória
diplomas.public.detail.tiers.col.tier : Fokozat
diplomas.public.detail.duplicate.label : Duplikátum-kezelés
diplomas.public.detail.qsl.label : QSL-igazolás
diplomas.public.detail.qsl.text : A beadás során a rendszer QSL-igazolást kérhet be (screenshot, scan).
diplomas.public.detail.repeater.notallowed : Az átjátszó (repeater) használatával teljesített összeköttetés NEM számít bele ebbe a diplomába — csak a közvetlen (szimplex) QSO fogadható el.
diplomas.public.detail.repeater.allowed.points : Az átjátszó (repeater) használata megengedett, az ilyen összeköttetés {0} pontot ér.
diplomas.public.detail.allowedbands.text : Ez a diploma csak a következő sávon/sávokon teljesíthető: {0}.
diplomas.public.detail.challenge.allowedmodes.text : Ez a kihívás csak a következő adásmóddal/adásmódokkal teljesíthető: {0}.
diplomas.public.detail.cta.title : Jelentkezés
diplomas.public.detail.cta.login : A jelentkezéshez be kell jelentkeznie.
diplomas.public.detail.cta.login.button : Bejelentkezés
diplomas.public.detail.cta.register.text : Még nincs fiókja?
diplomas.public.detail.cta.register.button : Regisztráció
diplomas.public.detail.cta.soon : A napló beadásának funkciója hamarosan elérhető.
diplomas.public.detail.cta.submit.button : Napló feltöltése / Beadás
diplomas.public.detail.cta.expired : A beadási határidő lejárt, ehhez a diplomához már nem lehet naplót beadni.
diplomas.public.detail.cta.existing : Ehhez a diplomához már van beadványa.
diplomas.public.detail.cta.existing.link : Beadvány megtekintése

diplomas.home.teaser.title : Elérhető diplomák
diplomas.home.teaser.text : Tekintse meg az elérhető rádióamatőr diplomákat és a megszerzésükhöz szükséges feltételeket.
diplomas.home.teaser.button : Diplomák megtekintése

error.diploma.name : A diploma nevének megadása kötelező.
error.diploma.rule.regex : Érvénytelen reguláris kifejezés egy hívójel-szabálynál.
error.diploma.blank.watermark : A kép vízjelezése sikertelen, próbálja újra.
error.diploma.rule.group : Ismeretlen adásmód-csoport egy szabálynál (CW / PHONE / DIGITAL / IMAGE lehet).
error.diploma.rule.band.group : Ismeretlen sáv-csoport egy szabálynál (HF / VHF / UHF lehet).
error.diploma.autoapprove.conflict : Automatikus elfogadás csak akkor kapcsolható be, ha nincs QSL-mintavételezés (0) és nincs fizikai kézbesítés kínálva.
error.diploma.manager.invalid : A kiválasztott felelős manager érvénytelen, vagy nincs manager jogosultsága.
error.diploma.forbidden : Ehhez a diplomához nincs jogosultsága — csak az Önhöz rendelt diplomákat kezelheti.
error.diploma.create.forbidden : Új diploma létrehozásához superadmin jogosultság szükséges.
error.diploma.challenge.target_field : Válasszon célpont-mezőt a Kihívás fülön (hívójel / ország / egyéb azonosító).
error.diploma.challenge.pool_empty : Adjon meg legalább egy elemet a célpont-listához a Kihívás fülön.
error.diploma.challenge.pool_too_small : A célpont-lista túl kicsi ennyi körhöz/sorsoláshoz ismétlés nélkül — bővítse a listát, csökkentse a körök/sorsolt darabszámot, vagy engedélyezze az ismétlődést.

// --- MFA admin beállítások ---
settings.title : Beállítások
settings.appearance.section : Megjelenés
settings.appearance.logo.label : Egyedi logó (oldalsáv teteje, minden oldalon)
settings.appearance.logo.choose : Fájl kiválasztása…
settings.appearance.logo.error : A logó feltöltése sikertelen.
settings.appearance.banner.label : Banner kép (főoldal)
settings.appearance.banner.choose : Fájl kiválasztása…
settings.appearance.banner.error : A banner feltöltése sikertelen.
settings.appearance.sitetitle.label : Egyedi cím
settings.appearance.sitetitle.help : Ha üresen hagyja, az alkalmazás alapértelmezett nevét mutatjuk a főoldalon.
settings.appearance.defaultlanguage.label : Alapértelmezett nyelv
settings.appearance.defaultlanguage.help : Ezt a nyelvet látja egy új látogató, akinek még nincs nyelvi sütije (pl. első látogatáskor) — bejelentkezés után mindig a saját fiókbeállítás, a nyelvváltóval pedig bármikor felülírható.
settings.appearance.welcometext.label : Üdvözlő szöveg
settings.appearance.welcometext.help : Soronként külön bekezdésként jelenik meg a főoldalon. Ha üresen hagyja, az alapértelmezett bemutatkozó szöveg látszik.
settings.contacts.label : Kapcsolatok oldal tartalma
settings.contacts.help : Szabadon szerkeszthető tartalom a publikus "Kapcsolatok" oldalhoz — HTML tagek is megadhatók (pl. &lt;p&gt;, &lt;a href="..."&gt;, &lt;strong&gt;), a rendszer változtatás nélkül, ténylegesen HTML-ként jeleníti meg. Mivel ide bármilyen HTML kerülhet, csak megbízható (manager/sa) forrásból töltse fel.
settings.mfa.section : Kétfaktoros hitelesítés (MFA)
settings.mfa.user.label : Rádióamatőrök
settings.mfa.manager.label : Managerek
settings.mfa.policy.disabled : Kikapcsolva
settings.mfa.policy.optional : Opcionális
settings.mfa.policy.required : Kötelező
settings.mfa.methods.label : Engedélyezett módszerek
settings.submit : Mentés
settings.saved : A beállítások elmentve.
settings.managers.moved.hint : A diploma-managerek kijelölése és a felhasználók tiltása mostantól a "Felhasználók" menüpont alatt (/admin/users) érhető el.
// --- Felhasználó-kezelő (/admin/users, superadmin-only, felhasználói kérésre) ---
users.admin.title : Felhasználók
users.admin.search.placeholder : Keresés hívójel, név vagy e-mail alapján…
users.admin.filter.status.label : Állapot
users.admin.filter.status.all : Mind
users.admin.status.active : Aktív
users.admin.status.disabled : Tiltva
users.admin.status.pending_verification : Megerősítésre vár
users.admin.col.callsign : Hívójel
users.admin.col.name : Név
users.admin.col.email : E-mail
users.admin.col.country : Ország
users.admin.col.status : Állapot
users.admin.col.manager : Manager
users.admin.col.created : Regisztrált
users.admin.action.detail : Részletek
users.admin.action.disable : Tiltás
users.admin.action.enable : Feloldás
users.admin.disable.confirm : Biztosan tiltja "{0}" felhasználót? Utána nem tud bejelentkezni.
users.admin.enable.confirm : Visszakapcsolja "{0}" felhasználót? Utána újra be tud jelentkezni.
users.admin.empty : Nincs a szűrésnek megfelelő felhasználó.
users.admin.pagination.prev : ← Előző
users.admin.pagination.next : Következő →
users.admin.pagination.page : {0}. oldal / {1}
users.admin.detail.back : ← Vissza a felhasználókhoz
users.admin.detail.title : Felhasználó – {0}
users.admin.detail.section.profile : Profil
users.admin.detail.field.email : E-mail
users.admin.detail.field.name : Név
users.admin.detail.field.callsign : Hívójel
users.admin.detail.field.country : Ország
users.admin.detail.field.address : Cím
users.admin.detail.field.language : Nyelv
users.admin.detail.field.status : Állapot
users.admin.detail.field.permissions : Jogosultság
users.admin.detail.field.created : Regisztrált
users.admin.detail.field.mfa : Kétfaktoros hitelesítés
users.admin.detail.permissions.manager : Manager
users.admin.detail.permissions.sa : Superadmin
users.admin.detail.permissions.none : —
users.admin.detail.mfa.enabled : Bekapcsolva ({0})
users.admin.detail.mfa.disabled : Kikapcsolva
users.admin.detail.section.submissions : Beadványok és oklevelek
users.admin.detail.submissions.empty : Ennek a felhasználónak még nincs beadványa.
users.admin.detail.submissions.col.diploma : Diploma
users.admin.detail.submissions.col.status : Állapot
users.admin.detail.submissions.col.points : Pontszám
users.admin.detail.submissions.col.created : Beadva

// --- Beadási folyamat (6. lépés) ---
submissions.delivery.pdf : Csak PDF oklevél
submissions.delivery.physical : Fizikai (keretezett) példány is (felár ellenében)

submissions.new.back : ← Vissza a diplomához
submissions.new.title : Napló feltöltése
submissions.new.file.label : ADIF napló fájl (.adi / .adif)
submissions.new.file.choose : Fájl kiválasztása
submissions.new.delivery.label : Kézbesítési mód
submissions.new.submit : Beadás

submissions.list.title : Beadványaim
submissions.list.empty : Még nincs egyetlen beadványa sem.
submissions.list.col.diploma : Diploma
submissions.list.col.status : Állapot
submissions.list.col.points : Pontszám
submissions.list.col.created : Beadva

submissions.detail.back : ← Vissza a beadványaimhoz
submissions.detail.status.label : Állapot
submissions.detail.parsed.label : Feldolgozott QSO-k száma
submissions.detail.matched.label : Megfelelő QSO-k száma
submissions.detail.points.label : Elért pontszám
submissions.detail.delivery.label : Kézbesítési mód
submissions.detail.serial.label : Oklevél sorszáma
submissions.detail.pdf.download : Oklevél letöltése (PDF)
submissions.detail.checklist.title : Feltételek teljesülése
submissions.detail.tiers.title : Kategóriák / fokozatok
submissions.detail.tiers.col.achieved : Elért fokozat
submissions.detail.zone.label : Körzet
submissions.detail.zone.threshold : Minimum ponthatár
submissions.detail.qso.title : Összeköttetések
submissions.detail.qso.col.call : Hívójel
submissions.detail.qso.col.date : Dátum
submissions.detail.qso.col.band : Sáv
submissions.detail.qso.col.mode : Mód
submissions.detail.qso.col.comment : Megjegyzés
submissions.detail.qso.col.matched : Illeszkedő szabályok
submissions.detail.qso.col.points : Pont
submissions.detail.qso.excluded.duplicate : Duplikátum — nem számít bele
submissions.detail.qso.excluded.band : Sáv nem engedélyezett ehhez a diplomához
submissions.detail.qso.excluded.repeater : Átjátszón keresztüli QSO, nem engedélyezett
submissions.detail.qso.repeater.bonus : Átjátszó-bónusz

submissions.status.submitted : Beadva, feldolgozás alatt
submissions.status.rejected_auto : Automatikusan elutasítva — a feltételek nem teljesültek
submissions.status.awaiting_qsl : QSL-igazolásra vár
submissions.status.pending_review : Elbírálásra vár
submissions.status.approved : Elfogadva
submissions.status.rejected : Elutasítva
submissions.status.awaiting_payment : Fizetésre vár
submissions.status.paid : Fizetve
submissions.status.completed : Teljesítve

error.submission.notfound : A beadvány nem található.
error.submission.forbidden : Ehhez a beadványhoz nincs jogosultsága.
error.submission.file.required : Válasszon ki egy ADIF napló fájlt (.adi / .adif).
error.submission.file.empty : A feltöltött fájlban nem található feldolgozható összeköttetés.
error.submission.qsl.file.required : Válasszon ki egy képet vagy PDF-et a QSL-igazoláshoz.

submissions.detail.qsl.title : QSL-igazolás
submissions.detail.qsl.intro : A rendszer az alábbi összeköttetésekhez kér QSL-igazolást (screenshot vagy scan) — a beadvány csak akkor kerül elbírálásra, ha mindegyikhez feltöltötte.
submissions.detail.qsl.col.call : Hívójel
submissions.detail.qsl.col.image : Igazolás
submissions.detail.qsl.uploaded : Feltöltve — megtekintés
submissions.detail.qsl.choose : Fájl kiválasztása
submissions.detail.qsl.upload.button : Feltöltés

// --- Manager elbírálás (8. lépés) ---
menu.admin.review : Elbírálás

submissions.review.title : Elbírálásra váró beadványok
submissions.review.empty : Nincs a szűrésnek megfelelő beadvány.
submissions.review.filter.label : Állapot
submissions.review.filter.all : Összes
submissions.review.col.diploma : Diploma
submissions.review.col.applicant : Beküldő
submissions.review.col.points : Pontszám
submissions.review.col.created : Beadva
submissions.review.detail : Megnyitás →

submissions.detail.review.title : Elbírálás
submissions.detail.review.points.label : Egyéb korrekció (nem konkrét QSO-hoz kötött) — egy adott összeköttetéshez tartozó korrekciót a QSO-táblázat soronkénti ✎ gombjával adhat hozzá
submissions.detail.review.points.amount.placeholder : Pontok (pl. -5 vagy 3)
submissions.detail.review.points.reason.placeholder : Indoklás (opcionális)
submissions.detail.review.points.submit : Korrekció alkalmazása
submissions.detail.review.points.history : Korábbi korrekciók
submissions.detail.review.points.history.col.qso : QSO
submissions.detail.review.points.history.col.reason : Indoklás
submissions.detail.review.points.history.col.manager : Manager
submissions.detail.review.points.history.col.at : Időpont
submissions.detail.review.remark.placeholder : Megjegyzés a döntéshez (a rádióamatőr is látni fogja, elutasításnál ajánlott)
submissions.detail.review.approve : Elfogadás
submissions.detail.review.reject : Elutasítás
submissions.detail.review.confirm.approve : Biztosan elfogadja ezt a beadványt?
submissions.detail.review.confirm.reject : Biztosan elutasítja ezt a beadványt?
submissions.detail.review.by : Elbírálva
submissions.detail.review.remark : Manager megjegyzése
submissions.detail.review.manual.suffix : kézi
submissions.detail.review.qso.rule.custom : -- Egyéni --
submissions.detail.review.qso.points.unit : pont
submissions.detail.review.qso.amount.placeholder : Pont (egyéni esetén)
submissions.detail.review.qso.reason.placeholder : Indoklás
submissions.detail.review.qso.apply : Alkalmaz

error.submission.review.state : A beadvány jelenleg nincs elbírálható állapotban.
error.submission.review.decision : Érvénytelen döntés.
error.submission.review.amount : Adjon meg egy nullától eltérő pontkorrekciót.
error.submission.review.rule : Érvénytelen szabály.

email.submission.approved.subject : Diploma elfogadva
email.submission.approved.intro : Örömmel értesítjük, hogy beadványát elfogadtuk. Az oklevél hamarosan letölthető lesz a beadvány oldaláról.
email.submission.approved.btn : Beadvány megtekintése
email.submission.rejected.subject : Diploma elutasítva
email.submission.rejected.intro : Sajnálattal értesítjük, hogy beadványát elutasítottuk.
email.submission.rejected.btn : Beadvány megtekintése
email.submission.review_needed.subject : Elbírálásra váró beadvány
email.submission.review_needed.intro : Egy beadvány elbírálásra vár a(z) "{0}" diplománál.
email.submission.review_needed.btn : Beadvány megtekintése
email.submission.qsl_needed.subject : QSL-igazolás feltöltése szükséges
email.submission.qsl_needed.intro : A(z) "{0}" diplomához beadott naplójából {1} db QSO-hoz QSL-igazolást (kép vagy szkennelt másolat) kell feltöltenie, hogy a beadvány elbírálásra kerülhessen.
email.submission.qsl_needed.btn : QSL feltöltése

error.payment.state : A beadvány jelenleg nincs ehhez a fizetési művelethez megfelelő állapotban.
error.payment.method : Érvénytelen vagy nem elérhető fizetési mód ehhez a diplomához.
error.payment.unavailable : Ez a fizetési mód jelenleg nem elérhető (nincs beállítva a szolgáltató). Próbálja meg egy másik móddal, vagy keresse a diploma managerét.

email.payment.paid.subject : Fizetés visszaigazolva
email.payment.paid.intro : Köszönjük, a beadványához tartozó fizetést rögzítettük.
email.payment.paid.btn : Beadvány megtekintése

submissions.detail.payment.title : Fizetés
submissions.detail.payment.amount.label : Fizetendő összeg
submissions.detail.payment.method.stripe : Fizetés bankkártyával (Stripe)
submissions.detail.payment.method.paypal : Fizetés PayPal-lal
submissions.detail.payment.method.bank_transfer : Fizetés banki utalással
submissions.detail.payment.bank.intro : Kérjük, utalja el a fenti összeget az alábbi számlára, a közlemény rovatba feltüntetve a hivatkozási számot.
submissions.detail.payment.bank.reference : Közlemény / hivatkozási szám
submissions.detail.payment.bank.pending : A banki utalást rögzítettük — a manager a beérkezés után jóváhagyja.
submissions.detail.payment.error : Hiba történt a fizetés indításakor.
submissions.detail.payment.confirm.bank : Manager: jóváhagyja, hogy a banki utalás beérkezett?
submissions.detail.payment.confirm.button : Fizetés jóváhagyása (banki utalás)
submissions.detail.payment.complete.confirm : Megjelöli a beadványt teljesítettként (a fizikai oklevél elküldve)?
submissions.detail.payment.complete.button : Megjelölés teljesítettként
submissions.detail.payment.cancelled : A fizetés megszakadt vagy nem fejeződött be — bármikor újrapróbálhatja.
