import { useEffect, useState } from "react";
import { useClerk } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMyProfile,
  useListNeighborhoods,
  useUpsertMyProfile,
  useUpsertMyVehicle,
  getGetMyProfileQueryKey,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { LogOut } from "lucide-react";
import { useIsAdmin } from "@/lib/auth-utils";
import { Link } from "wouter";

export default function ProfilePage() {
  const { data: profile } = useGetMyProfile();
  const { data: neighborhoods = [] } = useListNeighborhoods();
  const upsertProfile = useUpsertMyProfile();
  const upsertVehicle = useUpsertMyVehicle();
  const queryClient = useQueryClient();
  const { signOut } = useClerk();
  const { toast } = useToast();
  const isAdmin = useIsAdmin();

  const [editing, setEditing] = useState(false);
  const [vehicleEditing, setVehicleEditing] = useState(false);

  const [phone, setPhone] = useState("");
  const [neighborhoodId, setNeighborhoodId] = useState("");
  const [employer, setEmployer] = useState("");
  const [homePickupPoint, setHomePickupPoint] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState<"en" | "fr" | "rw">("en");

  const [vMake, setVMake] = useState("");
  const [vModel, setVModel] = useState("");
  const [vColor, setVColor] = useState("");
  const [vPlate, setVPlate] = useState("");
  const [vSeats, setVSeats] = useState(3);
  const [vNationalId, setVNationalId] = useState("");
  const [vPhotoUrl, setVPhotoUrl] = useState("");

  useEffect(() => {
    if (profile) {
      setPhone(profile.phone || "");
      setNeighborhoodId(profile.neighborhoodId);
      setEmployer(profile.employer || "");
      setHomePickupPoint(profile.homePickupPoint || "");
      setEmergencyContactName(profile.emergencyContactName || "");
      setEmergencyContactPhone(profile.emergencyContactPhone || "");
      if (profile.preferredLanguage) setPreferredLanguage(profile.preferredLanguage);
      if (profile.vehicle) {
        setVMake(profile.vehicle.make);
        setVModel(profile.vehicle.model);
        setVColor(profile.vehicle.color);
        setVPlate(profile.vehicle.plate);
        setVSeats(profile.vehicle.seats);
        setVNationalId(profile.vehicle.nationalId || "");
        setVPhotoUrl(profile.vehicle.photoUrl || "");
      }
    }
  }, [profile]);

  if (!profile) return <AppLayout><div /></AppLayout>;

  const saveProfile = async () => {
    await upsertProfile.mutateAsync({
      data: {
        fullName: profile.fullName,
        gender: profile.gender,
        role: profile.role,
        neighborhoodId,
        phone,
        employer: employer || null,
        homePickupPoint: homePickupPoint || null,
        emergencyContactName: emergencyContactName || null,
        emergencyContactPhone: emergencyContactPhone || null,
        preferredLanguage,
      },
    });
    queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
    toast({ title: "Profile updated" });
    setEditing(false);
  };

  const saveVehicle = async () => {
    await upsertVehicle.mutateAsync({
      data: {
        make: vMake,
        model: vModel,
        color: vColor,
        plate: vPlate,
        seats: vSeats,
        nationalId: vNationalId || null,
        photoUrl: vPhotoUrl || null,
      },
    });
    queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
    toast({ title: "Vehicle updated" });
    setVehicleEditing(false);
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-serif font-bold">{profile.fullName}</h2>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline">{profile.role}</Badge>
            <Badge
              variant="outline"
              className={
                profile.status === "verified"
                  ? "border-primary text-primary"
                  : profile.status === "pending"
                    ? "border-secondary text-secondary"
                    : "border-destructive text-destructive"
              }
            >
              {profile.status}
            </Badge>
            {profile.inviteLabel && (
              <Badge variant="outline" className="text-xs">
                {profile.inviteLabel}
              </Badge>
            )}
            {profile.idVerified && (
              <Badge className="text-xs bg-emerald-600 hover:bg-emerald-700">
                ID verified
              </Badge>
            )}
          </div>
          <div className="text-sm text-muted-foreground mt-2">
            {profile.completedTrips} trips ·{" "}
            {profile.averageRating ? `${profile.averageRating.toFixed(1)}★` : "no rating yet"}
          </div>
        </div>

        <Card>
          <CardContent className="py-4 space-y-3">
            <div className="flex justify-between items-center">
              <div className="font-semibold">Contact & neighborhood</div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing((v) => !v)}
              >
                {editing ? "Cancel" : "Edit"}
              </Button>
            </div>
            {!editing ? (
              <div className="text-sm space-y-1">
                <div>Phone: {profile.phone}</div>
                <div>Neighborhood: {neighborhoods.find((n) => n.id === profile.neighborhoodId)?.name}</div>
                {profile.employer && <div>Employer: {profile.employer}</div>}
                {profile.homePickupPoint && <div>Pickup: {profile.homePickupPoint}</div>}
                <div className="pt-1 text-muted-foreground">
                  Emergency: {profile.emergencyContactName || "—"} {profile.emergencyContactPhone || ""}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Neighborhood</Label>
                  <Select value={neighborhoodId} onValueChange={setNeighborhoodId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {neighborhoods.map((n) => (
                        <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Employer</Label>
                  <Input value={employer} onChange={(e) => setEmployer(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Pickup landmark</Label>
                  <Input value={homePickupPoint} onChange={(e) => setHomePickupPoint(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Emergency name</Label>
                    <Input
                      value={emergencyContactName}
                      onChange={(e) => setEmergencyContactName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Emergency phone</Label>
                    <Input
                      value={emergencyContactPhone}
                      onChange={(e) => setEmergencyContactPhone(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Language</Label>
                  <Select
                    value={preferredLanguage}
                    onValueChange={(v) => setPreferredLanguage(v as "en" | "fr" | "rw")}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="fr">Français</SelectItem>
                      <SelectItem value="rw">Kinyarwanda</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" onClick={saveProfile}>Save</Button>
              </div>
            )}
          </CardContent>
        </Card>

        {(profile.role === "driver" || profile.role === "both") && (
          <Card>
            <CardContent className="py-4 space-y-3">
              <div className="flex justify-between items-center">
                <div className="font-semibold">Vehicle</div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setVehicleEditing((v) => !v)}
                >
                  {vehicleEditing ? "Cancel" : profile.vehicle ? "Edit" : "Add"}
                </Button>
              </div>
              {!vehicleEditing && profile.vehicle && (
                <div className="text-sm">
                  {profile.vehicle.color} {profile.vehicle.make} {profile.vehicle.model} ·{" "}
                  <span className="font-mono font-semibold">
                    {profile.vehicle.plate}
                  </span>{" "}
                  · {profile.vehicle.seats} seats
                </div>
              )}
              {!vehicleEditing && !profile.vehicle && (
                <div className="text-sm text-muted-foreground">
                  No vehicle saved yet.
                </div>
              )}
              {vehicleEditing && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Input value={vMake} onChange={(e) => setVMake(e.target.value)} placeholder="Make" />
                    <Input value={vModel} onChange={(e) => setVModel(e.target.value)} placeholder="Model" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input value={vColor} onChange={(e) => setVColor(e.target.value)} placeholder="Color" />
                    <Input
                      value={vPlate}
                      onChange={(e) => setVPlate(e.target.value.toUpperCase())}
                      placeholder="Plate"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Seats</Label>
                    <Select value={String(vSeats)} onValueChange={(v) => setVSeats(Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4].map((n) => (
                          <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>National ID (optional)</Label>
                    <Input
                      value={vNationalId}
                      onChange={(e) => setVNationalId(e.target.value)}
                      placeholder="1 1985 8 0000000 0 00"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Vehicle photo URL (optional)</Label>
                    <Input
                      value={vPhotoUrl}
                      onChange={(e) => setVPhotoUrl(e.target.value)}
                      placeholder="https://..."
                    />
                  </div>
                  <Button className="w-full" onClick={saveVehicle}>Save</Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {isAdmin && (
          <Link href="/admin">
            <Button variant="outline" className="w-full">Open admin console</Button>
          </Link>
        )}

        <Button
          variant="ghost"
          className="w-full text-destructive"
          onClick={() => signOut()}
        >
          <LogOut className="mr-2 h-4 w-4" /> Log out
        </Button>
      </div>
    </AppLayout>
  );
}
