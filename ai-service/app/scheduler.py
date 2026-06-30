import os
import requests
import logging
from datetime import datetime
from apscheduler.schedulers.background import BackgroundScheduler
from pymongo import MongoClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("Scheduler")

MONGO_URI = os.getenv("MONGODB_URI")
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")

def fetch_and_save_google_maps_data():
    if not GOOGLE_MAPS_API_KEY or not MONGO_URI:
        logger.error("Missing API Key or Mongo URI. Cannot run Google Maps scraper.")
        return

    logger.info("Starting scheduled Google Maps API fetch...")

    try:
        # Connect to MongoDB
        client = MongoClient(MONGO_URI)
        db = client.get_default_database()
        collection = db["tuitioncentres"]

        # Call Google Places API
        url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
        params = {
            "query": "Tuition Centres in Malaysia",
            "key": GOOGLE_MAPS_API_KEY
        }

        response = requests.get(url, params=params)
        data = response.json()

        if data.get("status") != "OK":
            logger.error(f"Google Places API returned status {data.get('status')}. Message: {data.get('error_message', '')}")
            return

        results = data.get("results", [])
        logger.info(f"Fetched {len(results)} tuition centres from Google Maps.")

        for place in results:
            # Map Google data to our TuitionCentre model
            name = place.get("name")
            address = place.get("formatted_address", "")
            rating = place.get("rating", 4.0)
            
            # Simple parsing for city/state (In reality, Geocoding API is better for this)
            city = "Kuala Lumpur" if "Kuala Lumpur" in address else "Petaling Jaya"
            state = "Selangor" if "Selangor" in address else "Kuala Lumpur"

            # Check if centre already exists
            existing = collection.find_one({"name": name})
            
            if not existing:
                centre = {
                    "name": name,
                    "description": f"Verified Google Maps Listing. {address}",
                    "address": address,
                    "city": city,
                    "state": state,
                    "subjects": ["Mathematics", "English", "Science"], # Default subjects since Google doesn't provide them
                    "priceRange": "RM 150 - RM 300/mo",
                    "teachingMode": "physical",
                    "status": "approved",
                    "averageRating": rating,
                    "createdAt": datetime.utcnow()
                }
                collection.insert_one(centre)
                logger.info(f"Inserted new centre: {name}")
            else:
                # Update existing rating
                collection.update_one(
                    {"_id": existing["_id"]},
                    {"$set": {"averageRating": rating}}
                )

        logger.info("Google Maps data sync completed successfully.")

    except Exception as e:
        logger.error(f"An error occurred during scheduled fetch: {e}")

# Create the background scheduler
scheduler = BackgroundScheduler()

def start_scheduler():
    logger.info("Initializing APScheduler...")
    # Add the job to run every 1 hour (60 minutes)
    scheduler.add_job(fetch_and_save_google_maps_data, 'interval', minutes=60, id='google_maps_scraper', replace_existing=True)
    
    # Run once immediately on startup
    fetch_and_save_google_maps_data()
    
    scheduler.start()
    logger.info("Scheduler started. Google Maps fetch will run every 60 minutes.")

def stop_scheduler():
    scheduler.shutdown()
    logger.info("Scheduler shutdown.")
