import { auth } from "@/auth/server";
import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse } from "next/server";

async function unavailable() {
	return NextResponse.json(
		{ error: "Authentication is not configured on the server." },
		{ status: 503 },
	);
}

export const { POST, GET } = auth
	? toNextJsHandler(auth)
	: { POST: unavailable, GET: unavailable };
