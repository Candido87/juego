# PROGRESS

## Hecho
- [x] Hito 0 — Vista isométrica, lógica pura, cintas, taladros, torre básica, oleadas, tests.

## Hoja de ruta unificada
Tres encargos fusionados en un solo orden según sus dependencias. Entre paréntesis, el hito original:
A = árbol/torretas/murallas/industria/NPCs, E = electricidad y automatización, T = aspecto de torretas.

- [x] 1. (A1) Sistema de NPCs y cola de trabajos (construcción por NPC con una sola torreta de balas).
- [x] 2. (A2) Piezas y recetas nuevas; las construcciones consumen piezas concretas.
- [x] 3. (A3) Transportistas: reparto de munición y piezas por NPC (modo manual).
- [x] 4. (E1) Redes eléctricas: generador de combustión, postes y cables, consumo/producción, apagón parcial.

### Rediseño de la economía base (prioritario, va antes del resto)
- [x] P1. Población de 3 NPCs, comida y granjas (consumo y escasez; derrota con población 0).
- [x] P2. Componentes obligatorios para construir cualquier edificio y fábricas de nivel 1.
- [x] P3. Petróleo, bombas y refinería; generadores con gasolina.
- [x] P4. Cintas que consumen electricidad y modo manual completo por NPCs (absorbe el antiguo 5/E2).
- [x] P5. Taller con 2 trabajadores dedicados y cola de reparaciones (+ enemigos dañan edificios).
- [x] P6. Vivienda y crecimiento de población.
- [x] P7. Interfaz (población, comida, gasolina, taller) y equilibrado con simulaciones.

### Menús y árbol con población (después del rediseño; sustituye al antiguo 14 y parte del 16)
- [ ] M1. Menú principal, pausa y opciones, con guardar y cargar partida.
- [ ] M2. Menú de construcción por categorías, con bloqueo visual por tecnología.
- [ ] M3. HUD y alertas.
- [ ] M4. Laboratorio e investigador: investigación que avanza con un NPC asignado.
- [ ] M5. Pantalla del árbol de tecnología con nodos, estados y tooltips.
- [ ] M6. Desbloqueos reales (edificios, recetas, mejoras) y rama de Población y comida.
- [ ] M7. Equilibrado con simulaciones y pulido de la interfaz.

### Fases de gráficos (packs nuevos de Kenney; sólo capa visual, sin tocar la lógica)
- [x] G0. Inventario de assets → ASSETS.md (problemas y propuesta).
- [x] G1. Enemigos con sprites (balanceo y volteo por dirección; prisma de respaldo).
- [ ] G2. Murallas con sprites conectados y estados de daño.
- [ ] G3. Interfaz con el UI Pack (paneles, botones, barras, cursor, iconos).
- [ ] G4. Terreno con variantes, árboles y decoración procedural.

### Segunda tanda de gráficos (tanques, naves, humo) — esperando visto bueno del reparto (ver ASSETS.md)
- [x] T0. Inventario y propuesta (ASSETS.md, CREDITS.md).
- [ ] T1. Torretas: cabeza cenital proyectada y giratoria sobre base prismática, niveles y estados.
- [ ] T2. Enemigos: tanques de perfil (blindados) y naves proyectadas con sombra (voladores).
- [ ] T3. Humo y efectos con partículas ligeras.
- Pendiente de lógica (no tocada): **no existe torreta de misiles**; añadirla exige cambiar `game.ts` y `config.ts`.
- Las fases G2 (murallas), G3 (interfaz) y G4 (terreno) de la primera tanda siguen pendientes.

### Resto de la hoja de ruta (después del rediseño)
- [ ] 5. (E2) ~~Cintas motorizadas~~ (hecho en P4); queda sólo la regla "automatizado no pide abastecimiento".
- [ ] 6. (E3) Alimentadores automáticos y torretas con abastecimiento automático.
- [ ] 7. (E4) Baterías, solar y prioridades de consumo.
- [ ] 8. (A4 + E5) Torretas láser (energía) y de fuego (combustible); enemigos que atacan la infraestructura.
- [ ] 9. (T1) Registro de aspectos por torreta y modelos distintos para balas, láser y fuego.
- [ ] 10. (T2) Piezas animadas (cabeza que gira, retroceso, cristal, llamas) y efectos de disparo distintos.
- [ ] 11. (T3) Variantes por nivel y estados (sin munición/energía, en construcción, dañada).
- [ ] 12. (T4) Resto de tipos (hielo) con su modelo y efectos.
- [ ] 13. (A5) Murallas y comportamiento de los enemigos ante ellas.
- [ ] ~~14. (A6 + E6)~~ (sustituido por M4–M6) Árbol de tecnología con pantalla propia, incluida la rama "Energía y automatización".
- [ ] 15. (A7) Variedad de enemigos y oleadas que exijan mezclar torretas.
- [ ] 16. (E7 + T5) Interfaz: paneles de red, indicadores, cables; iconos de torretas en el menú y ficha al pasar el ratón.
- [ ] 17. (A8 + E8) Equilibrado con `npm run sim` y pulido (incluida legibilidad con zoom).

Por qué este orden: el modo manual (transportistas) debe existir antes de que la electricidad lo
automatice; el láser depende de la red; el aspecto de las torretas (T) va cuando ya existen láser, fuego
y la energía (para el estado "sin energía"); el árbol necesita que existan sus desbloqueos.

Regla: tras cada hito, tests + tipos + build en verde, commit y push a `main`.
