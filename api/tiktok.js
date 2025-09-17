// API TikTok Downloader dengan Dua Server
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

    // Try Server 1 first (ttsave.app)
    let tiktokData = await tryServer1(url);
    
    // If Server 1 fails, try Server 2 (alternative server)
    if (!tiktokData || !tiktokData.mediaUrls || tiktokData.mediaUrls.length === 0) {
      tiktokData = await tryServer2(url);
    }

    // If both servers fail
    if (!tiktokData || !tiktokData.mediaUrls || tiktokData.mediaUrls.length === 0) {
      return res.status(404).json({ error: 'Could not fetch TikTok data from any server' });
    }

    // Return successful response
    return res.status(200).json({
      success: true,
      data: {
        title: tiktokData.meta.title || 'TikTok Video',
        author: tiktokData.meta.author || 'Unknown',
        duration: tiktokData.meta.duration || 0,
        uploadTime: tiktokData.meta.create_time || null,
        mediaCount: tiktokData.mediaUrls.length,
        mediaUrls: tiktokData.mediaUrls,
        coverUrl: tiktokData.meta.cover || null,
        source: tiktokData.from || 'unknown'
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

// Function to try Server 1 (ttsave.app)
async function tryServer1(tiktokUrl) {
  try {
    // Simulate the form submission to ttsave.app
    const formData = new URLSearchParams();
    formData.append('id', tiktokUrl);
    
    const response = await fetch('https://ttsave.app/download', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Origin': 'https://ttsave.app',
        'Referer': 'https://ttsave.app/id',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin'
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Server 1 responded with status ${response.status}`);
    }

    const html = await response.text();
    
    // Parse the HTML to extract download links
    const downloadLinkMatch = html.match(/<a[^>]*href="([^"]*)"[^>]*id="btn-download-fallback"/);
    const titleMatch = html.match(/<span[^>]*id="download-progress-name"[^>]*>(.*?)<\/span>/);
    
    if (!downloadLinkMatch || !downloadLinkMatch[1]) {
      return null;
    }

    const downloadUrl = downloadLinkMatch[1];
    const title = titleMatch && titleMatch[1] ? titleMatch[1] : 'TikTok Video';

    return {
      mediaUrls: [downloadUrl],
      meta: { 
        title: title,
        author: 'TikTok User',
        cover: null
      },
      from: 'ttsave.app'
    };

  } catch (error) {
    console.error('Server 1 (ttsave.app) error:', error);
    return null;
  }
}

// Function to try Server 2 (alternative TikTok downloader)
async function tryServer2(tiktokUrl) {
  try {
    // Using TikWM as a fallback server
    const encodedParams = new URLSearchParams();
    encodedParams.set('url', tiktokUrl);
    encodedParams.set('hd', '1');

    const response = await fetch('https://tikwm.com/api/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Cookie': 'current_language=en',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      body: encodedParams
    });

    if (!response.ok) {
      throw new Error(`Server 2 responded with status ${response.status}`);
    }

    const data = await response.json();
    
    if (data.code !== 0 || !data.data) {
      return null;
    }

    const d = data.data;
    let mediaUrls = [];
    
    if (d.hdplay) mediaUrls.push(d.hdplay);
    else if (d.play) mediaUrls.push(d.play);
    else if (d.wmplay) mediaUrls.push(d.wmplay);
    
    if (Array.isArray(d.images)) mediaUrls = mediaUrls.concat(d.images);
    if (Array.isArray(d.image_post)) mediaUrls = mediaUrls.concat(d.image_post);
    
    // Filter duplicates and empty values
    mediaUrls = mediaUrls.filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);

    return {
      mediaUrls,
      meta: { 
        title: d.title || 'TikTok Video', 
        author: d.author || 'TikTok User', 
        duration: d.duration || 0, 
        cover: d.cover || null, 
        create_time: d.create_time || null 
      },
      from: 'tikwm.com'
    };

  } catch (error) {
    console.error('Server 2 (tikwm.com) error:', error);
    return null;
  }
}
