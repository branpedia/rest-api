const s = {
  tools: {
    async hit(description, url, options, returnType = 'text') {
      try {
        const response = await fetch(url, options);
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}\n${await response.text() || '(response body kosong)'}`);
        }
        if (returnType === 'text') {
          const data = await response.text();
          return { data, response };
        } else if (returnType === 'json') {
          const data = await response.json();
          return { data, response };
        } else {
          throw new Error(`invalid returnType param.`);
        }
      } catch (e) {
        throw new Error(`hit ${description} failed. ${e.message}`);
      }
    }
  },

  get baseUrl() {
    return 'https://serpapi.com';
  },

  get baseHeaders() {
    return {
      'accept-encoding': 'gzip, deflate, br, zstd',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0'
    };
  },

  // SerpApi tidak butuh cookie — cukup API key
  async getCookie() {
    return { api_key: '99a605260e609bb3b58fbe12792cc316686cb7e10e447a38f6bd6360e6b68dbf' };
  },

  // Tidak perlu CAPTCHA — SerpApi sudah handle
  async ifCaptcha() {
    return {};
  },

  // 🔥 Fungsi inti: panggil Google Lens API SerpApi dengan semua field asli
  async googleLens(imageUrl, options = {}) {
    const { api_key } = await this.getCookie();
    const { hl = 'en', country = 'us', type = 'visual_matches', q = '' } = options;

    const pathname = '/search.json';
    const url = new URL(pathname, this.baseUrl);

    const params = new URLSearchParams({
      engine: 'google_lens',
      url: imageUrl,
      api_key,
      hl,
      country,
      type,
      ...(q && { q }) // Hanya tambahkan jika ada
    });

    url.search = params.toString();

    const headers = this.baseHeaders;
    const { data } = await this.tools.hit('Google Lens', url, { headers }, 'json');

    // Cek status dari SerpApi
    if (data.search_metadata?.status === 'Error') {
      throw new Error(data.search_metadata?.error || 'Google Lens returned error');
    }

    if (data.search_metadata?.status !== 'Success') {
      throw new Error('Google Lens hasn\'t returned any results for this query.');
    }

    // 🚨 EXTRACT SEMUA DATA SESUAI ASLI — TANPA DIUBAH!
    const visualMatches = (data.visual_matches || []).map(match => ({
      position: match.position, // ✅ Wajib ada, sesuai urutan
      title: match.title,
      link: match.link,
      source: match.source,
      thumbnail: match.thumbnail,
      image: match.image,
      thumbnail_width: match.thumbnail_width,
      thumbnail_height: match.thumbnail_height,
      image_width: match.image_width,
      image_height: match.image_height,
      price: match.price || null,
      in_stock: match.in_stock || null,
      condition: match.condition || null,
      rating: match.rating || null,
      reviews: match.reviews || null
    }));

    const relatedSearches = (data.related_content || []).map(item => ({
      title: item.query,
      url: item.link,
      thumbnail: item.thumbnail,
      serpapi_link: item.serpapi_link || null
    }));

    return {
      searchUrl: data.search_metadata?.google_lens_url || `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}`,
      mainImage: imageUrl,
      visualMatches, // ✅ Semua field asli, termasuk position
      relatedSearches,
      metadata: {
        processedAt: data.search_metadata?.processed_at,
        total_time_taken: data.search_metadata?.total_time_taken,
        id: data.search_metadata?.id,
        json_endpoint: data.search_metadata?.json_endpoint,
        created_at: data.search_metadata?.created_at,
        raw_html_file: data.search_metadata?.raw_html_file,
        google_lens_url: data.search_metadata?.google_lens_url
      },
      search_parameters: data.search_parameters // ✅ Dikembalikan utuh
    };
  },

  // Fungsi utama untuk handler
  async analyze(imageUrl, options = {}) {
    // Validasi URL
    new URL(imageUrl);

    if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
      throw new Error('URL gambar harus menggunakan http:// atau https://');
    }

    const result = await this.googleLens(imageUrl, options);
    return result;
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

  // Handle OPTIONS request
  if (request.method === 'OPTIONS') {
    response.status(200).end();
    return;
  }

  // Hanya izinkan GET
  if (request.method !== 'GET') {
    return response.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { imageUrl, retry = 0, hl = 'en', country = 'us', type = 'visual_matches', q = '' } = request.query;

  if (!imageUrl) {
    return response.status(400).json({ success: false, error: 'Parameter imageUrl diperlukan' });
  }

  try {
    // Buat objek opsi
    const options = { hl, country, type, q };

    // Panggil SerpApi Google Lens
    const result = await s.analyze(imageUrl, options);

    // Kirim respons JSON UTUH — tanpa menghapus satu field pun
    return response.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error fetching Google Lens data:', error.message);

    // Retry logic
    if (parseInt(retry) < 2) {
      console.log(`Retrying... Attempt ${parseInt(retry) + 1}`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
    }

    return response.status(500).json({
      success: false,
      error: 'Gagal mengambil data dari Google Lens. Pastikan URL gambar valid, bisa diakses publik, dan API key SerpApi aktif.',
      details: error.message,
      hint: 'Gunakan URL dari imgur.com, wikimedia.org, atau unsplash.com. Contoh: https://i.imgur.com/HBrB8p0.png'
    });
  }
}
