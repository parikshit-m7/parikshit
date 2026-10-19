const { response } = require("express");
const Listing = require("../models/listing");
const { buildListingFilter } = require("../utils/listingFilters");
const mbxGeocoding = require('@mapbox/mapbox-sdk/services/geocoding');
const mapToken = process.env.MAP_TOKEN;
const geocodingClient = mbxGeocoding({ accessToken: mapToken });


module.exports.index = async (req, res) => {
    const { mongoFilter, formValues } = buildListingFilter(req.query);
    const allListings = await Listing.find(mongoFilter);
    res.render("listings/index.ejs", { allListings, filters: formValues });
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
        !listing.geometry ||
        !listing.geometry.coordinates ||
        listing.geometry.coordinates.length !== 2
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
  let response = await geocodingClient
    .forwardGeocode({
      query: req.body.listing.location,
      limit: 1
    })
    .send();

    let url = req.file.path;
    let filename = req.file.filename;
    const newListing = new Listing(req.body.listing);
    newListing.owner = req.user._id;
    newListing.image = {url, filename};

    newListing.geometry = response.body.features[0].geometry;
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
  let originalImageUrl = listing.image.url;
  originalImageUrl.replace("/upload","/upload/h_300,W_250");
  res.render("listings/edit.ejs", { listing, originalImageUrl });
})


module.exports.updateListing = async (req, res) => {
  let { id } = req.params;

  let listing = await Listing.findByIdAndUpdate(id, {
    ...req.body.listing
  });

  // Location change hone par coordinates bhi update honge
  let response = await geocodingClient
    .forwardGeocode({
      query: req.body.listing.location,
      limit: 1
    })
    .send();

  if (response.body.features.length > 0) {
    listing.geometry = response.body.features[0].geometry;
    await listing.save();
  }

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