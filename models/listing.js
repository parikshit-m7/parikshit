const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const Review = require("./review.js");
const { string, required } = require("joi");

const listingSchema = new Schema({
    title: {
        type: String,
        required: true,
    },

    description: String,

    image: {
      url: String,
      filename: String,
    },
    price: Number,
    rooms: { type: Number, min: 1, max: 99, default: 1 },
    reservationVersion: { type: Number, default: 0 },
    location: String,
    country: String,
    demoKey: { type: String, unique: true, sparse: true },
    isDemo: { type: Boolean, default: false },
    categories: {
        type: [{
            type: String,
            enum: ["slow-stays", "city-breaks", "mountains", "by-water", "outdoors", "hidden-gems"],
        }],
        default: [],
    },
    reviews: [
        {
            type: Schema.Types.ObjectId,
            ref: "Review",
        },
    ],
    owner:{
        type: Schema.Types.ObjectId,
        ref: "User",
    },
    geometry:{
      type: {
          type: String,
          enum: ['Point'],
          required: false
      },
      coordinates: {
        type: [Number],
        required: false
      },
    },
});

listingSchema.index({ geometry: "2dsphere" });

listingSchema.post("findOneAndDelete", async(listing) =>{
    if(listing) {
      await Review.deleteMany({_id : {$in: listing.reviews}});
    }
});


const Listing = mongoose.model("Listing", listingSchema);
module.exports = Listing;
