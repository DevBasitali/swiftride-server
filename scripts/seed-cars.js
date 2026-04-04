/**
 * 🚗 SwiftRide Bulk Car Seeder
 * 
 * Usage:
 *   node scripts/seed-cars.js               → Seeds 20 cars (default)
 *   node scripts/seed-cars.js 50            → Seeds 50 cars
 *   node scripts/seed-cars.js --clear       → Clears ALL seeded cars first, then seeds 20
 *   node scripts/seed-cars.js 30 --clear    → Clears then seeds 30
 *
 * Prerequisites:
 *   - Your server .env must have MONGO_URI set
 *   - At least one user with role "host" must exist in the DB
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import { Car } from "../src/models/car.model.js";
import { User } from "../src/models/user.model.js";

dotenv.config();

// ============================================
// 📦 CAR DATA POOLS
// ============================================

const MAKES_MODELS = [
  { make: "Toyota", models: ["Corolla", "Yaris", "Camry", "Land Cruiser", "Hilux", "Fortuner", "Prado"] },
  { make: "Honda", models: ["Civic", "City", "BR-V", "HR-V", "Accord", "Vezel"] },
  { make: "Suzuki", models: ["Alto", "Cultus", "Swift", "WagonR", "Mehran", "Bolan", "Jimny"] },
  { make: "Hyundai", models: ["Tucson", "Elantra", "Sonata", "Santa Fe", "Ioniq"] },
  { make: "KIA", models: ["Sportage", "Picanto", "Sorento", "Carnival", "Stonic"] },
  { make: "BMW", models: ["3 Series", "5 Series", "X3", "X5", "7 Series"] },
  { make: "Mercedes", models: ["C-Class", "E-Class", "GLC", "GLE", "S-Class", "A-Class"] },
  { make: "Audi", models: ["A3", "A4", "A6", "Q5", "Q7", "A8"] },
  { make: "MG", models: ["HS", "ZS", "GT", "5", "3"] },
  { make: "Changan", models: ["Alsvin", "Oshan X7", "Karvaan", "M9 Pickup"] },
  { make: "Chery", models: ["Tiggo 4 Pro", "Tiggo 8 Pro", "Arrizo 6 Pro"] },
  { make: "Haval", models: ["H6", "Jolion", "H9"] },
  { make: "DFSK", models: ["Glory 580", "Glory 580 Pro"] },
  { make: "Proton", models: ["Saga", "X70", "X50"] },
  { make: "Nissan", models: ["Dayz", "Juke", "Kicks"] },
];

const COLORS = [
  "White", "Black", "Silver", "Grey", "Red", "Blue", "Pearl White",
  "Midnight Blue", "Burgundy", "Gun Metallic", "Champagne Gold", "Graphite",
  "Wine Red", "British Green", "Ice Blue", "Metallic Bronze"
];

const FEATURES_POOL = [
  "AC", "Bluetooth", "GPS Navigation", "Sunroof", "Cruise Control",
  "Heated Seats", "Leather Seats", "Backup Camera", "Apple CarPlay",
  "Android Auto", "Push Start", "Keyless Entry", "Parking Sensors",
  "Alloy Wheels", "USB Charging", "Dashcam", "Tinted Windows",
  "Fog Lights", "ABS", "Airbags", "Lane Assist", "Auto Headlights",
  "Wireless Charging", "Ambient Lighting"
];

const CITIES = [
  { name: "Islamabad, F-7", lat: 33.7215, lng: 73.0580 },
  { name: "Islamabad, F-10", lat: 33.6998, lng: 73.0166 },
  { name: "Islamabad, G-9", lat: 33.6913, lng: 73.0412 },
  { name: "Islamabad, Blue Area", lat: 33.7104, lng: 73.0612 },
  { name: "Islamabad, I-8", lat: 33.6686, lng: 73.0755 },
  { name: "Rawalpindi, Saddar", lat: 33.5937, lng: 73.0515 },
  { name: "Rawalpindi, Bahria Town", lat: 33.5260, lng: 73.0968 },
  { name: "Lahore, Gulberg", lat: 31.5204, lng: 74.3587 },
  { name: "Lahore, DHA Phase 5", lat: 31.4697, lng: 74.3780 },
  { name: "Lahore, Model Town", lat: 31.4826, lng: 74.3211 },
  { name: "Karachi, Clifton", lat: 24.8138, lng: 67.0300 },
  { name: "Karachi, DHA Phase 6", lat: 24.8003, lng: 67.0648 },
  { name: "Faisalabad, D Ground", lat: 31.4180, lng: 73.0790 },
  { name: "Peshawar, University Town", lat: 34.0151, lng: 71.5249 },
  { name: "Multan, Cantt", lat: 30.1984, lng: 71.4687 },
];

const INSURANCE_PROVIDERS = [
  "State Life Insurance", "EFU General Insurance", "Jubilee Insurance",
  "Askari Insurance", "Adamjee Insurance", "UBL Insurers", "IGI Insurance",
  "TPL Insurance", "Alfalah Insurance", "Atlas Insurance"
];

const PLACEHOLDER_PHOTOS = [
  "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800",
  "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800",
  "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800",
  "https://images.unsplash.com/photo-1542362567-b07e54358753?w=800",
  "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800",
  "https://images.unsplash.com/photo-1526726538690-5cbf956ae2fd?w=800",
  "https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=800",
  "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800",
  "https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=800",
  "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800",
];

// ============================================
// 🎲 HELPERS
// ============================================

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const generatePlateNumber = () => {
  const cities = ["ISB", "LHR", "KHI", "RWP", "FSD", "PSH", "MLT"];
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const city = pick(cities);
  const letter = letters[randInt(0, 25)] + letters[randInt(0, 25)];
  const num = randInt(100, 9999);
  return `${city}-${letter}-${num}`;
};

const pickFeatures = () => {
  const count = randInt(3, 8);
  const shuffled = [...FEATURES_POOL].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

const pickPhotos = () => {
  const count = randInt(2, 4);
  const shuffled = [...PLACEHOLDER_PHOTOS].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

const generateCar = (ownerId) => {
  const brand = pick(MAKES_MODELS);
  const model = pick(brand.models);
  const year = randInt(2015, 2026);
  const location = pick(CITIES);
  const transmission = pick(["Automatic", "Manual"]);
  const fuelType = pick(["Petrol", "Diesel", "Hybrid"]);
  const seats = pick([4, 5, 5, 5, 7, 8]); // 5-seaters most common
  const pricePerDay = randInt(3, 50) * 1000; // 3k - 50k PKR
  const pricePerHour = Math.round(pricePerDay / 8);
  const status = pick(["approved", "approved", "approved", "pending"]); // 75% approved

  const insuranceStart = new Date(2025, randInt(0, 11), randInt(1, 28));
  const insuranceExpiry = new Date(insuranceStart);
  insuranceExpiry.setFullYear(insuranceExpiry.getFullYear() + 1);

  return {
    owner: ownerId,
    ownerRole: "host",
    make: brand.make,
    model,
    year,
    color: pick(COLORS),
    plateNumber: generatePlateNumber(),
    pricePerDay,
    pricePerHour,
    seats,
    transmission,
    fuelType,
    photos: pickPhotos(),
    location: {
      address: location.name,
      lat: location.lat + (Math.random() - 0.5) * 0.01, // slight offset
      lng: location.lng + (Math.random() - 0.5) * 0.01,
    },
    availability: {
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6].filter(() => Math.random() > 0.15),
      startTime: pick(["06:00", "07:00", "08:00", "09:00"]),
      endTime: pick(["17:00", "18:00", "20:00", "22:00", "23:59"]),
      isAvailable: Math.random() > 0.1, // 90% available
    },
    features: pickFeatures(),
    approvalStatus: status,
    approvedAt: status === "approved" ? new Date() : undefined,
    isActive: Math.random() > 0.05, // 95% active
    insuranceDetails: {
      provider: pick(INSURANCE_PROVIDERS),
      policyNumber: `POL-${randInt(100000, 999999)}`,
      type: pick(["Third-Party", "Comprehensive"]),
      startDate: insuranceStart,
      expiryDate: insuranceExpiry,
    },
    description: `${year} ${brand.make} ${model} available for rent in ${location.name}. Well maintained, ${transmission.toLowerCase()} transmission, ${fuelType.toLowerCase()} engine. ${seats} seats.`,
  };
};

// ============================================
// 🚀 MAIN
// ============================================

const main = async () => {
  const args = process.argv.slice(2);
  const shouldClear = args.includes("--clear");
  const countArg = args.find((a) => !a.startsWith("--"));
  const count = countArg ? parseInt(countArg, 10) : 20;

  console.log("\n🚗 SwiftRide Car Seeder");
  console.log("=".repeat(40));

  try {
    // Connect
    await mongoose.connect(process.env.MONGO_URI, { dbName: "swiftride_db" });
    console.log("✅ Connected to MongoDB\n");

    // Find a host user to assign ownership
    const hostUsers = await User.find({ role: "host" }).limit(10).lean();
    if (hostUsers.length === 0) {
      console.log("❌ No host users found in database!");
      console.log("   Please create at least one host account first.\n");
      process.exit(1);
    }

    console.log(`📋 Found ${hostUsers.length} host(s):`);
    hostUsers.forEach((u) => console.log(`   → ${u.fullName || u.email} (${u._id})`));
    console.log();

    // Clear if requested
    if (shouldClear) {
      const deleted = await Car.deleteMany({
        owner: { $in: hostUsers.map((u) => u._id) },
      });
      console.log(`🗑️  Cleared ${deleted.deletedCount} existing cars\n`);
    }

    // Generate & Insert
    console.log(`🔄 Generating ${count} cars...\n`);
    const cars = [];
    for (let i = 0; i < count; i++) {
      const owner = pick(hostUsers);
      cars.push(generateCar(owner._id));
    }

    const inserted = await Car.insertMany(cars);
    console.log(`✅ Successfully inserted ${inserted.length} cars!\n`);

    // Summary
    const makeSummary = {};
    const statusSummary = {};
    inserted.forEach((car) => {
      makeSummary[car.make] = (makeSummary[car.make] || 0) + 1;
      statusSummary[car.approvalStatus] = (statusSummary[car.approvalStatus] || 0) + 1;
    });

    console.log("📊 Summary by Make:");
    Object.entries(makeSummary)
      .sort(([, a], [, b]) => b - a)
      .forEach(([make, cnt]) => console.log(`   ${make}: ${cnt}`));

    console.log("\n📊 Summary by Status:");
    Object.entries(statusSummary).forEach(([status, cnt]) =>
      console.log(`   ${status}: ${cnt}`)
    );

    console.log("\n🎉 Done! Your fleet is now populated.\n");
  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await mongoose.disconnect();
  }
};

main();
