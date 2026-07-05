const jwt = require("jsonwebtoken");

function createToken(user){

    return jwt.sign(

        {
            uid:user.uid,
            email:user.email
        },

        process.env.JWT_SECRET,

        {
            expiresIn:"2m"
        }

    );

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