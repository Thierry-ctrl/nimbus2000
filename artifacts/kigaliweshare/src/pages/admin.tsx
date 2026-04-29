import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAdminStats,
  useListAdminUsers,
  useVerifyUser,
  useListInvites,
  useCreateInvite,
  useUpdateConfig,
  useGetPublicConfig,
  useListNeighborhoods,
  useListCorridors,
  useCreateAdminNeighborhood,
  useDeleteAdminNeighborhood,
  useCreateAdminCorridor,
  useDeleteAdminCorridor,
  useListAdminReports,
  useUpdateAdminReport,
  useGetInviteAnalytics,
  useSetUserIdVerified,
  getExportUsersCsvUrl,
  getExportTripsCsvUrl,
  getGetAdminStatsQueryKey,
  getListAdminUsersQueryKey,
  getListInvitesQueryKey,
  getGetPublicConfigQueryKey,
  getListNeighborhoodsQueryKey,
  getListCorridorsQueryKey,
  getListAdminReportsQueryKey,
} from "@workspace/api-client-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useIsAdmin } from "@/lib/auth-utils";
import { formatRwf } from "@/lib/format";
import { Redirect } from "wouter";

export default function AdminPage() {
  const isAdmin = useIsAdmin();
  if (!isAdmin) {
    return (
      <AppLayout>
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <div className="font-semibold">Admin only</div>
            <div className="text-sm text-muted-foreground">
              Ask the pilot operator to grant you access.
            </div>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }
  return <AdminConsole />;
}

function AdminConsole() {
  const { data: stats } = useGetAdminStats();
  const { data: users = [] } = useListAdminUsers({ status: "all" });
  const { data: invites = [] } = useListInvites();
  const { data: cfg } = useGetPublicConfig();
  const { data: inviteAnalytics } = useGetInviteAnalytics();
  const { data: reports = [] } = useListAdminReports({ status: "open" });
  const verify = useVerifyUser();
  const setIdVerified = useSetUserIdVerified();
  const updateReport = useUpdateAdminReport();
  const createInvite = useCreateInvite();
  const updateConfig = useUpdateConfig();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [label, setLabel] = useState("");
  const [count, setCount] = useState(5);
  const [maxUses, setMaxUses] = useState(1);
  const [fuelPrice, setFuelPrice] = useState<number | "">("");
  const [dieselPrice, setDieselPrice] = useState<number | "">("");
  const [consumption, setConsumption] = useState<number | "">("");

  const refreshUsers = () =>
    queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey({ status: "all" }) });

  return (
    <AppLayout>
      <div className="space-y-4">
        <h2 className="text-2xl font-serif font-bold">Pilot console</h2>

        <Tabs defaultValue="stats">
          <TabsList className="grid grid-cols-6 w-full">
            <TabsTrigger value="stats" className="text-xs px-1">Stats</TabsTrigger>
            <TabsTrigger value="users" className="text-xs px-1">Users</TabsTrigger>
            <TabsTrigger value="reports" className="text-xs px-1">
              Reports{reports.length > 0 ? ` (${reports.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="invites" className="text-xs px-1">Invites</TabsTrigger>
            <TabsTrigger value="places" className="text-xs px-1">Places</TabsTrigger>
            <TabsTrigger value="config" className="text-xs px-1">Config</TabsTrigger>
          </TabsList>

          <TabsContent value="stats" className="space-y-3 mt-3">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Total users" value={stats?.totalUsers ?? 0} />
              <Stat label="Verified" value={stats?.verifiedUsers ?? 0} />
              <Stat label="Pending" value={stats?.pendingUsers ?? 0} />
              <Stat label="Weekly active" value={stats?.weeklyActiveUsers ?? 0} />
              <Stat label="Rides this week" value={stats?.ridesCompletedThisWeek ?? 0} />
              <Stat label="Matches/day" value={stats?.matchesPerDay ?? 0} />
              <Stat label="No-show rate" value={`${stats?.noShowRatePct ?? 0}%`} />
              <Stat label="Total fuel saved" value={formatRwf(stats?.totalFuelSavedRwf ?? 0)} />
            </div>
            {(stats?.ridesByCorridor?.length ?? 0) > 0 && (
              <Card>
                <CardContent className="py-4 space-y-2">
                  <div className="font-semibold text-sm">Rides by corridor</div>
                  {stats!.ridesByCorridor!.map((r) => (
                    <div key={r.corridorLabel} className="flex justify-between text-sm">
                      <span>{r.corridorLabel}</span>
                      <span className="font-medium">{r.rides}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            <Card>
              <CardContent className="py-4 space-y-2">
                <div className="font-semibold text-sm">Data exports</div>
                <div className="grid grid-cols-2 gap-2">
                  <Button asChild size="sm" variant="outline">
                    <a href={getExportUsersCsvUrl()} download>
                      Users CSV
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <a href={getExportTripsCsvUrl()} download>
                      Trips CSV
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="space-y-2 mt-3">
            {users.map((u) => (
              <Card key={u.userId}>
                <CardContent className="py-3 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold">{u.fullName}</div>
                      <div className="text-xs text-muted-foreground">
                        {u.role} · {u.neighborhoodName} · {u.employer || "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {u.phone} · {u.completedTrips} trips ·{" "}
                        {u.averageRating ? `${u.averageRating.toFixed(1)}★` : "no rating"}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        u.status === "verified"
                          ? "border-primary text-primary"
                          : u.status === "pending"
                            ? "border-secondary text-secondary"
                            : "border-destructive text-destructive"
                      }
                    >
                      {u.status}
                    </Badge>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant={u.idVerified ? "secondary" : "outline"}
                      onClick={async () => {
                        await setIdVerified.mutateAsync({
                          userId: u.userId,
                          data: { idVerified: !u.idVerified },
                        });
                        refreshUsers();
                        toast({
                          title: u.idVerified ? "ID badge removed" : "ID verified",
                        });
                      }}
                    >
                      {u.idVerified ? "ID ✓" : "Mark ID verified"}
                    </Button>
                    {u.status !== "verified" && (
                      <Button
                        size="sm"
                        onClick={async () => {
                          await verify.mutateAsync({
                            userId: u.userId,
                            data: { status: "verified" },
                          });
                          refreshUsers();
                          toast({ title: "Verified" });
                        }}
                      >
                        Verify
                      </Button>
                    )}
                    {u.status !== "suspended" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive"
                        onClick={async () => {
                          await verify.mutateAsync({
                            userId: u.userId,
                            data: { status: "suspended" },
                          });
                          refreshUsers();
                          toast({ title: "Suspended" });
                        }}
                      >
                        Suspend
                      </Button>
                    )}
                    {u.status === "suspended" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await verify.mutateAsync({
                            userId: u.userId,
                            data: { status: "pending" },
                          });
                          refreshUsers();
                        }}
                      >
                        Reset to pending
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="reports" className="space-y-2 mt-3">
            {reports.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No open reports.
                </CardContent>
              </Card>
            )}
            {reports.map((r) => (
              <Card key={r.id}>
                <CardContent className="py-3 space-y-2">
                  <div className="flex justify-between items-start">
                    <div className="text-sm">
                      <div className="font-semibold">
                        {r.reporterName ?? "—"} → {r.reportedName ?? "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.reason}
                      </div>
                      {r.details && (
                        <div className="text-xs text-muted-foreground italic">
                          “{r.details}”
                        </div>
                      )}
                      {r.tripId && (
                        <div className="text-xs text-muted-foreground">
                          Trip: {r.tripId.slice(0, 8)}…
                        </div>
                      )}
                    </div>
                    <Badge variant="outline" className="border-secondary text-secondary">
                      {r.status}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={async () => {
                        await updateReport.mutateAsync({
                          id: r.id,
                          data: { status: "resolved" },
                        });
                        queryClient.invalidateQueries({
                          queryKey: getListAdminReportsQueryKey({ status: "open" }),
                        });
                        toast({ title: "Marked resolved" });
                      }}
                    >
                      Resolve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await updateReport.mutateAsync({
                          id: r.id,
                          data: { status: "dismissed" },
                        });
                        queryClient.invalidateQueries({
                          queryKey: getListAdminReportsQueryKey({ status: "open" }),
                        });
                        toast({ title: "Dismissed" });
                      }}
                    >
                      Dismiss
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="invites" className="space-y-3 mt-3">
            {inviteAnalytics && inviteAnalytics.length > 0 && (() => {
              const totalIssued = inviteAnalytics.reduce(
                (s, r) => s + (r.maxUses || 0),
                0,
              );
              const totalUsed = inviteAnalytics.reduce(
                (s, r) => s + (r.uses || 0),
                0,
              );
              const totalSignups = inviteAnalytics.reduce(
                (s, r) => s + (r.signups || 0),
                0,
              );
              const totalFirstTrip = inviteAnalytics.reduce(
                (s, r) => s + (r.firstTripUsers || 0),
                0,
              );
              const overallConv = totalSignups
                ? Math.round((totalFirstTrip / totalSignups) * 100)
                : 0;
              return (
                <Card>
                  <CardContent className="py-4 space-y-3">
                    <div className="font-semibold text-sm">Invite analytics</div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div>
                        <div className="text-xl font-serif font-bold">{totalIssued}</div>
                        <div className="text-[10px] text-muted-foreground">issued</div>
                      </div>
                      <div>
                        <div className="text-xl font-serif font-bold">{totalUsed}</div>
                        <div className="text-[10px] text-muted-foreground">used</div>
                      </div>
                      <div>
                        <div className="text-xl font-serif font-bold">{totalSignups}</div>
                        <div className="text-[10px] text-muted-foreground">signups</div>
                      </div>
                      <div>
                        <div className="text-xl font-serif font-bold">{overallConv}%</div>
                        <div className="text-[10px] text-muted-foreground">→ 1st trip</div>
                      </div>
                    </div>
                    <div className="pt-2 border-t space-y-1 max-h-44 overflow-y-auto">
                      {inviteAnalytics.map((r) => (
                        <div key={r.id} className="flex justify-between text-xs">
                          <span className="truncate">
                            <span className="font-mono">{r.code}</span> · {r.label}
                          </span>
                          <span className="font-medium shrink-0">
                            {r.uses}/{r.maxUses} · {r.conversionPct}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })()}
            <Card>
              <CardContent className="py-4 space-y-3">
                <div className="font-semibold">Generate codes</div>
                <Input
                  placeholder="Label (e.g. Norrsken Pilot)"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>How many</Label>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={count}
                      onChange={(e) => setCount(Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Uses per code</Label>
                    <Input
                      type="number"
                      min={1}
                      value={maxUses}
                      onChange={(e) => setMaxUses(Number(e.target.value))}
                    />
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={async () => {
                    if (!label) {
                      toast({ title: "Add a label", variant: "destructive" });
                      return;
                    }
                    await createInvite.mutateAsync({ data: { label, count, maxUses } });
                    queryClient.invalidateQueries({ queryKey: getListInvitesQueryKey() });
                    toast({ title: `Created ${count} codes` });
                    setLabel("");
                  }}
                >
                  Generate
                </Button>
              </CardContent>
            </Card>
            <div className="space-y-2">
              {invites.map((i) => (
                <Card key={i.id}>
                  <CardContent className="py-3 flex justify-between items-center">
                    <div>
                      <div className="font-mono font-semibold">{i.code}</div>
                      <div className="text-xs text-muted-foreground">
                        {i.label} · {i.uses}/{i.maxUses} used
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(i.code);
                        toast({ title: "Code copied" });
                      }}
                    >
                      Copy
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="config" className="space-y-3 mt-3">
            <Card>
              <CardContent className="py-4 space-y-3">
                <div className="font-semibold">Fuel & vehicle assumptions</div>
                <div className="space-y-1.5">
                  <Label>Petrol price (RWF / litre)</Label>
                  <Input
                    type="number"
                    placeholder={String(cfg?.fuelPriceRwfPerLitre ?? "")}
                    value={fuelPrice}
                    onChange={(e) =>
                      setFuelPrice(e.target.value === "" ? "" : Number(e.target.value))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Diesel price (RWF / litre)</Label>
                  <Input
                    type="number"
                    placeholder={String(cfg?.dieselPriceRwfPerLitre ?? "")}
                    value={dieselPrice}
                    onChange={(e) =>
                      setDieselPrice(e.target.value === "" ? "" : Number(e.target.value))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Average consumption (L / 100km)</Label>
                  <Input
                    type="number"
                    placeholder={String(cfg?.vehicleConsumptionLPer100Km ?? "")}
                    value={consumption}
                    onChange={(e) =>
                      setConsumption(e.target.value === "" ? "" : Number(e.target.value))
                    }
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={async () => {
                    await updateConfig.mutateAsync({
                      data: {
                        ...(fuelPrice !== "" && { fuelPriceRwfPerLitre: Number(fuelPrice) }),
                        ...(dieselPrice !== "" && {
                          dieselPriceRwfPerLitre: Number(dieselPrice),
                        }),
                        ...(consumption !== "" && {
                          vehicleConsumptionLPer100Km: Number(consumption),
                        }),
                      },
                    });
                    queryClient.invalidateQueries({ queryKey: getGetPublicConfigQueryKey() });
                    queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() });
                    toast({ title: "Config updated" });
                    setFuelPrice("");
                    setDieselPrice("");
                    setConsumption("");
                  }}
                >
                  Save config
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="places" className="space-y-3 mt-3">
            <PlacesAdmin />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function PlacesAdmin() {
  const { data: neighborhoods = [] } = useListNeighborhoods();
  const { data: corridors = [] } = useListCorridors();
  const createN = useCreateAdminNeighborhood();
  const deleteN = useDeleteAdminNeighborhood();
  const createC = useCreateAdminCorridor();
  const deleteC = useDeleteAdminCorridor();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [nName, setNName] = useState("");
  const [nSector, setNSector] = useState("");

  const [cLabel, setCLabel] = useState("");
  const [cOrigin, setCOrigin] = useState("");
  const [cDest, setCDest] = useState("");
  const [cKm, setCKm] = useState("");

  const refreshN = () =>
    queryClient.invalidateQueries({ queryKey: getListNeighborhoodsQueryKey() });
  const refreshC = () =>
    queryClient.invalidateQueries({ queryKey: getListCorridorsQueryKey() });

  return (
    <>
      <Card>
        <CardContent className="py-4 space-y-3">
          <div className="font-semibold">Neighborhoods</div>
          <div className="space-y-2">
            {neighborhoods.map((n) => (
              <div key={n.id} className="flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium">{n.name}</div>
                  {n.sector && (
                    <div className="text-xs text-muted-foreground">{n.sector}</div>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await deleteN.mutateAsync({ id: n.id });
                      refreshN();
                      toast({ title: "Neighborhood deleted" });
                    } catch (e) {
                      const err = e as { response?: { data?: { error?: string } } };
                      toast({
                        title: err?.response?.data?.error || "Could not delete",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  Delete
                </Button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={nName} onChange={(e) => setNName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Sector (optional)</Label>
              <Input value={nSector} onChange={(e) => setNSector(e.target.value)} />
            </div>
          </div>
          <Button
            className="w-full"
            disabled={!nName || createN.isPending}
            onClick={async () => {
              await createN.mutateAsync({
                data: { name: nName, sector: nSector || null },
              });
              setNName("");
              setNSector("");
              refreshN();
              toast({ title: "Neighborhood added" });
            }}
          >
            Add neighborhood
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4 space-y-3">
          <div className="font-semibold">Corridors</div>
          <div className="space-y-2">
            {corridors.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium">{c.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.distanceKm.toFixed(1)} km
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await deleteC.mutateAsync({ id: c.id });
                    refreshC();
                    toast({ title: "Corridor deleted" });
                  }}
                >
                  Delete
                </Button>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input
                value={cLabel}
                onChange={(e) => setCLabel(e.target.value)}
                placeholder="Remera – CBD"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Origin</Label>
                <Select value={cOrigin} onValueChange={setCOrigin}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {neighborhoods.map((n) => (
                      <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Destination</Label>
                <Select value={cDest} onValueChange={setCDest}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {neighborhoods.map((n) => (
                      <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Distance (km)</Label>
              <Input
                type="number"
                step="0.1"
                value={cKm}
                onChange={(e) => setCKm(e.target.value)}
              />
            </div>
          </div>
          <Button
            className="w-full"
            disabled={!cLabel || !cOrigin || !cDest || !cKm || createC.isPending}
            onClick={async () => {
              await createC.mutateAsync({
                data: {
                  label: cLabel,
                  originId: cOrigin,
                  destinationId: cDest,
                  distanceKm: Number(cKm),
                },
              });
              setCLabel("");
              setCOrigin("");
              setCDest("");
              setCKm("");
              refreshC();
              toast({ title: "Corridor added" });
            }}
          >
            Add corridor
          </Button>
        </CardContent>
      </Card>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="py-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="text-xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
