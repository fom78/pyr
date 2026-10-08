import { AppHeader } from "@/components/layout/app-header";
import { BottomNav } from "@/components/layout/nav-links";
import { BanBanner } from "@/components/layout/ban-banner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      <BanBanner />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-4 pb-24 md:pb-10">{children}</main>
      <BottomNav />
    </>
  );
}
