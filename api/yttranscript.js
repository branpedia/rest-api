// api/yttranscript-alt.js
import fetch from "node-fetch";

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,OPTIONS,PATCH,DELETE,POST,PUT"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed. Use GET instead.",
    });
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({
      success: false,
      error: "Parameter url is required.",
    });
  }

  // Extract YouTube video ID
  const idMatch = url.match(/(?:v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (!idMatch) {
    return res.status(400).json({
      success: false,
      error: "Gagal mengambil ID YouTube dari link!",
    });
  }
  const videoId = idMatch[1];

  try {
    // Coba alternatif layanan transcript
    const response = await fetch(`https://yt-api.p.rapidapi.com/transcript?id=${videoId}`, {
      headers: {
        'X-RapidAPI-Key': 'your-api-key-here', // Ganti dengan API key Anda
        'X-RapidAPI-Host': 'yt-api.p.rapidapi.com'
      }
    });

    if (!response.ok) {
      throw new Error("Gagal mengakses transcript!");
    }

    const data = await response.json();
    
    return res.status(200).json({
      success: true,
      videoId,
      transcript: data,
    });
  } catch (error) {
    console.error("Error fetching transcript:", error.message);
    return res.status(500).json({
      success: false,
      error: "Gagal mengambil transcript: " + error.message,
    });
  }
}
