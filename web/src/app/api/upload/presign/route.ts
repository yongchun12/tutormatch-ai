import { NextResponse } from "next/server";
import { requireRole, authorizationErrorResponse } from "@/lib/authz";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Ensure environment variables are loaded
const region = process.env.AWS_REGION || "ap-southeast-1"; // Default to Singapore region if not specified
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const bucketName = process.env.AWS_S3_BUCKET_NAME;

const s3Client = new S3Client({
  region: region,
  credentials: {
    accessKeyId: accessKeyId || "",
    secretAccessKey: secretAccessKey || "",
  },
});

export async function POST(request: Request) {
  try {
    // Only allow centre owners to upload media
    const user = await requireRole("owner");

    if (!accessKeyId || !secretAccessKey || !bucketName) {
      console.error("AWS S3 credentials missing from environment variables.");
      return NextResponse.json({ error: "Storage not configured." }, { status: 500 });
    }

    const { filename, contentType } = await request.json();

    if (!filename || !contentType) {
      return NextResponse.json({ error: "Filename and contentType are required" }, { status: 400 });
    }

    // Validate file type (only allow images)
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Only images are allowed" }, { status: 400 });
    }

    // Generate a secure random filename to prevent collisions and directory traversal
    const uniqueId = crypto.randomUUID();
    const extension = filename.split(".").pop();
    const objectKey = `galleries/${user.id}/${uniqueId}.${extension}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      ContentType: contentType,
    });

    // Generate a signed URL that expires in 60 seconds
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });
    const publicUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${objectKey}`;

    return NextResponse.json({ signedUrl, publicUrl, objectKey });
  } catch (error: any) {
    const denied = authorizationErrorResponse(error);
    if (denied) return denied;

    console.error("Presign URL Generation Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
