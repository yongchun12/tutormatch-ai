import scrapy
from scrapy_selenium import SeleniumRequest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from datetime import datetime
import time

class TuitionSpider(scrapy.Spider):
    name = "tuition_spider"
    
    def start_requests(self):
        # Search Google Maps for Tuition Centres in KL
        search_url = "https://www.google.com/maps/search/Tuition+Centres+in+Kuala+Lumpur"
        yield SeleniumRequest(url=search_url, callback=self.parse, wait_time=10)

    def parse(self, response):
        self.logger.info(f"Selenium loaded Google Maps: {response.url}")
        driver = response.meta['driver']
        
        # Wait for the main results list to populate
        try:
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "a[href*='/maps/place/']"))
            )
        except Exception as e:
            self.logger.error(f"Timeout waiting for Google Maps results: {e}")
            return
            
        # Extract the clickable result cards
        places = driver.find_elements(By.CSS_SELECTOR, "a[href*='/maps/place/']")
        self.logger.info(f"Found {len(places)} potential tuition centres on first page.")
        
        # Loop through a few to extract detailed data (clicking each one)
        for i in range(min(3, len(places))): # Limit to 3 for demonstration to avoid blocking
            try:
                # Re-find elements because DOM might refresh after clicking
                current_places = driver.find_elements(By.CSS_SELECTOR, "a[href*='/maps/place/']")
                place = current_places[i]
                
                name = place.get_attribute("aria-label")
                if not name:
                    continue
                    
                # Click the place to open the detail pane
                driver.execute_script("arguments[0].click();", place)
                time.sleep(3) # Wait for detail pane animation
                
                # Extract details from the detail pane
                # Note: Google Maps CSS classes are heavily obfuscated and change often.
                # We use generic text-based or icon-based CSS locators where possible.
                
                address = "Kuala Lumpur, Malaysia"
                phone = ""
                website = ""
                logo_url = ""
                
                try:
                    # Attempt to find the phone number by looking for elements containing a phone icon or common formats
                    phone_el = driver.find_element(By.CSS_SELECTOR, "button[data-tooltip*='Copy phone number'] div")
                    phone = phone_el.text
                except:
                    pass
                    
                try:
                    # Attempt to find website
                    web_el = driver.find_element(By.CSS_SELECTOR, "a[data-tooltip*='Open website']")
                    website = web_el.get_attribute("href")
                except:
                    pass
                    
                try:
                    # Attempt to find the main image/logo in the detail pane
                    img_el = driver.find_element(By.CSS_SELECTOR, "button[aria-label*='Photo of'] img")
                    logo_url = img_el.get_attribute("src")
                except:
                    # Fallback premium generic image if none found
                    logo_url = "https://images.unsplash.com/photo-1577896851231-70ef18881754?w=400&q=80"
                
                centre = {
                    "name": name,
                    "description": f"Scraped from Google Maps.",
                    "address": address,
                    "city": "Kuala Lumpur",
                    "state": "Kuala Lumpur",
                    "subjects": ["General Tuition"],
                    "priceRange": "Contact for pricing",
                    "teachingMode": "physical",
                    "status": "pending",
                    "averageRating": 4.5,
                    "reviewCount": 0,
                    "logoUrl": logo_url,
                    "contactNumber": phone,
                    "website": website,
                    "email": "",
                    "createdAt": datetime.utcnow()
                }
                
                yield centre
                
            except Exception as e:
                self.logger.error(f"Error scraping centre detail: {e}")
