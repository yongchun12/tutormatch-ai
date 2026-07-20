"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ActionModalProps {
  triggerBtn: React.ReactNode;
  title: string;
  description: string;
  confirmBtnText: string;
  confirmBtnVariant?: "default" | "destructive" | "outline";
  action: () => void | Promise<void>;
}

export function ActionModal({
  triggerBtn,
  title,
  description,
  confirmBtnText,
  confirmBtnVariant = "default",
  action
}: ActionModalProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        {triggerBtn}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4 gap-2 sm:gap-0 flex justify-end">
          <Button variant="outline" onClick={() => setOpen(false)} type="button">
            Cancel
          </Button>
          <form action={action}>
            <Button variant={confirmBtnVariant} type="submit" onClick={() => setTimeout(() => setOpen(false), 200)}>
              {confirmBtnText}
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
