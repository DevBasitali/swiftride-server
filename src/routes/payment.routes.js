import express from "express";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware.js";
import * as paymentController from "../controllers/payment.controller.js";

const router = express.Router();

// 1. Initialize Payment
router.post(
  "/booking/:bookingId/init",
  authenticate,
  authorizeRoles("customer"),
  paymentController.initBookingPayment
);

// 2. Callback / IPN
// Easypaisa uses GET for redirects and sometimes GET/POST for IPN depending on config.
// It's safest to allow both.
router.post("/easypaisa/callback", paymentController.easypaisaCallback);
router.get("/easypaisa/callback", paymentController.easypaisaCallback);



// ==========================================
// SAFEPAY ROUTES
// ==========================================

// 1. Initialize Payment (User calls this)
router.post(
  "/booking/:bookingId/safepay/init",
  authenticate,
  authorizeRoles("customer"),
  paymentController.initSafepayPayment
);

// 3. Late Fee Payment
router.post(
  "/booking/:bookingId/late-fee/safepay/init",
  authenticate,
  authorizeRoles("customer"),
  paymentController.initLateFeePayment
);

// 2. Webhook Listener (Safepay server calls this)
// Note: No auth middleware here, signature verification is handled in service
router.post("/safepay/webhook", paymentController.safepayWebhook);
export default router;