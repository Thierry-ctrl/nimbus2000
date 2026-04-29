import { ReactNode, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateReport } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const REASONS = [
  "No-show",
  "Unsafe driving",
  "Inappropriate behavior",
  "Vehicle did not match",
  "Other",
];

export function ReportUserDialog({
  reportedUserId,
  reportedName,
  tripId,
  trigger,
}: {
  reportedUserId: string;
  reportedName: string;
  tripId?: string;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState("");
  const create = useCreateReport();
  const { toast } = useToast();

  const submit = async () => {
    try {
      await create.mutateAsync({
        data: {
          reportedUserId,
          tripId: tripId ?? null,
          reason,
          details: details || null,
        },
      });
      toast({ title: "Report submitted", description: "Our admins will review it." });
      setOpen(false);
      setDetails("");
      setReason(REASONS[0]);
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      toast({
        title: err?.response?.data?.error || "Could not submit report",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report {reportedName}</DialogTitle>
          <DialogDescription>
            Reports are reviewed confidentially by KigaliWeShare admins.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Details (optional)</Label>
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="What happened?"
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            Submit report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
