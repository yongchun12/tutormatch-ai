"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface ActionModalProps {
  /**
   * A SINGLE element to render as the trigger — normally a <Button>. It is
   * handed to DialogTrigger's `render` prop, not nested inside it, so exactly
   * one <button> element reaches the DOM (see below).
   */
  triggerBtn: React.ReactElement;
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
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Don't let a click-away discard a request that is already running.
        if (isPending) return;
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      {/*
        DialogTrigger renders its own <button>. Passing the trigger as CHILDREN
        put our <Button> inside that button, producing nested <button> elements —
        invalid HTML that React reports as "<button> cannot be a descendant of
        <button>". `render` merges the trigger's behaviour (onClick, aria-*, ref)
        into the element we supply instead of wrapping it, so only one button
        is produced.
      */}
      <DialogTrigger render={triggerBtn} />
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 px-3 py-2 text-sm text-rose-700 dark:text-rose-400"
          >
            {error}
          </p>
        )}

        <DialogFooter className="mt-4 gap-2 sm:gap-0 flex justify-end">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            type="button"
            disabled={isPending}
          >
            Cancel
          </Button>
          {/*
            The dialog used to close on a fixed 200ms timer, so it reported
            success before the server action had run — and stayed silent when
            the action threw. It now closes when the action actually resolves,
            and keeps the dialog open to show the message when it does not.
          */}
          <Button
            variant={confirmBtnVariant}
            type="button"
            disabled={isPending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                try {
                  await action();
                  setOpen(false);
                } catch (err) {
                  // In a production build Next.js redacts Server Action errors,
                  // so the fallback is what most users will actually see.
                  setError(
                    err instanceof Error && err.message
                      ? err.message
                      : "That didn't work. Please try again."
                  );
                }
              });
            }}
          >
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {confirmBtnText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
