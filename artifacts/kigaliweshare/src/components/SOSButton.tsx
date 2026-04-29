import { useEffect, useRef, useState } from "react";
import { Phone, ShieldAlert, Share2, Copy, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  useGetMyProfile,
  useGetPublicConfig,
  type Trip,
} from "@workspace/api-client-react";

const COUNTDOWN_SECONDS = 5;

export type SOSTrip = Trip & { vehicle?: { plate?: string | null } | null };

export function SOSButton({ currentTrip }: { currentTrip?: SOSTrip }) {
  const { data: profile } = useGetMyProfile();
  const { data: config } = useGetPublicConfig();
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);

  const emergencyNumber = config?.rnpEmergencyNumber || "112";
  const emergencyContactPhone = profile?.emergencyContactPhone;
  const emergencyContactName = profile?.emergencyContactName || "Emergency Contact";

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      window.location.href = `tel:${emergencyNumber}`;
      setCountdown(null);
      return;
    }
    timerRef.current = window.setTimeout(() => setCountdown((c) => (c ?? 1) - 1), 1000);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [countdown, emergencyNumber]);

  const startCountdown = () => setCountdown(COUNTDOWN_SECONDS);
  const cancelCountdown = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setCountdown(null);
  };

  const handleCopyDetails = () => {
    if (!currentTrip) return;
    const details = `My KigaliWeShare Trip Details:\nTrip ID: ${currentTrip.id}\nStatus: ${currentTrip.status}\nRoute: ${currentTrip.originName} to ${currentTrip.destinationName}\nDriver: ${currentTrip.driverName || "Unknown"}\nVehicle Plate: ${currentTrip.vehicle?.plate || "Unknown"}`;
    navigator.clipboard.writeText(details);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getWhatsAppLink = () => {
    if (!emergencyContactPhone) return "";
    const formattedPhone = emergencyContactPhone.replace(/\D/g, "");
    const message = encodeURIComponent(
      `URGENT: I need help. I am on a KigaliWeShare trip.${
        currentTrip
          ? `\nRoute: ${currentTrip.originName} to ${currentTrip.destinationName}\nVehicle: ${currentTrip.vehicle?.plate || "Unknown"}`
          : ""
      }`,
    );
    return `https://wa.me/${formattedPhone}?text=${message}`;
  };

  return (
    <Sheet onOpenChange={(open) => !open && cancelCountdown()}>
      <SheetTrigger asChild>
        <Button
          variant="destructive"
          size="icon"
          className="fixed bottom-20 right-4 h-12 w-12 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all z-50 flex items-center justify-center bg-red-600 hover:bg-red-700"
          aria-label="Emergency SOS"
        >
          <ShieldAlert className="h-6 w-6 text-white" />
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl px-6 pb-8 pt-6">
        <SheetHeader className="mb-6 text-left">
          <SheetTitle className="text-2xl font-bold text-destructive flex items-center gap-2">
            <ShieldAlert className="h-6 w-6" />
            Emergency SOS
          </SheetTitle>
          <SheetDescription className="text-base">
            Get immediate help or share your trip details.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4">
          {countdown === null ? (
            <Button
              className="w-full h-14 text-lg justify-start bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={startCountdown}
            >
              <Phone className="mr-3 h-5 w-5" />
              Call Police ({emergencyNumber})
            </Button>
          ) : (
            <div className="rounded-xl border-2 border-destructive bg-destructive/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative h-12 w-12 rounded-full bg-destructive flex items-center justify-center text-white font-bold text-xl">
                    {countdown}
                  </div>
                  <div>
                    <div className="font-bold text-destructive">Calling police in {countdown}s</div>
                    <div className="text-xs text-muted-foreground">Tap cancel if this is a mistake</div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="lg"
                  className="border-2 border-destructive text-destructive hover:bg-destructive hover:text-white"
                  onClick={cancelCountdown}
                >
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {emergencyContactPhone && (
            <Button
              className="w-full h-14 text-lg justify-start bg-green-600 hover:bg-green-700 text-white"
              asChild
            >
              <a href={getWhatsAppLink()} target="_blank" rel="noopener noreferrer">
                <Share2 className="mr-3 h-5 w-5" />
                Message {emergencyContactName}
              </a>
            </Button>
          )}

          {currentTrip && (
            <Button
              variant="outline"
              className="w-full h-14 text-lg justify-start border-2"
              onClick={handleCopyDetails}
            >
              {copied ? <Check className="mr-3 h-5 w-5 text-green-600" /> : <Copy className="mr-3 h-5 w-5" />}
              {copied ? "Copied to clipboard!" : "Copy Trip Details"}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
