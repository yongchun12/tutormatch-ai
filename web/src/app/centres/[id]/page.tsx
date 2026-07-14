import { use } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { MapPin, Star, Clock, CheckCircle2, TrendingUp, MessageSquare, ArrowLeft, Heart, ShieldCheck, ThumbsUp, ThumbsDown, Minus, Sparkles, BookOpen, Phone, Globe, Mail } from "lucide-react";
import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { Review } from "@/models/Review";
import { User } from "@/models/User";
import ReviewForm from "@/components/ReviewForm";
import EnquiryForm from "@/components/EnquiryForm";
import SaveCentreButton from "@/components/SaveCentreButton";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function CentreDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params; // Must await params in Server Components
  
  await dbConnect();
  
  const session = await getServerSession(authOptions);
  let userSavedCentres: string[] = [];
  if (session && session.user && (session.user as any).role === "student") {
    const user = await User.findById((session.user as any).id).lean();
    if (user && user.savedCentres) {
      userSavedCentres = user.savedCentres.map(id => id.toString());
    }
  }

  let centre = null;
  let reviewsList: { id: string; name: string; score: string; text: string; rating: number; }[] = [];
  let aiSummary = { pos: 0, neu: 0, neg: 0, total: 0 };

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
        name: r.userId ? r.userId.name : "Student User",
        score: r.sentimentScore || "neutral",
        text: r.comment,
        rating: r.rating
      }));

      centre = {
        id: rawCentre._id.toString(),
        name: rawCentre.name,
        description: rawCentre.description,
        location: `${rawCentre.city}, ${rawCentre.state}`,
        rating: rawCentre.averageRating || 0,
        reviews: reviewsList.length > 0 ? reviewsList.length : (rawCentre.reviewCount || 0),
        subjects: rawCentre.subjects,
        price: rawCentre.priceRange,
        mode: rawCentre.teachingMode.charAt(0).toUpperCase() + rawCentre.teachingMode.slice(1),
        logoUrl: rawCentre.logoUrl || null,
        latitude: rawCentre.latitude,
        longitude: rawCentre.longitude,
        googlePlaceId: rawCentre.googlePlaceId,
        contactNumber: rawCentre.contactNumber,
        website: rawCentre.website,
        email: rawCentre.email,
        ownerId: rawCentre.ownerId,
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

              if (data.result.reviews) {
                const googleReviews = data.result.reviews.map((r: any) => ({
                  id: `google-${r.time}`,
                  name: r.author_name || "Google User",
                  score: r.rating >= 4 ? "positive" : (r.rating <= 2 ? "negative" : "neutral"),
                  text: r.text,
                  rating: r.rating
                }));
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

      // If we have real reviews, recalculate the AI summary percentages dynamically!
      if (reviewsList.length > 0) {
        let pos = 0; let neu = 0; let neg = 0;
        reviewsList.forEach(r => {
          if (r.score === 'positive') pos++;
          else if (r.score === 'negative') neg++;
          else neu++;
        });
        const total = reviewsList.length;
        aiSummary = {
          pos: Math.round((pos / total) * 100),
          neu: Math.round((neu / total) * 100),
          neg: Math.round((neg / total) * 100),
          total: total
        };
      }
    }
  } catch (error) {
    console.error("Invalid ID format or DB Error:", error);
  }

  if (!centre) {
    notFound();
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
                  <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-none shadow-lg">
                    <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Verified Centre
                  </Badge>
                  <Badge className="bg-white/20 hover:bg-white/30 text-white backdrop-blur-md border-none">
                    {centre.mode} Mode
                  </Badge>
                </div>
                <h1 className="text-4xl md:text-5xl font-heading font-bold text-white mb-2">{centre.name}</h1>
                <div className="flex items-center text-slate-200 text-sm md:text-base">
                  <MapPin className="w-4 h-4 mr-1" />
                  {centre.location}
                  <Separator orientation="vertical" className="h-4 mx-3 bg-slate-500" />
                  <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 mr-1" />
                  <span className="font-medium text-white">{centre.rating}</span>
                  <span className="ml-1 text-slate-300">({aiSummary.total} reviews)</span>
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="bg-white/10 text-white border-white/20 hover:bg-white/20 backdrop-blur-md rounded-xl">
                  <Heart className="w-4 h-4 mr-2" /> Save
                </Button>
                <Button className="bg-white text-indigo-600 hover:bg-slate-100 rounded-xl shadow-xl font-bold">
                  Book Trial Class
                </Button>
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
                <TabsTrigger value="subjects" className="rounded-xl px-6 data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-900/50 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400">Subjects & Pricing</TabsTrigger>
                <TabsTrigger value="reviews" className="rounded-xl px-6 data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-900/50 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400">Reviews & AI Analysis</TabsTrigger>
              </TabsList>

              {/* OVERVIEW TAB */}
              <TabsContent value="overview" className="mt-6 space-y-6">
                <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
                  <CardHeader>
                    <CardTitle className="font-heading text-2xl">About this Centre</CardTitle>
                  </CardHeader>
                  <CardContent className="text-slate-600 dark:text-slate-300 leading-relaxed space-y-4 whitespace-pre-wrap">
                    {centre.description}
                  </CardContent>
                </Card>

                <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
                  <CardHeader>
                    <CardTitle className="font-heading text-xl">Key Highlights</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        "90% of students scored A/A* in SPM 2024",
                        "Small class sizes (Max 15 students)",
                        "Monthly progress reports powered by AI",
                        "Free access to digital resource library"
                      ].map((highlight, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <CheckCircle2 className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                          <span className="text-slate-700 dark:text-slate-300">{highlight}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

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
                      Our ML model processed {aiSummary.total} student reviews to bring you the truth about this centre.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="relative z-10">
                    {aiSummary.total === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-indigo-900/60 dark:text-indigo-200/60">Not enough reviews to generate AI insights yet.</p>
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

                        <div className="bg-white/60 dark:bg-slate-800/60 rounded-xl p-4 backdrop-blur-sm border border-indigo-100 dark:border-indigo-800/50">
                          <p className="text-sm text-indigo-900 dark:text-indigo-200 font-medium leading-relaxed">
                            <span className="font-bold">AI Verdict: </span> 
                            {aiSummary.pos > 70 ? "Highly recommended by students." : "Mixed reception from students."} 
                          </p>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Individual Reviews */}
                <div className="space-y-4">
                  <h3 className="font-heading font-bold text-xl dark:text-white mb-4">Student Experiences</h3>
                  {reviewsList.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <p>No reviews yet. Be the first to review!</p>
                    </div>
                  ) : (
                    reviewsList.map((review) => (
                      <div key={review.id} className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex gap-4">
                        <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center shrink-0">
                          <span className="font-bold text-slate-500">{review.name ? review.name[0] : "S"}</span>
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="font-bold text-slate-900 dark:text-white">{review.name}</h4>
                            <div className="flex">
                              {[...Array(5)].map((_, idx) => (
                                <Star key={idx} className={`w-3.5 h-3.5 ${idx < review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-slate-300'}`} />
                              ))}
                            </div>
                          </div>
                          <Badge variant="outline" className={`mb-3 text-xs border-none ${review.score === 'positive' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30' : review.score === 'negative' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-600'}`}>
                            AI Score: {review.score.charAt(0).toUpperCase() + review.score.slice(1)}
                          </Badge>
                          <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">"{review.text}"</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Interactive Review Submission Form */}
                <ReviewForm centreId={centre.id} />

              </TabsContent>
              
              <TabsContent value="subjects" className="mt-6">
                <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
                   <CardHeader>
                     <CardTitle className="font-heading">Subjects Offered</CardTitle>
                   </CardHeader>
                   <CardContent>
                     <div className="space-y-4">
                       {centre.subjects.map((sub: string) => (
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
                </CardContent>
              </Card>

              <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none bg-white dark:bg-slate-900">
                <CardHeader>
                  <CardTitle className="font-heading">Enquire Now</CardTitle>
                  <CardDescription>Get in touch with the centre admin directly.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <EnquiryForm centreId={centre.id} centreName={centre.name} />
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
