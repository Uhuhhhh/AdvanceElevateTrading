const { db } = require("../lib/firebaseAdmin");
const jwt = require("jsonwebtoken");

module.exports = async (req, res) => {

    try {

        const token = req.headers.authorization?.replace("Bearer ","");

        jwt.verify(token, process.env.JWT_SECRET);

        const snap = await db.collection("users").get();

        let users = [];

        snap.forEach(doc=>{

            users.push({
                id:doc.id,
                ...doc.data()
            });

        });

        res.json(users);

    } catch(err){

        res.status(401).json({
            success:false
        });

    }

};