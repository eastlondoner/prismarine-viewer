/* global Worker */
const THREE = require('three')
const Vec3 = require('vec3').Vec3
const { loadTexture, loadJSON } = globalThis.isElectron ? require('./utils.electron.js') : require('./utils')
const { EventEmitter } = require('events')
const { dispose3 } = require('./dispose')

function mod (x, n) {
  return ((x % n) + n) % n
}

class WorldRenderer {
  constructor (scene, numWorkers = 4) {
    this.sectionMeshs = {}
    this.active = false
    this.version = undefined
    this.scene = scene
    this.loadedChunks = {}
    this.sectionsOutstanding = new Set()
    this.renderUpdateEmitter = new EventEmitter()
    this.blockStatesData = undefined
    this.texturesDataUrl = undefined

    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, alphaTest: 0.1 })

    this.workers = []
    for (let i = 0; i < numWorkers; i++) {
      // Node environment needs an absolute path, but browser needs the url of the file
      // Note: __dirname would be baked in at compile time by Bun, so we use a runtime global
      let src
      if (typeof window !== 'undefined') {
        src = 'worker.js'
      } else {
        src = globalThis.__prismarineViewerBase + '/worker.js'
      }

      const worker = new Worker(src)
      worker.onmessage = ({ data }) => {
        if (data.type === 'geometry') {
          let mesh = this.sectionMeshs[data.key]
          if (mesh) {
            this.scene.remove(mesh)
            dispose3(mesh)
            delete this.sectionMeshs[data.key]
          }

          const chunkCoords = data.key.split(',')
          if (!this.loadedChunks[chunkCoords[0] + ',' + chunkCoords[2]]) return

          const geometry = new THREE.BufferGeometry()
          geometry.setAttribute('position', new THREE.BufferAttribute(data.geometry.positions, 3))
          geometry.setAttribute('normal', new THREE.BufferAttribute(data.geometry.normals, 3))
          geometry.setAttribute('color', new THREE.BufferAttribute(data.geometry.colors, 3))
          geometry.setAttribute('uv', new THREE.BufferAttribute(data.geometry.uvs, 2))
          if (data.geometry.indices) {
            geometry.setIndex(data.geometry.indices)
          }

          mesh = new THREE.Mesh(geometry, this.material)
          mesh.position.set(data.geometry.sx, data.geometry.sy, data.geometry.sz)
          this.sectionMeshs[data.key] = mesh
          this.scene.add(mesh)
        } else if (data.type === 'sectionFinished') {
          this.sectionsOutstanding.delete(data.key)
          this.renderUpdateEmitter.emit('update')
        }
      }
      if (worker.on) worker.on('message', (data) => { worker.onmessage({ data }) })
      this.workers.push(worker)
    }
  }

  // --- Bun/worker safety helpers ---
  // mineflayer/prismarine-chunk column.toJson() includes Buffers/TypedArrays.
  // On Bun, structured-clone of Buffer-like views can end up aliasing pooled backing stores,
  // which manifests as "repeated/tiled textures" or corrupted chunk meshes over time.
  // We defensively deep-copy Buffer/TypedArray payloads before posting to workers.
  static __pvToOwnedUint8 (view) {
    // Buffer is a Uint8Array subclass.
    if (!view || !view.buffer) return view
    // Copy only the exact bytes represented by this view.
    const u8 = new Uint8Array(view.buffer, view.byteOffset || 0, view.byteLength || view.length || 0)
    const out = new Uint8Array(u8.length)
    out.set(u8)
    return out
  }

  static __pvSanitizeForWorker (value, stats) {
    // Primitives
    if (value === null || value === undefined) return value
    const t = typeof value
    if (t === 'string' || t === 'number' || t === 'boolean') return value

    // ArrayBuffer
    if (value instanceof ArrayBuffer) {
      stats.arrayBuffers++
      return value.slice(0)
    }

    // TypedArray / Buffer / DataView
    // eslint-disable-next-line no-undef
    const isView = (typeof ArrayBuffer !== 'undefined') && (ArrayBuffer.isView && ArrayBuffer.isView(value))
    if (isView) {
      // If it's a view, copy bytes and return a plain Uint8Array (safe across runtimes).
      stats.views++
      return WorldRenderer.__pvToOwnedUint8(value)
    }

    // Array
    if (Array.isArray(value)) {
      const out = new Array(value.length)
      for (let i = 0; i < value.length; i++) out[i] = WorldRenderer.__pvSanitizeForWorker(value[i], stats)
      return out
    }

    // Plain object
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = WorldRenderer.__pvSanitizeForWorker(v, stats)
    return out
  }

  resetWorld () {
    this.active = false
    for (const mesh of Object.values(this.sectionMeshs)) {
      this.scene.remove(mesh)
    }
    this.sectionMeshs = {}
    for (const worker of this.workers) {
      worker.postMessage({ type: 'reset' })
    }
  }

  setVersion (version) {
    this.version = version
    this.resetWorld()
    this.active = true
    for (const worker of this.workers) {
      worker.postMessage({ type: 'version', version })
    }

    this.updateTexturesData()
  }

  updateTexturesData () {
    loadTexture(this.texturesDataUrl || `textures/${this.version}.png`, texture => {
      texture.magFilter = THREE.NearestFilter
      texture.minFilter = THREE.NearestFilter
      texture.flipY = false
      this.material.map = texture
    })

    const loadBlockStates = () => {
      return new Promise(resolve => {
        if (this.blockStatesData) return resolve(this.blockStatesData)
        return loadJSON(`blocksStates/${this.version}.json`, resolve)
      })
    }
    loadBlockStates().then((blockStates) => {
      for (const worker of this.workers) {
        worker.postMessage({ type: 'blockStates', json: blockStates })
      }
    })
  }

  addColumn (x, z, chunk) {
    this.loadedChunks[`${x},${z}`] = true
    // Sanitize the chunk payload once, then broadcast to workers.
    // This is intentionally conservative for correctness; it may cost CPU.
    let payload = chunk
    if (!this.__pvChunkSanitizeLogged) {
      this.__pvChunkSanitizeLogged = true
      console.error('[PV_WORLDRENDERER] Bun safety: sanitizing chunk payloads before worker.postMessage')
    }
    const stats = { views: 0, arrayBuffers: 0 }
    try {
      payload = WorldRenderer.__pvSanitizeForWorker(chunk, stats)
    } catch (e) {
      console.error('[PV_WORLDRENDERER] chunk sanitize failed, sending raw chunk:', e)
      payload = chunk
    }
    if (!this.__pvChunkSanitizeStatsLogged) {
      this.__pvChunkSanitizeStatsLogged = true
      console.error(`[PV_WORLDRENDERER] chunk sanitize stats: views=${stats.views} arrayBuffers=${stats.arrayBuffers}`)
    }
    for (const worker of this.workers) {
      worker.postMessage({ type: 'chunk', x, z, chunk: payload })
    }
    for (let y = -64; y < 320; y += 16) {
      const loc = new Vec3(x, y, z)
      this.setSectionDirty(loc)
      this.setSectionDirty(loc.offset(-16, 0, 0))
      this.setSectionDirty(loc.offset(16, 0, 0))
      this.setSectionDirty(loc.offset(0, 0, -16))
      this.setSectionDirty(loc.offset(0, 0, 16))
    }
  }

  removeColumn (x, z) {
    delete this.loadedChunks[`${x},${z}`]
    for (const worker of this.workers) {
      worker.postMessage({ type: 'unloadChunk', x, z })
    }
    for (let y = -64; y < 320; y += 16) {
      this.setSectionDirty(new Vec3(x, y, z), false)
      const key = `${x},${y},${z}`
      const mesh = this.sectionMeshs[key]
      if (mesh) {
        this.scene.remove(mesh)
        dispose3(mesh)
      }
      delete this.sectionMeshs[key]
    }
  }

  setBlockStateId (pos, stateId) {
    for (const worker of this.workers) {
      worker.postMessage({ type: 'blockUpdate', pos, stateId })
    }
    this.setSectionDirty(pos)
    if ((pos.x & 15) === 0) this.setSectionDirty(pos.offset(-16, 0, 0))
    if ((pos.x & 15) === 15) this.setSectionDirty(pos.offset(16, 0, 0))
    if ((pos.y & 15) === 0) this.setSectionDirty(pos.offset(0, -16, 0))
    if ((pos.y & 15) === 15) this.setSectionDirty(pos.offset(0, 16, 0))
    if ((pos.z & 15) === 0) this.setSectionDirty(pos.offset(0, 0, -16))
    if ((pos.z & 15) === 15) this.setSectionDirty(pos.offset(0, 0, 16))
  }

  setSectionDirty (pos, value = true) {
    // Dispatch sections to workers based on position
    // This guarantees uniformity accross workers and that a given section
    // is always dispatched to the same worker
    const hash = mod(Math.floor(pos.x / 16) + Math.floor(pos.y / 16) + Math.floor(pos.z / 16), this.workers.length)
    this.workers[hash].postMessage({ type: 'dirty', x: pos.x, y: pos.y, z: pos.z, value })
    this.sectionsOutstanding.add(`${Math.floor(pos.x / 16) * 16},${Math.floor(pos.y / 16) * 16},${Math.floor(pos.z / 16) * 16}`)
  }

  // Listen for chunk rendering updates emitted if a worker finished a render and resolve if the number
  // of sections not rendered are 0
  waitForChunksToRender () {
    return new Promise((resolve, reject) => {
      if (Array.from(this.sectionsOutstanding).length === 0) {
        resolve()
        return
      }

      const updateHandler = () => {
        if (this.sectionsOutstanding.size === 0) {
          this.renderUpdateEmitter.removeListener('update', updateHandler)
          resolve()
        }
      }
      this.renderUpdateEmitter.on('update', updateHandler)
    })
  }
}

module.exports = { WorldRenderer }
