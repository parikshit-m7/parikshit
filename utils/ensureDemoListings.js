const Listing = require("../models/listing");
const Booking = require("../models/booking");

const destinations = [
  { key: "agra", name: "Agra", aliases: ["Agra", "Taj Mahal"], location: "Taj Mahal, Agra, Uttar Pradesh", coordinates: [78.0421, 27.1751], basePrice: 4200, defaultCategory: "city-breaks", nearby: "the Taj Mahal and Agra's heritage quarter" },
  { key: "varanasi", name: "Varanasi", aliases: ["Varanasi", "Banaras", "Benares"], location: "Assi Ghat, Varanasi, Uttar Pradesh", coordinates: [83.0107, 25.282], basePrice: 3200, defaultCategory: "by-water", nearby: "the ghats and old lanes of Varanasi" },
  { key: "jaipur", name: "Jaipur", aliases: ["Jaipur"], location: "Pink City, Jaipur, Rajasthan", coordinates: [75.7873, 26.9124], basePrice: 4800, defaultCategory: "city-breaks", nearby: "Jaipur's old city and historic landmarks" },
  { key: "goa", name: "Goa", aliases: ["Goa", "Candolim", "Panaji", "Calangute"], location: "Candolim, Goa", coordinates: [73.8278, 15.4909], basePrice: 5600, defaultCategory: "by-water", nearby: "Goa's beaches, villages and local cafés" },
  { key: "delhi", name: "Delhi", aliases: ["Delhi", "New Delhi"], location: "India Gate, New Delhi", coordinates: [77.2295, 28.6129], basePrice: 4800, defaultCategory: "city-breaks", nearby: "Delhi's museums, markets and historic sites" },
  { key: "kerala", name: "Kerala", aliases: ["Kerala", "Alleppey", "Alappuzha", "Kochi", "Munnar"], location: "Alleppey, Kerala", coordinates: [76.3388, 9.4981], basePrice: 6200, defaultCategory: "slow-stays", nearby: "Kerala's backwaters and village life" },
  { key: "udaipur", name: "Udaipur", aliases: ["Udaipur", "Lake Pichola"], location: "Lake Pichola, Udaipur, Rajasthan", coordinates: [73.6833, 24.576], basePrice: 5600, defaultCategory: "by-water", nearby: "Lake Pichola and Udaipur's old city" },
  { key: "manali", name: "Manali", aliases: ["Manali", "Old Manali"], location: "Old Manali, Himachal Pradesh", coordinates: [77.1887, 32.2432], basePrice: 5200, defaultCategory: "mountains", nearby: "Manali's mountain scenery and walking trails" },
  { key: "mumbai", name: "Mumbai", aliases: ["Mumbai", "Bombay", "Marine Drive"], location: "Marine Drive, Mumbai, Maharashtra", coordinates: [72.8777, 19.076], basePrice: 6800, defaultCategory: "by-water", nearby: "Mumbai's waterfront and city landmarks" },
  { key: "amritsar", name: "Amritsar", aliases: ["Amritsar", "Golden Temple"], location: "Golden Temple, Amritsar, Punjab", coordinates: [74.8723, 31.634], basePrice: 3600, defaultCategory: "city-breaks", nearby: "the Golden Temple and Amritsar's old city" },
  { key: "ayodhya", name: "Ayodhya", aliases: ["Ayodhya", "Ram Mandir"], location: "Ram Mandir, Ayodhya, Uttar Pradesh", coordinates: [82.1943, 26.7922], basePrice: 4200, defaultCategory: "city-breaks", nearby: "Ayodhya's temple district and riverside ghats" },
  { key: "mysuru", name: "Mysuru", aliases: ["Mysuru", "Mysore"], location: "Mysuru Palace, Mysuru, Karnataka", coordinates: [76.6552, 12.3052], basePrice: 3900, defaultCategory: "city-breaks", nearby: "Mysuru Palace, gardens and local markets" },
];

// Each destination has exactly one card in each of these seven tabs.
const stayStyles = [
  { key: "trending", name: "Signature Stay", description: "A popular starting point for exploring", priceDelta: 0 },
  { key: "slow-stays", name: "Slow Stay Escape", description: "A relaxed base for taking the day at your own pace in", priceDelta: 500 },
  { key: "city-breaks", name: "City Break Hotel", description: "A city stay for discovering", priceDelta: 300 },
  { key: "mountains", name: "Mountain Stay", description: "A mountain-inspired stay for planning time around", priceDelta: 800 },
  { key: "by-water", name: "By the Water Stay", description: "A waterside-style stay for exploring", priceDelta: 700 },
  { key: "outdoors", name: "Outdoor Escape Lodge", description: "An outdoors-focused base for exploring", priceDelta: 400 },
  { key: "hidden-gems", name: "Hidden Gem Stay", description: "A tucked-away stay for discovering", priceDelta: 200 },
];

// Hotel and resort photos are distinct within every destination's seven-card set.
const stayPhotos = [
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1511818966892-d7d671e672a2?auto=format&fit=crop&w=900&q=80",
];

const validCategories = stayStyles.map((style) => style.key);
const matrixKeys = new Set(destinations.flatMap((destination) =>
  stayStyles.map((style) => `${destination.key}:${style.key}`)
));

function photoIdentity(url) {
  return String(url || "").split("?")[0];
}

async function ensureFiveGalleryPhotos() {
  const listings = await Listing.find({ isMatrixStay: true, isArchived: { $ne: true } })
    .select("_id image.url gallery galleryIsSample");

  for (const listing of listings) {
    const gallery = listing.gallery || [];
    const existingCount = (listing.image?.url ? 1 : 0) + gallery.length;
    const hasOldSamplePhotos = gallery.some((photo) => String(photo.filename || "").startsWith("test-gallery-"));
    const isSample = listing.galleryIsSample || hasOldSamplePhotos;
    if (existingCount >= 5) {
      if (isSample && !listing.galleryIsSample) {
        await Listing.updateOne({ _id: listing._id }, { $set: { galleryIsSample: true } });
      }
      continue;
    }

    const used = new Set([listing.image?.url, ...gallery.map((photo) => photo.url)]
      .filter(Boolean).map(photoIdentity));
    const offset = Number.parseInt(String(listing._id).slice(-6), 16) % stayPhotos.length;
    const candidates = [...stayPhotos.slice(offset), ...stayPhotos.slice(0, offset)];
    const additions = candidates
      .filter((url) => !used.has(photoIdentity(url)))
      .slice(0, Math.max(0, 5 - existingCount))
      .map((url, index) => ({ url, filename: `sample-gallery-${listing._id}-${index + 1}` }));

    if (existingCount + additions.length >= 5) {
      await Listing.updateOne({ _id: listing._id }, {
        $set: { gallery: [...gallery, ...additions], galleryIsSample: true },
      });
    }
  }
}

function destinationForListing(listing) {
  const text = `${listing.title || ""} ${listing.location || ""}`;
  return destinations.find((destination) => destination.aliases.some((alias) =>
    new RegExp(`\\b${alias}\\b`, "i").test(text)
  ));
}

function inferredStyle(listing, destination) {
  const text = `${listing.title || ""} ${listing.description || ""} ${listing.location || ""}`.toLowerCase();
  if (/mountain|himalaya|hill|alpine|cabin/.test(text)) return "mountains";
  if (/beach|coast|waterfront|backwater|river|lake|ghat|marine|houseboat/.test(text)) return "by-water";
  if (/camp|trek|outdoor|forest|wildlife|nature/.test(text)) return "outdoors";
  if (/offbeat|hidden|secluded|courtyard|haveli|guesthouse|bungalow/.test(text)) return "hidden-gems";
  if (/slow|relax|peaceful|quiet|wellness|spa|garden/.test(text)) return "slow-stays";
  return destination.defaultCategory;
}

async function removeDuplicateUdaipurStay() {
  const duplicate = await Listing.findOne({
    title: "Lakeside City Retreat",
    location: "Udaipur, Rajasthan",
    isArchived: { $ne: true },
  }).select("_id");
  if (!duplicate) return;

  const hasBookingHistory = await Booking.exists({ listing: duplicate._id });
  if (hasBookingHistory) {
    await Listing.updateOne({ _id: duplicate._id }, { $set: { isArchived: true } });
  } else {
    await Listing.findOneAndDelete({ _id: duplicate._id });
  }
}

async function assignExistingListings(occupiedSlots, usedPhotos) {
  const existingListings = await Listing.find({
    country: /^India$/i,
    isArchived: { $ne: true },
    isMatrixStay: { $ne: true },
  }).sort({ _id: 1 });

  for (const listing of existingListings) {
    const destination = destinationForListing(listing);
    if (!destination) {
      await Listing.updateOne({ _id: listing._id }, { $set: { isArchived: true } });
      continue;
    }

    const taggedStyles = (listing.categories || []).filter((category) => validCategories.includes(category));
    const preferredStyles = [...new Set([
      listing.browseCategory,
      ...taggedStyles,
      inferredStyle(listing, destination),
      "trending",
      ...validCategories,
    ].filter((style) => validCategories.includes(style)))];
    const style = preferredStyles.find((candidate) =>
      !occupiedSlots.has(`${destination.key}:${candidate}`)
    );
    if (!style) {
      await Listing.updateOne({ _id: listing._id }, { $set: { isArchived: true } });
      continue;
    }

    const matrixKey = `${destination.key}:${style}`;
    const photosForDestination = usedPhotos.get(destination.key);
    const photoUrl = listing.image?.url;
    let imageUpdate = {};
    if (!photoUrl || photosForDestination.has(photoIdentity(photoUrl))) {
      const styleIndex = stayStyles.findIndex((item) => item.key === style);
      const replacementUrl = nextPhoto(destination, styleIndex, photosForDestination);
      imageUpdate = { image: { filename: `${destination.key}-${style}`, url: replacementUrl } };
    } else {
      photosForDestination.add(photoIdentity(photoUrl));
    }
    await Listing.updateOne({ _id: listing._id }, {
      $set: {
        matrixKey,
        destinationKey: destination.key,
        browseCategory: style,
        isMatrixStay: true,
        isArchived: false,
        ...imageUpdate,
        ...(listing.geometry?.type === "Point" ? {} : {
          geometry: { type: "Point", coordinates: destination.coordinates },
        }),
      },
    });
    occupiedSlots.add(matrixKey);
  }
}

function nextPhoto(destination, styleIndex, usedPhotos) {
  const start = (destinations.findIndex((item) => item.key === destination.key) + styleIndex) % stayPhotos.length;
  for (let offset = 0; offset < stayPhotos.length; offset += 1) {
    const url = stayPhotos[(start + offset) % stayPhotos.length];
    if (!usedPhotos.has(photoIdentity(url))) {
      usedPhotos.add(photoIdentity(url));
      return url;
    }
  }
  const url = stayPhotos[start];
  usedPhotos.add(photoIdentity(url));
  return url;
}

async function seedMissingMatrixListings(occupiedSlots, usedPhotos) {
  for (let destinationIndex = 0; destinationIndex < destinations.length; destinationIndex += 1) {
    const destination = destinations[destinationIndex];
    for (let styleIndex = 0; styleIndex < stayStyles.length; styleIndex += 1) {
      const style = stayStyles[styleIndex];
      const matrixKey = `${destination.key}:${style.key}`;
      if (occupiedSlots.has(matrixKey)) continue;

      const imageUrl = nextPhoto(destination, styleIndex, usedPhotos.get(destination.key));
      const listing = {
        matrixKey,
        destinationKey: destination.key,
        browseCategory: style.key,
        isMatrixStay: true,
        isArchived: false,
        isDemo: false,
        title: `${destination.name} ${style.name}`,
        description: `${style.description} ${destination.nearby}. Curated preview stay with sample rate and room count.`,
        image: { filename: `${destination.key}-${style.key}`, url: imageUrl },
        price: destination.basePrice + style.priceDelta,
        rooms: 2 + ((destinationIndex + styleIndex) % 3),
        location: destination.location,
        country: "India",
        categories: style.key === "trending" ? [] : [style.key],
        geometry: { type: "Point", coordinates: destination.coordinates },
      };

      try {
        await Listing.updateOne(
          { matrixKey },
          { $setOnInsert: listing },
          { upsert: true }
        );
      } catch (error) {
        if (error.code !== 11000) throw error;
      }
      occupiedSlots.add(matrixKey);
    }
  }
}

module.exports = async function ensureDemoListings() {
  await removeDuplicateUdaipurStay();

  const occupiedSlots = new Set();
  const existingMatrixListings = await Listing.find({
    isMatrixStay: true,
    isArchived: { $ne: true },
  }).select("matrixKey destinationKey image.url");
  const usedPhotos = new Map(destinations.map((destination) => [destination.key, new Set()]));
  for (const listing of existingMatrixListings) {
    if (matrixKeys.has(listing.matrixKey)) {
      occupiedSlots.add(listing.matrixKey);
      usedPhotos.get(listing.destinationKey)?.add(photoIdentity(listing.image?.url));
    }
  }

  await assignExistingListings(occupiedSlots, usedPhotos);
  await seedMissingMatrixListings(occupiedSlots, usedPhotos);
  // The public catalogue is the 12 × 7 destination/category matrix. Older
  // India listings outside that matrix stay in MongoDB for history, but are
  // archived from new search results and bookings.
  await Listing.updateMany({
    country: /^India$/i,
    isArchived: { $ne: true },
    $or: [
      { isMatrixStay: { $ne: true } },
      { matrixKey: { $nin: [...matrixKeys] } },
    ],
    }, { $set: { isArchived: true } });

  await ensureFiveGalleryPhotos();
  const publicListingContactPhone = String(
    process.env.PUBLIC_LISTING_CONTACT_PHONE || process.env.FEATURED_LISTING_CONTACT_PHONE || ""
  ).trim();
  if (publicListingContactPhone) {
    await Listing.updateMany(
      {
        isMatrixStay: true,
        isArchived: { $ne: true },
      },
      { $set: { contactPhone: publicListingContactPhone } }
    );
  }
};

module.exports.destinations = destinations;
module.exports.stayStyles = stayStyles;
