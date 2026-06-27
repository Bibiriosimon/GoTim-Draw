import { AssetRecordType, createShapeId, TLAssetId, TLShapeId } from '@tldraw/tlschema'

type Editor = any

export type ProblemImageInfo = {
  id: string
  shapeId: string
  assetId: string
  name: string
  mimeType: string
  w: number
  h: number
  x: number
  y: number
  displayW: number
  displayH: number
  src: string
  createdAt: string
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function getImageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ w: image.naturalWidth || image.width, h: image.naturalHeight || image.height })
    image.onerror = () => reject(new Error('图片读取失败'))
    image.src = src
  })
}

export async function createProblemImage(editor: Editor, file: File): Promise<ProblemImageInfo> {
  const src = await fileToDataUrl(file)
  const intrinsic = await getImageSize(src)
  const maxW = 760
  const scale = intrinsic.w > maxW ? maxW / intrinsic.w : 1
  const displayW = Math.round(intrinsic.w * scale)
  const displayH = Math.round(intrinsic.h * scale)
  const x = 80
  const y = 92
  const assetId = AssetRecordType.createId(`problem-${Date.now()}`) as TLAssetId
  const shapeId = createShapeId(`problem-${Date.now()}`) as TLShapeId

  editor.createAssets([{
    id: assetId,
    typeName: 'asset',
    type: 'image',
    props: {
      w: intrinsic.w,
      h: intrinsic.h,
      name: file.name || 'problem-image',
      isAnimated: false,
      mimeType: file.type || 'image/png',
      src,
      fileSize: file.size || undefined,
    },
    meta: { role: 'problem-image' },
  }])

  editor.createShape({
    id: shapeId,
    type: 'image',
    x,
    y,
    props: {
      assetId,
      w: displayW,
      h: displayH,
      playing: true,
      url: '',
      crop: null,
      flipX: false,
      flipY: false,
      altText: '题目图片',
    },
    meta: { role: 'problem-image' },
  })

  editor.sendToBack([shapeId])
  editor.zoomToFit({ animation: { duration: 320 } })

  return {
    id: `problem_${Date.now()}`,
    shapeId,
    assetId,
    name: file.name || 'problem-image',
    mimeType: file.type || 'image/png',
    w: intrinsic.w,
    h: intrinsic.h,
    x,
    y,
    displayW,
    displayH,
    src,
    createdAt: new Date().toISOString(),
  }
}

export async function postProblemImage(info: ProblemImageInfo): Promise<void> {
  await fetch('/api/problem-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(info),
  })
}
