import { TuitionCentre } from "@/models/TuitionCentre";
import { Review } from "@/models/Review";
import dbConnect from "@/lib/db";

export async function recalculateCentreRating(centreId: string) {
  await dbConnect();
  
  const allReviews = await Review.find({ centreId }).lean();
  const reviewCount = allReviews.length;
  
  const averageRating = reviewCount > 0 
      ? (allReviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount).toFixed(1)
      : 0;

  await TuitionCentre.findByIdAndUpdate(centreId, {
      reviewCount,
      averageRating: parseFloat(averageRating as string)
  });
}
