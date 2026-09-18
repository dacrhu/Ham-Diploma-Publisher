# User documentation

The actual manual, illustrated with real screenshots of the interface, lives in the
[user-manual/](user-manual/) directory (start here:
[user-manual/index.html](user-manual/index.html)) — the `.html` files can each be
opened on their own in any browser, no server or internet connection needed (the
images are embedded as base64).

This file is just a short pointer — built the same way as the technology reference
project (`/home/berci/GIT/GITEA/EHS/ehs4/docs/user-manual/`); see [CLAUDE.md](../CLAUDE.md)
for the software's architecture.

## Updating

The content is made up of two parts:

1. **Screenshots** — generated from the local dev Docker environment by the
   Puppeteer script under [tools/screenshot-doc](../tools/screenshot-doc/) (see the
   README there for prerequisites — dedicated test accounts and a disposable test
   diploma).
2. **Text** — in the `.js` files under [user-manual/content/](user-manual/content/),
   one per role (General / Radio amateur user / Diploma manager).

If the interface changes, first regenerate the affected screenshots, then re-run
the build script:

```bash
node tools/screenshot-doc/shoot.js            # or just one scenario, see the README there
node docs/user-manual/build.js                # regenerates the .html files
```
