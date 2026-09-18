# Screenshot generator for the user manual

`shoot.js` runs against the local dev Docker stack (`docker compose -f docker/docker-compose-dev.yml up`,
`http://127.0.0.1:8000` + mailhog at `http://127.0.0.1:8026`), using host node
(via `src/node_modules/puppeteer`), and performs a **real login** - this
project has no `DEBUG`-based auto-login bypass (see the "Auth and sessions"
section of the root [CLAUDE.md](../../CLAUDE.md)) - it actually reads the
two-factor authentication code from the mailhog API.

## Prerequisites

- The dev stack is running, and `google-chrome` (or `chromium`) is available on the host.
- Two dedicated TEST accounts exist in the dev database, with the password `TestDoc!2026xy`:
  - `ha3test@example.com` - radio amateur role (callsign `HA3TEST`, MFA: email).
  - `teszt.radios@example.com` - manager role (callsign `HA1TEST`, MFA: email).

  If the password isn't known (anymore), it can be reset again through the
  `/forgot-password` flow (using the link that shows up in mailhog) - which is
  itself a good test of that flow.

- A dedicated, disposable TEST diploma exists, owned by `teszt.radios@example.com`
  (`HA1TEST`) - the full submission -> QSL -> review life cycle plays out on
  this one, so no real diploma or submission (belonging to someone else) has
  to be modified. If it's missing (e.g. the dev DB got rebuilt), it can be
  recreated with the mongosh command below - it's worth copying the
  `blankImage` files over from an existing diploma's directory:

  ```js
  // see an existing diploma's exact document shape
  // (db.diplomas.findOne(...)) - the one below only shows the essential fields
  db.diplomas.insertOne({
    _id: ObjectId(), // note it down, and put it into shoot.js's DEMO_DIPLOMA_ID constant
    name: "TEST - Documentation sample diploma (deletable)",
    managerId: "<teszt.radios _id>",
    ruleMode: "points",
    matchRules: [
      { field: "call", operator: "regex", value: "^OE\\d[A-Z]{2}$", points: 10, label: "OE two-letter suffix" },
      { field: "call", operator: "wildcard", value: "OE*", points: 1, label: "" }
    ],
    zoneThresholds: { home: 20, eu: 10, dx: 5 },
    homeCountry: "HU",
    qslSampleCount: 2,
    status: "active",
    // ... the other fields with the same defaults as an existing diploma
  });
  ```

- `fixtures/testlog.adi` (2 QSOs, with the callsigns `OE7GJ` and `OE3AB`,
  worth exactly 20 points under the rules above - the same regex rule was
  also used to test the "Imagination Award" demo diploma) and
  `fixtures/qsl{1,2}.png` are needed for the submission demo - these are
  already in the repo, no need to regenerate them.

## Running it

```bash
node tools/screenshot-doc/shoot.js                # all three scenarios
node tools/screenshot-doc/shoot.js radio-amateur   # just one scenario
```

There are three scenarios: `general` (home page, registration, forgot
password, contacts - all without logging in), `radio-amateur` (login+MFA,
account, diploma list/details/statistics, log submission, QSL upload, own
submissions - this one creates the test submission), `manager` (login+MFA,
diploma admin's 4 tabs, settings, submission review - this one decides on
the test submission created by the `radio-amateur` scenario).

**Important: the `radio-amateur` scenario must ALWAYS run before `manager`**
(or together, with no arguments) - the manager scenario reads a
`.demo-submission-id` marker file left behind by the earlier run, to know
which submission to review.

Since the test diploma can only have one active submission at a time, the
previous one has to be deleted before a second full re-run (the
`radio-amateur` scenario itself will also report a 403/redirect error if it
collides with an existing submission):

```js
// mongosh hdp
db.submissions.deleteOne({ diplomaId: "<DEMO_DIPLOMA_ID>", userId: "<ha3test _id>" });
db.diplomas.updateOne({ _id: ObjectId("<DEMO_DIPLOMA_ID>") }, { $set: { serialCounter: 1 } });
```

```bash
docker exec hdp rm -rf /app/private/uploads/submissions/<submission id>
```

The output goes into `output/<scenario>/*.png` files - these are stitched
together into the final manual by `docs/user-manual/build.js`.

## Known limitation

The `teszt.radios@example.com` account can only edit/review diplomas
assigned to IT (see `isDiplomaManagerOf` in `schemas/diplomas/diplomas.js` /
`isReviewerOf` in `schemas/submissions/submissions.js`) - and creating a new
diploma is a superadmin-only action. Because of this, the manager scenario
intentionally uses the dedicated TEST diploma described above, NOT a real
diploma (belonging to someone else).
