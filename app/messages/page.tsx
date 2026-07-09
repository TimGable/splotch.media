import { PublicRouteShell } from "@/app/components/public-route-shell";
import { MessagesPage } from "@/app/components/messages-page";

export default function MessagesRoute() {
  return (
    <PublicRouteShell requireAuth>
      <MessagesPage />
    </PublicRouteShell>
  );
}
