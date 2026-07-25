import { SceneStateProvider } from "@/lib/state/SceneStateProvider";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default function Home() {
  return (
    <SceneStateProvider>
      <DashboardShell />
    </SceneStateProvider>
  );
}
