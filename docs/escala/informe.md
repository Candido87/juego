# Informe de escala (Hito 0)

Unidad: **1 casilla = 1 unidad de Three.js** (`CONFIG.scale.unit`). Medidas en casillas, tomadas con `__esc.report()` en la galería de escala (cajas envolventes del modelo ya colocado como en el juego).

| Tipo | Modelo | Tamaño actual (ancho × fondo × alto) | Tamaño objetivo | Factor de escala | Base (y mín.) |
|---|---|---|---|---|---|
| cinta | cinta recta | 1 × 1 × 0.49 | ancho 0.65, alto 0.18 | sección ×0.65, alto ×0.37 | **-0.09** (hundida) |
| cinta | curva | 1 × 1 × 0.54 | ancho 0.65, alto 0.18 | sección ×0.65, alto ×0.33 | **-0.09** (hundida) |
| cinta | cinta rápida | 1 × 1 × 0.49 | ancho 0.65, alto 0.18 | sección ×0.65, alto ×0.37 | **-0.09** (hundida) |
| cinta | rampa (sube 1) | 1.073 × 1 × 0.921 | ancho 0.65, alto 0.18 | sección ×0.65, alto ×0.20 | **-0.09** (hundida) |
| cinta | ascensor | 0.8 × 0.8 × 1.3 | ancho 0.85, alto 1.2 | ancho ×1.06, alto ×0.92 | 0 |
| tubería | tubería recta | 1.01 × 0.65 × 0.618 | ancho 0.35, alto 0.45 | sección ×0.54, alto ×0.73 | **-0.059** (hundida) |
| tubería | tubería curva | 0.83 × 0.83 × 0.618 | ancho 0.35, alto 0.45 | sección ×0.42, alto ×0.73 | **-0.059** (hundida) |
| tubería | tubería T | 1.01 × 0.83 × 0.618 | ancho 0.35, alto 0.45 | sección ×0.42, alto ×0.73 | **-0.059** (hundida) |
| poste | poste | 0.74 × 0.26 × 1.45 | ancho 0.7, alto 1.4 | ancho ×0.95, alto ×0.97 | 0 |
| objeto | objeto lump | 0.243 × 0.243 × 0.243 | ancho 0.22 | ancho ×0.91 | 0.349 |
| objeto | objeto log | 0.28 × 0.13 × 0.13 | ancho 0.25 | ancho ×0.89 | 0.36 |
| objeto | objeto slab | 0.28 × 0.2 × 0.07 | ancho 0.25 | ancho ×0.89 | 0.36 |
| objeto | objeto disc | 0.24 × 0.24 × 0.07 | ancho 0.22 | ancho ×0.92 | 0.36 |
| objeto | objeto shell | 0.12 × 0.12 × 0.2 | ancho 0.18 | ancho ×1.50 | 0.36 |
| objeto | objeto crate | 0.22 × 0.22 × 0.18 | ancho 0.22 | ancho ×1.00 | 0.36 |
| persona | NPC constructor | 0.898 × 0.543 × 0.964 | alto 0.62 | alto ×0.64 | 0 |
| persona | NPC transporter | 0.898 × 0.398 × 0.785 | alto 0.62 | alto ×0.79 | 0 |
| persona | NPC operator | 1.257 × 0.571 × 0.887 | alto 0.62 | alto ×0.70 | 0 |
| persona | NPC mechanic | 0.918 × 0.708 × 0.903 | alto 0.62 | alto ×0.69 | 0 |
| persona | NPC researcher | 0.898 × 0.398 × 0.785 | alto 0.62 | alto ×0.79 | 0 |
| enemigo | enemigo grunt | 0.997 × 0.442 × 0.873 | alto 0.65 | alto ×0.74 | 0 |
| enemigo | enemigo runner | 0.947 × 0.651 × 0.885 | alto 0.62 | alto ×0.70 | 0 |
| enemigo | enemigo armored | 1.148 × 0.481 × 1.263 | alto 0.8 | alto ×0.63 | 0 |
| enemigo | enemigo flyer | 0.898 × 0.398 × 0.816 | alto 0.6 | alto ×0.74 | 0 |
| enemigo | enemigo tank | 1.496 × 0.946 × 1.587 | alto 1 | alto ×0.63 | 0 |
| torreta | torreta bullet | 0.92 × 1.3 × 0.672 | ancho 0.95, alto 1 | ancho ×0.73, alto ×1.49 | 0 |
| torreta | torreta laser | 0.92 × 1.355 × 1.015 | ancho 0.95, alto 1 | ancho ×0.70, alto ×0.99 | 0 |
| torreta | torreta fire | 0.92 × 1.25 × 0.81 | ancho 0.95, alto 1 | ancho ×0.76, alto ×1.23 | 0 |
| torreta | torreta frost | 0.92 × 1.3 × 1.01 | ancho 0.95, alto 1 | ancho ×0.73, alto ×0.99 | 0 |
| edificio | Taladro | 0.68 × 0.85 × 1.133 | ancho 0.95, alto 1.2 | ancho ×1.12, alto ×1.06 | 0 |
| edificio | Almacén | 0.43 × 0.95 × 0.402 | ancho 0.95, alto 0.9 | ancho ×1.00, alto ×2.24 | 0 |
| edificio | Fábrica | 0.72 × 0.9 × 2.38 | ancho 0.95, alto 1.6 | ancho ×1.06, alto ×0.67 | 0 |
| edificio | Granja | 0.8 × 0.8 × 0.939 | ancho 0.95, alto 0.8 | ancho ×1.19, alto ×0.85 | 0 |
| edificio | Bomba de petróleo | 0.8 × 0.5 × 0.884 | ancho 0.95, alto 0.8 | ancho ×1.19, alto ×0.90 | 0 |
| edificio | Refinería | 0.912 × 0.95 × 1.711 | ancho 0.95, alto 1.7 | ancho ×1.00, alto ×0.99 | 0 |
| edificio | Taller | 0.845 × 0.95 × 0.563 | ancho 0.95, alto 1.2 | ancho ×1.00, alto ×2.13 | 0 |
| edificio | Laboratorio | 0.95 × 0.738 × 1.026 | ancho 0.95, alto 1.3 | ancho ×1.00, alto ×1.27 | 0 |
| edificio | Casa | 0.95 × 0.623 × 0.67 | ancho 0.95, alto 1.1 | ancho ×1.00, alto ×1.64 | 0 |
| edificio | Generador | 0.5 × 0.8 × 0.909 | ancho 0.95, alto 0.9 | ancho ×1.19, alto ×0.99 | 0 |
| edificio | Panel solar | 0.557 × 0.95 × 0.082 | ancho 0.95, alto 0.12 | ancho ×1.00, alto ×1.46 | 0 |
| edificio | Turbina | 0.483 × 0.9 × 1.848 | ancho 0.95, alto 1.6 | ancho ×1.06, alto ×0.87 | 0 |
| edificio | Batería | 0.82 × 0.6 × 0.69 | ancho 0.95, alto 0.7 | ancho ×1.16, alto ×1.01 | 0 |
| edificio | Alimentador | 0.62 × 0.62 × 0.832 | ancho 0.95, alto 0.8 | ancho ×1.53, alto ×0.96 | 0 |
| edificio | núcleo (2×2) | 1.8 × 1.784 × 0.999 | ancho 1.9, alto 1.4 | ancho ×1.06, alto ×1.40 | 0 |
| decoración | árbol | 0.755 × 0.654 × 1.708 | alto 1.3 | alto ×0.76 | 0 |
| decoración | roble | 0.641 × 0.74 × 1.226 | alto 1.15 | alto ×0.94 | 0 |
| decoración | pino | 0.367 × 0.372 × 1.453 | alto 1.3 | alto ×0.89 | 0 |
| decoración | árbol grueso | 0.868 × 0.752 × 1.323 | alto 1.1 | alto ×0.83 | 0 |
| decoración | pino grande | 0.662 × 0.662 × 1.788 | alto 1.3 | alto ×0.73 | 0 |
| decoración | roca | 0.628 × 0.812 × 0.208 | ancho 0.63 | ancho ×0.78 | 0 |
| decoración | roca alta | 0.737 × 0.512 × 0.747 | ancho 0.74 | ancho ×1.00 | 0 |
| decoración | arbusto | 0.475 × 0.475 × 0.293 | ancho 0.48 | ancho ×1.01 | 0 |
| muro | Muro de madera | 0.6 × 0.52 × 0.892 | alto 0.7 | alto ×0.78 | 0 |
| muro | Muro de piedra | 0.6 × 0.52 × 1.182 | alto 0.85 | alto ×0.72 | 0 |
| muro | Muro de metal | 0.6 × 0.52 × 1.472 | alto 1 | alto ×0.68 | 0 |
| muro | Puerta | 1 × 0.615 × 1.44 | alto 1 | alto ×0.69 | 0 |
