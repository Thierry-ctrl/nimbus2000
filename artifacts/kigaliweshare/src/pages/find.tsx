import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useFindMatches,
  useListNeighborhoods,
  getFindMatchesQueryKey,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatDate, formatTime } from "@/lib/format";
import { ArrowRight, Search, Star } from "lucide-react";
import { CorridorMap } from "@/components/CorridorMap";

export default function FindPage() {
  const { data: neighborhoods = [] } = useListNeighborhoods();
  const today = new Date().toISOString().slice(0, 10);

  const [originId, setOriginId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [date, setDate] = useState(today);
  const [windowStart, setWindowStart] = useState("07:00");
  const [windowEnd, setWindowEnd] = useState("09:00");
  const [sameGenderOnly, setSameGenderOnly] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const params = useMemo(
    () => ({ originId, destinationId, date, windowStart, windowEnd, sameGenderOnly }),
    [originId, destinationId, date, windowStart, windowEnd, sameGenderOnly],
  );

  const enabled = submitted && !!originId && !!destinationId && originId !== destinationId;
  const { data, isFetching } = useFindMatches(params, {
    query: {
      enabled,
      queryKey: getFindMatchesQueryKey(params),
    },
  });
  const matches = data?.matches ?? [];
  const nearby = data?.nearby ?? [];

  return (
    <AppLayout>
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-serif font-bold">Find a ride</h2>
          <p className="text-sm text-muted-foreground">
            Pick your corridor and time window — we will rank neighbors heading
            the same way.
          </p>
        </div>

        <CorridorMap
          neighborhoods={neighborhoods}
          originId={originId}
          destinationId={destinationId}
        />

        <Card>
          <CardContent className="py-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">From</Label>
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
                <Label className="text-xs">To</Label>
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
            <div className="space-y-1.5">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Earliest</Label>
                <Input type="time" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Latest</Label>
                <Input type="time" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
              <Label className="text-sm font-normal cursor-pointer">
                Same-gender drivers only
              </Label>
              <Switch checked={sameGenderOnly} onCheckedChange={setSameGenderOnly} />
            </div>
            <Button
              className="w-full h-11"
              onClick={() => setSubmitted(true)}
              disabled={!originId || !destinationId || originId === destinationId}
            >
              <Search className="mr-2 h-4 w-4" /> Find matches
            </Button>
          </CardContent>
        </Card>

        {enabled && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">
                {isFetching ? "Searching…" : `${matches.length} matches`}
              </h3>
            </div>
            {!isFetching && matches.length === 0 && nearby.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No matches yet for this window. Try widening your time or
                  posting your own trip so others can join you.
                </CardContent>
              </Card>
            )}
            {nearby.length > 0 && (
              <div className="text-xs text-muted-foreground pt-2">
                Going near (not exactly to) your destination:
              </div>
            )}
            {nearby.map((n) => (
              <Link key={n.trip.id} href={`/trips/${n.trip.id}`}>
                <Card className="hover:border-primary transition cursor-pointer border-dashed">
                  <CardContent className="py-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">
                        {n.trip.originName} → {n.destinationName}
                      </div>
                      <Badge variant="secondary">
                        {n.proximityKm.toFixed(1)} km away
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-3 flex-wrap">
                      <span>{formatDate(n.trip.departureDate)}</span>
                      <span>·</span>
                      <span>{formatTime(n.trip.departureTime)} (±{n.trip.flexMinutes}m)</span>
                      <span>·</span>
                      <span>{n.trip.seatsRemaining}/{n.trip.seatsTotal} seats</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Get dropped near your destination · {n.trip.driverName}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
            {matches.map((m) => (
              <Link key={m.trip.id} href={`/trips/${m.trip.id}`}>
                <Card className="hover:border-primary transition cursor-pointer">
                  <CardContent className="py-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">
                        {m.trip.originName} → {m.trip.destinationName}
                      </div>
                      <Badge className="bg-primary text-primary-foreground">
                        {m.matchScore}% match
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-3 flex-wrap">
                      <span>{formatDate(m.trip.departureDate)}</span>
                      <span>·</span>
                      <span>{formatTime(m.trip.departureTime)} (±{m.trip.flexMinutes}m)</span>
                      <span>·</span>
                      <span>{m.trip.seatsRemaining}/{m.trip.seatsTotal} seats</span>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <div className="text-sm text-foreground flex items-center gap-2">
                        <span className="font-medium">{m.trip.driverName}</span>
                        {m.trip.driverRating != null && (
                          <span className="flex items-center text-xs text-muted-foreground">
                            <Star className="h-3 w-3 mr-0.5 fill-secondary text-secondary" />
                            {m.trip.driverRating.toFixed(1)}
                          </span>
                        )}
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
