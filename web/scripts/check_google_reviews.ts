import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const run = async () => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const placeId = "ChIJT_xV34tJzDERxS9TzUOhnL0"; // Example valid place id
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews,user_ratings_total,formatted_phone_number,website&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
};
run().catch(console.error);
