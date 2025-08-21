import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const providedKey = (form.get("key") as string | null) || undefined;
    if (!file) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const bucket = process.env.COS_BUCKET;
    const region = process.env.COS_REGION || "ap-guangzhou";
    const secretId = process.env.TENCENTCLOUD_SECRET_ID;
    const secretKey = process.env.TENCENTCLOUD_SECRET_KEY;

    if (!bucket) {
      console.error("[upload:POST] Missing COS_BUCKET env var");
      return NextResponse.json(
        { error: "Missing COS_BUCKET" },
        { status: 500 }
      );
    }
    if (!secretId || !secretKey) {
      console.error("[upload:POST] Missing Tencent credentials");
      return NextResponse.json(
        { error: "Missing TENCENTCLOUD credentials" },
        { status: 500 }
      );
    }

    const extFromName = (() => {
      const name = (file as any).name as string | undefined;
      if (!name) return undefined;
      const idx = name.lastIndexOf(".");
      return idx >= 0 ? name.slice(idx + 1).toLowerCase() : undefined;
    })();
    const extFromType = (() => {
      const t = file.type || "";
      if (t.startsWith("image/")) return t.split("/")[1];
      return undefined;
    })();
    const inferredExt = extFromName || extFromType || "jpg";
    const key = providedKey || `uploads/${crypto.randomUUID()}.${inferredExt}`;

    console.log(
      `[upload:POST] start upload: key=${key}, size=${file.size}, type=${file.type}`
    );

    const s3 = new S3Client({
      region,
      endpoint: `https://cos.${region}.myqcloud.com`,
      credentials: {
        accessKeyId: secretId,
        secretAccessKey: secretKey,
      },
    });

    const arrayBuffer = await file.arrayBuffer();
    const body = Buffer.from(arrayBuffer);
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: file.type || "image/jpeg",
        ACL: "public-read",
      })
    );

    const publicUrl = `https://${bucket}.cos.${region}.myqcloud.com/${key}`;
    console.log(`[upload:POST] upload success: key=${key}`);
    return NextResponse.json({ publicUrl, key });
  } catch (error: any) {
    console.error(
      "[upload:POST] error:",
      error?.stack || error?.message || error
    );
    return NextResponse.json(
      { error: error?.message || "Upload failed" },
      { status: 500 }
    );
  }
}
