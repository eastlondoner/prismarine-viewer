const THREE = require('three')
const TWEEN = require('@tweenjs/tween.js')

const Entity = require('./entity/Entity')
const { dispose3 } = require('./dispose')

const { createCanvas } = require('canvas')

function getEntityMesh (entity, scene) {
  if (entity.name) {
    try {
      const e = new Entity('1.16.4', entity.name, scene)

      if (entity.username !== undefined) {
        const canvas = createCanvas(500, 100)

        const ctx = canvas.getContext('2d')
        ctx.font = '50pt Arial'
        ctx.fillStyle = '#000000'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'

        const txt = entity.username
        ctx.fillText(txt, 100, 0)

        const tex = new THREE.Texture(canvas)
        tex.needsUpdate = true
        const spriteMat = new THREE.SpriteMaterial({ map: tex })
        const sprite = new THREE.Sprite(spriteMat)
        sprite.position.y += entity.height + 0.6

        e.mesh.add(sprite)
      }
      return e.mesh
    } catch (err) {
      console.log(err)
    }
  }

  const geometry = new THREE.BoxGeometry(entity.width, entity.height, entity.width)
  geometry.translate(0, entity.height / 2, 0)
  const material = new THREE.MeshBasicMaterial({ color: 0xff00ff })
  const cube = new THREE.Mesh(geometry, material)
  return cube
}

class Entities {
  constructor (scene) {
    this.scene = scene
    this.entities = {}
    this.tweens = {} // Store active tweens by entity id
    this.playerIds = new Set() // Track which entity IDs are players
  }

  clear () {
    for (const mesh of Object.values(this.entities)) {
      this.scene.remove(mesh)
      dispose3(mesh)
    }
    // Stop all active tweens
    for (const tweenSet of Object.values(this.tweens)) {
      if (tweenSet.pos) tweenSet.pos.stop()
      if (tweenSet.rot) tweenSet.rot.stop()
    }
    this.entities = {}
    this.tweens = {}
    this.playerIds.clear()
  }

  update (entity) {
    if (!this.entities[entity.id]) {
      const mesh = getEntityMesh(entity, this.scene)
      if (!mesh) return
      this.entities[entity.id] = mesh
      this.tweens[entity.id] = { pos: null, rot: null }
      // Track if this is a player entity
      if (entity.username) {
        this.playerIds.add(entity.id)
      }
      this.scene.add(mesh)
    }

    const e = this.entities[entity.id]
    const tweens = this.tweens[entity.id]

    if (entity.delete) {
      // Stop tweens before removing
      if (tweens) {
        if (tweens.pos) tweens.pos.stop()
        if (tweens.rot) tweens.rot.stop()
        delete this.tweens[entity.id]
      }
      this.playerIds.delete(entity.id)
      this.scene.remove(e)
      dispose3(e)
      delete this.entities[entity.id]
      return
    }

    if (entity.pos) {
      if (tweens.pos) tweens.pos.stop()
      tweens.pos = new TWEEN.Tween(e.position).to({ x: entity.pos.x, y: entity.pos.y, z: entity.pos.z }, 50).start()
    }
    if (entity.yaw != null) {
      // Stop previous rotation tween to prevent conflicts
      if (tweens.rot) tweens.rot.stop()

      // Entity models face +Z by default, mineflayer yaw=0 is North (-Z)
      const targetYaw = entity.yaw

      // Normalize current rotation to -π to π range
      let currentYaw = e.rotation.y
      while (currentYaw > Math.PI) currentYaw -= Math.PI * 2
      while (currentYaw < -Math.PI) currentYaw += Math.PI * 2
      e.rotation.y = currentYaw

      // Find shortest rotation path
      let delta = targetYaw - currentYaw
      while (delta > Math.PI) delta -= Math.PI * 2
      while (delta < -Math.PI) delta += Math.PI * 2

      tweens.rot = new TWEEN.Tween(e.rotation).to({ y: currentYaw + delta }, 50).start()
    }
  }
}

module.exports = { Entities }
