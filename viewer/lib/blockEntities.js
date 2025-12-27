const THREE = require('three')
const TWEEN = require('@tweenjs/tween.js')
const { dispose3 } = require('./dispose')
const ChestModel = require('./blockEntity/ChestModel')

// Block types that are rendered as block entities
const CHEST_TYPES = ['chest', 'trapped_chest', 'ender_chest']

function isChestType (name) {
  return CHEST_TYPES.includes(name)
}

class BlockEntities {
  constructor (scene) {
    this.scene = scene
    this.blockEntities = {} // keyed by "x,y,z"
    this.version = null
  }

  setVersion (version) {
    this.version = version
    this.clear()
  }

  clear () {
    for (const mesh of Object.values(this.blockEntities)) {
      this.scene.remove(mesh)
      dispose3(mesh)
    }
    this.blockEntities = {}
  }

  getKey (pos) {
    return `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`
  }

  update (blockEntity) {
    const key = this.getKey(blockEntity.pos)

    // Handle removal
    if (blockEntity.delete) {
      const existing = this.blockEntities[key]
      if (existing) {
        this.scene.remove(existing)
        dispose3(existing)
        delete this.blockEntities[key]
      }
      return
    }

    // Skip if no version set
    if (!this.version) return

    // Handle open state change for existing chests
    const existing = this.blockEntities[key]
    if (existing && blockEntity.open !== undefined) {
      this.animateChestLid(existing, blockEntity.open)
      return
    }

    // Skip if already exists (block entities don't move)
    if (existing) return

    // Create mesh based on block entity type
    const mesh = this.createMesh(blockEntity)
    if (!mesh) return

    // Position at block center (geometry is centered at origin, so offset by 0.5 in X and Z)
    mesh.position.set(
      blockEntity.pos.x + 0.5,
      blockEntity.pos.y,
      blockEntity.pos.z + 0.5
    )

    this.blockEntities[key] = mesh
    this.scene.add(mesh)
  }

  animateChestLid (mesh, isOpen) {
    const lidPivot = mesh.userData.lidPivot
    if (!lidPivot) return

    // Target angle: 0 = closed, -PI/2 = fully open (negative to pivot backward)
    const targetAngle = isOpen ? -Math.PI / 2 : 0

    new TWEEN.Tween(lidPivot.rotation)
      .to({ x: targetAngle }, 300) // 300ms animation
      .easing(TWEEN.Easing.Quadratic.Out)
      .start()
  }

  createMesh (blockEntity) {
    const type = blockEntity.type

    if (isChestType(type)) {
      return ChestModel.createMesh(
        this.version,
        type,
        blockEntity.facing || 'north',
        blockEntity.chestType || 'single'
      )
    }

    // Unsupported block entity type
    return null
  }

  // Remove block entities in a chunk (for unload)
  removeChunk (chunkX, chunkZ) {
    const toRemove = []
    for (const key of Object.keys(this.blockEntities)) {
      const [x, y, z] = key.split(',').map(Number)
      if (Math.floor(x / 16) === chunkX && Math.floor(z / 16) === chunkZ) {
        toRemove.push(key)
      }
    }
    for (const key of toRemove) {
      const mesh = this.blockEntities[key]
      this.scene.remove(mesh)
      dispose3(mesh)
      delete this.blockEntities[key]
    }
  }
}

module.exports = { BlockEntities, isChestType, CHEST_TYPES }
