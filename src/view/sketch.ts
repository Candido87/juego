/**
 * Medidas del pack Kenney Sketch Town (PNG de 256x352): la cara superior es un rombo 2:1 de 232x116 px con centro en (128,187)
 * y el bloque tiene unos 103 px de grosor lateral. Reescalado a la losa del juego (64x32): escala 64/232.
 */
export const SKETCH_SCALE = 64 / 232;
/** Centro de la cara superior en el PNG. */
export const SKETCH_TOP_CENTER = { x: 128, y: 187 };
/** Grosor lateral del bloque ya reescalado (px de pantalla). */
export const SKETCH_BLOCK_THICKNESS = 103 * SKETCH_SCALE;
