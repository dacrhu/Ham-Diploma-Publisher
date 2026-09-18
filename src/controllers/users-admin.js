// Superadmin-only user management (/admin/users) — at user request:
// paginated/searchable list, individual detail page (with submissions), ban/
// unban, granting/revoking manager permission (the latter two via the
// schemas/users/users.js setStatus/setManager actions, where the exact
// permission rules are commented).
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
