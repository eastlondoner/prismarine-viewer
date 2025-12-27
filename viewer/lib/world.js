const Chunks = require('prismarine-chunk')
const mcData = require('minecraft-data')

function columnKey (x, z) {
  return `${x},${z}`
}

function posInChunk (pos) {
  pos = pos.floored()
  pos.x &= 15
  pos.z &= 15
  return pos
}

function isCube (shapes) {
  if (!shapes || shapes.length !== 1) return false
  const shape = shapes[0]
  return shape[0] === 0 && shape[1] === 0 && shape[2] === 0 && shape[3] === 1 && shape[4] === 1 && shape[5] === 1
}

class World {
  constructor (version) {
    this.Chunk = Chunks(version)
    this.columns = {}
    this.blockCache = {}
    this.biomeCache = mcData(version).biomes
    this.version = version
  }

  addColumn (x, z, payload) {
    let chunk

    // Handle different payload formats for high-performance Bun-native transfer
    if (typeof payload === 'string') {
      // Legacy: direct JSON string
      chunk = this.Chunk.fromJson(payload)
    } else if (payload && payload.type === 'json') {
      // New format: wrapped JSON string
      chunk = this.Chunk.fromJson(payload.data)
    } else if (payload && payload.type === 'buffer') {
      // High-performance: raw buffer + metadata (zero-copy transfer)
      chunk = this.addColumnFromBuffer(x, z, payload.buffer, payload.metadata)
    } else {
      // Fallback: try to parse as object
      console.error('[World] Unknown payload format, attempting JSON stringify:', typeof payload)
      chunk = this.Chunk.fromJson(JSON.stringify(payload))
    }

    this.columns[columnKey(x, z)] = chunk
    return chunk
  }

  // High-performance chunk loading from raw buffer + metadata
  // This enables zero-copy transfer of chunk data in Bun
  addColumnFromBuffer (x, z, buffer, metadata) {
    // Get minY from metadata - this varies by dimension:
    // - Overworld: -64 (1.18+)
    // - Nether: 0
    // - End: 0
    // - Custom dimensions: can be anything
    const minY = metadata.minY ?? 0
    const worldHeight = metadata.worldHeight ?? 384

    const chunk = new this.Chunk({
      minY,
      worldHeight
    })

    // Load block/biome data from buffer
    chunk.load(Buffer.from(buffer))

    // Copy block entities
    if (metadata.blockEntities) {
      chunk.blockEntities = metadata.blockEntities
    }

    return chunk
  }

  removeColumn (x, z) {
    delete this.columns[columnKey(x, z)]
  }

  getColumn (x, z) {
    return this.columns[columnKey(x, z)]
  }

  setBlockStateId (pos, stateId) {
    const key = columnKey(Math.floor(pos.x / 16) * 16, Math.floor(pos.z / 16) * 16)

    const column = this.columns[key]
    // null column means chunk not loaded
    if (!column) return false

    column.setBlockStateId(posInChunk(pos.floored()), stateId)

    return true
  }

  getBlock (pos) {
    const key = columnKey(Math.floor(pos.x / 16) * 16, Math.floor(pos.z / 16) * 16)

    const column = this.columns[key]
    // null column means chunk not loaded
    if (!column) return null

    const loc = pos.floored()
    const locInChunk = posInChunk(loc)
    const stateId = column.getBlockStateId(locInChunk)

    if (!this.blockCache[stateId]) {
      const b = column.getBlock(locInChunk)
      b.isCube = isCube(b.shapes)
      this.blockCache[stateId] = b
    }

    const block = this.blockCache[stateId]
    block.position = loc
    block.biome = this.biomeCache[column.getBiome(locInChunk)]
    if (block.biome === undefined) {
      block.biome = this.biomeCache[1]
    }
    return block
  }
}

module.exports = { World }
