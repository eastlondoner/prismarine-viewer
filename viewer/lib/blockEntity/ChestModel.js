const THREE = require('three')
const { loadTexture } = globalThis.isElectron
  ? require('../utils.electron.js')
  : require('../utils')

// Texture size for chest textures
const TEX_WIDTH = 64
const TEX_HEIGHT = 64

// Facing direction to Y rotation (in radians)
// Minecraft chests face the player when placed, latch faces outward
// Our geometry has front (latch) at +Z, so we rotate to match facing direction
const FACING_ROTATION = {
  north: Math.PI,     // latch faces -Z (north)
  south: 0,           // latch faces +Z (south)
  east: Math.PI / 2,  // latch faces +X (east)
  west: -Math.PI / 2  // latch faces -X (west)
}

// Helper to create UV coordinates normalized to 0-1
// Note: texture.flipY = false means V=0 is at TOP of image, V=1 is at BOTTOM
function uv (u, v) {
  return [u / TEX_WIDTH, v / TEX_HEIGHT]
}

// Create a box with custom UV mapping
// origin: [x, y, z] in pixels (1/16 of a block)
// size: [width, height, depth] in pixels
// uvMap: { top, bottom, north, south, east, west } each with [u, v] start position
function createBoxGeometry (origin, size, uvMap) {
  const [ox, oy, oz] = origin.map(v => v / 16)
  const [sx, sy, sz] = size.map(v => v / 16)

  // Center the geometry then offset to origin
  const geometry = new THREE.BufferGeometry()

  // 8 vertices of the box
  const x0 = ox
  const x1 = ox + sx
  const y0 = oy
  const y1 = oy + sy
  const z0 = oz
  const z1 = oz + sz

  // Positions for each face (6 faces, 4 vertices each = 24 vertices)
  // Each face: bottom-left, bottom-right, top-right, top-left (CCW when looking at face)
  const positions = []
  const normals = []
  const uvs = []
  const indices = []

  // Helper to add a face
  // flipU/flipV allow correcting UV orientation for faces with different vertex orderings
  function addFace (verts, normal, uvStart, uvSize, flipU = false, flipV = false) {
    const baseIndex = positions.length / 3
    for (const v of verts) {
      positions.push(v[0], v[1], v[2])
      normals.push(normal[0], normal[1], normal[2])
    }
    // UV coordinates: [u, v] normalized 0-1
    // uvStart is top-left of the texture region, uvSize is [width, height] in pixels
    // With flipY=false: v=0 is top of image, v=1 is bottom
    let [u0, v0] = uv(uvStart[0], uvStart[1]) // top-left of texture region
    let [u1, v1] = uv(uvStart[0] + uvSize[0], uvStart[1] + uvSize[1]) // bottom-right

    // Allow flipping UV axes for faces with non-standard vertex ordering
    if (flipU) [u0, u1] = [u1, u0]
    if (flipV) [v0, v1] = [v1, v0]

    // UVs for quad vertices: bottom-left, bottom-right, top-right, top-left (of the 3D face)
    // Map to texture: v1 is bottom of texture region, v0 is top
    uvs.push(u0, v1) // 3D bottom-left -> texture bottom-left
    uvs.push(u1, v1) // 3D bottom-right -> texture bottom-right
    uvs.push(u1, v0) // 3D top-right -> texture top-right
    uvs.push(u0, v0) // 3D top-left -> texture top-left

    // Two triangles for the quad
    indices.push(baseIndex, baseIndex + 1, baseIndex + 2)
    indices.push(baseIndex, baseIndex + 2, baseIndex + 3)
  }

  // Top face (+Y) - looking down at XZ plane
  if (uvMap.top) {
    addFace([
      [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]
    ], [0, 1, 0], uvMap.top, [size[0], size[2]], true, true)
  }

  // Bottom face (-Y) - looking up at XZ plane
  // Vertex order gives CCW winding from -Y
  // UV needs V flipped: 3D back (z0) should map to texture top, 3D front (z1) to texture bottom
  // U stays normal: 3D left (x0) maps to texture left, 3D right (x1) to texture right
  // Note: We rotate all faces 180 degrees (Flip U + Flip V) relative to standard to match texture orientation.
  if (uvMap.bottom) {
    addFace([
      [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]
    ], [0, -1, 0], uvMap.bottom, [size[0], size[2]], true, false)
  }

  // Front face (+Z / South) - looking at XY plane from +Z
  if (uvMap.south) {
    addFace([
      [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]
    ], [0, 0, 1], uvMap.south, [size[0], size[1]], true, true)
  }

  // Back face (-Z / North) - looking at XY plane from -Z
  if (uvMap.north) {
    addFace([
      [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]
    ], [0, 0, -1], uvMap.north, [size[0], size[1]], true, true)
  }

  // Right face (+X / East) - looking at ZY plane from +X
  if (uvMap.east) {
    addFace([
      [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]
    ], [1, 0, 0], uvMap.east, [size[2], size[1]], true, true)
  }

  // Left face (-X / West) - looking at ZY plane from -X
  if (uvMap.west) {
    addFace([
      [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]
    ], [-1, 0, 0], uvMap.west, [size[2], size[1]], true, true)
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)

  return geometry
}

// Minecraft chest texture layout (64x64):
// The chest texture has specific regions for lid, base, and latch
// See: https://minecraft.wiki/w/File:Chest_(texture).png
//
// Lid (14x5x14):
//   Top:    (28, 0)  14x14
//   Bottom: (14, 0)  14x14 (inside of lid)
//   Front:  (42, 14) 14x5  (the side that faces player, has latch)
//   Back:   (14, 14) 14x5
//   Left:   (28, 14) 14x5
//   Right:  (0, 14)  14x5
//
// Base (14x10x14):
//   Top:    (28, 19) 14x14 (inside of base)
//   Bottom: (14, 19) 14x14
//   Front:  (42, 33) 14x10
//   Back:   (14, 33) 14x10
//   Left:   (28, 33) 14x10
//   Right:  (0, 33)  14x10
//
// Latch (2x4x1):
//   Various small pieces

function createSingleChestGeometry () {
  // IMPORTANT: Build geometry CENTERED at origin (0, 0, 0) so rotation works correctly
  // Original chest spans from pixel (1, 0, 1) to (15, 10, 15), center at (8, 5, 8)
  // We offset by -8 in X and Z to center at origin

  // Base: 14x10x14 pixels, centered at origin in XZ, bottom at y=0
  const baseGeometry = createBoxGeometry(
    [-7, 0, -7], // origin in pixels (centered at 0 in XZ)
    [14, 10, 14], // size in pixels
    {
      top: [28, 19], // inside, visible when open
      bottom: [14, 19], // bottom of base (14x14 at y=19)
      south: [42, 33], // front (14x10)
      north: [14, 33], // back (14x10)
      west: [28, 33], // left (14x10)
      east: [0, 33] // right (14x10)
    }
  )

  // Lid: 14x5x14 pixels, centered at origin in XZ, starts at y=9
  // Note: starts at y=9 to match vanilla.
  // Texture layout: (14,0)=lid outer top, (28,0)=lid inner bottom
  const lidGeometry = createBoxGeometry(
    [-7, 9, -7], // origin (centered at 0 in XZ)
    [14, 5, 14], // size
    {
      top: [28, 0], // outer top of lid (visible when looking at closed chest)
      bottom: [14, 0], // inner bottom visible when lid is open
      south: [42, 14], // front (with latch area)
      north: [14, 14], // back
      west: [28, 14], // left
      east: [0, 14] // right
    }
  )

  // Latch: 2x4x1, positioned at front center of lid
  // Moved up by 1 pixel along with lid to avoid z-fighting
  const latchGeometry = createBoxGeometry(
    [-1, 7, 7], // origin - front of chest, centered in X
    [2, 4, 1], // size
    {
      top: [1, 1],
      bottom: [3, 1], // Unused?
      south: [1, 1], // visible front
      north: [4, 1],
      west: [3, 1],
      east: [0, 1]
    }
  )

  return { baseGeometry, lidGeometry, latchGeometry }
}

function getTexturePath (version, type, chestType) {
  // Determine the base texture name
  let baseName
  if (type === 'ender_chest') {
    baseName = 'ender' // Ender chests don't have left/right variants
  } else if (type === 'trapped_chest') {
    baseName = chestType === 'single' ? 'trapped' : `trapped_${chestType}`
  } else {
    baseName = chestType === 'single' ? 'normal' : `normal_${chestType}`
  }

  // Return path relative to textures folder
  return `textures/${version}/entity/chest/${baseName}.png`
}

const ChestModel = {
  // Cache for loaded textures
  textureCache: {},

  createMesh (version, type, facing, chestType = 'single') {
    // Create parent group for the whole chest
    const group = new THREE.Group()
    group.name = `chest_${type}_${chestType}`

    // For now, only handle single chests
    // Double chest left/right will need different geometry
    const { baseGeometry, lidGeometry, latchGeometry } = createSingleChestGeometry()

    // Create material
    const material = new THREE.MeshLambertMaterial({
      transparent: true,
      alphaTest: 0.1,
      side: THREE.FrontSide
    })

    // Load texture
    const texturePath = getTexturePath(version, type, chestType)
    loadTexture(texturePath, texture => {
      texture.magFilter = THREE.NearestFilter
      texture.minFilter = THREE.NearestFilter
      texture.flipY = false
      material.map = texture
      material.needsUpdate = true
    })

    // Create base mesh
    const baseMesh = new THREE.Mesh(baseGeometry, material)
    baseMesh.name = 'base'
    group.add(baseMesh)

    // Create lid mesh (simplified - no pivot group for now)
    const lidMesh = new THREE.Mesh(lidGeometry, material)
    lidMesh.name = 'lid'
    group.add(lidMesh)

    // Create latch mesh
    const latchMesh = new THREE.Mesh(latchGeometry, material)
    latchMesh.name = 'latch'
    group.add(latchMesh)

    // Apply facing rotation
    // The chest model faces +Z by default (south), rotate based on facing
    // Rotation happens around origin, which is the center of the chest in XZ
    group.rotation.y = FACING_ROTATION[facing] || 0

    return group
  },

  // Animation helper (for future use)
  setLidAngle (mesh, angle) {
    if (mesh.userData.lid) {
      // Negative X rotation opens the lid (pivots at back edge)
      mesh.userData.lid.rotation.x = -angle
    }
  }
}

module.exports = ChestModel
