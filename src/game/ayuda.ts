/**
 * Textos del panel de ayuda (controles y conceptos principales), separados de la lógica.
 * Los controles son datos: [tecla o gesto, qué hace].
 */
export const HELP_CONTROLS: [string, string][] = [
  ['Clic', 'Construir con la herramienta elegida / seleccionar un edificio'],
  ['Arrastrar', 'Mover la cámara; con Cinta o Tubería elegida dibuja el recorrido pieza a pieza (el clic derecho arrastrando mueve la cámara)'],
  ['Rueda', 'Acercar o alejar (sobre el mapa)'],
  ['Mayús al trazar', 'Mantiene el trazado en línea recta · R invierte el sentido · Esc cancela · Ctrl+Z deshace el último trazado'],
  ['1–9', 'Elegir el edificio de ese número en la categoría activa'],
  ['Q / E', 'Categoría anterior / siguiente del menú (también la rueda sobre el menú)'],
  ['R', 'Girar el edificio (dirección de cintas, taladros, fábricas...)'],
  ['X', 'Quitar: marcar un edificio para desmontarlo o cancelar una obra'],
  ['L', 'Vista de logística: atenúa el mapa y marca puertos y conexiones por colores (verde conectado, rojo error, naranja bloqueado)'],
  ['V', 'Conectar: pulsa una salida libre y luego una entrada (o una línea) y se traza la cinta o tubería sola, esquivando obstáculos. Esc cancela'],
  ['P', 'Pausa'],
  ['H', 'Mostrar u ocultar esta ayuda'],
  ['Esc', 'Cerrar la ayuda, soltar la herramienta y deseleccionar'],
  ['F11', 'Pantalla completa (versión de escritorio)'],
];

export const HELP_CONCEPTS: [string, string][] = [
  ['Obras', 'Al colocar algo se crea una obra: un Constructor la levanta con los componentes del almacén.'],
  ['Componentes', 'Todo edificio se construye con componentes (bastidores, engranajes...) que se fabrican en una Fábrica.'],
  ['Modo manual', 'Sin electricidad las cintas no se mueven: los Transportistas llevan y recogen todo a mano.'],
  ['Electricidad', 'Postes + generador (gasolina) forman una red: las cintas se mueven solas y las máquinas rinden más.'],
  ['Gasolina', 'Se refina petróleo (bomba + refinería). Sin gasolina los generadores se paran.'],
  ['Población y comida', 'Empiezas con 3 personas que comen continuamente. Granjas = comida; casas = plazas para que llegue gente.'],
  ['Taller', 'Reserva a dos personas sólo para reparar los daños de las oleadas.'],
  ['Defensa', 'Las torretas necesitan munición o energía; los muros frenan a los enemigos. Si el núcleo cae, pierdes.'],
];
