const Listing = require("../models/listing");
const { buildListingSearch } = require("../utils/listingSearch");
const mbxGeocoding = require('@mapbox/mapbox-sdk/services/geocoding');
const mapToken = process.env.MAP_TOKEN;
const geocodingClient = mapToken ? mbxGeocoding({ accessToken: mapToken }) : null;


module.exports.index = async (req, res) => {
    const { mongoFilter, search } = buildListingSearch(req.query.search);
    const filter = { ...mongoFilter };
    const minPrice = Number(req.query.minPrice);
    const maxPrice = Number(req.query.maxPrice);

    if (req.query.minPrice !== undefined && req.query.minPrice !== "" && Number.isFinite(minPrice) && minPrice >= 0) {
        filter.price = { ...(filter.price || {}), $gte: minPrice };
    }
    if (req.query.maxPrice !== undefined && req.query.maxPrice !== "" && Number.isFinite(maxPrice) && maxPrice >= 0) {
        filter.price = { ...(filter.price || {}), $lte: maxPrice };
    }

    // Keep each request responsive; pagination can be added as the inventory grows.
    const allListings = await Listing.find(filter).sort({ _id: -1 }).limit(100);
    res.render("listings/index.ejs", {
        allListings,
        search,
        minPrice: req.query.minPrice || "",
        maxPrice: req.query.maxPrice || ""
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

    res.render("listings/show.ejs", { listing });
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

    if (!req.file) {
      req.flash("error", "Please upload a listing image.");
      return res.redirect("/listings/new");
    }
    const { path: url, filename } = req.file;
    const newListing = new Listing(req.body.listing);
    newListing.owner = req.user._id;
    newListing.image = { url, filename };
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

  // Keep the existing photo unless a new one was uploaded.
  if (req.file) {
    listing.image = { url: req.file.path, filename: req.file.filename };
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