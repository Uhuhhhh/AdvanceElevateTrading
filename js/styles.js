(async()=>{

const token=localStorage.getItem("token");
const loginTime=Number(localStorage.getItem("loginTime"));

const SESSION_TIME=60*60*1000;

function logout(){

localStorage.removeItem("token");
localStorage.removeItem("loginTime");

const path=

location.pathname.includes("/Admin/")||

location.pathname.includes("/journal/")

? "../index.html"

: "index.html";

location.replace(path);

}

if(!token||!loginTime){

logout();
return;

}

if(Date.now()-loginTime>SESSION_TIME){

logout();
return;

}

try{

const response=await fetch("/api/verify",{

headers:{
Authorization:"Bearer "+token
}

});

const data=await response.json();

if(!response.ok||!data.success){

logout();

}

}catch{

logout();

}

})();