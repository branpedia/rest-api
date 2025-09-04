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
      error:
        "Parameter url is required. Example: /api/yttranscript?url=https://youtube.com/watch?v=XXXX",
    });
  }

  // Extract YouTube video ID
  const idMatch = url.match(
    /(?:v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
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
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:119.0) Gecko/20100101 Firefox/119.0",
      },
    });

    if (!response.ok) {
      throw new Error("Gagal mengakses transcript!");
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    let transcript = [];
    let fullText = "";

    // Mencoba dua selector yang berbeda
    // 1. Coba selector berdasarkan contoh HTML yang diberikan
    $(".transcript-segment").each((i, el) => {
      let text = $(el).text().trim();
      if (text) {
        transcript.push({ text });
        fullText += text + " ";
      }
    });

    // 2. Jika tidak ada hasil dengan selector pertama, coba selector alternatif
    if (transcript.length === 0) {
      $(".transcript-text .transcript-row").each((i, el) => {
        let start = $(el).find(".start").text().trim();
        let text = $(el).find(".text").text().trim();
        if (text) {
          transcript.push({ start, text });
          fullText += text + " ";
        }
      });
    }

    // 3. Jika masih tidak ada hasil, coba selector umum
    if (transcript.length === 0) {
      $("[data-start]").each((i, el) => {
        let text = $(el).text().trim();
        if (text) {
          transcript.push({ text });
          fullText += text + " ";
        }
      });
    }

    if (transcript.length === 0) {
      throw new Error("Transcript tidak ditemukan atau video tidak mendukung.");
    }

    // Opsi 1: Kembalikan transcript lengkap dengan timestamp
    // Opsi 2: Kembalikan hanya teks tanpa timestamp (sesuai permintaan)
    const textOnly = fullText.trim();

    return res.status(200).json({
      success: true,
      videoId,
      transcript: transcript, // transcript lengkap dengan timestamp
      text: textOnly, // hanya teks tanpa timestamp
      totalSegments: transcript.length,
    });
  } catch (error) {
    console.error("Error fetching transcript:", error.message);
    return res.status(500).json({
      success: false,
      error: "Gagal mengambil transcript: " + error.message,
    });
  }
}
