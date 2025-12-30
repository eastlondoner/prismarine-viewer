const THREE = require('three')

// Create a box with custom UV mapping
// origin: [x, y, z] in pixels (1/16 of a block)
// size: [width, height, depth] in pixels
// uvMap: { top, bottom, north, south, east, west } each with [u, v] start position
// texWidth, texHeight: texture dimensions in pixels (default 64x64)
function createBoxGeometry (origin, size, uvMap, texWidth = 64, texHeight = 64) {
  // Helper to create UV coordinates normalized to 0-1
  function uv (u, v) {
    return [u / texWidth, v / texHeight]
  }

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

// Facing direction to Y rotation (in radians)
// 4-direction facing (horizontal only)
const FACING_ROTATION_4 = {
  north: Math.PI,      // faces -Z
  south: 0,            // faces +Z (default)
  east: Math.PI / 2,   // faces +X
  west: -Math.PI / 2   // faces -X
}

// 6-direction facing (includes up/down)
// For blocks like shulker boxes that can face any direction
const FACING_ROTATION_6 = {
  up: { x: 0, y: 0, z: 0 },                    // default, top faces up
  down: { x: Math.PI, y: 0, z: 0 },            // flipped upside down
  north: { x: Math.PI / 2, y: Math.PI, z: 0 }, // rotated to face north
  south: { x: Math.PI / 2, y: 0, z: 0 },       // rotated to face south
  east: { x: Math.PI / 2, y: Math.PI / 2, z: 0 },  // rotated to face east
  west: { x: Math.PI / 2, y: -Math.PI / 2, z: 0 }  // rotated to face west
}

// 16-direction rotation (for signs, banners, skulls)
// Rotation values 0-15, each step is 22.5 degrees
function getRotation16 (rotation) {
  return (rotation * Math.PI * 2) / 16
}

module.exports = {
  createBoxGeometry,
  FACING_ROTATION_4,
  FACING_ROTATION_6,
  getRotation16
}
