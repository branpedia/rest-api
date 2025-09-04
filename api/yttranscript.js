// api/yttranscript.js
/* ─────────────────────
   Branpedia | Bran E-sport 
   WhatsApp: +6285795600265
   GitHub: github.com/branpedia
   Saluran Official: https://whatsapp.com/channel/0029VaR0ejN47Xe26WUarL3H
   ───────────────────── */

// Import dependencies
const fetch = require('node-fetch');
const cheerio = require('cheerio');

async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,OPTIONS,PATCH,DELETE,POST,PUT"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed. Use GET instead.",
    });
  }

  // Get URL parameter
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({
      success: false,
      error: "Parameter url is required. Example: /api/yttranscript?url=https://youtube.com/watch?v=XXXX",
    });
  }

  // Decode URL parameter
  let decodedUrl;
  try {
    decodedUrl = decodeURIComponent(url);
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: "Invalid URL encoding.",
    });
  }

  // Extract YouTube video ID
  const idMatch = decodedUrl.match(/(?:v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (!idMatch) {
    return res.status(400).json({
      success: false,
      error: "Failed to extract YouTube video ID from the URL.",
    });
  }
  const videoId = idMatch[1];

  // Build transcript URL
  const transcriptUrl = `https://youtubetotranscript.com/transcript?v=${videoId}`;

  try {
    const response = await fetch(transcriptUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to access transcript: HTTP ${response.status}`);
    }

    const html = await response.text();
    
    // Pastikan cheerio berhasil load
    if (typeof cheerio.load !== 'function') {
      throw new Error('Cheerio load function is not available');
    }
    
    const $ = cheerio.load(html);

    let transcriptText = [];
    
    // Parse HTML dengan selector yang benar
    $("#transcript span.transcript-segment").each((i, el) => {
      let text = $(el).text().trim();
      if (text) transcriptText.push(text);
    });

    // Jika tidak ditemukan dengan selector pertama, coba selector alternatif
    if (transcriptText.length === 0) {
      $("span.transcript-segment").each((i, el) => {
        let text = $(el).text().trim();
        if (text) transcriptText.push(text);
      });
    }

    // Coba selector berdasarkan HTML yang Anda berikan
    if (transcriptText.length === 0) {
      $(".transcript-segment").each((i, el) => {
        let text = $(el).text().trim();
        if (text) transcriptText.push(text);
      });
    }

    if (transcriptText.length === 0) {
      throw new Error("Transcript not found for this video. The video may not have captions or the website structure may have changed.");
    }

    const result = transcriptText.join(" ");

    return res.status(200).json({
      success: true,
      videoId,
      transcript: result,
      totalSegments: transcriptText.length,
      message: "Transcript retrieved successfully."
    });
  } catch (error) {
    console.error("Error fetching transcript:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve transcript: " + error.message,
      videoId: videoId || "unknown"
    });
  }
}

// Export handler untuk Vercel/Netlify
module.exports = handler;
