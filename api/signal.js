const { analyzeMarket } = require("../lib/strategyEngine");
const { verifyToken } = require("../lib/auth");
const { db } = require("../lib/firebaseAdmin");

module.exports = async (req, res) => {

    if(req.method !== "POST"){

        return res.status(405).json({
            success:false,
            message:"POST Only"
        });

    }

    try{

        const authHeader = req.headers.authorization;

        if(!authHeader){

            return res.status(401).json({
                success:false,
                message:"Login Required"
            });

        }

        const token = authHeader.replace("Bearer ","");

        const user = verifyToken(token);

const userDoc = await db
    .collection("users")
    .doc(user.uid)
    .get();

if(!userDoc.exists){

    return res.status(404).json({

        success:false,

        message:"User Not Found"

    });

}

const userData = userDoc.data();

if(userData.premium !== true){

    return res.status(403).json({

        success:false,

        message:"⭐ Premium Required"

    });

}

if(userData.expiry){

    const expiry = new Date(userData.expiry);

    if(expiry < new Date()){

        return res.status(403).json({

            success:false,

            message:"❌ Premium Expired"

        });

    }

}

        const {

            candles,

            timeframe,

            market

        } = req.body;

        const result = analyzeMarket(

            candles,

            timeframe,

            market

        );

        return res.status(200).json(result);

    }catch(err){

        return res.status(500).json({

            success:false,

            message:err.message

        });

    }

};