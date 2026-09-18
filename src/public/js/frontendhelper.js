// frontendhelper.js — custom, minimal frontend-event and form-helper lib.
// Carried over from the reference project's (EHS4) frontendhelper.js.

function feEventId(e_id, e_event, e_func, e_dynamic = false) {
    if (e_id) {
        if (!e_dynamic) {
            e_id[e_event] = e_func;
        } else {
            document.getElementById(e_id)[e_event] = e_func;
        }
    }
}

function feEventClass(e_class, e_event, e_func) {
    let classes = document.getElementsByClassName(e_class);
    for (let i = 0, n = classes.length; i < n; i++) {
        classes[i][e_event] = e_func;
    }
}

function feEventSelector(e_selector, e_event, e_func) {
    let nodes = document.querySelectorAll(e_selector);
    for (let i = 0, n = nodes.length; i < n; i++) {
        nodes[i][e_event] = e_func;
    }
}

function feGetCheckboxValues(e_name) {
    let checkboxes = document.querySelectorAll('input[name="' + e_name + '"]:checked'), values = [];
    Array.prototype.forEach.call(checkboxes, function (el) {
        values.push(el.value);
    });
    return values;
}

function feToTop() {
    document.body.scrollTop = 0; // Safari
    document.documentElement.scrollTop = 0;
}

function feToBottom() {
    document.body.scrollTop = document.body.scrollHeight; // Safari
    document.documentElement.scrollTop = document.documentElement.scrollHeight;
}

function feFormReset(id) {
    let idtemp = document.getElementById(id);
    if (idtemp) {
        idtemp.reset();
        let hiddens = document.querySelectorAll(`#${idtemp.id} input[type="hidden"]`);
        for (let i = 0, n = hiddens.length; i < n; i++) {
            hiddens[i].value = '';
        }
    }
}

// Password rules — the backend counterpart: FUNC.passwordRules / FUNC.passwordValid
// (src/definitions/08_password.js). When modifying either one, update the other too.
function fePasswordRules(password) {
    password = password || '';
    return {
        length: password.length >= 12 && password.length <= 128,
        lower: /[a-z]/.test(password),
        upper: /[A-Z]/.test(password),
        digit: /\d/.test(password),
        special: /[^A-Za-z0-9]/.test(password)
    };
}

function fePasswordValid(password) {
    var r = fePasswordRules(password);
    return r.length && r.lower && r.upper && r.digit && r.special;
}

// Updates the state of the <li data-rule="length|lower|upper|digit|special">
// elements inside containerEl on inputEl's 'input' event.
function fePasswordChecklistBind(inputEl, containerEl) {
    if (!inputEl || !containerEl) {
        return;
    }
    var update = function () {
        var r = fePasswordRules(inputEl.value);
        var items = containerEl.querySelectorAll('li[data-rule]');
        for (var i = 0, n = items.length; i < n; i++) {
            var ok = !!r[items[i].getAttribute('data-rule')];
            items[i].classList.toggle('has-text-success', ok);
            items[i].classList.toggle('has-text-grey', !ok);
            var icon = items[i].querySelector('i');
            if (icon) {
                icon.className = ok ? 'fas fa-check-circle' : 'far fa-circle';
            }
        }
    };
    inputEl.addEventListener('input', update);
    update();
}

function feFormToJSON(id) {
    let output = {};
    const inputs = document.querySelectorAll(`#${id} input, #${id} select, #${id} textarea`);
    for (let i = 0, n = inputs.length; i < n; i++) {
        let name = inputs[i].getAttribute('name');
        switch (inputs[i].getAttribute('type')) {
            case 'checkbox':
                if (inputs[i].checked && inputs[i].checkVisibility()) {
                    if (!output[name]) {
                        output[name] = [];
                    }
                    output[name].push(inputs[i].value);
                }
                break;
            case 'radio':
                if (inputs[i].checked && inputs[i].checkVisibility()) {
                    if (inputs[i].value == 'true' || inputs[i].value == 'false') {
                        output[name] = (inputs[i].value === 'true');
                    } else {
                        output[name] = inputs[i].value;
                    }
                }
                break;
            case 'hidden':
                output[name] = inputs[i].value;
                break;

            default:
                if (inputs[i].checkVisibility()) {
                    output[name] = inputs[i].value;
                }
                break;
        }
    }
    return output;
}

// In list views, multi-line fields need to be compressed onto a single line
function feStripNewlines(text) {
    return (text || '').replace(/\s*\r?\n\s*/g, ' ').trim();
}
