import axios from "axios";

async function getToken(url) {
  try {
    const response = await axios.get(url);
    const cookies = response.headers["set-cookie"];
    const joinedCookies = cookies ? cookies.join("; ") : null;

    const csrfTokenMatch = response.data.match(/<meta name="csrf-token" content="(.*?)">/);
    const csrfToken = csrfTokenMatch ? csrfTokenMatch[1] : null;

    if (!csrfToken || !joinedCookies) {
      throw new Error("Gagal mendapatkan CSRF token atau cookie.");
    }

    return { csrfToken, joinedCookies };
  } catch (error) {
    console.error("❌ Error fetching cookies or CSRF token:", error.message);
    throw error;
  }
}

async function mlStalk(userId, zoneId) {
  try {
    const { csrfToken, joinedCookies } = await getToken("https://www.gempaytopup.com");

    const payload = {
      uid: userId,
      zone: zoneId,
    };

    const { data } = await axios.post(
      "https://www.gempaytopup.com/stalk-ml",
      payload,
      {
        headers: {
          "X-CSRF-Token": csrfToken,
          "Content-Type": "application/json",
          Cookie: joinedCookies,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        },
      }
    );

    return data;
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error("Response:", error.response?.data || "No response data");
    throw error;
  }
}

// API Handler
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

  const { userId, zoneId, retry = 0 } = request.query;

  if (!userId || !zoneId) {
    return response.status(400).json({ 
      success: false, 
      error: 'Parameter userId dan zoneId diperlukan. Contoh: ?userId=12345678&zoneId=1234' 
    });
  }

  try {
    const result = await mlStalk(userId, zoneId);
    
    if (result) {
      return response.status(200).json({
        success: true,
        data: {
          username: result.username || 'Tidak tersedia',
          region: result.region || 'Tidak tersedia',
          success: result.success || false,
          rawData: result
        }
      });
    } else {
      return response.status(404).json({ 
        success: false, 
        error: 'Data tidak ditemukan' 
      });
    }
  } catch (error) {
    console.error('Error fetching ML data:', error);
    
    // Retry logic
    if (retry < 2) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return handler({ ...request, query: { ...request.query, retry: parseInt(retry) + 1 } }, response);
    }
    
    return response.status(500).json({ 
      success: false, 
      error: 'Gagal mengambil data. Pastikan userId dan zoneId valid.' 
    });
  }
}
