import { useState } from "react";
import { Link, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetTrip,
  useCreateRideRequest,
  useApproveRideRequest,
  useDeclineRideRequest,
  useCancelTrip,
  useStartTrip,
  useCompleteTrip,
  useCreateRating,
  useGetMyProfile,
  getGetTripQueryKey,
  getGetMyProfileQueryKey,
  getListMyTripsQueryKey,
  getListMyRideRequestsQueryKey,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Star, Phone, ArrowLeft, MessageCircle, Flag, ShieldCheck } from "lucide-react";
import { formatDate, formatTime } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { ReportUserDialog } from "@/components/ReportUserDialog";

export default function TripDetailPage() {
  const [, params] = useRoute("/trips/:tripId");
  const tripId = params?.tripId ?? "";
  const { data: trip, isLoading } = useGetTrip(tripId, {
    query: { enabled: !!tripId, queryKey: getGetTripQueryKey(tripId) },
  });
  const { data: me } = useGetMyProfile({
    query: { retry: false, queryKey: getGetMyProfileQueryKey() },
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createReq = useCreateRideRequest();
  const approveReq = useApproveRideRequest();
  const declineReq = useDeclineRideRequest();
  const cancelTrip = useCancelTrip();
  const startTrip = useStartTrip();
  const completeTrip = useCompleteTrip();
  const createRating = useCreateRating();

  const [pickupPoint, setPickupPoint] = useState("");
  const [reqNotes, setReqNotes] = useState("");
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getGetTripQueryKey(tripId) });
    queryClient.invalidateQueries({ queryKey: getListMyTripsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListMyRideRequestsQueryKey() });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="text-sm text-muted-foreground">Loading…</div>
      </AppLayout>
    );
  }
  if (!trip) {
    return (
      <AppLayout>
        <div className="text-sm text-muted-foreground">Trip not found.</div>
      </AppLayout>
    );
  }

  const isDriver = me?.userId === trip.driverId;
  const myReq = trip.requests?.find((r) => r.riderId === me?.userId);
  const canRequest = !isDriver && !myReq && trip.status === "scheduled" && trip.seatsRemaining > 0;
  const canRate =
    trip.status === "completed" &&
    !!me &&
    ((isDriver && (trip.requests ?? []).some((r) => r.status === "completed" || r.status === "approved")) ||
      (!isDriver && myReq && (myReq.status === "completed" || myReq.status === "approved")));

  const submitRequest = async () => {
    try {
      await createReq.mutateAsync({
        data: { tripId: trip.id, pickupPoint: pickupPoint || null, notes: reqNotes || null },
      });
      toast({ title: "Request sent" });
      setPickupPoint("");
      setReqNotes("");
      refresh();
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      toast({
        title: err?.response?.data?.error || "Could not send request",
        variant: "destructive",
      });
    }
  };

  const submitRating = async (toUserId: string) => {
    try {
      await createRating.mutateAsync({
        data: { tripId: trip.id, toUserId, stars, comment: comment || null },
      });
      toast({ title: "Thanks for rating" });
      setComment("");
    } catch {
      toast({ title: "Already rated", variant: "destructive" });
    }
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <Link href="/app">
          <Button variant="ghost" size="sm" className="-ml-2">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
        </Link>

        <Card>
          <CardContent className="py-5 space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-xl font-serif font-bold">
                  {trip.originName} → {trip.destinationName}
                </div>
                <div className="text-sm text-muted-foreground">
                  {formatDate(trip.departureDate)} · {formatTime(trip.departureTime)} (±
                  {trip.flexMinutes}m)
                </div>
              </div>
              <Badge variant="outline">{trip.status.replace("_", " ")}</Badge>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Seats: </span>
              <span className="font-medium">
                {trip.seatsRemaining}/{trip.seatsTotal} open
              </span>
              {trip.sameGenderOnly && (
                <span className="ml-2 text-secondary text-xs font-medium">
                  Same-gender only
                </span>
              )}
            </div>
            {trip.notes && (
              <div className="text-sm bg-muted/50 rounded-md p-3">{trip.notes}</div>
            )}
          </CardContent>
        </Card>

        {trip.fuelShare && trip.fuelShare.fuelCostRwf > 0 && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="py-4 space-y-2">
              <div className="text-xs uppercase text-muted-foreground tracking-wide">
                Suggested fuel contribution
              </div>
              {isDriver ? (
                <>
                  <div className="text-2xl font-serif font-bold">
                    You pay ~{trip.fuelShare.driverPaysRwf.toLocaleString()} RWF
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Trip fuel cost ~{trip.fuelShare.fuelCostRwf.toLocaleString()} RWF.
                    Riders chip in {trip.fuelShare.perPassengerRwf.toLocaleString()} RWF each
                    ({Math.max(0, trip.seatsTotal - trip.seatsRemaining)} so far).
                  </div>
                </>
              ) : (
                <>
                  <div className="text-2xl font-serif font-bold">
                    {trip.fuelShare.perPassengerRwf > 0
                      ? `~${trip.fuelShare.perPassengerRwf.toLocaleString()} RWF`
                      : "Friendly lift — no contribution suggested"}
                  </div>
                  {trip.fuelShare.perPassengerRwf > 0 && (
                    <div className="text-sm text-muted-foreground">
                      {trip.fuelShare.distanceKm} km · {trip.fuelShare.consumptionLPer100Km} L/100 km · {trip.fuelShare.pricePerLitreRwf.toLocaleString()} RWF/L
                      {" "}÷ {trip.seatsTotal + 1} seats (driver + {trip.seatsTotal} riders)
                    </div>
                  )}
                </>
              )}
              <div className="text-xs text-muted-foreground pt-1">
                KigaliWeShare doesn't process payments. Pay the driver directly via MoMo or cash. This is a friendly cost-share between neighbours, not a fare.
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="py-4 space-y-2">
            <div className="text-xs uppercase text-muted-foreground tracking-wide">
              Driver
            </div>
            <div className="flex justify-between">
              <div>
                <div className="font-semibold">{trip.driverName}</div>
                {trip.driverRating != null && (
                  <div className="text-xs text-muted-foreground flex items-center">
                    <Star className="h-3 w-3 mr-0.5 fill-secondary text-secondary" />
                    {trip.driverRating.toFixed(1)}
                  </div>
                )}
              </div>
              {trip.driverPhone && (
                <div className="flex flex-col items-end gap-1">
                  <a
                    href={`tel:${trip.driverPhone}`}
                    className="text-primary text-sm flex items-center gap-1"
                  >
                    <Phone className="h-4 w-4" /> {trip.driverPhone}
                  </a>
                  <a
                    href={`https://wa.me/${trip.driverPhone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi, I'm your KigaliWeShare rider for ${trip.originName}→${trip.destinationName} at ${trip.departureTime}.`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-600 text-xs flex items-center gap-1"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                </div>
              )}
            </div>
            {!isDriver && me && (
              <div className="pt-2 border-t border-border flex items-center justify-between">
                {(trip as { driverIdVerified?: boolean }).driverIdVerified && (
                  <div className="text-xs text-emerald-700 flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5" /> ID verified
                  </div>
                )}
                <ReportUserDialog
                  reportedUserId={trip.driverId}
                  reportedName={trip.driverName ?? "Driver"}
                  tripId={trip.id}
                  trigger={
                    <Button variant="ghost" size="sm" className="text-muted-foreground">
                      <Flag className="h-3.5 w-3.5 mr-1" /> Report
                    </Button>
                  }
                />
              </div>
            )}
            {trip.vehicle && (
              <div className="text-sm text-muted-foreground pt-2 border-t border-border">
                {trip.vehicle.color} {trip.vehicle.make} {trip.vehicle.model} ·{" "}
                <span className="font-mono font-semibold text-foreground">
                  {trip.vehicle.plate}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {canRequest && (
          <Card>
            <CardContent className="py-4 space-y-3">
              <div className="font-semibold">Request a seat</div>
              <div className="space-y-1.5">
                <Label className="text-xs">Pickup landmark</Label>
                <Input
                  value={pickupPoint}
                  onChange={(e) => setPickupPoint(e.target.value)}
                  placeholder="e.g. Simba Cafe Remera"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Note to driver</Label>
                <Textarea
                  value={reqNotes}
                  onChange={(e) => setReqNotes(e.target.value)}
                  placeholder="Anything they should know"
                />
              </div>
              <Button className="w-full" onClick={submitRequest} disabled={createReq.isPending}>
                Send request
              </Button>
            </CardContent>
          </Card>
        )}

        {!isDriver && myReq && (
          <Card>
            <CardContent className="py-4">
              <div className="text-sm">
                Your request status:{" "}
                <Badge variant="outline" className="ml-1">
                  {myReq.status}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {isDriver && (trip.requests?.length ?? 0) > 0 && (
          <div className="space-y-2">
            <h3 className="font-semibold">Ride requests</h3>
            {trip.requests!.map((r) => (
              <Card key={r.id}>
                <CardContent className="py-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold">{r.riderName}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.riderNeighborhood} ·{" "}
                        {r.riderRating != null ? `${r.riderRating.toFixed(1)}★` : "no ratings yet"}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        r.status === "approved"
                          ? "border-primary text-primary"
                          : r.status === "declined"
                            ? "border-destructive text-destructive"
                            : ""
                      }
                    >
                      {r.status}
                    </Badge>
                  </div>
                  {r.pickupPoint && (
                    <div className="text-sm">Pickup: {r.pickupPoint}</div>
                  )}
                  {r.notes && <div className="text-sm text-muted-foreground">{r.notes}</div>}
                  {r.status === "approved" && r.riderPhone && (
                    <div className="text-sm">
                      <a className="text-primary underline" href={`tel:${r.riderPhone}`}>
                        {r.riderPhone}
                      </a>
                    </div>
                  )}
                  {r.status === "pending" && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={async () => {
                          await approveReq.mutateAsync({ requestId: r.id });
                          toast({ title: "Approved" });
                          refresh();
                        }}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await declineReq.mutateAsync({ requestId: r.id });
                          toast({ title: "Declined" });
                          refresh();
                        }}
                      >
                        Decline
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {isDriver && trip.status === "scheduled" && (
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                await startTrip.mutateAsync({ tripId: trip.id });
                refresh();
              }}
            >
              Start trip
            </Button>
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={async () => {
                await cancelTrip.mutateAsync({ tripId: trip.id, data: {} });
                toast({ title: "Trip cancelled" });
                refresh();
              }}
            >
              Cancel
            </Button>
          </div>
        )}
        {isDriver && trip.status === "in_progress" && (
          <Button
            className="w-full"
            onClick={async () => {
              await completeTrip.mutateAsync({ tripId: trip.id });
              toast({ title: "Trip completed" });
              refresh();
            }}
          >
            Mark completed
          </Button>
        )}

        {canRate && (
          <Card>
            <CardContent className="py-4 space-y-3">
              <div className="font-semibold">Rate your trip</div>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setStars(n)}
                    className="p-1"
                  >
                    <Star
                      className={`h-7 w-7 ${
                        n <= stars ? "fill-secondary text-secondary" : "text-muted-foreground"
                      }`}
                    />
                  </button>
                ))}
              </div>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Optional comment"
              />
              {isDriver
                ? (trip.requests ?? [])
                    .filter((r) => r.status === "completed" || r.status === "approved")
                    .map((r) => (
                      <Button
                        key={r.id}
                        variant="outline"
                        className="w-full"
                        onClick={() => submitRating(r.riderId)}
                      >
                        Rate {r.riderName}
                      </Button>
                    ))
                : (
                  <Button className="w-full" onClick={() => submitRating(trip.driverId)}>
                    Rate {trip.driverName}
                  </Button>
                )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
