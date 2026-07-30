"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { MapPin, Star, Clock, CheckCircle2, Navigation, ShieldCheck, BookOpen } from "lucide-react";
import { TEACHING_MODE_UNKNOWN } from "@/lib/centre-display";
import { resolveRating } from "@/lib/rating-display";
import { GoogleG } from "@/components/ui/google-g";

interface CompareModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  centres: any[];
}

/** One labelled cell, so every centre shows the same rows in the same order. */
function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-700/50">
      <span className="text-xs text-slate-400 mb-1 flex items-center gap-1">
        {icon}
        {label}
      </span>
      <div className="font-semibold text-sm text-slate-700 dark:text-slate-200">{children}</div>
    </div>
  );
}

export default function CompareModal({ isOpen, setIsOpen, centres }: CompareModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className={`w-[95vw] max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 transition-all ${
        centres.length === 1 ? 'sm:max-w-md' : centres.length === 2 ? 'sm:max-w-4xl' : 'sm:max-w-6xl'
      }`}>
        <DialogHeader className="mb-4">
          <DialogTitle className="font-heading text-2xl text-slate-900 dark:text-white">
            Comparing {centres.length} Centres
          </DialogTitle>
        </DialogHeader>

        {centres.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No centres selected.</div>
        ) : (
          <div className={`grid gap-6 ${
            centres.length === 1 ? 'grid-cols-1' :
            centres.length === 2 ? 'grid-cols-1 md:grid-cols-2' :
            'grid-cols-1 md:grid-cols-3'
          }`}>
            {centres.map((centre) => {
              const rating = resolveRating(centre.rating, centre.reviews, centre.ratingSource);
              const subjects: string[] = Array.isArray(centre.subjects) ? centre.subjects : [];
              const hasDistance = centre.distance !== undefined && centre.distance !== null;

              return (
                <div key={centre.id} className="flex flex-col border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-50/50 dark:bg-slate-800/30">
                  <div
                    className={`h-32 w-full bg-slate-200 dark:bg-slate-700 ${centre.image ? '' : centre.gradient}`}
                    style={centre.image ? { backgroundImage: `url(${centre.image})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}
                  />

                  <div className="p-4 flex-1 flex flex-col space-y-3">
                    <div>
                      <h3 className="font-bold text-lg leading-tight text-slate-900 dark:text-white mb-1">{centre.name}</h3>
                      <div className="text-sm text-slate-500 dark:text-slate-400 flex items-center">
                        <MapPin className="w-3.5 h-3.5 mr-1 shrink-0" /> {centre.location}
                      </div>
                      {centre.isVerified && (
                        <Badge className="mt-2 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900">
                          <ShieldCheck className="w-3 h-3 mr-1" /> Verified
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {/*
                        The rating carries its source. Comparing an unlabelled
                        4.9 against an unlabelled 4.0 invites the reader to treat
                        them as the same measurement when one is a Google
                        aggregate over hundreds of ratings and the other is a
                        TutorMatch average over two.
                      */}
                      <Field label="Rating" icon={<Star className={`w-3 h-3 ${rating.starClass}`} />}>
                        {rating.hasRating ? (
                          <div className="flex flex-col gap-1">
                            <span>
                              {rating.score}{" "}
                              <span className="text-xs font-normal text-slate-400">
                                ({rating.count})
                              </span>
                            </span>
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border w-fit inline-flex items-center gap-1 ${rating.badgeClass}`}>
                              {rating.isGoogle && <GoogleG className="w-3 h-3" />}
                              {rating.sourceLabel}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-normal">{rating.emptyLabel}</span>
                        )}
                      </Field>

                      <Field label="Mode" icon={<Clock className="w-3 h-3 text-indigo-400" />}>
                        {centre.mode === TEACHING_MODE_UNKNOWN ? (
                          <span className="text-slate-400 font-normal">Not specified</span>
                        ) : (
                          centre.mode
                        )}
                      </Field>
                    </div>

                    {/* Distance only exists once the student has set a location. */}
                    <Field label="Distance" icon={<Navigation className="w-3 h-3 text-indigo-400" />}>
                      {hasDistance ? (
                        `${centre.distance < 1 ? "< 1" : centre.distance.toFixed(1)} km away`
                      ) : (
                        <span className="text-slate-400 font-normal">
                          Set a location to compare distance
                        </span>
                      )}
                    </Field>

                    {/*
                      A "Pricing" row stood here, showing "Contact for pricing"
                      for all but 3 of 373 centres — three identical cells side
                      by side, which is the one thing a comparison must not do.
                      Removed with the rest of the price UI; see the price
                      capture limitation in the report.
                    */}

                    <div className="flex-1">
                      <span className="text-xs text-slate-400 mb-2 flex items-center gap-1">
                        <BookOpen className="w-3 h-3" />
                        Subjects Offered
                        {subjects.length > 0 && (
                          <span className="text-slate-400">({subjects.length})</span>
                        )}
                      </span>
                      <div className="flex flex-col gap-1.5">
                        {subjects.length === 0 && (
                          <span className="text-xs text-slate-400 italic">
                            No subjects recorded yet
                          </span>
                        )}
                        {subjects.slice(0, 5).map((subject: string) => (
                          <div key={subject} className="flex items-start text-xs text-slate-700 dark:text-slate-300">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mr-1.5 shrink-0" />
                            {subject}
                          </div>
                        ))}
                        {subjects.length > 5 && (
                          <span className="text-xs text-slate-400 italic ml-5">+{subjects.length - 5} more</span>
                        )}
                      </div>
                    </div>

                    <Link href={`/centres/${centre.id}`} className="block">
                      <Button className="w-full rounded-xl bg-slate-900 text-white hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700 h-9 text-sm">
                        View Details
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
