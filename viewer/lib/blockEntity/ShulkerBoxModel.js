const THREE = require('three')
const { loadTexture } = globalThis.isElectron
  ? require('../utils.electron.js')
  : require('../utils')
const { createBoxGeometry, FACING_ROTATION_6 } = require('./geometry')

// Shulker box texture is 64x64
const TEX_WIDTH = 64
const TEX_HEIGHT = 64

// Shulker box colors
const SHULKER_COLORS = [
  'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime',
  'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue',
  'brown', 'green', 'red', 'black'
]

// Shulker box texture layout (64x64):
// The shulker entity texture is laid out for a 16x12x16 mob, but we adapt it
// For a shulker BOX, we use a 16x16x16 block split into:
// - Base (bottom): 16x8x16
// - Lid (top): 16x8x16
//
// The texture layout has:
// Lid section (rows 0-27):
//   Top face: (16, 0) 16x16
//   Bottom face: (32, 0) 16x16 (inner)
//   Front/Back/Left/Right: starting at y=16, each 16x12
//
// Base section (rows 28-63):
//   Top face: (16, 28) 16x16 (inner)
//   Bottom face: (32, 28) 16x16
//   Front/Back/Left/Right: starting at y=44, each 16x12

function createShulkerBoxGeometry () {
  // Base: 16x8x16, bottom of shulker box (stationary)
  // Centered at origin in XZ, sitting on y=0
  const baseGeometry = createBoxGeometry(
    [-8, 0, -8],  // origin centered
    [16, 8, 16],  // size (half height)
    {
      top: [16, 28],    // inner top (visible when open)
      bottom: [32, 28], // outer bottom
      south: [32, 44],  // front
      north: [0, 44],   // back
      east: [16, 44],   // right
      west: [48, 44]    // left
    },
    TEX_WIDTH, TEX_HEIGHT
  )

  // Lid: 16x8x16, top of shulker box (opens upward)
  // Positioned above base, will be in a pivot group for animation
  // Geometry origin is relative to pivot (which will be at base top)
  const lidGeometry = createBoxGeometry(
    [-8, 0, -8],  // origin relative to pivot at (0, 8, 0)
    [16, 8, 16],  // size (half height)
    {
      top: [16, 0],     // outer top
      bottom: [32, 0],  // inner bottom (visible when open)
      south: [32, 16],  // front
      north: [0, 16],   // back
      east: [16, 16],   // right
      west: [48, 16]    // left
    },
    TEX_WIDTH, TEX_HEIGHT
  )

  return { baseGeometry, lidGeometry }
}

function getTexturePath (version, color) {
  if (!color || color === 'default') {
    return `textures/${version}/entity/shulker/shulker.png`
  }
  return `textures/${version}/entity/shulker/shulker_${color}.png`
}

// Extract color from block name like "white_shulker_box" or "shulker_box"
function getColorFromName (blockName) {
  if (blockName === 'shulker_box') {
    return 'default'
  }
  // Remove "_shulker_box" suffix to get color
  const color = blockName.replace('_shulker_box', '')
  return SHULKER_COLORS.includes(color) ? color : 'default'
}

const ShulkerBoxModel = {
  createMesh (version, blockName, facing = 'up') {
    const group = new THREE.Group()
    group.name = `shulker_box_${blockName}`

    const { baseGeometry, lidGeometry } = createShulkerBoxGeometry()
    const color = getColorFromName(blockName)

    // Create material
    const material = new THREE.MeshLambertMaterial({
      transparent: true,
      alphaTest: 0.1,
      side: THREE.FrontSide
    })

    // Load texture
    const texturePath = getTexturePath(version, color)
    loadTexture(texturePath, texture => {
      texture.magFilter = THREE.NearestFilter
      texture.minFilter = THREE.NearestFilter
      texture.flipY = false
      material.map = texture
      material.needsUpdate = true
    })

    // Create base mesh (stationary)
    const baseMesh = new THREE.Mesh(baseGeometry, material)
    baseMesh.name = 'base'
    group.add(baseMesh)

    // Create lid pivot group at the top of base
    // Shulker box lid pivots open (unlike chest which pivots from back hinge)
    // The lid slides/pivots upward when opened
    const lidPivot = new THREE.Group()
    lidPivot.name = 'lidPivot'
    lidPivot.position.set(0, 8 / 16, 0) // Top of base
    group.add(lidPivot)

    // Create lid mesh and add to pivot
    const lidMesh = new THREE.Mesh(lidGeometry, material)
    lidMesh.name = 'lid'
    lidPivot.add(lidMesh)

    // Store lidPivot for animation
    group.userData.lidPivot = lidPivot

    // Apply facing rotation for 6-direction facing
    // Shulker boxes can face any of 6 directions
    const rotation = FACING_ROTATION_6[facing] || FACING_ROTATION_6.up
    group.rotation.x = rotation.x
    group.rotation.y = rotation.y
    group.rotation.z = rotation.z

    return group
  },

  // Animation helper - shulker lid slides up when opening
  // offset: 0 = closed, 0.5 = fully open (moves up by half block)
  setLidOffset (mesh, offset) {
    const lidPivot = mesh.userData.lidPivot
    if (lidPivot) {
      // Shulker lid moves up, doesn't rotate
      lidPivot.position.y = (8 / 16) + offset
    }
  }
}

module.exports = ShulkerBoxModel
