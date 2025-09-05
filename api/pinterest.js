import axios from 'axios';
import cheerio from 'cheerio';
import cloudscraper from 'cloudscraper';
import { JSDOM } from 'jsdom';

// Function to resolve Pinterest short URLs
const resolvePinterestUrl = async (url) => {
  try {
    let res = await axios.get(url, {
      maxRedirects: 0,
      validateStatus: status => status >= 200 && status < 400,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    }).catch(e => e.response || e);

    let finalUrl = res.headers?.location || url;

    if (/api\.pinterest\.com\/url_shortener/.test(finalUrl)) {
      let res2 = await axios.get(finalUrl, {
        maxRedirects: 0,
        validateStatus: status => status >= 200 && status < 400,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }).catch(e => e.response || e);
      finalUrl = res2.headers?.location || finalUrl;
    }

    return finalUrl;
  } catch (e) {
    console.error('Resolve URL Error:', e);
    return url;
  }
};

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
    // Validate Pinterest URL
    if (!url.includes('pinterest.com') && !url.includes('pin.it')) {
      return response.status(400).json({ success: false, error: 'URL tidak valid. Pastikan URL berasal dari Pinterest.' });
    }

    let pinterestUrl = url;

    try {
      // Step 1: Resolve shortlink dengan axios
      pinterestUrl = await resolvePinterestUrl(pinterestUrl);

      if (!/pinterest\.com\/pin/.test(pinterestUrl)) {
        return response.status(400).json({ 
          success: false, 
          error: 'Gagal mendapatkan URL pin asli!' 
        });
      }

      // Step 2: Scrape dari savepin.app dengan axios + cheerio
      const apiUrl = `https://www.savepin.app/download.php?url=${encodeURIComponent(pinterestUrl)}&lang=en&type=redirect`;
      const { data: html } = await axios.get(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 15000
      });

      const $ = cheerio.load(html);
      const extractMediaUrl = (el) => {
        const href = $(el).attr('href');
        if (!href) return null;
        const match = href.match(/url=([^&]+)/);
        return match ? decodeURIComponent(match[1]) : null;
      };

      const videoEl = $('a[href*="force-save.php?url="][href*=".mp4"]');
      const imgEl = $('a[href*="force-save.php?url="][href*=".jpg"], a[href*="force-save.php?url="][href*=".png"], a[href*="force-save.php?url="][href*=".jpeg"]');

      const videoUrl = videoEl.length ? extractMediaUrl(videoEl[0]) : null;
      const imageUrl = imgEl.length ? extractMediaUrl(imgEl[0]) : null;

      if (!videoUrl && !imageUrl) {
        return response.status(404).json({ 
          success: false, 
          error: 'Tidak dapat menemukan media.' 
        });
      }

      return response.status(200).json({
        success: true,
        data: {
          originalUrl: url,
          resolvedUrl: pinterestUrl,
          media: {
            video: videoUrl,
            image: imageUrl
          },
          type: videoUrl ? 'video' : 'image'
        }
      });

    } catch (error) {
      console.log('Axios+Cheerio failed, trying with Cloudscraper...');

      // Fallback ke Cloudscraper + JSDOM
      try {
        const savepinUrl = `https://www.savepin.app/download.php?url=${encodeURIComponent(pinterestUrl)}&lang=en&type=redirect`;
        const html = await cloudscraper.get(savepinUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });

        const dom = new JSDOM(html);
        const document = dom.window.document;

        const extractMediaUrl = (element) => {
          const href = element.getAttribute('href');
          if (!href) return null;
          const match = href.match(/url=([^&]+)/);
          return match ? decodeURIComponent(match[1]) : null;
        };

        const videoElements = document.querySelectorAll('a[href*="force-save.php?url="][href*=".mp4"]');
        const imageElements = document.querySelectorAll('a[href*="force-save.php?url="][href*=".jpg"], a[href*="force-save.php?url="][href*=".png"], a[href*="force-save.php?url="][href*=".jpeg"]');

        const videoUrl = videoElements.length > 0 ? extractMediaUrl(videoElements[0]) : null;
        const imageUrl = imageElements.length > 0 ? extractMediaUrl(imageElements[0]) : null;

        if (!videoUrl && !imageUrl) {
          return response.status(404).json({ 
            success: false, 
            error: 'Tidak dapat menemukan media.' 
          });
        }

        return response.status(200).json({
          success: true,
          data: {
            originalUrl: url,
            resolvedUrl: pinterestUrl,
            media: {
              video: videoUrl,
              image: imageUrl
            },
            type: videoUrl ? 'video' : 'image'
          }
        });

      } catch (cloudError) {
        console.error('Cloudscraper failed:', cloudError);
        throw new Error('Semua metode gagal');
      }
    }

  } catch (error) {
    console.error('Error fetching Pinterest data:', error);
    
    // Retry logic
    if (retry < 2) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
    }
    
    return response.status(500).json({ 
      success: false, 
      error: 'Gagal mengambil data dari Pinterest. Pastikan URL valid dan coba lagi.' 
    });
  }
}
