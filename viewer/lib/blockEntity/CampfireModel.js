const THREE = require('three')
const { loadTexture } = globalThis.isElectron
  ? require('../utils.electron.js')
  : require('../utils')
const { createBoxGeometry, FACING_ROTATION_4 } = require('./geometry')

// Campfire uses block textures (16x16 per face typically)
const TEX_WIDTH = 16
const TEX_HEIGHT = 16

// Campfire geometry: 4 logs arranged in an X pattern
// Each log is approximately 4x4x16 pixels

function createCampfireGeometry () {
  // Create 4 logs arranged in a cross/X pattern
  // Two logs go along X axis, two along Z axis, stacked

  // Bottom logs (along Z axis)
  const log1Geometry = createBoxGeometry(
    [-8, 0, -2],
    [16, 4, 4],
    {
      top: [0, 0],
      bottom: [0, 4],
      south: [0, 8],
      north: [0, 8],
      east: [0, 12],
      west: [0, 12]
    },
    TEX_WIDTH, TEX_HEIGHT
  )

  const log2Geometry = createBoxGeometry(
    [-2, 0, -8],
    [4, 4, 16],
    {
      top: [0, 0],
      bottom: [0, 4],
      south: [0, 12],
      north: [0, 12],
      east: [0, 8],
      west: [0, 8]
    },
    TEX_WIDTH, TEX_HEIGHT
  )

  // Top logs (crossing the bottom ones)
  const log3Geometry = createBoxGeometry(
    [-8, 4, -2],
    [16, 4, 4],
    {
      top: [0, 0],
      bottom: [0, 4],
      south: [0, 8],
      north: [0, 8],
      east: [0, 12],
      west: [0, 12]
    },
    TEX_WIDTH, TEX_HEIGHT
  )

  const log4Geometry = createBoxGeometry(
    [-2, 4, -8],
    [4, 4, 16],
    {
      top: [0, 0],
      bottom: [0, 4],
      south: [0, 12],
      north: [0, 12],
      east: [0, 8],
      west: [0, 8]
    },
    TEX_WIDTH, TEX_HEIGHT
  )

  return [log1Geometry, log2Geometry, log3Geometry, log4Geometry]
}

const CampfireModel = {
  createMesh (version, blockName, facing = 'north', lit = true) {
    const group = new THREE.Group()
    group.name = `campfire_${blockName}`

    const isSoul = blockName === 'soul_campfire'
    const logGeometries = createCampfireGeometry()

    // Create material for logs
    const logMaterial = new THREE.MeshLambertMaterial({
      transparent: true,
      alphaTest: 0.1,
      side: THREE.FrontSide
    })

    // Load log texture
    const logTexture = lit
      ? (isSoul ? 'soul_campfire_log_lit.png' : 'campfire_log_lit.png')
      : 'campfire_log.png'
    const logTexturePath = `textures/${version}/blocks/${logTexture}`

    loadTexture(logTexturePath, texture => {
      texture.magFilter = THREE.NearestFilter
      texture.minFilter = THREE.NearestFilter
      texture.flipY = false
      logMaterial.map = texture
      logMaterial.needsUpdate = true
    })

    // Add log meshes
    for (let i = 0; i < logGeometries.length; i++) {
      const logMesh = new THREE.Mesh(logGeometries[i], logMaterial)
      logMesh.name = `log_${i}`
      group.add(logMesh)
    }

    // Skip fire rendering for Phase 1 (would need animated sprites)
    // The logs alone make the campfire visible

    // Apply facing rotation
    group.rotation.y = FACING_ROTATION_4[facing] || 0

    return group
  }
}

module.exports = CampfireModel
