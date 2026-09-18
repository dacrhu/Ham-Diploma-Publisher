// countries.js — ISO 3166-1 alpha-2 országkód-lista + EU-tagság + lokalizált név.
// A névfordítást a Node beépített Intl.DisplayNames-ével oldjuk meg (nincs szükség
// külön npm csomagra/statikus fordítási táblára) — csak a kódlistát és az
// EU-tagságot tartjuk itt karban. A zászló SVG-k az EHS4 mintaprojektből lettek
// átemelve: `src/public/flags/{code}.svg` (kisbetűs kód).
//
// Zóna-számításhoz (diplomák körzet szerinti ponthatára) használatos: `isEU(code)`.

global.COUNTRIES = {};

// Zászlóval rendelkező, valódi ISO 3166-1 alpha-2 kódok (EU/UN/XX kizárva — nem országok).
const CODES = ["AD","AE","AF","AG","AI","AL","AM","AO","AQ","AR","AS","AT","AU","AW","AX","AZ","BA","BB","BD","BE","BF","BG","BH","BI","BJ","BL","BM","BN","BO","BQ","BR","BS","BT","BV","BW","BY","BZ","CA","CC","CD","CF","CG","CH","CI","CK","CL","CM","CN","CO","CP","CR","CU","CV","CW","CX","CY","CZ","DE","DG","DJ","DK","DM","DO","DZ","EC","EE","EG","EH","ER","ES","ET","FI","FJ","FK","FM","FO","FR","GA","GB","GD","GE","GF","GG","GH","GI","GL","GM","GN","GP","GQ","GR","GS","GT","GU","GW","GY","HK","HM","HN","HR","HT","HU","IC","ID","IE","IL","IM","IN","IO","IQ","IR","IS","IT","JE","JM","JO","JP","KE","KG","KH","KI","KM","KN","KP","KR","KW","KY","KZ","LA","LB","LC","LI","LK","LR","LS","LT","LU","LV","LY","MA","MC","MD","ME","MF","MG","MH","MK","ML","MM","MN","MO","MP","MQ","MR","MS","MT","MU","MV","MW","MX","MY","MZ","NA","NC","NE","NF","NG","NI","NL","NO","NP","NR","NU","NZ","OM","PA","PE","PF","PG","PH","PK","PL","PM","PN","PR","PS","PT","PW","PY","QA","RE","RO","RS","RU","RW","SA","SB","SC","SD","SE","SG","SH","SI","SJ","SK","SL","SM","SN","SO","SR","SS","ST","SV","SX","SY","SZ","TC","TD","TF","TG","TH","TJ","TK","TL","TM","TN","TO","TR","TT","TV","TW","TZ","UA","UG","UM","US","UY","UZ","VA","VC","VE","VG","VI","VN","VU","WF","WS","XK","YE","YT","ZA","ZM","ZW"];

// Jelenlegi EU-tagállamok (27).
const EU_MEMBERS = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];

const SUPPORTED_LANGUAGES = ['hu', 'en', 'de'];
const displayNamesCache = {};
const listCache = {};

function getDisplayNames(language) {
    language = SUPPORTED_LANGUAGES.indexOf(language) !== -1 ? language : 'en';
    if (!displayNamesCache[language]) {
        displayNamesCache[language] = new Intl.DisplayNames([language], { type: 'region', fallback: 'code' });
    }
    return displayNamesCache[language];
}

COUNTRIES.codes = CODES;

COUNTRIES.isEU = function (code) {
    return EU_MEMBERS.indexOf((code || '').toUpperCase()) !== -1;
};

COUNTRIES.name = function (code, language) {
    code = (code || '').toUpperCase();
    try {
        return getDisplayNames(language).of(code) || code;
    } catch (e) {
        return code;
    }
};

// [{code, name, eu}], a lokalizált név szerint rendezve — nyelvenként cache-elve.
COUNTRIES.list = function (language) {
    language = SUPPORTED_LANGUAGES.indexOf(language) !== -1 ? language : 'en';
    if (!listCache[language]) {
        let dn = getDisplayNames(language);
        let items = [];
        for (let i = 0, n = CODES.length; i < n; i++) {
            items.push({ code: CODES[i], name: dn.of(CODES[i]) || CODES[i], eu: COUNTRIES.isEU(CODES[i]) });
        }
        items.sort((a, b) => a.name.localeCompare(b.name, language));
        listCache[language] = items;
    }
    return listCache[language];
};
