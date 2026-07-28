import re
from datetime import datetime, timezone

import scrapy

from crawler.text_clean import decode_entities, fix_mojibake, detect_teaching_mode

# Same subject vocabulary the TypeScript side uses
# (web/src/services/scraperService.ts → extractSubjectsFromText), so a centre
# found by either crawler ends up tagged the same way.
SUBJECT_KEYWORDS = {
    "Mathematics": ["math", "mathematics", "calculus", "algebra", "add math", "additional math"],
    "Science": ["science", "sains"],
    "Physics": ["physics", "fizik"],
    "Chemistry": ["chemistry", "kimia"],
    "Biology": ["biology", "biologi"],
    "English": ["english", "inggeris", "muet", "ielts"],
    "Bahasa Melayu": ["bahasa melayu", "melayu", " bm "],
    "Sejarah": ["sejarah", "history"],
    "Accounting": ["account", "akaun", "accounting"],
}


def extract_subjects(text):
    """Keyword match over free text. Finds nothing → returns [], never guesses."""
    if not text:
        return []
    lowered = f" {text.lower()} "
    return [
        subject
        for subject, keywords in SUBJECT_KEYWORDS.items()
        if any(keyword in lowered for keyword in keywords)
    ]


def clean(text):
    """
    Normalise one scraped string.

    Three separate defects in the source, applied in the order they were
    introduced by it:
      - HTML entities escaped twice, so one decode is left over
        ("&#26126;" -> "明");
      - UTF-8 text decoded as Windows-1252 before it was stored
        ("â€™" -> "’");
      - &nbsp; used to fill empty fields, and irregular whitespace.
    """
    if not text:
        return ""
    text = decode_entities(text)
    text = fix_mojibake(text)
    return re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()


class TuitionSpider(scrapy.Spider):
    """
    Scrapes tuitionjob.com, a Malaysian tuition centre directory.

    This replaces a placeholder that requested example.com and returned three
    hardcoded dictionaries. It now performs a real crawl:

      Stage 1 (here)          the directory listing and each centre's detail page
      Stage 2 (pipelines.py)  Google Places lookup for coordinates and ratings
      Stage 3 (pipelines.py)  quality gate, then save to MongoDB

    Politeness is configured in settings.py: ROBOTSTXT_OBEY, one request at a
    time, a 2 second delay, AutoThrottle, and hard page/item caps. The site's
    robots.txt allows /tuition_center_list.php and /tuition_center_view.php for
    the generic `*` group; it blocks /admin/, /cgi-bin/, /class/, /conf/,
    /engine/ and /template/, which this spider never touches.

    Run a small trial first:
        scrapy crawl tuition_spider -a max_pages=1 -O sample.json
    """

    name = "tuition_spider"
    allowed_domains = ["tuitionjob.com"]

    BASE = "https://www.tuitionjob.com"
    LIST_URL = f"{BASE}/tuition_center_list.php"

    def __init__(self, max_pages=None, *args, **kwargs):
        """`-a max_pages=1` limits how many listing pages are visited."""
        super().__init__(*args, **kwargs)
        self.max_pages = int(max_pages) if max_pages else None
        self.pages_seen = 0

    def start_requests(self):
        yield scrapy.Request(self.LIST_URL, callback=self.parse_list)

    # ------------------------------------------------------------------
    # Listing page
    #
    #   <div class="panel panel-default">
    #     <div class="panel-body">
    #       <p><strong>Tuition Center Name: </strong>EXCEL IN MATHS</p>
    #       <p><strong>City: </strong>Kepong</p>
    #       <p><strong>State: </strong>Kuala Lumpur</p>
    #     </div>
    #     <div class="panel-footer"><a href="tuition_center_view.php?id=105">view</a></div>
    #   </div>
    # ------------------------------------------------------------------
    def parse_list(self, response):
        self.pages_seen += 1
        panels = response.css("div.panel.panel-default")
        self.logger.info("Listing page %s: %s panels", self.pages_seen, len(panels))

        for panel in panels:
            link = panel.css("div.panel-footer a::attr(href)").get()
            if not link or "tuition_center_view.php" not in link:
                continue  # not a centre panel — the page reuses this markup

            # Carry the listing's own name/city/state through, so a detail page
            # that fails to load still yields a usable minimal record.
            listing = {
                "name": self._labelled_p(panel, "Tuition Center Name"),
                "city": self._labelled_p(panel, "City"),
                "state": self._labelled_p(panel, "State"),
            }

            yield response.follow(
                link,
                callback=self.parse_centre,
                cb_kwargs={"listing": listing},
            )

        if self.max_pages is not None and self.pages_seen >= self.max_pages:
            self.logger.info("Reached max_pages=%s; not paginating further.", self.max_pages)
            return

        # <ul class="pagination"> … <a href="/tuition_center_list.php?Page=2">2</a>
        for href in response.css("ul.pagination a::attr(href)").getall():
            if "Page=" in href:
                yield response.follow(href, callback=self.parse_list)

    @staticmethod
    def _unswap_city_postcode(city, postcode):
        """
        Put the two back the right way round when the source has them reversed.

        This is a mistake in the directory's own data, not in our parsing: the
        listing for Quantum Academy (id=207) really does say City "41200" and
        Postcode "Klang", and the site displays it that way too. Without this,
        the centre is filed under a city called "41200" and its Google Places
        query searches for a number.

        Keyed on the shape of the values rather than on the centre's name, so
        any other record entered the same way is corrected as well.
        """
        city_is_postcode = bool(re.fullmatch(r"\d{5}", city.strip()))
        postcode_is_postcode = bool(re.fullmatch(r"\d{5}", postcode.strip()))
        if city_is_postcode and not postcode_is_postcode:
            return postcode.strip(), city.strip()
        return city, postcode

    @staticmethod
    def _labelled_p(panel, label):
        """Listing markup: <p><strong>City: </strong>Kepong</p>"""
        for paragraph in panel.css("div.panel-body p"):
            strong = clean(paragraph.css("strong::text").get())
            if strong.rstrip(":").strip().lower() == label.lower():
                full = clean(" ".join(paragraph.css("::text").getall()))
                return clean(full.split(":", 1)[-1])
        return ""

    # ------------------------------------------------------------------
    # Detail page
    #
    #   <div class="row">
    #     <div class="col-sm-3"><p><strong>Phone</strong></p></div>
    #     <div class="col-sm-9"><p>011-2556 9887</p></div>
    #   </div>
    #
    # The label column is col-sm-3 in the contact block and col-sm-2 in the
    # address block, so the selector walks from the <strong> up to its own
    # column and across to the next one, rather than hardcoding a width.
    # ------------------------------------------------------------------
    def _field(self, response, label):
        parts = response.xpath(
            "//strong[normalize-space(text())=$label]"
            "/ancestor::div[starts-with(@class,'col-sm-')][1]"
            "/following-sibling::div[1]//p//text()",
            label=label,
        ).getall()
        return clean(" ".join(parts))

    def parse_centre(self, response, listing):
        name = self._field(response, "Tuition Center Name") or listing.get("name", "")
        if not name:
            self.logger.warning("No name found at %s; skipping.", response.url)
            return

        about = clean(
            " ".join(
                response.xpath(
                    "//strong[normalize-space(text())='About Us']"
                    "/ancestor::div[starts-with(@class,'col-sm-')][1]"
                    "/following-sibling::div[1]//text()"
                ).getall()
            )
        )

        # The page stores a fully-formed address (street + city + postcode +
        # state) in a hidden input for its own map widget. That single string is
        # a far better Google Places query than the pieces joined by hand.
        map_address = clean(response.css("input#MapAddress::attr(value)").get())

        street = self._field(response, "Address")
        # The hidden input sits inside the same <p>, so its value bleeds into
        # the visible text; remove it rather than storing the address twice.
        if map_address and map_address in street:
            street = clean(street.replace(map_address, ""))

        city = self._field(response, "City") or listing.get("city", "")
        state = self._field(response, "State") or listing.get("state", "")
        postcode = self._field(response, "Postcode")
        city, postcode = self._unswap_city_postcode(city, postcode)

        website = self._field(response, "Website")
        if website and not website.startswith(("http://", "https://")):
            website = f"https://{website}"  # some rows hold a bare domain

        established = self._field(response, "Established Since")

        teaching_mode = detect_teaching_mode(name, about)

        item = {
            "name": name,
            # The centre's own words. No invented description.
            "description": about
            or f"Listed on tuitionjob.com{f' since {established}' if established else ''}.",
            "address": map_address or clean(f"{street} {city} {postcode} {state}"),
            "city": city,
            "state": state,
            "postcode": postcode,
            # Keyword matches over the centre's own name and About Us text.
            #
            # NOTE: this page also contains a "Subject:" line, but it belongs to
            # the "VIP Tutor" advert in the sidebar — an unrelated private tutor
            # with their own subject list. Reading that label would attach a
            # stranger's subjects to this centre. Do not add a selector for it.
            "subjects": extract_subjects(f"{name} {about}"),
            "contactNumber": self._field(response, "Phone"),
            "email": self._field(response, "Email"),
            "website": website,
            # Inferred from the centre's own description; omitted entirely when
            # the text does not say. Hard-coding "physical" made MELAKA HOME
            # TUITION, which advertises online classes, claim the opposite.
            **({"teachingMode": teaching_mode} if teaching_mode else {}),
            # Immutable record of where this came from. The quality gate skips
            # its name check for directory records, and must keep doing so after
            # stage 2 attaches a Google Place ID.
            "discoverySource": "directory",
            # Deliberately NOT set here: averageRating, reviewCount, latitude,
            # longitude, googlePlaceId. This directory does not publish them, and
            # the pipeline fills them from Google Places. Defaulting a rating to
            # 4.0 (as an earlier version did) would be inventing data.
            "sourceUrls": [response.url],
            "createdAt": datetime.now(timezone.utc),
        }

        self.logger.info("Scraped: %s (%s, %s)", name, city, state)
        yield item
