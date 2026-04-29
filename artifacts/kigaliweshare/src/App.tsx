import { useEffect, useRef } from "react";
import {
  ClerkProvider,
  SignIn,
  SignUp,
  Show,
  useClerk,
  useAuth,
} from "@clerk/react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import {
  Switch,
  Route,
  useLocation,
  Router as WouterRouter,
  Redirect,
} from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import Home from "./pages/home";
import SignInPage from "./pages/sign-in";
import SignUpPage from "./pages/sign-up";
import NotFound from "./pages/not-found";
import Onboarding from "./pages/onboarding";
import AppDashboard from "./pages/app-dashboard";
import FindPage from "./pages/find";
import PostTripPage from "./pages/post-trip";
import MyTripsPage from "./pages/my-trips";
import MyRidesPage from "./pages/my-rides";
import TripDetailPage from "./pages/trip-detail";
import ProfilePage from "./pages/profile";
import AdminPage from "./pages/admin";
import { RequireProfile } from "./lib/auth-utils";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

function ApiAuthBridge() {
  const { getToken, isLoaded } = useAuth();
  useEffect(() => {
    if (!isLoaded) return;
    setAuthTokenGetter(async () => {
      try {
        return await getToken();
      } catch {
        return null;
      }
    });
    return () => setAuthTokenGetter(null);
  }, [getToken, isLoaded]);
  return null;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/app" />
      </Show>
      <Show when="signed-out">
        <Home />
      </Show>
    </>
  );
}

function SignedInRoute({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Show when="signed-in">
        <RequireProfile>{children}</RequireProfile>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function SignedInRouteNoOnboarding({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Show when="signed-in">{children}</Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ApiAuthBridge />
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/onboarding">
              <SignedInRouteNoOnboarding>
                <Onboarding />
              </SignedInRouteNoOnboarding>
            </Route>
            <Route path="/app">
              <SignedInRoute>
                <AppDashboard />
              </SignedInRoute>
            </Route>
            <Route path="/find">
              <SignedInRoute>
                <FindPage />
              </SignedInRoute>
            </Route>
            <Route path="/post-trip">
              <SignedInRoute>
                <PostTripPage />
              </SignedInRoute>
            </Route>
            <Route path="/my-trips">
              <SignedInRoute>
                <MyTripsPage />
              </SignedInRoute>
            </Route>
            <Route path="/my-rides">
              <SignedInRoute>
                <MyRidesPage />
              </SignedInRoute>
            </Route>
            <Route path="/trips/:tripId">
              <SignedInRoute>
                <TripDetailPage />
              </SignedInRoute>
            </Route>
            <Route path="/profile">
              <SignedInRoute>
                <ProfilePage />
              </SignedInRoute>
            </Route>
            <Route path="/admin">
              <SignedInRoute>
                <AdminPage />
              </SignedInRoute>
            </Route>
            <Route component={NotFound} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
