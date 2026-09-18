// Superadmin-only felhasználó-kezelő (/admin/users) — felhasználói kérésre:
// lapozható/kereshető lista, egyedi adatlap (beadványokkal), tiltás/
// visszakapcsolás, manager-jogosultság kiosztása/visszavonása (utóbbi kettő a
// schemas/users/users.js setStatus/setManager actionjein keresztül, ott a
// pontos jogosultsági szabályok kommentelve).
exports.install = function () {
    ROUTE('GET /admin/users', view_list);
    ROUTE('GET /admin/users/{id}', view_detail);
    ROUTE('+GET /api/admin/users/search *Users/Users --> adminList');
    ROUTE('+GET /api/admin/users/{id}/detail *Users/Users --> adminGet');
    ROUTE('+POST /api/admin/users/{id}/status *Users/Users --> setStatus');
    ROUTE('+GET /api/admin/users/{id}/submissions *Submissions/Submissions --> adminForUser');
};

function isSa(self) {
    return !!(self.user && self.user.sa);
}

function view_list() {
    let self = this;

    if (!isSa(self)) {
        self.redirect('/');
        return;
    }

    self.view('list');
}

function view_detail() {
    let self = this;

    if (!isSa(self)) {
        self.redirect('/');
        return;
    }

    self.repository.userId = self.params.id;
    self.view('detail');
}
