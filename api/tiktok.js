// API TikTok Downloader
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

    // Fetch data from TikTok using a public API
    const tikwmResponse = await fetch(`https://tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`);
    
    if (!tikwmResponse.ok) {
      throw new Error(`API responded with status ${tikwmResponse.status}`);
    }

    const data = await tikwmResponse.json();

    if (data.code !== 0) {
      return res.status(404).json({ error: 'Video not found or private' });
    }

    // Extract relevant information
    const result = {
      success: true,
      data: {
        id: data.data?.id || '',
        title: data.data?.title || '',
        author: {
          nickname: data.data?.author?.nickname || '',
          unique_id: data.data?.author?.unique_id || ''
        },
        duration: data.data?.duration || 0,
        play_count: data.data?.play_count || 0,
        digg_count: data.data?.digg_count || 0,
        comment_count: data.data?.comment_count || 0,
        share_count: data.data?.share_count || 0,
        download_count: data.data?.download_count || 0,
        create_time: data.data?.create_time || 0,
        video: {
          url: data.data?.play || '',
          hd_url: data.data?.hdplay || '',
          cover: data.data?.cover || '',
          dynamic_cover: data.data?.origin_cover || ''
        },
        music: {
          title: data.data?.music?.title || '',
          author: data.data?.music?.author || '',
          url: data.data?.music?.play || '',
          cover: data.data?.music?.cover || ''
        }
      }
    };

    return res.status(200).json(result);

  } catch (error) {
    console.error('TikTok API Error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch TikTok data',
      message: error.message 
    });
  }
}
