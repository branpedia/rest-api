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

    // Try Server 1 first
    let tiktokData = await tryServer1(url);
    
    // If Server 1 fails, try Server 2
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

// Function to try Server 1 (TikWM)
async function tryServer1(tiktokUrl) {
  try {
    const encodedParams = new URLSearchParams();
    encodedParams.set('url', tiktokUrl);
    encodedParams.set('hd', '1');

    const response = await fetch('https://tikwm.com/api/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Cookie': 'current_language=en',
        'User-Agent': 'Mozilla/5.0'
      },
      body: encodedParams
    });

    if (!response.ok) {
      throw new Error(`Server 1 responded with status ${response.status}`);
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
        title: d.title, 
        author: d.author, 
        duration: d.duration, 
        cover: d.cover, 
        create_time: d.create_time 
      },
      from: 'Server 1'
    };

  } catch (error) {
    console.error('Server 1 error:', error);
    return null;
  }
}

// Function to try Server 2 (SaveTik)
async function tryServer2(tiktokUrl) {
  try {
    const formData = new URLSearchParams();
    formData.append('q', tiktokUrl);

    const response = await fetch('https://savetik.co/api/ajaxSearch', {
      method: 'POST',
      headers: {
        'Accept': '*/*',
        'Origin': 'https://savetik.co',
        'Referer': 'https://savetik.co/en2',
        'User-Agent': 'Mozilla/5.0',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Server 2 responded with status ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.data) {
      return null;
    }

    // Parse HTML response to extract data
    const html = data.data;
    const titleMatch = html.match(/<h3[^>]*>(.*?)<\/h3>/);
    const thumbnailMatch = html.match(/<img[^>]*src="([^"]*)"[^>]*image-tik/);
    const videoMatch = html.match(/<video[^>]*data-src="([^"]*)"[^>]*id="vid"/);
    
    const title = titleMatch ? titleMatch[1].trim() : '';
    const thumbnail = thumbnailMatch ? thumbnailMatch[1] : '';
    const video_url = videoMatch ? videoMatch[1] : '';
    
    // Extract slide images
    const slideImages = [];
    const imageRegex = /<li[^>]*>.*?<img[^>]*src="([^"]*)"[^>]*>/g;
    let match;
    while ((match = imageRegex.exec(html)) !== null) {
      slideImages.push(match[1]);
    }

    let mediaUrls = [];
    if (video_url) mediaUrls.push(video_url);
    mediaUrls = mediaUrls.concat(slideImages);
    
    // Filter duplicates and empty values
    mediaUrls = mediaUrls.filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);

    return {
      mediaUrls,
      meta: { 
        title: title, 
        cover: thumbnail
      },
      from: 'Server 2'
    };

  } catch (error) {
    console.error('Server 2 error:', error);
    return null;
  }
}
