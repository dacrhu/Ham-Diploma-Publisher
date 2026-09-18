// Diplomas/Diplomas — diploma-definíciók admin (manager) kezelése: alapadatok,
// szabályrendszer (checklist/pontozás), fizetés, PDF overlay-elrendezés. A biankó
// kép feltöltése/kiszolgálása külön controller-routeokon megy (nem ezen a sémán
// keresztül) — lásd controllers/diplomas-admin.js.
// A 'mode' mező az ADIF MODE-ra illeszkedik (adásmód szerinti pontozás, pl. CW 3,
// SSB 2, FM 1, Digi 1) — lásd modules/adif-modes.js a 'group' operátor hátteréhez.
// A 'band' mező az ADIF BAND-ra illeszkedik (sávonkénti pontozás, pl. 80m 3,
// 40m 2, VAGY egy diploma csak bizonyos sávokon teljesíthető, pl. csak
// 80m/40m) — lásd modules/adif-bands.js a 'group' operátor hátteréhez.
const RULE_FIELDS = ['call', 'comment', 'qth', 'mode', 'band'];
// A 'regex' egyelőre csak a 'call' mezőnél elérhető (admin UI-n) — arra az esetre,
// amikor a wildcard (*/?) nem elég precíz, pl. osztrák "csak kétbetűs suffix"
// diploma: ^OE\d[A-Z]{2}$ (a wildcard "OE7??" is működne erre, de a regex pl. a
// betű/szám megkülönböztetésére is képes, amire a "?" nem).
// A 'group' a 'mode' és a 'band' mezőknél értelmezett — értéke egy
// ADIF_MODES.GROUP_NAMES (pl. "DIGITAL") vagy ADIF_BANDS.GROUP_NAMES (pl. "VHF")
// tagja, és bármelyik csoportba tartozó konkrét mód/sáv-értékre illeszkedik,
// anélkül hogy a diplomának fel kellene sorolnia mindegyiket egyenként.
const RULE_OPERATORS = ['wildcard', 'regex', 'contains', 'equals', 'in_list', 'group'];
const RULE_MODES = ['checklist', 'points'];
// Duplikátum-kezelés (elsősorban pontozás módban számít — ugyanazzal az
// állomással több QSO is lehet a naplóban): 'allowed' = mindegyik számít (pl.
// tiszta aktivitás-diploma, ismételt hívás is pontot ér), 'per_band_mode' =
// ugyanaz az állomás sávonként/üzemmódonként csak egyszer számít (a leggyakoribb
// ham rádiós konvenció — más sávon/módon újra számít), 'once' = ugyanaz az
// állomás összesen csak egyszer számít, sávtól/módtól függetlenül. A tényleges
// alkalmazás a 6. lépés rule-engine-jében történik majd (ADIF QSO-k tényleges
// deduplikálása) — itt egyelőre csak a diploma-szintű beállítás készül el.
const DUPLICATE_POLICIES = ['allowed', 'per_band_mode', 'once'];
const STATUSES = ['draft', 'active', 'archived'];
const PAYMENT_METHODS = ['stripe', 'paypal', 'bank_transfer'];
const OVERLAY_KEYS = ['callsign', 'applicantName', 'serialNumber', 'diplomaName', 'issueDate', 'points', 'categoryLabel', 'tierLabel', 'zoneLabel'];
const DEFAULT_SERIAL_START = 1;

// Fokozatok (pl. Bronz/Ezüst/Arany), csak pontozás módban értelmezett. Egy diploma
// mindig `categories` tömböt tárol: ha a manager nem kapcsolja be az adásmód
// szerinti bontást (categoriesEnabled=false), a tömb pontosan 1 elemű, implicit
// "Mixed" kategória (modeFilter=null), amin belül a fokozat-létra fut. Ha be van
// kapcsolva, több kategória is felvehető (pl. CW / Phone / Mixed), mindegyiknek
// SAJÁT fokozat-létrája van (pl. CW-ben nehezebb elérni ugyanazt a pontot, mint
// Phone-ban) — a beadás egyszerre több kategóriában is teljesíthet (pl. 40 CW +
// 40 SSB, mindkettő eléri a minimumot -> mindkét kategóriára jár oklevél). A
// tényleges kiértékelés (melyik kategória/fokozat teljesült) a 6. lépés
// rule-engine-jében történik majd — itt egyelőre csak a diploma-szintű beállítás
// készül el.
const CATEGORY_MODE_FILTERS = ADIF_MODES.GROUP_NAMES;

// Diploma-típus: 'standard' (napló feltöltése -> checklist/pontozás rule-engine,
// lásd fent) vagy 'challenge' (jelentkezés -> köröket sorsol a rendszer egy
// előre felvett célpont-poolból, minden kör mindegyik sorsolt célpontjával QSO
// kell -> következő kör). MEGLÉVŐ diplomáknál a `type` mező hiányzik a Mongóban
// (a mező bevezetése előtt jöttek létre) -- mindenhol `diploma.type || 'standard'`
// olvasandó, sose feltételezve, hogy a mező létezik.
// FONTOS HATÓKÖR: itt KIZÁRÓLAG a challenge diploma admin-oldali
// KONFIGURÁCIÓJA készül el (ez az objektum + a lenti sanitizeChallenge/validáció).
// A tényleges jelentkezés/sorsolás/körönkénti log-feltöltés/QSL/elbírálás/PDF
// egy KÉSŐBBI lépés.
const DIPLOMA_TYPES = ['standard', 'challenge'];

// Melyik ADIF-mezőre illesztünk egy sorsolt célpontot: 'call' = konkrét hívójel,
// 'comment' = szabad azonosító a napló COMMENT mezőjéből (ide írja az operátor
// pl. az átjátszó/DMR talkgroup nevét -- nincs rá saját ADIF mező), 'country' =
// DXCC-ország (a tényleges hívójel-prefix -> ország egyeztetés egy KÉSŐBBI lépés
// modules/dxcc-prefixes.js-e, itt most csak választható configérték).
const CHALLENGE_TARGET_FIELDS = ['call', 'comment', 'country'];

NEWSCHEMA('Diplomas/Diplomas', function (schema) {

    schema.action('query', {
        permissions: ['manager'],
        language: true,
        action: async function ($) {
            let query = {};

            // Plain (nem sa) manager csak a HOZZÁ rendelt diplomákat láthatja — a
            // superadmin lát mindent (lásd get/save/delete ugyanezen szabályát).
            if (!$.user.sa)
                query.managerId = $.user._id;

            if ($.query.status)
                query.status = $.query.status;

            if ($.query.q)
                query.name = new RegExp($.query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

            let page = Number($.query.page) || 0;
            let max = Number($.query.max) || 25;

            let result = await MDB.find(process.env.MONGODB_DB_NAME, 'diplomas', query, {
                projection: { matchRules: 0, overlayFields: 0, bankTransferDetails: 0 },
                skip: page * max
            }, { created: -1 }, max, true);

            if (isDbError(result)) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            await attachManagerInfo(result.data);

            $.callback({ success: true, countFull: result.countFull, data: result.data });
        }
    });

    schema.action('get', {
        permissions: ['manager'],
        language: true,
        action: async function ($) {
            let diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID($.params.id) });

            if (isDbError(diploma) || !diploma) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            if (!isDiplomaManagerOf($.user, diploma)) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.diploma.forbidden') });
                return;
            }

            await attachManagerInfo([diploma]);

            $.callback({ success: true, data: diploma });
        }
    });

    // Elrendezés-előnézet demo adatokkal: az Elrendezés fülön AKTUÁLISAN
    // beállított (esetleg még el sem mentett) overlayFields-et rendereli rá a
    // biankó képre valódi (nem CSS-, hanem ténylegesen legenerált) JPEG-ként,
    // hogy a manager lássa, hogyan fog kinézni a végleges oklevél — anélkül,
    // hogy valódi beadványra kellene várnia. Nincs vízjel (a demo-adatok
    // önmagukban egyértelművé teszik, hogy ez nem egy valódi kiadott oklevél).
    // Kép-bináris a válasz, NEM JSON — ezért `$.controller.binary(...)`-t hívunk
    // `$.callback(...)` helyett a sikeres ágon.
    schema.action('previewRender', {
        permissions: ['manager'],
        language: true,
        action: async function ($) {
            let diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID($.params.id) }, { projection: { name: 1, blankImage: 1, managerId: 1 } });

            if (isDbError(diploma) || !diploma || !diploma.blankImage || !diploma.blankImage.key || !(await STORAGE.exists(diploma.blankImage.key))) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            if (!isDiplomaManagerOf($.user, diploma)) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.diploma.forbidden') });
                return;
            }

            let overlayFields = sanitizeOverlayFields($.model && $.model.overlayFields);
            // A font/méret is az AKTUÁLIS (élő szerkesztőben kiválasztott, akár még
            // el nem mentett) értéket használja, ugyanúgy, mint az overlayFields —
            // így az előnézet tényleg azt mutatja, amit a manager épp beállított.
            let overlayFontFamily = CERT_RENDERER.FONT_FAMILIES[$.model && $.model.overlayFontFamily] ? $.model.overlayFontFamily : CERT_RENDERER.DEFAULT_FONT_FAMILY;
            let overlayFontSize = $.model && Number($.model.overlayFontSize) > 0 ? Number($.model.overlayFontSize) : CERT_RENDERER.DEFAULT_FONT_SIZE;

            let demoValues = {
                diplomaName: diploma.name,
                applicantName: RESOURCE($.language, 'diplomas.preview.demo.name'),
                callsign: RESOURCE($.language, 'diplomas.preview.demo.callsign'),
                points: RESOURCE($.language, 'diplomas.preview.demo.points'),
                serialNumber: RESOURCE($.language, 'diplomas.preview.demo.serial'),
                issueDate: new Date().toLocaleDateString($.language),
                categoryLabel: RESOURCE($.language, 'diplomas.preview.demo.category'),
                tierLabel: RESOURCE($.language, 'diplomas.preview.demo.tier'),
                zoneLabel: RESOURCE($.language, 'diplomas.preview.demo.zone')
            };

            try {
                let buffer = await CERT_RENDERER.render(await STORAGE.read(diploma.blankImage.key), diploma.blankImage.key, overlayFields, demoValues, false, overlayFontFamily, overlayFontSize);
                $.controller.binary(buffer, 'image/jpeg');
            } catch (e) {
                FUNC.logger($, `Diplomas/Diplomas previewRender error: ${e.message}`);
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
            }
        }
    });

    // Csak akkor biztonságos, amíg diplomához nincs kötve beadvány (submissions,
    // 6. lépéstől) — utána majd meg kell gondolni, hogy engedjük-e még (vagy csak
    // archiválás legyen az egyetlen út). Egyelőre kifejezetten hasznos, hogy egy
    // manager (vagy én, teszteléskor) törölni tudjon egy felesleges/teszt diplomát
    // anélkül, hogy egy valódi rekordot kellene erre a célra felülírni.
    schema.action('delete', {
        permissions: ['manager'],
        input: '*id:string',
        language: true,
        action: async function ($) {
            let diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID($.model.id) }, { projection: { blankImage: 1, managerId: 1 } });

            if (!isDiplomaManagerOf($.user, diploma)) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.diploma.forbidden') });
                return;
            }

            if (diploma && diploma.blankImage && diploma.blankImage.key) {
                await STORAGE.delete(diploma.blankImage.key);

                // A vízjelezett verzió (lásd controllers/diplomas-admin.js
                // upload_blank) külön storage-kulcs alatt van — enélkül itt
                // árván maradna a törölt diploma mappájában.
                if (diploma.blankImage.watermarkedKey) {
                    await STORAGE.delete(diploma.blankImage.watermarkedKey);
                }
            }

            await MDB.deleteOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID($.model.id) });

            FUNC.logger($, `Diplomas/Diplomas delete: ${$.model.id}`);
            $.callback({ success: true });
        }
    });

    schema.action('save', {
        permissions: ['manager'],
        language: true,
        action: async function ($) {
            let model = $.model || {};
            let isUpdate = !!model.id;

            // Új diploma létrehozása superadmin-only — egy plain manager csak a
            // HOZZÁ már rendelt diplomákat szerkesztheti, újat nem hozhat létre
            // (lásd controllers/diplomas-admin.js view_edit ugyanezen korlátozását
            // a 'new' szerkesztő oldalon).
            if (!isUpdate && !$.user.sa) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.diploma.create.forbidden') });
                return;
            }

            let existingDiploma = null;

            if (isUpdate) {
                existingDiploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(model.id) }, { projection: { managerId: 1 } });

                if (!isDiplomaManagerOf($.user, existingDiploma)) {
                    $.callback({ success: false, message: RESOURCE($.language, 'error.diploma.forbidden') });
                    return;
                }
            }

            if (!model.name || !model.name.trim()) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.diploma.name') });
                return;
            }

            if (RULE_MODES.indexOf(model.ruleMode) === -1) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            let invalidRegex = findInvalidRegexRule(model.matchRules);
            if (invalidRegex) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.diploma.rule.regex') + ' (' + invalidRegex + ')' });
                return;
            }

            let invalidModeGroup = findInvalidGroupRule(model.matchRules, 'mode', ADIF_MODES.GROUP_NAMES);
            if (invalidModeGroup) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.diploma.rule.group') + ' (' + invalidModeGroup + ')' });
                return;
            }

            let invalidBandGroup = findInvalidGroupRule(model.matchRules, 'band', ADIF_BANDS.GROUP_NAMES);
            if (invalidBandGroup) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.diploma.rule.band.group') + ' (' + invalidBandGroup + ')' });
                return;
            }

            // Automatikus elfogadás (felhasználói kérésre): ha a rule-engine
            // automatikusan elfogad egy beadványt, a manager-review-t átugorva
            // AZONNAL kiadjuk az oklevelet (lásd controllers/submissions.js
            // upload_submission + schemas/submissions/submissions.js
            // approveSubmission). Ez ÖSSZEEGYEZTETHETETLEN a QSL-
            // mintavételezéssel (ahhoz a beadónak fel kellene töltenie egy
            // igazolást, mielőtt bármi kiadásra kerülne — az "azonnal"
            // ígéretét törné) és a fizikai kézbesítéssel (annak manager-i
            // egyeztetést/kifizetést igényel, nem "azonnal" jár) — ezért ezt
            // itt, mentéskor kikényszerítjük, nem csak a felületen tiltjuk.
            let autoApprove = !!model.autoApprove;

            if (autoApprove && (Math.max(0, Number(model.qslSampleCount) || 0) > 0 || !!model.physicalOfferEnabled)) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.diploma.autoapprove.conflict') });
                return;
            }

            let type = DIPLOMA_TYPES.indexOf(model.type) !== -1 ? model.type : 'standard';
            let challenge = type === 'challenge' ? sanitizeChallenge(model.challenge) : {};

            if (type === 'challenge') {
                if (!challenge.targetField) {
                    $.callback({ success: false, message: RESOURCE($.language, 'error.diploma.challenge.target_field') });
                    return;
                }

                if (!challenge.targetPool.length) {
                    $.callback({ success: false, message: RESOURCE($.language, 'error.diploma.challenge.pool_empty') });
                    return;
                }

                // Ismétlés nélkül a poolnak legalább annyi elemet kell tartalmaznia,
                // ahányszor a teljes kihívás alatt sorsolásra kerül (körök száma *
                // körönkénti sorsolás) -- különben egy körben a rendszer elfogyna a
                // sorsolható (még nem húzott) elemekből.
                if (!challenge.allowRepeatAcrossRounds && challenge.targetPool.length < challenge.drawPerRound * challenge.totalRounds) {
                    $.callback({ success: false, message: RESOURCE($.language, 'error.diploma.challenge.pool_too_small') });
                    return;
                }
            }

            // Felelős manager (opcionális) — csak a MÁR 'manager' jogosultsággal (vagy
            // sa-val) rendelkező felhasználók közül választható, lásd a diploma-listán
            // és (a publikus felület elkészültekor, 5. lépés) a nyilvános oldalon is
            // megjelenő "kit kell keresni ezzel a diplomával kapcsolatban" infó.
            // A hozzárendelés kiosztása/átvétele szándékosan SA-ONLY — egy plain
            // manager nem veheti el/adhatja át a saját (vagy más) diplomáját, ezért
            // az ő esetében a mentés figyelmen kívül hagyja a beküldött managerId-t,
            // és megtartja a diploma jelenlegi hozzárendelését.
            let managerId = $.user.sa ? (model.managerId || '').trim() : ((existingDiploma && existingDiploma.managerId) || '');

            if (managerId && !/^[0-9a-f]{24}$/i.test(managerId)) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.diploma.manager.invalid') });
                return;
            }

            if (managerId) {
                let managerUser = await MDB.findOne(process.env.MONGODB_DB_NAME, 'users', { _id: MDB.ObjectID(managerId) }, { projection: { permissions: 1, sa: 1 } });

                if (isDbError(managerUser) || !managerUser || !(managerUser.sa || (managerUser.permissions || []).indexOf('manager') !== -1)) {
                    $.callback({ success: false, message: RESOURCE($.language, 'error.diploma.manager.invalid') });
                    return;
                }
            }

            let matchRules = sanitizeMatchRules(model.matchRules);
            let overlayFields = sanitizeOverlayFields(model.overlayFields);
            // Felhasználói kérésre a betűméret NEM mezőnkénti, hanem egységes az
            // egész oklevélen (lásd modules/certificate-renderer.js kommentjét) — a
            // font is egy zárt, ténylegesen telepített betűtípus-listából
            // választható, nem szabad szöveg.
            let overlayFontFamily = CERT_RENDERER.FONT_FAMILIES[model.overlayFontFamily] ? model.overlayFontFamily : CERT_RENDERER.DEFAULT_FONT_FAMILY;
            let overlayFontSize = Number(model.overlayFontSize) > 0 ? Math.min(200, Math.max(6, Number(model.overlayFontSize))) : CERT_RENDERER.DEFAULT_FONT_SIZE;
            let paymentMethods = Array.isArray(model.paymentMethods) ? model.paymentMethods.filter(m => PAYMENT_METHODS.indexOf(m) !== -1) : [];
            let status = STATUSES.indexOf(model.status) !== -1 ? model.status : 'draft';
            let duplicatePolicy = DUPLICATE_POLICIES.indexOf(model.duplicatePolicy) !== -1 ? model.duplicatePolicy : 'per_band_mode';

            // Fokozatok csak pontozás módban értelmezettek (lásd a CATEGORY_MODE_FILTERS
            // fölötti komment) — checklist módban mindig kikapcsolt állapotba kényszerítjük.
            let tiersEnabled = model.ruleMode === 'points' && !!model.tiersEnabled;
            let categoriesEnabled = tiersEnabled && !!model.categoriesEnabled;
            let categories = sanitizeCategories(model.categories, tiersEnabled, categoriesEnabled);

            let set = {
                name: model.name.trim(),
                description: (model.description || '').trim(),
                managerId: managerId || null,
                deadlineType: model.deadlineType === 'deadline' ? 'deadline' : 'continuous',
                deadlineDate: model.deadlineType === 'deadline' && model.deadlineDate ? new Date(model.deadlineDate) : null,
                ruleMode: model.ruleMode,
                duplicatePolicy: duplicatePolicy,
                // Engedélyezett sávok — diploma-szintű, globális ÉRVÉNYESSÉGI szűrő,
                // FÜGGETLEN a matchRules 'band' mezőjétől: az utóbbi PONTOT ad egy
                // sávra (vagy nem ad, ha nincs ilyen szabály), ez itt viszont azt
                // dönti el, hogy egy QSO EGYÁLTALÁN beleszámítható-e a diplomába,
                // pontozástól függetlenül — pl. egy HF verseny diplománál a manager
                // megadja, hogy csak 80m/40m/20m érvényes, és egy 2m-es QSO a
                // naplóban emiatt automatikusan érvénytelen, akkor is, ha egyébként
                // teljesítené a checklist/pontozás szabályokat. Üres tömb = nincs
                // sáv-korlátozás (minden sáv érvényes). A tényleges kiszűrés a 6.
                // lépés rule-engine-jében történik majd, itt egyelőre csak a
                // diploma-szintű beállítás készül el.
                allowedBands: sanitizeAllowedBands(model.allowedBands),
                matchRules: matchRules,
                // Átjátszó (repeater) használat diploma-szintű, globális szabálya —
                // NEM matchRules-soronkénti (a mennyire additív pontozás nem fér össze
                // jól egy "nem engedélyezett -> az egész QSO kizárva" logikával). Ha
                // repeaterAllowed=false, egy átjátszón keresztül történt QSO egyáltalán
                // nem számít bele a diplomába; ha true, a repeaterPoints (csak pontozás
                // módban értelmezett) adja meg, hány pontot ér egy ilyen összeköttetés.
                // A tényleges alkalmazás a 6. lépés rule-engine-jében történik majd.
                repeaterAllowed: model.repeaterAllowed !== false,
                repeaterPoints: Math.max(0, Number(model.repeaterPoints) || 0),
                tiersEnabled: tiersEnabled,
                categoriesEnabled: categoriesEnabled,
                categories: categories,
                overlayFontFamily: overlayFontFamily,
                overlayFontSize: overlayFontSize,
                zoneThresholds: {
                    home: numOrNull(model.zoneThresholds && model.zoneThresholds.home),
                    eu: numOrNull(model.zoneThresholds && model.zoneThresholds.eu),
                    dx: numOrNull(model.zoneThresholds && model.zoneThresholds.dx)
                },
                homeCountry: (model.homeCountry || '').toUpperCase(),
                qslSampleCount: Math.max(0, Number(model.qslSampleCount) || 0),
                pricing: {
                    pdfFee: Math.max(0, Number(model.pricing && model.pricing.pdfFee) || 0),
                    physicalFee: Math.max(0, Number(model.pricing && model.pricing.physicalFee) || 0),
                    currency: (model.pricing && model.pricing.currency) || 'EUR'
                },
                physicalOfferEnabled: !!model.physicalOfferEnabled,
                autoApprove: autoApprove,
                paymentMethods: paymentMethods,
                bankTransferDetails: {
                    accountName: (model.bankTransferDetails && model.bankTransferDetails.accountName) || '',
                    iban: (model.bankTransferDetails && model.bankTransferDetails.iban) || '',
                    note: (model.bankTransferDetails && model.bankTransferDetails.note) || ''
                },
                overlayFields: overlayFields,
                status: status,
                updated: new Date()
            };

            set.type = type;
            set.challenge = challenge;

            // A STANDARD-only mezőket (rule-engine beállítások) 'challenge' típusnál
            // az alapértelmezett/üres értékükre kényszerítjük -- ugyanaz a minta, mint
            // ahogy a tiersEnabled is már ma is false-ra kényszerül checklist módban.
            // Így egy korábban standard diplomából challenge-re váltott dokumentumon
            // sem marad értelmezhetetlen/félrevezető rule-engine adat.
            if (type === 'challenge') {
                set.ruleMode = 'checklist';
                set.matchRules = [];
                set.duplicatePolicy = 'per_band_mode';
                set.allowedBands = [];
                set.repeaterAllowed = true;
                set.repeaterPoints = 0;
                set.tiersEnabled = false;
                set.categoriesEnabled = false;
                set.categories = [];
                set.zoneThresholds = { home: null, eu: null, dx: null };
                set.qslSampleCount = 0;
                set.autoApprove = false;
            }

            if (model.id) {
                let update = await MDB.updateOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(model.id) }, set);

                if (isDbError(update)) {
                    $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                    return;
                }

                FUNC.logger($, `Diplomas/Diplomas save (update): ${model.id} -> ${set.name}`);
                $.callback({ success: true, id: model.id });
                return;
            }

            set.serialStart = Math.max(1, Number(model.serialStart) || DEFAULT_SERIAL_START);
            set.serialCounter = set.serialStart;
            set.blankImage = null;
            set.createdBy = $.user._id;
            set.created = new Date();

            let insert = await MDB.insertOne(process.env.MONGODB_DB_NAME, 'diplomas', set);

            if (isDbError(insert) || !insert.insertedId) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            FUNC.logger($, `Diplomas/Diplomas save (create): ${insert.insertedId} -> ${set.name}`);
            $.callback({ success: true, id: String(insert.insertedId) });
        }
    });
});

function isDbError(result) {
    return Array.isArray(result) && result[0] != null && result[0].error != null;
}

// Superadmin mindent lát/kezelhet; plain manager csak a HOZZÁ rendelt
// (managerId === user._id) diplomát — lásd query/get/previewRender/delete/save
// actionök ugyanezen szabályát. `diploma` hiánya (nem létező/törölt rekord)
// nem-sa esetén is elutasításnak számít, hogy ne lehessen a létezéséről sem
// információt szerezni.
function isDiplomaManagerOf(user, diploma) {
    if (!user)
        return false;

    if (user.sa)
        return true;

    return !!(diploma && diploma.managerId && diploma.managerId === user._id);
}

function numOrNull(value) {
    return value === '' || value == null ? null : Number(value);
}

// A diploma-szintű felelős manager (managerId) megjelenítéséhez feloldja a
// hozzá tartozó user email/hívójel adatait, és `managerInfo` mezőként ráakasztja
// minden diploma-objektumra a `diplomas` tömbben (helyben módosít). SZÁNDÉKOSAN
// NEM denormalizált/tárolt mező a diploma dokumentumon — csak a `managerId`
// (string, users._id) van elmentve —, hogy ne menjen szét a diploma és a user
// adata, ha valaki utólag megváltoztatja a hívójelét/email-jét. A `query` és a
// `get` action is ezen keresztül hívja (get esetén 1 elemű tömbbel).
async function attachManagerInfo(diplomas) {
    let ids = diplomas.map(d => d.managerId).filter(id => id);

    if (!ids.length)
        return;

    let managers = await MDB.find(process.env.MONGODB_DB_NAME, 'users', { _id: { $in: ids.map(id => MDB.ObjectID(id)) } }, {
        projection: { email: 1, callsign: 1 }
    });

    if (isDbError(managers))
        return;

    let byId = {};
    for (let i = 0, n = managers.length; i < n; i++) {
        byId[String(managers[i]._id)] = managers[i];
    }

    for (let i = 0, n = diplomas.length; i < n; i++) {
        let manager = diplomas[i].managerId && byId[diplomas[i].managerId];
        diplomas[i].managerInfo = manager ? { email: manager.email, callsign: manager.callsign } : null;
    }
}

// Visszaadja az első érvénytelen regex mintát (stringként), vagy null-t, ha minden
// 'regex' operátorú szabály mintája érvényes reguláris kifejezés.
function findInvalidRegexRule(rules) {
    if (!Array.isArray(rules))
        return null;

    for (let i = 0, n = rules.length; i < n; i++) {
        let rule = rules[i];

        if (!rule || rule.operator !== 'regex')
            continue;

        let pattern = String(rule.value || '').trim();

        if (!pattern)
            continue;

        try {
            new RegExp(pattern);
        } catch (e) {
            return pattern;
        }
    }

    return null;
}

// Visszaadja az első érvénytelen csoportnevet egy adott mezőre (pl. 'mode' ->
// ADIF_MODES.GROUP_NAMES, 'band' -> ADIF_BANDS.GROUP_NAMES), vagy null-t, ha
// minden erre a mezőre vonatkozó 'group' operátorú szabály értéke létező csoport.
function findInvalidGroupRule(rules, field, groupNames) {
    if (!Array.isArray(rules))
        return null;

    for (let i = 0, n = rules.length; i < n; i++) {
        let rule = rules[i];

        if (!rule || rule.field !== field || rule.operator !== 'group')
            continue;

        let group = String(rule.value || '').trim().toUpperCase();

        if (group && groupNames.indexOf(group) === -1)
            return group;
    }

    return null;
}

// Diploma-szintű "engedélyezett sávok" lista tisztítása — lásd a `set.allowedBands`
// fölötti kommentet a `save` action-ben a matchRules 'band' mezőjétől való
// eltérésről. Kisbetűsítve (ADIF konvenció, mint a matchRules 'band' értékeinél),
// duplikátum-szűréssel, névtelen/üres elem eldobva. NEM validáljuk szigorúan az
// ADIF_BANDS.ALL listához — ugyanaz az elv, mint a matchRules 'band' mezőjénél:
// a lista csak a gyakori sávokat tartalmazza, a manager szabadon megadhat mást is.
function sanitizeAllowedBands(bands) {
    if (!Array.isArray(bands))
        return [];

    let output = [];
    let used = {};

    for (let i = 0, n = bands.length; i < n; i++) {
        let band = String(bands[i] || '').trim().toLowerCase();

        if (!band || used[band])
            continue;

        used[band] = true;
        output.push(band);
    }

    return output;
}

// Ugyanaz, mint a sanitizeAllowedBands, csak adásmódokra (nagybetűsítve, az ADIF
// MODE konvenciónak megfelelően — lásd matchRules 'mode' mezőjét). Jelenleg a
// challenge diploma-típus "engedélyezett adásmódok" szűrőjéhez kell (lásd
// sanitizeChallenge) — standard típusnál ugyanezt a szerepet a matchRules 'mode'
// mezője tölti be, ott nincs rá szükség külön.
function sanitizeAllowedModes(modes) {
    if (!Array.isArray(modes))
        return [];

    let output = [];
    let used = {};

    for (let i = 0, n = modes.length; i < n; i++) {
        let mode = String(modes[i] || '').trim().toUpperCase();

        if (!mode || used[mode])
            continue;

        used[mode] = true;
        output.push(mode);
    }

    return output;
}

function sanitizeMatchRules(rules) {
    if (!Array.isArray(rules))
        return [];

    let output = [];

    for (let i = 0, n = rules.length; i < n; i++) {
        let rule = rules[i];

        if (!rule || RULE_FIELDS.indexOf(rule.field) === -1 || RULE_OPERATORS.indexOf(rule.operator) === -1)
            continue;

        let value = rule.value;
        if (rule.operator === 'in_list') {
            value = Array.isArray(value) ? value : String(value || '').split(',').map(v => v.trim()).filter(v => v);
        } else {
            value = String(value || '').trim();
        }

        // Az adásmód-értékeket (konkrét mód VAGY csoportnév) egységesen nagybetűsen
        // tároljuk, mert az ADIF MODE mező is így definiált, és a jövőbeli
        // rule-engine (6. lépés) kis-nagybetű-független összehasonlítást spórol meg.
        if (rule.field === 'mode') {
            value = Array.isArray(value) ? value.map(v => v.toUpperCase()) : value.toUpperCase();
        }

        // A sáv-értékeket (konkrét sáv, pl. "80M") egységesen kisbetűsen tároljuk
        // ("80m") — az ADIF BAND mező is így definiált, a csoportnév (pl. "VHF")
        // viszont nagybetűsen (ugyanaz a konvenció, mint a mode-csoportoknál).
        if (rule.field === 'band') {
            if (rule.operator === 'group') {
                value = String(value).toUpperCase();
            } else {
                value = Array.isArray(value) ? value.map(v => v.toLowerCase()) : value.toLowerCase();
            }
        }

        if (!value || (Array.isArray(value) && !value.length))
            continue;

        output.push({
            field: rule.field,
            operator: rule.operator,
            value: value,
            points: Math.max(0, Number(rule.points) || 0),
            label: (rule.label || '').trim()
        });
    }

    return output;
}

// Ékezet nélküli, kötőjeles kulcsot állít elő egy szabad szövegű címkéből (pl.
// "Ezüst" -> "ezust"), hogy a kategóriák/fokozatok stabil, gépi azonosítóval
// rendelkezzenek (ezt fogja használni majd a 6. lépés rule-engine-je és a
// submissions kollekció, hogy egy beadványt egy adott kategória+fokozat
// kombinációhoz kössön).
function slugify(text) {
    return String(text || '').trim().toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '') || 'item';
}

// Egy kategórián belüli fokozat-létrát (pl. Bronz/Ezüst/Arany) tisztít: névtelen
// sorokat eldob, a pontszámot 0-nál nem engedi kisebbre. A `minPoints` NEM egy
// szám, hanem `{home, eu, dx}` — a user rájött, hogy ha a diplománál körzet
// szerint más a minimum (lásd diploma-szintű `zoneThresholds`), akkor egy adott
// fokozat elérési küszöbe is más lehet körzetenként (pl. egy DX állomásnak
// nehezebb ugyanannyi pontot összeszednie, mint egy hazainak). A végén a `home`
// érték szerint növekvő sorrendbe rendezünk — feltételezve, hogy a manager
// mindhárom körzetben KONZISZTENSEN növekvő sorrendben tölti ki a fokozatokat
// (pl. Bronz.home < Ezüst.home < Arany.home, és ugyanígy EU-ban/DX-ben is) —,
// hogy a rule-engine a `home` mező alapján egyszerűen a legmagasabb olyan
// fokozatot választhassa majd, aminek minPoints[zóna] <= elért pontszám.
function sanitizeTiers(tiers) {
    if (!Array.isArray(tiers))
        return [];

    let output = [];
    let usedKeys = {};

    for (let i = 0, n = tiers.length; i < n; i++) {
        let tier = tiers[i];

        if (!tier)
            continue;

        let label = (tier.label || '').trim();

        if (!label)
            continue;

        let key = slugify(label);
        let counter = 2;
        while (usedKeys[key]) {
            key = slugify(label) + '-' + counter;
            counter++;
        }
        usedKeys[key] = true;

        let minPoints = tier.minPoints || {};

        output.push({
            key: key,
            label: label,
            minPoints: {
                home: Math.max(0, Number(minPoints.home) || 0),
                eu: Math.max(0, Number(minPoints.eu) || 0),
                dx: Math.max(0, Number(minPoints.dx) || 0)
            }
        });
    }

    output.sort((a, b) => a.minPoints.home - b.minPoints.home);
    return output;
}

// A kategória "neve" NEM szabad szöveg (ez korábban egy külön input volt, de a
// felhasználó jelezte, hogy ez fölösleges és zavaró — nem világos, mi a
// kapcsolat egy szabadon beírt névvel és az adásmód-szűrővel). Ehelyett a
// kategória neve MINDIG az adásmód-szűrőből származik — a manager csak a
// szűrőt választja ki, a megjelenő címke automatikusan követi azt.
const CATEGORY_LABELS = { CW: 'CW', PHONE: 'Phone', DIGITAL: 'Digital', IMAGE: 'Image' };
function categoryLabelFor(modeFilter) {
    return modeFilter ? (CATEGORY_LABELS[modeFilter] || modeFilter) : 'Mixed';
}

// Ha a fokozatok nincsenek bekapcsolva, üres tömböt tárolunk. Ha be vannak
// kapcsolva de az adásmód szerinti kategóriák nincsenek, a bemenetet 1 elemre
// vágjuk (implicit "Mixed" kategória, modeFilter nélkül) — így a rule-engine
// mindig egységesen `categories` tömbön iterálhat majd, függetlenül attól, hogy a
// manager használt-e adásmód szerinti bontást. Egy adásmód-szűrő (pl. "CW")
// csak egyszer szerepelhet — ismétlődő kategóriát (pl. két "CW" sor) eldobjuk,
// mert a névnek úgyis egyeznie kellene, ami értelmetlen duplikátumot adna.
function sanitizeCategories(categories, tiersEnabled, categoriesEnabled) {
    if (!tiersEnabled || !Array.isArray(categories))
        return [];

    let source = categoriesEnabled ? categories : categories.slice(0, 1);
    let output = [];
    let usedModeFilters = {};

    for (let i = 0, n = source.length; i < n; i++) {
        let category = source[i];

        if (!category)
            continue;

        let tiers = sanitizeTiers(category.tiers);

        if (!tiers.length)
            continue;

        let modeFilter = categoriesEnabled ? String(category.modeFilter || '').trim().toUpperCase() : '';
        if (CATEGORY_MODE_FILTERS.indexOf(modeFilter) === -1)
            modeFilter = null;

        let dedupeKey = modeFilter || 'MIXED';

        if (usedModeFilters[dedupeKey])
            continue;

        usedModeFilters[dedupeKey] = true;

        let label = categoryLabelFor(modeFilter);

        output.push({
            key: slugify(label),
            label: label,
            modeFilter: modeFilter,
            tiers: tiers
        });
    }

    return output;
}

// Célpont-pool egy sorát tisztítja: `value` kötelező (targetField szerint
// normalizálva -- hívójelnél nagybetűsítve, mint a matchRules 'mode' mezőjénél),
// `label` opcionális szabad megjelenítő szöveg. Duplikált (normalizált) `value`
// csak egyszer kerül be, üres sor eldobva.
function sanitizeChallengePool(pool, targetField) {
    if (!Array.isArray(pool))
        return [];

    let output = [];
    let used = {};

    for (let i = 0, n = pool.length; i < n; i++) {
        let item = pool[i];

        if (!item)
            continue;

        let value = String(item.value || '').trim();

        if (!value)
            continue;

        if (targetField === 'call')
            value = value.toUpperCase();

        let dedupeKey = value.toUpperCase();

        if (used[dedupeKey])
            continue;

        used[dedupeKey] = true;

        output.push({ value: value, label: String(item.label || '').trim() });
    }

    return output;
}

// A challenge-specifikus beállítások tisztítása -- csak 'challenge' típusú
// diplománál hívjuk (lásd save action), 'standard' típusnál a diploma dokumentum
// `challenge` mezője mindig üres `{}`, hogy ne maradjon rajta értelmezhetetlen
// adat. FONTOS HATÓKÖR: ez itt csak az ADMIN KONFIGURÁCIÓ tisztítása -- a
// tényleges sorsolás/kör-egyeztetés logikája egy KÉSŐBBI lépés (lásd a
// CHALLENGE_TARGET_FIELDS fölötti kommentet).
function sanitizeChallenge(challenge) {
    challenge = challenge || {};

    let targetField = CHALLENGE_TARGET_FIELDS.indexOf(challenge.targetField) !== -1 ? challenge.targetField : null;
    let drawPerRound = Math.max(1, Math.floor(Number(challenge.drawPerRound)) || 1);
    let totalRounds = Math.max(1, Math.floor(Number(challenge.totalRounds)) || 1);
    let allowRepeatAcrossRounds = !!challenge.allowRepeatAcrossRounds;
    let roundDeadlineDays = Number(challenge.roundDeadlineDays) > 0 ? Math.floor(Number(challenge.roundDeadlineDays)) : null;
    let qslSampleCount = Math.max(0, Number(challenge.qslSampleCount) || 0);

    return {
        targetField: targetField,
        targetPool: sanitizeChallengePool(challenge.targetPool, targetField),
        drawPerRound: drawPerRound,
        totalRounds: totalRounds,
        allowRepeatAcrossRounds: allowRepeatAcrossRounds,
        roundDeadlineDays: roundDeadlineDays,
        qslSampleCount: qslSampleCount,
        // Engedélyezett sávok/adásmódok — ugyanaz az ÉRVÉNYESSÉGI szűrő elv, mint a
        // standard diploma-szintű `allowedBands`-nál (lásd a `save` action fölötti
        // kommentet): üres tömb = nincs korlátozás, egyébként egy körben csak az
        // itt felsorolt sávon/adásmóddal teljesített QSO érvényes. Standard
        // típusnál erre a matchRules 'mode'/'band' mezője (és a diploma-szintű
        // allowedBands) szolgál, de a challenge típus NEM használja a matchRules-t,
        // ezért itt, a challenge-objektumon belül kap saját szűrőt.
        allowedBands: sanitizeAllowedBands(challenge.allowedBands),
        allowedModes: sanitizeAllowedModes(challenge.allowedModes)
    };
}

function sanitizeOverlayFields(fields) {
    if (!Array.isArray(fields))
        return [];

    let output = [];

    for (let i = 0, n = fields.length; i < n; i++) {
        let field = fields[i];

        if (!field || OVERLAY_KEYS.indexOf(field.key) === -1)
            continue;

        output.push({
            key: field.key,
            top: Math.min(100, Math.max(0, Number(field.top) || 0)),
            left: Math.min(100, Math.max(0, Number(field.left) || 0)),
            align: ['left', 'center', 'right'].indexOf(field.align) !== -1 ? field.align : 'center'
        });
    }

    return output;
}
