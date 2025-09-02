const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Import route handlers
const mediafireRoute = require('./api/mediafire');
const youtubeRoute = require('./api/youtube');
const instagramRoute = require('./api/instagram');
const tiktokRoute = require('./api/tiktok');

// API Routes
app.use('/api/mediafire', mediafireRoute);
app.use('/api/youtube', youtubeRoute);
app.use('/api/instagram', instagramRoute);
app.use('/api/tiktok', tiktokRoute);

// Stats endpoint
app.get('/api/stats', async (req, res) => {
  res.json({
    totalCalls: 12459,
    activeEndpoints: 24,
    successRate: 98.7,
    avgResponseTime: 127
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API documentation endpoint
app.get('/api', (req, res) => {
  const apiDocs = {
    message: "Branpedia REST API",
    version: "1.0.0",
    endpoints: {
      mediafire: {
        method: "GET",
        path: "/api/mediafire?url={mediafire_url}",
        description: "Extract download link from MediaFire"
      },
      youtube: {
        method: "GET",
        path: "/api/youtube?url={youtube_url}",
        description: "Extract video info from YouTube"
      },
      instagram: {
        method: "GET",
        path: "/api/instagram?url={instagram_url}",
        description: "Extract media from Instagram"
      },
      tiktok: {
        method: "GET",
        path: "/api/tiktok?url={tiktok_url}",
        description: "Extract video from TikTok"
      }
    }
  };
  res.json(apiDocs);
});

// Menyajikan file HTML utama
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle 404
app.use('*', (req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint tidak ditemukan' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Terjadi kesalahan server' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
  console.log(`📖 API Documentation: http://localhost:${PORT}/api`);
});

module.exports = app;
