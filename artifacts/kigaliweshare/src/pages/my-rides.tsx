import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListMyRideRequests,
  useCancelRideRequest,
  getListMyRideRequestsQueryKey,
} from "@workspace/api-client-react";
import type { RideRequest } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, formatTime } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";

export default function MyRidesPage() {
  const { data: upcoming = [] } = useListMyRideRequests({ scope: "upcoming" });
  const { data: past = [] } = useListMyRideRequests({ scope: "past" });
  const cancel = useCancelRideRequest();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const onCancel = async (id: string) => {
    await cancel.mutateAsync({ requestId: id });
    queryClient.invalidateQueries({ queryKey: getListMyRideRequestsQueryKey() });
    toast({ title: "Request cancelled" });
  };

  const renderItem = (r: RideRequest, allowCancel: boolean) => (
    <Card key={r.id}>
      <CardContent className="py-4 space-y-2">
        <div className="flex justify-between items-start">
          <div className="font-semibold">
            {r.trip ? `${r.trip.originName} → ${r.trip.destinationName}` : "Trip"}
          </div>
          <Badge
            variant="outline"
            className={
              r.status === "approved"
                ? "border-primary text-primary"
                : r.status === "declined"
                  ? "border-destructive text-destructive"
                  : r.status === "cancelled"
                    ? "border-muted-foreground/40 text-muted-foreground"
                    : ""
            }
          >
            {r.status}
          </Badge>
        </div>
        {r.trip && (
          <div className="text-sm text-muted-foreground">
            {formatDate(r.trip.departureDate)} · {formatTime(r.trip.departureTime)} · with{" "}
            {r.trip.driverName}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          {r.tripId && (
            <Link href={`/trips/${r.tripId}`}>
              <Button variant="outline" size="sm">View trip</Button>
            </Link>
          )}
          {allowCancel && r.status !== "cancelled" && r.status !== "completed" && (
            <Button variant="ghost" size="sm" onClick={() => onCancel(r.id)}>
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <AppLayout>
      <div className="space-y-4">
        <h2 className="text-2xl font-serif font-bold">My rides</h2>
        <Tabs defaultValue="upcoming">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="past">Past</TabsTrigger>
          </TabsList>
          <TabsContent value="upcoming" className="space-y-2 mt-3">
            {upcoming.length === 0 && (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  You haven't requested any rides yet.{" "}
                  <Link href="/find" className="text-primary underline">
                    Find one
                  </Link>
                  .
                </CardContent>
              </Card>
            )}
            {upcoming.map((r) => renderItem(r, true))}
          </TabsContent>
          <TabsContent value="past" className="space-y-2 mt-3">
            {past.length === 0 && (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  No past rides.
                </CardContent>
              </Card>
            )}
            {past.map((r) => renderItem(r, false))}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
