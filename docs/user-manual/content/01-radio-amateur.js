module.exports = {
    slug: 'radio-amateur',
    title: 'Radio amateur user',
    navTitle: 'Radio amateur user',
    navDesc: 'Browsing diplomas, submitting a log, QSL confirmation, own submissions, downloading the certificate, payment.',
    intro:
        'This page covers the "customer side" of the system: how a radio amateur can browse the available diplomas, submit their log for a given diploma, when the system may ask them for a QSL confirmation, and how they can follow their submission all the way through to downloading the certificate. For logging in and account management, see the <a href="general.html">General</a> page.',
    sections: [
        {
            id: 'diploma-list',
            heading: 'Available diplomas',
            body: [
                '<p>The <strong class="ui">Diplomas</strong> menu item shows every active diploma, with a watermarked blank certificate image. The buttons at the top of the list filter by type (<strong class="ui">Standard</strong> / <strong class="ui">Challenge</strong>), and, once logged in, a separate toggle hides diplomas already earned (or no longer earnable due to a deadline) - making it quick to see what\'s still worth applying for.</p>',
                '<p>Once logged in, every card shows whether the user already has a submission (in progress or decided) for that diploma: a <strong>yellow</strong> badge marks a submission under review, a <strong>green "Earned" stamp</strong> marks an already-approved/issued diploma, and a <strong>red "Expired" stamp</strong> marks a diploma that can no longer be earned due to its deadline, and that the user doesn\'t hold either.</p>',
            ],
            image: 'radio-amateur/02-diploma-list',
            caption: 'The diploma list with filters, stamps and the "only what I haven\'t earned yet" toggle.',
        },
        {
            id: 'diploma-details',
            heading: 'Diploma details and statistics',
            body: [
                '<p>Clicking a diploma shows the full rule set: in checklist mode, the callsign/QTH/comment rules to satisfy; in points mode, the point value of each rule and the zone-based (home / EU / DX) minimum score. The watermarked blank certificate image is shown here, along with the deadline (or the lack of one), and - if the manager enabled it - the option and price for requesting a physical (framed) copy.</p>',
                '<p>The <strong class="ui">View statistics</strong> link shows who and how many people have already earned the given diploma, broken down by region (home/EU/DX), with a list of callsigns and scores.</p>',
            ],
            image: 'radio-amateur/03-diploma-details',
            caption: 'The diploma details page with the rules and the QSL sampling conditions.',
        },
        {
            id: 'submission',
            heading: 'Submitting a log',
            body: [
                '<p>Submission starts from the diploma details page: an ADIF-format (.adi/.adif) log file has to be uploaded. The system automatically processes the log, evaluates it against the diploma\'s rules, and immediately shows the result - in checklist mode, which rules were satisfied; in points mode, the score broken down QSO by QSO, together with the matching rule.</p>',
                '<div class="callout"><strong>Note:</strong> there can only be one active (non-rejected) submission per diploma at a time - while an earlier submission is under review, a new one cannot be started for the same diploma.</div>',
                '<p>If the submitted log doesn\'t meet the diploma\'s requirements (e.g. not enough points, or no matching QSO at all), the system flags this immediately and automatically - without any manager involvement.</p>',
                '<p>If the diploma is configured for <strong>automatic approval</strong>, an automatically eligible submission (one that doesn\'t need QSL confirmation) skips manager review entirely - the certificate is issued right away, immediately after upload.</p>',
            ],
            image: 'radio-amateur/05-submission-upload-form',
            caption: 'The log upload form.',
        },
        {
            id: 'qsl',
            heading: 'QSL confirmation',
            body: [
                '<p>If the manager configured the diploma to request a QSL confirmation (a screenshot or scanned card proving the contact) for a given number of (randomly sampled) contacts, the submission enters an <strong>"Awaiting QSL confirmation"</strong> state once the log has been processed. The system randomly picks the requested number of QSOs from the matching ones, and asks for one image per QSO on the submission page.</p>',
                '<p>The submission only moves on to manager review once an image has been uploaded for <em>every</em> requested QSL. An already-uploaded confirmation can be viewed (a "view" link), but not replaced on its own.</p>',
            ],
            image: 'radio-amateur/07-submission-result',
            caption: 'A processed submission in "Awaiting QSL confirmation" state, with the list of requested confirmations.',
        },
        {
            id: 'my-submissions',
            heading: 'My submissions and downloading the certificate',
            body: [
                '<p>The <strong class="ui">My submissions</strong> menu item lists every past and in-progress submission, with its current status (being processed, awaiting QSL, awaiting review, approved, rejected, awaiting payment, etc.) and the submission date.</p>',
                '<p>Once approved, a <strong class="ui">Download certificate (PDF)</strong> button appears on the submission page - by this point the system has permanently assigned the diploma\'s serial number, and the downloadable PDF contains the applicant\'s name, callsign, the serial number and the issue date, laid out the way the diploma admin configured it.</p>',
                '<div class="callout"><strong>Payment:</strong> if the diploma offers a paid PDF or a physical (framed) copy, the submission page shows the payment method selection (Stripe, PayPal or bank transfer - whichever the manager enabled) and the payment status. For a bank transfer, the manager has to manually confirm the payment before it\'s recorded.</div>',
            ],
            image: 'radio-amateur/10-my-submissions-list',
            caption: 'The My submissions list.',
        },
    ],
};
