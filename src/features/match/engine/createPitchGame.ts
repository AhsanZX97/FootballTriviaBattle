import Phaser from 'phaser'
import type { PitchCallbacks, PitchGame, PitchState } from './contracts'
import { PITCH_BANDS, pitchLayout, resolvePitchArt, type Sheet } from './pitchArt'
import { FEEDBACK_MS, KICK_MS, ShotTimeline, impactTime, shotPose, type KeeperReaction } from './shotTimeline'
import backgroundSrc from '../../../assets/bg.jpg'

/** Phaser owns the display list and clock; React supplies match snapshots only.
 * The scoring rules remain shared with the authoritative multiplayer server. */
export function createPitchGame(parent: HTMLElement, initial: PitchState, callbacks: PitchCallbacks): PitchGame {
  let state = initial
  let disposed = false
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  // Phaser 3 sizes the canvas in CSS pixels; draw at device pixels and zoom back
  // down, otherwise a 3x phone stretches every frame. Capped for fill-rate.
  const pixelRatio = Math.min(3, Math.max(1, window.devicePixelRatio || 1))
  const deviceSize = () => [
    Math.round((parent.clientWidth || 844) * pixelRatio), Math.round((parent.clientHeight || 390) * pixelRatio),
  ] as const
  const sheets = new Map<string, Sheet>()
  const stock = resolvePitchArt({ stage: 'shoot' })
  for (const art of [stock, resolvePitchArt({ ...initial, stage: 'shoot' }), resolvePitchArt({ ...initial, stage: 'keep' })]) {
    for (const sheet of [art.idle, art.dive, art.ball, art.spin]) sheets.set(sheet.src, sheet)
  }

  class MatchPitch extends Phaser.Scene {
    private pitch!: Phaser.GameObjects.Image
    private keeper!: Phaser.GameObjects.Sprite
    private ball!: Phaser.GameObjects.Sprite
    private label!: Phaser.GameObjects.Text
    private shade!: Phaser.GameObjects.Rectangle
    private fills: Phaser.GameObjects.Image[] = []
    private shot: ShotTimeline | null = null
    private reaction: KeeperReaction = 'wrong-way'
    private mirror = false
    private idleElapsed = 0
    private ready = false

    constructor() { super('match-pitch') }

    preload() {
      this.load.on('loaderror', () => { if (!disposed) callbacks.onError() })
      this.load.image('pitch', backgroundSrc)
      for (const sheet of sheets.values()) this.load.image(sheet.src, sheet.src)
    }

    create() {
      if (disposed) return
      // The authored grids include fractional cell widths. Slice from the actual
      // dimensions rather than rounding each frame and drifting across the sheet.
      for (const sheet of sheets.values()) {
        if (!this.textures.exists(sheet.src)) continue
        const texture = this.textures.get(sheet.src)
        // Actor art is painted at high resolution and shrunk on screen; nearest
        // sampling turns that into stair-stepped edges. The stadium stays pixelated.
        texture.setFilter(Phaser.Textures.FilterMode.LINEAR)
        const source = texture.getSourceImage()
        const width = source.width / sheet.columns
        const height = source.height / sheet.rows
        for (let frame = 0; frame < sheet.columns * sheet.rows; frame++) {
          texture.add(frame, 0, (frame % sheet.columns) * width, Math.floor(frame / sheet.columns) * height, width, height)
        }
      }
      const pitchTexture = this.textures.get('pitch')
      for (const [name, band] of Object.entries(PITCH_BANDS)) pitchTexture.add(name, 0, band.x, band.y, band.width, band.height)
      // Adding frames makes the first one the texture's default, so ask for the whole image.
      this.pitch = this.add.image(0, 0, 'pitch', '__BASE').setOrigin(0)
      this.keeper = this.add.sprite(0, 0, stock.idle.src, 0).setOrigin(0.5, 1)
      this.ball = this.add.sprite(0, 0, stock.ball.src, 0)
      this.label = this.add.text(0, 0, '', {
        fontFamily: '"Press Start 2P", monospace', fontSize: `${16 * pixelRatio}px`,
        color: '#ffcf1a', stroke: '#0a0a0a', strokeThickness: 4 * pixelRatio, align: 'center',
      }).setOrigin(0.5).setDepth(2)
      this.shade = this.add.rectangle(0, 0, 1, 1, 0x020a06, 0.72).setOrigin(0).setDepth(3)
      this.ready = true
      this.startShot()
      this.paint()
      callbacks.onReady()
    }

    startShot() {
      this.shot = state.feedback ? new ShotTimeline(state.feedback) : null
      const reactions: KeeperReaction[] = ['wrong-way', 'frozen', 'late']
      this.reaction = state.reaction ?? reactions[Math.floor(Math.random() * reactions.length)]
      this.mirror = state.mirror ?? Math.random() < 0.5
    }

    receive(next: PitchState) {
      const newShot = next.feedback !== state.feedback
      state = next
      if (!this.ready || disposed) return
      if (newShot) this.startShot()
      this.paint()
    }

    update(_time: number, delta: number) {
      if (!this.ready || disposed) return
      this.idleElapsed += delta
      const outcome = state.feedback
      const events = this.shot?.advance(delta) ?? []
      this.paint()
      // Paint impact before notifying React; completion may unmount this scene.
      for (const event of events) {
        if (!disposed && outcome) callbacks.onEvent(event, outcome)
      }
    }

    private actor(sprite: Phaser.GameObjects.Sprite, sheet: Sheet, fallback: Sheet, frame: number, width: number) {
      const selected = this.textures.exists(sheet.src) ? sheet : fallback
      if (!this.textures.exists(selected.src)) { sprite.setVisible(false); return }
      const source = this.textures.get(selected.src).getSourceImage()
      sprite.setVisible(true).setTexture(selected.src, frame % (selected.columns * selected.rows))
      sprite.setDisplaySize(width, width * (source.height / selected.rows) / (source.width / selected.columns))
    }

    private paint() {
      const { width, height } = this.scale
      const layout = pitchLayout(width, height)
      const art = resolvePitchArt(state)
      const elapsed = this.shot?.elapsed ?? 0
      const visualTime = reducedMotion && state.feedback ? FEEDBACK_MS : elapsed
      const pose = state.feedback ? shotPose(state.feedback, visualTime, this.reaction, this.mirror) : null
      const ball = pose?.ball ?? { x: 0.5, y: 0.8 }
      const keeper = pose?.keeper ?? { x: 0.5, y: 0.51 }
      const position = (point: { x: number; y: number }) => [
        Math.round(layout.x + point.x * layout.width), Math.round(layout.y + point.y * layout.height),
      ] as const
      this.pitch.setPosition(layout.x, layout.y).setDisplaySize(layout.width, layout.height)
      this.paintFills(layout)
      const diving = pose?.diving ?? false
      const keeperSheet = diving ? art.dive : art.idle
      const keeperFrame = diving
        ? Math.min(keeperSheet.columns - 1, Math.floor((pose?.diveElapsed ?? 0) / 120))
        : reducedMotion ? 0 : Math.floor(this.idleElapsed / 130)
      this.actor(this.keeper, keeperSheet, diving ? stock.dive : stock.idle, keeperFrame, layout.width * 0.049 * (diving ? art.diveScale : 1))
      this.keeper.setPosition(...position(keeper)).setFlipX(diving && !!pose?.flipKeeper)
      const spinning = !!state.feedback && visualTime >= KICK_MS
      const ballFrame = reducedMotion ? 0 : Math.floor(Math.min(Math.max(0, elapsed - KICK_MS), state.feedback ? impactTime(state.feedback) - KICK_MS : 0) / 50) % 4
      this.actor(this.ball, spinning ? art.spin : art.ball, spinning ? stock.spin : stock.ball, ballFrame, layout.width * 0.049 * 0.45)
      this.ball.setPosition(...position(ball)).setFlipX(pose?.flipBall ?? false)
      this.label.setText(state.label ?? '').setPosition(width / 2, layout.y + layout.height * 0.61)
        .setFontSize(Math.max(10 * pixelRatio, Math.min(24 * pixelRatio, width / Math.max(26, (state.label?.length ?? 0) + 4))))
        .setVisible(!!state.feedback && visualTime >= impactTime(state.feedback))
      this.shade.setDisplaySize(width, height).setVisible(state.dimmed)
      // Question UI stays accessible above the canvas; actors keep idling behind it.
    }

    /** Extend the stadium past its edges when a tall phone outgrows the 16:9 art. */
    private paintFills(layout: ReturnType<typeof pitchLayout>) {
      const { width, height } = this.scale
      const scale = layout.width / this.textures.get('pitch').getSourceImage().width
      let used = 0
      const tile = (frame: keyof typeof PITCH_BANDS, x: number, y: number) => {
        const band = PITCH_BANDS[frame]
        // The crowd replaces the art's roof strip; grass only ever sits below the actors.
        const image = this.fills[used++] ??= this.add.image(0, 0, 'pitch', frame).setOrigin(0)
        // Overlap by a pixel so rounding never opens a seam between tiles.
        image.setTexture('pitch', frame).setDepth(frame === 'crowd' ? 1 : -1).setVisible(true)
          .setPosition(Math.floor(x), Math.floor(y))
          .setDisplaySize(Math.ceil(band.width * scale) + 1, Math.ceil(band.height * scale) + 1)
      }
      const crowd = PITCH_BANDS.crowd.height * scale
      for (let y = layout.y + PITCH_BANDS.crowd.y * scale - crowd; y + crowd > 0; y -= crowd) tile('crowd', layout.x, y)
      const grass = PITCH_BANDS.grass
      const [grassWidth, grassHeight] = [grass.width * scale, grass.height * scale]
      const left = layout.x + grass.x * scale
      const startX = left - Math.ceil(left / grassWidth) * grassWidth
      for (let y = layout.y + layout.height; y < height; y += grassHeight) {
        for (let x = startX; x < width; x += grassWidth) tile('grass', x, y)
      }
      for (let index = used; index < this.fills.length; index++) this.fills[index].setVisible(false)
    }
  }

  const scene = new MatchPitch()
  const game = new Phaser.Game({
    type: Phaser.AUTO, parent, backgroundColor: '#163e25',
    pixelArt: true, roundPixels: true, antialias: false,
    audio: { noAudio: true }, input: { mouse: false, touch: false, keyboard: false },
    scale: { mode: Phaser.Scale.NONE, width: deviceSize()[0], height: deviceSize()[1], zoom: 1 / pixelRatio },
    scene: [scene], banner: false,
  })
  const resizer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
    if (!disposed) game.scale.resize(...deviceSize())
  })
  resizer?.observe(parent)
  return {
    update: (next) => scene.receive(next),
    destroy: () => {
      if (disposed) return
      disposed = true
      resizer?.disconnect()
      game.destroy(true)
    },
  }
}
