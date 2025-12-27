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
      // Node/Bun: load worker source directly (Bun transpiles on-the-fly)
      // Browser: load from relative URL
      let src
      if (typeof window !== 'undefined') {
        src = 'worker.js'
      } else {
        // Use source file directly - Bun handles transpilation
        src = globalThis.__prismarineViewerWorkerPath || (globalThis.__prismarineViewerBase + '/worker.js')
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
        } else if (data.type === 'debug') {
          console.error(`[WORKER ${i}] ${data.msg}`)
        }
      }
      if (worker.on) worker.on('message', (data) => { worker.onmessage({ data }) })
      this.workers.push(worker)
    }
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
    for (let i = 0; i < this.workers.length; i++) {
      this.workers[i].postMessage({ type: 'version', version, workerIndex: i, numWorkers: this.workers.length })
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

    // High-performance Bun-native chunk transfer:
    // - If chunk is a ChunkColumn object, extract buffer + metadata for zero-copy transfer
    // - If chunk is already a JSON string (from toJson()), pass it directly
    // - This preserves minY and other critical metadata while enabling efficient buffer transfer

    let payload
    let transferables = []

    if (typeof chunk === 'string') {
      // Already serialized (from worldView.loadChunk -> column.toJson())
      // Pass directly - Bun handles strings efficiently
      payload = { type: 'json', data: chunk }
    } else if (chunk && typeof chunk.dump === 'function') {
      // ChunkColumn object - extract raw buffer + metadata for zero-copy transfer
      const buffer = chunk.dump()
      // Ensure we have an owned copy of the buffer (avoid Bun aliasing issues)
      const ownedBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)

      payload = {
        type: 'buffer',
        buffer: ownedBuffer,
        metadata: {
          minY: chunk.minY,
          worldHeight: chunk.worldHeight,
          // Light data needs separate handling if present
          skyLightMask: chunk.skyLightMask?.toLongArray?.() ?? null,
          blockLightMask: chunk.blockLightMask?.toLongArray?.() ?? null,
          emptySkyLightMask: chunk.emptySkyLightMask?.toLongArray?.() ?? null,
          emptyBlockLightMask: chunk.emptyBlockLightMask?.toLongArray?.() ?? null,
          blockEntities: chunk.blockEntities ?? {}
        }
      }
      // Transfer the buffer zero-copy
      transferables = [ownedBuffer]
    } else if (chunk && typeof chunk === 'object') {
      // Plain object (possibly already parsed JSON) - re-serialize to ensure correct format
      payload = { type: 'json', data: JSON.stringify(chunk) }
    } else {
      console.error('[PV_WORLDRENDERER] Unknown chunk format:', typeof chunk)
      return
    }

    for (const worker of this.workers) {
      // Use structured clone with transferables for zero-copy buffer transfer
      if (transferables.length > 0) {
        // Clone payload for each worker since buffer can only be transferred once
        const workerPayload = {
          type: 'chunk',
          x,
          z,
          chunk: {
            ...payload,
            buffer: payload.buffer ? payload.buffer.slice(0) : undefined
          }
        }
        worker.postMessage(workerPayload)
      } else {
        worker.postMessage({ type: 'chunk', x, z, chunk: payload })
      }
    }

    // Small delay to ensure workers process chunk data before dirty messages
    // This helps avoid race condition where geometry is generated before chunk is loaded
    setTimeout(() => {
      for (let y = -64; y < 320; y += 16) {
        const loc = new Vec3(x, y, z)
        this.setSectionDirty(loc)
        this.setSectionDirty(loc.offset(-16, 0, 0))
        this.setSectionDirty(loc.offset(16, 0, 0))
        this.setSectionDirty(loc.offset(0, 0, -16))
        this.setSectionDirty(loc.offset(0, 0, 16))
      }
    }, 50)
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
