const nodemailer = require("nodemailer");
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "bookings@localmile.plus",
    pass: "jxcj wqci mwxg gape",
  },
});
transporter.verify(function(error, success) {
  if (error) {
    console.log("Error:", error);
  } else {
    console.log("Server is ready to take our messages");
  }
});
