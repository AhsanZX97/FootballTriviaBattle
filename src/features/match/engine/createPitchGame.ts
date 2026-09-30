import Phaser from 'phaser'
import type { PitchCallbacks, PitchGame, PitchState } from './contracts'
import { pitchLayout, resolvePitchArt, type Sheet } from './pitchArt'
import { FEEDBACK_MS, KICK_MS, ShotTimeline, impactTime, shotPose, type KeeperReaction } from './shotTimeline'
import backgroundSrc from '../../../assets/bg.jpg'

/** Phaser owns the display list and clock; React supplies match snapshots only.
 * The scoring rules remain shared with the authoritative multiplayer server. */
export function createPitchGame(parent: HTMLElement, initial: PitchState, callbacks: PitchCallbacks): PitchGame {
  let state = initial
  let disposed = false
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
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
    private shot: ShotTimeline | null = null
    private reaction: KeeperReaction = 'wrong-way'
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
        const source = texture.getSourceImage()
        const width = source.width / sheet.columns
        const height = source.height / sheet.rows
        for (let frame = 0; frame < sheet.columns * sheet.rows; frame++) {
          texture.add(frame, 0, (frame % sheet.columns) * width, Math.floor(frame / sheet.columns) * height, width, height)
        }
      }
      this.pitch = this.add.image(0, 0, 'pitch').setOrigin(0)
      this.keeper = this.add.sprite(0, 0, stock.idle.src, 0).setOrigin(0.5, 1)
      this.ball = this.add.sprite(0, 0, stock.ball.src, 0)
      this.label = this.add.text(0, 0, '', {
        fontFamily: '"Press Start 2P", monospace', fontSize: '16px',
        color: '#ffcf1a', stroke: '#0a0a0a', strokeThickness: 4, align: 'center',
      }).setOrigin(0.5)
      this.shade = this.add.rectangle(0, 0, 1, 1, 0x020a06, 0.72).setOrigin(0)
      this.ready = true
      this.startShot()
      this.paint()
      callbacks.onReady()
    }

    startShot() {
      this.shot = state.feedback ? new ShotTimeline(state.feedback) : null
      const reactions: KeeperReaction[] = ['wrong-way', 'frozen', 'late']
      this.reaction = reactions[Math.floor(Math.random() * reactions.length)]
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
      const pose = state.feedback ? shotPose(state.feedback, visualTime, this.reaction) : null
      const ball = pose?.ball ?? { x: 0.5, y: 0.8 }
      const keeper = pose?.keeper ?? { x: 0.5, y: 0.51 }
      const position = (point: { x: number; y: number }) => [
        Math.round(layout.x + point.x * layout.width), Math.round(layout.y + point.y * layout.height),
      ] as const
      this.pitch.setPosition(layout.x, layout.y).setDisplaySize(layout.width, layout.height)
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
      this.ball.setPosition(...position(ball)).setFlipX(state.feedback === 'miss' || state.feedback === 'concede')
      this.label.setText(state.label ?? '').setPosition(width / 2, layout.y + layout.height * 0.61)
        .setFontSize(Math.max(10, Math.min(24, width / Math.max(26, (state.label?.length ?? 0) + 4))))
        .setVisible(!!state.feedback && visualTime >= impactTime(state.feedback))
      this.shade.setDisplaySize(width, height).setVisible(state.dimmed)
      // Question UI stays accessible above the canvas; actors keep idling behind it.
    }
  }

  const scene = new MatchPitch()
  const game = new Phaser.Game({
    type: Phaser.AUTO, parent, backgroundColor: '#163e25',
    pixelArt: true, roundPixels: true, antialias: false,
    audio: { noAudio: true }, input: { mouse: false, touch: false, keyboard: false },
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth || 844, height: parent.clientHeight || 390 },
    scene: [scene], banner: false,
  })
  return {
    update: (next) => scene.receive(next),
    destroy: () => {
      if (disposed) return
      disposed = true
      game.destroy(true)
    },
  }
}
