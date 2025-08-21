import { NextResponse } from "next/server";

import { ai3d } from "tencentcloud-sdk-nodejs-ai3d";
import {
  QueryHunyuanTo3DJobRequest,
  QueryHunyuanTo3DJobResponse,
} from "tencentcloud-sdk-nodejs-ai3d/tencentcloud/services/ai3d/v20250513/ai3d_models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Build Ai3D client once to avoid duplication
function getAi3dClient() {
  const Ai3dClient = ai3d.v20250513.Client;
  const secretId = process.env.TENCENTCLOUD_SECRET_ID;
  const secretKey = process.env.TENCENTCLOUD_SECRET_KEY;
  if (!secretId || !secretKey) {
    throw new Error(
      "Missing TENCENTCLOUD_SECRET_ID or TENCENTCLOUD_SECRET_KEY."
    );
  }
  return new Ai3dClient({
    credential: { secretId, secretKey },
    region: "ap-guangzhou",
    profile: { httpProfile: { endpoint: "ai3d.tencentcloudapi.com" } },
  });
}

// Retrieve raw job data (not wrapped in NextResponse)
async function fetchJobData(
  jobId: string
): Promise<QueryHunyuanTo3DJobResponse> {
  const client = getAi3dClient();
  const params: QueryHunyuanTo3DJobRequest = { JobId: jobId };
  return (await client.QueryHunyuanTo3DJob(
    params
  )) as QueryHunyuanTo3DJobResponse;
}

// Proxy a remote URL with basic range/header forwarding
async function proxyUrl(url: string, req: Request) {
  const rangeHeader = req.headers.get("range") || undefined;
  const upstream = await fetch(url, {
    headers: rangeHeader ? { range: rangeHeader } : undefined,
  });
  if (!upstream.body) {
    return NextResponse.json(
      { error: `Upstream fetch failed: ${upstream.status}` },
      { status: 502 }
    );
  }
  const headers = new Headers();
  const contentType =
    upstream.headers.get("content-type") || "application/octet-stream";
  const contentLength = upstream.headers.get("content-length");
  const contentRange = upstream.headers.get("content-range");
  const acceptRanges = upstream.headers.get("accept-ranges");
  const cacheControl = upstream.headers.get("cache-control");
  headers.set("content-type", contentType);
  if (contentLength) headers.set("content-length", contentLength);
  if (contentRange) headers.set("content-range", contentRange);
  if (acceptRanges) headers.set("accept-ranges", acceptRanges);
  if (cacheControl) headers.set("cache-control", cacheControl);
  return new NextResponse(upstream.body, { status: upstream.status, headers });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId") || undefined;
    const wantModel = searchParams.has("model");
    if (!jobId) {
      return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
    }
    // Proxy the model file if requested via GET param
    if (wantModel) {
      try {
        const data = await fetchJobData(jobId);
        const first = (data.ResultFile3Ds || [])[0];
        const url = first?.Url;
        if (!url) {
          return NextResponse.json(
            { error: "No model URL available yet" },
            { status: 404 }
          );
        }
        return await proxyUrl(url, req);
      } catch (e: any) {
        return NextResponse.json(
          { error: e?.message || "Failed to proxy model" },
          { status: 500 }
        );
      }
    }
    const data = await fetchJobData(jobId);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("/api/hunyuan3d/query error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
