// server.js
import express from "express";
import dotenv from "dotenv";
dotenv.config();

import Stripe from "stripe";
import path from "path";
import { fileURLToPath } from "url";
import bodyParser from "body-parser"; // needed for webhook raw body

// --------------------
// Setup paths & Stripe
// --------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

console.log("Stripe key loaded:", !!process.env.STRIPE_SECRET_KEY);

// --------------------
// Middleware
// --------------------
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json()); // JSON bodies
// Webhooks need raw body
app.use("/webhook", bodyParser.raw({ type: "application/json" }));

// --------------------
// Test Stripe key
// --------------------
app.get("/test-stripe-key", (req, res) => {
  res.send(`Stripe key is loaded: ${!!process.env.STRIPE_SECRET_KEY}`);
});

// --------------------
// Create Checkout Session
// --------------------
app.post("/create-checkout-session", async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: req.body.items.map(item => ({
        price_data: {
          currency: "dkk",
          product_data: { name: item.name },
          unit_amount: item.price * 100,
        },
        quantity: item.quantity,
      })),
      shipping_address_collection: {
        allowed_countries: ["DK"], // add your countries
      },
      success_url: "https://www.forlaget-umbra.dk/success.html?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://www.forlaget-umbra.dk/cancel.html",
    });

    res.json({ url: session.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// --------------------
// Fetch Checkout Session details
// --------------------
app.get("/checkout-session", async (req, res) => {
  const sessionId = req.query.session_id;
  if (!sessionId) return res.status(400).json({ error: "No session ID provided" });

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items.data.price.product", "customer_details", "shipping"]
    });

    res.json(session);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------
// Stripe Webhook (for storing info in DB)
// --------------------
app.post("/webhook", (req, res) => {
  const sig = req.headers["stripe-signature"];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET; // set in your .env
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error("Webhook signature verification failed.", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the checkout.session.completed event
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    // session.shipping contains shipping address
    // session.customer_details contains name, email, phone
    console.log("Payment succeeded!");
    console.log("Shipping:", session.shipping);
    console.log("Customer:", session.customer_details);

    // TODO: store session info in your SQL database
    // e.g., INSERT INTO orders(...) VALUES(...)
  }

  res.json({ received: true });
});

// --------------------
// Start server
// --------------------
const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
