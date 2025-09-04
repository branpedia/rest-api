const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { setupAPIEndpoints } = require('./api/index');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// Setup API endpoints otomatis
setupAPIEndpoints(app);

// Endpoint admin untuk upload API
app.post('/admin/api/upload', (req, res) => {
  try {
    const { name, code, documentation } = req.body;
    
    if (!name || !code) {
      return res.status(400).json({ 
        success: false, 
        error: 'Nama dan kode API diperlukan' 
      });
    }
    
    // Validasi nama API (hanya huruf, angka, dan underscore)
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Nama API hanya boleh mengandung huruf, angka, dan underscore' 
      });
    }
    
    const apiPath = path.join(__dirname, 'api', `${name}.js`);
    
    // Cek jika API sudah ada
    if (fs.existsSync(apiPath)) {
      return res.status(400).json({ 
        success: false, 
        error: `API dengan nama ${name} sudah ada` 
      });
    }
    
    // Tambahkan dokumentasi jika ada
    let apiCode = code;
    if (documentation) {
      apiCode = `// Dokumentasi API\nmodule.exports.documentation = ${JSON.stringify(documentation, null, 2)};\n\n${code}`;
    }
    
    // Simpan file API
    fs.writeFileSync(apiPath, apiCode);
    
    res.json({ 
      success: true, 
      message: `API ${name} berhasil diupload`,
      path: `/api/${name}`
    });
  } catch (error) {
    console.error('Error uploading API:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Terjadi kesalahan server' 
    });
  }
});

// Endpoint admin untuk hapus API
app.delete('/admin/api/:apiName', (req, res) => {
  try {
    const apiName = req.params.apiName;
    const apiPath = path.join(__dirname, 'api', `${apiName}.js`);
    
    // Cek jika API ada
    if (!fs.existsSync(apiPath)) {
      return res.status(404).json({ 
        success: false, 
        error: `API ${apiName} tidak ditemukan` 
      });
    }
    
    // Hapus file API
    fs.unlinkSync(apiPath);
    
    res.json({ 
      success: true, 
      message: `API ${apiName} berhasil dihapus`
    });
  } catch (error) {
    console.error('Error deleting API:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Terjadi kesalahan server' 
    });
  }
});

// Import dan gunakan route handlers yang sudah ada
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
  console.log(`👨‍💼 Admin Panel: http://localhost:${PORT}/admin`);
});

module.exports = app;
