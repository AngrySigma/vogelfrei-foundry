export default class TokenRulerOSE extends foundry.canvas.placeables.tokens.TokenRuler {
  /** @override */
  _getGridHighlightStyle(waypoint, offset) {
    const style = super._getGridHighlightStyle(waypoint, offset);
    if (!this.token?.actor || !style?.color) return style;

    let movement = this.token.actor.system?.movement?.base ?? 120;
    const { cost } = waypoint.measurement;

    if (this.token.actor?.inCombat) {
      movement = Math.floor(movement / 3);
    }

    if (cost > movement) {
      return {
        ...style,
        color: 0x99_00_00,
      };
    }

    return style;
  }
}
