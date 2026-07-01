import os
import pymongo
from dotenv import load_dotenv

# Load the environment variables from the web folder's .env.local
env_path = os.path.join(os.path.dirname(__file__), '../../web/.env.local')
load_dotenv(dotenv_path=env_path)

import requests

class MongoPipeline:
    """
    This pipeline intercepts every item scraped by the Scrapy Spider.
    It calls the Google Maps API to enrich the data (Stage 2) and saves it to MongoDB (Stage 3).
    """
    def __init__(self, mongo_uri, mongo_db):
        self.mongo_uri = mongo_uri
        self.mongo_db = mongo_db

    @classmethod
    def from_crawler(cls, crawler):
        return cls(
            mongo_uri=os.getenv('MONGODB_URI', 'mongodb://localhost:27017/tuition_db'),
            mongo_db='test' # The default DB name if not specified in URI
        )

    def open_spider(self, spider):
        self.client = pymongo.MongoClient(self.mongo_uri)
        self.db = self.client[self.mongo_db]

    def close_spider(self, spider):
        self.client.close()

    def process_item(self, item, spider):
        # 1. We have the scraped item from Scrapy
        name = item.get('name')
        
        # 2. Call Google Maps API to enrich
        api_key = os.getenv('GOOGLE_MAPS_API_KEY')
        if api_key and name:
            try:
                # Search Google Maps for this exact name
                url = f"https://maps.googleapis.com/maps/api/place/textsearch/json?query={name.replace(' ', '+')}+Kuala+Lumpur&key={api_key}"
                resp = requests.get(url).json()
                
                if resp.get('status') == 'OK' and len(resp.get('results', [])) > 0:
                    place = resp['results'][0]
                    
                    # MERGE GOOGLE MAPS DATA INTO SCRAPY DATA
                    # We inject the Google Rating and Real Address into the Scrapy item
                    item['averageRating'] = place.get('rating', item.get('averageRating', 4.0))
                    item['address'] = place.get('formatted_address', item.get('address'))
                    
                    # We extract the live high-quality photo
                    if 'photos' in place and len(place['photos']) > 0:
                        photo_ref = place['photos'][0]['photo_reference']
                        item['logoUrl'] = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference={photo_ref}&key={api_key}"
                    
                    spider.logger.info(f"Successfully combined Scrapy data with Google Maps for: {name}")
                else:
                    spider.logger.warning(f"No Google Maps match found for: {name}")
            except Exception as e:
                spider.logger.error(f"Google API integration failed: {e}")
        
        # 3. Insert or Update in MongoDB
        existing = self.db['tuitioncentres'].find_one({"name": name})
        if existing:
            self.db['tuitioncentres'].update_one({"_id": existing["_id"]}, {"$set": dict(item)})
            spider.logger.info(f"Updated existing centre in DB: {name}")
        else:
            self.db['tuitioncentres'].insert_one(dict(item))
            spider.logger.info(f"Inserted new centre into DB: {name}")
            
        return item
