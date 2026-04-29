import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetDashboardSummary,
  useGetRecentActivity,
  useListRatingPrompts,
  useDismissRatingPrompt,
  getListRatingPromptsQueryKey,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  Fuel,
  Star,
  Users,
  ArrowRight,
  AlertCircle,
  Zap,
  X,
} from "lucide-react";
import { formatRwf, formatDate, formatTime, relativeFromNow } from "@/lib/format";
import { KigaliSkyline } from "@/components/illustrations/KigaliSkyline";

export default function AppDashboard() {
  const { data: summary } = useGetDashboardSummary();
  const { data: activity = [] } = useGetRecentActivity();
  const { data: ratingPrompts = [] } = useListRatingPrompts();
  const dismissPrompt = useDismissRatingPrompt();
  const queryClient = useQueryClient();

  const driverEligible =
    summary?.role === "driver" || summary?.role === "both";

  const handleDismissPrompt = async (tripId: string) => {
    await dismissPrompt.mutateAsync({ tripId });
    queryClient.invalidateQueries({ queryKey: getListRatingPromptsQueryKey() });
  };

  return (
    <AppLayout>
      <div className="space-y-5">
        {ratingPrompts.length > 0 && (
          <Card className="border-secondary bg-secondary/10">
            <CardContent className="py-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold flex items-center gap-1">
                    <Star className="h-4 w-4 fill-secondary text-secondary" />
                    Rate your recent trip
                  </div>
                  <div className="text-sm text-muted-foreground">
                    How was your trip with {ratingPrompts[0].rateUserName}?
                    <br />
                    <span className="text-xs">{ratingPrompts[0].routeLabel}</span>
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 -mt-1 -mr-1"
                  onClick={() => handleDismissPrompt(ratingPrompts[0].tripId)}
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <Link href={`/trips/${ratingPrompts[0].tripId}`}>
                <Button className="w-full">Open trip to rate</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {summary?.profileStatus === "pending" && (
          <Card className="border-secondary bg-secondary/5">
            <CardContent className="flex gap-3 items-start py-4">
              <AlertCircle className="h-5 w-5 text-secondary mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-semibold text-foreground">
                  Verification pending
                </p>
                <p className="text-muted-foreground">
                  You can browse but your ride requests are paused until your
                  community organizer verifies you.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="relative overflow-hidden rounded-2xl">
          <KigaliSkyline className="w-full h-auto" />
          <div className="absolute inset-0 flex flex-col justify-end p-4">
            <div className="bg-background/85 backdrop-blur-sm rounded-xl px-3 py-2 inline-block max-w-fit">
              <h2 className="text-xl font-serif font-bold text-foreground leading-tight">
                Karibu
              </h2>
              <p className="text-muted-foreground text-xs">
                Your neighborhood carpool, at a glance.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-primary text-primary-foreground border-primary">
            <CardContent className="py-4 space-y-1">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-80">
                <Fuel className="h-3.5 w-3.5" /> Fuel saved this month
              </div>
              <div className="text-2xl font-bold">
                {formatRwf(summary?.fuelSavedRwfThisMonth)}
              </div>
              <div className="text-xs opacity-80">
                {summary?.kmSharedThisMonth ?? 0} km shared
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 space-y-1">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <Star className="h-3.5 w-3.5" /> Your rating
              </div>
              <div className="text-2xl font-bold text-foreground">
                {summary?.averageRating
                  ? summary.averageRating.toFixed(1)
                  : "—"}
              </div>
              <div className="text-xs text-muted-foreground">
                {(summary?.completedTripsAsDriver ?? 0) +
                  (summary?.completedTripsAsRider ?? 0)}{" "}
                completed trips
              </div>
            </CardContent>
          </Card>
        </div>

        {summary?.nextTrip && (
          <Card>
            <CardContent className="py-4 space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="border-primary text-primary">
                  Driving next
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {summary.pendingRequestsForMyTrips} pending request
                  {summary.pendingRequestsForMyTrips === 1 ? "" : "s"}
                </span>
              </div>
              <div>
                <div className="font-semibold text-foreground">
                  {summary.nextTrip.originName} → {summary.nextTrip.destinationName}
                </div>
                <div className="text-sm text-muted-foreground">
                  {formatDate(summary.nextTrip.departureDate)} ·{" "}
                  {formatTime(summary.nextTrip.departureTime)} · {summary.nextTrip.seatsRemaining}/
                  {summary.nextTrip.seatsTotal} seats open
                </div>
              </div>
              <Link href={`/trips/${summary.nextTrip.id}`}>
                <Button variant="outline" className="w-full">
                  Open trip <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {summary?.nextRide?.trip && (
          <Card>
            <CardContent className="py-4 space-y-3">
              <Badge variant="outline">Riding next</Badge>
              <div>
                <div className="font-semibold text-foreground">
                  {summary.nextRide.trip.originName} → {summary.nextRide.trip.destinationName}
                </div>
                <div className="text-sm text-muted-foreground">
                  {formatDate(summary.nextRide.trip.departureDate)} ·{" "}
                  {formatTime(summary.nextRide.trip.departureTime)} · with {summary.nextRide.trip.driverName}
                </div>
              </div>
              <Link href={`/trips/${summary.nextRide.trip.id}`}>
                <Button variant="outline" className="w-full">
                  Trip details <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Link href="/find">
            <Card className="hover:border-primary transition cursor-pointer">
              <CardContent className="py-5 flex flex-col items-start gap-2">
                <Users className="h-5 w-5 text-primary" />
                <div className="font-semibold">Find a ride</div>
                <div className="text-xs text-muted-foreground">
                  Match with a neighbor
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/post-trip">
            <Card className="hover:border-primary transition cursor-pointer">
              <CardContent className="py-5 flex flex-col items-start gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                <div className="font-semibold">Post a trip</div>
                <div className="text-xs text-muted-foreground">
                  Share your commute
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {driverEligible && (
          <Link href="/post-trip?leavingNow=1">
            <Card className="hover:border-secondary transition cursor-pointer border-secondary/50 bg-secondary/5">
              <CardContent className="py-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-secondary/20 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-secondary" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold">Leaving now</div>
                  <div className="text-xs text-muted-foreground">
                    Quick post — uses your most-used route
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        )}

        <div className="space-y-2">
          <h3 className="font-semibold text-foreground">Recent activity</h3>
          {activity.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Nothing yet — post your first trip or find a ride to get started.
              </CardContent>
            </Card>
          )}
          <div className="space-y-2">
            {activity.slice(0, 8).map((a) => (
              <div
                key={a.id}
                className="flex items-start gap-3 p-3 bg-card border border-border rounded-lg"
              >
                <div className="w-2 h-2 mt-2 rounded-full bg-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    {a.title}
                  </div>
                  {a.subtitle && (
                    <div className="text-xs text-muted-foreground truncate">
                      {a.subtitle}
                    </div>
                  )}
                  <div className="text-[11px] text-muted-foreground/80">
                    {relativeFromNow(a.occurredAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
