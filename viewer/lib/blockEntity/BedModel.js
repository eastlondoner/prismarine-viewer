const THREE = require('three')
const { loadTexture } = globalThis.isElectron
  ? require('../utils.electron.js')
  : require('../utils')
const { createBoxGeometry, FACING_ROTATION_4 } = require('./geometry')

// Bed texture is 64x64
const TEX_WIDTH = 64
const TEX_HEIGHT = 64

// Bed colors
const BED_COLORS = [
  'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime',
  'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue',
  'brown', 'green', 'red', 'black'
]

// Bed texture layout (64x64):
// The bed texture has regions for head and foot parts
//
// Head part (the pillow end):
//   Top: (6, 6) 16x16 - mattress top with pillow
//   Bottom: (28, 0) 16x16 - bottom of head
//   Sides: Various positions
//
// Foot part (the end you get in from):
//   Top: (6, 28) 16x16 - mattress top
//   Bottom: (28, 22) 16x16 - bottom of foot
//   Sides: Various positions
//
// Legs: (0, 22) area

function createBedHeadGeometry () {
  // Head part: Main mattress 16x3x16, plus leg posts
  // Centered at origin in XZ, sitting on y=0 (floor level)

  // Mattress part (sits on the frame)
  const mattressGeometry = createBoxGeometry(
    [-8, 3, -8],  // origin at floor level + 3 pixels up (on frame)
    [16, 3, 16],  // mattress is 3 pixels thick
    {
      top: [6, 6],      // top of mattress with pillow
      bottom: [28, 0],  // bottom
      south: [0, 6],    // foot-facing side (will be towards other bed half)
      north: [22, 6],   // back (headboard side)
      east: [0, 6],     // right side
      west: [22, 6]     // left side
    },
    TEX_WIDTH, TEX_HEIGHT
  )

  // Leg posts (4 corners, 3x3x3 each)
  const legs = []
  const legPositions = [
    [-8, 0, -8],  // back-left
    [5, 0, -8],   // back-right
    [-8, 0, 5],   // front-left
    [5, 0, 5]     // front-right
  ]

  for (const [lx, ly, lz] of legPositions) {
    legs.push(createBoxGeometry(
      [lx, ly, lz],
      [3, 3, 3],
      {
        top: [50, 3],
        bottom: [56, 3],
        south: [53, 3],
        north: [50, 0],
        east: [53, 0],
        west: [50, 0]
      },
      TEX_WIDTH, TEX_HEIGHT
    ))
  }

  return { mattressGeometry, legGeometries: legs }
}

function createBedFootGeometry () {
  // Foot part: Main mattress 16x3x16, plus leg posts

  const mattressGeometry = createBoxGeometry(
    [-8, 3, -8],
    [16, 3, 16],
    {
      top: [6, 28],     // top of mattress (foot section)
      bottom: [28, 22], // bottom
      south: [22, 28],  // back (towards wall/head)
      north: [0, 28],   // front (get in side)
      east: [0, 28],
      west: [22, 28]
    },
    TEX_WIDTH, TEX_HEIGHT
  )

  const legs = []
  const legPositions = [
    [-8, 0, -8],
    [5, 0, -8],
    [-8, 0, 5],
    [5, 0, 5]
  ]

  for (const [lx, ly, lz] of legPositions) {
    legs.push(createBoxGeometry(
      [lx, ly, lz],
      [3, 3, 3],
      {
        top: [50, 3],
        bottom: [56, 3],
        south: [53, 3],
        north: [50, 0],
        east: [53, 0],
        west: [50, 0]
      },
      TEX_WIDTH, TEX_HEIGHT
    ))
  }

  return { mattressGeometry, legGeometries: legs }
}

function getTexturePath (version, color) {
  return `textures/${version}/entity/bed/${color}.png`
}

// Extract color from block name like "red_bed"
function getColorFromName (blockName) {
  const color = blockName.replace('_bed', '')
  return BED_COLORS.includes(color) ? color : 'red'
}

const BedModel = {
  createMesh (version, blockName, facing = 'north', part = 'foot') {
    const group = new THREE.Group()
    group.name = `bed_${blockName}_${part}`

    const color = getColorFromName(blockName)
    const isHead = part === 'head'
    const { mattressGeometry, legGeometries } = isHead
      ? createBedHeadGeometry()
      : createBedFootGeometry()

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

    // Create mattress mesh
    const mattressMesh = new THREE.Mesh(mattressGeometry, material)
    mattressMesh.name = 'mattress'
    group.add(mattressMesh)

    // Create leg meshes
    for (let i = 0; i < legGeometries.length; i++) {
      const legMesh = new THREE.Mesh(legGeometries[i], material)
      legMesh.name = `leg_${i}`
      group.add(legMesh)
    }

    // Apply facing rotation
    // Beds face the direction the player looks when placing (head away from player)
    group.rotation.y = FACING_ROTATION_4[facing] || 0

    return group
  }
}

module.exports = BedModel
