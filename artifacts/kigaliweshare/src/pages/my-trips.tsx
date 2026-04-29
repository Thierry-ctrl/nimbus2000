import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListMyTrips,
  useListMyRecurringTrips,
  useDeleteRecurringTrip,
  getListMyTripsQueryKey,
  getListMyRecurringTripsQueryKey,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, formatTime, DAY_NAMES } from "@/lib/format";
import { Trash2, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function MyTripsPage() {
  const { data: upcoming = [] } = useListMyTrips({ scope: "upcoming" });
  const { data: past = [] } = useListMyTrips({ scope: "past" });
  const { data: recurring = [] } = useListMyRecurringTrips();
  const del = useDeleteRecurringTrip();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleDelete = async (id: string) => {
    await del.mutateAsync({ recurringId: id });
    queryClient.invalidateQueries({ queryKey: getListMyRecurringTripsQueryKey() });
    toast({ title: "Schedule removed" });
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-serif font-bold">My trips</h2>
          <Link href="/post-trip">
            <Button size="sm">Post new</Button>
          </Link>
        </div>
        <Tabs defaultValue="upcoming">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="recurring">Recurring</TabsTrigger>
            <TabsTrigger value="past">Past</TabsTrigger>
          </TabsList>
          <TabsContent value="upcoming" className="space-y-2 mt-3">
            {upcoming.length === 0 && <Empty label="No upcoming trips." />}
            {upcoming.map((t) => (
              <Link key={t.id} href={`/trips/${t.id}`}>
                <Card className="hover:border-primary transition cursor-pointer">
                  <CardContent className="py-4 space-y-2">
                    <div className="flex justify-between items-start">
                      <div className="font-semibold">
                        {t.originName} → {t.destinationName}
                      </div>
                      <StatusBadge status={t.status} />
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatDate(t.departureDate)} · {formatTime(t.departureTime)} ·{" "}
                      {t.seatsRemaining}/{t.seatsTotal} seats open
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </TabsContent>
          <TabsContent value="recurring" className="space-y-2 mt-3">
            {recurring.length === 0 && <Empty label="No recurring schedules yet." />}
            {recurring.map((r) => (
              <Card key={r.id}>
                <CardContent className="py-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold">
                        {r.originName} → {r.destinationName}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatTime(r.departureTime)} (±{r.flexMinutes}m) ·{" "}
                        {r.seats} seats
                      </div>
                      <div className="flex gap-1 mt-2">
                        {r.daysOfWeek.map((d) => (
                          <Badge key={d} variant="outline" className="text-xs">
                            {DAY_NAMES[d]}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(r.id)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
          <TabsContent value="past" className="space-y-2 mt-3">
            {past.length === 0 && <Empty label="No past trips." />}
            {past.map((t) => (
              <Link key={t.id} href={`/trips/${t.id}`}>
                <Card className="hover:border-primary transition cursor-pointer opacity-90">
                  <CardContent className="py-4 space-y-2">
                    <div className="flex justify-between items-start">
                      <div className="font-semibold">
                        {t.originName} → {t.destinationName}
                      </div>
                      <StatusBadge status={t.status} />
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatDate(t.departureDate)} · {formatTime(t.departureTime)}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">
        {label}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    scheduled: "bg-primary/10 text-primary border-primary/30",
    in_progress: "bg-secondary/15 text-secondary border-secondary/40",
    completed: "bg-muted text-muted-foreground border-border",
    cancelled: "bg-destructive/10 text-destructive border-destructive/30",
  };
  return (
    <Badge variant="outline" className={map[status] || ""}>
      {status.replace("_", " ")}
    </Badge>
  );
}
