import { use } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { MapPin, Star, Clock, CheckCircle2, TrendingUp, MessageSquare, ArrowLeft, Heart, ShieldCheck, ThumbsUp, ThumbsDown, Minus, Sparkles, BookOpen, Phone, Globe, Mail, Image as ImageIcon, Megaphone } from "lucide-react";
import dbConnect from "@/lib/db";
import { aiService } from "@/services/aiService";
import { canonicalSubjects } from "@/lib/subjects";
import { TuitionCentre } from "@/models/TuitionCentre";
import { Review } from "@/models/Review";
import { User } from "@/models/User";
import ReviewForm from "@/components/ReviewForm";
import ReviewsClient from "@/components/ReviewsClient";
import GalleryLightbox from "@/components/GalleryLightbox";
import EnquiryForm from "@/components/EnquiryForm";
import SaveCentreButton from "@/components/SaveCentreButton";
import ClaimCentreButtonWrapper from "@/components/ClaimCentreButtonWrapper";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { formatLocation, formatTeachingMode, TEACHING_MODE_UNKNOWN } from "@/lib/centre-display";
import { GoogleG } from "@/components/ui/google-g";

export default async function CentreDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params; // Must await params in Server Components
  
  await dbConnect();
  
  const session = await getServerSession(authOptions);
  const viewerRole = (session?.user as any)?.role as "student" | "owner" | "admin" | undefined;

  /*
    Whether to offer the "Claim This Centre" button at all.

    Claiming is for the person who runs the centre, so a student never sees it —
    inviting them to prove they own a tuition centre only to refuse the claim is
    a worse experience than not offering it. Nor does an owner who already
    manages a centre, since the dashboard supports exactly one. A signed-out
    visitor still gets the button because we do not know who they are yet; the
    modal sends them to log in, and the Server Action decides afterwards.

    This is presentation only. submitClaimRequestAction enforces both rules
    server-side, which is what actually stops a claim being filed.
  */
  const viewerAlreadyOwnsACentre =
    viewerRole === "owner" &&
    (await TuitionCentre.exists({
      ownerId: (session!.user as any).id,
      status: { $ne: "rejected" },
    })) !== null;

  const canOfferClaim =
    !session?.user || (viewerRole === "owner" && !viewerAlreadyOwnsACentre);

  let userSavedCentres: string[] = [];
  if (session && session.user && (session.user as any).role === "student") {
    const user = await User.findById((session.user as any).id).lean();
    if (user && user.savedCentres) {
      userSavedCentres = user.savedCentres.map(id => id.toString());
    }
  }

  let centre = null;
  let reviewsList: {
    id: string;
    name: string;
    score: string;
    text: string;
    rating: number;
    /** Which platform this review was written on. Rendered on every card. */
    source: "tutormatch" | "google";
    /** True only when OUR sentiment model actually classified this review. */
    analysed: boolean;
  }[] = [];
  /** A positive/neutral/negative split over some set of classified reviews. */
  type SentimentTally = { pos: number; neu: number; neg: number; total: number };
  let aiSummary: SentimentTally & {
    /** The same split per platform, so the two are never merged into one figure. */
    bySource?: { tutormatch: SentimentTally | null; google: SentimentTally | null };
  } = { pos: 0, neu: 0, neg: 0, total: 0 };

  try {
    let rawCentre;
    try {
      rawCentre = await TuitionCentre.findById(resolvedParams.id).lean();
    } catch (e) {
      return notFound();
    }

    if (rawCentre) {
      // Fetch actual reviews from DB for this centre
      const rawReviews = await Review.find({ centreId: resolvedParams.id }).sort({ createdAt: -1 }).populate("userId", "name").lean();

      reviewsList = rawReviews.map((r: any) => ({
        id: r._id.toString(),
        name: r.userId ? r.userId.name : r.authorName || "Student User",
        score: r.sentimentScore || "neutral",
        text: r.comment,
        rating: r.rating,
        // Rows written before the source field existed were necessarily ours:
        // userId used to be required.
        source: r.source === "google" ? "google" : "tutormatch",
        analysed: Boolean(r.sentimentScore),
      }));

      /*
        Google reviews already imported and classified (see
        services/googleReviewImport.ts). The live fetch below must not add these
        a second time — the stored copy carries a real sentiment score from our
        model, the live copy would carry only the star-threshold guess.
      */
      const storedGoogleIds = new Set(
        rawReviews
          .filter((r: any) => r.source === "google" && typeof r.externalId === "string")
          .map((r: any) => r.externalId as string)
      );

      centre = {
        id: rawCentre._id.toString(),
        name: rawCentre.name,
        description: rawCentre.description,
        location: formatLocation(rawCentre.city, rawCentre.state),
        rating: rawCentre.averageRating || 0,
        reviews: reviewsList.length > 0 ? reviewsList.length : (rawCentre.reviewCount || 0),
        // Which platform the headline star rating belongs to. Never rendered
        // without this.
        ratingSource: rawCentre.ratingSource,
        tutorMatchRating: rawCentre.tutorMatchRating || 0,
        tutorMatchReviewCount: rawCentre.tutorMatchReviewCount || 0,
        /*
          How many ratings this centre has on Google ALTOGETHER — the
          denominator the sentiment summary is measured against.

          It is not the number of reviews anything here can read. Google's API
          releases at most five review texts per request; this number is often in
          the hundreds. Printing it beside the analysed count is the only way the
          summary can say how small a slice it is describing.
        */
        googleRatingTotal: rawCentre.reviewCount || 0,
        // Records written straight to MongoDB by the Python crawler bypass every
        // Mongoose default, so these can genuinely be missing. Fall back rather
        // than crash the whole page. Canonicalised (lib/subjects.ts) so this
        // page names a subject exactly as the directory's filter does, and a
        // record holding both "Add Math" and "Additional Mathematics" lists it
        // once.
        subjects: canonicalSubjects(rawCentre.subjects),
        price: rawCentre.priceRange || "Contact for pricing",
        // Falling back to "Physical" here reprinted the invented default the
        // schema no longer stores, so an unknown mode is shown as unknown.
        mode: formatTeachingMode(rawCentre.teachingMode),
        logoUrl: rawCentre.logoUrl || null,
        latitude: rawCentre.latitude,
        longitude: rawCentre.longitude,
        googlePlaceId: rawCentre.googlePlaceId,
        contactNumber: rawCentre.contactNumber,
        website: rawCentre.website,
        email: rawCentre.email,
        ownerId: rawCentre.ownerId,
        galleryUrls: rawCentre.galleryUrls || [],
        isVerified: rawCentre.isVerified || false,
        // Newest first. Covers both owner-written announcements and any the AI
        // sync extracted from the centre's own website.
        announcements: [...(rawCentre.announcements ?? [])]
          .filter((a: any) => a?.content)
          .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .map((a: any) => ({
            id: a._id?.toString() ?? String(a.date),
            content: a.content as string,
            date: new Date(a.date),
          })),
      };
      
      // Fetch Google Reviews dynamically if available
      if (rawCentre.googlePlaceId) {
        try {
          const apiKey = process.env.GOOGLE_MAPS_API_KEY;
          if (apiKey) {
            const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${rawCentre.googlePlaceId}&fields=reviews,user_ratings_total,formatted_phone_number,website&key=${apiKey}`;
            const res = await fetch(url);
            const data = await res.json();
            
            if (data.result) {
              // Real-time fallback for contact details if DB is missing them
              if (!centre.contactNumber && data.result.formatted_phone_number) {
                centre.contactNumber = data.result.formatted_phone_number;
              }
              if (!centre.website && data.result.website) {
                centre.website = data.result.website;
              }
              
              // Real-time fallback for review count
              const liveReviewCount = data.result.user_ratings_total || 0;
              if (liveReviewCount > centre.googleRatingTotal) {
                centre.googleRatingTotal = liveReviewCount;
              }
              if (typeof data.result.rating === "number") {
                centre.rating = data.result.rating;
                centre.ratingSource = "google";
              }

              if (data.result.reviews) {
                /*
                  These used to be labelled by a rating threshold — positive if
                  the writer left 4 stars or more — and then excluded from the
                  summary because that is not a model output. The exclusion was
                  honest but it also meant the feature analysed nothing at all on
                  a centre whose reviews had never been imported, and everything
                  it did show was Google's own high-star selection.

                  They now go through the SAME classifier as every other review,
                  reading the text. Nothing about a star rating enters it, so the
                  label is earned and the review can be counted.
                */
                const googleReviews = await Promise.all(
                  data.result.reviews
                    // Skip any we have already imported and classified properly.
                    .filter((r: any) => !storedGoogleIds.has(`google:${r.time}`))
                    .map(async (r: any) => {
                      const text = (r.text ?? "").trim();
                      // A star-only rating leaves the model nothing to read, so
                      // it stays unanalysed rather than being guessed at.
                      const sentiment = text
                        ? await aiService.analyzeSentiment(text)
                        : null;
                      return {
                        id: `google-${r.time}`,
                        name: r.author_name || "Google User",
                        score: sentiment?.score ?? "neutral",
                        text: r.text,
                        rating: r.rating,
                        source: "google" as const,
                        analysed: sentiment !== null,
                      };
                    })
                );
                reviewsList = [...reviewsList, ...googleReviews];
              }

              // Ensure we display the maximum known review count
              centre.reviews = Math.max(reviewsList.length, rawCentre.reviewCount || 0, liveReviewCount);
            }
          }
        } catch (e) {
          console.error("Failed to fetch Google reviews:", e);
        }
      }

      /*
        Sentiment summary — counted ONLY over reviews our model actually scored.

        `analysed` is the whole test, and it is earned rather than assumed: it is
        true when the classifier read the review's text, whether that text came
        from the stored import (services/googleReviewImport.ts) or from the live
        fetch above. It is false for a star-only rating, which has no text to
        read. Nothing here is labelled from a star count.

        The two populations are reported separately below, because a combined
        percentage hides which platform the opinion came from — and READ THE CAP:
        Google's API returns at most five review texts per request and picks them
        itself, so the Google column describes that handful, never the hundreds
        of ratings behind the centre's headline score.
      */
      const analysedReviews = reviewsList.filter((r) => r.analysed);
      if (analysedReviews.length > 0) {
        const tally = (rows: typeof analysedReviews) => {
          let pos = 0, neu = 0, neg = 0;
          rows.forEach((r) => {
            if (r.score === "positive") pos++;
            else if (r.score === "negative") neg++;
            else neu++;
          });
          const total = rows.length;
          return {
            pos: Math.round((pos / total) * 100),
            neu: Math.round((neu / total) * 100),
            neg: Math.round((neg / total) * 100),
            total,
          };
        };

        const ours = analysedReviews.filter((r) => r.source === "tutormatch");
        const fromGoogle = analysedReviews.filter((r) => r.source === "google");

        aiSummary = {
          ...tally(analysedReviews),
          // Per-platform breakdowns. Null when a platform contributed nothing,
          // so the UI can omit the row rather than print "0% of 0".
          bySource: {
            tutormatch: ours.length > 0 ? tally(ours) : null,
            google: fromGoogle.length > 0 ? tally(fromGoogle) : null,
          },
        };
      }
    }
  } catch (error) {
    console.error("Invalid ID format or DB Error:", error);
  }

  if (!centre) {
    notFound();
  }

  // Facts derived strictly from stored fields. Each entry is omitted when the
  // underlying field is missing, so an unclaimed scraped listing simply shows
  // fewer facts rather than invented ones.
  const keyFacts: string[] = [];
  {
    const modeLabels: Record<string, string> = {
      physical: "In-person classes at the centre",
      online: "Online classes",
      hybrid: "Both in-person and online classes",
    };
    const modeLabel = modeLabels[String(centre.mode).toLowerCase()];
    if (modeLabel) keyFacts.push(modeLabel);

    const subjectCount = centre.subjects?.length ?? 0;
    if (subjectCount > 0) {
      keyFacts.push(`${subjectCount} subject${subjectCount === 1 ? "" : "s"} listed`);
    }

    // "Contact for pricing" is the placeholder used when Google gave no price
    // level, so it is not a fact worth stating.
    if (centre.price && centre.price !== "Contact for pricing") {
      keyFacts.push(`Fees: ${centre.price}`);
    }

    if (centre.isVerified) {
      keyFacts.push("Ownership verified by TutorMatch");
    }

    if (centre.reviews > 0) {
      // Named, not just stated: the number is Google's for almost every crawled
      // centre, and "4.9★ from 434 reviews" with no attribution reads as though
      // TutorMatch collected them.
      const platform =
        centre.ratingSource === "google"
          ? "on Google"
          : centre.ratingSource === "tutormatch"
            ? "on TutorMatch"
            : "";
      keyFacts.push(
        `${centre.rating.toFixed(1)}★ from ${centre.reviews} review${centre.reviews === 1 ? "" : "s"}${platform ? ` ${platform}` : ""}`
      );
    }

    if (centre.tutorMatchReviewCount > 0 && centre.ratingSource === "google") {
      keyFacts.push(
        `${centre.tutorMatchRating.toFixed(1)}★ from ${centre.tutorMatchReviewCount} TutorMatch review${centre.tutorMatchReviewCount === 1 ? "" : "s"}`
      );
    }

    if (centre.galleryUrls.length > 0) {
      keyFacts.push(`${centre.galleryUrls.length} photo${centre.galleryUrls.length === 1 ? "" : "s"} from the centre`);
    }
  }

  return (
    <div className="bg-slate-50 dark:bg-slate-950 min-h-screen pb-20">
      {/* Premium Hero Section */}
      <div 
        className={`w-full h-[40vh] relative ${centre.logoUrl ? '' : 'bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-800'}`}
        style={centre.logoUrl ? { backgroundImage: `url(${centre.logoUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}
      >
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute top-0 left-0 w-full p-6">
          <Link href="/centres">
            <Button variant="ghost" className="text-white hover:bg-white/20 backdrop-blur-sm rounded-xl">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Search
            </Button>
          </Link>
        </div>
        <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-slate-900/90 to-transparent p-8 md:p-12">
          <div className="container mx-auto">
            <div className="flex flex-col md:flex-row items-end justify-between gap-6">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  {centre.isVerified && (
                    <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-none shadow-lg">
                      <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Verified Centre
                    </Badge>
                  )}
                  <Badge className="bg-white/20 hover:bg-white/30 text-white backdrop-blur-md border-none">
                    {centre.mode === TEACHING_MODE_UNKNOWN
                      ? "Mode not specified"
                      : `${centre.mode} Mode`}
                  </Badge>
                </div>
                <h1 className="text-4xl md:text-5xl font-heading font-bold text-white mb-2">{centre.name}</h1>
                <div className="flex items-center text-slate-200 text-sm md:text-base">
                  <MapPin className="w-4 h-4 mr-1" />
                  {centre.location}
                  <Separator orientation="vertical" className="h-4 mx-3 bg-slate-500" />
                  {/*
                    A centre with no reviews has no rating. Rendering a filled
                    yellow star next to "0" reads as a genuine zero-star score
                    rather than an absence of data, so say "No reviews yet"
                    instead — matching how the directory cards show "New".
                  */}
                  {/*
                    The star rating is attributed inline. For a crawled centre
                    this figure is Google's aggregate over reviews written on
                    Google Maps — showing it bare, directly above a Reviews tab
                    holding TutorMatch reviews, presented one platform's score as
                    if it were the other's.
                  */}
                  {centre.reviews > 0 ? (
                    <>
                      {/* Google Yellow (#FBBC04) for a Google rating — the exact shade
                          Google fills its own review stars with — and indigo for a
                          rating collected here. The badge carries the "G" mark so the
                          source is stated, not just implied by a colour. */}
                      <Star
                        className={`w-4 h-4 mr-1 ${
                          centre.ratingSource === "google"
                            ? "text-[#FBBC04] fill-[#FBBC04]"
                            : centre.ratingSource === "tutormatch"
                              ? "text-indigo-400 fill-indigo-400"
                              : "text-slate-300 fill-slate-300"
                        }`}
                      />
                      <span className="font-medium text-white">{centre.rating.toFixed(1)}</span>
                      <span className="ml-1 text-slate-300">
                        ({centre.reviews} review{centre.reviews === 1 ? "" : "s"})
                      </span>
                      {centre.ratingSource && (
                        <Badge className="ml-2 bg-white/20 hover:bg-white/30 text-white backdrop-blur-md border-none text-[11px] font-medium inline-flex items-center gap-1">
                          {centre.ratingSource === "google" && <GoogleG className="w-3 h-3" />}
                          {centre.ratingSource === "google" ? "from Google" : "from TutorMatch"}
                        </Badge>
                      )}
                    </>
                  ) : (
                    <>
                      <Star className="w-4 h-4 text-slate-300 mr-1" />
                      <span className="text-slate-300">No reviews yet</span>
                    </>
                  )}
                </div>
              </div>

            </div>
            
            {session && session.user && (session.user as any).role === "student" && (
                <SaveCentreButton 
                    centreId={centre.id} 
                    initialIsSaved={userSavedCentres.includes(centre.id)} 
                    className="ml-auto w-12 h-12 shadow-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" 
                />
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="container mx-auto px-4 mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column (Tabs) */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="w-full bg-white dark:bg-slate-900 p-1 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 justify-start overflow-x-auto">
                <TabsTrigger value="overview" className="rounded-xl px-6 data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-900/50 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400">Overview</TabsTrigger>
                {centre.galleryUrls.length > 0 && (
                  <TabsTrigger value="gallery" className="rounded-xl px-6 data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-900/50 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400">Gallery</TabsTrigger>
                )}
                <TabsTrigger value="subjects" className="rounded-xl px-6 data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-900/50 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400">Subjects & Pricing</TabsTrigger>
                <TabsTrigger value="reviews" className="rounded-xl px-6 data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-900/50 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400">Reviews & AI Analysis</TabsTrigger>
              </TabsList>

              {/* OVERVIEW TAB */}
              <TabsContent value="overview" className="mt-6 space-y-6">
                {/* ANNOUNCEMENTS — newest first */}
                <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
                  <CardHeader>
                    <CardTitle className="font-heading text-xl flex items-center gap-2">
                      <Megaphone className="w-5 h-5 text-indigo-500" />
                      Announcements
                    </CardTitle>
                    <CardDescription>Latest news from this centre.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {centre.announcements.length === 0 ? (
                      <p className="text-slate-500 dark:text-slate-400 text-sm py-2">
                        This centre has not posted any announcements yet.
                      </p>
                    ) : (
                      <ul className="space-y-4">
                        {centre.announcements.map((a: { id: string; content: string; date: Date }) => (
                          <li
                            key={a.id}
                            className="relative pl-5 border-l-2 border-indigo-200 dark:border-indigo-800"
                          >
                            <span className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-indigo-500" />
                            <p className="text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap break-words">
                              {a.content}
                            </p>
                            <time
                              dateTime={a.date.toISOString()}
                              className="text-xs text-slate-400 mt-1 block"
                            >
                              {a.date.toLocaleDateString("en-MY", {
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                              })}
                            </time>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
                  <CardHeader>
                    <CardTitle className="font-heading text-2xl">About this Centre</CardTitle>
                  </CardHeader>
                  <CardContent className="text-slate-600 dark:text-slate-300 leading-relaxed space-y-4 whitespace-pre-wrap">
                    {centre.description}
                  </CardContent>
                </Card>

                {/*
                  Key Facts — built only from fields actually stored for THIS
                  centre. This panel previously rendered four fixed marketing
                  claims ("90% of students scored A/A* in SPM 2024", "Max 15
                  students", …) on every centre page, including real businesses
                  that never said any of it. Nothing here is generated: if a
                  field is empty it is omitted, and if nothing is known the card
                  does not render at all.
                */}
                {keyFacts.length > 0 && (
                  <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
                    <CardHeader>
                      <CardTitle className="font-heading text-xl">Key Facts</CardTitle>
                      <CardDescription>Taken from this centre&apos;s listing.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {keyFacts.map((fact) => (
                          <div key={fact} className="flex items-start gap-3">
                            <CheckCircle2 className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                            <span className="text-slate-700 dark:text-slate-300">{fact}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* GALLERY TAB */}
              {centre.galleryUrls.length > 0 && (
                <TabsContent value="gallery" className="mt-6 space-y-6">
                  <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
                    <CardHeader>
                      <CardTitle className="font-heading text-2xl flex items-center gap-2">
                        <ImageIcon className="w-5 h-5 text-indigo-500" /> Photo Gallery
                      </CardTitle>
                      <CardDescription>Take a look inside the centre</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <GalleryLightbox
                        urls={centre.galleryUrls}
                        centreName={centre.name}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>
              )}

              {/* REVIEWS & AI ANALYSIS TAB */}
              <TabsContent value="reviews" className="mt-6 space-y-6">
                <Card className="rounded-3xl border-indigo-100 dark:border-indigo-900 shadow-lg shadow-indigo-100/50 dark:shadow-none bg-gradient-to-br from-white to-indigo-50/50 dark:from-slate-900 dark:to-indigo-950/30 overflow-hidden">
                  <div className="absolute top-0 right-0 p-6 opacity-10">
                    <TrendingUp className="w-32 h-32 text-indigo-500" />
                  </div>
                  <CardHeader className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-5 h-5 text-indigo-500" />
                      <h3 className="font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider text-xs">AI Insight Generation</h3>
                    </div>
                    <CardTitle className="font-heading text-2xl">Sentiment Analysis Summary</CardTitle>
                    <CardDescription>
                      {/*
                        States the exact denominator, where it came from, and —
                        for Google — how small a slice of that platform it is.
                        The last part matters more than it looks: Google releases
                        at most five review texts per request and chooses them
                        itself, favouring its "most relevant" ones, which is why
                        a summary built from them reads far more positive than
                        the centre's own star average. Saying "5 of 168" lets a
                        reader discount it accordingly; printing "83% positive"
                        alone would not.
                      */}
                      Based on the {aiSummary.total} review{aiSummary.total === 1 ? "" : "s"} our
                      sentiment model has read and classified
                      {aiSummary.bySource?.tutormatch && aiSummary.bySource?.google ? (
                        <> — {aiSummary.bySource.tutormatch.total} written on TutorMatch
                          and {aiSummary.bySource.google.total} read from Google.</>
                      ) : aiSummary.bySource?.google ? (
                        <> — all of them read from Google.</>
                      ) : (
                        <> — all of them written on TutorMatch.</>
                      )}
                      {aiSummary.bySource?.google && centre.googleRatingTotal > aiSummary.bySource.google.total && (
                        <> Google holds {centre.googleRatingTotal} ratings for this centre but
                          publishes only a handful of the written ones through its API, so the
                          Google figures below describe those {aiSummary.bySource.google.total},
                          not all {centre.googleRatingTotal}.</>
                      )}
                      {reviewsList.length > aiSummary.total && (
                        <> {reviewsList.length - aiSummary.total} more review
                          {reviewsList.length - aiSummary.total === 1 ? " is" : "s are"} shown
                          below but not counted here, because {reviewsList.length - aiSummary.total === 1 ? "it has" : "they have"} no
                          written text for the model to read.</>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="relative z-10">
                    {aiSummary.total === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-indigo-900/60 dark:text-indigo-200/60">
                          No reviews have been through the sentiment model yet, so there is
                          nothing to summarise.
                          {reviewsList.length > 0 &&
                            " The reviews below are star ratings with no written text, so there is nothing for the model to read."}
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-4 mb-6">
                          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 text-center shadow-sm border border-slate-100 dark:border-slate-700">
                            <ThumbsUp className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
                            <div className="text-2xl font-bold text-slate-900 dark:text-white">{aiSummary.pos}%</div>
                            <div className="text-xs text-slate-500 font-medium">Positive</div>
                          </div>
                          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 text-center shadow-sm border border-slate-100 dark:border-slate-700">
                            <Minus className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                            <div className="text-2xl font-bold text-slate-900 dark:text-white">{aiSummary.neu}%</div>
                            <div className="text-xs text-slate-500 font-medium">Neutral</div>
                          </div>
                          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 text-center shadow-sm border border-slate-100 dark:border-slate-700">
                            <ThumbsDown className="w-6 h-6 text-rose-500 mx-auto mb-2" />
                            <div className="text-2xl font-bold text-slate-900 dark:text-white">{aiSummary.neg}%</div>
                            <div className="text-xs text-slate-500 font-medium">Negative</div>
                          </div>
                        </div>

                        {/*
                          The same split per platform.

                          A single combined percentage would hide which platform
                          the opinion came from, and the two samples are not
                          comparable: TutorMatch reviews are every review left
                          here, while Google's API returns at most five review
                          texts per centre no matter how many exist. Shown side by
                          side so the reader can see the size of each before
                          reading anything into the difference.
                        */}
                        {aiSummary.bySource?.tutormatch && aiSummary.bySource?.google && (
                          <div className="mb-6 rounded-xl border border-indigo-100 dark:border-indigo-800/50 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm overflow-hidden">
                            <table className="w-full text-sm">
                              <thead className="text-xs text-slate-500 dark:text-slate-400 border-b border-indigo-100 dark:border-indigo-800/50">
                                <tr>
                                  <th className="text-left font-medium px-4 py-2">Where the reviews came from</th>
                                  <th className="text-right font-medium px-3 py-2">Reviews</th>
                                  <th className="text-right font-medium px-3 py-2">Positive</th>
                                  <th className="text-right font-medium px-3 py-2">Neutral</th>
                                  <th className="text-right font-medium px-4 py-2">Negative</th>
                                </tr>
                              </thead>
                              <tbody className="text-slate-700 dark:text-slate-200">
                                {([
                                  ["Written on TutorMatch", aiSummary.bySource.tutormatch],
                                  ["Imported from Google", aiSummary.bySource.google],
                                ] as const).map(([label, row]) => (
                                  <tr key={label} className="border-t border-indigo-50 dark:border-indigo-900/40">
                                    <td className="px-4 py-2.5">{label}</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">{row.total}</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums">{row.pos}%</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums">{row.neu}%</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums">{row.neg}%</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <p className="text-xs text-slate-500 dark:text-slate-400 px-4 py-2.5 border-t border-indigo-50 dark:border-indigo-900/40">
                              Google returns at most five review texts per centre, so its row is a
                              sample rather than the full picture.
                            </p>
                          </div>
                        )}

                        <div className="bg-white/60 dark:bg-slate-800/60 rounded-xl p-4 backdrop-blur-sm border border-indigo-100 dark:border-indigo-800/50">
                          <p className="text-sm text-indigo-900 dark:text-indigo-200 font-medium leading-relaxed">
                            <span className="font-bold">Overall: </span>
                            {aiSummary.pos > 70
                              ? "Mostly positive."
                              : aiSummary.neg > 40
                                ? "Mixed, with a notable share of negative reviews."
                                : "Mixed reception."}{" "}
                            <span className="font-normal text-indigo-900/70 dark:text-indigo-200/70">
                              Across {aiSummary.total} classified review{aiSummary.total === 1 ? "" : "s"}.
                            </span>
                          </p>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Individual Reviews */}
                <ReviewsClient
                  reviewsList={reviewsList}
                  totalRatings={centre.reviews}
                  totalRatingsSource={centre.ratingSource}
                />

                {/* Interactive Review Submission Form */}
                <ReviewForm centreId={centre.id} />

              </TabsContent>
              
              <TabsContent value="subjects" className="mt-6">
                <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
                   <CardHeader>
                     <CardTitle className="font-heading">Subjects Offered</CardTitle>
                   </CardHeader>
                   <CardContent>
                     {(centre.subjects?.length ?? 0) === 0 ? (
                       <p className="text-slate-500 dark:text-slate-400 py-4">
                         This centre has not listed its subjects yet. Contact them directly for details.
                       </p>
                     ) : (
                       <div className="space-y-4">
                         {(centre.subjects ?? []).map((sub: string) => (
                           <div key={sub} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                             <div className="flex items-center gap-3">
                               <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400">
                                 <BookOpen className="w-5 h-5" />
                               </div>
                               <span className="font-semibold text-slate-900 dark:text-white">{sub}</span>
                             </div>
                             <span className="font-bold text-indigo-600 dark:text-indigo-400">{centre.price}</span>
                           </div>
                         ))}
                       </div>
                     )}
                   </CardContent>
                </Card>
              </TabsContent>

            </Tabs>
          </div>

          {/* Right Column (Sticky Sidebar) */}
          <div className="hidden lg:block relative">
            <div className="sticky top-24 space-y-6">
              {/* Contact Information Block */}
              <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
                <CardHeader>
                  <CardTitle className="font-heading text-lg">Contact Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {centre.contactNumber ? (
                    <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                      <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                        <Phone className="w-4 h-4 text-indigo-500" />
                      </div>
                      <span className="font-medium text-sm">{centre.contactNumber}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 text-slate-400 dark:text-slate-500">
                      <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center shrink-0">
                        <Phone className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                      </div>
                      <span className="font-medium text-sm italic">Phone number unavailable</span>
                    </div>
                  )}
                  
                  {centre.email && (
                    <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                      <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                        <Mail className="w-4 h-4 text-indigo-500" />
                      </div>
                      <a href={`mailto:${centre.email}`} className="font-medium text-sm hover:text-indigo-600 transition-colors">{centre.email}</a>
                    </div>
                  )}
                  {centre.website && (
                    <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                      <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                        <Globe className="w-4 h-4 text-indigo-500" />
                      </div>
                      <a href={centre.website.startsWith('http') ? centre.website : `https://${centre.website}`} target="_blank" rel="noopener noreferrer" className="font-medium text-sm text-indigo-600 hover:underline truncate">
                        {centre.website.replace(/^https?:\/\//, '')}
                      </a>
                    </div>
                  )}

                  {centre.contactNumber ? (
                    <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
                      <a 
                        href={`https://wa.me/${centre.contactNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hi! I found ${centre.name} on the Tuition Centre Directory and would like to enquire about your classes.`)}`}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="w-full"
                      >
                        <Button className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl shadow-md font-bold">
                          <MessageSquare className="w-4 h-4 mr-2" /> Chat on WhatsApp
                        </Button>
                      </a>
                    </div>
                  ) : (
                    <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
                      <Button disabled className="w-full bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-500 rounded-xl font-bold cursor-not-allowed">
                        <MessageSquare className="w-4 h-4 mr-2 opacity-50" /> WhatsApp Unavailable
                      </Button>
                    </div>
                  )}
                  
                  <div className="pt-3 mt-1">
                    <a 
                      href={`https://www.google.com/maps/dir/?api=1&destination=${centre.latitude && centre.longitude ? `${centre.latitude},${centre.longitude}` : encodeURIComponent(centre.name + ' ' + centre.location)}`}
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="w-full"
                    >
                      <Button variant="outline" className="w-full rounded-xl border-slate-200 dark:border-slate-700 shadow-sm font-semibold hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400">
                        <MapPin className="w-4 h-4 mr-2 text-indigo-500" /> Get Directions
                      </Button>
                    </a>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none bg-white dark:bg-slate-900">
                <CardHeader>
                  <CardTitle className="font-heading">Enquire Now</CardTitle>
                  <CardDescription>
                    {/*
                      Three states, not two. `isVerified` and `ownerId` are
                      different facts and this card used to read only the first,
                      so a centre its owner had created and an admin had approved
                      was still described as "not claimed by its owner yet" — to
                      the owner, on their own listing, above a Claim button that
                      refuses with "you already own this centre".
                    */}
                    {centre.isVerified
                      ? "Get in touch with the centre admin directly."
                      : centre.ownerId
                        ? "This centre is managed by its owner and is awaiting verification."
                        : "This centre has not been claimed by its owner yet."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {centre.isVerified ? (
                    <EnquiryForm centreId={centre.id} centreName={centre.name} />
                  ) : (
                    <div className="text-center p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                      <ShieldCheck className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                      {centre.ownerId ? (
                        /*
                          Already owned — so there is nothing to claim, whoever
                          is looking. The listing is simply waiting on the admin
                          verification step, which is a separate decision from
                          the approval that put it in the directory.
                        */
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          This listing has an owner and is waiting to be verified by TutorMatch.
                          Direct enquiries open once verification is complete.
                        </p>
                      ) : canOfferClaim ? (
                        <>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                            Direct enquiries are only available for verified centres. If you are the owner, you can claim this listing to start receiving student enquiries.
                          </p>
                          <ClaimCentreButtonWrapper
                            centreId={centre.id}
                            centreName={centre.name}
                            userId={(session?.user as any)?.id}
                          />
                        </>
                      ) : (
                        // A student or an admin. Neither can claim, so the
                        // sentence stops at the fact and offers no button:
                        // "you can claim this listing" would be an invitation
                        // the next screen refuses.
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          Direct enquiries are only available for verified centres. Nobody has claimed
                          this listing yet, so the centre cannot be contacted through TutorMatch.
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 overflow-hidden">
                <CardHeader>
                  <CardTitle className="font-heading text-lg">Location Map</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="w-full h-64 bg-slate-100 dark:bg-slate-800 relative">
                    <iframe 
                      title="Centre Location Map"
                      width="100%" 
                      height="100%" 
                      style={{ border: 0 }}
                      loading="lazy" 
                      allowFullScreen 
                      referrerPolicy="no-referrer-when-downgrade"
                      src={`https://maps.google.com/maps?q=${centre.latitude && centre.longitude ? `${centre.latitude},${centre.longitude}` : encodeURIComponent(centre.name + ' ' + centre.location)}&t=&z=14&ie=UTF8&iwloc=&output=embed`}
                    ></iframe>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
