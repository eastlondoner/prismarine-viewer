const { spiral, ViewRect, chunkPos } = require('./simpleUtils')
const { Vec3 } = require('vec3')
const EventEmitter = require('events')
const { isChestType, CHEST_TYPES } = require('./blockEntities')

class WorldView extends EventEmitter {
  constructor (world, viewDistance, position = new Vec3(0, 0, 0), emitter = null) {
    super()
    this.world = world
    this.viewDistance = viewDistance
    this.loadedChunks = {}
    this.lastPos = new Vec3(0, 0, 0).update(position)
    this.emitter = emitter || this

    this.listeners = {}
    this.emitter.on('mouseClick', async (click) => {
      const ori = new Vec3(click.origin.x, click.origin.y, click.origin.z)
      const dir = new Vec3(click.direction.x, click.direction.y, click.direction.z)
      const block = this.world.raycast(ori, dir, 256)
      if (!block) return
      this.emit('blockClicked', block, block.face, click.button)
    })
  }

  listenToBot (bot) {
    const worldView = this
    this.listeners[bot.username] = {
      // 'move': botPosition,
      entitySpawn: function (e) {
        if (e === bot.entity) return
        worldView.emitter.emit('entity', { id: e.id, name: e.name, pos: e.position, width: e.width, height: e.height, username: e.username })
      },
      entityMoved: function (e) {
        worldView.emitter.emit('entity', { id: e.id, pos: e.position, pitch: e.pitch, yaw: e.yaw })
      },
      entityGone: function (e) {
        worldView.emitter.emit('entity', { id: e.id, delete: true })
      },
      chunkColumnLoad: function (pos) {
        worldView.loadChunk(pos)
      },
      blockUpdate: function (oldBlock, newBlock) {
        const stateId = newBlock.stateId ? newBlock.stateId : ((newBlock.type << 4) | newBlock.metadata)
        worldView.emitter.emit('blockUpdate', { pos: oldBlock.position, stateId })

        // Handle block entity add/remove
        const oldIsChest = isChestType(oldBlock.name)
        const newIsChest = isChestType(newBlock.name)

        // If old block was a chest, emit delete
        if (oldIsChest && !newIsChest) {
          worldView.emitter.emit('blockEntity', {
            pos: { x: oldBlock.position.x, y: oldBlock.position.y, z: oldBlock.position.z },
            delete: true
          })
        }

        // If new block is a chest, emit add
        if (newIsChest) {
          const props = newBlock.getProperties ? newBlock.getProperties() : {}
          worldView.emitter.emit('blockEntity', {
            pos: { x: newBlock.position.x, y: newBlock.position.y, z: newBlock.position.z },
            type: newBlock.name,
            facing: props.facing || 'north',
            chestType: props.type || 'single'
          })
        }
      },
      chestLidMove: function (block, playerCount, block2) {
        // playerCount > 0 means chest is open, 0 means closed
        const isOpen = playerCount > 0
        const props = block.getProperties ? block.getProperties() : {}
        worldView.emitter.emit('blockEntity', {
          pos: { x: block.position.x, y: block.position.y, z: block.position.z },
          type: block.name,
          facing: props.facing || 'north',
          chestType: props.type || 'single',
          open: isOpen
        })
        // Handle double chest second block
        if (block2) {
          const props2 = block2.getProperties ? block2.getProperties() : {}
          worldView.emitter.emit('blockEntity', {
            pos: { x: block2.position.x, y: block2.position.y, z: block2.position.z },
            type: block2.name,
            facing: props2.facing || 'north',
            chestType: props2.type || 'single',
            open: isOpen
          })
        }
      }
    }

    for (const [evt, listener] of Object.entries(this.listeners[bot.username])) {
      bot.on(evt, listener)
    }

    for (const id in bot.entities) {
      const e = bot.entities[id]
      if (e && e !== bot.entity) {
        this.emitter.emit('entity', { id: e.id, name: e.name, pos: e.position, width: e.width, height: e.height, username: e.username })
      }
    }
  }

  removeListenersFromBot (bot) {
    for (const [evt, listener] of Object.entries(this.listeners[bot.username])) {
      bot.removeListener(evt, listener)
    }
    delete this.listeners[bot.username]
  }

  async init (pos) {
    const [botX, botZ] = chunkPos(pos)
    console.error(`[WorldView.init] pos=(${pos.x?.toFixed(1)}, ${pos.y?.toFixed(1)}, ${pos.z?.toFixed(1)}) chunkPos=(${botX}, ${botZ})`)

    const positions = []
    spiral(this.viewDistance * 2, this.viewDistance * 2, (x, z) => {
      const p = new Vec3((botX + x) * 16, 0, (botZ + z) * 16)
      positions.push(p)
    })
    console.error(`[WorldView.init] First chunk position: (${positions[0]?.x}, ${positions[0]?.z})`)

    this.lastPos.update(pos)
    await this._loadChunks(positions)
  }

  async _loadChunks (positions, sliceSize = 5, waitTime = 0) {
    for (let i = 0; i < positions.length; i += sliceSize) {
      await new Promise((resolve) => setTimeout(resolve, waitTime))
      await Promise.all(positions.slice(i, i + sliceSize).map(p => this.loadChunk(p)))
    }
  }

  async loadChunk (pos) {
    const [botX, botZ] = chunkPos(this.lastPos)
    const dx = Math.abs(botX - Math.floor(pos.x / 16))
    const dz = Math.abs(botZ - Math.floor(pos.z / 16))
    if (dx < this.viewDistance && dz < this.viewDistance) {
      const column = await this.world.getColumnAt(pos)
      if (column) {
        const chunk = column.toJson()
        this.emitter.emit('loadChunk', { x: pos.x, z: pos.z, chunk })
        this.loadedChunks[`${pos.x},${pos.z}`] = true

        // Emit block entities from this chunk
        this.emitBlockEntities(pos.x, pos.z, column)
      }
    }
  }

  emitBlockEntities (chunkX, chunkZ, column) {
    // column.blockEntities is a dict keyed by "x,y,z" (relative positions within chunk)
    if (!column.blockEntities) return

    const entityCount = Object.keys(column.blockEntities).length
    if (entityCount > 0) {
      console.log(`[BlockEntity] Chunk (${chunkX}, ${chunkZ}) has ${entityCount} block entities`)
    }

    for (const [key, nbt] of Object.entries(column.blockEntities)) {
      const [relX, y, relZ] = key.split(',').map(Number)
      const worldX = chunkX + relX
      const worldZ = chunkZ + relZ
      const worldPos = new Vec3(worldX, y, worldZ)

      // Get block at this position to determine type and properties
      const block = this.world.getBlock(worldPos)
      const blockName = block?.name || 'null'
      const isChest = block ? isChestType(block.name) : false

      if (isChest) {
        console.log(`[BlockEntity] CHEST found at (${worldX}, ${y}, ${worldZ}): ${blockName}`)
        const props = block.getProperties ? block.getProperties() : {}
        this.emitter.emit('blockEntity', {
          pos: { x: worldX, y, z: worldZ },
          type: block.name,
          facing: props.facing || 'north',
          chestType: props.type || 'single'
        })
      }
    }
  }

  unloadChunk (pos) {
    this.emitter.emit('unloadChunk', { x: pos.x, z: pos.z })
    delete this.loadedChunks[`${pos.x},${pos.z}`]
  }

  async updatePosition (pos, force = false) {
    const [lastX, lastZ] = chunkPos(this.lastPos)
    const [botX, botZ] = chunkPos(pos)
    if (lastX !== botX || lastZ !== botZ || force) {
      const newView = new ViewRect(botX, botZ, this.viewDistance)
      for (const coords of Object.keys(this.loadedChunks)) {
        const x = parseInt(coords.split(',')[0])
        const z = parseInt(coords.split(',')[1])
        const p = new Vec3(x, 0, z)
        if (!newView.contains(Math.floor(x / 16), Math.floor(z / 16))) {
          this.unloadChunk(p)
        }
      }
      const positions = []
      spiral(this.viewDistance * 2, this.viewDistance * 2, (x, z) => {
        const p = new Vec3((botX + x) * 16, 0, (botZ + z) * 16)
        if (!this.loadedChunks[`${p.x},${p.z}`]) {
          positions.push(p)
        }
      })
      this.lastPos.update(pos)
      await this._loadChunks(positions)
    } else {
      this.lastPos.update(pos)
    }
  }
}

module.exports = { WorldView }
