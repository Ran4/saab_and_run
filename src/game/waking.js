// Ove wakes up after freezing to death (game/cold.js). Called behind the black, with Ove already at
// his door: update(dt) -> true once the curtain is up and the game is his again.
// (A first version: straight out on the walkway. The scene in his bedroom comes next.)

import { hud } from './hud.js';

export function wakeScene(g) {
  let t = 0, lifted = false;
  return {
    update(dt) {
      t += dt;
      if (!lifted && t > 0.6) { lifted = true; hud.curtain(false); }
      return t > 1.2;
    },
  };
}
