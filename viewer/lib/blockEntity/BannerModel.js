const THREE = require('three')
const { loadTexture } = globalThis.isElectron
  ? require('../utils.electron.js')
  : require('../utils')
const { createBoxGeometry, FACING_ROTATION_4, getRotation16 } = require('./geometry')

// Banner texture is 64x64
const TEX_WIDTH = 64
const TEX_HEIGHT = 64

// Banner colors (also used as DyeColor in Minecraft)
const BANNER_COLORS = [
  'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime',
  'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue',
  'brown', 'green', 'red', 'black'
]

// Banner texture layout (64x64):
// The banner texture has:
// - Banner cloth: main hanging part
// - Pole: wooden crossbar at top

function createStandingBannerGeometry () {
  // Standing banner: Pole + Cloth
  // Pole: 2x42x2 pixels, centered vertical pole
  // Crossbar: 20x2x2 at top
  // Cloth: 20x40x1 hanging from crossbar

  const poleGeometry = createBoxGeometry(
    [-1, 0, -1],  // centered pole
    [2, 42, 2],
    {
      top: [50, 2],
      bottom: [48, 2],
      south: [44, 0],
      north: [46, 0],
      east: [44, 0],
      west: [46, 0]
    },
    TEX_WIDTH, TEX_HEIGHT
  )

  // Crossbar at top of pole
  const crossbarGeometry = createBoxGeometry(
    [-10, 42, -1],
    [20, 2, 2],
    {
      top: [44, 4],
      bottom: [44, 6],
      south: [44, 2],
      north: [44, 2],
      east: [42, 2],
      west: [42, 2]
    },
    TEX_WIDTH, TEX_HEIGHT
  )

  // Cloth: 20x40x1 hanging from crossbar
  const clothGeometry = createBoxGeometry(
    [-10, 2, 0],  // hanging from crossbar
    [20, 40, 1],
    {
      top: [0, 0],      // hidden
      bottom: [20, 0],  // bottom edge
      south: [0, 0],    // front visible face
      north: [20, 0],   // back face
      east: [0, 0],     // side edges
      west: [20, 0]
    },
    TEX_WIDTH, TEX_HEIGHT
  )

  return { poleGeometry, crossbarGeometry, clothGeometry }
}

function createWallBannerGeometry () {
  // Wall banner: Just crossbar + cloth, no pole
  // Crossbar: 20x2x2 attached to wall
  // Cloth: 20x40x1 hanging from crossbar
  //
  // Geometry is created at -Z, then rotated by FACING_ROTATION_4:
  // - facing="north" (PI) rotates from -Z to +Z (banner on south wall, faces north)
  // - facing="south" (0) stays at -Z (banner on north wall, faces south)

  const crossbarGeometry = createBoxGeometry(
    [-10, 14, -8],  // against wall at -Z edge
    [20, 2, 2],
    {
      top: [44, 4],
      bottom: [44, 6],
      south: [44, 2],
      north: [44, 2],
      east: [42, 2],
      west: [42, 2]
    },
    TEX_WIDTH, TEX_HEIGHT
  )

  // Cloth hanging from wall crossbar
  const clothGeometry = createBoxGeometry(
    [-10, -26, -8],  // hanging below crossbar at -Z edge
    [20, 40, 1],
    {
      top: [0, 0],
      bottom: [20, 0],
      south: [0, 0],    // visible face (away from wall)
      north: [20, 0],   // against wall
      east: [0, 0],
      west: [20, 0]
    },
    TEX_WIDTH, TEX_HEIGHT
  )

  return { crossbarGeometry, clothGeometry }
}

// Get the color tint for a banner
function getColorTint (color) {
  const tints = {
    white: 0xffffff,
    orange: 0xf9801d,
    magenta: 0xc74ebd,
    light_blue: 0x3ab3da,
    yellow: 0xfed83d,
    lime: 0x80c71f,
    pink: 0xf38baa,
    gray: 0x474f52,
    light_gray: 0x9d9d97,
    cyan: 0x169c9c,
    purple: 0x8932b8,
    blue: 0x3c44aa,
    brown: 0x835432,
    green: 0x5e7c16,
    red: 0xb02e26,
    black: 0x1d1d21
  }
  return tints[color] || 0xffffff
}

// Extract color from block name like "red_banner" or "red_wall_banner"
function getColorFromName (blockName) {
  for (const color of BANNER_COLORS) {
    if (blockName.startsWith(color + '_')) {
      return color
    }
  }
  return 'white'
}

function isWallBanner (blockName) {
  return blockName.includes('wall_banner')
}

const BannerModel = {
  createMesh (version, blockName, facing = 'north', rotation = 0) {
    const group = new THREE.Group()
    group.name = `banner_${blockName}`

    const color = getColorFromName(blockName)
    const isWall = isWallBanner(blockName)

    // Create material with color tint (since we skip patterns, we tint the base)
    const material = new THREE.MeshLambertMaterial({
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
      color: getColorTint(color)
    })

    // Load base texture (white, will be tinted by material color)
    const texturePath = `textures/${version}/entity/banner/base.png`
    loadTexture(texturePath, texture => {
      texture.magFilter = THREE.NearestFilter
      texture.minFilter = THREE.NearestFilter
      texture.flipY = false
      material.map = texture
      material.needsUpdate = true
    })

    if (isWall) {
      const { crossbarGeometry, clothGeometry } = createWallBannerGeometry()

      const crossbarMesh = new THREE.Mesh(crossbarGeometry, material)
      crossbarMesh.name = 'crossbar'
      group.add(crossbarMesh)

      const clothMesh = new THREE.Mesh(clothGeometry, material)
      clothMesh.name = 'cloth'
      group.add(clothMesh)

      // Wall banners use 4-direction facing
      group.rotation.y = FACING_ROTATION_4[facing] || 0
    } else {
      const { poleGeometry, crossbarGeometry, clothGeometry } = createStandingBannerGeometry()

      const poleMesh = new THREE.Mesh(poleGeometry, material)
      poleMesh.name = 'pole'
      group.add(poleMesh)

      const crossbarMesh = new THREE.Mesh(crossbarGeometry, material)
      crossbarMesh.name = 'crossbar'
      group.add(crossbarMesh)

      const clothMesh = new THREE.Mesh(clothGeometry, material)
      clothMesh.name = 'cloth'
      group.add(clothMesh)

      // Standing banners use 16-direction rotation
      group.rotation.y = getRotation16(rotation)
    }

    return group
  }
}

module.exports = BannerModel
