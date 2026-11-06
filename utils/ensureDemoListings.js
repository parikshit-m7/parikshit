const Listing = require("../models/listing");
const Booking = require("../models/booking");

// Seed bookable showcase stays for popular Indian destinations that do not
// yet have a listing. These remain tagged internally so they can be managed
// separately from host submitted listings.
const featuredStays = [
  {
    demoKey: "popular-demo-agra",
    isDemo: false,
    title: "Taj View Guesthouse",
    description: "A comfortable guesthouse base for exploring Agra's heritage and the Taj Mahal.",
    image: { filename: "agra-hotel", url: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=80" },
    price: 5500,
    rooms: 4,
    location: "Taj Mahal, Agra",
    country: "India",
    categories: ["city-breaks"],
    geometry: { type: "Point", coordinates: [78.0421, 27.1751] },
  },
  {
    demoKey: "popular-demo-delhi",
    isDemo: false,
    title: "India Gate City Hotel",
    description: "A city stay with convenient access to Delhi's landmarks, markets and museums.",
    image: { filename: "delhi-hotel", url: "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=900&q=80" },
    price: 4800,
    rooms: 3,
    location: "India Gate, New Delhi",
    country: "India",
    categories: ["city-breaks"],
    geometry: { type: "Point", coordinates: [77.2295, 28.6129] },
  },
  {
    demoKey: "popular-demo-amritsar",
    isDemo: false,
    title: "Golden Temple Guesthouse",
    description: "A welcoming guesthouse for visiting the Golden Temple and Amritsar's old city.",
    image: { filename: "amritsar-hotel", url: "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=900&q=80" },
    price: 3600,
    rooms: 2,
    location: "Golden Temple, Amritsar, Punjab",
    country: "India",
    categories: ["city-breaks"],
    geometry: { type: "Point", coordinates: [74.8723, 31.634] },
  },
  {
    demoKey: "popular-demo-varanasi",
    isDemo: false,
    title: "Varanasi Riverside Heritage Hotel",
    description: "A heritage-style stay for exploring Varanasi's ghats, temples and old lanes.",
    image: { filename: "varanasi-hotel", url: "https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=900&q=80" },
    price: 3200,
    rooms: 3,
    location: "Assi Ghat, Varanasi, Uttar Pradesh",
    country: "India",
    categories: ["city-breaks", "by-water"],
    geometry: { type: "Point", coordinates: [83.0107, 25.282] },
  },
  {
    demoKey: "popular-demo-jaipur",
    isDemo: false,
    title: "Jaipur Pink City Heritage Hotel",
    description: "A heritage-inspired hotel for discovering Jaipur's old city and historic landmarks.",
    image: { filename: "jaipur-hotel", url: "https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=900&q=80" },
    price: 4800,
    rooms: 3,
    location: "Pink City, Jaipur, Rajasthan",
    country: "India",
    categories: ["city-breaks"],
    geometry: { type: "Point", coordinates: [75.7873, 26.9124] },
  },
  {
    demoKey: "popular-demo-kerala",
    isDemo: false,
    title: "Kerala Backwater Boutique Stay",
    description: "A relaxing stay for discovering Kerala's backwaters and nearby village life.",
    image: { filename: "kerala-hotel", url: "https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=900&q=80" },
    price: 7200,
    rooms: 2,
    location: "Alleppey, Kerala",
    country: "India",
    categories: ["by-water", "slow-stays"],
    geometry: { type: "Point", coordinates: [76.3388, 9.4981] },
  },
  {
    demoKey: "popular-demo-manali",
    isDemo: false,
    title: "Manali Mountain View Hotel",
    description: "A hillside stay for enjoying Manali's mountain scenery and nearby walking trails.",
    image: { filename: "manali-hotel", url: "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?auto=format&fit=crop&w=900&q=80" },
    price: 5200,
    rooms: 3,
    location: "Old Manali, Himachal Pradesh",
    country: "India",
    categories: ["mountains", "outdoors"],
    geometry: { type: "Point", coordinates: [77.1887, 32.2432] },
  },
  {
    demoKey: "popular-demo-ayodhya",
    isDemo: false,
    title: "Ayodhya Heritage Hotel",
    description: "A convenient stay for visiting Ayodhya's temple district and riverside ghats.",
    image: { filename: "ayodhya-hotel", url: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=900&q=80" },
    price: 4200,
    rooms: 3,
    location: "Ram Mandir, Ayodhya, Uttar Pradesh",
    country: "India",
    categories: ["city-breaks"],
    geometry: { type: "Point", coordinates: [82.1943, 26.7922] },
  },
  {
    demoKey: "popular-demo-mysuru",
    isDemo: false,
    title: "Mysuru Palace Garden Hotel",
    description: "A relaxed city stay for discovering Mysuru Palace, gardens and local markets.",
    image: { filename: "mysuru-hotel", url: "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=900&q=80" },
    price: 3900,
    rooms: 2,
    location: "Mysuru Palace, Mysuru, Karnataka",
    country: "India",
    categories: ["city-breaks"],
    geometry: { type: "Point", coordinates: [76.6552, 12.3052] },
  },
  {
    demoKey: "popular-demo-rishikesh-hidden-gem",
    isDemo: false,
    title: "Rishikesh Forestside Courtyard Stay",
    description: "A tucked-away courtyard stay near quiet walking paths, riverside cafés and the foothills.",
    image: { filename: "rishikesh-hidden-gem", url: "https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=900&q=80" },
    price: 4100,
    rooms: 2,
    location: "Tapovan, Rishikesh, Uttarakhand",
    country: "India",
    categories: ["hidden-gems", "outdoors", "by-water"],
    geometry: { type: "Point", coordinates: [78.3247, 30.1264] },
  },
];

module.exports = async function ensureDemoListings() {
  for (const { demoKey, ...listing } of featuredStays) {
    try {
      await Listing.updateOne(
        { demoKey },
        { $set: listing, $setOnInsert: { demoKey } },
        { upsert: true }
      );
    } catch (error) {
      // Concurrent app starts can race on the unique demoKey index; the winner
      // creates the listing and the other process can safely continue.
      if (error.code !== 11000) throw error;
    }
  }

  // Remove the duplicate showcase entry. Preserve it as archived if booking
  // history references it, so existing trips are not left without a stay.
  const duplicateUdaipurStay = await Listing.findOne({
    title: "Lakeside City Retreat",
    location: "Udaipur, Rajasthan",
  }).select("_id");
  if (duplicateUdaipurStay) {
    const hasBookingHistory = await Booking.exists({ listing: duplicateUdaipurStay._id });
    if (hasBookingHistory) {
      await Listing.updateOne({ _id: duplicateUdaipurStay._id }, { $set: { isArchived: true } });
    } else {
      await Listing.findOneAndDelete({ _id: duplicateUdaipurStay._id });
    }
  }
};
