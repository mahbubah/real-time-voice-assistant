import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/?error=no_code", request.url));
  }

  try {
    const tokens = await exchangeCode(code);

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const redirectUrl = new URL("/", baseUrl);
    redirectUrl.searchParams.set("access_token", tokens.access_token || "");
    if (tokens.refresh_token) {
      redirectUrl.searchParams.set("refresh_token", tokens.refresh_token);
    }
    redirectUrl.searchParams.set("authenticated", "true");

    return NextResponse.redirect(redirectUrl.toString());
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(new URL("/?error=auth_failed", request.url));
  }
}
