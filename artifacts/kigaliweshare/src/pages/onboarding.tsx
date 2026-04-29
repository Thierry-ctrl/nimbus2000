import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMyProfile,
  useListNeighborhoods,
  useRedeemInvite,
  useUpsertMyProfile,
  useUpsertMyVehicle,
  getGetMyProfileQueryKey,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KigaliSkyline, KigaliMark } from "@/components/illustrations/KigaliSkyline";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@clerk/react";

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const { data: existing } = useGetMyProfile({
    query: { retry: false, queryKey: getGetMyProfileQueryKey() },
  });
  const { data: neighborhoods = [] } = useListNeighborhoods();
  const redeemInvite = useRedeemInvite();
  const upsertProfile = useUpsertMyProfile();
  const upsertVehicle = useUpsertMyVehicle();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [code, setCode] = useState("");
  const [inviteLabel, setInviteLabel] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [gender, setGender] = useState<string>("prefer_not_to_say");
  const [role, setRole] = useState<string>("rider");
  const [neighborhoodId, setNeighborhoodId] = useState<string>("");
  const [phone, setPhone] = useState("");
  const [employer, setEmployer] = useState("");
  const [homePickupPoint, setHomePickupPoint] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState<"en" | "fr" | "rw">("en");

  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [plate, setPlate] = useState("");
  const [seats, setSeats] = useState<number>(3);
  const [nationalId, setNationalId] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");

  useEffect(() => {
    if (existing) {
      // Already onboarded — go to app
      setLocation("/app");
    }
  }, [existing, setLocation]);

  useEffect(() => {
    if (user && !fullName) {
      setFullName(user.fullName || "");
    }
  }, [user, fullName]);

  const handleRedeem = async () => {
    if (!code.trim()) return;
    try {
      const res = await redeemInvite.mutateAsync({ data: { code: code.trim() } });
      setInviteLabel(res.label);
      toast({ title: "Code accepted", description: res.label });
      setStep(2);
    } catch {
      toast({
        title: "Invalid code",
        description: "Check with your community organizer.",
        variant: "destructive",
      });
    }
  };

  const handleProfileNext = async () => {
    if (!fullName || !gender || !role || !neighborhoodId || !phone) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }
    try {
      await upsertProfile.mutateAsync({
        data: {
          fullName,
          gender: gender as "female" | "male" | "other" | "prefer_not_to_say",
          role: role as "rider" | "driver" | "both",
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
      if (role === "driver" || role === "both") {
        setStep(3);
      } else {
        toast({ title: "Welcome to KigaliWeShare" });
        setLocation("/app");
      }
    } catch {
      toast({ title: "Could not save profile", variant: "destructive" });
    }
  };

  const handleVehicleSave = async () => {
    if (!make || !model || !color || !plate) {
      toast({ title: "Please fill vehicle details", variant: "destructive" });
      return;
    }
    try {
      await upsertVehicle.mutateAsync({
        data: {
          make,
          model,
          color,
          plate,
          seats,
          nationalId: nationalId || null,
          photoUrl: photoUrl || null,
        },
      });
      queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
      toast({ title: "Vehicle saved", description: "Welcome aboard." });
      setLocation("/app");
    } catch {
      toast({ title: "Could not save vehicle", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-[100dvh] bg-muted/40 flex justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <KigaliSkyline className="w-full h-auto rounded-2xl shadow-sm" />
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2">
            <KigaliMark className="w-9 h-9" />
            <span className="font-serif font-bold text-xl text-foreground">
              KigaliWeShare
            </span>
          </div>
          <div className="flex justify-center gap-2 mt-3">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1.5 w-10 rounded-full ${
                  step >= s ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </div>

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Enter your invite code</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                The pilot is invite-only. Use the code from your employer or community
                organizer (e.g. KGL-DEMO).
              </p>
              <div className="space-y-2">
                <Label>Invite code</Label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="KGL-XXXXXX"
                />
              </div>
              <Button
                className="w-full h-12"
                onClick={handleRedeem}
                disabled={redeemInvite.isPending}
              >
                Continue
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Tell your neighbors who you are</CardTitle>
              {inviteLabel && (
                <p className="text-sm text-secondary font-medium">
                  Joined via {inviteLabel}
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Full name *</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Gender *</Label>
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                      <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>I am a *</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rider">Rider</SelectItem>
                      <SelectItem value="driver">Driver</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Neighborhood *</Label>
                <Select value={neighborhoodId} onValueChange={setNeighborhoodId}>
                  <SelectTrigger><SelectValue placeholder="Pick yours" /></SelectTrigger>
                  <SelectContent>
                    {neighborhoods.map((n) => (
                      <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Phone (Rwanda) *</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+250 78 …" />
              </div>
              <div className="space-y-2">
                <Label>Employer / Community</Label>
                <Input value={employer} onChange={(e) => setEmployer(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Pickup landmark near home</Label>
                <Input
                  value={homePickupPoint}
                  onChange={(e) => setHomePickupPoint(e.target.value)}
                  placeholder="e.g. SimbaCafe Remera"
                />
              </div>
              <div className="space-y-2">
                <Label>Preferred language</Label>
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Emergency contact name</Label>
                  <Input
                    value={emergencyContactName}
                    onChange={(e) => setEmergencyContactName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Emergency phone</Label>
                  <Input
                    value={emergencyContactPhone}
                    onChange={(e) => setEmergencyContactPhone(e.target.value)}
                  />
                </div>
              </div>
              <Button
                className="w-full h-12"
                onClick={handleProfileNext}
                disabled={upsertProfile.isPending}
              >
                {role === "rider" ? "Finish" : "Next: vehicle"}
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Your vehicle</CardTitle>
              <p className="text-sm text-muted-foreground">
                Your neighbors will see this when picking a ride.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Make</Label>
                  <Input value={make} onChange={(e) => setMake(e.target.value)} placeholder="Toyota" />
                </div>
                <div className="space-y-2">
                  <Label>Model</Label>
                  <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Vitz" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Color</Label>
                  <Input value={color} onChange={(e) => setColor(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Plate</Label>
                  <Input
                    value={plate}
                    onChange={(e) => setPlate(e.target.value.toUpperCase())}
                    placeholder="RAB 123A"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Available seats (excluding driver)</Label>
                <Select value={String(seats)} onValueChange={(v) => setSeats(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4].map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>National ID number (optional)</Label>
                <Input
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)}
                  placeholder="1 1985 8 0000000 0 00"
                />
                <p className="text-xs text-muted-foreground">
                  Helps the admin team verify you. Stays private.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Vehicle photo URL (optional)</Label>
                <Input
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <Button
                className="w-full h-12"
                onClick={handleVehicleSave}
                disabled={upsertVehicle.isPending}
              >
                Finish setup
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
