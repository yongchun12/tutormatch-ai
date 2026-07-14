import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get("place_id");
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing API Key" }, { status: 500 });
  }

  if (lat && lng) {
    // Reverse Geocoding
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.status !== "OK") {
        return NextResponse.json({ error: data.error_message || "API Error", status: data.status }, { status: 500 });
      }
      
      const address = data.results[0]?.formatted_address || "Unknown Location";
      // Extract city or general area for cleaner display
      let displayLocation = address;
      const parts = address.split(",");
      if (parts.length >= 3) {
        displayLocation = parts.slice(parts.length - 3).join(",").trim(); // e.g. "Kuala Lumpur, Federal Territory of Kuala Lumpur, Malaysia"
      }
      
      return NextResponse.json({
        address: displayLocation
      });
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (!placeId) {
    return NextResponse.json({ error: "Missing place_id or lat/lng" }, { status: 400 });
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== "OK") {
      return NextResponse.json({ error: data.error_message || "API Error", status: data.status }, { status: 500 });
    }

    const location = data.result?.geometry?.location;
    if (!location) {
      return NextResponse.json({ error: "No geometry found" }, { status: 404 });
    }

    return NextResponse.json({
      lat: location.lat,
      lng: location.lng
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
