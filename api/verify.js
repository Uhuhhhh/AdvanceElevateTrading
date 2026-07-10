const jwt = require("jsonwebtoken");
const { db } = require("../lib/firebaseAdmin");

module.exports = async function(req,res){

    const token =
    req.headers.authorization?.replace("Bearer ","");

    if(!token){

        return res.status(401).json({
            success:false,
            message:"Unauthorized"
        });

    }

    try{

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        // Check Firestore
        const doc = await db
            .collection("users")
            .doc(decoded.uid)
            .get();

        if(!doc.exists){

            return res.status(401).json({
                success:false,
                message:"User deleted"
            });

        }

        const user = doc.data();

        // Disabled account
        if(
            user.enabled===false ||
            user.enabled==="false"
        ){

            return res.status(401).json({
                success:false,
                message:"Account disabled"
            });

        }

        return res.status(200).json({

            success:true,

            premium:user.premium===true ||
                     user.premium==="true",

            key:user.key||"",

            expiry:user.expiry||"Unlimited",

            user:{
                uid:decoded.uid,
                email:user.email||""
            }

        });

    }catch(e){

        return res.status(401).json({
            success:false,
            message:"Invalid Token"
        });

    }

}