import cloudscraper from 'cloudscraper';
import { JSDOM } from 'jsdom';
import puppeteer from 'puppeteer';

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
    // Validate Threads URL (accept both threads.net and threads.com)
    if ((!url.includes('threads.net') && !url.includes('threads.com')) || !url.includes('/post/')) {
      return response.status(400).json({ 
        success: false, 
        error: 'URL tidak valid. Pastikan URL berasal dari Threads (threads.net atau threads.com).' 
      });
    }

    // Extract thread ID from URL
    let threadId = url.match(/\/post\/([a-zA-Z0-9_-]+)/)?.[1];
    if (!threadId) {
      return response.status(400).json({ success: false, error: 'Gagal mengambil ID post dari URL' });
    }

    // Clean thread ID (remove query parameters if any)
    threadId = threadId.split('?')[0];

    console.log('Extracted thread ID:', threadId);

    // Use dolphinradar API directly (more reliable)
    let apiData;
    try {
      console.log('Trying dolphinradar API...');
      const apiUrl = `https://www.dolphinradar.com/api/threads/post_detail/${threadId}`;
      
      // Use cloudscraper for the API request
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

    if (!post) {
      throw new Error('Data post tidak ditemukan');
    }

    const media = post.media_list || [];
    const totalImages = media.filter((m) => m.media_type === 1).length;
    const totalVideos = media.filter((m) => m.media_type === 2).length;

    // Process media for response - convert WebP to JPG when there are videos
    const processedMedia = [];
    const hasVideos = totalVideos > 0;
    
    for (const item of media) {
      if (item.media_type === 1) { // Image
        let mediaUrl = item.url || '';
        let format = 'jpg';
        
        // Determine format from URL
        if (mediaUrl.includes('.jpg') || mediaUrl.includes('.jpeg')) {
          format = 'jpg';
        } else if (mediaUrl.includes('.png')) {
          format = 'png';
        } else if (mediaUrl.includes('.webp')) {
          format = 'webp';
          // Convert WebP to JPG if there are videos in the post
          if (hasVideos) {
            mediaUrl = mediaUrl.replace('.webp', '.jpg');
            format = 'jpg';
          }
        }
        
        processedMedia.push({
          type: 'image',
          url: mediaUrl,
          format: format,
          width: item.width || 0,
          height: item.height || 0
        });
        
      } else if (item.media_type === 2) { // Video
        let mediaUrl = item.url || '';
        let format = 'mp4';
        
        // Determine format from URL or use default
        if (mediaUrl.includes('.mp4')) {
          format = 'mp4';
        } else if (mediaUrl.includes('.mov')) {
          format = 'mov';
        } else if (mediaUrl.includes('.avi')) {
          format = 'avi';
        } else if (mediaUrl.includes('.webm')) {
          format = 'webm';
        }
        
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
          }
        },
        media: processedMedia
      }
    };

    return response.status(200).json(responseData);

  } catch (error) {
    console.error('Error fetching Threads data:', error);
    
    // Retry logic
    if (retry < 2) {
      console.log(`Retrying... (${parseInt(retry) + 1}/2)`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
    }
    
    return response.status(500).json({ 
      success: false, 
      error: 'Gagal mengambil data dari Threads. Pastikan URL valid dan coba lagi.',
      details: error.message 
    });
  }
}
