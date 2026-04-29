import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateTrip,
  useCreateRecurringTrip,
  useListNeighborhoods,
  useGetQuickPostDefaults,
  useGetMyProfile,
  getListMyTripsQueryKey,
  getListMyRecurringTripsQueryKey,
  getGetMyProfileQueryKey,
  getGetQuickPostDefaultsQueryKey,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { DAY_NAMES } from "@/lib/format";

export default function PostTripPage() {
  const [, setLocation] = useLocation();
  const { data: neighborhoods = [] } = useListNeighborhoods();
  const createTrip = useCreateTrip();
  const createRecurring = useCreateRecurringTrip();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const today = new Date().toISOString().slice(0, 10);
  const search = typeof window !== "undefined" ? window.location.search : "";
  const isLeavingNow = new URLSearchParams(search).get("leavingNow") === "1";

  const [originId, setOriginId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [departureDate, setDepartureDate] = useState(today);
  const initialTime = (() => {
    if (!isLeavingNow) return "07:30";
    const d = new Date(Date.now() + 5 * 60 * 1000);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  })();
  const [departureTime, setDepartureTime] = useState(initialTime);
  const [windowEndTime, setWindowEndTime] = useState("");
  const [pickupPoint, setPickupPoint] = useState("");
  const [flexMinutes, setFlexMinutes] = useState<number>(isLeavingNow ? 15 : 10);
  const [seats, setSeats] = useState<number>(3);
  const [sameGenderOnly, setSameGenderOnly] = useState(false);
  const [notes, setNotes] = useState("");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [lastPostedTrip, setLastPostedTrip] = useState<{
    originId: string;
    destinationId: string;
    originName: string;
    destinationName: string;
  } | null>(null);

  const { data: profile } = useGetMyProfile({
    query: { retry: false, queryKey: getGetMyProfileQueryKey() },
  });
  const { data: defaults } = useGetQuickPostDefaults({
    query: {
      enabled: profile?.role === "driver" || profile?.role === "both",
      queryKey: getGetQuickPostDefaultsQueryKey(),
    },
  });

  useEffect(() => {
    if (defaults) {
      if (!originId && defaults.originId) setOriginId(defaults.originId);
      if (!destinationId && defaults.destinationId)
        setDestinationId(defaults.destinationId);
    } else if (profile?.homePickupPoint && !pickupPoint) {
      setPickupPoint(profile.homePickupPoint);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaults, profile?.homePickupPoint]);

  const handleOneOff = async () => {
    if (!originId || !destinationId) {
      toast({ title: "Pick origin and destination", variant: "destructive" });
      return;
    }
    if (originId === destinationId) {
      toast({ title: "Origin and destination must differ", variant: "destructive" });
      return;
    }
    try {
      const created = await createTrip.mutateAsync({
        data: {
          originId,
          destinationId,
          departureDate,
          departureTime,
          windowEndTime: windowEndTime || null,
          pickupPoint: pickupPoint || null,
          flexMinutes: flexMinutes as 5 | 10 | 15,
          seats,
          sameGenderOnly,
          notes: notes || null,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListMyTripsQueryKey() });
      toast({ title: "Trip posted" });
      setLastPostedTrip({
        originId: created.originId,
        destinationId: created.destinationId,
        originName: created.originName ?? "",
        destinationName: created.destinationName ?? "",
      });
    } catch {
      toast({ title: "Could not post trip", variant: "destructive" });
    }
  };

  const postReverseTrip = () => {
    if (!lastPostedTrip) return;
    setOriginId(lastPostedTrip.destinationId);
    setDestinationId(lastPostedTrip.originId);
    setDepartureTime("17:30");
    setWindowEndTime("");
    setLastPostedTrip(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleRecurring = async () => {
    if (!originId || !destinationId || days.length === 0) {
      toast({ title: "Pick route and at least one day", variant: "destructive" });
      return;
    }
    try {
      await createRecurring.mutateAsync({
        data: {
          originId,
          destinationId,
          daysOfWeek: days,
          departureTime,
          flexMinutes: flexMinutes as 5 | 10 | 15,
          seats,
          sameGenderOnly,
          notes: notes || null,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListMyRecurringTripsQueryKey() });
      toast({ title: "Recurring schedule saved" });
      setLocation("/my-trips");
    } catch {
      toast({ title: "Could not save schedule", variant: "destructive" });
    }
  };

  const SharedFields = (
    <Card>
      <CardContent className="py-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>From</Label>
            <Select value={originId} onValueChange={setOriginId}>
              <SelectTrigger><SelectValue placeholder="Origin" /></SelectTrigger>
              <SelectContent>
                {neighborhoods.map((n) => (
                  <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Select value={destinationId} onValueChange={setDestinationId}>
              <SelectTrigger><SelectValue placeholder="Destination" /></SelectTrigger>
              <SelectContent>
                {neighborhoods.map((n) => (
                  <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Departure</Label>
            <Input type="time" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Window end</Label>
            <Input
              type="time"
              value={windowEndTime}
              onChange={(e) => setWindowEndTime(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Flex</Label>
            <Select value={String(flexMinutes)} onValueChange={(v) => setFlexMinutes(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[5, 10, 15].map((n) => (
                  <SelectItem key={n} value={String(n)}>±{n} min</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Seats</Label>
            <Select value={String(seats)} onValueChange={(v) => setSeats(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3">
            <Label className="text-sm font-normal cursor-pointer">Same-gender only</Label>
            <Switch checked={sameGenderOnly} onCheckedChange={setSameGenderOnly} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Pickup landmark (optional)</Label>
          <Input
            value={pickupPoint}
            onChange={(e) => setPickupPoint(e.target.value)}
            placeholder="e.g. Simba Cafe Remera"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Notes (optional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Where exactly do you pick up? Any small luggage?"
          />
        </div>
      </CardContent>
    </Card>
  );

  return (
    <AppLayout>
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-serif font-bold">
            {isLeavingNow ? "Leaving now" : "Post a trip"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isLeavingNow
              ? "Quick post for a trip starting in the next 15 minutes."
              : "Share your commute so neighbors can request a seat."}
          </p>
        </div>
        {lastPostedTrip && (
          <Card className="border-secondary/40 bg-secondary/5">
            <CardContent className="py-4 flex flex-col gap-3">
              <div>
                <div className="font-semibold">
                  Going back later? Post the reverse trip in one tap.
                </div>
                <div className="text-sm text-muted-foreground">
                  {lastPostedTrip.destinationName} → {lastPostedTrip.originName}
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={postReverseTrip} className="flex-1">
                  Post reverse trip
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setLocation("/my-trips")}
                >
                  Done
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        <Tabs defaultValue="one-off">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="one-off">One-off</TabsTrigger>
            <TabsTrigger value="recurring">Weekly</TabsTrigger>
          </TabsList>
          <TabsContent value="one-off" className="space-y-3 mt-3">
            <Card>
              <CardContent className="py-4 space-y-3">
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={departureDate}
                    onChange={(e) => setDepartureDate(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
            {SharedFields}
            <Button
              className="w-full h-12"
              onClick={handleOneOff}
              disabled={createTrip.isPending}
            >
              Post trip
            </Button>
          </TabsContent>
          <TabsContent value="recurring" className="space-y-3 mt-3">
            <Card>
              <CardContent className="py-4 space-y-2">
                <Label>Repeat on</Label>
                <div className="flex gap-1.5 flex-wrap">
                  {DAY_NAMES.map((name, idx) => {
                    const active = days.includes(idx);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() =>
                          setDays((d) =>
                            active ? d.filter((x) => x !== idx) : [...d, idx],
                          )
                        }
                        className={`px-3 py-2 rounded-lg text-sm font-medium border transition ${
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border bg-background hover:bg-muted"
                        }`}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
            {SharedFields}
            <Button
              className="w-full h-12"
              onClick={handleRecurring}
              disabled={createRecurring.isPending}
            >
              Save schedule
            </Button>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
