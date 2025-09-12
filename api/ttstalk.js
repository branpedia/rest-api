// API TikTok Profile Fetcher
// Endpoint: GET /api/ttstalk?username=[username]

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

  const { username } = req.query;

  if (!username) {
    return res.status(400).json({ error: 'Username parameter is required' });
  }

  try {
    // Scrape TikTok profile data
    const profileData = await scrapeTikTokProfile(username);

    if (!profileData) {
      return res.status(404).json({ error: 'Profile not found or private' });
    }

    // Return successful response
    return res.status(200).json({
      success: true,
      data: profileData
    });

  } catch (error) {
    console.error('TikTok Profile API Error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch TikTok profile data',
      message: error.message 
    });
  }
}

// Function to scrape TikTok profile data
async function scrapeTikTokProfile(username) {
  try {
    const url = `https://www.tiktok.com/@${username}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    
    // Extract profile data using regex patterns
    const profileData = extractProfileData(html);
    
    return {
      username: username,
      ...profileData
    };

  } catch (error) {
    console.error('Scraping error:', error);
    return null;
  }
}

// Function to extract profile data from HTML
function extractProfileData(html) {
  // Extract following count
  const followingMatch = html.match(/<strong[^>]*title="Mengikuti"[^>]*>([\d.,KM]+)<\/strong>/) ||
                        html.match(/<strong[^>]*data-e2e="following-count"[^>]*>([\d.,KM]+)<\/strong>/);
  const following = followingMatch ? followingMatch[1] : '0';

  // Extract followers count
  const followersMatch = html.match(/<strong[^>]*title="Pengikut"[^>]*>([\d.,KM]+)<\/strong>/) ||
                        html.match(/<strong[^>]*data-e2e="followers-count"[^>]*>([\d.,KM]+)<\/strong>/);
  const followers = followersMatch ? followersMatch[1] : '0';

  // Extract likes count
  const likesMatch = html.match(/<strong[^>]*title="Suka"[^>]*>([\d.,KM]+)<\/strong>/) ||
                    html.match(/<strong[^>]*data-e2e="likes-count"[^>]*>([\d.,KM]+)<\/strong>/);
  const likes = likesMatch ? likesMatch[1] : '0';

  // Extract bio/description
  const bioMatch = html.match(/<h2[^>]*data-e2e="user-bio"[^>]*>(.*?)<\/h2>/) ||
                  html.match(/<h2[^>]*class="[^"]*ShareDesc[^"]*"[^>]*>(.*?)<\/h2>/);
  const bio = bioMatch ? cleanHtml(bioMatch[1]) : '';

  // Extract profile link
  const linkMatch = html.match(/<a[^>]*data-e2e="user-link"[^>]*href="([^"]*)"[^>]*>/) ||
                   html.match(/<a[^>]*class="[^"]*BioLink[^"]*"[^>]*href="([^"]*)"[^>]*>/);
  const link = linkMatch ? linkMatch[1] : '';

  // Extract display name (if available)
  const displayNameMatch = html.match(/<h1[^>]*data-e2e="user-title"[^>]*>(.*?)<\/h1>/) ||
                          html.match(/<h1[^>]*class="[^"]*ShareTitle[^"]*"[^>]*>(.*?)<\/h1>/);
  const displayName = displayNameMatch ? cleanHtml(displayNameMatch[1]) : '';

  // Extract avatar (if available)
  const avatarMatch = html.match(/<img[^>]*data-e2e="user-avatar"[^>]*src="([^"]*)"[^>]*>/) ||
                     html.match(/<img[^>]*class="[^"]*Avatar[^"]*"[^>]*src="([^"]*)"[^>]*>/);
  const avatar = avatarMatch ? avatarMatch[1] : '';

  return {
    displayName,
    following: formatCount(following),
    followers: formatCount(followers),
    likes: formatCount(likes),
    bio,
    link,
    avatar,
    profileUrl: `https://www.tiktok.com/@${username}`
  };
}

// Helper function to clean HTML tags
function cleanHtml(text) {
  return text.replace(/<[^>]*>/g, '').trim();
}

// Helper function to format count (convert K/M to numbers)
function formatCount(count) {
  if (count.includes('K')) {
    return parseFloat(count.replace('K', '')) * 1000;
  }
  if (count.includes('M')) {
    return parseFloat(count.replace('M', '')) * 1000000;
  }
  return parseInt(count.replace(/\./g, '')) || 0;
}
