import { ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { UserAvatar } from "../UserAvatar";
import { SOSButton } from "../SOSButton";
import { PwaBootstrap } from "../PwaBootstrap";

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
  showBack?: boolean;
}

export function AppLayout({ children, title }: AppLayoutProps) {
  return (
    <div className="min-h-[100dvh] bg-muted/30 flex justify-center">
      {/* Desktop wrapper */}
      <div className="w-full max-w-md bg-background min-h-[100dvh] flex flex-col relative shadow-2xl overflow-hidden desktop-bg-texture">
        
        {/* Header */}
        <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border/50 px-4 h-14 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center">
              <span className="text-white font-serif font-bold">K</span>
            </div>
            {title ? (
              <h1 className="font-serif font-bold text-lg text-foreground">{title}</h1>
            ) : (
              <span className="font-serif font-bold text-lg text-primary">KigaliWeShare</span>
            )}
          </div>
          <UserAvatar />
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto pb-24 pt-4 px-4 scroll-smooth">
          {children}
        </main>

        {/* Global SOS Button (always available when signed in) */}
        <SOSButton />

        {/* PWA install + push subscribe prompts */}
        <PwaBootstrap />

        {/* Bottom Navigation */}
        <BottomNav />
      </div>
    </div>
  );
}
