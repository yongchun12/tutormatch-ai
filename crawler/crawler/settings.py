import logging

BOT_NAME = "crawler"
SPIDER_MODULES = ["crawler.spiders"]
NEWSPIDER_MODULE = "crawler.spiders"

# --- Logging --------------------------------------------------------------
# Scrapy runs the root logger at DEBUG, which switches on pymongo's own debug
# logging: every command, reply, connection checkout and heartbeat, for all
# three replica set members. That buried the lines that actually matter — the
# rejected Google matches and the gate decisions — under thousands of lines of
# driver chatter.
#
# Raised per logger rather than by lowering Scrapy's LOG_LEVEL, so the spider's
# own DEBUG output is still available when something needs investigating.
for _noisy in (
    "pymongo",
    "pymongo.command",
    "pymongo.connection",
    "pymongo.serverSelection",
    "pymongo.topology",
    "pymongo.heartbeat",
    "urllib3.connectionpool",
):
    logging.getLogger(_noisy).setLevel(logging.WARNING)

# --- Politeness -----------------------------------------------------------
# Obey robots.txt. This was False, which meant the crawler ignored every site's
# stated wishes. Scrapy applies this to requests the spider yields; the
# pipeline's own outbound calls are covered separately by crawler/robots.py.
ROBOTSTXT_OBEY = True

# Identify honestly, with a way to reach the project. A site owner who wants to
# block us needs a name they can put in their own robots.txt.
USER_AGENT = (
    "TutorMatchBot/1.0 (+https://github.com/tutormatch; "
    "academic final year project; contact via repository)"
)

# One request at a time, with a real pause between them. A small academic crawl
# has no reason to hit a host hard, and several of these directories run on
# modest shared hosting.
CONCURRENT_REQUESTS = 1
CONCURRENT_REQUESTS_PER_DOMAIN = 1
DOWNLOAD_DELAY = 2.0

# Back off further when a site responds slowly, adapting to the server's real
# load instead of holding a fixed rate.
AUTOTHROTTLE_ENABLED = True
AUTOTHROTTLE_START_DELAY = 2.0
AUTOTHROTTLE_MAX_DELAY = 30.0
AUTOTHROTTLE_TARGET_CONCURRENCY = 1.0

# Give up rather than hang, and don't retry aggressively.
DOWNLOAD_TIMEOUT = 20
RETRY_ENABLED = True
RETRY_TIMES = 2

# Hard ceiling on a single run, so a mistake in a selector cannot turn into a
# large unintended crawl of someone else's site.
CLOSESPIDER_PAGECOUNT = 300
CLOSESPIDER_ITEMCOUNT = 200

# Enable the MongoDB pipeline
ITEM_PIPELINES = {
   "crawler.pipelines.MongoPipeline": 300,
}

REQUEST_FINGERPRINTER_IMPLEMENTATION = "2.7"
FEED_EXPORT_ENCODING = "utf-8"
