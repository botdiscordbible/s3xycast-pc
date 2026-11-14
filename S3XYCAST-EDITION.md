# S3XYCast PC — the S3XYCast edition of MoonlightWeb

This repository is a modified version of [MoonlightWeb](https://github.com/linckosz/moonlight-web)
by Bruno Martin. It is distributed under the same licence, the GNU General Public License
version 3 (see [`LICENSE`](LICENSE) and [`COPYRIGHT`](COPYRIGHT)). MoonlightWeb's copyright notices
are kept as they are in every file, and the interface credits the project and its author in its
About window, one click away from the footer of every page.

Made from upstream commit `c93e0686` (2026-11-14, 196 commits after `v0.4.3`).

S3XYCast PC lets a S3XYCast subscriber open their own PC on the screen of their car: the whole
desktop, with sound, touch as a mouse, keyboard and controller. It ships no game and no content.

## What this edition changes (GPL-3.0 §5a)

| Date       | Change |
| ---------- | ------ |
| 2026-11-14 | **Personal access code.** An owner away from the host cannot read the one-time PIN shown there. They can choose a personal code on the admin page and type it on the login page instead. Stored as a PBKDF2 digest; 6 to 64 characters; refused when trivially guessable; counted on its own per-address bucket and, from outside the LAN, on one bucket shared by the whole internet. `AuthManager::validateAccessCode`, `POST /api/auth/validate {code}`, `POST /api/admin/access-code`, `access_code_set` in `GET /api/auth/status`. |
| 2026-11-14 | **Name and look.** The interface is called S3XYCast PC and wears the S3XYCast site's look: `frontend/css/s3xycast.css` (loaded last, over upstream's design tokens), `frontend/js/brand.js`, the icons under `frontend/assets/`, the texts in `frontend/locales/`. Upstream's community invite and donation button are hidden: this edition's users are helped by S3XYCast. |
| 2026-11-14 | **Its own servers, never upstream's.** The program registers with this edition's introduction server (`pc.s3xycast.com`: `mw::edition::kEditionDomain`, `kEditionRendezvousUrl`), finds its public address through a public STUN server (`kEditionStunUrl`) and looks for updates in this edition's own releases. Nothing goes to MoonlightWeb's servers. The entry page (`bootstrap/`) carries the edition's name and look, speaks French to a French browser (`bootstrap/v1/words.js`), and lets an unreleased interface through on a loopback address only. |
| 2026-11-14 | **About window.** The footer's credit line became an About button (`frontend/js/ui/AboutDialog.js`): the licence, the absence of warranty, MoonlightWeb's name, author and copyright line, and links to the licence and to the project. It is the one place of the interface that names upstream; the catalogues take both names from `frontend/js/brand.js` and no longer write them (`frontend/test/AboutDialog.test.js` holds that). |
| 2026-11-14 | **Plain words.** The home page, the login page and the admin page say what they do in everyday words (a native host's screens are "Screen fitted to this device" and "PC screen 1"; the session name is folded under "More options"). |

Upstream's stylesheets are not edited: the look is one additional file, so that taking a new
upstream release stays a merge of their files and a look at ours.

## What it does not change

The streaming engine, the transports, the one-time PIN and the sessions, the virtual display and
input drivers, and everything else not listed above are upstream's, unmodified.

## Before the first public release (not done yet)

- **Its introduction server in service and its own interface lists.** The program already points
  at `pc.s3xycast.com`; the server itself (`deploy/powerdns/mw-rendezvous` and the entry page
  behind a TLS front) still has to be installed there. The entry page refuses, by design, an
  interface that is not one of the published releases: each release of this edition needs its list
  in `bootstrap/v1/interfaces/` (`scripts/interface-list.mjs`), and upstream's lists removed.
- **Its own product identity**: executable, data folder, scheduled tasks and installer names
  (`mw::edition::productNameFor`, `backend/installer/`), an update channel that points at this
  edition's releases, and upstream's census switched off.
- **Font licences next to the fonts**: Overpass (Red Hat, SIL Open Font License 1.1,
  <https://github.com/RedHatOfficial/Overpass>) and Geist Mono (Vercel, SIL Open Font License 1.1,
  <https://github.com/vercel/geist-font>), in `frontend/assets/fonts/`.
- **The source offer**: this edition's public repository, set in `EDITION_SOURCE_URL`
  (`frontend/js/brand.js`). The About window shows the link as soon as it is set; it must be
  before the program is handed to anyone (GPL-3.0 §6).

## Credits

- MoonlightWeb — © 2026 Bruno Martin, GPL-3.0. Third-party components: see [`COPYRIGHT`](COPYRIGHT).
- The S3XYCast name and mark belong to S3XYCast; they are not covered by the GPL grant on the code.
