/** Color de cada objeto. Módulo puro (sin Phaser) para que la interfaz HTML lo use desde cualquier vista. */
import type { ItemId } from '../game/types';

/** Color de cada objeto (cubitos en cintas, iconos). */
export const ITEM_COLORS: Record<ItemId, number> = {
  iron_ore: 0xb7bec9,
  copper_ore: 0xe0915a,
  coal: 0x2a2a2a,
  stone: 0xa8a49a,
  wood: 0x9a6a35,
  iron_plate: 0xd9e0ea,
  copper_plate: 0xf0a35a,
  gear: 0x8d939e,
  ammo: 0xf2c14e,
  missile: 0xff7a45,
  circuit: 0x4caf50,
  brick: 0xb5523b,
  battery: 0x66bb6a,
  wall_plate: 0x8fa3b8,
  science_1: 0xe53935,
  science_2: 0x1e88e5,
  food: 0x9ccc65,
  frame: 0x9e7b55,
  wire: 0xff8a3d,
  pipe: 0x7f8c99,
  gun_part: 0x5c6b7a,
  tool_kit: 0xd84b3c,
  oil: 0x1a1420,
  gasoline: 0xf4d03f,
  sulfur: 0xe6d83a,
};