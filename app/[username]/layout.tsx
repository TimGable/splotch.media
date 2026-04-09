import { PublicRouteShell } from "@/app/components/public-route-shell";

export default function PublicUserLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <PublicRouteShell>{children}</PublicRouteShell>;
}
