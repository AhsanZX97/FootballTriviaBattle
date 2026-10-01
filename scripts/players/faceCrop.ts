/**
 * Picks a head-and-shoulders square crop around the biggest face in a photo,
 * using the UltraFace RFB-640 ONNX detector (downloaded once to .cache/models).
 */
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as ort from 'onnxruntime-node'
import sharp from 'sharp'

const HERE = dirname(fileURLToPath(import.meta.url))
const MODEL_DIR = join(HERE, '.cache', 'models')
const MODEL_PATH = join(MODEL_DIR, 'ultraface-640.onnx')
const MODEL_URL =
  'https://github.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB/raw/master/models/onnx/version-RFB-640.onnx'

const INPUT_W = 640
const INPUT_H = 480
const MIN_SCORE = 0.8

export interface Crop {
  x: number
  y: number
  size: number
}

let session: Promise<ort.InferenceSession> | null = null

async function loadSession() {
  if (!existsSync(MODEL_PATH)) {
    await mkdir(MODEL_DIR, { recursive: true })
    const res = await fetch(MODEL_URL)
    if (!res.ok) throw new Error(`${res.status} downloading face model`)
    await writeFile(MODEL_PATH, Buffer.from(await res.arrayBuffer()))
  }
  return ort.InferenceSession.create(MODEL_PATH, { logSeverityLevel: 3 })
}

async function detectFaces(imagePath: string) {
  session ??= loadSession()
  const net = await session
  const { data } = await sharp(imagePath)
    .resize(INPUT_W, INPUT_H, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const plane = INPUT_W * INPUT_H
  const input = new Float32Array(3 * plane)
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) input[c * plane + i] = (data[i * 3 + c] - 127) / 128
  }
  const out = await net.run({ [net.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, INPUT_H, INPUT_W]) })
  const scores = out.scores.data as Float32Array
  const boxes = out.boxes.data as Float32Array

  const faces: { score: number; x1: number; y1: number; x2: number; y2: number }[] = []
  for (let i = 0; i < scores.length / 2; i++) {
    const score = scores[i * 2 + 1]
    if (score < MIN_SCORE) continue
    faces.push({
      score,
      x1: boxes[i * 4],
      y1: boxes[i * 4 + 1],
      x2: boxes[i * 4 + 2],
      y2: boxes[i * 4 + 3],
    })
  }
  return faces
}

/** Crop fractions (see stylise.ts) framing the largest face, or null if none. */
export async function faceCrop(imagePath: string): Promise<Crop | null> {
  const faces = await detectFaces(imagePath)
  if (!faces.length) return null

  const area = (f: (typeof faces)[number]) => (f.x2 - f.x1) * (f.y2 - f.y1)
  const face = faces.reduce((best, f) => (area(f) * f.score > area(best) * best.score ? f : best))

  const { width = 0, height = 0 } = await sharp(imagePath).metadata()
  const faceW = (face.x2 - face.x1) * width
  const faceH = (face.y2 - face.y1) * height
  const cx = ((face.x1 + face.x2) / 2) * width
  const cy = ((face.y1 + face.y2) / 2) * height

  const side = Math.min(Math.max(faceW, faceH) * 2.6, width, height)
  const left = Math.max(0, Math.min(cx - side / 2, width - side))
  const top = Math.max(0, Math.min(cy - side * 0.45, height - side))
  return { x: left / width, y: top / height, size: side / width }
}
