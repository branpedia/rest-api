import cloudscraper from 'cloudscraper'
import puppeteer from 'puppeteer'
import { JSDOM } from 'jsdom'

const BASE_URL = 'https://ai-apps.codergautam.dev'

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

async function autoregist() {
  const uid = randomString(24)
  const email = `gienetic${Date.now()}@nyahoo.com`

  const payload = JSON.stringify({
    uid,
    email,
    displayName: randomString(8),
    photoURL: 'https://i.pravatar.cc/150',
    appId: 'photogpt'
  })

  const res = await cloudscraper.post({
    uri: `${BASE_URL}/photogpt/create-user`,
    body: payload,
    headers: { 'content-type': 'application/json', 'accept': 'application/json' }
  })

  const json = JSON.parse(res)
  if (json.success) return uid
  throw new Error('Register gagal: ' + res)
}

async function img2img(imageBuffer, prompt) {
  const uid = await autoregist()
  const boundary = '----WebKitFormBoundary' + randomString(16)

  const bodyStart =
    `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="input.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`
  const bodyMiddle =
    `\r\n--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\n${prompt}\r\n--${boundary}\r\nContent-Disposition: form-data; name="userId"\r\n\r\n${uid}\r\n--${boundary}--\r\n`

  const body = Buffer.concat([
    Buffer.from(bodyStart),
    imageBuffer,
    Buffer.from(bodyMiddle)
  ])

  const res = await cloudscraper.post({
    uri: `${BASE_URL}/photogpt/generate-image`,
    body,
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }
  })

  const json = JSON.parse(res)
  if (!json.success) throw new Error(res)

  const { pollingUrl } = json
  let status = 'pending'
  let resultUrl = null

  while (status !== 'Ready') {
    const pollRes = await cloudscraper.get(pollingUrl, { headers: { accept: 'application/json' } })
    const data = JSON.parse(pollRes)
    status = data.status
    if (status === 'Ready') {
      resultUrl = data.result.url
      break
    }
    await new Promise(r => setTimeout(r, 3000))
  }

  if (!resultUrl) throw new Error('Gagal dapat hasil gambar')
  return await cloudscraper.get({ uri: resultUrl, encoding: null }) // return buffer
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
    const imgBuffer = await cloudscraper.get({ uri: url, encoding: null })

    // pilih prompt
    const prompt = (promptIndex && PROMPTS[promptIndex]) || getRandomPrompt()

    const hasil = await img2img(imgBuffer, prompt)

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
          platform: 'Photogpt API',
          hosting: 'qu.ax',
          expired: 'No Expiry',
          promptUsed: prompt
        }
      }
    })
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message })
  }
}
