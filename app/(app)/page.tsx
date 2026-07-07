import { redirect } from "next/navigation";

// Root route now belongs to /operations — the new cross-source dashboard.
// We keep this file so existing bookmarks and the / shortcut still resolve;
// no other behaviour lives here.
export default function RootRedirect(): never {
  redirect("/operations");
}
