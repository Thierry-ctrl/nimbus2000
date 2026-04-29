import { useGetMyProfile, getGetMyProfileQueryKey } from "@workspace/api-client-react";
import { Redirect } from "wouter";
import { ReactNode } from "react";

export function useIsAdmin() {
  const { data } = useGetMyProfile({
    query: { retry: false, queryKey: getGetMyProfileQueryKey() },
  });
  return data?.isAdmin === true;
}

export function RequireProfile({ children }: { children: ReactNode }) {
  const { data, isLoading, error } = useGetMyProfile({
    query: { retry: false, queryKey: getGetMyProfileQueryKey() },
  });
  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }
  // 404 means no profile yet
  const status = (error as { response?: { status?: number } } | null)?.response
    ?.status;
  if (status === 404 || (!data && error)) {
    return <Redirect to="/onboarding" />;
  }
  return <>{children}</>;
}
