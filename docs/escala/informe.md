# Informe de escala (Hito 0)

Unidad: **1 casilla = 1 unidad de Three.js** (`CONFIG.scale.unit`). Medidas en casillas, tomadas con `__esc.report()` en la galería de escala (cajas envolventes del modelo ya colocado como en el juego).

| Tipo | Modelo | Tamaño actual (ancho × fondo × alto) | Tamaño objetivo | Factor de escala | Base (y mín.) |
|---|---|---|---|---|---|
| cinta | cinta recta | 1 × 0.65 × 0.21 | ancho 0.65, alto 0.18 | sección ×1.00, alto ×0.86 | 0 |
| cinta | curva | 0.825 × 0.825 × 0.18 | ancho 0.65, alto 0.18 | sección ×0.79, alto ×1.00 | 0 |
| cinta | cinta rápida | 1 × 0.65 × 0.21 | ancho 0.65, alto 0.18 | sección ×1.00, alto ×0.86 | 0 |
| cinta | rampa (sube 1) | 0.988 × 0.65 × 0.635 | ancho 0.65, alto 0.18 | sección ×1.00, alto ×0.28 | 0.026 |
| cinta | ascensor | 0.8 × 0.8 × 1.3 | ancho 0.85, alto 1.2 | ancho ×1.06, alto ×0.92 | 0 |
| tubería | tubería recta | 1.01 × 0.45 × 0.439 | ancho 0.35, alto 0.45 | sección ×0.78, alto ×1.03 | 0 |
| tubería | tubería curva | 0.73 × 0.73 × 0.439 | ancho 0.35, alto 0.45 | sección ×0.48, alto ×1.03 | 0 |
| tubería | tubería T | 1.01 × 0.73 × 0.439 | ancho 0.35, alto 0.45 | sección ×0.48, alto ×1.03 | 0 |
| poste | poste | 0.74 × 0.26 × 1.45 | ancho 0.7, alto 1.4 | ancho ×0.95, alto ×0.97 | 0 |
| objeto | objeto lump | 0.206 × 0.206 × 0.206 | ancho 0.22 | ancho ×1.07 | 0.187 |
| objeto | objeto log | 0.25 × 0.11 × 0.11 | ancho 0.25 | ancho ×1.00 | 0.18 |
| objeto | objeto slab | 0.25 × 0.18 × 0.06 | ancho 0.25 | ancho ×1.00 | 0.18 |
| objeto | objeto disc | 0.22 × 0.22 × 0.06 | ancho 0.22 | ancho ×1.00 | 0.18 |
| objeto | objeto shell | 0.1 × 0.1 × 0.18 | ancho 0.18 | ancho ×1.80 | 0.18 |
| objeto | objeto crate | 0.2 × 0.2 × 0.16 | ancho 0.22 | ancho ×1.10 | 0.18 |
| persona | NPC constructor | 0.574 × 0.347 × 0.617 | alto 0.62 | alto ×1.00 | 0 |
| persona | NPC transporter | 0.709 × 0.314 × 0.621 | alto 0.62 | alto ×1.00 | 0 |
| persona | NPC operator | 0.88 × 0.4 × 0.621 | alto 0.62 | alto ×1.00 | 0 |
| persona | NPC mechanic | 0.633 × 0.488 × 0.623 | alto 0.62 | alto ×1.00 | 0 |
| persona | NPC researcher | 0.709 × 0.314 × 0.621 | alto 0.62 | alto ×1.00 | 0 |
| enemigo | enemigo grunt | 0.738 × 0.327 × 0.646 | alto 0.65 | alto ×1.01 | 0 |
| enemigo | enemigo runner | 0.663 × 0.456 × 0.619 | alto 0.62 | alto ×1.00 | 0 |
| enemigo | enemigo armored | 0.723 × 0.303 × 0.795 | alto 0.8 | alto ×1.01 | 0 |
| enemigo | enemigo flyer | 0.664 × 0.294 × 0.604 | alto 0.6 | alto ×0.99 | 0 |
| enemigo | enemigo tank | 0.942 × 0.596 × 1 | alto 1 | alto ×1.00 | 0 |
| torreta | torreta bullet | 0.92 × 1.3 × 0.672 | ancho 0.95, alto 1.3 | ancho ×0.73, alto ×1.93 | 0 |
| torreta | torreta laser | 0.92 × 1.355 × 1.015 | ancho 0.95, alto 1.3 | ancho ×0.70, alto ×1.28 | 0 |
| torreta | torreta fire | 0.92 × 1.25 × 0.81 | ancho 0.95, alto 1.3 | ancho ×0.76, alto ×1.60 | 0 |
| torreta | torreta frost | 0.92 × 1.3 × 1.01 | ancho 0.95, alto 1.3 | ancho ×0.73, alto ×1.29 | 0 |
| edificio | Taladro | 0.721 × 0.901 × 1.201 | ancho 0.95, alto 1.2 | ancho ×1.05, alto ×1.00 | 0 |
| edificio | Almacén | 0.43 × 0.95 × 0.9 | ancho 0.95, alto 0.9 | ancho ×1.00, alto ×1.00 | 0 |
| edificio | Fábrica | 0.619 × 0.774 × 1.606 | ancho 0.95, alto 1.6 | ancho ×1.23, alto ×1.00 | 0 |
| edificio | Granja | 0.68 × 0.68 × 0.798 | ancho 0.95, alto 0.8 | ancho ×1.40, alto ×1.00 | 0 |
| edificio | Bomba de petróleo | 0.72 × 0.45 × 0.796 | ancho 0.95, alto 0.8 | ancho ×1.32, alto ×1.01 | 0 |
| edificio | Refinería | 0.903 × 0.941 × 1.694 | ancho 0.95, alto 1.7 | ancho ×1.01, alto ×1.00 | 0 |
| edificio | Taller | 0.845 × 0.95 × 1.2 | ancho 0.95, alto 1.2 | ancho ×1.00, alto ×1.00 | 0 |
| edificio | Laboratorio | 0.95 × 0.738 × 1.302 | ancho 0.95, alto 1.3 | ancho ×1.00, alto ×1.00 | 0 |
| edificio | Casa | 0.95 × 0.623 × 1.099 | ancho 0.95, alto 1.1 | ancho ×1.00, alto ×1.00 | 0 |
| edificio | Generador | 0.495 × 0.792 × 0.9 | ancho 0.95, alto 0.9 | ancho ×1.20, alto ×1.00 | 0 |
| edificio | Panel solar | 0.557 × 0.95 × 0.12 | ancho 0.95, alto 0.12 | ancho ×1.00, alto ×1.00 | 0 |
| edificio | Turbina | 0.42 × 0.783 × 1.608 | ancho 0.95, alto 1.6 | ancho ×1.21, alto ×1.00 | 0 |
| edificio | Batería | 0.828 × 0.606 × 0.697 | ancho 0.95, alto 0.7 | ancho ×1.15, alto ×1.00 | 0 |
| edificio | Alimentador | 0.595 × 0.595 × 0.799 | ancho 0.95, alto 0.8 | ancho ×1.60, alto ×1.00 | 0 |
| edificio | núcleo (2×2) | 1.908 × 1.891 × 1.408 | ancho 1.9, alto 1.4 | ancho ×1.00, alto ×0.99 | 0 |
| decoración | árbol | 0.574 × 0.497 × 1.298 | alto 1.3 | alto ×1.00 | 0 |
| decoración | roble | 0.602 × 0.695 × 1.153 | alto 1.15 | alto ×1.00 | 0 |
| decoración | pino | 0.327 × 0.331 × 1.293 | alto 1.3 | alto ×1.01 | 0 |
| decoración | árbol grueso | 0.721 × 0.624 × 1.098 | alto 1.1 | alto ×1.00 | 0 |
| decoración | pino grande | 0.483 × 0.483 × 1.305 | alto 1.3 | alto ×1.00 | 0 |
| decoración | roca | 0.628 × 0.812 × 0.208 | ancho 0.63 | ancho ×0.78 | 0 |
| decoración | roca alta | 0.737 × 0.512 × 0.747 | ancho 0.74 | ancho ×1.00 | 0 |
| decoración | arbusto | 0.475 × 0.475 × 0.293 | ancho 0.48 | ancho ×1.01 | 0 |
| muro | Muro de madera | 0.6 × 0.52 × 0.696 | alto 0.7 | alto ×1.01 | 0 |
| muro | Muro de piedra | 0.6 × 0.52 × 0.851 | alto 0.85 | alto ×1.00 | 0 |
| muro | Muro de metal | 0.6 × 0.52 × 1.001 | alto 1 | alto ×1.00 | 0 |
| muro | Puerta | 1 × 0.615 × 0.994 | alto 1 | alto ×1.01 | 0 |
