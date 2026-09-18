module.exports = {
    slug: 'manager',
    title: 'Diploma manager',
    navTitle: 'Diploma manager',
    navDesc: 'Diploma administration (rules, payment, layout, auto-approval), system settings, submission review.',
    intro:
        'This page is for users with "manager" permission: how to create and edit a diploma\'s rule set and appearance, what global settings exist, and how incoming submissions get reviewed. Manager permission for a given diploma is granted by the superadmin (by assigning a responsible manager) - for logging in on its own, see the <a href="general.html">General</a> page.',
    sections: [
        {
            id: 'diploma-list',
            heading: 'Managing diplomas',
            body: [
                '<p>Under the <strong class="ui">Manage diplomas</strong> menu item, a manager sees and can edit the diplomas assigned to THEM (a superadmin sees all of them). Only a superadmin can create a new diploma; assigning the responsible manager is also a superadmin-only action.</p>',
                '<p>An entry can also be deleted from the list, per diploma (together with its uploaded blank certificate image) - this is best used only as long as the diploma doesn\'t have any real submissions yet.</p>',
            ],
            image: 'manager/01-diploma-list',
            caption: 'The manager\'s own list of diplomas.',
        },
        {
            id: 'diploma-edit',
            heading: 'Editing a diploma - Basic info and Rules',
            body: [
                '<p>The editor is split into four tabs. The <strong class="ui">Basic info</strong> tab sets the diploma\'s name, free-text description, deadline (or continuous nature), duplicate handling and allowed bands.</p>',
                '<p>The <strong class="ui">Rules</strong> tab decides the diploma\'s character: in <strong>checklist</strong> mode, every rule added (on the callsign, QTH or comment field) has to be satisfied by at least one QSO; in <strong>points</strong> mode, every rule is worth points, and the radio amateur has to reach the minimum score for their own zone (home/EU/DX). A callsign rule can use a wildcard (<code>OE7*</code>), an exact match, a list, or - when the pattern needs to be more precise than that - a regular expression; rules can also target the mode and band fields, even an entire mode group (e.g. "DIGITAL").</p>',
                '<div class="callout"><strong>Important:</strong> in points mode, if a QSO matches more than one rule at once, the points are NOT added together - only the single highest-value matching rule counts.</div>',
            ],
            image: 'manager/03-diploma-edit-rules',
            caption: 'The Rules tab - the rule table, zone thresholds, band and repeater restrictions.',
        },
        {
            id: 'diploma-autoapprove',
            heading: 'Editing a diploma - Automatic approval',
            body: [
                '<p>At the bottom of the <strong class="ui">Rules</strong> tab is the <strong class="ui">Automatic approval</strong> checkbox: if turned on, a submission the system automatically finds eligible (based purely on the log) gets its certificate issued immediately, with no manager review at all.</p>',
                '<div class="callout"><strong>Note:</strong> this can only be enabled if QSL sampling is off (0) and physical delivery isn\'t offered on the Payment tab - both of those need a human step (uploading a confirmation, or arranging/paying for shipping), which conflicts with the "immediately" promise. Turning the checkbox on automatically clears and disables those two settings.</div>',
            ],
            image: 'manager/03b-diploma-edit-autoapprove',
            caption: 'The Automatic approval checkbox, with the conflicting QSL sampling field disabled.',
        },
        {
            id: 'diploma-payment',
            heading: 'Editing a diploma - Payment',
            body: [
                '<p>The <strong class="ui">Payment</strong> tab turns on the option to request a physical (framed) copy, sets the fee for the PDF and for physical delivery (either can be free), and selects the accepted payment methods: Stripe, PayPal, or bank transfer (the bank account details are also recorded here, for the latter). For a bank transfer, the manager manually confirms the received amount on the submission page.</p>',
            ],
            image: 'manager/04-diploma-edit-payment',
            caption: 'The Payment tab.',
        },
        {
            id: 'diploma-layout',
            heading: 'Editing a diploma - Layout (certificate template)',
            body: [
                '<p>The <strong class="ui">Layout</strong> tab is where the blank certificate image is uploaded, and where the fields that go on it (applicant name, callsign, serial number, issue date, and, for tier/category-based diplomas, the category and tier name too) can be dragged into place - the positions are saved as percentage coordinates, and the final PDF certificate generator uses the exact same positioning. Font and font size apply uniformly to every field.</p>',
                '<p>The system automatically produces a watermarked version of the uploaded blank image - this is what\'s shown on the public diploma details page; the non-watermarked original is only available to the manager interface and the final PDF.</p>',
            ],
            image: 'manager/05-diploma-edit-layout',
            caption: 'The Layout tab - the draggable field positioner over the blank certificate image.',
        },
        {
            id: 'settings',
            heading: 'System settings',
            body: [
                '<p>The <strong class="ui">Administration</strong> menu item has two main blocks. The <strong>Appearance</strong> block sets the home page\'s custom title, welcome text, the logo shown at the top of the sidebar menu, the home-page banner image, and the site\'s <strong>default language</strong> - the language a first-time visitor sees before they\'ve picked one (a logged-in user\'s own account language always takes priority, and the language switcher can override this at any time).</p>',
                '<p>The <strong>Two-factor authentication</strong> block separately controls, for the radio amateur and manager roles, whether MFA is disabled, optional or mandatory, and which methods (email, TOTP) are allowed.</p>',
            ],
            image: 'manager/06-settings',
            caption: 'The Settings page - appearance (logo, banner, title, welcome text).',
        },
        {
            id: 'review',
            heading: 'Reviewing submissions',
            body: [
                '<p>The <strong class="ui">Review</strong> menu item shows a (status-filterable) list of submitted entries. A manager can only review submissions belonging to their own diplomas (a superadmin can review any of them).</p>',
                '<p>Opening a submission shows the full QSO table, together with the log\'s raw COMMENT field and the automatically matched rules. The manager can apply a manual point correction either per row (tied to a specific QSO) or for the submission as a whole - either by picking an actual rule (in which case that rule\'s points "compete" with the QSO\'s automatic points rather than being added to them), or with a free, always-additive amount plus a justification. Every correction records which manager applied it.</p>',
                '<div class="callout"><strong>Self-review ban:</strong> nobody can review their own submission - this is enforced both in the interface and at the API level.</div>',
                '<p>Before the decision (<strong class="ui">Approve</strong> / <strong class="ui">Reject</strong>), a remark can be written, which the applicant also receives by email. On approval - if a serial number hasn\'t already been assigned to the submission - the system atomically assigns the diploma\'s next serial number and immediately generates the downloadable PDF certificate.</p>',
            ],
            image: 'manager/08b-review-decision',
            caption: 'Reviewing a submission - the QSO table, manual point correction, decision.',
        },
    ],
};
