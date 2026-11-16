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
| 2026-11-14 | **Its own product identity.** `mw::edition::productNameFor` is `S3XYCastPC` (`S3XYCastPCDev` for a DEV build) and the organisation is `S3XYCast` (`kOrganizationName`): the executable, the data folder, the scheduled tasks, the local channels and the staging folders are the edition's own, so that on a machine that also has MoonlightWeb it never reads or writes MoonlightWeb's. What a router lists (UPnP), what a certificate, Sunshine's device list, a Windows QoS policy or a downloaded file is called, and what the program says about itself, read S3XYCast PC; its requests are signed `S3XYCastPC`. The drivers keep the names they were signed under (`MoonlightWeb Virtual HID`, the VDD package); the virtual display takes the product's name. |
| 2026-11-14 | **Consent text.** The Internet-access agreement says what this edition does: the S3XYCast entry server by name, and the public STUN servers that are actually asked. Wizard, admin page, installer and command line, in every language they speak. |
| 2026-11-14 | **Log scrubbing.** A log shared for support hides the machine's link on this edition's entry server, as it hides one on upstream's (`LogScrubber.cpp`). |
| 2026-11-14 | **Introduction server.** `mw-rendezvous` can read its owner secret from a file (`MW_RDV_OWNER_SECRET_FILE`), for a Windows service whose environment would otherwise sit in the registry. |
| 2026-11-14 | **Windows installer.** `backend/installer/moonlightweb.iss` installs the edition under its own names: its own application id, `%AppData%\S3XYCast\S3XYCastPC`, tasks and keys named after the product, shortcuts and wizard texts that read S3XYCast PC, a virtual-display page in plain words. It installs beside MoonlightWeb and uninstalls without touching it: the two share only the register of the editions that rely on the Ctrl+Alt+Del policy and the signed HID driver, and this installer removes no file of MoonlightWeb's. `backend/installer/make-installer.bat` stages and compiles it the way upstream's release workflow does. |
| 2026-11-14 | **Plain words.** The home page, the login page and the admin page say what they do in everyday words (a native host's screens are "Screen fitted to this device" and "PC screen 1"; the session name is folded under "More options"). |
| 2026-11-14 | **Updates from the edition's own releases.** The update check and the elevated helper read the edition's release tags (`s3x-vX.Y.Z`, `mw::edition::kReleaseTagPrefix`) through one function, `UpdateChecker::versionOfTag`: a bare "v" strip read `s3x-v1.0.0` as 0.0.0 and would never have offered it. A staged update is named after the product (`S3XYCastPC-update.exe`). The command-line hints name the command that exists (`S3XYCastPC --status`, `--new-pin`…). |
| 2026-11-14 | **Fonts and source.** The licences of the two fonts the look adds sit next to them (`frontend/assets/fonts/OFL-Overpass.txt`, `OFL-GeistMono.txt`, and `bootstrap/assets/OFL-Overpass.txt` for the entry page). The About window links to this repository (`EDITION_SOURCE_URL` in `frontend/js/brand.js`). |
| 2026-11-14 | **No scheduled workflow.** `.github/workflows/bootstrap-watch.yml` compares upstream's entry page with upstream's reference copy every six hours; in this repository it only runs by hand, until it is pointed at the edition's own. The other workflows fire on `v*` tags and pull requests, which this edition does not push. |
| 2026-11-15 | **An installed copy serves its own interface.** Upstream tries the compile-time path of the source tree first and the folder next to the executable second; on the machine a release is built on, the installed program served the work copy, and the entry page refused it as "a modified interface" the moment a file there was edited. The installed folder now comes first (`HttpServer.cpp`, `TrayManager.cpp`). After an install on the build machine, open the page through the entry link: that is the check that catches it. |
| 2026-11-15 | **A relay of last resort.** MoonlightWeb runs no relay: a home whose router opens nothing, or a browser that sends no UDP (a car's), ends on "no direct connection could be opened". This edition's server has one, `deploy/s3xycast-relais` (TURN over UDP and TCP, `github.com/pion/turn`, MIT; a separate program, so that `mw-rendezvous` still imports nothing). The introduction server hands out credentials that last a day and name the one machine they are for (`relaycred.go`; `MW_RDV_RELAY_URLS`); the entry page takes them from its `ready` frame (`relayOf` in `bootstrap/v1/tunnel.js`); the host takes them from an "ice" frame of its line (`network/RelayGrant`) and passes them on in the `ice-config` of a stream; the two WebRTC transports keep relayed candidates when the host says so (`relayAllowed` in `frontend/js/api/IceServers.js`). Direct paths are still gathered and preferred. The settings page says which way a router leaves, and links to how to turn UPnP on. The entry page's `stun:<host>:3478` is answered by the relay too. |
| 2026-11-15 | **The agreement names the relay.** Upstream's Internet-access agreement says "Streaming is direct", which the relay of last resort makes untrue for a home whose router opens nothing. The wizard, the settings page and the installer now say, in every language they speak, that the encrypted stream then passes through the S3XYCast relay, which forwards it and records nothing (`setup.internetBody`, `admin.internetInfo1`, `InternetPageBody`; `frontend/test/InternetConsentRelay.test.js` holds it, next to upstream's own pin that keeps the surfaces one text). **Not in 0.1.2**, which still shows upstream's sentence. |
| 2026-11-15 | **A tiebreaker of zero is still a role.** A browser's TURN-over-TCP port sends its connectivity checks with a tiebreaker of zero (Chrome 157: eight zero bytes in `ICE-CONTROLLED`, where its TURN-over-UDP port sends a random number). libjuice took the tiebreaker's value for the attribute's presence, read such a check as naming no role, and answered 400, on which the browser gives the pair up. The host meanwhile reported itself connected. A browser that reaches the relay over TCP only, which is a car's, never got in: seen on the real relay the day it went into service, with a browser held to the relay's TCP address, and **0.1.2 has exactly that**. `third_party/patches/libjuice-zero-tiebreaker.patch` reads presence as presence (`has_ice_controlling`, `has_ice_controlled` in `stun_message_t`); `test_zero_tiebreaker_is_a_role` in `backend/tests/test_ice_tcp_passive.c` holds it, and fails with the 400 when the old line is put back. |
| 2026-11-15 | **A controller played as a keyboard and a mouse.** A game written for the keyboard and the mouse ignores a controller, whatever plugs it in: seen the day 0.1.3 was installed, with the host's virtual Xbox pad plugged in, its stick read at full travel by XInput on the host, and a game that never moved. From a phone or a car's screen there is nothing else to hold. `frontend/js/stream/PadKeyMouse.js` sits between `GamepadManager` and the input channel: in its `kbm` mode a pad never reaches the host as a pad, the left stick holds the movement keys, the right one moves the mouse, and each button is a key or a mouse button of the viewer's choosing (`ui/PadKeyMouseDialog.js`, opened from the settings page and from a small button on the on-screen controller, whose buttons then wear their keys; `ui/StreamViewPadKbm.js`). Nothing changes on the host or in the protocol: the keys go out through the stream's own senders and sit in its held-input heartbeat, by position for the placed keys and as a chord's character for a letter, so that "Q" is the key a French keyboard prints Q on. Per device, off by default, for the on-screen controller and a real one alike; a guest's pad stays a pad. Upstream's files are touched in a few lines each (`StreamView.js`, `StreamViewTouchPad.js`, `TouchPadView.js`, `SettingsView.js`, `app.js`), which `frontend/test/streamViewPadKbmHooks.test.js` pins against a merge that would drop them. **From 0.1.4.** |
| 2026-11-15 | **The controller's two modes are named for what the player wants.** "Keyboard and mouse mode" named the mechanism, and read as the wrong thing to turn on to make a controller work (the owner's remark, the day it shipped). The dialog is now "Controller mode", with "Normal" and "Works with every game"; the stored value (`pad_kbm_mode`) is unchanged. **From 0.1.5.** |
| 2026-11-15 | **On the PC itself, one simple page.** Upstream's home page on the host machine is the list of what can be streamed from it, under three settings buttons: the place to watch from, shown on the one machine nobody watches from. This edition shows there what the owner asked for (`frontend/js/ui/PcDashboard.js`, mounted by `app.js` in `_mountHostsBanners`): the state in one line, one big button that allows or stops the streaming (upstream's Internet Access, by the name of what it is for, recording the same agreement), the link, which never changes, whether the personal code is chosen, and "Settings". The list is one click away. A booth and every other browser keep upstream's page. **From 0.1.5.** |
| 2026-11-15 | **A launch shows that page.** Upstream opens the administration page when the program is started by hand, started again while it runs, and at the end of the installer (`--open-link`). This edition opens the front door (`mw::edition::kOwnerPage`, empty), which on the PC itself is the simple page, with a new version announced above it: whoever starts the program is told of an update first. A tab already open on the PC goes back to the simple page instead of opening the settings (`_onFocusAdminRequest`), and a stream running in it is left alone. The tray's "Server Settings" still opens the administration page. The installer's last page says "Open S3XYCast PC". **From 0.1.5.** |
| 2026-11-15 | **The entry server fetches a release's list by itself.** The entry page refuses a version that has no list (`bootstrap/v1/official.js`), so a list has to be served before its release is installed anywhere; it reached this edition's server by hand, in a server package, for each release. `deploy/s3xycast-listes` (Go, standard library only, not part of MoonlightWeb) runs there as a service of its own, under a restricted account that can write to the lists' folder and nowhere else: every ten minutes it reads the release tags of the public repository (`s3x-vX.Y.Z`), and for each one whose list is not on the server it fetches `bootstrap/v1/interfaces/X.Y.Z.json` at that tag, checks that it is the list of that version (a digest for every file, the main page among them) and puts it beside the others. It never replaces or removes a list, listens on nothing, and follows no redirect to another host. A release is then: push the tag, wait for `https://pc.s3xycast.com/v1/interfaces/X.Y.Z.json` to answer, publish. It trusts the repository's tags: whoever can push one can publish a release, which every PC installs by itself. |

| 2026-11-15 | **Turning streaming off stops it.** The big button of the PC's page turned the streaming off by closing the line to the introduction server, which only keeps new browsers out: a page already in kept its tunnel and its stream, and the phone went on showing the PC. Off now ends every stream, each viewer told it was stopped on this machine (the tray's Disconnect words), closes every tunnel but the owner's own — the page the button was pressed on, and where the streaming is allowed again — and logs it. A stream carried by the server itself, where stream workers are turned off in the settings, ends too. `closeVisitors` in `ControlTunnel`, the `/api/internet/disable` callback in `main.cpp`. **From 0.1.6.** |
| 2026-11-15 | **The stream's quick actions, and a picture that can be moved.** Three things were out of reach from a car's screen or a phone held in one hand: the keys no touch screen has (the Windows key, Alt+Tab, Alt+F4 — the special-keys bar has them only above the device's keyboard), another screen of the same PC without stopping the stream and opening its card, and the zoomed picture's far parts: the pinch zooms, but moving takes three fingers, and the pan was held so that no black ever showed. One button on the stream bar opens a strip under it, in the page's flow so that nothing of the PC is covered: the keys, each wearing the keys it presses, the PC's other screens (the owner's to change, through the ordinary relaunch on the same transport with the other screen as its app, refused while guests are on the stream, the previous screen brought back if the other does not start), and the zoom with a one-finger "move the picture" mode. Every edge of the zoomed picture may now come as far as the middle of the area, and that freedom grows with the zoom so a pinch back to the whole picture does not jump (`stream/ViewZoom.js`; `StreamViewTouch._applyZoomTransform`). A guest without the keyboard gets no keys. `ui/StreamViewQuick.js`, `test/streamViewQuick.test.js`, `test/streamViewQuickHooks.test.js`, `test/viewZoom.test.js`. **From 0.1.6.** |
| 2026-11-15 | **No "Moonlight" left in what is read.** Two sentences still said it — the iPhone full-screen hint the owner saw on his own phone, and the "quit the app on stop" setting. The catalogues say S3XYCast PC, and `test/streamViewQuick.test.js` fails on any catalogue text that names it again. **From 0.1.6.** |
| 2026-11-16 | **A touch screen that reads as a computer has a pointer.** Upstream draws the host's pointer on the page for a phone or a tablet, moved from the finger; every other browser is taken for a computer, whose mouse has an arrow of its own, and the host is told to keep its pointer out of the picture. A car's browser fell between the two: the owner's Tesla says "X11; Linux x86_64" and nothing else, its screen is touch only, and in the session of that morning the host took 390 moves and clicks from his fingers with no pointer drawn anywhere — "touch does nothing, I do not even see the cursor". The pointer now belongs to whichever device was used last (`frontend/js/stream/FingerPointer.js`): a finger on the stream takes it and the page draws it from then on, steered by exact positions as on a phone; a mouse that really moves or presses takes it back. As the stream starts it goes by the press that started it, and without one by what the browser says of itself (`touchIsOnlyPointer` in `BrowserDetect.js`). On such a screen the arrow's ink is brought to 22 CSS pixels, about 7 mm on the car's glass, where a 3440-pixel desktop left it under 2 mm. Phones, tablets and televisions keep what they had; nothing changes on the host or in the protocol. Upstream's `StreamView.js` is touched in a few lines, which `frontend/test/fingerPointerView.test.js` pins against a merge that would drop them; `frontend/test/fingerPointer.test.js`. **From 0.1.6.** |

Upstream's stylesheets are not edited: the look is one additional file, so that taking a new
upstream release stays a merge of their files and a look at ours.

## What it does not change

The streaming engine, the transports, the one-time PIN and the sessions, the virtual display and
input drivers, and everything else not listed above are upstream's, unmodified.

## How a release is made

The edition has its own line of versions, tagged `s3x-vX.Y.Z` on its branch: the repository keeps
upstream's history and its `v*` tags, and the two lines must not be read as one (the build,
`scripts/interface-list.mjs` and the update check look for the edition's prefix only).
`bootstrap/v1/interfaces/` holds the edition's lists and none of upstream's.

1. The list of the release's interface, built and committed
   (`node scripts/interface-list.mjs build X.Y.Z --ref HEAD`), then the tag `s3x-vX.Y.Z`.
2. The build and the installer (`backend/installer/make-installer.bat X.Y.Z`), named
   `S3XYCastPC-installer-X.Y.Z-win-x64.exe`: the update helper accepts no other name.
3. **The list on the entry server first** (`pc.s3xycast.com/v1/interfaces/X.Y.Z.json`). The entry
   page refuses, by design, an interface that is not one of the published releases: a machine that
   updates before its list is there is locked out of the internet link until it is.
4. The GitHub release of this repository, tag `s3x-vX.Y.Z`, not a draft and not a pre-release,
   with that one installer attached. Installed copies find it by themselves (`releases/latest`),
   check its size and its SHA-256 against what GitHub publishes, and install it.

The introduction server is in service at `pc.s3xycast.com` since 2026-11-14
(`deploy/powerdns/mw-rendezvous` and the entry page behind Caddy, on a Windows machine).

## Running the tests

- Interface: in `frontend/`, `npm run check` then `npx vitest run`.
- Program: `backend\tests\run_coverage.bat` builds and runs `run_tests.exe`, then
  `run_juice_tests.exe`. The security suite, `build\mw-security-tests.exe`, is built with the
  program (`backend\build_msvc.bat`); the update helper's rules are tested there.
- **One of upstream's cases fails on some Windows machines, some of the time**: "A burst the
  socket cannot take at once arrives whole and in order" (`backend/tests/test_ice_tcp_passive.c`;
  this edition changes neither that case nor the code it runs: its own patch on libjuice is about
  the role attributes of a check, and its own case in that file is the last one). Its reader has a
  4 KB receive buffer and
  gives each frame 300 ms. On the machine this edition is built on, the body of a frame
  sometimes takes longer after 13 to 29 frames (measured on 2026-11-14: the read comes back after
  312 ms), the reader loses the framing and the case fails. The same binary passes at other
  moments of the same day, and passes under verbose logging. With a 64 KB receive buffer on the
  reader it passed 6 times out of 6; with 16 KB it failed 5 times out of 6. It takes a peer with
  a very small receive window, which a browser does not have, and a stream over TCP to a browser
  on the same machine showed no such pause. Not explained further.

## Before the first public release (not done yet)

- **This repository made public.** Done: it is `github.com/botdiscordbible/s3xycast-pc`, public, with the releases 0.1.1 to 0.1.5. The About window and the update check both name
  `github.com/botdiscordbible/s3xycast-pc`. It has to exist and be public before the program is
  handed to anyone: it is the source offer the licence asks for (GPL-3.0 §6). Each release is published there after its tag, with its installer under two names — the one the update check reads, and the fixed one the site links to.
- **Never 0.1.2.** It has the relay, an Internet-access agreement that still reads "Streaming is
  direct", and a host that refuses a browser coming through the relay over TCP (the two rows of
  2026-11-15 above). It was built and never given to anyone. 0.1.3 carries both corrections; its
  interface list goes on the entry server first, like any release's.
- **Code signing.** The program and its installer are not signed: Windows SmartScreen warns on
  the download and the elevation prompt reads "Unknown publisher". A code-signing certificate
  (and `SignTool` in the installer script, or a signing step around it as upstream does) is what
  removes both. Once an install is signed, its updates must be signed by the same publisher
  (`UpdateApply`).
- `backend/installer/deploy.bat` is upstream's older staging script, unused here.

## Credits

- MoonlightWeb — © 2026 Bruno Martin, GPL-3.0. Third-party components: see [`COPYRIGHT`](COPYRIGHT).
- The S3XYCast name and mark belong to S3XYCast; they are not covered by the GPL grant on the code.
