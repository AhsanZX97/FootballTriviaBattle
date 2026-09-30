// Lazy import keeps Phaser out of the menu/auth startup bundle.
export const loadPitchGame = () => import('./createPitchGame')
