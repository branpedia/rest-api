// API TikTok Downloader dengan Server Utama ssstik.io
// Endpoint: GET /api/tiktok?url=[tiktok_url]

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  try {
    // Validate TikTok URL
    if (!url.includes('tiktok.com') && !url.includes('vt.tiktok.com')) {
      return res.status(400).json({ error: 'Invalid TikTok URL' });
    }

    // Use ssstik.io as the main server
    const tiktokData = await downloadFromSSSTik(url);

    // Return successful response
    return res.status(200).json({
      success: true,
      data: {
        title: 'TikTok Video',
        author: 'TikTok User',
        mediaCount: tiktokData.mediaUrls.length,
        mediaUrls: tiktokData.mediaUrls,
        coverUrl: tiktokData.thumbnail || null,
        source: 'ssstik.io'
      }
    });

  } catch (error) {
    console.error('TikTok API Error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch TikTok data',
      message: error.message 
    });
  }
}

// Main function to download from ssstik.io
async function downloadFromSSSTik(url) {
  try {
    // Create form data
    const formData = new URLSearchParams();
    formData.append('id', url);
    formData.append('locale', 'en');
    formData.append('tt', '0');

    // Make request to ssstik.io
    const response = await fetch('https://ssstik.io/abc?url=dl', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Origin': 'https://ssstik.io',
        'Referer': 'https://ssstik.io/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }

    const html = await response.text();
    
    // Parse the HTML response
    const parser = new HTMLParser();
    const document = parser.parseFromString(html, 'text/html');
    
    let noWatermark = null;
    let audio = null;
    let thumbnail = null;
    const allLinks = [];

    // Find all links
    const links = document.querySelectorAll('a');
    for (const link of links) {
      const href = link.getAttribute('href');
      if (href && href.includes('tikcdn.io')) {
        allLinks.push(href);

        // Detect no watermark video
        if (!noWatermark && /\/ssstik\/\d+/.test(href)) {
          noWatermark = href;
        }

        // Detect audio link
        if (!audio && /\/ssstik\/aHR0c/.test(href)) {
          audio = href;
        }
      }
    }

    // Find thumbnail
    const images = document.querySelectorAll('img');
    for (const img of images) {
      const src = img.getAttribute('src');
      if (src && src.includes('tikcdn.io') && src.includes('/a/')) {
        thumbnail = src;
        break;
      }
    }

    // Prepare media URLs
    const mediaUrls = [];
    if (noWatermark) mediaUrls.push(noWatermark);
    if (audio) mediaUrls.push(audio);

    if (mediaUrls.length === 0) {
      throw new Error('No media URLs found');
    }

    return {
      mediaUrls,
      thumbnail,
      from: 'ssstik.io'
    };

  } catch (error) {
    console.error('SSSTik download error:', error);
    throw new Error(`Failed to download from ssstik.io: ${error.message}`);
  }
}

// Simple HTML parser for server-side use
class HTMLParser {
  parseFromString(html, mimeType) {
    // Create a simple DOM-like structure
    const dom = {
      querySelectorAll: (selector) => this.querySelectorAll(html, selector),
    };
    return dom;
  }

  querySelectorAll(html, selector) {
    const elements = [];
    
    if (selector === 'a') {
      // Find all anchor tags
      const regex = /<a\s+[^>]*href=["']([^"']*)["'][^>]*>/gi;
      let match;
      while ((match = regex.exec(html)) !== null) {
        elements.push({
          getAttribute: (attr) => {
            if (attr === 'href') return match[1];
            return null;
          }
        });
      }
    } else if (selector === 'img') {
      // Find all image tags
      const regex = /<img\s+[^>]*src=["']([^"']*)["'][^>]*>/gi;
      let match;
      while ((match = regex.exec(html)) !== null) {
        elements.push({
          getAttribute: (attr) => {
            if (attr === 'src') return match[1];
            return null;
          }
        });
      }
    }
    
    return elements;
  }
}
