import { DevToolsView } from "@/components/dev-tools-view";
import { devToolsEnabled } from "@/lib/server/dev-tools";
import { notFound } from "next/navigation";

export default function DevPage() {
  if (!devToolsEnabled()) notFound();
  return <DevToolsView />;
}
