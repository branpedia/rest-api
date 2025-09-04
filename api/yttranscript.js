// api/yttranscript.js
/* ─────────────────────
   Branpedia | Bran E-sport 
   WhatsApp: +6285795600265
   GitHub: github.com/branpedia
   Saluran Official: https://whatsapp.com/channel/0029VaR0ejN47Xe26WUarL3H
   ───────────────────── */

import fetch from "node-fetch";
import cheerio from "cheerio";

export default async function handler(req, res) {
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
      error: "Masukkan link YouTube! Contoh: /api/yttranscript?url=https://youtube.com/shorts/lqz9d_zeU6E",
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

  // Build transcript URL
  const transcriptUrl = `https://youtubetotranscript.com/transcript?v=${videoId}`;

  try {
    const response = await fetch(transcriptUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
      }
    });

    if (!response.ok) {
      throw new Error("Gagal mengakses transcript!");
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    let transcriptText = [];
    
    // Parse HTML dengan selector yang benar
    $("#transcript span.transcript-segment").each((i, el) => {
      let text = $(el).text().trim();
      if (text) transcriptText.push(text);
    });

    if (transcriptText.length === 0) {
      throw new Error("Transcript tidak ditemukan!");
    }

    let result = transcriptText.join(" ");

    return res.status(200).json({
      success: true,
      videoId,
      transcript: result,
      totalSegments: transcriptText.length
    });
  } catch (error) {
    console.error("Error fetching transcript:", error.message);
    return res.status(500).json({
      success: false,
      error: "Gagal mengambil transcript: " + error.message,
    });
  }
}
