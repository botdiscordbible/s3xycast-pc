/*
 * S3XYCast PC — frontend TNR. GPLv3, like the files under test.
 *
 * After a Remote Desktop session, the PC must open again without one.
 *
 * The program starts its stream worker through a SYSTEM service
 * (backend/src/streaming/WorkerService.cpp). That service refuses a caller
 * that is not on the console — a Remote Desktop session — and the stream then
 * goes through the elevated task. Upstream took that refusal for a breakdown
 * and stopped using the service until the program restarted. But once Remote
 * Desktop is closed, the only screen left is the sign-in screen, and only the
 * service can show it: one stream opened during a Remote Desktop session, and
 * the PC offered nothing afterwards unless Remote Desktop was connected again
 * (a subscriber, 17/11/2026: "ça doit fonctionner sans devoir utiliser en même
 * temps connexion bureau à distance").
 *
 * The rule itself is tested in C++ (backend/tests/test_edition_worker_service
 * .cpp). This holds the three places it depends on, read from the sources: a
 * merge of a new upstream release that rewords the service's answer, or brings
 * the old line back, fails here.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const backend = (...path) =>
    readFileSync(join(here, '..', '..', 'backend', 'src', ...path), 'utf8');

/** The body of a function, from its signature to the first line that is "}". */
function body(text, signature) {
    const start = text.indexOf(signature);
    if (start < 0) return '';
    const end = text.indexOf('\n}\n', start);
    return end < 0 ? '' : text.slice(start, end);
}

describe('the worker service, after a Remote Desktop session', () => {
    const cpp = backend('streaming', 'WorkerService.cpp');
    const header = backend('streaming', 'WorkerService.h');

    it('is not given up for a refusal', () => {
        const request = body(cpp, 'bool requestWorker(const QString& base, QString* error)');
        expect(request).not.toBe('');
        // The one place an ordinary worker's failure is recorded, and it asks first.
        const records = request.match(/g_ServiceBroken\.store\(true\)/g) || [];
        expect(records).toHaveLength(1);
        expect(request).toMatch(
            /if \(failureBreaksService\(why\)\) g_ServiceBroken\.store\(true\);/,
        );
    });

    it('is refused in the word the rule knows', () => {
        expect(header).toMatch(/inline constexpr char kRefusal\[\] = "refused";/);
        expect(header).toMatch(/return why != QLatin1String\(kRefusal\);/);
        // What the service answers a caller that is not on the console, and a
        // console nobody is signed in on: "err refused", for an ordinary worker.
        const serve = body(cpp, 'void serveOne(HANDLE pipe)');
        expect(serve).toMatch(
            /!callerAllowed\(pipe, &why, &callerSid\)\) \{\s*answer = QStringLiteral\("err refused"\);/,
        );
        expect(serve).toMatch(
            /!userSignedIn\(::WTSGetActiveConsoleSessionId\(\)\)\) \{[^}]*answer = QStringLiteral\("err refused"\);/,
        );
        // And the caller hears it without its "err ".
        const ask = body(cpp, 'bool askService(const QByteArray& request, QString* error)');
        expect(ask).toMatch(/answer\.startsWith\(QStringLiteral\("err "\)\)\s*\? answer\.mid\(4\)/);
    });

    it('is what the sign-in screen depends on', () => {
        // Why the refusal must not count: the card "Écran de connexion de ce
        // PC" is offered, and its worker started, only while the service is in use.
        const offered = body(
            backend('streaming', 'RemoteDesktopReturn.cpp'),
            'bool RemoteDesktopReturn::signInAllowed() const',
        );
        expect(offered).toMatch(/WorkerService::available\(\)/);
        const start = body(
            backend('streaming', 'StreamWorkerHost.cpp'),
            'bool StreamWorkerHost::start(const QJsonObject& config)',
        );
        expect(start).toMatch(
            /signInScreen"\)\]\.toBool\(false\)\)\s*return native && WorkerService::available\(\) &&/,
        );
    });
});
