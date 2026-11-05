const Listing = require("../models/listing");

const demoListings = [
  {
    demoKey: "popular-demo-agra",
    isDemo: true,
    title: "Taj View Guesthouse (Demo Stay)",
    description: "Sample stay for previewing the Agra booking flow. This demo listing uses sample details and a sample nightly rate.",
    image: {
      filename: "demo-agra",
      url: "https://images.unsplash.com/photo-1523979934836-981ca2ded72f?auto=format&fit=crop&w=900&q=80",
    },
    price: 5500,
    rooms: 4,
    location: "Taj Mahal, Agra",
    country: "India",
    categories: ["city-breaks"],
  },
  {
    demoKey: "popular-demo-delhi",
    isDemo: true,
    title: "India Gate City Stay (Demo Stay)",
    description: "Sample stay for previewing the Delhi booking flow. This demo listing uses sample details and a sample nightly rate.",
    image: {
      filename: "demo-delhi",
      url: "https://images.unsplash.com/photo-1609258678760-ba05d9b95bb9?auto=format&fit=crop&w=900&q=80",
    },
    price: 4800,
    rooms: 3,
    location: "Delhi",
    country: "India",
    categories: ["city-breaks"],
  },
  {
    demoKey: "popular-demo-amritsar",
    isDemo: true,
    title: "Golden Temple Guesthouse (Demo Stay)",
    description: "Sample stay for previewing the Amritsar booking flow. This demo listing uses sample details and a sample nightly rate.",
    image: {
      filename: "demo-amritsar",
      url: "https://images.unsplash.com/photo-1676490081752-2cd8404a8609?auto=format&fit=crop&w=900&q=80",
    },
    price: 3600,
    rooms: 2,
    location: "Amritsar, Punjab",
    country: "India",
    categories: ["city-breaks"],
  },
];

module.exports = async function ensureDemoListings() {
  for (const listing of demoListings) {
    try {
      await Listing.updateOne(
        { demoKey: listing.demoKey },
        { $setOnInsert: listing },
        { upsert: true }
      );
    } catch (error) {
      // Concurrent app starts can race on the unique demoKey index; the winner
      // creates the listing and the other process can safely continue.
      if (error.code !== 11000) throw error;
    }
  }
};
