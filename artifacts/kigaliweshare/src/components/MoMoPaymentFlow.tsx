import { useEffect, useState } from "react";
import {
  useInitiateServiceFeePayment,
  useGetServiceFeeStatus,
  useRecordCashFee,
  getGetTripQueryKey,
  getGetServiceFeeStatusQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  rideRequestId: string;
  tripId: string;
  amountRwf: number;
  defaultPhone?: string | null;
  /** When true, the current user is the trip's driver and may record a cash fee. */
  isDriver?: boolean;
}

type Phase = "idle" | "waiting" | "paid" | "failed";

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 20;

/**
 * Triggers the MoMo Collections RequestToPay flow for a ride request's
 * service fee. The fuel share is NEVER touched here — it is paid driver-to-
 * rider out of band via MoMo P2P or cash.
 */
export function MoMoPaymentFlow({
  open,
  onOpenChange,
  rideRequestId,
  tripId,
  amountRwf,
  defaultPhone,
  isDriver,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>("idle");
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [pollCount, setPollCount] = useState(0);
  const [failureReason, setFailureReason] = useState<string | null>(null);

  const initiate = useInitiateServiceFeePayment();
  const recordCash = useRecordCashFee();

  // Poll the fee status while waiting on MoMo confirmation.
  const status = useGetServiceFeeStatus(rideRequestId, {
    query: {
      enabled: phase === "waiting",
      refetchInterval: phase === "waiting" ? POLL_INTERVAL_MS : false,
      queryKey: getGetServiceFeeStatusQueryKey(rideRequestId),
    },
  });

  useEffect(() => {
    if (phase !== "waiting" || !status.data) return;
    if (status.data.serviceFeeStatus === "paid") {
      setPhase("paid");
      queryClient.invalidateQueries({ queryKey: getGetTripQueryKey(tripId) });
    } else if (status.data.momoStatus === "failed") {
      setPhase("failed");
      setFailureReason(status.data.failureReason ?? null);
    } else {
      setPollCount((n) => n + 1);
    }
  }, [phase, status.data, queryClient, tripId]);

  useEffect(() => {
    if (phase === "waiting" && pollCount >= MAX_POLLS) {
      setPhase("failed");
      setFailureReason(
        "We didn't see a confirmation from MoMo. Try again or pay with cash.",
      );
    }
  }, [phase, pollCount]);

  // Reset internal state when the dialog opens fresh.
  useEffect(() => {
    if (open) {
      setPhase("idle");
      setPollCount(0);
      setFailureReason(null);
      setPhone(defaultPhone ?? "");
    }
  }, [open, defaultPhone]);

  const submit = async () => {
    if (!phone.trim()) {
      toast({ title: "Enter your MoMo phone number", variant: "destructive" });
      return;
    }
    try {
      await initiate.mutateAsync({
        data: { rideRequestId, payerPhone: phone.trim() },
      });
      setPhase("waiting");
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      setPhase("failed");
      setFailureReason(
        err?.response?.data?.error ?? "Could not start MoMo payment",
      );
    }
  };

  const recordCashFallback = async () => {
    try {
      await recordCash.mutateAsync({ rideRequestId });
      toast({ title: "Cash fee recorded" });
      queryClient.invalidateQueries({ queryKey: getGetTripQueryKey(tripId) });
      onOpenChange(false);
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      toast({
        title: err?.response?.data?.error ?? "Could not record cash fee",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Service fee payment</DialogTitle>
          <DialogDescription>
            {amountRwf.toLocaleString()} RWF — paid to KigaliWeShare. Your fuel
            share is paid separately to the driver.
          </DialogDescription>
        </DialogHeader>

        {phase === "idle" && (
          <div className="space-y-3">
            <div>
              <Label htmlFor="momo-phone">MoMo phone number</Label>
              <Input
                id="momo-phone"
                inputMode="tel"
                placeholder="2507XXXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              onClick={submit}
              disabled={initiate.isPending}
            >
              {initiate.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Send {amountRwf.toLocaleString()} RWF prompt
            </Button>
          </div>
        )}

        {phase === "waiting" && (
          <div className="py-6 text-center space-y-2">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <div className="font-medium">Check your phone</div>
            <div className="text-sm text-muted-foreground">
              Approve the MoMo payment prompt to complete the fee.
            </div>
          </div>
        )}

        {phase === "paid" && (
          <div className="py-6 text-center space-y-2">
            <Check className="mx-auto h-8 w-8 text-green-600" />
            <div className="font-medium">Fee paid</div>
            <div className="text-sm text-muted-foreground">
              Have a great trip!
            </div>
            <Button className="w-full" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        )}

        {phase === "failed" && (
          <div className="py-4 space-y-3">
            <div className="flex items-start gap-2 text-sm">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="text-muted-foreground">
                {failureReason ?? "MoMo payment didn't go through."}
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setPhase("idle")}
            >
              Try again
            </Button>
            {isDriver && (
              <Button
                variant="ghost"
                className="w-full"
                onClick={recordCashFallback}
                disabled={recordCash.isPending}
              >
                {recordCash.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Pay with cash instead
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
