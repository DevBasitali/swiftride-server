// src/services/hostDashboard.service.js
import mongoose from "mongoose";
import { Car } from "../models/car.model.js";
import { Booking } from "../models/booking.model.js";

const toObjectId = (id) => new mongoose.Types.ObjectId(id);

export const getHostDashboardStats = async (userId) => {
  const ownerId = toObjectId(userId);
  const now = new Date();

  // Start of current month
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  // For monthly earnings: last 6 months (you can change to 12)
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const dayBeforeYesterday = new Date(now);
  dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);

  // 1) Quick stats in parallel
  const [
    totalCars,
    activeBookings,
    pendingRequests,
    totalEarningsAgg,
    thisMonthEarningsAgg,
    monthlyEarningsAgg,
    bookingStatusAgg,
    recentBookings,
    // Trend data
    recentActiveBookings,
    pendingToday,
    pendingYesterday,
    newCarsThisMonth,
    newTripsThisMonth
  ] = await Promise.all([
    // totalCars: active cars owned by this host/showroom
    Car.countDocuments({ owner: ownerId, isActive: true }),

    // activeBookings: confirmed or ongoing
    Booking.countDocuments({
      owner: ownerId,
      status: { $in: ["confirmed", "ongoing"] }
    }),

    // pendingRequests: pending bookings where this user is owner
    Booking.countDocuments({
      owner: ownerId,
      status: "pending"
    }),

    // totalEarnings: sum of ownerEarningAmount for paid bookings
    Booking.aggregate([
      {
        $match: {
          owner: ownerId,
          paymentStatus: "paid"
        }
      },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: "$ownerEarningAmount" }
        }
      }
    ]),

    // thisMonthEarnings: only bookings paid this month
    Booking.aggregate([
      {
        $match: {
          owner: ownerId,
          paymentStatus: "paid",
          createdAt: { $gte: startOfThisMonth, $lte: now }
        }
      },
      {
        $group: {
          _id: null,
          thisMonthEarnings: { $sum: "$ownerEarningAmount" }
        }
      }
    ]),

    // monthlyEarnings: aggregation over last 6 months
    Booking.aggregate([
      {
        $match: {
          owner: ownerId,
          paymentStatus: "paid",
          createdAt: { $gte: sixMonthsAgo, $lte: now }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" }
          },
          amount: { $sum: "$ownerEarningAmount" }
        }
      },
      {
        $sort: {
          "_id.year": 1,
          "_id.month": 1
        }
      }
    ]),

    // bookingStatus: counts of Completed / Cancelled / Upcoming using one pipeline
    Booking.aggregate([
      {
        $match: {
          owner: ownerId
        }
      },
      {
        $group: {
          _id: null,
          completed: {
            $sum: {
              $cond: [{ $eq: ["$status", "completed"] }, 1, 0]
            }
          },
          cancelled: {
            $sum: {
              $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0]
            }
          },
          upcoming: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ["$status", ["pending", "confirmed", "ongoing"]] },
                    { $gte: ["$startDateTime", now] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      }
    ]),

    // recentActivity: latest 5 bookings involving this owner
    Booking.find({ owner: ownerId })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("car", "make model")
      .lean(),

    // Trend queries
    Booking.countDocuments({
      owner: ownerId,
      status: { $in: ["confirmed", "ongoing"] },
      createdAt: { $gte: sevenDaysAgo }
    }),
    Booking.countDocuments({ owner: ownerId, status: "pending", createdAt: { $gte: yesterday } }),
    Booking.countDocuments({ owner: ownerId, status: "pending", createdAt: { $gte: dayBeforeYesterday, $lt: yesterday } }),
    Car.countDocuments({ owner: ownerId, createdAt: { $gte: thirtyDaysAgo } }),
    Booking.countDocuments({ owner: ownerId, createdAt: { $gte: startOfThisMonth } }),
  ]);

  const totalEarnings =
    totalEarningsAgg.length > 0 ? totalEarningsAgg[0].totalEarnings : 0;

  const thisMonthEarnings =
    thisMonthEarningsAgg.length > 0
      ? thisMonthEarningsAgg[0].thisMonthEarnings
      : 0;

  // Convert monthly earnings to desired format with month names
  const monthNamesShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const monthlyEarnings = monthlyEarningsAgg.map((item) => {
    const monthIndex = item._id.month - 1; // 0-based
    return {
      month: monthNamesShort[monthIndex],
      amount: item.amount
    };
  });

  // bookingStatus single-doc result -> array
  let bookingStatus = [
    { name: "Completed", value: 0 },
    { name: "Cancelled", value: 0 },
    { name: "Upcoming", value: 0 }
  ];

  if (bookingStatusAgg.length > 0) {
    const s = bookingStatusAgg[0];
    bookingStatus = [
      { name: "Completed", value: s.completed || 0 },
      { name: "Cancelled", value: s.cancelled || 0 },
      { name: "Upcoming", value: s.upcoming || 0 }
    ];
  }

  // recentActivity mapping
  const recentActivity = recentBookings.map((b) => ({
    id: b._id.toString(),
    type:
      b.status === "pending"
        ? "booking_request"
        : b.status === "confirmed"
          ? "booking_confirmed"
          : "booking_update",
    message: generateActivityMessage(b),
    date: b.createdAt
  }));

  // Trend calculation
  const activeBookingsTrend = `+${recentActiveBookings} this week`;
  const pendingDiff = pendingToday - pendingYesterday;
  const pendingRequestsTrend = pendingDiff >= 0 ? `+${pendingDiff} from yesterday` : `${pendingDiff} from yesterday`;
  const totalCarsTrend = `${newCarsThisMonth} newly added`;
  const totalBookingsTrend = `+${newTripsThisMonth} this month`;

  return {
    quickStats: {
      totalCars,
      activeBookings,
      pendingRequests,
      totalEarnings,
      thisMonthEarnings
    },
    trends: {
      activeBookingsTrend,
      pendingRequestsTrend,
      totalCarsTrend,
      totalBookingsTrend
    },
    charts: {
      monthlyEarnings,
      bookingStatus
    },
    recentActivity
  };
};

const generateActivityMessage = (booking) => {
  const car = booking.car;
  const carLabel = car
    ? `${car.make || ""} ${car.model || ""}`.trim()
    : "a car";

  if (booking.status === "pending") {
    return `New booking request for ${carLabel}`;
  }
  if (booking.status === "confirmed") {
    return `Booking confirmed for ${carLabel}`;
  }
  if (booking.status === "completed") {
    return `Booking completed for ${carLabel}`;
  }
  if (booking.status === "cancelled") {
    return `Booking cancelled for ${carLabel}`;
  }
  return `Booking updated for ${carLabel}`;
};
