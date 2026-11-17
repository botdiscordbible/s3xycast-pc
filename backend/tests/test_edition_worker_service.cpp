/*
 * S3XYCast PC — TNR suite of the edition. GPLv3, like the files under test.
 *
 * The launcher service's refusal (streaming/WorkerService.h). It is how the
 * service answers a caller in a Remote Desktop session; upstream took it for
 * a breakdown and stopped using the service until the program restarted,
 * which took the sign-in screen's worker away with it.
 */
#include "test_framework.h"
#include "streaming/WorkerService.h"

void run_edition_worker_service_tests()
{
    SECTION("WorkerService (edition) — a refusal is the service's answer for now");

    // Remote Desktop is connected: the caller is not on the console and the
    // service says so, in one word. The ordinary worker falls back to the
    // elevated task for this stream; the service stays in use, and with it
    // the sign-in screen's worker that only it starts.
    CHECK_EQ(QString::fromLatin1(WorkerService::kRefusal), QStringLiteral("refused"));
    CHECK(!WorkerService::failureBreaksService(QStringLiteral("refused")));

    // What fails the same way every time still takes the service out of use
    // for the rest of the run: the next launches skip it at once.
    CHECK(WorkerService::failureBreaksService(
        QStringLiteral("the worker service is not running")));
    CHECK(WorkerService::failureBreaksService(
        QStringLiteral("cannot reach the worker service (error 5)")));
    CHECK(WorkerService::failureBreaksService(
        QStringLiteral("the worker service's pipe is served by process 12, not by the "
                       "service (34)")));
    CHECK(WorkerService::failureBreaksService(QStringLiteral("cannot send the request (error 232)")));
    CHECK(WorkerService::failureBreaksService(QStringLiteral("the worker service did not answer")));
    CHECK(WorkerService::failureBreaksService(QStringLiteral("the pipe name is not a valid one")));
    CHECK(WorkerService::failureBreaksService(
        QStringLiteral("the pipe name is not one this service accepts")));
    CHECK(WorkerService::failureBreaksService(
        QStringLiteral("CreateProcessAsUser failed (error 5)")));
    CHECK(WorkerService::failureBreaksService(
        QStringLiteral("the worker service refused: nonsense")));

    // Exactly the word, as the service writes it: nothing that merely
    // contains it, and no answer at all is no refusal.
    CHECK(WorkerService::failureBreaksService(QStringLiteral("refused to start")));
    CHECK(WorkerService::failureBreaksService(QStringLiteral("Refused")));
    CHECK(WorkerService::failureBreaksService(QStringLiteral(" refused")));
    CHECK(WorkerService::failureBreaksService(QString()));
}
