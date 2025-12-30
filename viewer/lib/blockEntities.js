const THREE = require('three')
const TWEEN = require('@tweenjs/tween.js')
const { dispose3 } = require('./dispose')
const ChestModel = require('./blockEntity/ChestModel')
const ShulkerBoxModel = require('./blockEntity/ShulkerBoxModel')
const BedModel = require('./blockEntity/BedModel')
const SignModel = require('./blockEntity/SignModel')
const BannerModel = require('./blockEntity/BannerModel')
const BellModel = require('./blockEntity/BellModel')
const SkullModel = require('./blockEntity/SkullModel')
const CampfireModel = require('./blockEntity/CampfireModel')

// Block types that are rendered as block entities
const CHEST_TYPES = ['chest', 'trapped_chest', 'ender_chest']

const SHULKER_TYPES = [
  'shulker_box',
  'white_shulker_box', 'orange_shulker_box', 'magenta_shulker_box', 'light_blue_shulker_box',
  'yellow_shulker_box', 'lime_shulker_box', 'pink_shulker_box', 'gray_shulker_box',
  'light_gray_shulker_box', 'cyan_shulker_box', 'purple_shulker_box', 'blue_shulker_box',
  'brown_shulker_box', 'green_shulker_box', 'red_shulker_box', 'black_shulker_box'
]

const BED_TYPES = [
  'white_bed', 'orange_bed', 'magenta_bed', 'light_blue_bed',
  'yellow_bed', 'lime_bed', 'pink_bed', 'gray_bed',
  'light_gray_bed', 'cyan_bed', 'purple_bed', 'blue_bed',
  'brown_bed', 'green_bed', 'red_bed', 'black_bed'
]

// Generate all sign type names (12 woods x 4 variants = 48)
const WOOD_TYPES = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'crimson', 'warped', 'mangrove', 'cherry', 'bamboo', 'pale_oak']
const SIGN_TYPES = []
for (const wood of WOOD_TYPES) {
  SIGN_TYPES.push(`${wood}_sign`, `${wood}_wall_sign`, `${wood}_hanging_sign`, `${wood}_wall_hanging_sign`)
}

// Generate all banner type names (16 colors x 2 variants = 32)
const BANNER_COLORS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black']
const BANNER_TYPES = []
for (const color of BANNER_COLORS) {
  BANNER_TYPES.push(`${color}_banner`, `${color}_wall_banner`)
}

function isChestType (name) {
  return CHEST_TYPES.includes(name)
}

function isShulkerType (name) {
  return SHULKER_TYPES.includes(name)
}

function isBedType (name) {
  return BED_TYPES.includes(name)
}

function isSignType (name) {
  return SIGN_TYPES.includes(name)
}

function isBannerType (name) {
  return BANNER_TYPES.includes(name)
}

function isBellType (name) {
  return name === 'bell'
}

const SKULL_TYPES = [
  'skeleton_skull', 'skeleton_wall_skull',
  'wither_skeleton_skull', 'wither_skeleton_wall_skull',
  'zombie_head', 'zombie_wall_head',
  'creeper_head', 'creeper_wall_head',
  'player_head', 'player_wall_head',
  'piglin_head', 'piglin_wall_head',
  'dragon_head', 'dragon_wall_head'
]

function isSkullType (name) {
  return SKULL_TYPES.includes(name)
}

const CAMPFIRE_TYPES = ['campfire', 'soul_campfire']

function isCampfireType (name) {
  return CAMPFIRE_TYPES.includes(name)
}

function isBlockEntityType (name) {
  return isChestType(name) || isShulkerType(name) || isBedType(name) || isSignType(name) || isBannerType(name) || isBellType(name) || isSkullType(name) || isCampfireType(name)
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

    if (isShulkerType(type)) {
      return ShulkerBoxModel.createMesh(
        this.version,
        type,
        blockEntity.facing || 'up'
      )
    }

    if (isBedType(type)) {
      return BedModel.createMesh(
        this.version,
        type,
        blockEntity.facing || 'north',
        blockEntity.part || 'foot'
      )
    }

    if (isSignType(type)) {
      return SignModel.createMesh(
        this.version,
        type,
        blockEntity.facing || 'north',
        blockEntity.rotation || 0
      )
    }

    if (isBannerType(type)) {
      return BannerModel.createMesh(
        this.version,
        type,
        blockEntity.facing || 'north',
        blockEntity.rotation || 0
      )
    }

    if (isBellType(type)) {
      return BellModel.createMesh(
        this.version,
        type,
        blockEntity.facing || 'north',
        blockEntity.attachment || 'floor'
      )
    }

    if (isSkullType(type)) {
      return SkullModel.createMesh(
        this.version,
        type,
        blockEntity.facing || 'north',
        blockEntity.rotation || 0
      )
    }

    if (isCampfireType(type)) {
      return CampfireModel.createMesh(
        this.version,
        type,
        blockEntity.facing || 'north',
        blockEntity.lit !== false  // default to lit
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

module.exports = { BlockEntities, isChestType, CHEST_TYPES, isShulkerType, SHULKER_TYPES, isBedType, BED_TYPES, isSignType, SIGN_TYPES, isBannerType, BANNER_TYPES, isBellType, isSkullType, SKULL_TYPES, isCampfireType, CAMPFIRE_TYPES, isBlockEntityType }
