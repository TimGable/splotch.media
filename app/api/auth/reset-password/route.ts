"use server";

import { NextResponse } from "next/server";
import { getCreatePasswordUrl } from "@/lib/app-url";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const payload = (body ?? {}) as { email?: unknown };
  const email =
    typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";

  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseServiceRoleClient();
    const redirectTo = getCreatePasswordUrl();

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: "Password reset email sent. Check your inbox and spam folder.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
