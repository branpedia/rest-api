import cloudscraper from 'cloudscraper';
import { JSDOM } from 'jsdom';
import puppeteer from 'puppeteer';
import sharp from 'sharp';
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

  const { url, retry = 0, convert = 'true' } = request.query;

  if (!url) {
    return response.status(400).json({ success: false, error: 'Parameter URL diperlukan' });
  }

  try {
    // Validate Threads URL
    if ((!url.includes('threads.net') && !url.includes('threads.com')) || !url.includes('/post/')) {
      return response.status(400).json({ 
        success: false, 
        error: 'URL tidak valid. Pastikan URL berasal dari Threads.' 
      });
    }

    let threadId = url.match(/\/post\/([a-zA-Z0-9_-]+)/)?.[1];
    if (!threadId) {
      return response.status(400).json({ success: false, error: 'Gagal mengambil ID post dari URL' });
    }

    threadId = threadId.split('?')[0];

    // Use dolphinradar API
    let apiData;
    try {
      const apiUrl = `https://www.dolphinradar.com/api/threads/post_detail/${threadId}`;
      const apiResponse = await cloudscraper.get(apiUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Linux; Android 10)",
          "Accept": "application/json",
        },
        timeout: 15000
      });
      apiData = JSON.parse(apiResponse);
    } catch (apiError) {
      console.log('API request failed:', apiError.message);
      throw new Error('Tidak dapat mengakses API Threads');
    }

    // Process the API response
    const raw = apiData;
    const data = raw?.data || raw;
    const post = data?.post_detail || data;
    const user = data?.user || {};

    if (!post) throw new Error('Data post tidak ditemukan');

    const media = post.media_list || [];
    const totalImages = media.filter((m) => m.media_type === 1).length;
    const totalVideos = media.filter((m) => m.media_type === 2).length;

    // Process media
    const processedMedia = [];
    const hasVideos = totalVideos > 0;
    const shouldConvert = convert === 'true';
    
    for (const item of media) {
      if (item.media_type === 1) { // Image
        let mediaUrl = item.url || '';
        let format = 'jpg';
        let jpgConversionUrl = null;
        
        // Determine format and handle WebP conversion
        if (mediaUrl.includes('.jpg') || mediaUrl.includes('.jpeg')) {
          format = 'jpg';
        } else if (mediaUrl.includes('.png')) {
          format = 'png';
        } else if (mediaUrl.includes('.webp')) {
          format = 'webp';
          
          // Cari versi JPG dari version_medias jika ada
          if (item.version_medias && item.version_medias.length > 0) {
            const jpgVersion = item.version_medias.find(v => 
              v.url && (v.url.includes('.jpg') || v.url.includes('.jpeg'))
            );
            
            if (jpgVersion && jpgVersion.url) {
              mediaUrl = jpgVersion.url;
              format = 'jpg';
            } else if (shouldConvert && hasVideos) {
              // Jika harus convert dan tidak ada versi JPG, berikan endpoint konversi
              jpgConversionUrl = `/api/convert?url=${encodeURIComponent(mediaUrl)}&format=jpg`;
            }
          } else if (shouldConvert && hasVideos) {
            jpgConversionUrl = `/api/convert?url=${encodeURIComponent(mediaUrl)}&format=jpg`;
          }
        }
        
        processedMedia.push({
          type: 'image',
          url: mediaUrl,
          format: format,
          width: item.width || 0,
          height: item.height || 0,
          jpg_conversion_url: jpgConversionUrl,
          needs_conversion: format === 'webp' && hasVideos && shouldConvert
        });
        
      } else if (item.media_type === 2) { // Video
        let mediaUrl = item.url || '';
        let format = 'mp4';
        
        if (mediaUrl.includes('.mp4')) format = 'mp4';
        else if (mediaUrl.includes('.mov')) format = 'mov';
        else if (mediaUrl.includes('.avi')) format = 'avi';
        else if (mediaUrl.includes('.webm')) format = 'webm';
        
        processedMedia.push({
          type: 'video',
          url: mediaUrl,
          format: format,
          width: item.width || 0,
          height: item.height || 0
        });
      }
    }

    // Prepare response
    const responseData = {
      success: true,
      data: {
        user: {
          full_name: user.full_name || "-",
          username: user.username || "-",
          verified: user.verified || user.is_verified || false,
          follower_count: user.follower_count || 0,
          avatar: user.avatar || null,
          profile: user.profile || ""
        },
        post: {
          id: post.code || threadId,
          caption: post.caption_text || "-",
          like_count: post.like_count || 0,
          publish_time: post.publish_time || "",
          media_count: {
            images: totalImages,
            videos: totalVideos,
            total: media.length
          },
          has_mixed_media: hasVideos && totalImages > 0
        },
        media: processedMedia,
        conversion: {
          available: shouldConvert,
          note: "Gunakan parameter convert=false untuk menonaktifkan konversi otomatis"
        }
      }
    };

    return response.status(200).json(responseData);

  } catch (error) {
    console.error('Error fetching Threads data:', error);
    
    if (retry < 2) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
    }
    
    return response.status(500).json({ 
      success: false, 
      error: 'Gagal mengambil data dari Threads.',
      details: error.message 
    });
  }
}

// Endpoint terpisah untuk konversi WebP ke JPG
export async function convertHandler(req, res) {
  const { url, format = 'jpg' } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'URL parameter required' });
  }

  try {
    // Download image
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    let buffer = Buffer.from(response.data);
    
    // Convert WebP to desired format
    if (format === 'jpg' || format === 'jpeg') {
      buffer = await sharp(buffer).jpeg().toBuffer();
    } else if (format === 'png') {
      buffer = await sharp(buffer).png().toBuffer();
    }
    
    // Set headers and send converted image
    res.setHeader('Content-Type', `image/${format}`);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache 1 day
    res.send(buffer);
    
  } catch (error) {
    console.error('Conversion error:', error);
    res.status(500).json({ error: 'Conversion failed', details: error.message });
  }
}
