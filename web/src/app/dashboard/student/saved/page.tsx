import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Star, Clock, Heart, BookOpen, ChevronRight, Navigation } from "lucide-react";
import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { User } from "@/models/User";
import { formatLocation } from "@/lib/centre-display";

export default async function SavedCentresPage() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user || (session.user as any).role !== "student") {
    redirect("/auth/login");
  }

  await dbConnect();
  
  const user = await User.findById((session.user as any).id).lean();
  if (!user) redirect("/auth/login");

  const savedIds = user.savedCentres || [];
  
  // Fetch the actual centres
  const savedCentres = await TuitionCentre.find({ _id: { $in: savedIds } }).lean();

  return (
    <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-8">
            <div>
              <h1 className="text-3xl font-heading font-bold text-slate-900 dark:text-white mb-2">Saved Centres</h1>
              <p className="text-slate-500 dark:text-slate-400">Your personal shortlist of tuition centres.</p>
            </div>

            {savedCentres.length === 0 ? (
                <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm text-center py-16">
                    <CardContent className="flex flex-col items-center">
                    <div className="w-16 h-16 rounded-full bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-500 mb-4">
                        <Heart className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No saved centres yet</h3>
                    <p className="text-slate-500 mb-6">Browse tuition centres and click the heart icon to save them here for later.</p>
                    <Link href="/centres">
                        <Button className="rounded-xl bg-indigo-600 text-white hover:bg-indigo-700">Explore Centres</Button>
                    </Link>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid md:grid-cols-2 gap-6">
                {savedCentres.map((centre: any) => (
                    <Card key={centre._id.toString()} className="group overflow-hidden rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-indigo-500/30 transition-all duration-300 flex flex-col">
                    {/* Header Image/Gradient */}
                    <div 
                        className={`h-32 w-full relative p-4 flex items-start justify-between ${centre.imageUrl ? '' : 'bg-gradient-to-r from-indigo-500 to-violet-600'}`}
                        style={centre.imageUrl ? { backgroundImage: `url(${centre.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}
                    >
                        <Badge className="bg-white/90 text-slate-900 hover:bg-white border-none font-bold shadow-sm backdrop-blur-md">
                        <Star className="w-3.5 h-3.5 text-yellow-500 mr-1 fill-yellow-500" />
                        {centre.averageRating || 0} ({centre.reviewCount || 0} reviews)
                        </Badge>
                        <div className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center backdrop-blur-md transition-colors text-white">
                        <Heart className="w-4 h-4 fill-white" />
                        </div>
                    </div>
                    
                    <CardHeader className="pt-4 pb-2">
                        <Link href={`/centres/${centre._id.toString()}`}>
                        <h3 className="font-heading font-bold text-xl text-slate-900 dark:text-white group-hover:text-indigo-600 transition-colors line-clamp-1">
                            {centre.name}
                        </h3>
                        </Link>
                        <div className="flex flex-col gap-1 mt-1">
                        <div className="flex items-center text-sm text-slate-500 dark:text-slate-400">
                            <MapPin className="w-4 h-4 mr-1 shrink-0" />
                            {formatLocation(centre.city, centre.state)}
                        </div>
                        </div>
                    </CardHeader>
                    
                    <CardContent className="pb-4 flex-1">
                        <div className="flex flex-wrap gap-2">
                        {(centre.subjects || []).slice(0, 4).map((subject: string) => (
                            <Badge key={subject} variant="secondary" className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {subject}
                            </Badge>
                        ))}
                        {(centre.subjects || []).length > 4 && (
                            <Badge variant="secondary" className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            +{(centre.subjects || []).length - 4} more
                            </Badge>
                        )}
                        </div>
                    </CardContent>
                    
                    <CardFooter className="border-t border-slate-100 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between mt-auto">
                        <div>
                        <div className="text-lg font-bold text-slate-900 dark:text-white">{centre.priceRange || 'Contact for price'}</div>
                        <div className="text-xs text-slate-500 flex items-center mt-0.5">
                            <Clock className="w-3.5 h-3.5 mr-1" />
                            {centre.teachingMode} Mode
                        </div>
                        </div>
                        <Link href={`/centres/${centre._id.toString()}`}>
                        <Button className="rounded-xl bg-slate-900 text-white hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700">
                            View Details
                        </Button>
                        </Link>
                    </CardFooter>
                    </Card>
                ))}
                </div>
            )}
        </div>
    </div>
  );
}
