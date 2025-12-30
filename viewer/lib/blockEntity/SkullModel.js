const THREE = require('three')
const { loadTexture } = globalThis.isElectron
  ? require('../utils.electron.js')
  : require('../utils')
const { createBoxGeometry, FACING_ROTATION_4, getRotation16 } = require('./geometry')

// Skull types and their texture paths
const SKULL_CONFIGS = {
  skeleton_skull: {
    texture: 'entity/skeleton/skeleton.png',
    texWidth: 64,
    texHeight: 32,
    uvHead: [0, 0]  // Head UV start position
  },
  skeleton_wall_skull: {
    texture: 'entity/skeleton/skeleton.png',
    texWidth: 64,
    texHeight: 32,
    uvHead: [0, 0]
  },
  wither_skeleton_skull: {
    texture: 'entity/skeleton/wither_skeleton.png',
    texWidth: 64,
    texHeight: 32,
    uvHead: [0, 0]
  },
  wither_skeleton_wall_skull: {
    texture: 'entity/skeleton/wither_skeleton.png',
    texWidth: 64,
    texHeight: 32,
    uvHead: [0, 0]
  },
  zombie_head: {
    texture: 'entity/zombie/zombie.png',
    texWidth: 64,
    texHeight: 64,
    uvHead: [0, 0]
  },
  zombie_wall_head: {
    texture: 'entity/zombie/zombie.png',
    texWidth: 64,
    texHeight: 64,
    uvHead: [0, 0]
  },
  creeper_head: {
    texture: 'entity/creeper/creeper.png',
    texWidth: 64,
    texHeight: 32,
    uvHead: [0, 0]
  },
  creeper_wall_head: {
    texture: 'entity/creeper/creeper.png',
    texWidth: 64,
    texHeight: 32,
    uvHead: [0, 0]
  },
  player_head: {
    texture: 'entity/player/wide/steve.png',  // Default to Steve
    texWidth: 64,
    texHeight: 64,
    uvHead: [0, 0]
  },
  player_wall_head: {
    texture: 'entity/player/wide/steve.png',
    texWidth: 64,
    texHeight: 64,
    uvHead: [0, 0]
  },
  piglin_head: {
    texture: 'entity/piglin/piglin.png',
    texWidth: 64,
    texHeight: 64,
    uvHead: [0, 0]
  },
  piglin_wall_head: {
    texture: 'entity/piglin/piglin.png',
    texWidth: 64,
    texHeight: 64,
    uvHead: [0, 0]
  },
  dragon_head: {
    texture: 'entity/enderdragon/dragon.png',
    texWidth: 256,
    texHeight: 256,
    uvHead: [0, 0],
    size: [16, 16, 16]  // Dragon head is bigger
  },
  dragon_wall_head: {
    texture: 'entity/enderdragon/dragon.png',
    texWidth: 256,
    texHeight: 256,
    uvHead: [0, 0],
    size: [16, 16, 16]
  }
}

function createSkullGeometry (size, texWidth, texHeight) {
  // Standard skull is 8x8x8 pixels
  // Dragon head is 16x16x16 pixels
  const [sx, sy, sz] = size

  // Head texture UV layout (for standard mobs):
  // The head is typically at (0, 0) in mob textures
  // Top: (8, 0) 8x8
  // Bottom: (16, 0) 8x8
  // Front: (8, 8) 8x8
  // Back: (24, 8) 8x8
  // Left: (0, 8) 8x8
  // Right: (16, 8) 8x8

  const headGeometry = createBoxGeometry(
    [-sx / 2, 0, -sz / 2],
    [sx, sy, sz],
    {
      top: [8, 0],
      bottom: [16, 0],
      south: [8, 8],    // front face
      north: [24, 8],   // back face
      east: [16, 8],    // right side
      west: [0, 8]      // left side
    },
    texWidth, texHeight
  )

  return headGeometry
}

function isWallSkull (blockName) {
  return blockName.includes('wall')
}

const SkullModel = {
  createMesh (version, blockName, facing = 'north', rotation = 0) {
    const group = new THREE.Group()
    group.name = `skull_${blockName}`

    const config = SKULL_CONFIGS[blockName] || SKULL_CONFIGS.skeleton_skull
    const size = config.size || [8, 8, 8]
    const isWall = isWallSkull(blockName)

    const headGeometry = createSkullGeometry(size, config.texWidth, config.texHeight)

    // Create material
    const material = new THREE.MeshLambertMaterial({
      transparent: true,
      alphaTest: 0.1,
      side: THREE.FrontSide
    })

    // Load texture
    const texturePath = `textures/${version}/${config.texture}`
    loadTexture(texturePath, texture => {
      texture.magFilter = THREE.NearestFilter
      texture.minFilter = THREE.NearestFilter
      texture.flipY = false
      material.map = texture
      material.needsUpdate = true
    })

    const headMesh = new THREE.Mesh(headGeometry, material)
    headMesh.name = 'head'

    if (isWall) {
      // Wall-mounted skulls are positioned against the wall
      headMesh.position.z = 4 / 16
      group.add(headMesh)
      // Wall skulls use 4-direction facing
      group.rotation.y = FACING_ROTATION_4[facing] || 0
    } else {
      // Floor skulls sit on the ground
      group.add(headMesh)
      // Floor skulls use 16-direction rotation
      group.rotation.y = getRotation16(rotation)
    }

    return group
  }
}

module.exports = SkullModel
