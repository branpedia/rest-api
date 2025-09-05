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
    // Validate YouTube Post URL
    if (!url.includes('youtube.com/post/')) {
      return response.status(400).json({ 
        success: false, 
        error: 'URL tidak valid. Pastikan URL berasal dari YouTube Post (format: https://www.youtube.com/post/...)' 
      });
    }

    let res = await fetch(url);
    if (!res.ok) {
      // Retry logic
      if (retry < 3) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
      }
      
      throw `Gagal fetch halaman: ${res.status}`;
    }
    
    let html = await res.text();

    // cari script ytInitialData
    let jsonMatch = html.match(/var ytInitialData = (.*?);\s*<\/script>/);
    if (!jsonMatch) {
      // Retry logic
      if (retry < 3) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
      }
      
      throw `Tidak menemukan data post`;
    }

    let data;
    try {
      data = JSON.parse(jsonMatch[1]);
    } catch (parseError) {
      throw `Gagal memparsing data dari YouTube`;
    }

    // cari bagian postRenderer
    let postRenderer = findPostRenderer(data);
    if (!postRenderer) {
      throw `Tidak bisa menemukan postRenderer`;
    }

    // ambil caption
    let caption = postRenderer.contentText?.runs?.map(r => r.text).join(" ") || "Tanpa caption";

    // ambil gambar (support single & multi)
    let images = [];

    if (postRenderer.backstageAttachment?.imageAttachmentRenderer) {
      // single image
      let imgs = postRenderer.backstageAttachment.imageAttachmentRenderer.image.thumbnails;
      images.push(imgs[imgs.length - 1].url);
    }

    if (postRenderer.backstageAttachment?.backstageImageRenderer) {
      // single image (variasi lain)
      let imgs = postRenderer.backstageAttachment.backstageImageRenderer.image.thumbnails;
      images.push(imgs[imgs.length - 1].url);
    }

    if (postRenderer.backstageAttachment?.postMultiImageRenderer?.images) {
      // multi-image (carousel)
      for (let imgObj of postRenderer.backstageAttachment.postMultiImageRenderer.images) {
        let imgs = imgObj.backstageImageRenderer.image.thumbnails;
        images.push(imgs[imgs.length - 1].url);
      }
    }

    // ambil informasi penulis dan waktu posting
    const authorText = postRenderer.authorText?.runs?.[0]?.text || "Unknown Author";
    const publishedTimeText = postRenderer.publishedTimeText?.runs?.[0]?.text || "Unknown Time";

    return response.status(200).json({
      success: true,
      data: {
        caption: caption,
        author: authorText,
        publishedTime: publishedTimeText,
        images: images,
        imageCount: images.length
      }
    });

  } catch (error) {
    console.error('Error fetching YouTube Post data:', error);
    
    // Retry logic
    if (retry < 3) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
    }
    
    return response.status(500).json({ 
      success: false, 
      error: error.message || error 
    });
  }
}

// fungsi rekursif untuk cari postRenderer
function findPostRenderer(obj) {
  if (!obj || typeof obj !== "object") return null;
  
  if (obj.backstagePostThreadRenderer?.post?.backstagePostRenderer) {
    return obj.backstagePostThreadRenderer.post.backstagePostRenderer;
  }
  
  for (let k of Object.keys(obj)) {
    let found = findPostRenderer(obj[k]);
    if (found) return found;
  }
  
  return null;
}
