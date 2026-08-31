import https from "node:https";

https.get("https://hacker-news.firebaseio.com/v0/showstories.json", (res) => {
  console.log("STATUS:", res.statusCode);
  let data = "";
  res.on("data", (chunk) => { data += chunk; });
  res.on("end", () => {
    console.log("DATA LENGTH:", data.length);
    console.log("FIRST 50 CHARS:", data.substring(0, 50));
  });
}).on("error", (err) => {
  console.error("ERROR:", err.message);
});
