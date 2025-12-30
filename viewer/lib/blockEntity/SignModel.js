const THREE = require('three')
const { loadTexture } = globalThis.isElectron
  ? require('../utils.electron.js')
  : require('../utils')
const { createBoxGeometry, FACING_ROTATION_4, getRotation16 } = require('./geometry')

// Sign texture is 64x32
const TEX_WIDTH = 64
const TEX_HEIGHT = 32

// Wood types for signs
const WOOD_TYPES = [
  'oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak',
  'crimson', 'warped', 'mangrove', 'cherry', 'bamboo', 'pale_oak'
]

// Sign texture layout (64x32):
// The sign texture has:
// - Board front/back: large area
// - Board edges
// - Post (for standing signs)

function createStandingSignGeometry () {
  // Standing sign: Post + Board
  // Post: 2x14x2 pixels, centered, from y=0 to y=14
  // Board: 24x12x2 pixels, centered, from y=14 to y=26

  const postGeometry = createBoxGeometry(
    [-1, 0, -1],  // centered post
    [2, 14, 2],   // 2x14x2
    {
      top: [2, 14],
      bottom: [0, 14],
      south: [0, 0],
      north: [2, 0],
      east: [0, 0],
      west: [2, 0]
    },
    TEX_WIDTH, TEX_HEIGHT
  )

  // Board: 24x12x2, sitting on top of post
  const boardGeometry = createBoxGeometry(
    [-12, 14, -1],  // centered board above post
    [24, 12, 2],
    {
      top: [2, 0],      // top edge
      bottom: [26, 0],  // bottom edge
      south: [2, 2],    // front face
      north: [28, 2],   // back face (unused usually)
      east: [0, 2],     // left edge
      west: [26, 2]     // right edge
    },
    TEX_WIDTH, TEX_HEIGHT
  )

  return { postGeometry, boardGeometry }
}

function createWallSignGeometry () {
  // Wall sign: Just the board, no post
  // Board: 24x12x2 pixels

  const boardGeometry = createBoxGeometry(
    [-12, 4, 7],  // board flat against wall (+Z side)
    [24, 12, 2],
    {
      top: [2, 0],
      bottom: [26, 0],
      south: [2, 2],    // visible front
      north: [28, 2],   // against wall
      east: [0, 2],
      west: [26, 2]
    },
    TEX_WIDTH, TEX_HEIGHT
  )

  return { boardGeometry }
}

function createHangingSignGeometry () {
  // Hanging sign: Chains + Board (different proportions)
  // Board: 16x10x2 pixels
  // Chains: small vertical bars

  // Left chain
  const leftChainGeometry = createBoxGeometry(
    [-7, 0, 0],
    [2, 6, 2],
    {
      top: [0, 6],
      bottom: [0, 6],
      south: [0, 0],
      north: [0, 0],
      east: [0, 0],
      west: [0, 0]
    },
    TEX_WIDTH, TEX_HEIGHT
  )

  // Right chain
  const rightChainGeometry = createBoxGeometry(
    [5, 0, 0],
    [2, 6, 2],
    {
      top: [0, 6],
      bottom: [0, 6],
      south: [0, 0],
      north: [0, 0],
      east: [0, 0],
      west: [0, 0]
    },
    TEX_WIDTH, TEX_HEIGHT
  )

  // Board: smaller than regular sign
  const boardGeometry = createBoxGeometry(
    [-8, -10, -1],  // hanging below chains
    [16, 10, 2],
    {
      top: [2, 0],
      bottom: [18, 0],
      south: [2, 12],   // front
      north: [20, 12],  // back
      east: [0, 12],
      west: [18, 12]
    },
    TEX_WIDTH, TEX_HEIGHT
  )

  return { leftChainGeometry, rightChainGeometry, boardGeometry }
}

function getTexturePath (version, woodType, isHanging) {
  if (isHanging) {
    return `textures/${version}/entity/signs/hanging/${woodType}.png`
  }
  return `textures/${version}/entity/signs/${woodType}.png`
}

// Extract wood type from block name
function getWoodTypeFromName (blockName) {
  for (const wood of WOOD_TYPES) {
    if (blockName.startsWith(wood + '_')) {
      return wood
    }
  }
  return 'oak'
}

// Determine sign variant from block name
function getSignVariant (blockName) {
  if (blockName.includes('wall_hanging')) return 'wall_hanging'
  if (blockName.includes('hanging')) return 'hanging'
  if (blockName.includes('wall')) return 'wall'
  return 'standing'
}

const SignModel = {
  createMesh (version, blockName, facing = 'north', rotation = 0) {
    const group = new THREE.Group()
    group.name = `sign_${blockName}`

    const woodType = getWoodTypeFromName(blockName)
    const variant = getSignVariant(blockName)
    const isHanging = variant === 'hanging' || variant === 'wall_hanging'

    // Create material
    const material = new THREE.MeshLambertMaterial({
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide  // Signs are visible from both sides
    })

    // Load texture
    const texturePath = getTexturePath(version, woodType, isHanging)
    loadTexture(texturePath, texture => {
      texture.magFilter = THREE.NearestFilter
      texture.minFilter = THREE.NearestFilter
      texture.flipY = false
      material.map = texture
      material.needsUpdate = true
    })

    if (variant === 'standing') {
      const { postGeometry, boardGeometry } = createStandingSignGeometry()

      const postMesh = new THREE.Mesh(postGeometry, material)
      postMesh.name = 'post'
      group.add(postMesh)

      const boardMesh = new THREE.Mesh(boardGeometry, material)
      boardMesh.name = 'board'
      group.add(boardMesh)

      // Standing signs use 16-direction rotation
      group.rotation.y = getRotation16(rotation)
    } else if (variant === 'wall') {
      const { boardGeometry } = createWallSignGeometry()

      const boardMesh = new THREE.Mesh(boardGeometry, material)
      boardMesh.name = 'board'
      group.add(boardMesh)

      // Wall signs use 4-direction facing
      group.rotation.y = FACING_ROTATION_4[facing] || 0
    } else if (variant === 'hanging' || variant === 'wall_hanging') {
      const { leftChainGeometry, rightChainGeometry, boardGeometry } = createHangingSignGeometry()

      if (variant === 'hanging') {
        // Full hanging sign with chains
        const leftChain = new THREE.Mesh(leftChainGeometry, material)
        leftChain.name = 'leftChain'
        group.add(leftChain)

        const rightChain = new THREE.Mesh(rightChainGeometry, material)
        rightChain.name = 'rightChain'
        group.add(rightChain)
      }

      const boardMesh = new THREE.Mesh(boardGeometry, material)
      boardMesh.name = 'board'
      group.add(boardMesh)

      // Hanging signs use 16-direction rotation or 4-direction facing
      if (variant === 'hanging') {
        group.rotation.y = getRotation16(rotation)
      } else {
        group.rotation.y = FACING_ROTATION_4[facing] || 0
      }
    }

    return group
  }
}

module.exports = SignModel
