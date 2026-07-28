import os
import sys
import requests
import pymongo
from datetime import datetime, timezone
from dotenv import load_dotenv
import logging

# Reuse the one definition of "what a safe MongoDB document looks like" rather
# than keeping a second copy in sync by hand.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from crawler.pipelines import (
    apply_required_defaults,
    should_auto_publish,
    log_gate_decision,
    REQUEST_TIMEOUT,
)

# ==========================================
# CAPSTONE INTEGRATION SCRIPT
# ==========================================
# This script is a "fallback" pipeline that executes exactly what the 
# Scrapy Spider and Pipeline were designed to do, because the Scrapy framework 
# has a severe freezing bug with Anaconda Python on macOS.
# 
# STAGE 1: Scrape base data from directory websites.
# STAGE 2: Dynamically query Google Maps API for real-time verification (photos, ratings).
# STAGE 3: Merge and save to MongoDB.
# ==========================================

logging.basicConfig(level=logging.INFO, format='[pipeline] %(levelname)s: %(message)s')
logger = logging.getLogger('tuition_pipeline')

# Load the environment variables (like MongoDB URI and API keys) from the web folder
env_path = os.path.join(os.path.dirname(__file__), '../web/.env.local')
load_dotenv(dotenv_path=env_path)

def scrape_base_data():
    """
    STAGE 1: BASE SCRAPING
    In a full Scrapy setup, this function is handled by `response.css()` parsing the HTML.
    Here we simulate that we have successfully scraped a generic tuition directory.
    """
    logger.info("Scraping generic tuition directory website...")
    
    # Mock data to simulate the Scrapy spider extracting from HTML
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
        },
        {
            "name": "Pusat Tuisyen Bintang",
            "description": "Scraped from Tuition Directory Website. Top centre in Penang.",
            "subjects": ["Physics", "Chemistry"],
            "priceRange": "RM 250 - 450/mo",
            "teachingMode": "physical",
            "city": "Georgetown",
            "state": "Pulau Pinang"
        }
    ]
    
    items = []
    for data in scraped_centres:
        # Build the initial object from the scraped website
        items.append({
            "name": data["name"],
            "description": data["description"],
            "address": "Address not provided on website", # We rely on Google Maps to fix this
            "city": data.get("city", "Kuala Lumpur"),
            "state": data.get("state", "Kuala Lumpur"),
            "subjects": data["subjects"],
            "priceRange": data["priceRange"],
            "teachingMode": data["teachingMode"],
            "status": "approved", # Auto-approve scraped centres
            "averageRating": 0.0,
            "reviewCount": 0,
            "logoUrl": "",
            "createdAt": datetime.now(timezone.utc) # Fixed deprecation warning
        })
    return items

def process_pipeline():
    """
    STAGE 2 & 3: GOOGLE MAPS ENRICHMENT & MONGODB SAVING
    """
    logger.info("Starting Two-Stage Scrapy + Maps Integration Pipeline...")
    
    # 1. Get the scraped items
    items = scrape_base_data()
    
    # 2. Connect to MongoDB Atlas
    mongo_uri = os.getenv('MONGODB_URI', 'mongodb://localhost:27017/tuition_db')
    client = pymongo.MongoClient(mongo_uri)
    db = client['test']
    collection = db['tuitioncentres']
    
    api_key = os.getenv('GOOGLE_MAPS_API_KEY')
    
    for item in items:
        name = item['name']
        
        # 3. GOOGLE MAPS INTEGRATION
        # We search Google Maps using the exact name we just scraped.
        if api_key and name:
            try:
                # Query Google Places API
                city_query = item.get('city', 'Kuala Lumpur').replace(' ', '+')
                url = f"https://maps.googleapis.com/maps/api/place/textsearch/json?query={name.replace(' ', '+')}+{city_query}&key={api_key}"
                resp = requests.get(url, timeout=REQUEST_TIMEOUT).json()
                
                if resp.get('status') == 'OK' and len(resp.get('results', [])) > 0:
                    place = resp['results'][0]
                    
                    # 4. MERGE DATA (Take verified info from Google and inject it into the Scraped Item)
                    item['averageRating'] = place.get('rating', item.get('averageRating', 4.0))
                    item['reviewCount'] = place.get('user_ratings_total', item.get('reviewCount', 0))
                    item['address'] = place.get('formatted_address', item.get('address'))
                    item['latitude'] = place.get('geometry', {}).get('location', {}).get('lat')
                    item['longitude'] = place.get('geometry', {}).get('location', {}).get('lng')
                    if item['latitude'] and item['longitude']:
                        item['location'] = {
                            "type": "Point",
                            "coordinates": [item['longitude'], item['latitude']]
                        }
                    
                    # Extract high quality photo
                    if 'photos' in place and len(place['photos']) > 0:
                        photo_ref = place['photos'][0]['photo_reference']
                        item['logoUrl'] = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference={photo_ref}&key={api_key}"
                    
                    logger.info(f"Successfully combined Scrapy data with Google Maps for: {name}")
                else:
                    logger.warning(f"No Google Maps match found for: {name}")
            except Exception as e:
                logger.error(f"Google API integration failed: {e}")
                
        # 5. MONGODB INSERTION
        # pymongo bypasses every Mongoose default and validator, so fill in the
        # required fields before writing or the Next.js centre page can crash on
        # a missing `teachingMode` / `subjects`.
        doc = apply_required_defaults(item)

        # Check if it already exists to avoid duplicates
        existing = collection.find_one({"name": name})
        if existing:
            # Update the existing record with the fresh combined data. Never
            # reset the creation time, and never re-decide a status a human has
            # already set.
            doc.pop("createdAt", None)
            doc.pop("status", None)
            collection.update_one({"_id": existing["_id"]}, {"$set": doc})
            logger.info(f"Updated existing centre in DB: {name}")
        else:
            # Insert brand new, letting the shared quality gate decide whether it
            # is published or held for admin review.
            auto_publish, failed = should_auto_publish(doc)
            doc["status"] = "approved" if auto_publish else "pending"

            collection.insert_one(doc)
            log_gate_decision(db, doc, auto_publish, failed, context="Fallback pipeline")

            if auto_publish:
                logger.info(f"Inserted and auto-published: {name}")
            else:
                logger.info(f"Inserted and held for review ({failed[0]}): {name}")
            
    # Clean up connection
    client.close()
    logger.info("Pipeline completed successfully!")

if __name__ == "__main__":
    process_pipeline()
