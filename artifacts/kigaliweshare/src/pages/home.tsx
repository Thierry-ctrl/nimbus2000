import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { KigaliSkyline, KigaliMark } from "@/components/illustrations/KigaliSkyline";

export default function Home() {
  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <header className="px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KigaliMark className="w-9 h-9" />
          <span className="font-serif font-bold text-xl text-foreground">KigaliWeShare</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/sign-in">
            <Button variant="ghost" className="text-foreground font-medium">Log in</Button>
          </Link>
          <Link href="/sign-up">
            <Button className="bg-secondary text-secondary-foreground hover:bg-secondary/90 font-medium">
              Join Pilot
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col px-6 pt-6 pb-24">
        <div className="max-w-md mx-auto w-full space-y-8">
          <KigaliSkyline className="w-full h-auto rounded-2xl shadow-sm" />

          <div className="space-y-4 text-center">
            <h1 className="text-4xl md:text-5xl font-serif font-bold text-foreground leading-tight">
              Neighbors giving neighbors a lift.
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Beat traffic and save fuel together. KigaliWeShare is an invite-only community for commuters who share the same corridors.
            </p>
          </div>

          <div className="p-6 bg-card border border-border rounded-2xl shadow-sm space-y-6 text-left">
            <h2 className="font-serif font-bold text-2xl">The Pilot Program</h2>
            <p className="text-muted-foreground">
              We are currently testing our carpool matching across key Kigali corridors (like Remera ↔ CBD). To ensure trust and safety, you need an invite code from a participating employer or community to join.
            </p>
            <div className="space-y-3">
              <Link href="/sign-up" className="block">
                <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-12 text-lg">
                  I have an invite code
                </Button>
              </Link>
              <Link href="/sign-in" className="block">
                <Button variant="outline" className="w-full h-12">
                  I already have an account
                </Button>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 text-left mt-12">
            <Step
              n={1}
              title="Sign up with your code"
              body="Create an account and set up your profile as a driver or rider."
              tone="cobalt"
            />
            <Step
              n={2}
              title="Find your match"
              body="Post your trips or request rides along your usual commute corridors."
              tone="mint"
            />
            <Step
              n={3}
              title="Save fuel, beat traffic"
              body="Share the journey and the costs while helping reduce Kigali's traffic."
              tone="navy"
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function Step({
  n,
  title,
  body,
  tone,
}: {
  n: number;
  title: string;
  body: string;
  tone: "cobalt" | "mint" | "navy";
}) {
  const bg =
    tone === "cobalt"
      ? "bg-[hsl(var(--brand-cobalt))] text-white"
      : tone === "mint"
        ? "bg-[hsl(var(--brand-mint))] text-foreground"
        : "bg-[hsl(var(--brand-navy))] text-white";
  return (
    <div className="space-y-2">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${bg}`}>
        {n}
      </div>
      <h3 className="font-bold text-lg">{title}</h3>
      <p className="text-muted-foreground text-sm">{body}</p>
    </div>
  );
}
