import { TuitionCentre } from "@/models/TuitionCentre";
import { Review } from "@/models/Review";
import dbConnect from "@/lib/db";

/**
 * Recompute a centre's TutorMatch rating from the reviews written on TutorMatch.
 *
 * This used to write straight into `averageRating`/`reviewCount` — the fields
 * holding Google's aggregate for every crawled centre. One review submitted here
 * therefore replaced "4.9 from 434 reviews" with "5.0 from 1 review", presenting
 * a TutorMatch number in the place the UI attributed to Google.
 *
 * Now the TutorMatch figures live in their own fields. The headline is only
 * taken over when the centre has no Google rating to displace, in which case
 * `ratingSource` is set so the UI still says where the number came from.
 */
export async function recalculateCentreRating(centreId: string) {
  await dbConnect();

  // Google-sourced reviews are stored too (see Review.source); they must not be
  // counted into TutorMatch's own average.
  const ourReviews = await Review.find({ centreId, source: "tutormatch" }).lean();
  const tutorMatchReviewCount = ourReviews.length;

  const tutorMatchRating =
    tutorMatchReviewCount > 0
      ? Number(
          (ourReviews.reduce((sum, r) => sum + r.rating, 0) / tutorMatchReviewCount).toFixed(1)
        )
      : 0;

  const centre = await TuitionCentre.findById(centreId);
  if (!centre) return;

  centre.tutorMatchRating = tutorMatchRating;
  centre.tutorMatchReviewCount = tutorMatchReviewCount;

  // Only claim the headline when Google has not already supplied one.
  const hasGoogleRating = centre.ratingSource === "google" && (centre.reviewCount ?? 0) > 0;
  if (!hasGoogleRating) {
    centre.averageRating = tutorMatchRating;
    centre.reviewCount = tutorMatchReviewCount;
    centre.ratingSource = tutorMatchReviewCount > 0 ? "tutormatch" : undefined;
  }

  await centre.save();
}
