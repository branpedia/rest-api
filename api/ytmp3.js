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

    const result = await convertWithFetch(url);

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
      // Wait for 1 second before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
      return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
    }
    
    return response.status(500).json({ 
      success: false, 
      error: 'Gagal mengambil data dari YouTube. Pastikan URL valid dan coba lagi.' 
    });
  }
}

// Convert using direct fetch requests
async function convertWithFetch(youtubeUrl) {
  try {
    // Step 1: Get initial page to obtain cookies
    const initResponse = await fetch('https://ssvid.net/id4', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
      }
    });

    const cookies = initResponse.headers.get('set-cookie') || '';

    // Step 2: Search for the video
    const searchParams = new URLSearchParams();
    searchParams.append('q', youtubeUrl);
    searchParams.append('t', 'search');

    const searchResponse = await fetch('https://ssvid.net/api/ajaxSearch/index', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://ssvid.net',
        'Referer': 'https://ssvid.net/id4',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': cookies,
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      body: searchParams.toString()
    });

    if (!searchResponse.ok) {
      throw new Error(`Search request failed: ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();
    console.log('Search response:', searchData);

    if (!searchData || searchData.status !== 'ok' || !searchData.vid) {
      throw new Error('Video tidak ditemukan di ssvid.net');
    }

    // Step 3: Find audio format token
    let token = null;
    let format = 'm4a';

    if (searchData.links && searchData.links.audio) {
      // Look for M4A format (usually the first audio format)
      const audioFormats = Object.values(searchData.links.audio);
      if (audioFormats.length > 0 && audioFormats[0].k) {
        token = audioFormats[0].k;
      }
    }

    if (!token) {
      throw new Error("Token konversi untuk audio tidak ditemukan.");
    }

    // Step 4: Convert to get download link
    const convertParams = new URLSearchParams();
    convertParams.append('vid', searchData.vid);
    convertParams.append('k', token);
    convertParams.append('t', 'convert');

    const convertResponse = await fetch('https://ssvid.net/api/ajaxConvert/convert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://ssvid.net',
        'Referer': 'https://ssvid.net/id4',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': cookies,
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      body: convertParams.toString()
    });

    if (!convertResponse.ok) {
      throw new Error(`Convert request failed: ${convertResponse.status}`);
    }

    const convertData = await convertResponse.json();
    console.log('Convert response:', convertData);

    if (!convertData || !convertData.durl) {
      throw new Error("Download link tidak ditemukan.");
    }

    return {
      title: searchData.title || "YouTube Audio",
      downloadUrl: convertData.durl,
      format: format,
      quality: "128kbps"
    };

  } catch (error) {
    console.error('Fetch conversion error:', error);
    throw error;
  }
}
