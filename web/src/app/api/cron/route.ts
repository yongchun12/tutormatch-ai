import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import { CrawlSchedule, SINGLETON_KEY } from '@/models/CrawlSchedule';
import { isCrawlDue } from '@/lib/crawl-schedule';
import { runCrawl } from '@/services/crawlRunner';
import { sweepUnsyncedCentres } from '@/services/autoSync';
import { sweepUnimportedReviews } from '@/services/autoReviews';

/**
 * The scheduler's knock.
 *
 * Something outside the app calls this on a fixed interval — Vercel Cron in
 * production, `npm run cron` locally. It does NOT decide when to crawl; the
 * admin does, via the schedule stored in the database. This route just checks
 * whether the admin's chosen time has arrived, and returns immediately if not.
 * That is what makes the dashboard's controls real: a knock outside the window
 * costs one cheap database read and zero Google Places quota.
 */
export async function GET(request: Request) {
  // Verify the request really is the scheduler, via the bearer token Vercel Cron
  // sends. This FAILS CLOSED: with no CRON_SECRET configured the route is
  // refused outright rather than left open. It used to be `if (CRON_SECRET &&
  // ...)`, which silently skipped the whole check whenever the variable was
  // unset — leaving an endpoint that spends Google Places quota and writes to
  // the database open to anyone who knew the URL.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('CRON_SECRET is not configured; refusing to run the scheduled scrape.');
    return new NextResponse('Cron is not configured', { status: 503 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    await dbConnect();

    // Read the admin's schedule. Absent (nobody has saved settings yet) means
    // disabled — a fresh install must not start spending quota on its own.
    const schedule = await CrawlSchedule.findOne({ key: SINGLETON_KEY }).lean();
    const verdict = isCrawlDue(
      {
        enabled: schedule?.enabled ?? false,
        frequency: schedule?.frequency ?? 'daily',
        hour: schedule?.hour ?? 2,
        dayOfWeek: schedule?.dayOfWeek ?? 1,
        lastRunAt: schedule?.lastRunAt ?? null,
      },
      new Date()
    );

    // Catch up on centres whose Google reviews have never been through the
    // sentiment model.
    //
    // DELIBERATELY ABOVE THE `due` CHECK, unlike the website sweep further down.
    // A crawl is due at most once a day on the default schedule, and this sweep
    // does ten centres at a time — behind that gate, a directory of a hundred-odd
    // centres would take a fortnight to finish analysing, and every page in the
    // meantime would still say the reviews had not been imported. Running it on
    // every ten-minute knock clears the same backlog in a couple of hours.
    //
    // Safe to run that often because it is self-terminating: the query only
    // matches centres never imported (or last imported outside the retry window),
    // so once the backlog is gone each knock costs one indexed lookup and no
    // Google quota at all.
    //
    // Fails soft: a sweep problem must never turn a healthy cron into an error.
    let reviewsSwept = { attempted: 0, imported: 0, failed: 0 };
    try {
      reviewsSwept = await sweepUnimportedReviews('cron-reviews');
    } catch (reviewError: unknown) {
      const reason = reviewError instanceof Error ? reviewError.message : String(reviewError);
      console.warn('[cron]', `Catch-up review import did not finish: ${reason}. Nothing else was affected.`);
    }

    if (!verdict.due) {
      // Deliberately quiet. The local scheduler knocks every ten minutes, so
      // announcing every skip would bury the runs that actually did something.
      return NextResponse.json({
        skipped: true,
        reason: verdict.reason,
        reviewsCaughtUp: reviewsSwept,
      });
    }

    // Claim the slot BEFORE crawling. Two knocks arriving close together would
    // otherwise both read "due" and run the crawl twice; stamping lastRunAt
    // first means the second one sees the window as already taken.
    await CrawlSchedule.updateOne(
      { key: SINGLETON_KEY },
      { $set: { lastRunAt: new Date() } },
      { upsert: true }
    );

    const result = await runCrawl('cron');

    // Catch up on centres that could not be synced when they were found.
    //
    // Two discovery paths cannot do it inline: the Python Scrapy crawler writes
    // straight to MongoDB and has no way to reach Gemini, and the chat-facing
    // discovery skips the per-place lookup that would tell it the website. Without
    // this those centres would wait for an admin to press a button, which is what
    // the automatic sync exists to avoid. A handful per run, oldest attempt first
    // — see sweepUnsyncedCentres in services/autoSync.ts.
    //
    // Fails soft: a sweep problem must not turn a successful crawl into a reported
    // failure, so its own errors are logged and the crawl's result stands.
    let swept = { attempted: 0, updated: 0, failed: 0 };
    try {
      swept = await sweepUnsyncedCentres('cron-sweep');
    } catch (sweepError: unknown) {
      const reason = sweepError instanceof Error ? sweepError.message : String(sweepError);
      console.warn('[cron]', `Catch-up sync did not finish: ${reason}. The crawl itself was unaffected.`);
    }

    const summaryParts = [result.summary];
    if (swept.updated > 0) {
      summaryParts.push(
        `Also filled in ${swept.updated} older centre${swept.updated === 1 ? "" : "s"} from their own websites.`
      );
    }
    if (reviewsSwept.imported > 0) {
      summaryParts.push(
        `Analysed ${reviewsSwept.imported} Google review${reviewsSwept.imported === 1 ? "" : "s"} ` +
          `across ${reviewsSwept.attempted} centre${reviewsSwept.attempted === 1 ? "" : "s"}.`
      );
    }
    const summary = summaryParts.join(" ");

    await CrawlSchedule.updateOne(
      { key: SINGLETON_KEY },
      { $set: { lastRunSummary: summary, lastRunOk: result.ok } }
    );

    return NextResponse.json({
      success: result.ok,
      reason: verdict.reason,
      summary,
      caughtUp: swept,
      reviewsCaughtUp: reviewsSwept,
      area: result.area,
      added: result.added,
      autoPublished: result.autoPublished,
      heldForReview: result.heldForReview,
      websiteSynced: result.websiteSynced,
      missingSubjects: result.missingSubjects,
    });
  } catch (error: any) {
    console.error('[cron] Scheduled crawl failed:', error);
    try {
      // Recorded on the schedule itself so the dashboard can show the failure —
      // this is now the only place an admin can see that a run went wrong.
      await CrawlSchedule.updateOne(
        { key: SINGLETON_KEY },
        { $set: { lastRunSummary: `Failed: ${error.message}`, lastRunOk: false } }
      );
    } catch {
      /* the response below is what matters */
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
