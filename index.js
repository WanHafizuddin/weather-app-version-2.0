// const url = 'https://api.openweathermap.org/data/2.5/weather?q={city name}&appid={API key}'
// const apiKey = '61fedb86295845abbc7d05e7456eed26'
// //https://api.openweathermap.org/data/2.5/weather?q={city name}&appid={API key}
// //Latitude  6.12361000    Longitude  102.24333000  


// function getWeather(){
// const apiKey = '61fedb86295845abbc7d05e7456eed26'
// const city = document.getElementsById("city-id")
// console.log(city)

// if(!city){
//   alert("Please enter a city")
//   return
// }

// const currentWeather = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}`
// }

// function getWeather(){

//   fetch(currentWeather)
//     .then(response => response.json())
//     .then(data => {
//       displayWeather(data);
//     })
//     .catch(error =>{
//       console.error("error", error)
//     })
//   };

//   function myFunction() {
//     document.getElementById("demo").innerHTML = "I have changed!";
//   }


// function displayWeather(data){

//   const temp = data.main.temp;
//   document.getElementById("temp-id").innerHTML = ;
// }

// const city = "kota bharu" 
// const apiKey = '61fedb86295845abbc7d05e7456eed26'
// const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}`

// fetch(url)
//   .then(response =>{
//     if (!response.ok){
//       throw new Error("Could not fetch data")
//     }
//     return response.json()
//   })
//   .then(data => console.log(data.name))
//   .catch(error => console.error("Error: ",error))
// console.log("Script is running");

// async function fetchData() {
//   const city = document.getElementById("city-input").value;
//   const apiKey = '61fedb86295845abbc7d05e7456eed26'
//   const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}`


//   try{
//   const response = await fetch(url);
//   if(!response.ok){
//     throw new Error("Could not fetch data");
//   }

//   const data = await response.json();
//   console.log(data.weather[0].description);
//   console.log(data.name);

//  const cityElement = document.getElementById("city-name").value;
//  const cityName = data.name;
//  cityElement.textContent = cityName;



//   }
//   catch(error){
//     console.error("Error: ",error);
//     const cityElement = document.getElementById("city-name").value;
//     if(cityElement){
//     cityElement.textContent = "City does not found";
//     }
//   }
// }


// const dotenv = require('dotenv');
// dotenv.config();
// authController.insertAdmin();


// console.log(process.env)
// async function fetchData() {
//   const city = document.getElementById("city-input").value;
//   const apiKey = process.env.API_KEY;
//   const url ='https://api.openweathermap.org/data/2.5/weather?q='+city+'&appid='+apiKey;

//   ///`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}`;
//   //https://api.openweathermap.org/data/2.5/weather?q=paris&appid=dde797ecbb3e76f5c021ae0599300a0d1
//   //https://api.openweathermap.org/data/2.5/weather?q=paris&appid=${apiKey}
//   try {

//     const response = await fetch(url);
//     if (!response.ok) {
//       throw new Error("Could not fetch data");
//     }
//       const data = await response.json();
//       console.log(data.weather[0].description);
//       console.log(data);

//       const cityElement = document.getElementById("city-name");
//       const weatherCondition = document.getElementById("weather-id");


//     if (cityElement && weatherCondition) {
//         let x = data.main.temp - 273.15;
//         cityElement.textContent = x.toFixed(2) + "°C"; 
//         weatherCondition.textContent = data.weather[0].description
//     } else {
//         console.error("Element with ID 'city-name' or 'weather-id' not found.");
//     }
//   } 
//   catch (error) {
//     console.error("Error: ", error);
//     const cityElement = document.getElementById("city-name");
//     const weatherCondition = document.getElementById("weather-id");

//     if (cityElement && weatherCondition) {
//       cityElement.textContent = "City not found."; // Display an error message in the h1 element
//       weatherCondition.textContent = ""
//     }

import express from 'express';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
dotenv.config();

const app = express();
const PORT = 3001;

app.use(express.static("public"));

app.get("/", async (req, res) => {
  res.render("index.ejs");
});


app.get('/weather', async (req, res) => {
  const city = req.query.city;
  const apiKey = process.env.API_KEY;
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Could not fetch weather data');

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
