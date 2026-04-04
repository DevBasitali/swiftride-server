import express from "express";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware.js";
import { requireApprovedKyc } from "../middlewares/kyc.middleware.js";
import { carUpload } from "../config/multer.js";
import * as carController from "../controllers/car.controller.js";
import { validate } from "../middlewares/validation.middleware.js";
import { searchCarsSchema } from "../validations/car.validation.js";

const router = express.Router();

// 1) List / Search (public)
router.get("/", validate(searchCarsSchema, "query"), carController.searchCars);

// 2) My cars (protected) - MUST be before "/:carId"
router.get(
  "/me",
  authenticate,
  authorizeRoles("host", "showroom"),
  carController.getMyCars
);

// --- ADMIN ROUTES ---
router.get(
  "/admin/list/:status", // e.g., pending, approved
  authenticate,
  authorizeRoles("admin"),
  carController.getCarsByStatus
);

router.patch(
  "/admin/:carId/approve",
  authenticate,
  authorizeRoles("admin"),
  carController.approveCar
);

router.patch(
  "/admin/:carId/reject",
  authenticate,
  authorizeRoles("admin"),
  carController.rejectCar
);

router.patch(
  "/admin/:carId/suspend",
  authenticate,
  authorizeRoles("admin"),
  carController.suspendCar
);
// --------------------

// 3) Create (protected)
router.post(
  "/",
  authenticate,
  authorizeRoles("host", "showroom"),
  requireApprovedKyc,
  carUpload.fields([
    { name: "photos", maxCount: 10 },
    { name: "insuranceDoc", maxCount: 1 } // + Insurance
  ]),
  carController.createCar
);

// 4) Public detail
router.get("/:carId", carController.getCarById);

// 5) Update (protected)
router.patch(
  "/:carId",
  authenticate,
  authorizeRoles("host", "showroom", "admin"), // Admin can also edit? Or just status.
  carUpload.fields([
    { name: "photos", maxCount: 10 },
    { name: "insuranceDoc", maxCount: 1 }
  ]),
  carController.updateCar
);

// 6) Delete (protected)
router.delete(
  "/:carId",
  authenticate,
  authorizeRoles("host", "showroom", "admin"),
  carController.deleteCar
);

export default router;
