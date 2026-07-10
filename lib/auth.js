const jwt = require("jsonwebtoken");
const { db } = require("../firebaseAdmin");

function createToken(user){

    return jwt.sign({

        uid:user.uid,
        email:user.email,

        premium:user.premium,
        key:user.key,
        expiry:user.expiry,
        active:user.active

    },

    process.env.JWT_SECRET,

    {

        expiresIn:"30d"

    });

}

function verifyToken(token){

    return jwt.verify(

        token,

        process.env.JWT_SECRET

    );

}

module.exports = {

    createToken,

    verifyToken

};