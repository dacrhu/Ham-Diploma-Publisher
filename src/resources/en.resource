// Ham Diploma Publisher — English language file
// Key : Value format, dot-separated hierarchical keys.
// When adding a new string, add it to ALL THREE resource files (hu/en/de).

app.name : Ham Diploma Publisher

menu.home : Home
menu.diplomas : Diplomas
menu.contacts : Contacts
menu.account : Account
menu.profile : My profile
menu.my.submissions : My submissions
menu.admin : Administration
menu.admin.users : Users
menu.login : Login
menu.register : Register
menu.logout : Logout
menu.language : Language

btn.cancel : Cancel

home.intro : Publishing and applying for amateur radio diplomas (awards) in one place.

contacts.title : Contacts
contacts.empty : This page is currently empty — the manager can fill it in on the Settings page.

// --- Error messages ---
error.password.invalid : The password does not meet the requirements (min. 12 characters, upper and lower case, digit, special character).
error.password.mismatch : The two passwords do not match.
error.email.taken : This email address is already registered.
error.captcha.invalid : Incorrect answer to the verification question, or the question expired — please try again.
error.internal : An internal error occurred. Please try again later.
error.login.invalid : Invalid email address or password.
error.login.notverified : This account has not been verified yet — please check your mailbox.
error.login.disabled : This account has been disabled.
error.reset.invalid : This link is invalid or has expired.
error.network : A network error occurred. Please try again.
error.mfa.invalid : This process is invalid or has expired, please log in again.
error.mfa.code : Invalid code.
error.mfa.required : Two-factor authentication is required for your account and cannot be turned off — only the method can be changed.
error.user.cannot_disable_sa : A superadmin account cannot be disabled.

// --- Registration ---
register.title : Register
register.email.label : Email address
register.password.label : Password
register.password.confirm.label : Confirm password
register.callsign.label : Callsign
register.firstname.label : First name
register.lastname.label : Last name
register.country.label : Country
register.street.label : Street, house number
register.city.label : City
register.zip.label : ZIP code
register.submit : Register
register.success.title : Registration successful
register.success.text : We sent a confirmation email to the given address. Please click the link in it to activate your account.
register.have.account : Already have an account?
register.password.rules.length : at least 12 characters
register.password.rules.lower : lowercase letter
register.password.rules.upper : uppercase letter
register.password.rules.digit : digit
register.password.rules.special : special character
register.captcha.label : Amateur radio check
register.captcha.question : Which amateur band does {0} kHz belong to?
register.captcha.loading : Loading question…
register.captcha.reload : Another question

// --- Login ---
login.title : Login
login.email.label : Email address
login.password.label : Password
login.submit : Login
login.forgot.link : Forgot password
login.register.link : Don't have an account yet? Register here.
login.verify.ok : Your account has been verified. You can log in now.
login.verify.invalid : The verification link is invalid or has expired.

// --- Forgot password ---
forgot.title : Forgot password
forgot.email.label : Email address
forgot.submit : Send
forgot.sent.text : If the email address exists in our system, you will receive an email shortly to reset your password.
forgot.back.link : Back to login

// --- Reset password ---
reset.title : Set a new password
reset.password.label : New password
reset.password.confirm.label : Confirm new password
reset.submit : Save password
reset.success.text : Your password has been changed. You can now log in with the new password.

// --- My account ---
account.title : My account
account.email.label : Email address
account.callsign.label : Callsign
account.firstname.label : First name
account.lastname.label : Last name
account.country.label : Country
account.street.label : Street, house number
account.city.label : City
account.zip.label : ZIP code
account.language.label : Language
account.password.section : Change password
account.password.new.label : New password
account.password.confirm.label : Confirm new password
account.password.hint : Only fill this in if you want to change your password.
account.submit : Save
account.saved : Changes saved.
account.mfa.section : Two-factor authentication (MFA)
account.mfa.status.enabled : Enabled
account.mfa.status.disabled : Disabled
account.mfa.enable : Enable MFA
account.mfa.change_method : Change method
account.mfa.disable : Disable MFA
account.mfa.saved : Two-factor authentication has been set up.

// --- Email templates ---
email.greeting : Welcome,
email.footer : This is an automated message, please do not reply.
email.verify.subject : Confirm your account
email.verify.intro : Thank you for registering! Please click the button below to activate your account.
email.verify.btn : Confirm account
email.forgot.subject : Password reset
email.forgot.intro : We received a password reset request for your account. Click the button below to set a new password.
email.forgot.btn : Set new password
email.mfa.subject : Login code
email.mfa.ttl : This code is valid for {0} minutes.

// --- MFA (two-factor authentication) ---
mfa.setup.title : Set up two-factor authentication
mfa.setup.intro : The administrator has made two-factor authentication mandatory for your account. Choose a method:
mfa.setup.method.email : Email code
mfa.setup.method.totp : Authenticator app (e.g. Google Authenticator)
mfa.setup.email.sent : We sent a confirmation code to the email address on your account.
mfa.setup.totp.intro : Scan the QR code below with an authenticator app, or enter the key manually, then enter the 6-digit code shown by the app.
mfa.setup.totp.secret.label : Key (for manual entry)
mfa.code.label : 6-digit code
mfa.code.submit : Confirm
mfa.verify.title : Two-factor verification
mfa.verify.intro.email : We sent a code to your email for login.
mfa.verify.intro.totp : Enter the code shown in your authenticator app.

// --- Diploma admin CRUD ---
menu.admin.diplomas : Manage diplomas

diplomas.admin.title : Diplomas
diplomas.admin.new : New diploma
diplomas.admin.col.name : Name
diplomas.admin.col.type : Type
diplomas.admin.col.mode : Mode
diplomas.admin.col.status : Status
diplomas.admin.col.created : Created
diplomas.admin.col.manager : Responsible manager
diplomas.admin.empty : There are no diplomas yet.
diplomas.admin.delete.confirm : Are you sure you want to delete "{0}"? This cannot be undone.

diplomas.tab.basic : Basic info
diplomas.tab.rules : Rules
diplomas.tab.challenge : Challenge
diplomas.tab.payment : Payment
diplomas.tab.overlay : Layout

diplomas.name.label : Diploma name
diplomas.description.label : Description

diplomas.type.label : Diploma type
diplomas.type.standard : Standard (based on uploaded log)
diplomas.type.challenge : Challenge (application + round-by-round draw)
diplomas.type.help : For a standard diploma, the radio amateur uploads a log which the system checks against the conditions set on the Rules tab. For a Challenge diploma, after applying the system draws rounds from a pre-defined list (e.g. country/callsign/repeater), see the Challenge tab.
diplomas.type.standard.short : Standard
diplomas.type.challenge.short : Challenge
diplomas.deadline.label : Timing
diplomas.deadline.continuous : Continuous
diplomas.deadline.fixed : Deadline
diplomas.deadline.date.label : Deadline date
diplomas.status.label : Status
diplomas.status.draft : Draft
diplomas.status.active : Active
diplomas.status.archived : Archived
diplomas.serial.start.label : Serial numbering start

diplomas.manager.label : Responsible manager
diplomas.manager.none : — not assigned —
diplomas.manager.help : Which manager is responsible for this diploma — this also shows up in the diploma list, so other admins know who to contact.

diplomas.blank.label : Blank certificate image
diplomas.blank.help : This image is shown (watermarked) on the public preview, and it is also the base of the PDF certificate.
diplomas.blank.choose : Choose file
diplomas.blank.savefirst : Save the diploma with basic info first, then you can upload the image.
diplomas.blank.error : An error occurred during upload.

diplomas.rulemode.label : Rule mode
diplomas.rulemode.checklist : Checklist (every callsign must be worked)
diplomas.rulemode.points : Points (with zone-based minimum score)
diplomas.rulemode.help : In checklist mode, every given rule (callsign/QTH/comment) must be satisfied by at least one QSO. In points mode, every rule awards points, and the radio amateur must reach the minimum score for their zone (home/EU/DX).

diplomas.duplicate.label : Duplicate handling (multiple QSOs with the same station)
diplomas.duplicate.allowed : Allowed — every contact counts, even if repeated
diplomas.duplicate.per_band_mode : One per band/mode — counts again on a different band or mode
diplomas.duplicate.once : Only once — regardless of band/mode, only the first counts
diplomas.duplicate.help : Mainly relevant in points mode: if a radio amateur contacts the same station multiple times, this setting decides how many of those count towards the result.
diplomas.allowedbands.label : Allowed bands (comma-separated)
diplomas.allowedbands.help : If filled in (e.g. "80m, 40m, 20m"), only a contact made on one of these bands is valid for this diploma — a QSO made on another band (e.g. 2m) is automatically invalid, regardless of whether there's a scoring rule for it below. Leave empty for no band restriction.
diplomas.allowedbands.placeholder : e.g. 80m, 40m, 20m
diplomas.repeater.allowed.label : Repeater use allowed
diplomas.repeater.allowed.help : If disabled, a contact made through a repeater does not count towards this diploma — only direct (simplex) QSOs are accepted.
diplomas.repeater.points.label : Points for a repeater contact
diplomas.repeater.points.help : Only applies in points mode and only when repeater use is allowed — how many points a contact made through a repeater is worth.
diplomas.rule.field : Field
diplomas.rule.operator : Condition
diplomas.rule.value : Value
diplomas.rule.points : Points
diplomas.rule.label : Label
diplomas.rule.add : Add rule
diplomas.rule.regex.hint : For the callsign field, "Regular expression" is also available when the pattern (*/?) isn't precise enough — e.g. Austrian stations with a two-letter suffix only (OE7GJ): ^OE\d[A-Z]{2}$
diplomas.rule.mode.hint : For the "Mode" field, the "Group" condition (e.g. DIGITAL) awards points for any digital mode (FT8, RTTY, PSK31, etc.) without listing them one by one — for a specific mode (e.g. FT8 only), use "Equals".
diplomas.rule.band.hint : Use the "Band" field for band-based scoring (e.g. 80m 3, 40m 2 points), or the "Group" condition (HF / VHF / UHF) for an entire band range — if a diploma can only be earned on certain bands, add a rule for it (e.g. "One of": 80m, 40m).

diplomas.zone.label : Zone-based minimum score
diplomas.zone.help : Leave empty if there is no separate minimum for that zone.
diplomas.zone.home : Home
diplomas.zone.eu : EU
diplomas.zone.dx : DX (other)
diplomas.zone.homecountry : Issuing organization's country
diplomas.zone.homecountry.help : This decides who counts as "home" — every other country falls into the EU or DX zone based on it.
diplomas.zone.tiers.note : Tiers are enabled — instead of the flat zone thresholds above, each tier has its own per-zone (home/EU/DX) minimum, see below.

diplomas.tiers.enabled.label : Use tiers (e.g. Bronze/Silver/Gold)
diplomas.tiers.enabled.help : When enabled, the diploma is split into several achievable levels (e.g. Bronze/Silver/Gold) based on the score reached.
diplomas.tiers.categories.label : Mode-based categories
diplomas.tiers.categories.help : When enabled, each mode (e.g. CW / Phone / Mixed) can have its own tier ladder — a submission can qualify in several categories at once (e.g. reaching the minimum with CW and also with SSB).
diplomas.tiers.categories.groups.hint : The groups: CW (Morse code), Phone (voice modes: SSB/FM/AM), Digital (digital modes: FT8, RTTY, PSK31, etc.), Image (image modes: SSTV, FAX, ATV), Any (Mixed) = a QSO on any mode counts.
diplomas.tiers.category.add : Add category

diplomas.qsl.label : QSL sampling
diplomas.qsl.help : How many QSOs should the system automatically draw for QSL confirmation (0 = disabled).
diplomas.autoapprove.label : Automatic approval
diplomas.autoapprove.help : If the system automatically finds a submission eligible based on the log, the certificate is issued immediately, without manager review. Can only be enabled if there is no QSL sampling (0 above) and no physical delivery offered (see the Payment tab) — both would require human intervention, which conflicts with the "immediately" principle.

diplomas.challenge.notice : The application/draw/round-by-round log check process is still under development — for now only the settings can be configured here.
diplomas.challenge.targetfield.label : Target field
diplomas.challenge.targetfield.help : Which data the system draws each round from the list below, and which log field the radio amateur's contact must match.
diplomas.challenge.targetfield.call : Callsign
diplomas.challenge.targetfield.country : Country
diplomas.challenge.targetfield.comment : Other identifier (log Comment field, e.g. repeater/talkgroup)
diplomas.challenge.allowedbands.label : Allowed bands (comma-separated)
diplomas.challenge.allowedbands.help : If filled in (e.g. "80m, 40m, 20m"), only a contact made on one of these bands is valid in a round — a QSO made on another band (e.g. 2m) is automatically invalid. Leave empty for no band restriction.
diplomas.challenge.allowedbands.placeholder : e.g. 80m, 40m, 20m
diplomas.challenge.allowedmodes.label : Allowed modes (comma-separated)
diplomas.challenge.allowedmodes.help : If filled in (e.g. "FT8, DMR"), only a contact made using one of these modes is valid in a round — a QSO made using another mode is automatically invalid. Leave empty for no mode restriction.
diplomas.challenge.allowedmodes.placeholder : e.g. FT8, DMR
diplomas.challenge.pool.label : Target pool
diplomas.challenge.pool.help : The system draws from these each round. "Label" is optional, for display only (e.g. country name, talkgroup name).
diplomas.challenge.pool.col.value : Value
diplomas.challenge.pool.col.label : Label (optional)
diplomas.challenge.pool.add : Add item
diplomas.challenge.drawperround.label : Items drawn per round
diplomas.challenge.totalrounds.label : Number of rounds
diplomas.challenge.deadlinedays.label : Round deadline (days)
diplomas.challenge.deadlinedays.placeholder : no deadline
diplomas.challenge.qsl.label : QSL sampling (per round)
diplomas.challenge.allowrepeat.label : The same item may be drawn again in a later round
diplomas.challenge.allowrepeat.help : If disabled, every round within one application gets unique (not previously drawn) items — for this the pool must contain at least (rounds × items per round) items.

diplomas.fee.pdf.label : PDF fee
diplomas.fee.physical.label : Physical copy fee (surcharge)
diplomas.fee.currency.label : Currency
diplomas.physical.enabled.label : Physical (framed) copy can be requested
diplomas.payment.methods.label : Accepted payment methods
diplomas.payment.method.bank : Bank transfer
diplomas.bank.accountname.label : Account holder name
diplomas.bank.iban.label : Bank account number / IBAN
diplomas.bank.note.label : Note (reference)

diplomas.overlay.help : Drag the fields onto the right position on the blank image — this is how they will appear on the PDF certificate. Use the checkboxes to turn fields on/off for this diploma (not every diploma needs all of them).
diplomas.overlay.noimage : Please upload a blank image on the "Basic info" tab first.
diplomas.overlay.font.family.label : Font
diplomas.overlay.font.size.label : Font size
diplomas.overlay.font.help : The font size and font family apply uniformly to every field (data) — they cannot be set per field.
diplomas.overlay.font.liberationSans : Modern (sans-serif)
diplomas.overlay.font.liberationSerif : Classic (serif)
diplomas.overlay.font.ebGaramond : Elegant (Garamond)
diplomas.overlay.font.dancingScript : Decorative (handwritten)
diplomas.overlay.preview.button : Preview (with demo data)
diplomas.overlay.preview.title : Preview — how the filled-in diploma will look
diplomas.overlay.preview.close : Close
diplomas.overlay.preview.error : Failed to generate the preview.

diplomas.preview.demo.name : Jane Sample
diplomas.preview.demo.callsign : W0DEMO
diplomas.preview.demo.points : 123
diplomas.preview.demo.serial : 0001
diplomas.preview.demo.category : CW
diplomas.preview.demo.tier : Gold
diplomas.preview.demo.zone : DX
diplomas.overlay.field.diplomaName : Diploma name
diplomas.overlay.field.applicantName : Applicant's name
diplomas.overlay.field.callsign : Callsign
diplomas.overlay.field.points : Points
diplomas.overlay.field.serialNumber : Serial number
diplomas.overlay.field.issueDate : Issue date
diplomas.overlay.field.categoryLabel : Category name
diplomas.overlay.field.tierLabel : Tier name
diplomas.overlay.field.zoneLabel : Zone name

diplomas.saved : Diploma saved.
diplomas.save : Save

diplomas.rule.field.call : Callsign
diplomas.rule.field.comment : Comment
diplomas.rule.field.qth : QTH (location)
diplomas.rule.field.mode : Mode
diplomas.rule.field.band : Band
diplomas.rule.sentence.wildcard : {field} matches: {value}
diplomas.rule.sentence.regex : {field} matches the pattern: {value}
diplomas.rule.sentence.contains : {field} contains: {value}
diplomas.rule.sentence.equals : {field}: {value}
diplomas.rule.sentence.in_list : {field} is one of: {value}
diplomas.rule.sentence.group : {field} group: {value}

diplomas.public.list.title : Available diplomas
diplomas.public.list.intro : The following diplomas are currently available — click for details.
diplomas.public.list.empty : No diplomas are currently available.
diplomas.public.list.empty.filtered : There are currently no diplomas matching the selected filter.
diplomas.public.list.filter.all : All
diplomas.public.list.filter.unowned : Only ones I haven't earned yet
diplomas.public.list.details : Details
diplomas.public.list.manager : Responsible: {0}
diplomas.public.list.fee.free : Free
diplomas.public.list.owned.inprogress : Under review
diplomas.public.list.stamp.owned : Earned
diplomas.public.list.stamp.expired : Expired
diplomas.public.stats.button : View statistics
diplomas.public.stats.back : Back to the diploma
diplomas.public.stats.title : Statistics – {0}
diplomas.public.stats.summary.title : Recipients by region
diplomas.public.stats.total : Total
diplomas.public.stats.list.title : List of recipients
diplomas.public.stats.empty : Nobody has earned this diploma yet.
diplomas.public.stats.col.serial : Serial no.
diplomas.public.stats.col.callsign : Callsign
diplomas.public.stats.col.zone : Zone
diplomas.public.stats.col.points : Points
diplomas.public.stats.col.tier : Tier
diplomas.public.stats.col.date : Issued
diplomas.public.stats.pagination.prev : ← Previous
diplomas.public.stats.pagination.next : Next →
diplomas.public.stats.pagination.page : Page {0} / {1}
diplomas.public.detail.back : ← Back to diplomas
diplomas.public.detail.blank.title : Blank certificate (sample)
diplomas.public.detail.blank.missing : No blank certificate image has been uploaded for this diploma yet.
diplomas.public.detail.blank.note : The watermark shown here only appears on this preview — the actual issued certificate will not have it.
diplomas.public.detail.deadline.until : Deadline: {0}
diplomas.public.detail.challenge.label : How the challenge works
diplomas.public.detail.challenge.intro : This is a round-based challenge diploma: after applying, the system draws targets each round according to the condition(s) below — you must complete each round to move on to the next.
diplomas.public.detail.rules.label : Requirements
diplomas.public.detail.rules.checklist.intro : To earn this diploma, ALL of the following conditions must be met in at least one contact:
diplomas.public.detail.rules.points.intro : You can earn points according to the following rules; to earn the diploma you must reach the minimum score for your zone:
diplomas.public.detail.rules.empty : No detailed rules have been defined for this diploma yet.
diplomas.public.detail.zone.label : Minimum score by zone
diplomas.public.detail.zone.none : No specific minimum set for this zone.
diplomas.public.detail.tiers.label : Tiers
diplomas.public.detail.tiers.col.category : Category
diplomas.public.detail.tiers.col.tier : Tier
diplomas.public.detail.duplicate.label : Duplicate handling
diplomas.public.detail.qsl.label : QSL confirmation
diplomas.public.detail.qsl.text : During submission the system may request a QSL confirmation (screenshot, scan).
diplomas.public.detail.repeater.notallowed : A contact made through a repeater does NOT count towards this diploma — only direct (simplex) QSOs are accepted.
diplomas.public.detail.repeater.allowed.points : Repeater use is allowed — a contact made this way is worth {0} points.
diplomas.public.detail.allowedbands.text : This diploma can only be earned on the following band(s): {0}.
diplomas.public.detail.challenge.allowedmodes.text : This challenge can only be completed using the following mode(s): {0}.
diplomas.public.detail.cta.title : Applying
diplomas.public.detail.cta.login : You need to log in to apply.
diplomas.public.detail.cta.login.button : Log in
diplomas.public.detail.cta.register.text : Don't have an account yet?
diplomas.public.detail.cta.register.button : Register
diplomas.public.detail.cta.soon : Log submission will be available soon.
diplomas.public.detail.cta.submit.button : Upload log / Submit
diplomas.public.detail.cta.expired : The submission deadline has passed, logs can no longer be submitted for this diploma.
diplomas.public.detail.cta.existing : You already have a submission for this diploma.
diplomas.public.detail.cta.existing.link : View submission

diplomas.home.teaser.title : Available diplomas
diplomas.home.teaser.text : Browse the available ham radio diplomas and the requirements to earn them.
diplomas.home.teaser.button : View diplomas

error.diploma.name : The diploma name is required.
error.diploma.rule.regex : Invalid regular expression in a callsign rule.
error.diploma.blank.watermark : Failed to watermark the image, please try again.
error.diploma.rule.group : Unknown mode group in a rule (must be CW / PHONE / DIGITAL / IMAGE).
error.diploma.rule.band.group : Unknown band group in a rule (must be HF / VHF / UHF).
error.diploma.autoapprove.conflict : Automatic approval can only be enabled if there is no QSL sampling (0) and no physical delivery is offered.
error.diploma.manager.invalid : The selected responsible manager is invalid, or does not have manager permission.
error.diploma.forbidden : You do not have access to this diploma — you can only manage diplomas assigned to you.
error.diploma.create.forbidden : Creating a new diploma requires superadmin permission.
error.diploma.challenge.target_field : Choose a target field on the Challenge tab (callsign / country / other identifier).
error.diploma.challenge.pool_empty : Add at least one item to the target pool on the Challenge tab.
error.diploma.challenge.pool_too_small : The target pool is too small for this many rounds/draws without repetition — enlarge the pool, reduce the rounds/items per round, or allow repetition.

// --- MFA admin settings ---
settings.title : Settings
settings.appearance.section : Appearance
settings.appearance.logo.label : Custom logo (top of the sidebar, every page)
settings.appearance.logo.choose : Choose file…
settings.appearance.logo.error : Failed to upload the logo.
settings.appearance.banner.label : Banner image (home page)
settings.appearance.banner.choose : Choose file…
settings.appearance.banner.error : Failed to upload the banner.
settings.appearance.sitetitle.label : Custom title
settings.appearance.sitetitle.help : If left empty, the application's default name is shown on the home page.
settings.appearance.defaultlanguage.label : Default language
settings.appearance.defaultlanguage.help : This is the language a new visitor sees who doesn't have a language cookie yet (e.g. on their first visit) — after logging in, their own account setting always takes over, and it can be overridden at any time with the language switcher.
settings.appearance.welcometext.label : Welcome text
settings.appearance.welcometext.help : Each line is shown as a separate paragraph on the home page. If left empty, the default introductory text is shown.
settings.contacts.label : Contacts page content
settings.contacts.help : Freely editable content for the public "Contacts" page — HTML tags are allowed (e.g. &lt;p&gt;, &lt;a href="..."&gt;, &lt;strong&gt;), the system renders it as actual HTML, unchanged. Since any HTML can go here, only fill it in from a trusted (manager/sa) source.
settings.mfa.section : Two-factor authentication (MFA)
settings.mfa.user.label : Radio amateurs
settings.mfa.manager.label : Managers
settings.mfa.policy.disabled : Disabled
settings.mfa.policy.optional : Optional
settings.mfa.policy.required : Required
settings.mfa.methods.label : Allowed methods
settings.submit : Save
settings.saved : Settings saved.
settings.managers.moved.hint : Assigning diploma managers and disabling users is now available under the "Users" menu item (/admin/users).
// --- User admin (/admin/users, superadmin-only) ---
users.admin.title : Users
users.admin.search.placeholder : Search by callsign, name or email…
users.admin.filter.status.label : Status
users.admin.filter.status.all : All
users.admin.status.active : Active
users.admin.status.disabled : Disabled
users.admin.status.pending_verification : Awaiting verification
users.admin.col.callsign : Callsign
users.admin.col.name : Name
users.admin.col.email : Email
users.admin.col.country : Country
users.admin.col.status : Status
users.admin.col.manager : Manager
users.admin.col.created : Registered
users.admin.action.detail : Details
users.admin.action.disable : Disable
users.admin.action.enable : Enable
users.admin.disable.confirm : Are you sure you want to disable "{0}"? They will no longer be able to log in.
users.admin.enable.confirm : Re-enable "{0}"? They will be able to log in again.
users.admin.empty : No users match the current filter.
users.admin.pagination.prev : ← Previous
users.admin.pagination.next : Next →
users.admin.pagination.page : Page {0} / {1}
users.admin.detail.back : ← Back to users
users.admin.detail.title : User – {0}
users.admin.detail.section.profile : Profile
users.admin.detail.field.email : Email
users.admin.detail.field.name : Name
users.admin.detail.field.callsign : Callsign
users.admin.detail.field.country : Country
users.admin.detail.field.address : Address
users.admin.detail.field.language : Language
users.admin.detail.field.status : Status
users.admin.detail.field.permissions : Permission
users.admin.detail.field.created : Registered
users.admin.detail.field.mfa : Two-factor authentication
users.admin.detail.permissions.manager : Manager
users.admin.detail.permissions.sa : Superadmin
users.admin.detail.permissions.none : —
users.admin.detail.mfa.enabled : Enabled ({0})
users.admin.detail.mfa.disabled : Disabled
users.admin.detail.section.submissions : Submissions and certificates
users.admin.detail.submissions.empty : This user has no submissions yet.
users.admin.detail.submissions.col.diploma : Diploma
users.admin.detail.submissions.col.status : Status
users.admin.detail.submissions.col.points : Points
users.admin.detail.submissions.col.created : Submitted

// --- Submission process (step 6) ---
submissions.delivery.pdf : PDF certificate only
submissions.delivery.physical : Physical (framed) copy as well (extra fee)

submissions.new.back : ← Back to the diploma
submissions.new.title : Upload log
submissions.new.file.label : ADIF log file (.adi / .adif)
submissions.new.file.choose : Choose file
submissions.new.delivery.label : Delivery method
submissions.new.submit : Submit

submissions.list.title : My submissions
submissions.list.empty : You don't have any submissions yet.
submissions.list.col.diploma : Diploma
submissions.list.col.status : Status
submissions.list.col.points : Points
submissions.list.col.created : Submitted

submissions.detail.back : ← Back to my submissions
submissions.detail.status.label : Status
submissions.detail.parsed.label : Parsed QSOs
submissions.detail.matched.label : Matching QSOs
submissions.detail.points.label : Points achieved
submissions.detail.delivery.label : Delivery method
submissions.detail.serial.label : Certificate serial number
submissions.detail.pdf.download : Download certificate (PDF)
submissions.detail.checklist.title : Requirements
submissions.detail.tiers.title : Categories / tiers
submissions.detail.tiers.col.achieved : Achieved tier
submissions.detail.zone.label : Zone
submissions.detail.zone.threshold : Minimum required
submissions.detail.qso.title : Contacts
submissions.detail.qso.col.call : Callsign
submissions.detail.qso.col.date : Date
submissions.detail.qso.col.band : Band
submissions.detail.qso.col.mode : Mode
submissions.detail.qso.col.comment : Comment
submissions.detail.qso.col.matched : Matching rules
submissions.detail.qso.col.points : Points
submissions.detail.qso.excluded.duplicate : Duplicate — not counted
submissions.detail.qso.excluded.band : Band not allowed for this diploma
submissions.detail.qso.excluded.repeater : Contact made via repeater, not allowed
submissions.detail.qso.repeater.bonus : Repeater bonus

submissions.status.submitted : Submitted, being processed
submissions.status.rejected_auto : Automatically rejected — requirements not met
submissions.status.awaiting_qsl : Awaiting QSL confirmation
submissions.status.pending_review : Awaiting review
submissions.status.approved : Approved
submissions.status.rejected : Rejected
submissions.status.awaiting_payment : Awaiting payment
submissions.status.paid : Paid
submissions.status.completed : Completed

error.submission.notfound : Submission not found.
error.submission.forbidden : You don't have access to this submission.
error.submission.file.required : Please choose an ADIF log file (.adi / .adif).
error.submission.file.empty : No processable contacts were found in the uploaded file.
error.submission.qsl.file.required : Please choose an image or PDF for the QSL confirmation.

submissions.detail.qsl.title : QSL confirmation
submissions.detail.qsl.intro : The system requires a QSL confirmation (screenshot or scan) for the following contacts — the submission will only go to review once you've uploaded one for each.
submissions.detail.qsl.col.call : Callsign
submissions.detail.qsl.col.image : Confirmation
submissions.detail.qsl.uploaded : Uploaded — view
submissions.detail.qsl.choose : Choose file
submissions.detail.qsl.upload.button : Upload

// --- Manager review (step 8) ---
menu.admin.review : Review

submissions.review.title : Submissions awaiting review
submissions.review.empty : No submissions match this filter.
submissions.review.filter.label : Status
submissions.review.filter.all : All
submissions.review.col.diploma : Diploma
submissions.review.col.applicant : Applicant
submissions.review.col.points : Points
submissions.review.col.created : Submitted
submissions.review.detail : Open →

submissions.detail.review.title : Review
submissions.detail.review.points.label : Other correction (not tied to a specific QSO) — to correct a specific contact, use the ✎ button on that row in the QSO table
submissions.detail.review.points.amount.placeholder : Points (e.g. -5 or 3)
submissions.detail.review.points.reason.placeholder : Reason (optional)
submissions.detail.review.points.submit : Apply correction
submissions.detail.review.points.history : Previous corrections
submissions.detail.review.points.history.col.qso : QSO
submissions.detail.review.points.history.col.reason : Reason
submissions.detail.review.points.history.col.manager : Manager
submissions.detail.review.points.history.col.at : Date
submissions.detail.review.remark.placeholder : Remark for the decision (visible to the applicant, recommended when rejecting)
submissions.detail.review.approve : Approve
submissions.detail.review.reject : Reject
submissions.detail.review.confirm.approve : Are you sure you want to approve this submission?
submissions.detail.review.confirm.reject : Are you sure you want to reject this submission?
submissions.detail.review.by : Reviewed
submissions.detail.review.remark : Manager's remark
submissions.detail.review.manual.suffix : manual
submissions.detail.review.qso.rule.custom : -- Custom --
submissions.detail.review.qso.points.unit : points
submissions.detail.review.qso.amount.placeholder : Points (for custom)
submissions.detail.review.qso.reason.placeholder : Reason
submissions.detail.review.qso.apply : Apply

error.submission.review.state : This submission is not currently in a reviewable state.
error.submission.review.decision : Invalid decision.
error.submission.review.amount : Please provide a non-zero point correction.
error.submission.review.rule : Invalid rule.

email.submission.approved.subject : Diploma approved
email.submission.approved.intro : We're happy to let you know your submission has been approved. The certificate will soon be available for download on the submission page.
email.submission.approved.btn : View submission
email.submission.rejected.subject : Diploma rejected
email.submission.rejected.intro : We regret to inform you that your submission has been rejected.
email.submission.rejected.btn : View submission
email.submission.review_needed.subject : Submission awaiting review
email.submission.review_needed.intro : A submission is awaiting your review for the "{0}" diploma.
email.submission.review_needed.btn : View submission
email.submission.qsl_needed.subject : QSL confirmation upload needed
email.submission.qsl_needed.intro : Your log submitted for the "{0}" diploma needs a QSL confirmation (image or scan) for {1} QSO(s) before it can be reviewed.
email.submission.qsl_needed.btn : Upload QSL

error.payment.state : This submission is not currently in a state that allows this payment action.
error.payment.method : Invalid or unavailable payment method for this diploma.
error.payment.unavailable : This payment method is currently unavailable (the provider isn't configured). Please try another method, or contact the diploma manager.

email.payment.paid.subject : Payment confirmed
email.payment.paid.intro : Thank you, we've recorded the payment for your submission.
email.payment.paid.btn : View submission

submissions.detail.payment.title : Payment
submissions.detail.payment.amount.label : Amount due
submissions.detail.payment.method.stripe : Pay by card (Stripe)
submissions.detail.payment.method.paypal : Pay with PayPal
submissions.detail.payment.method.bank_transfer : Pay by bank transfer
submissions.detail.payment.bank.intro : Please transfer the amount above to the account below, using the reference number in the payment note.
submissions.detail.payment.bank.reference : Payment reference
submissions.detail.payment.bank.pending : The bank transfer has been recorded — the manager will confirm it once received.
submissions.detail.payment.error : An error occurred while starting the payment.
submissions.detail.payment.confirm.bank : Manager: confirm that the bank transfer has been received?
submissions.detail.payment.confirm.button : Confirm payment (bank transfer)
submissions.detail.payment.complete.confirm : Mark this submission as completed (the physical certificate has been sent)?
submissions.detail.payment.complete.button : Mark as completed
submissions.detail.payment.cancelled : The payment was cancelled or did not complete — you can try again at any time.
