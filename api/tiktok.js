// API TikTok Downloader dengan Server Utama dan Backup
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

    // Try Main Server first (ssstik.io)
    let tiktokData = await downloadFromSSSTik(url);
    
    // If Main Server fails, try Backup Server 1 (TikWM)
    if (!tiktokData || !tiktokData.mediaUrls || tiktokData.mediaUrls.length === 0) {
      tiktokData = await tryServer1(url);
    }
    
    // If Backup Server 1 fails, try Backup Server 2 (SaveTik)
    if (!tiktokData || !tiktokData.mediaUrls || tiktokData.mediaUrls.length === 0) {
      tiktokData = await tryServer2(url);
    }

    // If all servers fail
    if (!tiktokData || !tiktokData.mediaUrls || tiktokData.mediaUrls.length === 0) {
      return res.status(404).json({ error: 'Could not fetch TikTok data from any server' });
    }

    // Return successful response
    return res.status(200).json({
      success: true,
      data: {
        title: tiktokData.meta?.title || 'TikTok Video',
        author: tiktokData.meta?.author || 'TikTok User',
        duration: tiktokData.meta?.duration || 0,
        uploadTime: tiktokData.meta?.create_time || null,
        mediaCount: tiktokData.mediaUrls.length,
        mediaUrls: tiktokData.mediaUrls,
        coverUrl: tiktokData.meta?.cover || tiktokData.thumbnail || null,
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
    
    // Parse the HTML response using regex
    let noWatermark = null;
    let audio = null;
    let thumbnail = null;
    
    // Extract download links
    const linkRegex = /<a\s+[^>]*href=["']([^"']*)["'][^>]*>/gi;
    let linkMatch;
    const allLinks = [];
    
    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const href = linkMatch[1];
      if (href && href.includes('tikcdn.io')) {
        allLinks.push(href);
      }
    }

    // Check if this is a slideshow (multiple images)
    const isSlideshow = allLinks.some(link => link.includes('/photo-mode/'));
    
    if (isSlideshow) {
      // For slideshows, collect all image links
      const imageLinks = allLinks.filter(link => 
        link.includes('/photo-mode/') && !link.includes('/video/')
      );
      
      return {
        mediaUrls: imageLinks,
        thumbnail: imageLinks[0] || null, // Use first image as thumbnail
        from: 'server utama'
      };
    } else {
      // For videos, proceed as before
      while ((linkMatch = linkRegex.exec(html)) !== null) {
        const href = linkMatch[1];
        if (href && href.includes('tikcdn.io')) {
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

      // Extract thumbnail
      const imgRegex = /<img\s+[^>]*src=["']([^"']*)["'][^>]*>/gi;
      let imgMatch;
      while ((imgMatch = imgRegex.exec(html)) !== null) {
        const src = imgMatch[1];
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
        // Fallback: try to find any download link
        const directDownloadRegex = /href=["'](https?:\/\/[^"']*\.(mp4|mp3)[^"']*)["']/i;
        const directMatch = directDownloadRegex.exec(html);
        if (directMatch && directMatch[1]) {
          mediaUrls.push(directMatch[1]);
        } else {
          throw new Error('No media URLs found');
        }
      }

      return {
        mediaUrls,
        thumbnail,
        from: 'server utama'
      };
    }

  } catch (error) {
    console.error('Server utama download error:', error);
    return null;
  }
}

// Function to try Backup Server 1 (TikWM)
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
    
    // Handle slideshow images
    if (Array.isArray(d.images)) {
      mediaUrls = mediaUrls.concat(d.images);
    } else if (Array.isArray(d.image_post)) {
      mediaUrls = mediaUrls.concat(d.image_post);
    }
    
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
      from: 'Server 1 (backup)'
    };

  } catch (error) {
    console.error('Server 1 error:', error);
    return null;
  }
}

// Function to try Backup Server 2 (SaveTik)
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
      from: 'Server 2 (backup)'
    };

  } catch (error) {
    console.error('Server 2 error:', error);
    return null;
  }
}
