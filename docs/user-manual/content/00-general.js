module.exports = {
    slug: 'general',
    title: 'General',
    navTitle: 'General',
    navDesc: 'Registration, login, two-factor authentication (MFA), account management, contacts, language switching.',
    intro:
        'This page covers the functions that apply to every user of the system (both radio amateurs and diploma managers): how to create an account, log in, and what can be configured on your own profile. Role-specific functions (submitting a log, diploma administration, review) are covered on the other two pages.',
    sections: [
        {
            id: 'home',
            heading: 'Home page',
            body: [
                '<p>The system\'s home page does not require logging in. Besides the manager-configured custom title, welcome text and banner image, this is where the diploma list can be reached (<strong class="ui">View diplomas</strong> button), and, from the sidebar menu, <strong class="ui">Login</strong> and <strong class="ui">Register</strong>.</p>',
                '<p>At the bottom of the sidebar menu is the language switcher (Hungarian, English, German) - the choice is stored in a cookie, and after logging in, the account\'s own language setting is written into that cookie.</p>',
            ],
            image: 'general/01-home',
            caption: 'The home page - with a custom logo, banner image and welcome text set by the manager.',
        },
        {
            id: 'register',
            heading: 'Registration',
            body: [
                '<p>To create a new account, a radio amateur has to provide their email address, password, name, callsign and (by filling in their postal address) their country - the latter matters because the evaluation of a diploma\'s zone-based (home / EU / DX-country) score thresholds starts from this data.</p>',
                '<div class="callout"><strong>Note:</strong> the password has to meet the minimum requirements shown on the form (length, characters) - a live checklist below the input field shows which requirement is already met.</div>',
                '<p>Registration also includes a short <strong class="ui">amateur radio check</strong> (a lightweight, bot-deterrent alternative to a typical captcha): a random frequency (in kHz) is shown, and a multiple-choice answer has to be picked for which amateur band it falls into. The correct answer is verified on the server, tied to a one-time token - a wrong answer, or letting the question expire, simply loads a new question to try again.</p>',
                '<p>After submitting the registration, a confirmation email is sent to the address provided; clicking the link in it activates the account. Until that happens, logging in is not possible.</p>',
            ],
            image: 'general/02-register',
            caption: 'The registration form, including the amateur radio check.',
        },
        {
            id: 'login',
            heading: 'Login and two-factor authentication (MFA)',
            body: [
                '<p>Logging in requires an email address and password. If the manager has made two-factor authentication mandatory or optional for the given role (radio amateur or manager) in the system settings (see the <strong class="ui">Settings</strong> section on the <a href="manager.html">Diploma manager</a> page), a second step follows after the password: entering a one-time, 6-digit code.</p>',
                '<p>Depending on how the account is configured, the system can deliver this code two ways: by email (valid for a few minutes), or read from an authenticator app (TOTP, e.g. Google Authenticator, Authy). If the account doesn\'t have an MFA method set up yet but the policy requires one, the system walks the user through setup immediately on login (choosing a method, then confirming with a test code).</p>',
                '<div class="callout"><strong>Tip:</strong> two-factor authentication can also be turned on/off (or its method changed) later, voluntarily, on the <strong class="ui">My profile</strong> page, as long as the policy doesn\'t make it mandatory - see below.</div>',
            ],
            image: 'radio-amateur/00b-mfa-verify',
            caption: 'The two-factor authentication code prompt at login.',
        },
        {
            id: 'forgot-password',
            heading: 'Forgot password',
            body: [
                '<p>The <strong class="ui">Forgot password</strong> link on the login page starts the password reset flow: if an account exists for the given email address, the system sends a link (valid for a few hours) to it, which leads to a page for setting a new password.</p>',
            ],
            image: 'general/03-forgot-password',
            caption: 'The forgot password form.',
        },
        {
            id: 'my-profile',
            heading: 'My profile - profile and MFA management',
            body: [
                '<p>On the <strong class="ui">My profile</strong> page, the name, callsign, address, language can be changed, and a new password can be set here too. The email address (as the login identifier) cannot be changed later.</p>',
                '<p>At the bottom of the page, if the policy allows it, two-factor authentication can be turned on/off or its method changed at the user\'s own initiative - without re-entering the password, since the user is already logged in. If the policy makes MFA mandatory for the role, the disable button doesn\'t appear, only the method-switch option.</p>',
            ],
            image: 'radio-amateur/01-account',
            caption: 'The My profile page - profile data and password change.',
        },
        {
            id: 'contacts',
            heading: 'Contacts',
            body: [
                '<p>The <strong class="ui">Contacts</strong> menu item leads to a public page whose content the manager can fill in freely on the Settings page - including raw HTML tags (links, formatting, lists), which the system renders exactly as entered. If nothing has been filled in yet, a placeholder message is shown instead.</p>',
            ],
            image: 'general/04-contacts',
            caption: 'The Contacts page with example content filled in by the manager.',
        },
    ],
};
