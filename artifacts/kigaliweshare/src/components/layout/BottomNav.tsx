import { Link, useLocation } from "wouter";
import { Home, Search, Map, PlusCircle, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const [location] = useLocation();

  const navItems = [
    { href: "/app", icon: Home, label: "Home" },
    { href: "/find", icon: Search, label: "Find" },
    { href: "/post-trip", icon: PlusCircle, label: "Post" },
    { href: "/my-rides", icon: Map, label: "Rides" },
    { href: "/my-trips", icon: Settings, label: "Trips" },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border pb-safe">
      <div className="flex justify-around items-center h-16 max-w-md mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href || (location.startsWith(item.href) && item.href !== "/app");
          
          return (
            <Link key={item.href} href={item.href}>
              <div className={cn(
                "flex flex-col items-center justify-center w-16 h-full space-y-1 cursor-pointer transition-colors",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}>
                <Icon className={cn("w-6 h-6", isActive && "fill-primary/20")} strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
