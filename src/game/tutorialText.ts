/**
 * Textos del tutorial (español). Archivo aparte para poder editarlos o traducirlos sin tocar el motor.
 * Clave = id del paso en `tutorial.ts`.
 */
export interface StepText {
  title: string;
  text: string;
}

export const TUTORIAL_TEXT: Record<string, StepText> = {
  camera: {
    title: 'Mueve la cámara',
    text: 'Arrastra con el ratón para mover la cámara y usa la rueda para acercar o alejar. Pruébalo.',
  },
  tool: {
    title: 'Elige una herramienta',
    text: 'En la barra de abajo están los edificios (también con las teclas 1–9). Haz clic en cualquiera para elegirla.',
  },
  drill: {
    title: 'Coloca un taladro',
    text: 'Pon un taladro sobre un yacimiento de hierro (casillas grises con puntos). Gira con R. Los obreros lo construirán.',
  },
  manual: {
    title: 'Modo manual',
    text: 'Sin electricidad las cintas no se mueven: los Transportistas llevan todo a mano. Mira la cola de trabajos y espera a que llegue mena al almacén.',
  },
  components: {
    title: 'Fabrica componentes',
    text: 'Todo edificio necesita componentes. Construye una fábrica y elígele una receta (bastidor, engranaje...).',
  },
  belts: {
    title: 'Pon una cinta',
    text: 'Coloca una cinta junto a la fábrica o el taladro. Sin energía no se mueve: eso es normal por ahora.',
  },
  oil: {
    title: 'Petróleo y gasolina',
    text: 'Pon una bomba sobre petróleo (casillas oscuras) y una refinería: convierte petróleo en gasolina.',
  },
  power: {
    title: 'Electricidad',
    text: 'Construye un poste cerca de las cintas y un generador. Se alimenta de gasolina y un Operario lo arranca. Verás las cintas moverse solas.',
  },
  food: {
    title: 'Población y comida',
    text: 'Empiezas con 3 personas y comen cada poco. Construye una granja para la comida y una casa para que llegue gente nueva.',
  },
  turret: {
    title: 'Defiende con una torreta',
    text: 'Coloca una torreta de balas cerca del camino enemigo. Un Transportista le llevará munición.',
  },
  walls: {
    title: 'Murallas',
    text: 'Los muros frenan a los enemigos: tendrán que romperlos para pasar. Coloca un muro de madera.',
  },
  wave: {
    title: 'Oleada de prueba',
    text: 'Llega una oleada pequeña. Deja que tu torreta se encargue y comprueba que no cae el núcleo.',
  },
  workshop: {
    title: 'El taller',
    text: 'El taller reserva a dos personas solo para reparar daños. Construye uno: es una decisión importante con poca gente.',
  },
  lab: {
    title: 'Laboratorio y tecnología',
    text: 'Construye un laboratorio, asigna un investigador y estudia tu primera tecnología para desbloquear cosas nuevas.',
  },
  finish: {
    title: '¡Listo!',
    text: 'Ya sabes lo básico. Objetivo del juego: sobrevivir oleadas el mayor tiempo posible. Crece en gente y comida, automatiza con electricidad y refuerza las defensas.',
  },
};

export const TUTORIAL_UI = {
  step: (n: number, total: number) => `Paso ${n} de ${total}`,
  skipStep: 'Saltar paso',
  skipAll: 'Saltar tutorial',
  restart: 'Reiniciar tutorial',
  finish: 'Volver al menú',
};
