"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { MapPin, Star, Clock, CheckCircle2 } from "lucide-react";

interface CompareModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  centres: any[];
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
            {centres.map((centre) => (
              <div key={centre.id} className="flex flex-col border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-50/50 dark:bg-slate-800/30">
                <div 
                  className={`h-32 w-full bg-slate-200 dark:bg-slate-700 ${centre.image ? '' : centre.gradient}`}
                  style={centre.image ? { backgroundImage: `url(${centre.image})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}
                />
                
                <div className="p-4 flex-1 flex flex-col space-y-4">
                  <div>
                    <h3 className="font-bold text-lg leading-tight text-slate-900 dark:text-white mb-1">{centre.name}</h3>
                    <div className="text-sm text-slate-500 dark:text-slate-400 flex items-center">
                      <MapPin className="w-3.5 h-3.5 mr-1" /> {centre.location}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex flex-col p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-700/50">
                      <span className="text-xs text-slate-400 mb-1 flex items-center"><Star className="w-3 h-3 mr-1 text-yellow-500" /> Rating</span>
                      <span className="font-bold text-slate-700 dark:text-slate-200">{centre.rating} <span className="text-xs font-normal text-slate-400">({centre.reviews})</span></span>
                    </div>
                    
                    <div className="flex flex-col p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-700/50">
                      <span className="text-xs text-slate-400 mb-1 flex items-center"><Clock className="w-3 h-3 mr-1 text-indigo-400" /> Mode</span>
                      <span className="font-bold text-slate-700 dark:text-slate-200">{centre.mode}</span>
                    </div>
                  </div>

                  <div className="flex flex-col p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-700/50">
                    <span className="text-xs text-slate-400 mb-1">Pricing</span>
                    <span className="font-bold text-slate-900 dark:text-indigo-400">{centre.price}</span>
                  </div>

                  <div className="flex-1">
                    <span className="text-xs text-slate-400 mb-2 block">Subjects Offered</span>
                    <div className="flex flex-col gap-1.5">
                      {centre.subjects.slice(0, 5).map((subject: string) => (
                        <div key={subject} className="flex items-start text-xs text-slate-700 dark:text-slate-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mr-1.5 shrink-0" />
                          {subject}
                        </div>
                      ))}
                      {centre.subjects.length > 5 && (
                        <span className="text-xs text-slate-400 italic ml-5">+{centre.subjects.length - 5} more</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
