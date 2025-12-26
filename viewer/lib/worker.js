/* global postMessage self */

if (!global.self) {
  // If we are in a node environement, we need to fake some env variables
  /* eslint-disable no-eval */
  const r = eval('require') // yeah I know bad spooky eval, booouh
  const { parentPort } = r('worker_threads')
  global.self = parentPort
  global.postMessage = (value, transferList) => { parentPort.postMessage(value, transferList) }
  global.performance = r('perf_hooks').performance
}

const { Vec3 } = require('vec3')
const { World } = require('./world')
const { getSectionGeometry } = require('./models')

let blocksStates = null
let world = null

function sectionKey (x, y, z) {
  return `${x},${y},${z}`
}

const dirtySections = {}
// Track sections that need to be marked dirty once their chunk arrives
const pendingSections = {}

function setSectionDirty (pos, value = true) {
  const x = Math.floor(pos.x / 16) * 16
  const y = Math.floor(pos.y / 16) * 16
  const z = Math.floor(pos.z / 16) * 16
  const chunk = world ? world.getColumn(x, z) : null
  const key = sectionKey(x, y, z)
  const chunkKey = `${x},${z}`
  if (!value) {
    delete dirtySections[key]
    delete pendingSections[key]
    postMessage({ type: 'sectionFinished', key })
  } else if (chunk && chunk.sections[Math.floor(y / 16) - (chunk.minY !== undefined ? Math.floor(chunk.minY / 16) : 0)]) {
    dirtySections[key] = value
    delete pendingSections[key]
  } else {
    // Chunk not loaded yet - defer this section until chunk arrives
    pendingSections[key] = { x, y, z, chunkKey }
    // Don't send sectionFinished yet - we'll process it when chunk arrives
  }
}

// Process pending sections when a chunk is loaded
function processPendingSectionsForChunk (chunkX, chunkZ) {
  const chunkKey = `${chunkX},${chunkZ}`
  for (const [key, pending] of Object.entries(pendingSections)) {
    if (pending.chunkKey === chunkKey) {
      // Re-attempt to mark as dirty now that chunk is loaded
      const chunk = world.getColumn(pending.x, pending.z)
      if (chunk && chunk.sections[Math.floor(pending.y / 16) - (chunk.minY !== undefined ? Math.floor(chunk.minY / 16) : 0)]) {
        dirtySections[key] = true
      } else {
        postMessage({ type: 'sectionFinished', key })
      }
      delete pendingSections[key]
    }
  }
}

let msgSeq = 0
let firstChunkTime = 0
let firstDirtyTime = 0

self.onmessage = ({ data }) => {
  msgSeq++
  if (data.type === 'version') {
    world = new World(data.version)
  } else if (data.type === 'blockStates') {
    blocksStates = data.json
  } else if (data.type === 'dirty') {
    if (!firstDirtyTime) {
      firstDirtyTime = performance.now()
      const pendingCount = Object.keys(pendingSections).length
      const dirtyCount = Object.keys(dirtySections).length
      postMessage({ type: 'debug', msg: `First dirty at seq=${msgSeq}, firstChunk was at ${firstChunkTime ? (firstDirtyTime - firstChunkTime).toFixed(1) + 'ms ago' : 'NOT YET'}, pending=${pendingCount}, dirty=${dirtyCount}` })
    }
    const loc = new Vec3(data.x, data.y, data.z)
    setSectionDirty(loc, data.value)
  } else if (data.type === 'chunk') {
    if (!firstChunkTime) {
      firstChunkTime = performance.now()
      postMessage({ type: 'debug', msg: `First chunk at seq=${msgSeq}, firstDirty was at ${firstDirtyTime ? 'ALREADY (bad!)' : 'not yet (good)'}` })
    }
    // Force memory synchronization for Bun shared buffers
    // Reading a value can trigger a memory barrier
    const chunkStr = typeof data.chunk === 'string' ? data.chunk : JSON.stringify(data.chunk)
    const parsed = JSON.parse(chunkStr)
    world.addColumn(data.x, data.z, parsed)
    // Process any sections that were waiting for this chunk
    processPendingSectionsForChunk(data.x, data.z)
  } else if (data.type === 'unloadChunk') {
    world.removeColumn(data.x, data.z)
  } else if (data.type === 'blockUpdate') {
    const loc = new Vec3(data.pos.x, data.pos.y, data.pos.z).floored()
    world.setBlockStateId(loc, data.stateId)
  } else if (data.type === 'reset') {
    world = null
    blocksStates = null
  }
}

setInterval(() => {
  if (world === null || blocksStates === null) return
  const sections = Object.keys(dirtySections)

  if (sections.length === 0) return
  // console.log(sections.length + ' dirty sections')

  // const start = performance.now()
  for (const key of sections) {
    let [x, y, z] = key.split(',')
    x = parseInt(x, 10)
    y = parseInt(y, 10)
    z = parseInt(z, 10)
    const chunk = world.getColumn(x, z)
    if (chunk && chunk.sections[Math.floor(y / 16) - (chunk.minY !== undefined ? Math.floor(chunk.minY / 16) : 0)]) {
      delete dirtySections[key]
      const geometry = getSectionGeometry(x, y, z, world, blocksStates)

      // Build transfer list of all ArrayBuffers backing the typed arrays
      // This is zero-copy - buffers are moved, not cloned
      const transferList = []
      if (geometry.positions?.buffer) transferList.push(geometry.positions.buffer)
      if (geometry.normals?.buffer) transferList.push(geometry.normals.buffer)
      if (geometry.colors?.buffer) transferList.push(geometry.colors.buffer)
      if (geometry.uvs?.buffer) transferList.push(geometry.uvs.buffer)
      if (geometry.indices?.buffer) transferList.push(geometry.indices.buffer)

      postMessage({ type: 'geometry', key, geometry }, transferList)
    }
    postMessage({ type: 'sectionFinished', key })
  }
  // const time = performance.now() - start
  // console.log(`Processed ${sections.length} sections in ${time} ms (${time / sections.length} ms/section)`)
}, 50)
