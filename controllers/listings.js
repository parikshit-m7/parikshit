const Listing = require("../models/listing");
const Booking = require("../models/booking");
const { buildListingSearch } = require("../utils/listingSearch");
const matrixDestinations = require("../utils/ensureDemoListings").destinations;
const mbxGeocoding = require('@mapbox/mapbox-sdk/services/geocoding');
const mapToken = process.env.MAP_TOKEN;
const geocodingClient = mapToken ? mbxGeocoding({ accessToken: mapToken }) : null;
const popularDestinations = [
    { name: "Agra", terms: ["Agra"], image: "https://images.unsplash.com/photo-1523979934836-981ca2ded72f?auto=format&fit=crop&w=900&q=80" },
    { name: "Varanasi", terms: ["Varanasi"], image: "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=900&q=80" },
    { name: "Jaipur", terms: ["Jaipur"], image: "https://images.unsplash.com/photo-1706961121783-4ae6c933983a?auto=format&fit=crop&w=900&q=80" },
    { name: "Goa", terms: ["Goa"], image: "https://images.unsplash.com/photo-1552733407-5d5c46c3bb3b?auto=format&fit=crop&w=900&q=80" },
    { name: "Delhi", terms: ["Delhi"], image: "https://images.unsplash.com/photo-1609258678760-ba05d9b95bb9?auto=format&fit=crop&w=900&q=80" },
    { name: "Kerala", terms: ["Kerala", "Alleppey", "Alappuzha", "Munnar", "Kochi"], image: "https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=900&q=80" },
    { name: "Udaipur", terms: ["Udaipur"], image: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=900&q=80" },
    { name: "Manali", terms: ["Manali"], image: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=900&q=80" },
    { name: "Mumbai", terms: ["Mumbai"], image: "https://images.unsplash.com/photo-1511818966892-d7d671e672a2?auto=format&fit=crop&w=900&q=80" },
    { name: "Amritsar", terms: ["Amritsar"], image: "https://images.unsplash.com/photo-1676490081752-2cd8404a8609?auto=format&fit=crop&w=900&q=80" },
    { name: "Ayodhya", terms: ["Ayodhya"], image: "https://images.unsplash.com/photo-1606293926075-69a00dbfde81?auto=format&fit=crop&w=900&q=80" },
    { name: "Mysuru", terms: ["Mysuru", "Mysore"], image: "https://images.unsplash.com/photo-1600100397608-f0107a1b8993?auto=format&fit=crop&w=900&q=80" },
];


module.exports.index = async (req, res) => {
    const { mongoFilter, search } = buildListingSearch(req.query.search);
    const categoryOptions = ["trending", "slow-stays", "city-breaks", "mountains", "by-water", "outdoors", "hidden-gems"];
    const category = categoryOptions.includes(req.query.category) ? req.query.category : "";
    const normalizedSearch = String(req.query.search || "").trim().toLowerCase();
    const requestedDestination = matrixDestinations.find((destination) =>
        destination.key === req.query.destination ||
        destination.aliases.some((alias) => alias.toLowerCase() === normalizedSearch)
    );
    // Wanderlust is focused on stays in India, including nearby and price searches.
    const filter = {
        ...(requestedDestination ? {} : mongoFilter),
        country: /^India$/i,
        isArchived: { $ne: true },
        isMatrixStay: true,
    };
    if (requestedDestination) filter.destinationKey = requestedDestination.key;
    if (category) filter.browseCategory = category;
    const minPrice = Number(req.query.minPrice);
    const maxPrice = Number(req.query.maxPrice);

    if (req.query.minPrice !== undefined && req.query.minPrice !== "" && Number.isFinite(minPrice) && minPrice >= 0) {
        filter.price = { ...(filter.price || {}), $gte: minPrice };
    }
    if (req.query.maxPrice !== undefined && req.query.maxPrice !== "" && Number.isFinite(maxPrice) && maxPrice >= 0) {
        filter.price = { ...(filter.price || {}), $lte: maxPrice };
    }

    const latitude = Number(req.query.lat);
    const longitude = Number(req.query.lng);
    const requestedRadius = Number(req.query.radius);
    const hasLocation = req.query.lat !== undefined && req.query.lat !== "" &&
        req.query.lng !== undefined && req.query.lng !== "" &&
        Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
        Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
    const radiusKm = Number.isFinite(requestedRadius) && requestedRadius > 0
        ? Math.min(requestedRadius, 100)
        : 10;

    if (hasLocation) {
        // Older and seeded listings may not have coordinates yet. Geocode them
        // before the geo query so they can appear in nearby results without
        // requiring someone to open each listing first.
        if (geocodingClient) {
            const listingsWithoutCoordinates = await Listing.find({
                $or: [
                    { "geometry.coordinates": { $exists: false } },
                    { "geometry.coordinates": { $size: 0 } },
                ],
            }).limit(100);

            await Promise.allSettled(listingsWithoutCoordinates.map(async (listing) => {
                if (!listing.location) return;
                try {
                    const query = [listing.location, listing.country].filter(Boolean).join(", ");
                    const response = await geocodingClient
                        .forwardGeocode({ query, limit: 1 })
                        .send();
                    const geometry = response.body.features?.[0]?.geometry;
                    if (geometry?.type === "Point" && geometry.coordinates?.length === 2) {
                        listing.geometry = geometry;
                        await listing.save();
                    }
                } catch (error) {
                    console.log(`Could not geocode listing ${listing._id}:`, error.message);
                }
            }));
        }

        filter.geometry = {
            $near: {
                $geometry: { type: "Point", coordinates: [longitude, latitude] },
                $maxDistance: radiusKm * 1000,
            },
        };
    }

    // $near already sorts matching stays from nearest to farthest.
    const listingsQuery = Listing.find(filter).limit(100);
    if (!hasLocation) listingsQuery.sort({ _id: -1 });
    const allListings = await listingsQuery;
    if (category === "trending") {
        allListings.sort((a, b) => (b.reviews?.length || 0) - (a.reviews?.length || 0));
    }

    const destinationListings = await Listing.find({
        country: /^India$/i,
        isArchived: { $ne: true },
        isMatrixStay: true,
        browseCategory: "trending",
    }).sort({ price: 1 });
    const featuredDestinations = popularDestinations.map((destination) => {
        const destinationKey = matrixDestinations.find((item) => item.name === destination.name)?.key;
        const listing = destinationListings.find((candidate) => candidate.destinationKey === destinationKey);
        return { ...destination, listing };
    });
    const showUnfilteredFeatured = !requestedDestination && !search && !category && !hasLocation &&
        !req.query.minPrice && !req.query.maxPrice;
    const displayListings = showUnfilteredFeatured
        ? [...new Map([...allListings, ...featuredDestinations.map((destination) => destination.listing).filter(Boolean)]
            .map((listing) => [String(listing._id), listing])).values()]
        : allListings;

    res.render("listings/index.ejs", {
        allListings,
        displayListings,
        featuredDestinations,
        search: requestedDestination?.name || search,
        destinationKey: requestedDestination?.key || "",
        category,
        minPrice: req.query.minPrice || "",
        maxPrice: req.query.maxPrice || "",
        nearby: hasLocation,
        radiusKm,
        latitude: hasLocation ? latitude : "",
        longitude: hasLocation ? longitude : "",
    });
};

module.exports.renderNewForm = (req, res) => {
  res.render("listings/new.ejs");
};


module.exports.showListing = async (req, res) => {
    let { id } = req.params;

    const listing = await Listing.findById(id)
        .populate({
            path: "reviews",
            populate: {
                path: "author",
            },
        })
        .populate("owner");

    if (!listing) {
        req.flash("error", "Listing you requested does not exist!");
        return res.redirect("/listings");
    }

    // Old listings ke missing coordinates fix karo
    if (
        geocodingClient &&
        (!listing.geometry ||
        !listing.geometry.coordinates ||
        listing.geometry.coordinates.length !== 2)
    ) {
        try {
            const response = await geocodingClient
                .forwardGeocode({
                    query: listing.location,
                    limit: 1,
                })
                .send();

            if (response.body.features.length > 0) {
                listing.geometry = response.body.features[0].geometry;
                await listing.save();
            }
        } catch (err) {
            console.log("Geocoding error:", err.message);
        }
    }

    const todayISO = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    const galleryImages = [listing.image?.url || "https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8?auto=format&fit=crop&w=1400&q=80", ...(listing.gallery || []).map((photo) => photo.url)]
        .filter(Boolean)
        .slice(0, 10);
    res.render("listings/show.ejs", { listing, todayISO, galleryImages, isSampleGallery: listing.galleryIsSample });
};

module.exports.nearbyPlaces = async (req, res) => {
    const listing = await Listing.findById(req.params.id).select("geometry");
    const coordinates = listing?.geometry?.coordinates;
    if (!coordinates || coordinates.length !== 2 || !coordinates.every(Number.isFinite)) {
        return res.status(404).json({ message: "Map location is not available for this stay yet." });
    }

    const [longitude, latitude] = coordinates;
    const query = `[out:json][timeout:12];(nwr(around:5000,${latitude},${longitude})[amenity~"^(restaurant|cafe|fast_food|food_court)$"];nwr(around:5000,${latitude},${longitude})[tourism~"^(attraction|museum|viewpoint|zoo|theme_park)$"];nwr(around:5000,${latitude},${longitude})[railway~"^(station|halt)$"];nwr(around:5000,${latitude},${longitude})[amenity="bus_station"];nwr(around:5000,${latitude},${longitude})[highway="bus_stop"];nwr(around:5000,${latitude},${longitude})[aeroway="aerodrome"];);out center tags 80;`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 14000);
    try {
        const response = await fetch("https://overpass-api.de/api/interpreter", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "User-Agent": "WanderlustIndia/1.0" },
            body: new URLSearchParams({ data: query }),
            signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Nearby places service returned ${response.status}`);
        const data = await response.json();
        const radians = (degrees) => degrees * Math.PI / 180;
        const haversineKm = (lat, lon) => {
            const dLat = radians(lat - latitude);
            const dLon = radians(lon - longitude);
            const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(latitude)) * Math.cos(radians(lat)) * Math.sin(dLon / 2) ** 2;
            return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        };
        const places = (data.elements || []).map((place) => {
            const tags = place.tags || {};
            const lat = place.lat ?? place.center?.lat;
            const lon = place.lon ?? place.center?.lon;
            if (!tags.name || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
            let category;
            if (/^(restaurant|cafe|fast_food|food_court)$/.test(tags.amenity || "")) category = "food";
            else if (/^(attraction|museum|viewpoint|zoo|theme_park)$/.test(tags.tourism || "")) category = "sights";
            else if (["station", "halt"].includes(tags.railway)) category = "rail";
            else if (tags.amenity === "bus_station" || tags.highway === "bus_stop") category = "bus";
            else if (tags.aeroway === "aerodrome") category = "airport";
            if (!category) return null;
            return { name: tags.name, category, distanceKm: haversineKm(lat, lon), lat, lon, cuisine: tags.cuisine || "" };
        }).filter(Boolean).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 60);
        res.json({ places, attribution: "OpenStreetMap contributors" });
    } catch (error) {
        console.error("Nearby places lookup failed:", error.message);
        res.status(502).json({ message: "Nearby places are temporarily unavailable. Please try again shortly." });
    } finally {
        clearTimeout(timeout);
    }
};


module.exports.createListing = ( async (req, res,next) => {
  let geocodedGeometry;
  if (geocodingClient) {
    const response = await geocodingClient
      .forwardGeocode({ query: req.body.listing.location, limit: 1 })
      .send();
    if (response.body.features && response.body.features.length > 0) {
      geocodedGeometry = response.body.features[0].geometry;
    }
  }

    const uploadedPhotos = req.files || [];
    if (uploadedPhotos.length < 5) {
      req.flash("error", "Please upload at least 5 photos of this stay.");
      return res.redirect("/listings/new");
    }
    const newListing = new Listing(req.body.listing);
    newListing.owner = req.user._id;
    newListing.image = { url: uploadedPhotos[0].path, filename: uploadedPhotos[0].filename };
    newListing.gallery = uploadedPhotos.slice(1).map((photo) => ({ url: photo.path, filename: photo.filename }));
    if (geocodedGeometry) newListing.geometry = geocodedGeometry;
    let savedListing = await newListing.save();
    console.log(savedListing);
    req.flash("success","New Listing Created!");
    res.redirect("/listings");
  })

module.exports.renderEditForm =( async (req, res) => {
  let { id } = req.params;
  const listing = await Listing.findById(id);
  if(!listing){
    req.flash("error","Listing you reqursted for does not exist!");
    return res.redirect("/listings");
  }
  let originalImageUrl = listing.image?.url || "";
  res.render("listings/edit.ejs", { listing, originalImageUrl });
})


module.exports.updateListing = async (req, res) => {
  let { id } = req.params;

  const listing = await Listing.findById(id);
  if (!listing) {
    req.flash("error", "Listing you requested does not exist!");
    return res.redirect("/listings");
  }

  Object.assign(listing, req.body.listing);
  listing.categories = req.body.listing.categories || [];

  const uploadedPhotos = req.files || [];
  const isReplacingSampleGallery = listing.galleryIsSample && uploadedPhotos.length >= 5;
  const existingPhotoCount = listing.galleryIsSample
    ? (uploadedPhotos.length === 0
      ? (listing.image?.url ? 1 : 0) + (listing.gallery || []).length
      : uploadedPhotos.length >= 5 ? 0 : (listing.image?.url ? 1 : 0))
    : (listing.image?.url ? 1 : 0) + (listing.gallery || []).length;
  if (existingPhotoCount + uploadedPhotos.length < 5) {
    req.flash("error", `This stay needs at least 5 photos. Add ${5 - existingPhotoCount} more.`);
    return res.redirect(`/listings/${id}/edit`);
  }
  if (existingPhotoCount + uploadedPhotos.length > 10) {
    req.flash("error", "A stay can have up to 10 photos.");
    return res.redirect(`/listings/${id}/edit`);
  }
  if (uploadedPhotos.length) {
    const uploadedGallery = uploadedPhotos.map((photo) => ({ url: photo.path, filename: photo.filename }));
    if (isReplacingSampleGallery) {
      listing.image = uploadedGallery.shift();
      listing.gallery = uploadedGallery;
      listing.galleryIsSample = false;
    } else if (listing.galleryIsSample) {
      listing.gallery = uploadedGallery;
      listing.galleryIsSample = false;
      if (!listing.image?.url) listing.image = listing.gallery.shift();
    } else {
      if (!listing.image?.url) listing.image = uploadedGallery.shift();
      listing.gallery = [...(listing.gallery || []), ...uploadedGallery];
    }
  }

  if (req.body.listing.location && geocodingClient) {
    const response = await geocodingClient
      .forwardGeocode({ query: req.body.listing.location, limit: 1 })
      .send();

    if (response.body.features && response.body.features.length > 0) {
      listing.geometry = response.body.features[0].geometry;
    }
  }

  await listing.save();

  req.flash("success", "Listing Updated!");
  res.redirect(`/listings/${id}`);
};


module.exports.destroyListing =(async (req, res) => {
  let { id } = req.params;
  let deletedListing = await Listing.findByIdAndDelete(id);
  console.log(deletedListing);
  req.flash("success","Listing Deleted!");
  res.redirect("/listings");
})
