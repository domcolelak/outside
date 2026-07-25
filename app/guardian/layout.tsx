import { AppShell } from "@/components/AppShell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppShell active="guardian" width="max-w-[1500px]">{children}</AppShell>;
}
