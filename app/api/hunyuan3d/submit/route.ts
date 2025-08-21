import { NextResponse } from "next/server";

import { ai3d } from "tencentcloud-sdk-nodejs-ai3d";
import { SubmitHunyuanTo3DJobRequest } from "tencentcloud-sdk-nodejs-ai3d/tencentcloud/services/ai3d/v20250513/ai3d_models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubmitRequestBody = {
  prompt?: string;
  imageUrl?: string;
  imageBase64?: string;
  resultFormat?: "GLB" | "OBJ" | "FBX" | "USDZ" | string;
  enablePBR?: boolean;
  multiViewImages?: Array<
    | { viewType?: string; viewImageUrl?: string }
    | { ViewType?: string; ViewImageUrl?: string }
  >;
  // Allow passthrough for extra SDK params if needed
  [key: string]: unknown;
};

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      return NextResponse.json(
        { error: "Unsupported Content-Type. Please send JSON." },
        { status: 415 }
      );
    }

    const body = (await req.json()) as SubmitRequestBody;
    const {
      prompt,
      imageUrl,
      imageBase64,
      resultFormat = "USDZ",
      enablePBR = true,
      multiViewImages,
      ...extraParams
    } = body || {};

    // Dynamically import the SDK to keep it server-only
    const Ai3dClient = ai3d.v20250513.Client;

    const clientConfig = {
      credential: {
        secretId: process.env.TENCENTCLOUD_SECRET_ID,
        secretKey: process.env.TENCENTCLOUD_SECRET_KEY,
      },
      region: "ap-guangzhou",
      profile: {
        httpProfile: {
          endpoint: "ai3d.tencentcloudapi.com",
        },
      },
    };

    if (
      !clientConfig.credential.secretId ||
      !clientConfig.credential.secretKey
    ) {
      return NextResponse.json(
        { error: "Missing TENCENTCLOUD_SECRET_ID or TENCENTCLOUD_SECRET_KEY." },
        { status: 500 }
      );
    }

    const client = new Ai3dClient(clientConfig);

    const params: SubmitHunyuanTo3DJobRequest = {
      ResultFormat: resultFormat,
      EnablePBR: enablePBR,
      ...extraParams,
    };

    if (prompt) params.Prompt = prompt;
    if (imageUrl) params.ImageUrl = imageUrl;
    if (imageBase64) params.ImageBase64 = imageBase64;
    if (Array.isArray(multiViewImages) && multiViewImages.length > 0) {
      const normalized = multiViewImages
        .map((v) => {
          const ViewType = (v as any).ViewType ?? (v as any).viewType;
          const ViewImageUrl =
            (v as any).ViewImageUrl ?? (v as any).viewImageUrl;
          if (!ViewType || !ViewImageUrl) return null;
          return { ViewType, ViewImageUrl };
        })
        .filter(Boolean) as { ViewType: string; ViewImageUrl: string }[];
      if (normalized.length > 0) {
        params.MultiViewImages = normalized;
      }
    }

    const data = await client.SubmitHunyuanTo3DJob(params);

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("/api/hunyuan3d error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
