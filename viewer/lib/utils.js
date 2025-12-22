function safeRequire (path) {
  try {
    return require(path)
  } catch (e) {
    return {}
  }
}
// Lazy getter for loadImage - allows canvas-embedded to set the global before we use it
function getLoadImage() {
  if (globalThis.__canvasModule?.loadImage) return globalThis.__canvasModule.loadImage
  const mod = safeRequire('node-canvas-webgl/lib')
  if (mod.loadImage) return mod.loadImage
  // Last resort: try canvas directly
  const canvas = safeRequire('canvas')
  return canvas.loadImage
}
const THREE = require('three')
const path = require('path')

const textureCache = {}
// todo not ideal, export different functions for browser and node
function loadTexture (texture, cb) {
  if (process.platform === 'browser') {
    return require('./utils.web').loadTexture(texture, cb)
  }

  if (textureCache[texture]) {
    cb(textureCache[texture])
  } else {
    const loadImageFn = getLoadImage()
    if (!loadImageFn) {
      console.error('[loadTexture] ERROR: loadImage function not available!')
      return
    }
    const fullPath = path.resolve(globalThis.__prismarineViewerBase, texture)
    console.log('[loadTexture] Loading:', fullPath)
    loadImageFn(fullPath).then(image => {
      console.log('[loadTexture] Loaded successfully:', texture)
      textureCache[texture] = new THREE.CanvasTexture(image)
      cb(textureCache[texture])
    }).catch(err => {
      console.error('[loadTexture] ERROR loading', texture, ':', err.message)
    })
  }
}

function loadJSON (json, cb) {
  if (process.platform === 'browser') {
    return require('./utils.web').loadJSON(json, cb)
  }
  cb(require(path.resolve(globalThis.__prismarineViewerBase, json)))
}

module.exports = { loadTexture, loadJSON }
