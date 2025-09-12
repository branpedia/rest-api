import axios from 'axios';

export default async function handler(request, response) {
  // Set CORS headers
  response.setHeader('Access-Control-Allow-Credentials', true);
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle OPTIONS request for CORS
  if (request.method === 'OPTIONS') {
    response.status(200).end();
    return;
  }

  // Only allow GET requests
  if (request.method !== 'GET') {
    return response.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { url, retry = 0 } = request.query;

  if (!url) {
    return response.status(400).json({ success: false, error: 'Parameter URL diperlukan' });
  }

  try {
    // Validate YouTube URL
    if (!url.includes('youtube.com/') && !url.includes('youtu.be/')) {
      return response.status(400).json({ success: false, error: 'URL tidak valid. Pastikan URL berasal dari YouTube.' });
    }

    let result = await convertWithAxios(url);
    
    return response.status(200).json({
      success: true,
      data: {
        title: result.title,
        downloadUrl: result.downloadUrl,
        format: result.format,
        quality: result.quality || '128kbps'
      }
    });

  } catch (error) {
    console.error('Error in YouTube to MP3 converter:', error);
    
    // Retry logic
    if (retry < 3) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
    }
    
    return response.status(500).json({ 
      success: false, 
      error: 'Gagal mengambil data dari YouTube. Pastikan URL valid dan coba lagi.' 
    });
  }
}

// Convert using Axios only
async function convertWithAxios(youtubeUrl) {
  try {
    // Step 1: Search for the video
    const searchResponse = await axios.post('https://ssvid.net/api/search', 
      `q=${encodeURIComponent(youtubeUrl)}&t=search`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
          'Origin': 'https://ssvid.net',
          'Referer': 'https://ssvid.net/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      }
    );

    const searchData = searchResponse.data;
    
    if (!searchData || !searchData.data || !searchData.data.vid) {
      throw new Error('Video tidak ditemukan');
    }

    const vid = searchData.data.vid;
    const title = searchData.data.title;

    // Step 2: Try to convert to M4A first
    try {
      const convertResponse = await axios.post('https://ssvid.net/api/convert', 
        `vid=${vid}&k=m4a&t=convert`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
            'Origin': 'https://ssvid.net',
            'Referer': `https://ssvid.net/id/${vid}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        }
      );

      const convertData = convertResponse.data;
      
      if (convertData && convertData.data && convertData.data.dlink) {
        return {
          title: title,
          downloadUrl: convertData.data.dlink,
          format: "m4a",
          quality: "128kbps"
        };
      }
    } catch (m4aError) {
      console.log('M4A conversion failed, trying MP3...');
    }

    // Step 3: If M4A fails, try MP3
    const mp3Response = await axios.post('https://ssvid.net/api/convert', 
      `vid=${vid}&k=mp3&t=convert`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
          'Origin': 'https://ssvid.net',
          'Referer': `https://ssvid.net/id/${vid}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      }
    );

    const mp3Data = mp3Response.data;
    
    if (!mp3Data || !mp3Data.data || !mp3Data.data.dlink) {
      throw new Error("Download link tidak ditemukan.");
    }

    return {
      title: title,
      downloadUrl: mp3Data.data.dlink,
      format: "mp3",
      quality: "128kbps"
    };

  } catch (error) {
    console.error('Axios conversion error:', error.response?.data || error.message);
    throw error;
  }
}

// Alternative: Using fetch instead of axios
async function convertWithFetch(youtubeUrl) {
  try {
    // Step 1: Search for the video
    const searchResponse = await fetch('https://ssvid.net/api/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://ssvid.net',
        'Referer': 'https://ssvid.net/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      body: `q=${encodeURIComponent(youtubeUrl)}&t=search`
    });

    const searchData = await searchResponse.json();
    
    if (!searchData || !searchData.data || !searchData.data.vid) {
      throw new Error('Video tidak ditemukan');
    }

    const vid = searchData.data.vid;
    const title = searchData.data.title;

    // Step 2: Convert to audio
    const convertResponse = await fetch('https://ssvid.net/api/convert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://ssvid.net',
        'Referer': `https://ssvid.net/id/${vid}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      body: `vid=${vid}&k=m4a&t=convert`
    });

    const convertData = await convertResponse.json();
    
    if (!convertData || !convertData.data || !convertData.data.dlink) {
      throw new Error("Download link tidak ditemukan.");
    }

    return {
      title: title,
      downloadUrl: convertData.data.dlink,
      format: "m4a",
      quality: "128kbps"
    };

  } catch (error) {
    console.error('Fetch conversion error:', error);
    throw error;
  }
}
