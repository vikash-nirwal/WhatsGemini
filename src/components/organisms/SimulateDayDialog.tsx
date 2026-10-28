import React from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/components/molecules/dialog";
import { Button } from "src/components/atoms/button";
import { withLifeBoost } from "src/features/life/lifeDial";
import { runTicks, tickJobs } from "src/features/life/ticks";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { runningTask, runTask } from "src/features/tasks/tasksSlice";

const ROUNDS = 6;

// Simulate a day (#191): a day of background life, now - talk, statuses,
// first texts, events, lives moving on - so you can see a world live
// without waiting hours. Each job's waits are cut to a day's worth for the
// run; it goes round six times, and whatever is due happens.
// A task (tasksSlice): close the dialog or leave the page and the day still
// goes by, with its progress in a toast; opened again, it shows how far it is.
export const SimulateDayDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => {
  const dispatch = useAppDispatch();
  const task = useAppSelector((state) => runningTask(state, "simulate-day", "all"));
  const progress = task ? task.progress ?? 0 : null;
  const most = tickJobs().length * ROUNDS;
  const run = () => {
    void dispatch(runTask({ kind: "simulate-day", key: "all", label: "Simulating a day", path: "/worlds", done: () => ({ title: "A day went by" }) }, (report) =>
      withLifeBoost(24, () => runTicks(Array.from({ length: ROUNDS }, () => undefined), (done, total) => report(Math.round((done / total) * 100))))
    )).catch(() => undefined);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sheet" className="px-4">
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pb-2">
          <DialogTitle className="pt-1">Simulate a day</DialogTitle>
          <DialogDescription>
            A day of life in your living worlds happens now: their own talk, statuses, texts, events and lives moving on - whatever would come up over a day. It uses your background model: usually a handful of calls, {most} at the very most.
          </DialogDescription>
          {progress != null && (
            <div role="progressbar" aria-label="Simulating" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-sunken">
              <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
            </div>
          )}
          <Button type="button" disabled={progress != null} onClick={run}>{progress != null ? `Simulating... ${progress}%` : "Simulate a day"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SimulateDayDialog;
