// common.js — shared frontend logic (pagination, menu, tab handling).
// Carried over from the technology reference project's (EHS4) common.js, with
// HDP-specific renames (localStorage key, etc.).

setActiveMenuItem();

function setActiveMenuItem() {
    let active = document.querySelector(`#menu_main a[href="${window.location.pathname}"]`);

    if (active) {
        active.classList.add('is-active');
    }
}

// ---- Page size: how many items to show per page ----
const PAGE_SIZE_VALUES = [25, 50, 100];
const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_STORAGE_KEY = 'hdp_page_size';

function getPageSize() {
    try {
        let stored = parseInt(localStorage.getItem(PAGE_SIZE_STORAGE_KEY), 10);
        if (PAGE_SIZE_VALUES.indexOf(stored) !== -1) {
            return stored;
        }
    } catch (e) {
        // local storage not available
    }
    return PAGE_SIZE_DEFAULT;
}

// Fills a page-size-selector <select> with the fixed values and binds it.
// el: element or id; onChange(size): runs after saving.
// All .page-size-select elements on the page stay in sync.
function bindPageSizeSelect(el, onChange) {
    if (typeof el === 'string') {
        el = document.getElementById(el);
    }
    if (!el) {
        return;
    }

    el.classList.add('page-size-select');
    el.innerHTML = '';
    for (let i = 0, n = PAGE_SIZE_VALUES.length; i < n; i++) {
        let option = document.createElement('option');
        option.value = PAGE_SIZE_VALUES[i];
        option.textContent = PAGE_SIZE_VALUES[i];
        el.appendChild(option);
    }
    el.value = getPageSize();

    feEventId(el, 'onchange', function () {
        try {
            localStorage.setItem(PAGE_SIZE_STORAGE_KEY, this.value);
        } catch (e) {
            // local storage not available
        }
        let selects = document.getElementsByClassName('page-size-select');
        for (let i = 0, n = selects.length; i < n; i++) {
            if (selects[i] !== this) {
                selects[i].value = this.value;
            }
        }
        if (typeof onChange === 'function') {
            onChange(Number(this.value));
        }
    });
}

// Binds the #page_size_select dropdown for server-side paginated lists.
// reloadFn: the given list's reload function (usually getTableData).
function initPageSize(reloadFn) {
    bindPageSizeSelect('page_size_select', function (size) {
        max = size;
        page = 0;
        if (typeof reloadFn === 'function') {
            reloadFn();
        }
    });
}

// Client-side pagination: renders the pagination control into `container`, and
// returns the current page's [start, end) range (the caller uses this to slice the list).
function clientPage(container, total, page, size, onChange) {
    let pages = Math.max(1, Math.ceil(total / size));
    if (page < 0) {
        page = 0;
    }
    if (page > pages - 1) {
        page = pages - 1;
    }

    if (container) {
        if (total <= size) {
            container.innerHTML = '';
        } else {
            let from = page * size + 1;
            let to = Math.min(total, (page + 1) * size);
            container.innerHTML =
                '<nav class="pagination is-small mt-2" role="navigation" aria-label="pagination">' +
                    '<a class="pagination-previous' + (page <= 0 ? ' is-disabled' : '') + '">&laquo;</a>' +
                    '<a class="pagination-next' + (page >= pages - 1 ? ' is-disabled' : '') + '">&raquo;</a>' +
                    '<ul class="pagination-list"><li><span class="pagination-ellipsis">' +
                        from + '–' + to + ' / ' + total +
                    '</span></li></ul>' +
                '</nav>';

            let prev = container.querySelector('.pagination-previous');
            let next = container.querySelector('.pagination-next');
            prev.onclick = function () {
                if (page > 0) {
                    onChange(page - 1);
                }
            };
            next.onclick = function () {
                if (page < pages - 1) {
                    onChange(page + 1);
                }
            };
        }
    }

    return { start: page * size, end: (page + 1) * size, page: page };
}

function pagination(json, fn) {
    maxPage = Math.floor(json.countFull / max);
    paginationButtons(page, maxPage);

    feEventClass('pagination-previous', 'onclick', function () {
        if (!this.classList.contains('is-disabled')) {
            page--;
            fn();
            feToTop();
        }
    }, true);

    feEventClass('pagination-next', 'onclick', function () {
        if (!this.classList.contains('is-disabled')) {
            page++;
            fn();
            feToTop();
        }
    }, true);

    feEventClass('pagination-link', 'onclick', function () {
        page = this.getAttribute('aria-label');
        fn();
        feToTop();
    });
}

function paginationButtons(page, maxPage) {
    page = Number(page);
    maxPage = Number(maxPage);

    let previous = document.querySelectorAll('.pagination-previous');
    let next = document.querySelectorAll('.pagination-next');
    let lists = document.querySelectorAll('.pagination-list');

    if (page <= 0) {
        for (let i = 0, n = previous.length; i < n; i++) {
            previous[i].classList.add('is-disabled');
        }
    } else {
        for (let i = 0, n = previous.length; i < n; i++) {
            previous[i].classList.remove('is-disabled');
        }
    }

    if (page == maxPage || maxPage < 1) {
        for (let i = 0, n = next.length; i < n; i++) {
            next[i].classList.add('is-disabled');
        }
    } else {
        for (let i = 0, n = next.length; i < n; i++) {
            next[i].classList.remove('is-disabled');
        }
    }

    for (let i = 0, n = lists.length; i < n; i++) {
        let list = lists[i];
        list.innerHTML = '';

        if (page !== 0) {
            list.insertAdjacentHTML('beforeend', '<li><a class="pagination-link" aria-label="0">1</a></li>');
            list.insertAdjacentHTML('beforeend', '<li><span class="pagination-ellipsis">&hellip;</span></li>');
        }

        if (page > 50) {
            list.insertAdjacentHTML('beforeend', `<li><a class="pagination-link" aria-label="${page - 50}">${page - 49}</a></li>`);
        }

        if (page > 10) {
            list.insertAdjacentHTML('beforeend', `<li><a class="pagination-link" aria-label="${page - 10}">${page - 9}</a></li>`);
            list.insertAdjacentHTML('beforeend', '<li><span class="pagination-ellipsis">&hellip;</span></li>');
        }

        list.insertAdjacentHTML('beforeend', `<li><a class="pagination-link is-current" aria-label="${page}">${page + 1}</a></li>`);

        if (page < maxPage - 10) {
            list.insertAdjacentHTML('beforeend', '<li><span class="pagination-ellipsis">&hellip;</span></li>');
            list.insertAdjacentHTML('beforeend', `<li><a class="pagination-link" aria-label="${page + 10}">${page + 11}</a></li>`);
        }

        if (page < maxPage - 50) {
            list.insertAdjacentHTML('beforeend', `<li><a class="pagination-link" aria-label="${page + 50}">${page + 51}</a></li>`);
        }

        if (page !== maxPage) {
            list.insertAdjacentHTML('beforeend', '<li><span class="pagination-ellipsis">&hellip;</span></li>');
            list.insertAdjacentHTML('beforeend', `<li><a class="pagination-link" aria-label="${maxPage}">${maxPage + 1}</a></li>`);
        }
    }
}

function tabFormSelector(thisObject, classes) {
    for (let i = 0, n = classes.length; i < n; i++) {
        classes[i].classList.remove('is-active');
        document.getElementById(classes[i].dataset.id).classList.add('is-hidden');
    }
    thisObject.classList.add('is-active');
    document.getElementById(thisObject.dataset.id).classList.remove('is-hidden');
}

function formDisplay(show, newdata, main_module, main_tabs, main_tab, main_form) {
    let tabblock = document.getElementsByClassName('tabblock');
    let tabs = main_tabs.querySelectorAll('.tabs .tab');
    let forms = main_tabs.querySelectorAll('form');
    let notifs = main_tabs.querySelectorAll('form .notification');
    if (show) {
        main_module.classList.add('is-hidden');
        main_tabs.classList.remove('is-hidden');
        for (let i = 0, n = tabs.length; i < n; i++) {
            tabs[i].classList.remove('is-active');
            if (newdata) {
                tabs[i].classList.add('is-hidden');
            }
        }
        for (let i = 0, n = forms.length; i < n; i++) {
            forms[i].classList.add('is-hidden');
        }
        for (let i = 0, n = notifs.length; i < n; i++) {
            notifs[i].classList.add('is-hidden');
        }
        main_tab.classList.add('is-active');
        main_tab.classList.remove('is-hidden');
        main_form.classList.remove('is-hidden');
    } else {
        for (let i = 0, n = tabblock.length; i < n; i++) {
            tabblock[i].classList.add('is-hidden');
        }
        main_module.classList.remove('is-hidden');
        main_tabs.classList.add('is-hidden');
        for (let i = 0, n = tabs.length; i < n; i++) {
            tabs[i].classList.remove('is-active');
            tabs[i].classList.remove('is-hidden');
        }
        for (let i = 0, n = forms.length; i < n; i++) {
            forms[i].classList.add('is-hidden');
        }
        main_form.classList.add('is-hidden');
    }
}

function fontAwesomeMimeType(mimetype) {
    switch (true) {
        case /image/.test(mimetype):
            return { type: "fa-file-image", color: "has-text-warning-50" };
        case /pdf/.test(mimetype):
            return { type: "fa-file-pdf", color: "has-text-danger-60" };
        case /(csv|excel|spreadsheet)/.test(mimetype):
            return { type: "fa-file-excel", color: "has-text-success" };
        case /(word|text)/.test(mimetype):
            return { type: "fa-file-word", color: "has-text-info-50" };
        case /(zip|rar|arj|x-tar)/.test(mimetype):
            return { type: "fa-file-zipper", color: "has-text-text-40" };
        case /(video)/.test(mimetype):
            return { type: "fa-file-video", color: "has-text-warning-35" };
        default:
            return { type: "fa-file", color: "" };
    }
}

function basename(path) {
    if (typeof path !== 'string' || !path) {
        return '';
    }
    path = path.replace(/\/$/, '');
    const lastSlashIndex = path.lastIndexOf('/');
    if (lastSlashIndex === -1) {
        return path;
    }
    return path.substring(lastSlashIndex + 1);
}
