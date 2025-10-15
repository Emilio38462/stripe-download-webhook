import Stripe from "stripe";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import nodemailer from "nodemailer";

export const config = { api: { bodyParser: false } };

async function rawBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY },
});

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const buf = await rawBody(req);
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email = session.customer_details?.email || session.customer_email;

    const bucket = process.env.S3_BUCKET;
    const expiresIn = 60 * 45; // 45 min
    const pdfKey = "books/verilog_book_v1.0.pdf";
    const zipKey = "books/labs_v1.0.zip";

    const pdfUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: pdfKey }), { expiresIn });
    const zipUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: zipKey }), { expiresIn });

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: "Your Verilog Course downloads",
      html: `
        <p>Thanks for your purchase!</p>
        <p>Download links (expire in ~45 minutes):</p>
        <ul>
          <li><a href="${pdfUrl}">Book (PDF)</a></li>
          <li><a href="${zipUrl}">Labs (ZIP)</a></li>
        </ul>
        <p>Need help? Reply to this email. Discord invite is on your success page.</p>
      `,
    });
  }

  res.json({ received: true });
}
