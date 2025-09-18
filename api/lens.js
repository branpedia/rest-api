import express from 'express';
import axios from 'axios';

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// API Key SerpApi (ganti dengan key Anda)
const SERPAPI_KEY = '99a605260e609bb3b58fbe12792cc316686cb7e10e447a38f6bd6360e6b68dbf';

// Endpoint untuk Google Lens search
app.get('/api/lens', async (req, res) => {
  try {
    const { imageUrl, hl = 'en', country = 'us' } = req.query;

    // Validasi parameter
    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        error: 'Parameter imageUrl diperlukan'
      });
    }

    // Validasi URL
    try {
      new URL(imageUrl);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'URL tidak valid'
      });
    }

    // Build SerpApi URL
    const serpApiUrl = 'https://serpapi.com/search.json';
    const params = {
      engine: 'google_lens',
      url: imageUrl,
      hl: hl,
      country: country,
      api_key: SERPAPI_KEY
    };

    // Make request to SerpApi
    const response = await axios.get(serpApiUrl, { params });
    const data = response.data;

    // Format response
    const result = {
      success: true,
      data: {
        search_metadata: data.search_metadata,
        search_parameters: data.search_parameters,
        visual_matches: data.visual_matches || [],
        related_content: data.related_content || [],
        google_lens_url: data.search_metadata?.google_lens_url
      }
    };

    res.json(result);

  } catch (error) {
    console.error('Error fetching from SerpApi:', error);
    
    if (error.response) {
      // SerpApi returned an error
      return res.status(error.response.status).json({
        success: false,
        error: `SerpApi error: ${error.response.data.error || error.response.statusText}`
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Gagal mengambil data dari Google Lens'
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'Google Lens API' });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

export default app;
