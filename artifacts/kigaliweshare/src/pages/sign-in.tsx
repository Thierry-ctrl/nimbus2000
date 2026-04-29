import { SignIn } from "@clerk/react";
import { KigaliSkyline, KigaliMark } from "@/components/illustrations/KigaliSkyline";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function SignInPage() {
  // To update login providers, app branding, or OAuth settings use the Auth
  // pane in the workspace toolbar. More information can be found in the Replit docs.
  return (
    <div className="min-h-screen bg-muted/40 flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <KigaliSkyline className="w-full h-auto rounded-2xl shadow-sm" />
        <div className="flex items-center justify-center gap-2">
          <KigaliMark className="w-9 h-9" />
          <span className="font-serif font-bold text-xl text-foreground">
            KigaliWeShare
          </span>
        </div>
        <p className="text-center text-sm text-muted-foreground -mt-2">
          Neighbor-to-neighbor carpooling for Kigali.
        </p>
        <div className="flex justify-center">
          <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
        </div>
      </div>
    </div>
  );
}
