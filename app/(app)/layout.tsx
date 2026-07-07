import { redirect } from "next/navigation";

import { PermissionProvider } from "@/components/auth/permission-context";
import { MobileBar, Sidebar } from "@/components/nav";
import { auth, isUnauthorized } from "@/lib/api";
import type { Me } from "@/lib/auth";

// The authed application shell. Every route in the (app) group renders inside
// it. We resolve the session server-side via /auth/me; an unauthenticated user
// is redirected to /login (the proxy already does an optimistic redirect, this
// is the authoritative check). The resolved user drives client-side UI gating
// through PermissionProvider.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let me: Me;
  try {
    me = await auth.me();
  } catch (err) {
    if (isUnauthorized(err)) {
      redirect("/login");
    }
    throw err;
  }

  return (
    <PermissionProvider me={me}>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <MobileBar />
          <main className="flex-1 w-full max-w-7xl mx-auto px-6 lg:px-10 py-8">
            {children}
          </main>
        </div>
      </div>
    </PermissionProvider>
  );
}
