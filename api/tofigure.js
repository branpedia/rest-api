import cloudscraper from 'cloudscraper'
import puppeteer from 'puppeteer'
import { JSDOM } from 'jsdom'

const FREEPIK_API_KEY = 'FPSXd60ff5bb7495a5f30dcf5d29a39e0696' // Using your direct API key
const FREEPIK_API_URL = 'https://api.freepik.com/v1/ai/gemini-2-5-flash-image-preview'

// ==== PROMPTS ====
const PROMPTS = [
  `masterpiece, best quality, highly detailed 1/7 scale commercialized figurine of characters in a realistic style, placed on a cluttered computer desk, round transparent acrylic base with no text, Zbrush modeling process displayed on the computer screen, BANDAI-style toy packaging box next to the screen, featuring vibrant two-dimensional flat illustrations of the original artwork, realistic environment with subtle lighting, intricate details on the figurine and packaging, 8K resolution, photorealistic rendering, professional studio setup, clean and organized desk with peripherals, soft ambient lighting, focus on craftsmanship and presentation`,

  `create a 1/7 scale commercialized figurine of the characters in the picture, in a realistic style, in a real environment. The figurine is placed on a computer desk. The figurine has a round transparent acrylic base, with no text on the base. The content on the computer screen is the Zbrush modeling process of this figurine. Next to the computer screen is a BANDAI-style toy packaging box printed with the original artwork. The packaging features two-dimensional flat illustrations`,

  `masterpiece, best quality, highly detailed 1/7 scale commercialized figurine of characters in a realistic style, placed on a modern computer desk, round transparent acrylic base with no text, Zbrush modeling process displayed on the computer screen, BANDAI-style toy packaging box next to the screen featuring vibrant two-dimensional flat illustrations of the original artwork, realistic environment with soft natural lighting, intricate details on the figurine and packaging, 8K resolution, photorealistic rendering, professional studio setup, clean and organized desk with subtle reflections on the acrylic base, cinematic composition, ultra-detailed textures, lifelike materials, and a sense of craftsmanship and artistry.`,

  `masterpiece, best quality, highly detailed 1/7 scale commercialized figurine of characters in a realistic style, placed on a cluttered computer desk, round transparent acrylic base with no text, Zbrush modeling process displayed on the computer screen, BANDAI-style toy packaging box next to the screen featuring vibrant two-dimensional flat illustrations of the original artwork, realistic environment with soft natural lighting, intricate details on the figurine and packaging, 8K resolution, photorealistic rendering, ultra-realistic textures, studio setup with focus on the figurine and packaging, professional workspace ambiance, cinematic composition, depth of field, sharp focus on the figurine and packaging, highly detailed desk accessories, realistic shadows and reflections, ultra-high definition, Unreal Engine quality`,

  `masterpiece, best quality, highly detailed 1/7 scale commercialized figurine of the characters, realistic style, placed on a cluttered computer desk, round transparent acrylic base with no text, Zbrush modeling process displayed on the computer screen, BANDAI-style toy packaging box next to the screen, featuring vibrant two-dimensional flat illustrations of the original artwork, natural lighting from a nearby window, soft shadows, ultra-realistic textures, 8K resolution, cinematic composition, focus on the figurine and its surroundings, professional studio setup, intricate details on the figurine and packaging, lifelike materials, clean and organized desk environment`,

  `masterpiece, best quality, highly detailed 1/7 scale commercialized figurine of the characters, ultra-realistic style, placed on a slightly cluttered computer desk with scattered art tools and reference sketches, round transparent acrylic base with no text, Zbrush modeling process displayed on the computer screen showing wireframe and sculpting stages, BANDAI-style toy packaging box next to the screen with vibrant two-dimensional flat illustrations of the original artwork and holographic foil accents, natural diffused lighting from a nearby window casting soft shadows, ultra-realistic textures showing fine details like fabric folds on the figurine's clothing and plastic sheen on the packaging, 8K resolution, cinematic shallow depth of field focusing on the figurine with background slightly blurred, professional studio setup with color-calibrated monitor and Wacom tablet, intricate details including tiny sculpted facial features and delicate accessories, lifelike materials with accurate subsurface scattering on skin and metallic reflections, clean but artistically organized desk environment with pencil holders and miniature paint bottles, warm ambient glow enhancing the collectible atmosphere`
]

function getRandomPrompt() {
  return PROMPTS[Math.floor(Math.random() * PROMPTS.length)]
}

// === Helper ===
function randomString(len = 12) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// Convert image buffer to base64
function bufferToBase64(buffer) {
  return buffer.toString('base64')
}

async function img2imgWithFreepik(imageBuffer, prompt) {
  try {
    // Convert image to base64
    const base64Image = bufferToBase64(imageBuffer)
    
    // Prepare the request payload
    const payload = {
      prompt: prompt,
      reference_images: [
        `data:image/jpeg;base64,${base64Image}`
      ]
    }

    console.log('Sending request to Freepik API...')
    
    // Make the API request to Freepik
    const response = await cloudscraper.post({
      url: FREEPIK_API_URL,
      headers: {
        'Content-Type': 'application/json',
        'x-freepik-api-key': FREEPIK_API_KEY
      },
      body: JSON.stringify(payload),
      simple: false,
      resolveWithFullResponse: true
    })

    console.log('Freepik API response status:', response.statusCode)
    console.log('Freepik API response body:', response.body)

    if (response.statusCode !== 200) {
      throw new Error(`Freepik API returned status ${response.statusCode}: ${response.body}`)
    }

    const responseData = JSON.parse(response.body)
    
    if (!responseData.data || !responseData.data.task_id) {
      throw new Error('Invalid response from Freepik API: ' + JSON.stringify(responseData))
    }

    const taskId = responseData.data.task_id
    let status = responseData.data.status
    let generatedImages = responseData.data.generated || []

    console.log(`Task ${taskId} created with status: ${status}`)

    // If the API doesn't provide a polling endpoint, we'll need to rely on webhooks
    // or implement a different approach. For now, let's assume the image is generated immediately
    // if status is COMPLETED, or wait a bit if it's IN_PROGRESS
    
    if (status === 'COMPLETED' && generatedImages.length > 0) {
      // Download the generated image
      const generatedImageUrl = generatedImages[0]
      console.log('Downloading generated image from:', generatedImageUrl)
      
      const imageResult = await cloudscraper.get({
        url: generatedImageUrl,
        encoding: null
      })

      return imageResult
    } else if (status === 'IN_PROGRESS' || status === 'CREATED') {
      // Simulate waiting for completion (this would need to be replaced with proper polling if available)
      console.log('Waiting for image generation to complete...')
      await new Promise(resolve => setTimeout(resolve, 10000))
      
      // For now, we'll throw an error as we don't have a proper polling mechanism
      throw new Error('Image generation is in progress. Please implement proper polling or use webhooks as per Freepik API documentation.')
    } else if (status === 'FAILED') {
      throw new Error('Image generation failed according to API response')
    } else {
      throw new Error(`Unknown status: ${status}`)
    }
  } catch (error) {
    console.error('Error in img2imgWithFreepik:', error)
    throw error
  }
}

async function uploadToQuaxDirect(buffer) {
  const boundary = '----WebKitFormBoundary' + randomString(16)
  const filename = `tofigure_${Date.now()}.png`

  const bodyStart =
    `--${boundary}\r\nContent-Disposition: form-data; name="files[]"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`
  const bodyEnd = `\r\n--${boundary}--\r\n`

  const fullBody = Buffer.concat([Buffer.from(bodyStart), buffer, Buffer.from(bodyEnd)])

  const res = await cloudscraper.post({
    uri: 'https://qu.ax/upload.php',
    body: fullBody,
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }
  })

  try {
    const json = JSON.parse(res.toString())
    return json.files?.[0]?.url || null
  } catch {
    const dom = new JSDOM(res.toString())
    const a = [...dom.window.document.querySelectorAll('a')].map(el => el.href)
    return a.find(href => href.includes('qu.ax/')) || null
  }
}

async function uploadToQuaxPuppeteer(buffer) {
  const fs = await import('fs')
  const temp = `/tmp/tofigure_${Date.now()}.png`
  fs.writeFileSync(temp, buffer)

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.goto('https://qu.ax', { waitUntil: 'networkidle2' })

  const input = await page.$('input[type="file"]')
  await input.uploadFile(temp)

  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('a')).some(a => a.href.includes('qu.ax/'))
  )

  const url = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a'))
      .map(a => a.href)
      .find(href => href.includes('qu.ax/'))
  )

  await browser.close()
  fs.unlinkSync(temp)
  return url
}

// === API Handler ===
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Only GET allowed' })

  const { url, promptIndex } = req.query
  if (!url) return res.status(400).json({ success: false, error: 'URL diperlukan' })

  try {
    console.log('Downloading image from:', url)
    const imgBuffer = await cloudscraper.get({ uri: url, encoding: null })

    // pilih prompt
    const prompt = (promptIndex && PROMPTS[promptIndex]) || getRandomPrompt()
    console.log('Using prompt:', prompt)

    // Use Freepik API instead of the old img2img function
    const hasil = await img2imgWithFreepik(imgBuffer, prompt)

    let downloadUrl = await uploadToQuaxDirect(hasil)
    if (!downloadUrl) downloadUrl = await uploadToQuaxPuppeteer(hasil)

    if (!downloadUrl) throw new Error('Upload gagal')

    return res.status(200).json({
      success: true,
      data: {
        name: `tofigure_${Date.now()}.png`,
        size: (hasil.length / 1024).toFixed(2) + ' KB',
        extension: 'png',
        downloadUrl,
        uploaded: new Date().toISOString(),
        details: {
          platform: 'Freepik Gemini 2.5 Flash API',
          hosting: 'qu.ax',
          expired: 'No Expiry',
          promptUsed: prompt
        }
      }
    })
  } catch (err) {
    console.error('Error in API handler:', err)
    return res.status(500).json({ success: false, error: err.message })
  }
}
