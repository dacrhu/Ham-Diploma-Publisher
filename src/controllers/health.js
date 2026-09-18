exports.install = function () {
    ROUTE('GET /health', view_health);
};

function view_health() {
    this.json({ name: CONF.name, version: CONF.version, status: 'ok' });
}
