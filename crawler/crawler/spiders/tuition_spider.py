import scrapy
from datetime import datetime, timezone

class TuitionSpider(scrapy.Spider):
    """
    Scrapy Spider to extract raw tuition centre data from a directory website.
    This acts as the first stage of the Two-Stage Integration Pipeline.
    """
    name = "tuition_spider"
    
    def start_requests(self):
        # We simulate scraping a local directory website here.
        # In production, this would be a real URL like 'https://example.com/mock-tuition-directory'
        urls = [
            'https://example.com/mock-tuition-directory'
        ]
        for url in urls:
            yield scrapy.Request(url=url, callback=self.parse)

    def parse(self, response):
        self.logger.info("Scraping generic tuition directory website...")
        
        # In a real scrape, we would parse response.css(...)
        # For demonstration of the integration, we extract mock records 
        # as if we successfully parsed the HTML of a directory site.
        scraped_centres = [
            {
                "name": "Pusat Tuisyen Kasturi",
                "description": "Scraped from Tuition Directory Website. Kasturi offers comprehensive classes.",
                "subjects": ["Mathematics", "Science", "Sejarah"],
                "priceRange": "RM 200 - 400/mo",
                "teachingMode": "physical"
            },
            {
                "name": "Math Clinic Tuition Centre",
                "description": "Scraped from Tuition Directory Website. Specialized in intensive mathematics.",
                "subjects": ["Mathematics", "Additional Mathematics"],
                "priceRange": "RM 150 - 300/mo",
                "teachingMode": "hybrid"
            },
            {
                "name": "Visi Smart Tuition Centre",
                "description": "Scraped from Tuition Directory Website. Proven track record for SPM.",
                "subjects": ["English", "Bahasa Melayu", "Science"],
                "priceRange": "RM 180 - 350/mo",
                "teachingMode": "physical"
            }
        ]
        
        for centre_data in scraped_centres:
            # We construct the base Scrapy item with data ONLY from the directory site
            centre = {
                "name": centre_data["name"],
                "description": centre_data["description"],
                "address": "Address not provided on website", # Will be filled by Google Maps in pipeline
                "city": "Kuala Lumpur",
                "state": "Kuala Lumpur",
                "subjects": centre_data["subjects"],
                "priceRange": centre_data["priceRange"],
                "teachingMode": centre_data["teachingMode"],
                "status": "approved",
                "averageRating": 0.0, # Will be enriched by Google Maps in pipeline
                "reviewCount": 0,
                "logoUrl": "", # Will be enriched by Google Maps in pipeline
                "createdAt": datetime.now(timezone.utc)
            }
            # Yielding this item sends it directly to pipelines.py
            yield centre
