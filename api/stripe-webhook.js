// api/stripe-webhook.js
export const config = { api: { bodyParser: false } };

import Stripe from 'stripe';
import { buffer } from 'micro';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2022-11-15',
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method not allowed');
  }

  // Verify signature
  let event;
  try {
    const buf = await buffer(req);
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(
      buf,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle events (log for now)
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        console.log('✅ checkout.session.completed', event.data.object.id);
        break;
      case 'payment_intent.succeeded':
        console.log('✅ payment_intent.succeeded', event.data.object.id);
        break;
      default:
        console.log('ℹ️ Unhandled event:', event.type);
    }
  } catch (err) {
    console.error('Handler error:', err);
    // still ack so Stripe stops retrying while we iterate
  }

  return res.status(200).json({ received: true });
}
