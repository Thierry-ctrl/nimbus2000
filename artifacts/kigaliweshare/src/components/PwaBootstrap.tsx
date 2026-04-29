import { useEffect, useState } from "react";
import { Bell, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  useGetPublicConfig,
  useGetMyProfile,
  useSubscribePush,
  getGetMyProfileQueryKey,
} from "@workspace/api-client-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const A2HS_DISMISSED_KEY = "kgws.a2hs.dismissed";
const PUSH_DISMISSED_KEY = "kgws.push.dismissed";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function PwaBootstrap() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [showPush, setShowPush] = useState(false);

  const { data: profile } = useGetMyProfile({
    query: { retry: false, queryKey: getGetMyProfileQueryKey() },
  });
  const { data: config } = useGetPublicConfig();
  const subscribePush = useSubscribePush();

  // Register service worker
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (import.meta.env.DEV) return;
    navigator.serviceWorker.register("/service-worker.js").catch(() => undefined);
  }, []);

  // A2HS prompt capture
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      if (!localStorage.getItem(A2HS_DISMISSED_KEY)) setShowInstall(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Push subscribe prompt: only when signed in & profile loaded & not dismissed
  useEffect(() => {
    if (!profile || !config?.vapidPublicKey) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission === "denied") return;
    if (Notification.permission === "granted") {
      subscribeOnce();
      return;
    }
    if (localStorage.getItem(PUSH_DISMISSED_KEY)) return;
    const t = setTimeout(() => setShowPush(true), 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, config?.vapidPublicKey]);

  const subscribeOnce = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            config!.vapidPublicKey!,
          ) as unknown as BufferSource,
        }));
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;
      await subscribePush.mutateAsync({
        data: {
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
          userAgent: navigator.userAgent,
        },
      });
    } catch (_e) {
      // ignore
    }
  };

  const handleEnablePush = async () => {
    setShowPush(false);
    const perm = await Notification.requestPermission();
    if (perm === "granted") await subscribeOnce();
    localStorage.setItem(PUSH_DISMISSED_KEY, "1");
  };

  const handleInstall = async () => {
    if (!installEvent) return;
    setShowInstall(false);
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
    localStorage.setItem(A2HS_DISMISSED_KEY, "1");
  };

  if (!showInstall && !showPush) return null;

  return (
    <div className="fixed bottom-24 left-4 right-4 z-40 max-w-md mx-auto space-y-2 pointer-events-none">
      {showInstall && (
        <Card className="border-primary bg-primary/5 shadow-lg pointer-events-auto">
          <CardContent className="py-3 flex items-center gap-3">
            <Download className="h-5 w-5 text-primary" />
            <div className="flex-1 text-sm">
              <div className="font-semibold">Install KigaliWeShare</div>
              <div className="text-xs text-muted-foreground">
                Add to home screen for one-tap access.
              </div>
            </div>
            <Button size="sm" onClick={handleInstall}>
              Install
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => {
                setShowInstall(false);
                localStorage.setItem(A2HS_DISMISSED_KEY, "1");
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}
      {showPush && (
        <Card className="border-secondary bg-secondary/5 shadow-lg pointer-events-auto">
          <CardContent className="py-3 flex items-center gap-3">
            <Bell className="h-5 w-5 text-secondary" />
            <div className="flex-1 text-sm">
              <div className="font-semibold">Get ride alerts</div>
              <div className="text-xs text-muted-foreground">
                Know instantly when riders request your trip.
              </div>
            </div>
            <Button size="sm" onClick={handleEnablePush}>
              Enable
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => {
                setShowPush(false);
                localStorage.setItem(PUSH_DISMISSED_KEY, "1");
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
