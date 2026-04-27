import { Car } from "../models/car.model.js";
import { USER_ROLE } from "../models/user.model.js";
import mongoose from "mongoose";
import ApiError from "../utils/ApiError.js";
import httpStatus from "http-status";

const MAX_CARS_PER_USER = Number(process.env.MAX_CARS_PER_USER || 20);

export const createCar = async (ownerId, ownerRole, payload) => {
  // 1. Role check
  if (![USER_ROLE.HOST, USER_ROLE.SHOWROOM].includes(ownerRole)) {
    throw new ApiError(httpStatus.FORBIDDEN, "Only hosts or showrooms can list cars");
  }

  // 2. Per-user car limit
  const existingCount = await Car.countDocuments({ owner: ownerId });
  if (existingCount >= MAX_CARS_PER_USER) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `You have reached the maximum car limit (${MAX_CARS_PER_USER})`
    );
  }

  // 3. Validation
  if (!payload.make || !payload.model || !payload.year || !payload.plateNumber) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Make, model, year and plate number are required"
    );
  }

  // 4. Create car (Status: Pending Review)
  const car = await Car.create({
    ...payload,
    owner: ownerId,
    ownerRole: ownerRole,
    approvalStatus: "pending" // Default
  });

  return car;
};

// --- ADMIN ACTIONS ---

export const getCarsByStatus = async (status) => {
  return await Car.find({ approvalStatus: status })
    .populate("owner", "fullName email phoneNumber")
    .sort({ createdAt: -1 });
};

export const approveCar = async (carId, adminId) => {
  const car = await Car.findById(carId);
  if (!car) throw new ApiError(httpStatus.NOT_FOUND, "Car not found");

  car.approvalStatus = "approved";
  car.approvedBy = adminId;
  car.approvedAt = new Date();
  car.rejectionReason = undefined; // Clear previous rejection
  
  await car.save();
  return car;
};

export const rejectCar = async (carId, reason, adminId) => {
  const car = await Car.findById(carId);
  if (!car) throw new ApiError(httpStatus.NOT_FOUND, "Car not found");

  // Increment attempts
  car.reviewAttempts = (car.reviewAttempts || 0) + 1;

  if (car.reviewAttempts >= 3) {
    car.approvalStatus = "rejected";
    car.isPermanentlyBanned = true;
    car.rejectionReason = `Permanently Banned: Maximum review attempts (3) exceeded. Last reason: ${reason}`;
  } else {
    car.approvalStatus = "rejected";
    car.rejectionReason = reason;
  }
  
  // car.adminNotes = reason; // Optional: keep logs
  
  await car.save();
  return car;
};

export const suspendCar = async (carId, reason) => {
  const car = await Car.findById(carId);
  if (!car) throw new ApiError(httpStatus.NOT_FOUND, "Car not found");

  car.approvalStatus = "suspended";
  car.adminNotes = reason;
  
  await car.save();
  return car;
};

export const getMyCars = async (ownerId) => {
  return await Car.find({ owner: ownerId });
};


export const searchCars = async (query) => {
  const { brand, minPrice, maxPrice } = query;
  
  // Only show APPROVED and ACTIVE cars
  const filter = { 
    approvalStatus: "approved", 
    isActive: true 
  };

  if (brand) filter.make = { $regex: brand, $options: "i" };
  if (minPrice || maxPrice) {
    filter.pricePerDay = {};
    if (minPrice) filter.pricePerDay.$gte = Number(minPrice);
    if (maxPrice) filter.pricePerDay.$lte = Number(maxPrice);
  }
  
  return await Car.find(filter);
};

// Update Car
export const updateCar = async (carId, userId, updateBody) => {
  const car = await Car.findById(carId);
  if (!car) {
    throw new ApiError(httpStatus.NOT_FOUND, "Car not found");
  }

  // Security: Check ownership
  if (car.owner.toString() !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, "You are not authorized to update this car");
  }

  // New: Check if banned
  if (car.isPermanentlyBanned) {
    throw new ApiError(httpStatus.BAD_REQUEST, "This car is permanently banned and cannot be updated.");
  }

  // If updating insurance or registration, reset approval
  if (updateBody.plateNumber || updateBody.insuranceDetails || (car.approvalStatus === 'rejected' && !car.isPermanentlyBanned)) {
    car.approvalStatus = "pending";
    // Optional: Only if it was approved/rejected?
    // User might be fixing a rejection, so 'pending' is correct.
  }

  // Update fields
  Object.assign(car, updateBody);
  await car.save();
  return car;
};

// ✅ NEW: Delete Car
export const deleteCar = async (carId, userId) => {
  const car = await Car.findById(carId);
  if (!car) {
    throw new ApiError(httpStatus.NOT_FOUND, "Car not found");
  }

  if (car.owner.toString() !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, "You are not authorized to delete this car");
  }

  await Car.findByIdAndDelete(carId);
  return car;
};



export const getCarById = async (carId) => {
  if (!mongoose.Types.ObjectId.isValid(carId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid car id");
  }

  const car = await Car.findById(carId)
    .populate("owner", "fullName showroomName role email phoneNumber")
    .lean();

  if (!car) {
    throw new ApiError(httpStatus.NOT_FOUND, "Car not found");
  }

  return car;
};