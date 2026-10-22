if(process.env.NODE_ENV !="production"){
  require("dotenv").config();
}


const express =require("express");
const app = express();
const mongoose = require("mongoose");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const ExpressError = require("./utils/ExpressError.js");
const session = require("express-session");
const {MongoStore} = require("connect-mongo");
const flash  =  require("connect-flash");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const User = require("./models/user.js");

const listingRouter = require("./routes/listing.js");
const reviewRouter = require("./routes/review.js");
const userRouter = require("./routes/user.js");


const dbUrl = process.env.ATLASDB_URL;


main()
    .then(() => console.log("connected to DB"))
    .catch(err => {
    console.log("Error Name:", err.name);
    console.log("Error Message:", err.message);

    if (err.reason) {
        for (const [server, info] of err.reason.servers) {
            console.log(server);
            console.log("Server Error:", info.error?.message);
        }
    }
});

async function main() {
    await mongoose.connect(dbUrl);
}

app.set("trust proxy", 1);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname,"/public")));

const store = MongoStore.create({
    mongoUrl: dbUrl,
    crypto:{
        secret:process.env.SECRET,
    },
    touchAfter: 24 * 3600,
});

store.on("error", (err) => {
    console.error("ERROR in MONGO SESSION STORE:", err.message);
});

const sessionOptions ={
    store,
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false,
    cookie:{
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
    }
};

// app.get("/",(req,res) =>{
//     res.send("Hi, I am root");
// });

app.use(session(sessionOptions));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use((req, res, next) =>{
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error"); 
    res.locals.fieldErrors = {};
    res.locals.fieldValues = {};
    for (const item of req.flash("fieldError")) {
        try {
            const fieldError = JSON.parse(item);
            if (fieldError.field && fieldError.message) {
                res.locals.fieldErrors[fieldError.field] = fieldError.message;
                if (typeof fieldError.value === "string") res.locals.fieldValues[fieldError.field] = fieldError.value;
            }
        } catch (error) {
            console.error("Could not read a form field error.", error.message);
        }
    }
    res.locals.currUser = req.user;
    next();
});

// app.get("/demouser", async (req, res, next) =>{
//    let fakeUser = new User({
//     email: "student@gmail.com",
//     username: "delta-student"
//    });
//    let registerUser= await User.register(fakeUser, "hellowold");
//    res.send(registerUser);
// });

app.use("/listings", listingRouter);
app.use("/listings/:id/reviews", reviewRouter);
app.use("/", userRouter);

app.all("/{*splat}", (req, res,next) =>{
  next(new ExpressError(404,"Page Not Found!"))
});

app.use((err, req, res, next)=>{
  let {statusCode=500, message="Something went wrong!"} =err;
  res.status (statusCode).render("error.ejs",{ message})
  //res.status(statusCode).send(message);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Wanderlust server is listening on port ${PORT}`);
});
