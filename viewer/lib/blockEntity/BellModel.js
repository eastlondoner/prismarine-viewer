const THREE = require('three')
const { loadTexture } = globalThis.isElectron
  ? require('../utils.electron.js')
  : require('../utils')
const { createBoxGeometry, FACING_ROTATION_4 } = require('./geometry')

// Bell texture is 32x32
const TEX_WIDTH = 32
const TEX_HEIGHT = 32

// Bell attachment types
const ATTACHMENTS = ['floor', 'ceiling', 'single_wall', 'double_wall']

// Bell texture layout (32x32):
// Bell body is a tapered box shape
// We approximate with two stacked boxes

function createBellBodyGeometry () {
  // Bell body approximated as two parts:
  // Top (narrower): 6x5x6
  // Bottom (wider): 8x6x8

  const topGeometry = createBoxGeometry(
    [-3, 5, -3],
    [6, 5, 6],
    {
      top: [0, 0],
      bottom: [8, 0],
      south: [0, 6],
      north: [8, 6],
      east: [0, 6],
      west: [8, 6]
    },
    TEX_WIDTH, TEX_HEIGHT
  )

  const bottomGeometry = createBoxGeometry(
    [-4, 0, -4],
    [8, 5, 8],
    {
      top: [0, 14],     // inner top (hidden)
      bottom: [16, 14], // bottom edge (visible from below)
      south: [0, 22],
      north: [16, 22],
      east: [0, 22],
      west: [16, 22]
    },
    TEX_WIDTH, TEX_HEIGHT
  )

  return { topGeometry, bottomGeometry }
}

function createFloorSupportGeometry () {
  // Floor stand: Two vertical posts + crossbar
  // Posts: 2x13x2 at left and right sides
  // Crossbar: 8x2x2 connecting them at top

  const leftPostGeometry = createBoxGeometry(
    [-5, 0, -1],
    [2, 13, 2],
    {
      top: [0, 0],
      bottom: [0, 0],
      south: [0, 0],
      north: [0, 0],
      east: [0, 0],
      west: [0, 0]
    },
    TEX_WIDTH, TEX_HEIGHT
  )

  const rightPostGeometry = createBoxGeometry(
    [3, 0, -1],
    [2, 13, 2],
    {
      top: [0, 0],
      bottom: [0, 0],
      south: [0, 0],
      north: [0, 0],
      east: [0, 0],
      west: [0, 0]
    },
    TEX_WIDTH, TEX_HEIGHT
  )

  const crossbarGeometry = createBoxGeometry(
    [-5, 11, -1],
    [10, 2, 2],
    {
      top: [0, 0],
      bottom: [0, 0],
      south: [0, 0],
      north: [0, 0],
      east: [0, 0],
      west: [0, 0]
    },
    TEX_WIDTH, TEX_HEIGHT
  )

  return { leftPostGeometry, rightPostGeometry, crossbarGeometry }
}

function createCeilingSupportGeometry () {
  // Ceiling attachment: single vertical rod
  const rodGeometry = createBoxGeometry(
    [-1, 10, -1],
    [2, 6, 2],
    {
      top: [0, 0],
      bottom: [0, 0],
      south: [0, 0],
      north: [0, 0],
      east: [0, 0],
      west: [0, 0]
    },
    TEX_WIDTH, TEX_HEIGHT
  )

  return { rodGeometry }
}

function createWallSupportGeometry (isDouble) {
  // Wall attachment: horizontal bar + arm
  const armGeometry = createBoxGeometry(
    [-1, 10, 4],
    [2, 2, 4],
    {
      top: [0, 0],
      bottom: [0, 0],
      south: [0, 0],
      north: [0, 0],
      east: [0, 0],
      west: [0, 0]
    },
    TEX_WIDTH, TEX_HEIGHT
  )

  return { armGeometry }
}

const BellModel = {
  createMesh (version, blockName, facing = 'north', attachment = 'floor') {
    const group = new THREE.Group()
    group.name = `bell_${attachment}`

    // Create bell body material (gold-ish color for support structure)
    const supportMaterial = new THREE.MeshLambertMaterial({
      color: 0x8b7355,  // Wood-like color for support
      transparent: true,
      alphaTest: 0.1,
      side: THREE.FrontSide
    })

    const bellMaterial = new THREE.MeshLambertMaterial({
      transparent: true,
      alphaTest: 0.1,
      side: THREE.FrontSide
    })

    // Load bell texture
    const texturePath = `textures/${version}/entity/bell/bell_body.png`
    loadTexture(texturePath, texture => {
      texture.magFilter = THREE.NearestFilter
      texture.minFilter = THREE.NearestFilter
      texture.flipY = false
      bellMaterial.map = texture
      bellMaterial.needsUpdate = true
    })

    // Create bell body
    const { topGeometry, bottomGeometry } = createBellBodyGeometry()

    // Bell group that can be animated (swing)
    const bellGroup = new THREE.Group()
    bellGroup.name = 'bellBody'

    const topMesh = new THREE.Mesh(topGeometry, bellMaterial)
    topMesh.name = 'bellTop'
    bellGroup.add(topMesh)

    const bottomMesh = new THREE.Mesh(bottomGeometry, bellMaterial)
    bottomMesh.name = 'bellBottom'
    bellGroup.add(bottomMesh)

    // Position bell based on attachment type
    if (attachment === 'floor') {
      bellGroup.position.y = 3 / 16  // Above floor stand

      const { leftPostGeometry, rightPostGeometry, crossbarGeometry } = createFloorSupportGeometry()
      const leftPost = new THREE.Mesh(leftPostGeometry, supportMaterial)
      const rightPost = new THREE.Mesh(rightPostGeometry, supportMaterial)
      const crossbar = new THREE.Mesh(crossbarGeometry, supportMaterial)
      group.add(leftPost)
      group.add(rightPost)
      group.add(crossbar)
    } else if (attachment === 'ceiling') {
      bellGroup.position.y = 4 / 16

      const { rodGeometry } = createCeilingSupportGeometry()
      const rod = new THREE.Mesh(rodGeometry, supportMaterial)
      group.add(rod)
    } else if (attachment === 'single_wall' || attachment === 'double_wall') {
      bellGroup.position.y = 4 / 16

      const { armGeometry } = createWallSupportGeometry(attachment === 'double_wall')
      const arm = new THREE.Mesh(armGeometry, supportMaterial)
      group.add(arm)
    }

    group.add(bellGroup)

    // Store bellGroup for animation
    group.userData.bellGroup = bellGroup

    // Apply facing rotation
    group.rotation.y = FACING_ROTATION_4[facing] || 0

    return group
  },

  // Animation helper - bell swings back and forth
  setSwing (mesh, angle) {
    const bellGroup = mesh.userData.bellGroup
    if (bellGroup) {
      bellGroup.rotation.z = angle
    }
  }
}

module.exports = BellModel
