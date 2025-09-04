// File: ig.js
import express from "express";
import cloudscraper from "cloudscraper";

const app = express();
const PORT = process.env.PORT || 3000;

// API Instagram Downloader
app.get("/api/ig", async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ success: false, error: "Parameter ?url= Instagram diperlukan" });
  }

  try {
    // request ke snapins.ai (free service buat scrap IG)
    const response = await cloudscraper.post("https://snapins.ai/action.php", {
      formData: { url },
    });

    let data;
    try {
      data = JSON.parse(response);
    } catch {
      return res.status(500).json({ success: false, error: "Gagal parsing data IG" });
    }

    if (!data || data.status === "error") {
      return res.status(500).json({ success: false, error: "Gagal ambil data dari Instagram" });
    }

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("IG error:", error.message);
    return res.status(500).json({ success: false, error: "Terjadi kesalahan server IG" });
  }
});

app.listen(PORT, () => {
  console.log(`IG API running on http://localhost:${PORT}`);
});
