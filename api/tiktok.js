// API TikTok Downloader dengan Pemisahan Media
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
    if (!tiktokData || (!tiktokData.images.length && !tiktokData.videos.length && !tiktokData.audios.length)) {
      tiktokData = await tryServer2(url);
    }

    // If both servers fail
    if (!tiktokData || (!tiktokData.images.length && !tiktokData.videos.length && !tiktokData.audios.length)) {
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
        images: tiktokData.images,
        videos: tiktokData.videos,
        audios: tiktokData.audios,
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
    
    // Pisahkan media berdasarkan jenisnya
    const images = [];
    const videos = [];
    const audios = [];
    
    // Video
    if (d.hdplay) videos.push({ url: d.hdplay, quality: 'HD' });
    if (d.play) videos.push({ url: d.play, quality: 'Standard' });
    if (d.wmplay) videos.push({ url: d.wmplay, quality: 'Watermark' });
    
    // Images
    if (Array.isArray(d.images)) {
      d.images.forEach(img => images.push({ url: img }));
    }
    if (Array.isArray(d.image_post)) {
      d.image_post.forEach(img => images.push({ url: img }));
    }
    
    // Audio
    if (d.music && d.music.play) {
      audios.push({ 
        url: d.music.play, 
        title: d.music.title || 'TikTok Audio',
        author: d.music.author || 'Unknown'
      });
    }

    return {
      images,
      videos,
      audios,
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
    const images = [];
    const imageRegex = /<li[^>]*>.*?<img[^>]*src="([^"]*)"[^>]*>/g;
    let match;
    while ((match = imageRegex.exec(html)) !== null) {
      images.push({ url: match[1] });
    }

    // Extract audio (biasanya ada di akhir array images)
    const audios = [];
    const videos = [];
    
    if (video_url) {
      videos.push({ url: video_url, quality: 'Standard' });
    }
    
    // Cari URL audio (biasanya mengandung "audio_mpeg" atau "music")
    const audioRegex = /https?:\/\/[^"']*audio[^"']*\.(mp3|m4a|aac)|https?:\/\/[^"']*music[^"']*\.(mp3|m4a|aac)/gi;
    const audioMatches = html.match(audioRegex);
    if (audioMatches && audioMatches.length > 0) {
      audios.push({ 
        url: audioMatches[0], 
        title: 'TikTok Audio',
        author: 'Unknown'
      });
    }

    return {
      images,
      videos,
      audios,
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
