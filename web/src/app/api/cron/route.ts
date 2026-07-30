import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import { CrawlSchedule, SINGLETON_KEY } from '@/models/CrawlSchedule';
import { isCrawlDue } from '@/lib/crawl-schedule';
import { runCrawl } from '@/services/crawlRunner';

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

    if (!verdict.due) {
      // Deliberately quiet. The local scheduler knocks every ten minutes, so
      // announcing every skip would bury the runs that actually did something.
      return NextResponse.json({ skipped: true, reason: verdict.reason });
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

    await CrawlSchedule.updateOne(
      { key: SINGLETON_KEY },
      { $set: { lastRunSummary: result.summary, lastRunOk: result.ok } }
    );

    return NextResponse.json({
      success: result.ok,
      reason: verdict.reason,
      summary: result.summary,
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
