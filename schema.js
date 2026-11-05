const Joi = require('joi');

module.exports.listingSchema = Joi.object({
    listing : Joi.object({
        title : Joi.string().required(),
        description : Joi.string().required(),
        location : Joi.string().required(),
        country : Joi.string().required(),
        price : Joi.number().required().min(0),
        rooms : Joi.number().integer().min(1).max(99).default(1),
        categories : Joi.array().items(Joi.string().valid("slow-stays", "city-breaks", "mountains", "by-water", "outdoors", "hidden-gems")).default([]),
        image:  Joi.string().allow("",null)
    }).required(),
});

module.exports.reviewSchema = Joi.object({
    review: Joi.object({
        rating: Joi.number().required(),
        comment: Joi.string().required(),
    }).required(),
})
